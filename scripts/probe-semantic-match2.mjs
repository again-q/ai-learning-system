#!/usr/bin/env node
// ============ 实测 2：节点侧编码方式对比 ============
//
// 上一轮发现：节点侧编 name+source_text 全句 → 分数整体被压低（0.8 阈值只命中 39.6%）
// 本轮对比四种节点侧编码：
//   甲 name only                     （现状 buildNodeNames 的口径）
//   乙 name + 关键短语(concept 前 40 字)
//   丙 name + source_text 全句       （上一轮的口径，作基线）
//   丁 叶子 only（含 name + 短定义）  ← 排除父节点，看是否更准
//
// 同时统计「top1 是否正确」—— 用字符方案的 1.0 精确命中作为弱标签，
// 并对关键字人工核对。
//
// 只读。用法：node scripts/probe-semantic-match2.mjs
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tcb = path.join(ROOT, 'node_modules/.bin/tcb');
const ENV = process.env.TCB_ENV || 'cloud1-d8g0ty39wd73f430a';
const envText = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const getEnv = (k) => (envText.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim();
const QWEN_API_KEY = getEnv('QWEN_API_KEY');
const QWEN_BASE_URL = getEnv('QWEN_BASE_URL') || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const EMBEDDING_MODEL = getEnv('EMBEDDING_MODEL') || 'text-embedding-v4';

function unwrap(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(unwrap);
  const ks = Object.keys(v);
  if (ks.length === 1) {
    const k = ks[0];
    if (/^\$(numberInt|numberLong|numberDouble)$/.test(k)) return Number(v[k]);
    if (k === '$oid' || k === '$date') return v[k];
  }
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
async function embedBatch(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += 10) {
    const batch = texts.slice(i, i + 10);
    const resp = await fetch(`${QWEN_BASE_URL}/embeddings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${QWEN_API_KEY}` },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: batch }),
    });
    if (!resp.ok) throw new Error('embed HTTP ' + resp.status);
    const d = await resp.json();
    out.push(...d.data.slice().sort((x, y) => x.index - y.index).map((x) => x.embedding));
    process.stdout.write(`\r  embed ${Math.min(i + 10, texts.length)}/${texts.length}   `);
  }
  console.log('');
  return out;
}
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

const nodes = query({ find: 'knowledge_nodes', filter: {}, limit: 1000 });
const qs = query({ find: 'questions', filter: {}, limit: 1000 });
const aiNames = new Map();
for (const q of qs) for (const u of (q.knowledgeUsage || [])) {
  const nm = String((u && u.name) || '').trim();
  if (nm) aiNames.set(nm, (aiNames.get(nm) || 0) + 1);
}
const nameList = [...aiNames.keys()];

// 叶子判定（照抄 pickLeafNodes 的逻辑：有人拿它当 parentId 的，就是父节点）
const parentIds = new Set(nodes.map((n) => n.parentId).filter(Boolean));
const leaves = nodes.filter((n) => String(n.partition || '') !== 'method' && !parentIds.has(n.knowledgeId || n._id));
console.log(`\n图谱节点 ${nodes.length}｜其中叶子(非方法) ${leaves.length}｜父节点 ${parentIds.size}`);
console.log(`AI 说法 ${nameList.length} 条\n`);

const AI_VECS = await embedBatch(nameList);

const SCHEMES = [
  { key: '甲 name only', set: nodes, text: (n) => String(n.name || '').trim() },
  { key: '乙 name+短语40', set: nodes, text: (n) => { const s = String((n.concept && n.concept.source_text) || '').trim().slice(0, 40); return s ? `${n.name}。${s}` : String(n.name || ''); } },
  { key: '丙 name+全句', set: nodes, text: (n) => { const s = String((n.concept && n.concept.source_text) || '').trim(); return s ? `${n.name}。${s}` : String(n.name || ''); } },
  { key: '丁 叶子+短语40', set: leaves, text: (n) => { const s = String((n.concept && n.concept.source_text) || '').trim().slice(0, 40); return s ? `${n.name}。${s}` : String(n.name || ''); } },
];

const results = {};
for (const sc of SCHEMES) {
  console.log(`\n[${sc.key}] 编码 ${sc.set.length} 个节点...`);
  const vecs = await embedBatch(sc.set.map(sc.text));
  const rows = [];
  for (let i = 0; i < nameList.length; i++) {
    const scored = sc.set.map((n, j) => ({ n, s: cosine(AI_VECS[i], vecs[j]) })).sort((a, b) => b.s - a.s);
    rows.push({ ai: nameList[i], cnt: aiNames.get(nameList[i]), top: scored.slice(0, 3) });
  }
  results[sc.key] = rows;
}

// —— 统计 ——
console.log('\n' + '='.repeat(84));
console.log('  一、各方案命中率（按阈值）');
console.log('='.repeat(84));
console.log('  方案            │  ≥0.60  │  ≥0.65  │  ≥0.70  │  ≥0.75  │  ≥0.80');
console.log('  ' + '-'.repeat(78));
for (const sc of SCHEMES) {
  const rows = results[sc.key];
  const r = (t) => rows.filter((x) => x.top[0].s >= t).length;
  console.log(`  ${sc.key.padEnd(15)} │ ${String(r(0.60)).padStart(4)}/${nameList.length}│ ${String(r(0.65)).padStart(4)}/${nameList.length}│ ${String(r(0.70)).padStart(4)}/${nameList.length}│ ${String(r(0.75)).padStart(4)}/${nameList.length}│ ${String(r(0.80)).padStart(4)}/${nameList.length}`);
}

// —— 分数分布 ——
console.log('\n' + '='.repeat(84));
console.log('  二、top1 分数分布');
console.log('='.repeat(84));
for (const sc of SCHEMES) {
  const scores = results[sc.key].map((x) => x.top[0].s).sort((a, b) => b - a);
  const hi = scores.filter((s) => s >= 0.85).length;
  const mid = scores.filter((s) => s >= 0.75 && s < 0.85).length;
  const lo = scores.filter((s) => s >= 0.65 && s < 0.75).length;
  const bad = scores.filter((s) => s < 0.65).length;
  const med = scores[Math.floor(scores.length / 2)];
  console.log(`  ${sc.key.padEnd(15)} │ ≥0.85:${String(hi).padStart(3)} │ 0.75~0.85:${String(mid).padStart(3)} │ 0.65~0.75:${String(lo).padStart(3)} │ <0.65:${String(bad).padStart(3)} │ 中位 ${med.toFixed(3)}`);
}

// —— 关键条目逐条对照（看 top1 选没选对）——
const KEY = ['集合的包含关系', '集合的运算', '元素与集合的关系', '集合的并集', '集合的交集', '集合的封闭性', '集合的子集与元素计数'];
console.log('\n' + '='.repeat(84));
console.log('  三、关键条目 top1 对照（看选得对不对）');
console.log('='.repeat(84));
for (const ai of KEY) {
  if (!aiNames.has(ai)) continue;
  console.log(`\n  "${ai}"（出现 ${aiNames.get(ai)} 次）`);
  for (const sc of SCHEMES) {
    const row = results[sc.key].find((x) => x.ai === ai);
    if (!row) continue;
    const t = row.top[0];
    console.log(`     ${sc.key.padEnd(15)} → ${t.s.toFixed(3)}  ${t.n.name}`);
  }
}

// —— 落盘 ——
const outDir = path.join(ROOT, 'output/semantic-match');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'schemes.json'), JSON.stringify(
  Object.fromEntries(Object.entries(results).map(([k, rows]) => [k, rows.map((r) => ({
    ai: r.ai, count: r.cnt, top3: r.top.map((t) => ({ score: Math.round(t.s * 1000) / 1000, node: t.n.name })),
  }))])), null, 1));
console.log(`\n落盘：output/semantic-match/schemes.json`);
