#!/usr/bin/env node
// ============ Jev 匹配 on 真实语料（只读 DB + 真调 Jev） ============
// 目的：把方案文档里「80.7% → 100%」的说法放到**真实线上题目**上复验，
//       而不是只信 5 题的探针结果。
//
// 做法：
//   ① 从 questions 取真实题目文本
//   ② 用 groupByChapter 从真实图谱构建候选
//   ③ 跑两阶段 Jev → 与【字符相似度】的现状结果对照
//   ④ 用「Jev 选出的名字是否在候选清单里、conf 多高」做可核验的判据
//
// 用法：node scripts/verify-jev-real.mjs [--limit N]
import { find } from './db.mjs';
import { groupByChapter, createJevClient, matchByJev } from '../cloudfunctions/graphEngine/src/lib/jevMatch.js';

const KEY = process.env.OR_KEY;
const args = process.argv.slice(2);
const LIMIT = (() => { const i = args.indexOf('--limit'); return i >= 0 ? Number(args[i + 1]) : 12; })();

const L = '='.repeat(96);
const show = (t) => console.log('\n' + L + '\n  ' + t + '\n' + L);

// ---- 现状：字符相似度（照抄 knowledgeMatch.simName / findNode，用于对照） ----
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
const groups = groupByChapter(nodes);

show('一、候选构建');
console.log(`  图谱节点 ${nodes.length} 个 → 章节 ${Object.keys(groups).length} 个`);
for (const [ch, names] of Object.entries(groups).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`    ${ch.padEnd(30)} ${String(names.length).padStart(3)} 个候选`);
}
const maxCand = Math.max(...Object.values(groups).map((x) => x.length));
console.log(`  最大候选数 ${maxCand}（Jev 上限 255）→ ${maxCand <= 255 ? '✅ 可单阶段' : '⚠️ 需分章'}`);

// ---- 取真实题目 ----
const qs = find('questions', 1000).filter((q) => {
  const t = String(q.questionText || '').trim();
  return t.length > 20;
});
show(`二、真实语料（${qs.length} 道可测，本轮取前 ${LIMIT} 道）`);

const client = createJevClient({ apiKey: KEY });
const rows = [];
let jevHit = 0, jevNull = 0, charHit = 0, charSameAsJev = 0, confSum = 0, costSum = 0, tokSum = 0;

for (const q of qs.slice(0, LIMIT)) {
  const text = String(q.questionText || '').slice(0, 1200);
  // 现状：拿 AI 写出的名字去做字符匹配
  const usage = Array.isArray(q.knowledgeUsage) ? q.knowledgeUsage : [];
  const aiNames = usage.map((u) => String((u && u.name) || '').trim()).filter(Boolean);

  let r = { name: null, confidence: 0, chapter: null };
  let err = null;
  try { r = await matchByJev(client, text, groups, {}); } catch (e) { err = e.message; }

  // 字符匹配在「AI 写的名字」上的最好结果
  const charPicks = aiNames.map((nm) => {
    let best = null, bs = 0;
    for (const n of allNames) { const s = simName(nm, n); if (s > bs) { bs = s; best = n; } }
    return { nm, best: bs >= 0.8 ? best : null, score: bs };
  });

  if (err) {
    console.log(`  ✖ ${err.slice(0, 80)}`);
  } else if (r.name) {
    jevHit++; confSum += r.confidence;
    const inList = (groups[r.chapter] || []).includes(r.name);
    if (charPicks.some((c) => c.best === r.name)) charSameAsJev++;
  } else jevNull++;

  if (charPicks.some((c) => c.best)) charHit++;

  rows.push({ q, aiNames, jev: r, charPicks, err });
  const tag = err ? 'ERR' : (r.name ? `✔ ${r.name} (${r.confidence.toFixed(2)})` : '✖ 未命中');
  console.log(`  ${String(q.questionText || '').replace(/\s+/g, ' ').slice(0, 42).padEnd(44)} Jev: ${tag}`);
  if (charPicks.length) {
    console.log(`      AI 写: ${aiNames.join('、').slice(0, 50)}  → 字符匹配: ${charPicks.map((c) => `${c.nm}→${c.best || '✗'}(${c.score.toFixed(2)})`).join(' ').slice(0, 70)}`);
  }
}

show('三、结果汇总');
const tested = rows.filter((x) => !x.err).length;
console.log(`  可测题数            ${tested}`);
console.log(`  Jev 命中（选出规范名）  ${jevHit}/${tested}  = ${(jevHit / Math.max(1, tested) * 100).toFixed(1)}%`);
console.log(`  Jev 未命中           ${jevNull}（进待建队列，不硬塞）`);
console.log(`  字符匹配命中         ${charHit}/${tested}  = ${(charHit / Math.max(1, tested) * 100).toFixed(1)}%`);
if (jevHit) console.log(`  Jev 平均置信度        ${(confSum / jevHit).toFixed(3)}`);
