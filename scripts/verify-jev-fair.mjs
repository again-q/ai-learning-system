#!/usr/bin/env node
// ============ Jev vs 字符匹配 · 公平对照（只读 DB + 真调 Jev） ============
//
// 为什么要有这个脚本（v1 的教训）：
//   v1 把「AI 写的每个 knowledgeUsage 名字」分别喂给字符匹配，只要有一个匹配上就算命中，
//   于是字符匹配天然占便宜（AI 写的名字本来就常与图谱同名 → sim=1.00）。
//   而 Jev 是**互斥单选一个主知识点**，结构上不对等。
//   另外语料有重复题（61 条里 55 条唯一，3 组各出现 3 次），会把两边比率一起放大。
//
// 本版口径（可核验）：
//   ① 题目**去重**（按题面前 200 字符）
//   ② 字符匹配基线 = 对**同一道题**取 AI 写的名字，逐个字符匹配，**取最好结果**
//      （这是现状线上真实行为：知识点的账就是从这些名字去匹配落的）
//   ③ Jev = 两阶段选出**一个**规范名
//   ④ 双方都用同一判据：**选出的名字必须真实存在于图谱候选清单**（在清单里 = 可落账）
//
// 用法：node scripts/verify-jev-fair.mjs [--limit N]
import { find } from './db.mjs';
import { groupByChapter, createJevClient, matchByJev } from '../cloudfunctions/graphEngine/src/lib/jevMatch.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY = process.env.OR_KEY;
const args = process.argv.slice(2);
const LIMIT = (() => { const i = args.indexOf('--limit'); return i >= 0 ? Number(args[i + 1]) : 999; })();
const L = '='.repeat(96);
const show = (t) => console.log('\n' + L + '\n  ' + t + '\n' + L);

function simName(a, b) {
  a = String(a || '').trim(); b = String(b || '').trim();
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    const s = Math.min(a.length, b.length), l = Math.max(a.length, b.length);
    return Math.min(1, 0.6 + 0.4 * (s / l));
  }
  const sa = new Set(a), sb = new Set(b);
  let inter = 0;
  for (const c of sa) if (sb.has(c)) inter++;
  return (2 * inter) / (sa.size + sb.size);
}

const nodes = find('knowledge_nodes', 1000, { knowledgeId: 1, name: 1, type: 1, partition: 1, parentId: 1, path: 1 });
const allNames = nodes.map((n) => String(n.name || '').trim()).filter(Boolean);
const nameSet = new Set(allNames);
const groups = groupByChapter(nodes);
const allCandidates = new Set(Object.values(groups).flat());

// ---- 语料去重 ----
const raw = find('questions', 1000);
const seen = new Set();
const qs = [];
for (const q of raw) {
  const t = String(q.questionText || '').replace(/\s+/g, ' ').trim();
  if (t.length <= 20) continue;
  const k = t.slice(0, 200);
  if (seen.has(k)) continue;
  seen.add(k);
  qs.push(Object.assign({}, q, { _text: t }));
}

show('一、语料与候选');
console.log(`  questions 原始 ${raw.length} 条 → 去重后可测 ${qs.length} 道`);
console.log(`  图谱节点 ${nodes.length} 个 → K 候选（本体叶子）${allCandidates.size} 个，分 ${Object.keys(groups).length} 章`);
console.log(`  字符匹配基线口径：对该题 AI 写的每个名字做字符匹配，取最好结果（= 现状线上行为）`);
console.log(`  双方共同判据：选出的名字必须存在于图谱（在候选清单里 = 可落账）`);

const client = createJevClient({ apiKey: KEY });
const rows = [];
let jevOk = 0, charOk = 0, bothOk = 0, jevOnly = 0, charOnly = 0, neither = 0;
let confSum = 0, confN = 0;

show(`二、逐题对照（前 ${Math.min(LIMIT, qs.length)} 道）`);
for (const q of qs.slice(0, LIMIT)) {
  const usage = Array.isArray(q.knowledgeUsage) ? q.knowledgeUsage : [];
  const aiNames = usage.map((u) => String((u && u.name) || '').trim()).filter(Boolean);

  // 字符匹配：取该题所有 AI 名字里最好的一个
  let charPick = null, charScore = 0;
  for (const nm of aiNames) {
    for (const n of allNames) {
      const s = simName(nm, n);
      if (s > charScore) { charScore = s; charPick = n; }
    }
  }
  const charHit = charScore >= 0.8 && charPick && nameSet.has(charPick);

  // Jev
  let jev = { name: null, confidence: 0 };
  let err = null;
  try { jev = await matchByJev(client, q._text.slice(0, 1200), groups, {}); } catch (e) { err = e.message; }
  const jevHit = !!(jev.name && allCandidates.has(jev.name));

  if (err) { console.log(`  ✖ ${err.slice(0, 70)}`); }
  else {
    if (jevHit) { jevOk++; confSum += jev.confidence; confN++; }
    if (charHit) charOk++;
    if (jevHit && charHit) bothOk++; else if (jevHit) jevOnly++; else if (charHit) charOnly++; else neither++;
    if (jevHit !== charHit) {
      console.log(`  ${jevHit ? 'Jev 赢' : '字符赢'}  ${q._text.replace(/\s+/g, ' ').slice(0, 40)}`);
      console.log(`      AI写: ${aiNames.join('、').slice(0, 46)}`);
      console.log(`      字符: ${charHit ? charPick : '✗'} (${charScore.toFixed(2)})   Jev: ${jev.name || '✗'} (${(jev.confidence || 0).toFixed(2)})`);
    }
  }
  rows.push({ q: q._text.slice(0, 60), aiNames, charHit, charPick, charScore, jev, jevHit, err });
}

show('三、汇总（去重语料 · 同判据）');
const n = rows.filter((r) => !r.err).length;
const pct = (x) => `${(x / Math.max(1, n) * 100).toFixed(1)}%`;
console.log(`  可测题数              ${n}`);
console.log(`  Jev 命中（在候选清单）   ${jevOk}   ${pct(jevOk)}`);
console.log(`  字符匹配命中           ${charOk}   ${pct(charOk)}`);
console.log(`  ─────────────────────────────────`);
console.log(`  两者都对              ${bothOk}`);
console.log(`  只有 Jev 对            ${jevOnly}`);
console.log(`  只有字符对             ${charOnly}`);
console.log(`  两者都错              ${neither}`);
if (confN) console.log(`  Jev 平均置信度         ${(confSum / confN).toFixed(3)}`);

// ---- 落盘 ----
const out = path.join(ROOT, 'output/jev', `fair-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({
  generatedAt: new Date().toISOString(), corpus: { raw: raw.length, dedup: qs.length },
  summary: { n, jevOk, charOk, bothOk, jevOnly, charOnly, neither, avgConf: confN ? confSum / confN : null },
  rows,
}, null, 2));
console.log(`\n  明细已落盘：${path.relative(ROOT, out)}`);
