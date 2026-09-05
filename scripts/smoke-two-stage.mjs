#!/usr/bin/env node
// 两段式（路 B）最小验证：disabled 快扫 + 可疑判定 + 条件深挖
// 用法：node scripts/smoke-two-stage.mjs [--only=T2,T7]
// 验证目标：普通题秒级不触发深挖；可疑题(多章/候选外/空章)被触发并补漏
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+)\s*$/);
  if (m) env[m[1]] = m[2];
}
const API_KEY = env.SMOKE_API_KEY || process.env.SMOKE_API_KEY || env.QWEN_API_KEY;
const BASE = (env.SMOKE_API_BASE || process.env.SMOKE_API_BASE || env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, '');
const MODEL = env.SMOKE_MODEL || process.env.SMOKE_MODEL || 'qwen-plus';
const CNY = 7.2;
const USAGE = [];

const nodes = [];
for (const f of fs.readdirSync(path.join(ROOT, 'knowledge-graph/nodes')).filter(x => x.endsWith('.json'))) {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'knowledge-graph/nodes', f), 'utf8'));
  const items = Array.isArray(d) ? d : (d.nodes || [d]);
  for (const n of items) {
    const p = (n.tree && n.tree.path) || n.path || [];
    if (Array.isArray(p) && p.length >= 3) nodes.push({ name: String((n.basic && n.basic.name) || n.name || '').trim(), chapter: p[2] });
  }
}
const CHAPTERS = [...new Set(nodes.map(n => n.chapter))].sort();
const pointsOf = ch => [...new Set(nodes.filter(n => n.chapter === ch).map(n => n.name).filter(Boolean))];

async function callLLM(system, user, { thinking = 'disabled', effort = null } = {}) {
  const body = {
    model: MODEL, temperature: 0.2, max_tokens: thinking === 'enabled' ? 32000 : 8000,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  };
  if (/deepseek/i.test(BASE)) {
    body.thinking = { type: thinking };
    if (thinking === 'enabled' && effort) body.reasoning_effort = effort;
  } else body.response_format = { type: 'json_object' };
  const resp = await fetch(`${BASE}/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` }, body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const data = await resp.json();
  if (data.usage) USAGE.push({ in: data.usage.prompt_tokens || 0, out: data.usage.completion_tokens || 0, cached: data.usage.prompt_tokens_details?.cached_tokens || 0 });
  const c = (data.choices?.[0]?.message?.content || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const s = c.indexOf('{'), e = c.lastIndexOf('}');
  return JSON.parse(c.slice(s, e + 1));
}

const S1_SYS = ch => `你是高中数学题目分析器。判断题目涉及必修第一册的哪些章。
可选章（只能从这些里选，可多选，宁多勿漏）：\n${ch.join('\n')}
只输出 JSON：{"chapters":["章名",...]}`;

const S3_SYS = n => `任务：拆出本题【标准考察】的完整考点（按出题意图与常规解法，必须用到的知识点；独立于学生）。
下面只给出【一个单元】的知识点候选清单（编号 1~${n}）：
· 候选中有用的点 → 勾编号并给 dkp（0~1 纯考察难度）；
· 候选里没有、但本题标准考察确实需要的点 → 必须填 other（name 满足五要素：定义/表示/性质/操作/关系 + elementType + reason，缺一不可）；
· 禁止勾无关候选点掩盖候选外核心考察。
只输出 JSON：{"pointIds":[...],"dkps":{},"other":[],"outOfSyllabus":false}`;

// 单次完整拆解（一次档位配置）
async function decomposeOnce(question, cfg) {
  const s1 = await callLLM(S1_SYS(CHAPTERS), `题目：${question}`, cfg);
  const chapters = (s1.chapters || []).filter(c => CHAPTERS.includes(c));
  const picks = [];
  for (const ch of chapters) {
    const list = pointsOf(ch);
    if (!list.length) continue;
    const numbered = list.map((nm, i) => `  ${i + 1}. ${nm}`).join('\n');
    const s3 = await callLLM(S3_SYS(list.length), `题目：${question}\n\n【当前单元：${ch}】\n${numbered}`, cfg);
    picks.push({ ch, list, s3 });
  }
  const got = [];
  for (const p of picks) {
    for (const id of (p.s3.pointIds || [])) {
      const nm = p.list[id - 1];
      if (nm) got.push({ name: nm, chapter: p.ch, dkp: p.s3.dkps?.[String(id)] ?? null });
    }
  }
  const others = picks.flatMap(p => (p.s3.other || []).map(o => ({ ...o, chapter: p.ch })));
  return { chapters, got, others, outOf: picks.some(p => p.s3.outOfSyllabus === true) };
}

const SET = {
  T2: '解不等式 x²−5x+6>0，并把解集用区间表示。',
  T7: `已知 f(x)=sinx·cosx，求 f'(x) 并判断其单调区间。`,
};
const argOnly = process.argv.find(a => a.startsWith('--only='))?.split('=')[1];
const ids = argOnly ? argOnly.split(',').map(s => s.trim()) : Object.keys(SET);
const isDS = /deepseek/i.test(BASE);

for (const id of ids) {
  const t0 = Date.now();
  const u0 = USAGE.length;
  console.log(`\n========== ${id} ==========`);
  // 阶段 1：disabled 快扫
  const r1 = await decomposeOnce(SET[id], { thinking: 'disabled' });
  const t1 = Date.now();
  // 可疑判定（v1：结构信号）
  const flag = r1.chapters.length >= 2 || r1.others.length > 0 || r1.chapters.length === 0;
  console.log(`阶段1 disabled ${((t1 - t0) / 1000).toFixed(1)}s | 章=[${r1.chapters}] 考点=${r1.got.length} other=${r1.others.length} 可疑触发=${flag}`);
  let r2 = null;
  if (flag && isDS) {
    console.log('  → 触发阶段2 deep(thinking enabled, effort low)...');
    const t2 = Date.now();
    r2 = await decomposeOnce(SET[id], { thinking: 'enabled', effort: 'low' });
    console.log(`阶段2 deep ${((Date.now() - t2) / 1000).toFixed(1)}s | 章=[${r2.chapters}] 考点=${r2.got.length} other=${r2.others.length}`);
  }
  const cost = USAGE.slice(u0).reduce((a, u) => ({ i: a.i + (u.in || 0) - (u.cached || 0), c: a.c + (u.cached || 0), o: a.o + (u.out || 0) }), { i: 0, c: 0, o: 0 });
  console.log(`  累计成本≈¥${(((cost.i) / 1e6 * 0.22 + cost.c / 1e6 * 0.007 + cost.o / 1e6 * 0.66) * CNY).toFixed(4)} (${USAGE.length} 调用, 累计 token in=${cost.i + cost.c} out=${cost.o})`);
  fs.mkdirSync(path.join(ROOT, 'output/smoke-twostage'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'output/smoke-twostage', `${id}.json`), JSON.stringify({ id, r1, flag, r2, seconds: (Date.now() - t0) / 1000 }, null, 2));
}
console.log('\n完成，原始输出在 output/smoke-twostage/');
