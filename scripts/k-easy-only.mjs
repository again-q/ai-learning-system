/**
 * 只刷简单题能把 K 刷到多高 · 难题的边际成本
 *
 * 跑法：node scripts/k-easy-only.mjs
 */

const W = { 简单: 0.1, 中等: 0.2, 困难: 0.7 };

function kOf(easy, mid, hard) {
  const num = W.简单 * easy.ok + W.中等 * mid.ok + W.困难 * hard.ok;
  const den = W.简单 * easy.n  + W.中等 * mid.n  + W.困难 * hard.n;
  return den > 0 ? num / den : null;
}
const lvl = (ok, n) => ({ ok, n });
const pct = (x) => (x * 100).toFixed(1) + '%';

console.log('='.repeat(76));
console.log('测试一 · 一个学生只做简单题，而且全做对');
console.log('='.repeat(76));
for (const n of [10, 100, 500, 2100]) {
  const K = kOf(lvl(n, n), lvl(0, 0), lvl(0, 0));
  console.log(`  做 ${String(n).padStart(4)} 道简单题，全对　　K = ${pct(K)}`);
}
console.log('\n  → K 直接顶到 100。完全不做难题，K 也是满分。');
console.log('  → 也就是说：这套口径无法区分「全会」和「只刷简单题」。');

console.log('\n' + '='.repeat(76));
console.log('测试二 · 做 N 道简单题全对 + M 道难题全错，K 是多少');
console.log('='.repeat(76));
console.log('  简单题      难题      K        读法');
console.log('  ' + '-'.repeat(70));
for (const [e, h] of [[100,10],[100,20],[100,50],[100,100],[2100,100],[2100,300],[2100,600],[2100,2100]]) {
  const K = kOf(lvl(e, e), lvl(0, 0), lvl(0, h));
  const ratio = h === 0 ? '—' : `1 : ${(e / h).toFixed(0)}`;
  console.log(`  ${String(e).padStart(6)}     ${String(h).padStart(5)}    ${pct(K).padStart(6)}    难题占比 1:${ratio}`);
}

console.log('\n' + '='.repeat(76));
console.log('测试三 · 难题要多少，才能把一个刷满简单题的人压下来');
console.log('='.repeat(76));
for (const target of [0.8, 0.7, 0.6, 0.5]) {
  // 0.1*Ne < target*(0.1*Ne + 0.7*Nh)  →  Nh > 0.1*Ne*(1-target)/(0.7*target)
  const k = (n) => 0.1 * n / (0.1 * n + 0.7 * m(n));
  function m(ne) { return 0.1 * ne * (1 - target) / (0.7 * target); }
  for (const ne of [100, 500, 2100]) {
    const need = m(ne);
    console.log(`  ${String(ne).padStart(4)} 道简单题全对 → 要 K 低于 ${(target*100).toFixed(0)} 分，需做 ${Math.ceil(need)} 道难题全错　（比例 1:${(ne/need).toFixed(0)}）`);
  }
  console.log('');
}

console.log('='.repeat(76));
console.log('测试四 · 对照：如果简单题也参与「难度分布」的假设成立');
console.log('='.repeat(76));
console.log('  上面的计算假设：权重固定 0.1/0.2/0.7，实际配比由学生刷什么决定。');
console.log('  所以刷简单题 = 把难题那 70% 的位置空着，只用 30% 的权重在算。');
console.log('  → 这正是「刷简单题虚高」的机制：不是权重错了，是分母里没有难题。');
