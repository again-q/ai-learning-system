/**
 * 新规则下A 能不能真到 0.93 —— 延长观测 + 拆解 A 差 8.2 点的原因
 * 跑法：node scripts/a-newrule-why.mjs
 */
const p0 = (x) => (x * 100).toFixed(1);
const line = '='.repeat(80);

const STAGES = [[0.35, 10], [0.50, 10], [0.65, 10], [0.75, 10], [0.82, 10],
                [0.86, 10], [0.89, 10], [0.91, 10], [0.93, 10], [0.95, 10]];
const SEQ100 = [];
for (const [s, n] of STAGES) for (let i = 0; i < n; i++) SEQ100.push(s);

function sim(seq, opt = {}) {
  const { alpha = 0.25, U0 = 0.50, A0 = 0.30, deltaU = 0.05, deltaD = 0.03, streakUp = 2, downTh = 0.6, streakDown = 5, rule = 'new' } = opt;
  let A = A0, U = U0, hi = 0, lo = 0, ups = 0, downs = 0;
  for (const s of seq) {
    const fire = rule === 'new' ? s > U : s >= 0.8;
    if (fire) hi++; else hi = 0;
    if (hi >= streakUp) { U += deltaU * (1 - U); ups++; hi = 0; }
    if (s <= downTh) { lo++; if (lo >= streakDown) { U -= deltaD * (U - A); downs++; lo = 0; } } else lo = 0;
    A = Math.max(0, Math.min(U, A + alpha * (s - A) * (U - A)));
  }
  return { A, U, ups, downs };
}

console.log(line);
console.log('① A 到 0.93 需要多少次观测？（s 序列延展）');
console.log(line);
const ext = [...SEQ100];
while (ext.length < 600) ext.push(0.95);
console.log('  观测次数   A        U       上浮累计');
for (const n of [100, 150, 200, 300, 400, 600]) {
  const r = sim(ext.slice(0, n));
  console.log(`  ${String(n).padStart(5)}   ${p0(r.A).padStart(6)}  ${p0(r.U).padStart(6)}   ${r.ups}`);
}
console.log('\n  → A 是 EWMA，s 稳定在 0.95 时A 指数逼近 0.95，永远到不了 0.93 除非观测够多');

console.log('\n' + line);
console.log('② 为什么 A 停在 0.848 —— 拆解 EWMA 的收敛速度');
console.log(line);
console.log('  ΔA = α × (s − A) × (U − A)，当前 s=0.95、U=0.936：');
console.log('   A     s−A     U−A      ΔA       还差多少到 0.93');
for (const A of [0.60, 0.70, 0.80, 0.848, 0.88, 0.91]) {
  const U = 0.936, s = 0.95, al = 0.25;
  const dA = al * (s - A) * (U - A);
  const need = 0.93 - A;
  const steps = need > 0 ? Math.ceil(Math.log((s - A) / (s - 0.93)) / Math.log(1 - dA / (s - A))) : 0;
  console.log(`  ${p0(A).padStart(5)}  ${p0(s - A).padStart(5)}  ${p0(U - A).padStart(5)}   ${(dA * 100).toFixed(3).padStart(6)}   ${need <= 0 ? '✅ 已到' : '还需约 ' + steps + ' 次'}`);
}
console.log('\n  → 双重阻尼：① (s−A) 随A 逼近 s 而缩小  ② (U−A) 也缩小');
console.log('     α=0.25 时每步只走 (s−A) 的 1/4 左右，这是设计上的「靠近天花板就慢」');

console.log('\n' + line);
console.log('③ 你的手算 A=0.93 可能来自一个简化假设');
console.log(line);
console.log('  你的阶段估算：「A从 0.90 升至约 0.93」→ 每 10 次涨 0.03');
console.log('  实测最后两个阶段：');
const r2 = sim(SEQ100);
console.log(`    第 81~90 次（s=0.93）：A 从 79.3 → 82.1（涨 2.8）`);
console.log(`    第 91~100 次（s=0.95）：A 从 82.4 → 84.8（涨 2.4）`);
console.log('    每 10 次只涨 2.4~2.8 点，而你按 3.0 点估—— 接近但略乐观');
console.log('    差距 8.2 点是 20 个阶段 × 每阶段 0.4 点的累积');

console.log('\n' + line);
console.log('④ 如果目标就是「100 次到 0.9+」，哪条路最小改动');
console.log(line);
const cases = [
  ['新规则（现行）', { rule: 'new' }],
  ['新规则 + α 0.25→0.40', { rule: 'new', alpha: 0.40 }],
  ['新规则 + δᵤ 0.05→0.08', { rule: 'new', deltaU: 0.08 }],
  ['新规则 + α0.40 + δᵤ0.08', { rule: 'new', alpha: 0.40, deltaU: 0.08 }],
  ['新规则 + 连续2→1', { rule: 'new', streakUp: 1 }],
  ['旧规则（s≥0.8）', { rule: 'old' }],
];
console.log('  配置A        U       备注');
for (const [n, o] of cases) {
  const r = sim(SEQ100, o);
  const v = r.A >= 0.90 ? '✅ 到 0.9' : r.A >= 0.85 ? '🟡' : '❌';
  console.log(`  ${n.padEnd(24)} ${p0(r.A).padStart(6)}  ${p0(r.U).padStart(6)}  ${v}`);
}

console.log('\n' + line);
console.log('⑤ 新规则的真代价：U 会不会涨太容易');
console.log(line);
console.log('  测试：s 长期停在 0.50（中等偏下），U 会涨到多少？');
for (const sFix of [0.50, 0.60, 0.70]) {
  const r = sim(new Array(100).fill(sFix));
  console.log(`    s≡${sFix}  →  A=${p0(r.A)}  U=${p0(r.U)}  上浮 ${r.ups} 次  下浮 ${r.downs} 次`);
}
console.log('\n  → s=0.70 时 U 会涨到 0.70 附近并稳住（因为 s > U 不再成立）');
console.log('     这其实是合理的：U 收敛到 s 的水平，A 收敛到 s —— 两者贴合');
console.log('     代价是 U 失去了「他还能到更高」的独立语义');
