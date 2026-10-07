/**
 * 大样本量级 · 三档学生 · K 算出来是多少
 *
 * 跑法：node scripts/k-large-sample.mjs
 *
 * 量级依据（用户）：一个学期下来含练习册，单张练习册约 10 道简单题，
 *                 每周几张练习 → 学期总量 500 ~ 3000 道
 */

const W = { 简单: 0.1, 中等: 0.2, 困难: 0.7 };

// 按真实卷子配比 70/20/10 分配
function split(total) {
  return {
    简单: Math.round(total * 0.7),
    中等: Math.round(total * 0.2),
    困难: total - Math.round(total * 0.7) - Math.round(total * 0.2),
  };
}

function calc(correctByLevel, total) {
  const S = split(total);
  let num = 0, den = 0;
  for (const lv of ['简单', '中等', '困难']) {
    num += W[lv] * correctByLevel[lv];
    den += W[lv] * S[lv];
  }
  return num / den;
}

// 三档学生：各层的正确率（这才是稳定的个体特征）
const PROFILES = [
  { name: '厉害', desc: '难题 90% / 中等 95% / 简单 98%',
    r: { 简单: 0.98, 中等: 0.95, 困难: 0.90 } },
  { name: '普通', desc: '难题 15% / 中等 75% / 简单 95%',
    r: { 简单: 0.95, 中等: 0.75, 困难: 0.15 } },
  { name: '比较菜', desc: '难题 0% / 中等 40% / 简单 80%',
    r: { 简单: 0.80, 中等: 0.40, 困难: 0.00 } },
];

const TOTALS = [500, 1000, 2000, 3000];

console.log('='.repeat(82));
console.log('大样本量级 · 三档学生 · K（×100）');
console.log('='.repeat(82));
console.log('  权重：简单 0.1 / 中等 0.2 / 困难 0.7');
console.log('  配比：真实卷子 70% / 20% / 10%\n');

console.log('  学生        ' + TOTALS.map(t => `${t} 道`.padStart(9)).join(''));
console.log('  ' + '-'.repeat(78));

const table = [];
for (const p of PROFILES) {
  const row = TOTALS.map(t => {
    const S = split(t);
    const c = {
      简单: Math.round(S.简单 * p.r.简单),
      中等: Math.round(S.中等 * p.r.中等),
      困难: Math.round(S.困难 * p.r.困难),
    };
    const K = calc(c, t) * 100;
    table.push({ p, t, K, c, S });
    return K.toFixed(1).padStart(9);
  });
  console.log(`  ${p.name.padEnd(8)} ${row.join('')}`);
}

console.log('\n  三档跨度（最高 − 最低）');
const spreads = TOTALS.map((t, i) => {
  const vals = table.filter(x => x.t === t).map(x => x.K);
  return vals[0] - vals[2];
});
console.log('  ' + TOTALS.map((t, i) => `${t} 道`.padStart(9)).join(''));
console.log(`  ${spreads.map(s => s.toFixed(1).padStart(9)).join('')}`);

console.log('\n' + '='.repeat(82));
console.log('大样本下暴露的问题：中等层的权重被摊薄到什么程度');
console.log('='.repeat(82));
const t = 3000;
const S = split(t);
console.log(`  ${t} 道 → 简单 ${S.简单} / 中等 ${S.中等} / 困难 ${S.困难}`);
console.log(`  权重贡献占比：简单 ${(W.简单 * S.简单 / (W.简单*S.简单 + W.中等*S.中等 + W.困难*S.困难) * 100).toFixed(1)}%`);
console.log(`              　　中等 ${(W.中等 * S.中等 / (W.简单*S.简单 + W.中等*S.中等 + W.困难*S.困难) * 100).toFixed(1)}%`);
console.log(`              　　困难 ${(W.困难 * S.困难 / (W.简单*S.简单 + W.中等*S.中等 + W.困难*S.困难) * 100).toFixed(1)}%`);
console.log('\n  → 300 道以下时，难题的题数太少，单次对错能让 K 跳 14 分');
console.log('  → 3000 道时，同样一次对错只让 K 跳 1.4 分 —— 稳定，但要 300 次才动 14 分');

console.log('\n' + '='.repeat(82));
console.log('单次观测对 K 的影响（越低越稳）');
console.log('='.repeat(82));
for (const tt of [54, 500, 1000, 3000]) {
  const SS = split(tt);
  const den = W.简单*SS.简单 + W.中等*SS.中等 + W.困难*SS.困难;
  const impact = W.困难 / den * 100;
  console.log(`  ${String(tt).padStart(5)} 道　　一次困难题对错 → K 变动 ${impact.toFixed(2)} 分`);
}
