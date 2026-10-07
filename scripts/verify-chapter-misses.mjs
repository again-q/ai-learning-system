#!/usr/bin/env node
// ============ 核验：章节段未命中的题，到底该不该命中 ============
// 只读 DB（不调 Jev），把每道题的完整题面 + 章节概率 + 图谱候选打出来，
// 供人工判定「是图谱缺口 / 题面截断 / 阈值问题」。
//
// 用法：node scripts/verify-chapter-misses.mjs
import { find } from './db.mjs';
import { groupByChapter, createJevClient, pickUnits } from '../cloudfunctions/graphEngine/src/lib/jevMatch.js';

const KEY = process.env.OR_KEY;
const L = '='.repeat(96);
const show = (t) => console.log('\n' + L + '\n  ' + t + '\n' + L);

const nodes = find('knowledge_nodes', 1000, { knowledgeId: 1, name: 1, partition: 1, parentId: 1, path: 1 });
const groups = groupByChapter(nodes);
const chapters = Object.keys(groups);
const byName = {}; nodes.forEach((n) => { const nm = String(n.name || '').trim(); if (nm && !byName[nm]) byName[nm] = n; });

const raw = find('questions', 1000);
const seen = new Set(); const qs = [];
for (const q of raw) {
  const t = String(q.questionText || '').replace(/\s+/g, ' ').trim();
  if (t.length <= 20) continue;
  const k = t.slice(0, 200); if (seen.has(k)) continue; seen.add(k);
  qs.push(Object.assign({}, q, { _text: t }));
}

const client = createJevClient({ apiKey: KEY });

show('逐题核验：章节段 max < 0.8 的题');
let idx = 0;
const misses = [];
for (const q of qs) {
  const r = await pickUnits(client, q._text.slice(0, 1200), chapters);
  const mx = Math.max(...Object.values(r.probs).filter((v) => v != null));
  if (mx >= 0.8) continue;
  idx++;
  const sorted = Object.entries(r.probs).sort((a, b) => b[1] - a[1]);
  misses.push({ q, probs: r.probs, sorted, mx });

  console.log('\n' + '─'.repeat(96));
  console.log(`【${idx}】max=${mx.toFixed(2)}  题面长度=${q._text.length}`);
  console.log('─'.repeat(96));
  console.log('题面全文：');
  console.log('  ' + q._text.slice(0, 700));
  if (q._text.length > 700) console.log(`  …（还有 ${q._text.length - 700} 字）`);
  console.log();
  console.log('章节概率：');
  sorted.forEach(([c, p]) => console.log(`   ${String(p).padEnd(6)} ${c}`));
  console.log();
  console.log('AI 当时写的知识点（knowledgeUsage）:');
  const usage = Array.isArray(q.knowledgeUsage) ? q.knowledgeUsage : [];
  usage.forEach((u) => {
    const n = byName[String(u.name || '').trim()];
    const ch = n && Array.isArray(n.path) ? n.path[2] : '（图谱里没有这个名字）';
    console.log(`   ${String(u.name).padEnd(22)} → ${ch}`);
  });
  console.log();
  console.log('该题 AI 判的 difficultyValue:', q.difficultyValue, ' errorLevel:', q.errorLevel, ' processScore:', q.processScore);
}

show(`汇总：共 ${misses.length} 道未命中`);
console.log('  按最高概率分布：');
const buckets = { '<0.5': 0, '0.5~0.65': 0, '0.65~0.8': 0 };
misses.forEach((m) => {
  if (m.mx < 0.5) buckets['<0.5']++;
  else if (m.mx < 0.65) buckets['0.5~0.65']++;
  else buckets['0.65~0.8']++;
});
Object.entries(buckets).forEach(([k, v]) => console.log(`    ${k}: ${v} 道`));
console.log();
console.log('  题面被截断（含「截断」字样或长度异常）：');
misses.filter((m) => /截断|部分/.test(m.q._text)).forEach((m) => console.log(`    max=${m.mx.toFixed(2)}  ${m.q._text.slice(0, 50)}`));
