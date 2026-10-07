#!/usr/bin/env node
// ============ 单元来源对比 v2（按真实 token 计费） ============
//
// v1 的成本是「按调用次数平均」估的 —— 错误：第二段的 input 与候选池大小成正比，
// 不同方案每次调用的成本差异极大，平均会高估小池子、低估大池子。
// v2 直接读 usage.input_tokens 计费（Jev：输入 $0.042/M，输出免费）。
//
// 用户 2026-10-06 的观点：「确实也考到了第三章的知识，只不过考的比较小」
//   → 单元不该只取第一段 top-1，要能包含「考得少但确实考了」的章节。
//
// 用法：node scripts/verify-unit-source.mjs [--limit N]
import { find } from './db.mjs';
import { groupByChapter, createJevClient, pickUnits, pickPoints } from '../cloudfunctions/graphEngine/src/lib/jevMatch.js';

const KEY = process.env.OR_KEY;
const args = process.argv.slice(2);
const LIMIT = (() => { const i = args.indexOf('--limit'); return i >= 0 ? Number(args[i + 1]) : 16; })();
const L = '='.repeat(96);
const show = (t) => console.log('\n' + L + '\n  ' + t + '\n' + L);

const OLD_COST_CNY = 0.0134;
const USD_CNY = 7.2;
const PER_M_INPUT = 0.042;      // $/M input（输出免费）

const nodes = find('knowledge_nodes', 1000, { knowledgeId: 1, name: 1, partition: 1, parentId: 1, path: 1 });
const groups = groupByChapter(nodes);
const chapters = Object.keys(groups);
const byName = {}; nodes.forEach((n) => { const nm = String(n.name || '').trim(); if (nm && !byName[nm]) byName[nm] = n; });
const chapterOf = (nm) => { const n = byName[nm]; return n && Array.isArray(n.path) ? n.path[2] : null; };

const raw = find('questions', 1000);
const seen = new Set(); const qs = [];
for (const q of raw) {
  const t = String(q.questionText || '').replace(/\s+/g, ' ').trim();
  if (t.length <= 20) continue;
  const k = t.slice(0, 200); if (seen.has(k)) continue; seen.add(k);
  qs.push(Object.assign({}, q, { _text: t }));
}
const sample = qs.slice(0, LIMIT);

const base = createJevClient({ apiKey: KEY });
/** 每次调用累计 input_tokens（用于精确计费） */
function mkClient() {
  const st = { tokens: 0 };
  return {
    st,
    ask: async (s, q) => {
      const r = await base.ask(s, q);
      if (r.usage) st.tokens += Number(r.usage.input_tokens || r.usage.prompt_tokens || 0);
      return r;
    },
  };
}

const VARIANTS = {
  A: '池=top1  单元=第一段 top1',
  B: '池=top1  单元=第二段命中折章',
  C: '池=top3  单元=第二段命中折章',
  D: '池=全部  单元=第二段命中折章',
  E: '池=top3  单元=top1 ∪ 第二段命中折章',
  F: '池=全部  单元=top1 ∪ 第二段命中折章',
  G: '池=top2  单元=top1 ∪ 第二段命中折章',
  H: '池=top2  单元=第二段命中折章',
};
const agg = {};
Object.keys(VARIANTS).forEach((k) => { agg[k] = { hit: 0, units: 0, cost: 0, rN: 0, rD: 0, split: 0, single: 0 }; });

show(`一、对比方案（前 ${sample.length} 道，每道独立计费）`);
Object.entries(VARIANTS).forEach(([k, v]) => console.log(`  ${k}. ${v}`));

for (const q of sample) {
  const truth = new Set();
  (q.knowledgeUsage || []).forEach((u) => { const ch = chapterOf(String(u.name || '').trim()); if (ch) truth.add(ch); });
  const text = q._text.slice(0, 1200);

  // --- 每方案独立跑一遍，独立计费 ---
  const run = async (poolMode, unitMode) => {
    const c = mkClient();
    const s1 = await pickUnits(c, text, chapters);
    const ranked = Object.entries(s1.probs).filter(([, v]) => v != null).sort((a, b) => b[1] - a[1]);
    const top1 = ranked.length ? [ranked[0][0]] : [];
    const top3 = ranked.slice(0, 3).map(([k]) => k);
    const top2 = ranked.slice(0, 2).map(([k]) => k);
    const chs = poolMode === 'top1' ? top1 : (poolMode === 'top2' ? top2 : (poolMode === 'top3' ? top3 : chapters));
    const pool = Array.from(new Set(chs.flatMap((x) => groups[x] || [])));
    const s2 = await pickPoints(c, text, pool);
    const fromPoints = new Set(s2.points.map(chapterOf).filter(Boolean));
    let units;
    if (unitMode === 'stage1') units = new Set(top1);
    else if (unitMode === 'stage2') units = fromPoints;
    else units = new Set([...top1, ...fromPoints]);     // union
    return { units, tokens: c.st.tokens };
  };

  const res = {
    A: await run('top1', 'stage1'),
    B: await run('top1', 'stage2'),
    C: await run('top3', 'stage2'),
    D: await run('all', 'stage2'),
    E: await run('top3', 'union'),
    G: await run('top2', 'union'),
    H: await run('top2', 'stage2'),
    F: await run('all', 'union'),
  };

  for (const [k, r] of Object.entries(res)) {
    const a = agg[k];
    if (r.units.size) a.hit++;
    a.units += r.units.size;
    a.cost += r.tokens * PER_M_INPUT / 1e6;
    if (truth.size) {
      truth.forEach((t) => { a.rD++; if (r.units.has(t)) a.rN++; });
      if (truth.size === 1) { a.single++; if (r.units.size > 1) a.split++; }
    }
  }
}

show('二、结果（成本按真实 input_tokens 计）');
console.log('  方案                          不漏率  平均单元  真实单元召回  单单元被切   成本/题        相对原方案');
for (const [k, desc] of Object.entries(VARIANTS)) {
  const a = agg[k]; const n = sample.length;
  const cny = a.cost / n * USD_CNY;
  console.log('  ' + (k + '. ' + desc).padEnd(30)
    + String((a.hit / n * 100).toFixed(0) + '%').padStart(6) + '  '
    + (a.units / n).toFixed(2).padStart(6) + '    '
    + String(a.rD ? (a.rN / a.rD * 100).toFixed(0) + '%' : '—').padStart(8) + '      '
    + String(a.split + '/' + a.single).padStart(8) + '    '
    + ('¥' + cny.toFixed(5)).padStart(10) + '   '
    + (OLD_COST_CNY / Math.max(1e-9, cny)).toFixed(1) + 'x');
}

show('三、说明');
console.log(`
  · 「真实单元召回」对照 AI 当时写的知识点折出的章节（**含工具章**，
    因为用户认为「区间表示法」这类也算考到了，只是分量小）
  · 「单单元被切」= 真实只涉及 1 章的题被切成多单元（会让 A 记到不该记的单元）
  · 原方案基准 ¥${OLD_COST_CNY}/题；用户要求「便宜 10 倍以上」= 需 < ¥${(OLD_COST_CNY / 10).toFixed(4)}
`);
