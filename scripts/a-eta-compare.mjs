/**
 * η 到底要不要进 A · 三种路径情况对照
 *
 * 跑法：node scripts/a-eta-compare.mjs
 *
 * 背景：非常规路径下「断段率 q」会失效——
 *       走另一条解法、段数更多但全通 → q = 1 满分
 *       而 η（路径质量）恰好能压它。
 */

const W_D = 0.5;            // 该知识点难度固定取 0.5 → (0.6+0.4D) = 0.8
const CAL = 0.6 + 0.4 * W_D;

function run(label, { P, 段, 断, eta }) {
  let A = 0.30, U = 0.65;
  let hiStreak = 0, lowStreak = 0;
  const trace = [];

  // 跑 20 次同样的观测，看稳定后落在哪
  for (let i = 0; i < 20; i++) {
    const q = 段 > 0 ? 1 - 断 / 段 : 1;
    const sNoEta = P * CAL * q;
    const sWithEta = P * CAL * q * eta;

    // 同时跑两条，独立的 streak
    const apply = (s, isWithEta) => {
      const st = trace[isWithEta ? 'w' : 'n'] || { A, U, hi: 0, lo: 0 };
      if (s >= 0.7) st.hi++; else st.hi = 0;
      if (st.hi >= 2) { st.U += 0.05 * (1 - st.U); st.hi = 0; }
      if (s <= 0.6) { st.lo++; if (st.lo >= 5) { st.U -= 0.03 * (st.U - st.A); st.lo = 0; } }
      else st.lo = 0;
      st.A = Math.max(0, Math.min(st.U, st.A + 0.13 * (s - st.A) * (st.U - st.A)));
      trace[isWithEta ? 'w' : 'n'] = st;
    };
    apply(sNoEta, false);
    apply(sWithEta, true);
  }
  return {
    label, P, 段, 断, eta,
    q: 段 > 0 ? 1 - 断 / 段 : 1,
    sNoEta: P * CAL * (1 - 断 / 段),
    sWithEta: P * CAL * (1 - 断 / 段) * eta,
    finalNoEta: trace.n.A, finalWithEta: trace.w.A,
  };
}

const pct = (x) => (x * 100).toFixed(1);
const line = '─'.repeat(84);

console.log('='.repeat(86));
console.log('η 该不该进 A · 三种路径情况');
console.log('='.repeat(86));
console.log('  设定：难度 D=0.5 → 难度校准 = 0.8　A₀=0.30  U₀=0.65  α=0.13  上浮门槛 s≥0.7');
console.log('  每个场景跑 20 次同样观测，看 A 稳定在哪\n');

const CASES = [
  { label: '① 标准路径 · 写得全',
    P: 0.9, 段: 5, 断: 0, eta: 0.95 },
  { label: '② 标准路径 · 漏一步',
    P: 0.7, 段: 4, 断: 1, eta: 0.90 },
  { label: '③ 非常规路径 · 换解法、段更多但全通',
    P: 0.9, 段: 8, 断: 0, eta: 0.50 },
  { label: '④ 非常规路径 · 只用两段就出来了',
    P: 1.0, 段: 2, 断: 0, eta: 0.45 },
  { label: '⑤ 暴力计算 · 通但绕远',
    P: 0.9, 段: 9, 断: 0, eta: 0.40 },
];

console.log(line);
console.log('  场景                    P    段/断    q      η      s(无η)  s(有η)   A(无η)  A(有η)');
console.log(line);
for (const c of CASES.map(c => run(c.label, c))) {
  console.log(`  ${c.label}`);
  console.log(`  ${' '.repeat(24)}${c.P.toFixed(2)}  ${String(c.段).padStart(2)}/${c.断}    ${c.q.toFixed(2)}   ${c.eta.toFixed(2)}   ${pct(c.sNoEta).padStart(6)}   ${pct(c.sWithEta).padStart(6)}   ${pct(c.finalNoEta).padStart(6)}  ${pct(c.finalWithEta).padStart(6)}`);
}
console.log(line);

console.log('\n' + '='.repeat(86));
console.log('关键问题：③④⑤ 这三种「不是问题」的情况，A 有没有冤枉它们');
console.log('='.repeat(86));
const odd = CASES.filter(c => c.断 === 0);
for (const c of odd.map(c => run(c.label, c))) {
  const wrong = c.finalNoEta > c.finalWithEta + 0.05;
  console.log(`  ${c.label}`);
  console.log(`     A(无η)=${pct(c.finalNoEta)}　A(有η)=${pct(c.finalWithEta)}　差 ${((c.finalNoEta - c.finalWithEta) * 100).toFixed(1)} 分`);
  console.log(`     ${wrong ? '⚠️  无η 把它当满分 → 冤枉了' : '✅  无η 也没冤枉'}`);
}

console.log('\n' + '='.repeat(86));
console.log('反向检查：η 会不会冤枉标准路径');
console.log('='.repeat(86));
for (const c of [CASES[0], CASES[1]].map(c => run(c.label, c))) {
  const gap = c.finalNoEta - c.finalWithEta;
  console.log(`  ${c.label}　A(无η)=${pct(c.finalNoEta)}　A(有η)=${pct(c.finalWithEta)}　差 ${gap.toFixed(1)} 分　${Math.abs(gap) < 3 ? '✅ 影响很小' : '⚠️ 罚太重'}`);
}

console.log('\n' + '='.repeat(86));
console.log('汇总');
console.log('='.repeat(86));
console.log('  无 η：③④⑤ 全部 q=1 满分 → A 分不出「写得对但路不同」和「照标准写」');
console.log('  有 η：③⑤ 被压到相近水平 → 区分得开，且不冤枉 ①②');
console.log('  → η 该进。而且它只压不抬（η ≤ 1），不会虚高。');
