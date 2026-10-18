#!/usr/bin/env node
// 端到端测试：真实调用 AI，跑通「切分 → 求解 → 验证 → 思路 → 缓存」
//
// 用内存 mock 替代云数据库（只测业务链路，不测 db）。
// 用法：node scripts/e2e-subthinking.mjs [--sub="(3)"]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------- 读 .env 并注入 process.env（让生产模块走同一套配置）----------
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.+)\s*$/);
  if (m) env[m[1]] = m[2];
}
const KEY = env.SMOKE_API_KEY || env.DEEPSEEK_API_KEY;
const BASE = (env.SMOKE_API_BASE || env.DS_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
const MODEL = env.SMOKE_MODEL || env.DS_MODEL || 'deepseek-v4-flash';
if (!KEY) { console.error('缺 key'); process.exit(1); }

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => { const m = /^--([^=]+)=(.*)$/.exec(a); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true]; })
);

// ---------- 导入生产模块（与线上同一份代码）----------
const { generateSubThinking } = await import(path.join(ROOT, 'cloudfunctions/reportService/lib/subThinking/index.js'));

/** 生产适配器：与 reportService/index.js 的 makeSubCall 完全一致 */
async function call({ system, user, maxTokens }) {
  const res = await fetch(BASE + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      thinking: { type: 'enabled' },
      temperature: 0.2,
      max_tokens: maxTokens || 16000,
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(j).slice(0, 200)}`);
  const msg = j.choices[0].message || {};
  return { text: msg.content || '' };
}

// ---------- 内存 mock db ----------
function makeMockDb(store) {
  const push = Symbol('push'), pull = Symbol('pull');
  const command = {
    push: (arr) => ({ [push]: arr }),
    pull: (cond) => ({ [pull]: cond }),
  };
  return {
    db: {
      collection: () => ({
        doc: (id) => ({
          get: async () => ({ data: store[id] }),
          update: async ({ data }) => {
            const doc = store[id];
            for (const [k, v] of Object.entries(data)) {
              if (v && typeof v === 'object' && push in v) {
                doc[k] = (doc[k] || []).concat(v[push]);
              } else if (v && typeof v === 'object' && pull in v) {
                const cond = v[pull];
                doc[k] = (doc[k] || []).filter((x) => !Object.entries(cond).every(([kk, vv]) => x[kk] === vv));
              } else {
                doc[k] = v;
              }
            }
            return { updated: 1 };
          },
        }),
      }),
    },
    _: command,
  };
}

// ---------- 用 golden 第 19 题 ----------
const golden = JSON.parse(fs.readFileSync(path.join(ROOT, 'output/golden/cases-过程审阅.json'), 'utf8'));
const c19 = golden.cases.find((c) => c.id === 'ZX-19-CLOSURE');
const sw = c19.studentActualWork;
const studentWork = [sw.part1, sw.part2, sw.part3_additive, ...sw.part3_multiplicative].filter(Boolean).join('\n');

const store = {
  q19: {
    _id: 'q19',
    userId: 'test-user',
    questionText: c19.questionText,
    questionType: '解答',
    traceReport: studentWork,
    segments: [],
    referenceProcess: [],
    processScore: 0.85,
    officialStatus: '半对',
    officialScore: 12,
    officialStandardScore: 17,
    diagnosis: { comment: '第(1)(2)问推理完整…', inference: '……', hook: '……' },
    subThinking: [],
  },
};
const { db, _ } = makeMockDb(store);

const TARGET = args.sub || '(3)';

console.log('模型：' + MODEL);
console.log('题：第 19 题 · 小问 ' + TARGET);
console.log('='.repeat(66));

const t0 = Date.now();
const rec = await generateSubThinking({ db, _, call, question: store.q19, subNo: TARGET, logger: console, model: MODEL });
const cost = ((Date.now() - t0) / 1000).toFixed(1);

console.log('\n结果');
console.log('-'.repeat(66));
console.log('subNo      :', rec.subNo);
console.log('verified   :', rec.verified);
console.log('verifyNote :', rec.verifyNote || '（无）');
console.log('耗时       :', cost + 's');

if (rec.thinking) {
  console.log('\ngoal:', rec.thinking.goal);
  rec.thinking.steps.forEach((s) => {
    const cards = (s.thinking.cards || []).join(' + ') || '（直接套用条件）';
    console.log(`\n[${s.n}] 思维：${cards}`);
    console.log('    手上：' + s.have.slice(0, 70));
    console.log('    还缺：' + s.lack.slice(0, 70));
    console.log('    为什么：' + s.why.slice(0, 90));
    console.log('    做法：' + s.do.slice(0, 90));
  });
  console.log('\nending:', rec.thinking.ending);

  // 校验：是否有花色牌号残留
  const cardsAll = rec.thinking.steps.flatMap((s) => s.thinking.cards || []);
  const bad = cardsAll.filter((x) => /[♠♥♦♣]/.test(x));
  console.log('\n卡片检查：' + (bad.length ? '❌ 有花色残留 ' + JSON.stringify(bad) : '✅ 全部为纯名字'));
  console.log('步数检查：' + rec.thinking.steps.length + ' 步 ' + (rec.thinking.steps.length >= 2 && rec.thinking.steps.length <= 8 ? '✅' : '❌'));
} else {
  console.log('\n⚠️ 未产出思路（验证未通过或生成失败）');
}

// 缓存测试
console.log('\n' + '='.repeat(66));
console.log('缓存测试：再调一次同一小问');
const t1 = Date.now();
const rec2 = await generateSubThinking({ db, _, call, question: store.q19, subNo: TARGET, logger: console, model: MODEL });
console.log('cached =', !!rec2.cached, '| 耗时', ((Date.now() - t1) / 1000).toFixed(2) + 's');
console.log(rec2.cached ? '✅ 命中缓存，未重复调用' : '❌ 未命中缓存');

const out = path.join(ROOT, 'output', 'e2e-subthinking.json');
fs.writeFileSync(out, JSON.stringify({ model: MODEL, target: TARGET, first: rec, second: rec2 }, null, 2), 'utf8');
console.log('\n已保存：' + out);
