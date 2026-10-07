#!/usr/bin/env node
// ============ 实测 3：候选集 —— 全量 271 节点 vs 只给叶子 ============
//
// 上一轮结论：节点侧只编 name（不拼 source_text）最准 → 本轮固定用 name only
// 本轮唯一变量：候选集范围
//   甲 全量 271（含父节点）
//   乙 叶子 only（非 method 且不被任何节点当 parentId）
//   丙 叶子 + method（判定 prompt 的两段式清单口径）
//
// 评价维度：
//   ① 命中率分布（≥0.85 / 0.72~0.85 / <0.72）
//   ② top1 是否变化（看父节点有没有"抢"走本该给叶子的匹配）
//   ③ 父节点抢走的案例逐条列出
//
// 只读。用法：node scripts/probe-candidate-set.mjs
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tcb = path.join(ROOT, 'node_modules/.bin/tcb');
const ENV = process.env.TCB_ENV || 'cloud1-d8g0ty39wd73f430a';
const envText = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const getEnv = (k) => (envText.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim();
const KEY = getEnv('QWEN_API_KEY');
const BASE = getEnv('QWEN_BASE_URL') || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const MODEL = getEnv('EMBEDDING_MODEL') || 'text-embedding-v4';

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
async function embedBatch(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += 10) {
    const resp = await fetch(`${BASE}/embeddings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ model: MODEL, input: texts.slice(i, i + 10) }),
    });
    if (!resp.ok) throw new Error('embed HTTP ' + resp.status);
    const d = await resp.json();
    out.push(...d.data.slice().sort((x, y) => x.index - y.index).map((x) => x.embedding));
    process.stdout.write(`\r  embed ${Math.min(i + 10, texts.length)}/${texts.length}   `);
  }
  console.log('');
  return out;
}
const cosine = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return d / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9); };

const nodes = query({ find: 'knowledge_nodes', filter: {}, limit: 1000 });
const qs = query({ find: 'questions', filter: {}, limit: 1000 });
const aiCount = new Map();
for (const q of qs) for (const u of (q.knowledgeUsage || [])) {
  const nm = String((u && u.name) || '').trim(); if (nm) aiCount.set(nm, (aiCount.get(nm) || 0) + 1);
}
const aiNames = [...aiCount.keys()];

// —— 候选集划分 ——
const parentIds = new Set(nodes.map((n) => n.parentId).filter(Boolean));
const isMethod = (n) => String(n.partition || '') === 'method';
const leaves = nodes.filter((n) => !isMethod(n) && !parentIds.has(n.knowledgeId || n._id));
const full = nodes;
const leafPlusMethod = nodes.filter((n) => !parentIds.has(n.knowledgeId || n._id));   // 叶子 + method 叶子

console.log('='.repeat(84));
console.log('  候选集对比（节点侧一律只编 name）');
console.log('='.repeat(84));
console.log(`\n全量 ${full.length}｜叶子(非方法) ${leaves.length}｜叶子+方法 ${leafPlusMethod.length}｜父节点 ${parentIds.size}`);

const SETS = [
  { key: '甲 全量271', set: full },
  { key: '乙 叶子only', set: leaves },
  { key: '丙 叶子+方法', set: leafPlusMethod },
];

const aiVecs = await embedBatch(aiNames);
const out = {};
for (const s of SETS) {
  console.log(`\n[${s.key}] 编码 ${s.set.length} 个...`);
  const vecs = await embedBatch(s.set.map((n) => String(n.name || '').trim()));
  out[s.key] = aiNames.map((ai, i) => {
    const scored = s.set.map((n, j) => ({ n, sc: cosine(aiVecs[i], vecs[j]) })).sort((a, b) => b.sc - a.sc);
    return { ai, cnt: aiCount.get(ai), top: scored.slice(0, 3) };
  });
}

// —— 分布 ——
console.log('\n' + '='.repeat(84));
console.log('  一、命中率分布');
console.log('='.repeat(84));
console.log('  候选集        │ ≥0.85 直配 │ 0.72~0.85 中间 │ <0.72 放弃 │ 中位分');
console.log('  ' + '-'.repeat(76));
for (const s of SETS) {
  const rows = out[s.key];
  const g = rows.filter((r) => r.top[0].sc >= 0.85).length;
  const m = rows.filter((r) => r.top[0].sc >= 0.72 && r.top[0].sc < 0.85).length;
  const b = rows.filter((r) => r.top[0].sc < 0.72).length;
  const sc = rows.map((r) => r.top[0].sc).sort((a, c) => c - a);
  console.log(`  ${s.key.padEnd(13)} │ ${String(g).padStart(7)}/${aiNames.length} │ ${String(m).padStart(9)}/${aiNames.length}  │ ${String(b).padStart(6)}/${aiNames.length} │ ${sc[Math.floor(sc.length / 2)].toFixed(3)}`);
}

// —— top1 是否一致 ——
console.log('\n' + '='.repeat(84));
console.log('  二、全量 vs 叶子：top1 结果不同的条目');
console.log('='.repeat(84));
const fullR = out['甲 全量271'], leafR = out['乙 叶子only'];
let diff = 0;
for (let i = 0; i < aiNames.length; i++) {
  const a = fullR[i].top[0], b = leafR[i].top[0];
  const an = a.n.name, bn = b.n.name;
  if (an !== bn) {
    diff++;
    console.log(`  "${fullR[i].ai}" (${fullR[i].cnt}次)`);
    console.log(`     全量 → ${a.sc.toFixed(3)} ${an}`);
    console.log(`     叶子 → ${b.sc.toFixed(3)} ${bn}`);
  }
}
console.log(`\n  不同条目：${diff}/${aiNames.length}`);

// —— 父节点被选中的情况 ——
console.log('\n' + '='.repeat(84));
console.log('  三、全量方案里，top1 落在【父节点】上的条目（= 父节点抢匹配）');
console.log('='.repeat(84));
let stolen = 0;
for (const r of fullR) {
  const n = r.top[0].n;
  if (parentIds.has(n.knowledgeId || n._id)) {
    stolen++;
    console.log(`  "${r.ai}" (${r.cnt}次) → ${r.top[0].sc.toFixed(3)} 【父】${n.name}`);
  }
}
console.log(`\n  被父节点抢走：${stolen}/${aiNames.length}`);

// —— 关键条目三方案对照 ——
const KEYNAMES = ['集合的并集', '集合的交集', '集合的运算', '元素与集合的关系', '集合的包含关系', '集合的封闭性', '集合的子集与元素计数'];
console.log('\n' + '='.repeat(84));
console.log('  四、关键条目三方案 top1 对照');
console.log('='.repeat(84));
for (const ai of KEYNAMES) {
  if (!aiCount.has(ai)) continue;
  console.log(`\n  "${ai}"（${aiCount.get(ai)} 次）`);
  for (const s of SETS) {
    const r = out[s.key].find((x) => x.ai === ai);
    console.log(`     ${s.key.padEnd(12)} → ${r.top[0].sc.toFixed(3)}  ${r.top[0].n.name}`);
  }
}

fs.mkdirSync(path.join(ROOT, 'output/semantic-match'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'output/semantic-match/candidate-sets.json'), JSON.stringify(
  Object.fromEntries(Object.entries(out).map(([k, rows]) => [k, rows.map((r) => ({
    ai: r.ai, count: r.cnt, top3: r.top.map((t) => ({ score: Math.round(t.sc * 1000) / 1000, node: t.n.name, isParent: parentIds.has(t.n.knowledgeId || t.n._id) })),
  }))])), null, 1));
console.log('\n落盘：output/semantic-match/candidate-sets.json');
