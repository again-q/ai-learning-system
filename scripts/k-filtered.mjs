/**
 * 过滤版 K · 只算难度 ≥ 0.4 的题
 *
 * 跑法：node scripts/k-filtered.mjs
 *
 * 判据（用户）：难度 ≥ 0.4 才算；识别 + 初步运用 = 能把这个知识点写出来
 */

const W = { 中等: 0.2, 困难: 0.7 };   // 简单题被过滤掉了

function calc(rows) {
  let num = 0, den = 0;
  for (const r of rows) { num += W[r.d] * r.n; den += W[r.d] * r.total; }
  return den > 0 ? num / den : null;
}
const pct = (x) => (x * 100).toFixed(1) + '%';

// 一个学期，只过滤掉简单题后剩：中等 600 + 困难 300 = 900 道（按 3000 总量）
// 各档学生的正确率
const STUS = [
  { name: '厉害',   r: { 中等: 0.95, 困难: 0.90 } },
  { name: '普通',   r: { 中等: 0.75, 困难: 0.15 } },
  { name: '比较菜', r: { 中等: 0.40, 困难: 0.00 } },
  { name: '只做中等', r: { 中等: 1.00, 困难: null } },  // 难题一道没做
];

function build(totalMid, totalHard, rates) {
  const rows = [];
  if (rates.中等 != null) rows.push({ d: '中等', n: Math.round(totalMid * rates.中等), total: totalMid });
  if (rates.困难 != null) rows.push({ d: '困难', n: Math.round(totalHard * rates.困难), total: totalHard });
  else if (totalHard > 0) rows.push({ d: '困难', n: 0, total: 0 });   // 没做 → 不进分母
  return rows;
}

console.log('='.repeat(80));
console.log('过滤版 · 只算难度 ≥ 0.4 的题');
console.log('='.repeat(80));
console.log('  权重：中等 0.2 / 困难 0.7（简单题已过滤）');
console.log('  样本：一个学期 900 道（中等 600 / 困难 300）\n');

console.log('  学生        中等正确率  困难正确率   K × 100');
console.log('  ' + '-'.repeat(62));
for (const s of STUS) {
  const rows = build(600, 300, s.r);
  const midTxt = s.r.中等 != null ? `${(s.r.中等 * 100).toFixed(0)}% (${Math.round(600 * s.r.中等)}/600)` : '—';
  const hardTxt = s.r.困难 != null ? `${(s.r.困难 * 100).toFixed(0)}% (${Math.round(300 * s.r.困难)}/300)` : '0% (0/0)';
  console.log(`  ${s.name.padEnd(9)} ${midTxt.padEnd(16)} ${hardTxt.padEnd(15)} ${pct(calc(rows)).padStart(7)}`);
}

console.log('\n' + '='.repeat(80));
console.log('关键检验一 · 刷简单题还能刷高吗');
console.log('='.repeat(80));
console.log('  只做简单题 → 一道都不进分母 → 没有 K 值（不是 0，是「没有」）');
console.log('  这是过滤版的根本区别：过滤不是把简单题算成 0 分，是让它根本不参与\n');
console.log('  中等全对、难题一道没做：');
console.log(`    → ${pct(calc(build(600, 300, { 中等: 1.0, 困难: null })))}  ← 只按中等算，难题缺席`);
console.log('  中等全对、难题全错：');
console.log(`    → ${pct(calc(build(600, 300, { 中等: 1.0, 困难: 0.0 })))}`);

console.log('\n' + '='.repeat(80));
console.log('关键检验二 · 「难题没做」和「难题做错」现在区分开了');
console.log('='.repeat(80));
console.log('  过滤版下，难题没做 = 不进分母 = 该维度无观测');
console.log('  → 报告上应该显示「难题：样本不足」，而不是显示一个低分\n');
console.log('  对照：如果难题做错，它会真掉分：');
for (const hardRate of [1.0, 0.8, 0.5, 0.2, 0.0]) {
  const K = calc(build(600, 300, { 中等: 0.75, 困难: hardRate }));
  console.log(`    中等 75% + 困难 ${(hardRate * 100).toFixed(0)}%（${Math.round(300 * hardRate)}/300） → K = ${pct(K)}`);
}

console.log('\n' + '='.repeat(80));
console.log('关键检验三 · 权重还要不要这么偏');
console.log('='.repeat(80));
console.log('  过滤后简单题没了，剩余是中等 0.2 : 困难 0.7 = 1 : 3.5');
console.log('  如果过滤后还想保持「真实配比 20:10」，权重应该反过来 → 困难 0.2 中等 0.7？');
console.log('  但那会跟「难度越高权重越大」矛盾。这里有个取舍：');
console.log('\n  方案一：权重不动（中等 0.2 / 困难 0.7）→ 难题主导');
console.log('  方案二：按过滤后的实际题数（中等 2/3 / 困难 1/3）→ 等于难度又回到门槛');
console.log('\n  → 中等难度题数量是困难的 2 倍，过滤后它应该占更大权重才对');
console.log('  → 建议试一下「中等 0.6 / 困难 0.4」（接近数量反比，也保留难度更大权重更高）');

for (const [name, W2] of [['中等 0.2 / 困难 0.7', { 中等: 0.2, 困难: 0.7 }],
                          ['中等 0.6 / 困难 0.4', { 中等: 0.6, 困难: 0.4 }]]) {
  console.log(`\n  权重 ${name}`);
  for (const s of STUS.slice(0, 3)) {
    const rows = build(600, 300, s.r);
    let num = 0, den = 0;
    for (const r of rows) { num += W2[r.d] * r.n; den += W2[r.d] * r.total; }
    console.log(`    ${s.name.padEnd(7)} K = ${pct(num / den)}`);
  }
}
