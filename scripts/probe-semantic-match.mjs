#!/usr/bin/env node
// ============ 实测：知识点匹配 —— 字符方案 vs 语义（embedding）方案 ============
//
// 目的：验证「句子级语义匹配」是否优于「词级字符匹配」，并定出阈值
// 做法：
//   ① 拉线上 knowledge_nodes（271）+ questions 里所有 AI 造过的知识点名
//   ② 字符方案：照抄 simName（零成本基线）
//   ③ 语义方案：节点侧编码 name + concept.source_text（句子级），AI 侧编码说法
//   ④ 对比两者：能匹配上的比例、相似度分布
//
// 只读，不写库。
// 用法：node scripts/probe-semantic-match.mjs
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

// ---------- DB（只读） ----------
function unwrap(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(unwrap);
  const ks = Object.keys(v);
  if (ks.length === 1) {
    const k = ks[0];
    if (/^\$(numberInt|numberLong|numberDouble)$/.test(k)) return Number(v[k]);
    if (k === '$oid' || k === '$date') return v[k];
  }
  const o = {};
  for (const k of ks) o[k] = unwrap(v[k]);
  return o;
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

// ---------- 字符方案（照抄 knowledgeMatch.js simName） ----------
function simName(a, b) {
  a = String(a || '').trim(); b = String(b || '').trim();
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    const short = Math.min(a.length, b.length), long = Math.max(a.length, b.length);
    return Math.min(1, 0.6 + 0.4 * (short / long));
  }
  const sa = new Set(a), sb = new Set(b);
  let inter = 0;
  for (const c of sa) if (sb.has(c)) inter++;
  return (2 * inter) / (sa.size + sb.size);
}

// ---------- embedding ----------
async function embedBatch(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += 10) {
    const batch = texts.slice(i, i + 10);
    const resp = await fetch(`${QWEN_BASE_URL}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${QWEN_API_KEY}` },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: batch }),
    });
    if (!resp.ok) throw new Error('embed HTTP ' + resp.status + ' ' + (await resp.text()).slice(0, 200));
    const d = await resp.json();
    // 按 index 排序，保证与输入对齐
    const arr = d.data.slice().sort((x, y) => x.index - y.index).map((x) => x.embedding);
    out.push(...arr);
    process.stdout.write(`\r  embedding ${Math.min(i + 10, texts.length)}/${texts.length}   `);
  }
  console.log('');
  return out;
}
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

// ================= 主流程 =================
console.log('='.repeat(80));
console.log('  知识点匹配实测：字符方案 vs 语义方案');
console.log('='.repeat(80));

const nodes = query({ find: 'knowledge_nodes', filter: {}, limit: 1000 });
console.log(`\n图谱节点：${nodes.length}`);

const qs = query({ find: 'questions', filter: {}, limit: 1000 });
const aiNames = new Map();   // AI 造过的名字 → 出现次数
for (const q of qs) {
  const usage = Array.isArray(q.knowledgeUsage) ? q.knowledgeUsage : [];
  for (const u of usage) {
    const nm = String((u && u.name) || '').trim();
    if (nm) aiNames.set(nm, (aiNames.get(nm) || 0) + 1);
  }
}
console.log(`题目：${qs.length}｜AI 造过的不同知识点名：${aiNames.size}`);

// ---------- 方案 A：字符 ----------
const charResult = new Map();
for (const nm of aiNames.keys()) {
  let best = null, bestScore = 0;
  for (const n of nodes) {
    const s = simName(nm, String(n.name || ''));
    if (s > bestScore) { bestScore = s; best = n; }
  }
  charResult.set(nm, { node: best, score: bestScore });
}

// ---------- 方案 B：语义（节点侧 = name + source_text） ----------
console.log('\n节点侧编码（name + concept.source_text）...');
const nodeTexts = nodes.map((n) => {
  const nm = String(n.name || '').trim();
  const st = String((n.concept && n.concept.source_text) || '').trim();
  return st ? `${nm}。${st}` : nm;
});
const nodeVecs = await embedBatch(nodeTexts);

console.log('AI 说法编码...');
const nameList = [...aiNames.keys()];
const nameVecs = await embedBatch(nameList);

const semResult = new Map();
for (let i = 0; i < nameList.length; i++) {
  const v = nameVecs[i];
  const scored = nodes.map((n, j) => ({ node: n, score: cosine(v, nodeVecs[j]) }));
  scored.sort((a, b) => b.score - a.score);
  semResult.set(nameList[i], { node: scored[0].node, score: scored[0].score, top3: scored.slice(0, 3) });
}

// ---------- 对比 ----------
const CHAR_T = 0.8, SEM_T = Number(process.env.SEM_T || 0.7);
function rate(res, t) {
  let ok = 0;
  for (const v of res.values()) if (v.score >= t) ok++;
  return ok;
}
console.log('\n' + '='.repeat(80));
console.log('  一、总体命中率（有多少 AI 说法能匹配上节点）');
console.log('='.repeat(80));
console.log(`  字符方案 (阈值 0.80)： ${rate(charResult, CHAR_T)}/${nameList.length} = ${((rate(charResult, CHAR_T) / nameList.length) * 100).toFixed(1)}%`);
for (const t of [0.6, 0.65, 0.7, 0.75, 0.8]) {
  console.log(`  语义方案 (阈值 ${t.toFixed(2)})： ${rate(semResult, t)}/${nameList.length} = ${((rate(semResult, t) / nameList.length) * 100).toFixed(1)}%`);
}

// ---------- 相似度分布 ----------
console.log('\n' + '='.repeat(80));
console.log('  二、相似度分布（看语义方案的分数落在哪）');
console.log('='.repeat(80));
const semScores = [...semResult.values()].map((v) => v.score).sort((a, b) => b - a);
const buckets = {};
for (const s of semScores) {
  const b = (Math.floor(s * 20) / 20).toFixed(2);
  buckets[b] = (buckets[b] || 0) + 1;
}
for (const b of Object.keys(buckets).sort((a, b) => b - a)) {
  console.log(`  ${b} ~ ${(Number(b) + 0.05).toFixed(2)}  ${'█'.repeat(Math.min(60, buckets[b]))} ${buckets[b]}`);
}

// ---------- 逐条对比（只列两方案判定不同的） ----------
console.log('\n' + '='.repeat(80));
console.log('  三、两方案分歧的条目（字符失败 / 语义成功）');
console.log('='.repeat(80));
let fixed = 0, stillBad = 0;
const rows = [];
for (const nm of nameList) {
  const c = charResult.get(nm), s = semResult.get(nm);
  const cOk = c.score >= CHAR_T, sOk = s.score >= SEM_T;
  if (!cOk && sOk) {
    fixed++;
    rows.push({ nm, cnt: aiNames.get(nm), c: c.score.toFixed(3), cNode: c.node ? c.node.name : '-', s: s.score.toFixed(3), sNode: s.node ? s.node.name : '-' });
  } else if (!cOk && !sOk) {
    stillBad++;
  }
}
rows.sort((a, b) => b.cnt - a.cnt);
console.log(`  救回来：${fixed} 条   两方案都失败：${stillBad} 条\n`);
console.log('  次数 │ AI 说法                    │ 字符(节点)                │ 语义(节点)');
console.log('  ' + '-'.repeat(76));
for (const r of rows.slice(0, 30)) {
  const nm = r.nm.length > 22 ? r.nm.slice(0, 21) + '…' : r.nm.padEnd(22);
  const cn = (r.cNode || '-').length > 20 ? r.cNode.slice(0, 19) + '…' : (r.cNode || '-').padEnd(20);
  const sn = (r.sNode || '-').length > 20 ? r.sNode.slice(0, 19) + '…' : (r.sNode || '-').padEnd(20);
  console.log(`  ${String(r.cnt).padStart(4)} │ ${nm} │ ${r.c.padStart(5)} ${cn} │ ${r.s.padStart(5)} ${sn}`);
}

// ---------- 语义方案的 top3（看粒度问题的真相） ----------
console.log('\n' + '='.repeat(80));
console.log('  四、语义相似度最高的几条（看「集合的运算」这类粒度问题怎么落）');
console.log('='.repeat(80));
const interesting = ['集合的运算', '元素与集合的关系', '集合的封闭性'];
for (const nm of interesting) {
  const r = semResult.get(nm);
  if (!r) { console.log(`\n  "${nm}" —— 库中未出现`); continue; }
  console.log(`\n  "${nm}"  top3：`);
  for (const t of r.top3) console.log(`     ${t.score.toFixed(3)}  ${t.node.name}`);
}

// ---------- 落盘 ----------
const outDir = path.join(ROOT, 'output/semantic-match');
fs.mkdirSync(outDir, { recursive: true });
const dump = {
  generatedAt: new Date().toISOString(),
  nodeCount: nodes.length,
  aiNameCount: nameList.length,
  charThreshold: CHAR_T,
  semThresholds: { 0.6: rate(semResult, 0.6), 0.65: rate(semResult, 0.65), 0.7: rate(semResult, 0.7), 0.75: rate(semResult, 0.75), 0.8: rate(semResult, 0.8) },
  mappings: nameList.map((nm) => ({
    aiName: nm, count: aiNames.get(nm),
    char: { score: charResult.get(nm).score, node: charResult.get(nm).node ? charResult.get(nm).node.name : null },
    sem: { score: semResult.get(nm).score, node: semResult.get(nm).node.name, top3: semResult.get(nm).top3.map((t) => ({ score: t.score, node: t.node.name })) },
  })).sort((a, b) => b.count - a.count),
};
fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(dump, null, 1));
console.log(`\n完整映射表已落盘：output/semantic-match/result.json`);
