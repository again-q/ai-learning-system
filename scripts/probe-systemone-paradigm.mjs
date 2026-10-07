#!/usr/bin/env node
// ============ 实测 6：System One 决策范式（用现有 DeepSeek 模拟）============
//
// 背景：阿里百炼 decision-model-preview（System One 协议）需要 WorkspaceId，
//       只能在控制台手动获取，脚本拿不到 → 先用 V4.1 模拟同一范式，
//       验证「choice 从 271 个中文节点里选」这件事本身是否可行 + 成本多少。
//
// 模拟要点（对齐 System One 语义）：
//   · choice：候选集 = 271 个节点名，要求只返回序号（不写名字）
//   · noul  ：测算子检查（今天已实测 100% 稳定）
//   · 输出只有 ID → 对比"写名字"的 token 差
//
// 用法：node scripts/probe-systemone-paradigm.mjs
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tcb = path.join(ROOT, 'node_modules/.bin/tcb');
const ENV = process.env.TCB_ENV || 'cloud1-d8g0ty39wd73f430a';
const envText = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const getEnv = (k) => (envText.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim();
const KEY = getEnv('SMOKE_API_KEY');
const BASE = getEnv('SMOKE_API_BASE') || 'https://api.deepseek.com';
const MODEL = 'deepseek-flash';

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
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: MODEL, temperature: 1.0, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + (await res.text()).slice(0, 200));
  const j = await res.json();
  return { content: j.choices[0].message.content, usage: j.usage };
}
const extractJSON = (t) => {
  const m = t.match(/```(?:json)?\s*([\s\S]*?)```/) || t.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  return JSON.parse((m ? m[1] : t).trim());
};

const nodes = query({ find: 'knowledge_nodes', filter: {}, limit: 1000 });
const qs = query({ find: 'questions', filter: {}, limit: 1000 });
console.log(`图谱 ${nodes.length}｜题目 ${qs.length}`);

// 编号清单（System One 的候选集）
const catalog = nodes.map((n, i) => ({ idx: i + 1, name: String(n.name || '').trim(), id: n.knowledgeId || n._id }));
const catalogText = catalog.map((c) => `${c.idx}. ${c.name}`).join('\n');
console.log(`清单文本约 ${catalogText.length} 字符\n`);

const tests = qs.filter((q) => q.questionType === '解答' && q.questionText).slice(0, 4);

// ============ 方式 A：choice + 只输出序号（模拟 System One）============
const CHOICE_ID = (qText) => `你是数学教研专家。请判断下面这道题考查了哪些知识点。

题目：
${qText}

【候选清单】（必须从下面选，只能返回序号）
${catalogText}

要求：
- 从清单里选出这道题**实际考查**的知识点，1~3 个
- **只返回序号数组**，不要写名字，不要解释
- 例：{"picked":[12,45]}

只输出 JSON：{"picked":[]}`;

// ============ 方式 B：自由写名字（对照组）============
const FREE_NAME = (qText) => `你是数学教研专家。请判断下面这道题考查了哪些知识点。

题目：
${qText}

要求：列出 1~3 个知识点，用最具体的说法。
只输出 JSON：{"points":["知识点1"]}`;

const ROUNDS = 3;
const acc = { A: { tok: 0, in: 0, out: 0, n: 0 }, B: { tok: 0, in: 0, out: 0, n: 0 } };
const results = [];

console.log('='.repeat(86));
console.log('  对照：A=只输出序号（System One 式） vs B=自由写名字（现状）');
console.log('='.repeat(86));

for (const q of tests) {
  const qText = String(q.questionText || '').slice(0, 400);
  console.log(`\n题：${qText.slice(0, 64)}...`);

  // A：序号
  const aPicks = [];
  for (let i = 0; i < ROUNDS; i++) {
    try {
      const r = await chat(CHOICE_ID(qText));
      acc.A.tok += r.usage.total_tokens; acc.A.in += r.usage.prompt_tokens; acc.A.out += r.usage.completion_tokens; acc.A.n++;
      const ids = extractJSON(r.content).picked || [];
      const names = ids.map((x) => (catalog[x - 1] ? catalog[x - 1].name : `#${x}?`));
      aPicks.push(names);
      console.log(`  [A 序号] 轮${i + 1}: [${ids.join(',')}] → ${names.join('、')}`);
    } catch (e) { aPicks.push([]); console.log(`  [A] 轮${i + 1} 失败 ${e.message}`); }
  }

  // B：自由写名
  const bPicks = [];
  for (let i = 0; i < ROUNDS; i++) {
    try {
      const r = await chat(FREE_NAME(qText));
      acc.B.tok += r.usage.total_tokens; acc.B.in += r.usage.prompt_tokens; acc.B.out += r.usage.completion_tokens; acc.B.n++;
      bPicks.push(extractJSON(r.content).points || []);
      console.log(`  [B 名字] 轮${i + 1}: ${bPicks[i].join('、')}`);
    } catch (e) { bPicks.push([]); console.log(`  [B] 轮${i + 1} 失败 ${e.message}`); }
  }

  // 内容一致度
  const setOf = (arr) => new Set((arr || []).flat().map((s) => String(s).replace(/[\s、,，]/g, '')));
  const stability = (picks) => {
    const sets = picks.map(setOf);
    if (!sets.length) return 0;
    const inter = [...sets[0]].filter((x) => sets.every((s) => s.has(x)));
    const union = new Set(sets.flatMap((s) => [...s]));
    return union.size ? (inter.length / union.size) * 100 : 100;
  };
  console.log(`  ▶ A 稳定度 ${stability(aPicks).toFixed(0)}%  |  B 稳定度 ${stability(bPicks).toFixed(0)}%`);
  results.push({ q: qText.slice(0, 50), a: aPicks, b: bPicks });
}

console.log('\n' + '='.repeat(86));
console.log('  成本对比（每道题平均）');
console.log('='.repeat(86));
const avg = (o) => ({ tok: o.n ? o.tok / o.n : 0, in: o.n ? o.in / o.n : 0, out: o.n ? o.out / o.n : 0 });
const A = avg(acc.A), B = avg(acc.B);
console.log('  方式                    │ 输入tok │ 输出tok │ 合计tok');
console.log('  ' + '-'.repeat(64));
console.log(`  A 只输出序号（System One式）│ ${A.in.toFixed(0).padStart(7)} │ ${A.out.toFixed(0).padStart(7)} │ ${A.tok.toFixed(0).padStart(7)}`);
console.log(`  B 自由写名字（现状）       │ ${B.in.toFixed(0).padStart(7)} │ ${B.out.toFixed(0).padStart(7)} │ ${B.tok.toFixed(0).padStart(7)}`);
console.log(`\n  → 输出 token 变化：${B.out ? (((A.out - B.out) / B.out) * 100).toFixed(0) : 0}%`);
console.log(`  → 总 token 变化：  ${B.tok ? (((A.tok - B.tok) / B.tok) * 100).toFixed(0) : 0}%`);

fs.mkdirSync(path.join(ROOT, 'output/systemone'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'output/systemone/paradigm.json'), JSON.stringify({
  generatedAt: new Date().toISOString(), catalogSize: catalog.length,
  cost: { A, B }, results,
}, null, 1));
console.log(`\n落盘：output/systemone/paradigm.json`);
