/**
 * 一个学期的量级 · 三档学生 · K 算出来是多少
 *
 * 跑法：node scripts/k-semester-scale.mjs
 *
 * 权重来自：真实卷子配比 简单 70% / 中等 20% / 困难 10% → 反过来
 *        简单 0.1 / 中等 0.2 / 困难 0.7
 */

const W = { 简单: 0.1, 中等: 0.2, 困难: 0.7 };

// 一个学期：18 周，每周 3 道解答题 ≈ 54 道
// 按真实卷子配比分配：简单 38 / 中等 11 / 困难 5
const SEMESTER = { 简单: 38, 中等: 11, 困难: 5 };

function calc(correctByLevel) {
  let num = 0, den = 0;
  for (const lv of ['简单', '中等', '困难']) {
    num += W[lv] * correctByLevel[lv];
    den += W[lv] * SEMESTER[lv];
  }
  return num / den;
}

// 三档学生：按各层答对题数
const STUS = [
  {
    name: '厉害',
    desc: '难题基本能做，中档稳，简单不丢',
    c: { 简单: 38, 中等: 10, 困难: 5 },
    read: '一套真实配比的卷子，难题那 10 分他基本拿满',
  },
  {
    name: '普通',
    desc: '简单全对、中档大部分对、难题做不动',
    c: { 简单: 38, 中等: 8, 困难: 1 },
    read: '中档掉了一点，难题基本丢',
  },
  {
    name: '比较菜',
    desc: '简单也丢、中档飘、难题全错',
    c: { 简单: 30, 中等: 4, 困难: 0 },
    read: '难题全丢，中档丢一半',
  },
];

console.log('='.repeat(80));
console.log('一个学期的量级 · 三档学生');
console.log('='.repeat(80));
console.log(`  权重：简单 0.1 / 中等 0.2 / 困难 0.7   （配比来自真实卷子 7:2:1，反过来）`);
console.log(`  一个学期 18 周 × 每周 3 道 = ${SEMESTER.简单 + SEMESTER.中等 + SEMESTER.困难} 道`);
console.log(`  按真实配比分配：简单 ${SEMESTER.简单} / 中等 ${SEMESTER.中等} / 困难 ${SEMESTER.困难}\n`);

console.log('  ' + '-'.repeat(76));
console.log('  学生      简单      中等      困难      K × 100    读法');
console.log('  ' + '-'.repeat(76));

for (const s of STUS) {
  const K = calc(s.c);
  const row = [s.c.简单, s.c.中等, s.困难]
    .map((n, i) => `${String(n).padStart(2)}/${String(SEMESTER[['简单', '中等', '困难'][i]]).padStart(2)}`)
    .map(x => x.padStart(9)).join(' ');
  console.log(`  ${s.name.padEnd(7)} ${row}    ${(K * 100).toFixed(1).padStart(5)}    ${s.read}`);
}

console.log('\n' + '='.repeat(80));
console.log('区分度检验');
console.log('='.repeat(80));
const vals = STUS.map(s => calc(s.c) * 100);
const spread = vals[0] - vals[2];
console.log(`  厉害 ${vals[0].toFixed(1)}　普通 ${vals[1].toFixed(1)}　比较菜 ${vals[2].toFixed(1)}`);
console.log(`  最高最低跨度：${spread.toFixed(1)} 分　→ ${spread > 30 ? '✅ 区分度充足' : '⚠️ 区分度不足'}`);
console.log(`\n  对照：如果用「等权」（简单=中等=困难=1）`);
for (const s of STUS) {
  let num = 0, den = 0;
  for (const lv of ['简单', '中等', '困难']) { num += s.c[lv]; den += SEMESTER[lv]; }
  console.log(`    ${s.name.padEnd(7)} 等权 K = ${(num / den * 100).toFixed(1)} 分`);
}
console.log(`  → 等权的跨度只有 ${((vals[0] / (STUS[0].c.简单 + STUS[0].c.中等 + STUS[0].c.困难) * 54) * 100 - (vals[2] / (STUS[2].c.简单 + STUS[2].c.中等 + STUS[2].c.困难) * 54) * 100).toFixed(1)} 分量级，且「厉害」和「普通」几乎分不开`);

// 边界：全对 / 全错
console.log('\n' + '='.repeat(80));
console.log('边界检查');
console.log('='.repeat(80));
console.log(`  全对（54/54）              K = ${(calc({ 简单: 38, 中等: 11, 困难: 5 }) * 100).toFixed(1)} 分`);
console.log(`  简单全对 中等全对 困难全错  K = ${(calc({ 简单: 38, 中等: 11, 困难: 0 }) * 100).toFixed(1)} 分`);
console.log(`  简单全对 中等全错 困难全错  K = ${(calc({ 简单: 38, 中等: 0, 困难: 0 }) * 100).toFixed(1)} 分`);
console.log(`  全错                       K = 0.0 分`);
