#!/usr/bin/env node
// ============ 实测 5：embedding 召回 top-N → AI 选（省 token 方案）============
//
// 对比三种「让 AI 定知识点」的方式：
//   甲 全清单直选（路线一，上一轮测过，很贵）
//   乙 embedding 召回 top-10 → AI 从 10 个里选
//   丙 embedding 召回 top-20 → AI 从 20 个里选
//
// 评价：
//   ① 三轮一致性（内容层面，忽略格式/顺序/类型后缀）
//   ② 选出的知识点是否合理（多选无所谓，用户说选多一点没事）
//   ③ token 成本对比
//
// 用法：node scripts/probe-recall-then-pick.mjs
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tcb = path.join(ROOT, 'node_modules/.bin/tcb');
const ENV = process.env.TCB_ENV || 'cloud1-d8g0ty39wd73f430a';
const envText = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const getEnv = (k) => (envText.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim();
const DS_KEY = getEnv('SMOKE_API_KEY');
const DS_BASE = getEnv('SMOKE_API_BASE') || 'https://api.deepseek.com';
const MODEL = 'deepseek-flash';
const QWEN_KEY = getEnv('QWEN_API_KEY');
const QWEN_BASE = getEnv('QWEN_BASE_URL') || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const EMB = getEnv('EMBEDDING_MODEL') || 'text-embedding-v4';

function unwrap(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(unwrap);
  const ks = Object.keys(v);
  if (ks.length === 1) { const k = ks[0];
    if (/^\$(numberInt|numberLong|numberDouble)$/.test(k)) return Number(v[k]);
    if (k === '$oid' || k === '$date') return v[k]; }
  const o = {}; for (const k of ks) o[k] = unwrap(v[k]); return o;
}
function query(cmd) {
  const p = [{ TableName: cmd.find, CommandType: 'QUERY', Command: JSON.stringify(cmd) }];
  const raw = execFileSync(tcb, ['db', 'nosql', 'execute', '--json', '-e', ENV, '--command', JSON.stringify(p)],
    { cwd: ROOT, encoding: 'utf8', timeout: 300000, maxBuffer: 1e8 });
  const s = raw.indexOf('['), e = raw.lastIndexOf(']');
  const a = unwrap(JSON.parse(raw.slice(s, e + 1)));
  const f = Array.isArray(a) ? a[0] : null;
  return Array.isArray(f) ? f : (f && f.data) || [];
}
async function chat(prompt) {
  const res = await fetch(`${DS_BASE}/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DS_KEY}` },
    body: JSON.stringify({ model: MODEL, temperature: 1.0, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = await res.json();
  return { content: j.choices[0].message.content, usage: j.usage };
}
async function embedBatch(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += 10) {
    const r = await fetch(`${QWEN_BASE}/embeddings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${QWEN_KEY}` },
      body: JSON.stringify({ model: EMB, input: texts.slice(i, i + 10) }),
    });
    if (!r.ok) throw new Error('embed ' + r.status);
    const d = await r.json();
    out.push(...d.data.slice().sort((a, b) => a.index - b.index).map((x) => x.embedding));
    process.stdout.write(`\r  embed ${Math.min(i + 10, texts.length)}/${texts.length}   `);
  }
  console.log('');
  return out;
}
const cosine = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return d / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9); };
const extractJSON = (t) => {
  const m = t.match(/```(?:json)?\s*([\s\S]*?)```/) || t.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  return JSON.parse((m ? m[1] : t).trim());
};
// 归一化名字：去类型后缀、去空白，用于内容层比较
const norm = (s) => String(s || '').replace(/[（(][^）)]*[）)]/g, '').replace(/[\s、,，]/g, '');
const setOf = (arr) => new Set((arr || []).map(norm).filter(Boolean));

const nodes = query({ find: 'knowledge_nodes', filter: {}, limit: 1000 });
const qs = query({ find: 'questions', filter: {}, limit: 1000 });
const parentIds = new Set(nodes.map((n) => n.parentId).filter(Boolean));
const leaves = nodes.filter((n) => String(n.partition || '') !== 'method' && !parentIds.has(n.knowledgeId || n._id));
console.log(`图谱 ${nodes.length}｜叶子(非方法) ${leaves.length}｜题目 ${qs.length}\n`);

// 取几道解答题做测试
const tests = qs.filter((q) => q.questionType === '解答' && q.questionText).slice(0, 4);

// 节点向量（全量，name only —— 上一轮实测最准）
console.log('预编码全量节点 name ...');
const nodeVecs = await embedBatch(nodes.map((n) => String(n.name || '').trim()));

// 三种方式共用：先让 AI 自由输出（模拟判定阶段的产出）
const FREE = (qText) => `你是数学教研专家。请判断下面这道题**考查了哪些知识点**。

题目：${qText}

要求：
- 列出这道题实际用到的知识点（1~3 个），用**最具体的说法**，不要用上位概念
- 如果确有多个，可以都列上
只输出 JSON：{"points":["知识点1","知识点2"]}
只输出 JSON。`;

const PICK = (qText, cands) => `你在为一道数学题确定「考查的知识点」。

题目：${qText}

系统召回了以下候选知识点，请选出这道题**实际考查**的（可多选，选多一点没关系）：
${cands.map((c, i) => `${i + 1}. ${c.name}`).join('\n')}

- 只选真正用到的
- 如果候选里**都不是**这道题考的，输出 {"picked":[],"none":true}
只输出 JSON：{"picked":["名字"],"none":false}
只输出 JSON。`;

const ROUNDS = 3;
const stat = { free: [], pick10: [], pick20: [] };
const usageAcc = { free: 0, pick: 0, calls: 0 };

for (const q of tests) {
  const qText = String(q.questionText || '').slice(0, 400);
  console.log('='.repeat(84));
  console.log(`  题：${qText.slice(0, 70)}...`);
  console.log('='.repeat(84));

  // —— 步骤1：AI 自由输出知识点（三轮）——
  const freePicks = [];
  for (let i = 0; i < ROUNDS; i++) {
    const r = await chat(FREE(qText));
    usageAcc.free += r.usage.total_tokens; usageAcc.calls++;
    freePicks.push(extractJSON(r.content).points || []);
  }
  console.log(`  [AI自由输出] 轮1: ${freePicks[0].join('、')}`);
  console.log(`               轮2: ${freePicks[1].join('、')}`);

  // —— 步骤2：用轮1的输出做 embedding 召回 ——
  const qv = (await embedBatch([freePicks[0].join(' ')]))[0];
  const scored = nodes.map((n, j) => ({ n, s: cosine(qv, nodeVecs[j]) })).sort((a, b) => b.s - a.s);

  for (const N of [10, 20]) {
    const cands = scored.slice(0, N).map((x) => x.n);
    const picks = [];
    for (let i = 0; i < ROUNDS; i++) {
      const r = await chat(PICK(qText, cands));
      usageAcc.pick += r.usage.total_tokens; usageAcc.calls++;
      const j = extractJSON(r.content);
      picks.push(j.none ? [] : (j.picked || []));
    }
    const key = 'pick' + N;
    stat[key].push(picks);
    const names = picks.map((p) => p.join('、') || '（都不是）');
    console.log(`  [召回 top-${N}] 轮1: ${names[0]}`);
    console.log(`                轮2: ${names[1]}`);
    console.log(`                轮3: ${names[2]}`);
    // 内容层一致性
    const sets = picks.map(setOf);
    const inter = [...sets[0]].filter((x) => sets.every((s) => s.has(x)));
    const union = new Set(sets.flatMap((s) => [...s]));
    console.log(`                ▶ 内容稳定度：${union.size ? ((inter.length / union.size) * 100).toFixed(0) : 100}%（交集/并集）`);
    console.log(`                ▶ 召回集 top-3 分数：${scored.slice(0, 3).map((x) => `${x.s.toFixed(3)} ${x.n.name}`).join(' | ')}`);
  }
  console.log('');
}

// —— 成本对比 ——
console.log('='.repeat(84));
console.log('  成本对比');
console.log('='.repeat(84));
const avgFree = usageAcc.free / (tests.length * ROUNDS);
const avgPick = usageAcc.pick / (tests.length * 2 * ROUNDS);
console.log(`  AI 自由输出（1 次）：        ${avgFree.toFixed(0)} tok`);
console.log(`  召回后让 AI 选（1 次）：      ${avgPick.toFixed(0)} tok`);
console.log(`  ─────────────────────────────────────`);
console.log(`  本方案单题成本：              ${(avgFree + avgPick).toFixed(0)} tok`);
console.log(`  对照：全清单直选（上一轮实测）：3859 tok/题`);
console.log(`  → 节省：${(100 - ((avgFree + avgPick) / 3859) * 100).toFixed(0)}%`);
console.log(`\n  注：召回本身还有 1 次 embedding 调用（input ≈ ${(tests[0] ? String(tests[0].questionText).length : 0)} 字符），成本可忽略`);
