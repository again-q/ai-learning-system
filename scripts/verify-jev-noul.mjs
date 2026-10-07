#!/usr/bin/env node
// ============ Jev noul 形式 · 真实语料验证（只读 DB + 真调 Jev） ============
//
// 验证三件事：
//   ① 跨单元题能否正确命中多个单元（choice 形式做不到）
//   ② 一题多知识点是否命中多个（原「主知识点」口径只能给一个）
//   ③ 成本是否比原方案便宜 10 倍以上（用户要求）
//
// 用法：node scripts/verify-jev-noul.mjs [--limit N]
import { find } from './db.mjs';
import { groupByChapter, createJevClient, matchByJev } from '../cloudfunctions/graphEngine/src/lib/jevMatch.js';

const KEY = process.env.OR_KEY;
const args = process.argv.slice(2);
const LIMIT = (() => { const i = args.indexOf('--limit'); return i >= 0 ? Number(args[i + 1]) : 12; })();
const L = '='.repeat(96);
const show = (t) => console.log('\n' + L + '\n  ' + t + '\n' + L);

// 原方案成本基准（方案文档 §4.3 实测）：DeepSeek 全清单直选
const OLD_COST_CNY = 0.0134;   // ¥/题（取区间下限，保守）

const nodes = find('knowledge_nodes', 1000, { knowledgeId: 1, name: 1, partition: 1, parentId: 1, path: 1 });
const groups = groupByChapter(nodes);
const byName = {}; nodes.forEach((n) => { const nm = String(n.name || '').trim(); if (nm && !byName[nm]) byName[nm] = n; });

const raw = find('questions', 1000);
const seen = new Set(); const qs = [];
for (const q of raw) {
  const t = String(q.questionText || '').replace(/\s+/g, ' ').trim();
  if (t.length <= 20) continue;
  const k = t.slice(0, 200); if (seen.has(k)) continue; seen.add(k);
  qs.push(Object.assign({}, q, { _text: t }));
}

show('一、候选结构');
console.log(`  图谱 ${nodes.length} 节点 → ${Object.keys(groups).length} 章，候选叶子共 ${new Set(Object.values(groups).flat()).size} 个`);
console.log(`  阈值 = 0.8（用户指定）`);
console.log(`  语料：去重后 ${qs.length} 道，本轮取前 ${Math.min(LIMIT, qs.length)} 道`);

const client = createJevClient({ apiKey: KEY });
let totCost = 0, totTok = 0, multi = 0, hitCnt = 0, unitMulti = 0;
const rows = [];

show(`二、逐题结果（前 ${Math.min(LIMIT, qs.length)} 道）`);
for (const q of qs.slice(0, LIMIT)) {
  let r = null, err = null, cost = 0;
  try {
    // 包一层统计成本：直接调 matchByJev，但客户端要能回传 usage → 用包装
    const wrapped = { ask: async (s, qs2) => { const res = await client.ask(s, qs2); if (res.usage) cost += Number(res.usage.cost || 0); return res; } };
    r = await matchByJev(wrapped, q._text.slice(0, 1200), groups, {});
  } catch (e) { err = e.message; }

  if (err) { console.log(`  ✖ ${err.slice(0, 70)}`); continue; }
  totCost += cost; totTok += 0;
  const nPts = r.points.length, nUni = r.units.length;
  if (nPts > 1) multi++;
  if (nPts > 0) hitCnt++;
  if (nUni > 1) unitMulti++;

  console.log(`  ${q._text.slice(0, 40).padEnd(42)} 单元${nUni} 知识点${nPts}`);
  if (nUni) console.log(`      单元: ${r.units.join(' + ')}`);
  if (nPts) {
    const top = Object.entries(r.pointProbs).filter(([, p]) => p >= 0.8).sort((a, b) => b[1] - a[1]).slice(0, 5);
    console.log(`      知识点: ${top.map(([n, p]) => `${n}(${p.toFixed(2)})`).join(' ')}`);
  } else if (r.reason) {
    console.log(`      ⚠️ ${r.reason}`);
  }
  rows.push({ q: q._text.slice(0, 60), units: r.units, points: r.points, cost });
}

show('三、汇总');
const n = rows.length;
const pct = (x) => `${(x / Math.max(1, n) * 100).toFixed(1)}%`;
console.log(`  可测题数                ${n}`);
console.log(`  有知识点命中             ${hitCnt}  ${pct(hitCnt)}`);
console.log(`  一题命中多个知识点         ${multi}  ${pct(multi)} ← 原「主知识点」口径结构上做不到`);
console.log(`  一题命中多个单元          ${unitMulti}  ${pct(unitMulti)} ← choice 形式会丢`);
console.log();
const avgCostUsd = totCost / Math.max(1, n);
const avgCostCny = avgCostUsd * 7.2;
console.log(`  平均成本/题             $${avgCostUsd.toFixed(6)} ≈ ¥${avgCostCny.toFixed(5)}`);
console.log(`  原方案基准/题            ¥${OLD_COST_CNY}（方案文档 §4.3 实测）`);
const ratio = OLD_COST_CNY / Math.max(1e-9, avgCostCny);
console.log(`  → 便宜 ${ratio.toFixed(1)} 倍  ${ratio >= 10 ? '✅ 达到「10 倍以上」要求' : '⚠️ 未达到 10 倍'}`);
