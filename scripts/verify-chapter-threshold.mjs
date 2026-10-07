#!/usr/bin/env node
// ============ 章节段阈值对比（只读 DB + 真调 Jev，落盘后离线分析） ============
//
// 背景：章节 noul 概率与题目难度强相关（实测 D≥0.6 的题过 0.8 阈值率只有 29%），
//       而难题恰恰是产品最需要追踪的（用户：「高分数段需要能看得到大进步」）。
//       本脚本把概率落盘，然后离线比较不同阈值策略的权衡。
//
// 用法：node scripts/verify-chapter-threshold.mjs
import { find } from './db.mjs';
import { groupByChapter, createJevClient, pickUnits } from '../cloudfunctions/graphEngine/src/lib/jevMatch.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY = process.env.OR_KEY;
const L = '='.repeat(96);
const show = (t) => console.log('\n' + L + '\n  ' + t + '\n' + L);

const nodes = find('knowledge_nodes', 1000, { knowledgeId: 1, name: 1, partition: 1, parentId: 1, path: 1 });
const groups = groupByChapter(nodes);
const chapters = Object.keys(groups);
const byName = {}; nodes.forEach((n) => { if (n.name) byName[String(n.name).trim()] = n; });

const raw = find('questions', 1000);
const seen = new Set(); const qs = [];
for (const q of raw) {
  const t = String(q.questionText || '').replace(/\s+/g, ' ').trim();
  if (t.length <= 20) continue;
  const k = t.slice(0, 200); if (seen.has(k)) continue; seen.add(k);
  qs.push(Object.assign({}, q, { _text: t }));
}

const cacheFile = path.join(ROOT, 'output/jev/chapter-probs.json');
let data = null;
if (fs.existsSync(cacheFile)) {
  data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  console.log(`  复用缓存：${cacheFile}（${data.rows.length} 题）  [删掉该文件可重跑]`);
} else {
  const client = createJevClient({ apiKey: KEY });
  const rows = [];
  for (const q of qs) {
    const r = await pickUnits(client, q._text.slice(0, 1200), chapters);
    const truth = new Set();
    (q.knowledgeUsage || []).forEach((u) => {
      const n = byName[String(u.name || '').trim()];
      const p = n && Array.isArray(n.path) ? n.path[2] : null;
      if (p) truth.add(p);
    });
    rows.push({ text: q._text.slice(0, 80), D: Number(q.difficultyValue) || 0, probs: r.probs, truth: [...truth] });
  }
  data = { generatedAt: new Date().toISOString(), chapters, rows };
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2));
  console.log(`  已落盘：${cacheFile}`);
}

const { rows } = data;

show('一、章节 noul 概率 vs 题目难度');
const byD = [[0, 0.4], [0.4, 0.6], [0.6, 1.01]];
console.log('  D 区间        题数   平均max   过0.8率');
byD.forEach(([lo, hi]) => {
  const g = rows.filter((r) => r.D >= lo && r.D < hi);
  if (!g.length) return;
  const avg = g.reduce((s, r) => s + Math.max(...Object.values(r.probs).filter((v) => v != null)), 0) / g.length;
  const rate = g.filter((r) => Math.max(...Object.values(r.probs).filter((v) => v != null)) >= 0.8).length / g.length;
  console.log(`  ${lo}~${hi}      ${String(g.length).padStart(4)}   ${avg.toFixed(3)}    ${(rate * 100).toFixed(0)}%`);
});

show('二、不同阈值策略的权衡');
console.log('  策略             有单元命中率   top-1正确率   平均单元数   单单元题误判为多单元');
const strategies = [
  ['绝对 ≥0.8（当前）', (p) => Object.entries(p).filter(([, v]) => v != null && v >= 0.8).map(([k]) => k)],
  ['绝对 ≥0.6', (p) => Object.entries(p).filter(([, v]) => v != null && v >= 0.6).map(([k]) => k)],
  ['绝对 ≥0.5', (p) => Object.entries(p).filter(([, v]) => v != null && v >= 0.5).map(([k]) => k)],
  ['绝对 ≥0.4', (p) => Object.entries(p).filter(([, v]) => v != null && v >= 0.4).map(([k]) => k)],
  ['仅 top-1', (p) => [Object.entries(p).sort((a, b) => b[1] - a[1])[0][0]]],
  ['top-1 + 相对≥0.6', (p) => {
    const s = Object.entries(p).sort((a, b) => b[1] - a[1]);
    const top = s[0][1];
    return s.filter(([, v]) => v >= top * 0.6).map(([k]) => k);
  }],
  ['top-1 + 相对≥0.8', (p) => {
    const s = Object.entries(p).sort((a, b) => b[1] - a[1]);
    const top = s[0][1];
    return s.filter(([, v]) => v >= top * 0.8).map(([k]) => k);
  }],
];

for (const [name, fn] of strategies) {
  let anyHit = 0, top1ok = 0, top1n = 0, sumUnits = 0, overSplit = 0, singleN = 0;
  for (const r of rows) {
    const picked = fn(r.probs);
    if (picked.length) anyHit++;
    sumUnits += picked.length;
    const ranked = Object.entries(r.probs).sort((a, b) => b[1] - a[1]);
    if (r.truth.length) { top1n++; if (r.truth.includes(ranked[0][0])) top1ok++; }
    // 单单元题（truth 只有 1 个）被切成多单元
    if (r.truth.length === 1) { singleN++; if (picked.length > 1) overSplit++; }
  }
  console.log(`  ${name.padEnd(18)} ${String((anyHit / rows.length * 100).toFixed(0) + '%').padStart(6)}       `
    + `${String((top1ok / Math.max(1, top1n) * 100).toFixed(1) + '%').padStart(6)}       `
    + `${(sumUnits / rows.length).toFixed(2).padStart(6)}       `
    + `${overSplit}/${singleN}`);
}

show('三、结论提示');
console.log(`
  · 「有单元命中率」衡量**漏判**（漏了整题就没账）
  · 「单单元题误判为多单元」衡量**过度切分**（会让 A 记到不该记的单元）
  · 章节段的目的：(a) 缩候选池 (b) 定 A 的记账单元
    → (a) 要求宁可多选，(b) 要求准 —— 两者有张力
`);
