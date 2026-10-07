/**
 * 权重比扫描：难题权重到底要多大才压得住简单题的全对
 *
 * 跑法：node scripts/k-weight-scan.mjs
 */

function rate(rows, W) {
  let num = 0, den = 0;
  for (const r of rows) num += W[r.d] * (r.ok ? r.n : 0), den += W[r.d] * r.n;
  return den > 0 ? num / den : null;
}
const pct = (x) => (x * 100).toFixed(1) + '%';

// 学生甲：简单题全对 15 道，困难题全错 2 道（明显该偏低）
const stuA = [
  { d: '简单', ok: true, n: 10 }, { d: '简单', ok: true, n: 5 },
  { d: '中等', ok: true, n: 4 }, { d: '困难', ok: false, n: 2 },
];
// 学生乙：实测真实形态
const stuB = [
  { d: '简单', ok: true, n: 8 }, { d: '中等', ok: true, n: 4 },
  { d: '中等', ok: false, n: 3 }, { d: '困难', ok: false, n: 2 },
];

const SCHEMES = [
  { name: '0.2/0.3/0.5', W: { 简单: 0.2, 中等: 0.3, 困难: 0.5 } },
  { name: '0.1/0.2/0.7', W: { 简单: 0.1, 中等: 0.2, 困难: 0.7 } },
  { name: '0.1/0.2/0.8', W: { 简单: 0.1, 中等: 0.2, 困难: 0.8 } },
  { name: '0.1/0.1/0.8', W: { 简单: 0.1, 中等: 0.1, 困难: 0.8 } },
  { name: '0.05/0.1/0.85', W: { 简单: 0.05, 中等: 0.1, 困难: 0.85 } },
];

console.log('='.repeat(74));
console.log('扫描 · 简单题全对 + 困难题全错（甲），K 应该被压到多低');
console.log('='.repeat(74));
console.log('  甲的作答：简单对 15 / 中等对 4 / 困难错 2（困难层 0/2 全错）\n');
console.log('  权重方案            简单:困难   甲的 K      判断');
console.log('  ' + '-'.repeat(70));
for (const s of SCHEMES) {
  const ratio = (s.W.困难 / s.W.简单).toFixed(0) + ' : 1';
  const K = rate(stuA, s.W);
  const judge = K < 0.5 ? '✅ 明显偏低' : K < 0.62 ? '🟡 勉强' : '⚠️ 偏高，学生会以为还行';
  console.log(`  ${s.name.padEnd(20)} ${ratio.padStart(7)}   ${pct(K).padStart(6)}     ${judge}`);
}

console.log('\n' + '='.repeat(74));
console.log('反向求解：困难权重要是简单权重的几倍，才能把甲压到 0.6 以下');
console.log('='.repeat(74));
// K = (15*w1 + 4*w2) / (15*w1 + 4*w2 + 2*w3) < 0.6  →  w3 > 6 + 1.6*w2/w1*...
const w2r = 0.2; // 中等/简单 比保持 2:1
for (const target of [0.5, 0.6, 0.7]) {
  // 解 (15 + 4*w2r) < target * (15 + 4*w2r + 2*w3)  求 w3
  const need = (15 + 4 * w2r) / target - (15 + 4 * w2r);
  console.log(`  要 K < ${target.toFixed(1)}　困难:简单 需 > ${(need / 2).toFixed(2)} : 1`);
}
console.log('\n  → 简单题 15 道、困难题 2 道（7.5 倍数量差）时，比值要到 8 以上才压得住 0.6');
console.log('  → 而权重比一旦超过 ~8，它已经等价于「只用困难题」，那不如直接排除');

console.log('\n' + '='.repeat(74));
console.log('排除法（不做加权平均）· 对照');
console.log('='.repeat(74));
function excludeEasy(rows) {
  let num = 0, den = 0;
  for (const r of rows) { if (r.d === '简单') continue; num += r.ok ? r.n : 0; den += r.n; }
  return den > 0 ? num / den : null;
}
console.log(`  甲（简单对15 中等对4 困难错2）排除简单题 → ${pct(excludeEasy(stuA))}`);
console.log(`  乙（真实形态）排除简单题              → ${pct(excludeEasy(stuB))}`);

console.log('\n' + '='.repeat(74));
console.log('两个口径下的读法对照');
console.log('='.repeat(74));
for (const [nm, stu] of [['甲', stuA], ['乙', stuB]]) {
  console.log(`\n  【${nm}】`);
  console.log(`    0.1/0.2/0.7 加权    ${pct(rate(stu, SCHEMES[1].W))}  →  可读成「这张卷子拿 ${(rate(stu, SCHEMES[1].W) * 100).toFixed(0)} 分」`);
  console.log(`    排除简单题          ${pct(excludeEasy(stu))}  →  可读成「这张卷子拿 ${(excludeEasy(stu) * 100).toFixed(0)} 分」（分母只有中等以上）`);
}
