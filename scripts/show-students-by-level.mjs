#!/usr/bin/env node
/**
 * 直观对照：不同水平的学生，两套公式分别显示成什么
 *
 * 用"做题人"的视角，不用统计指标。
 * 每类学生都做一批"符合他水平"的题，看 A 收敛到哪、读作什么难度。
 *
 * 用法：node scripts/show-students-by-level.mjs
 */
const L = [
  { L: 1, lo: 0.01, hi: 0.15, nm: '送分题' }, { L: 2, lo: 0.15, hi: 0.30, nm: '送分→简单' },
  { L: 3, lo: 0.30, hi: 0.45, nm: '简单题' }, { L: 4, lo: 0.45, hi: 0.60, nm: '中下题' },
  { L: 5, lo: 0.60, hi: 0.70, nm: '中档题' }, { L: 6, lo: 0.70, hi: 0.79, nm: '中档→中上' },
  { L: 7, lo: 0.79, hi: 0.85, nm: '中上题' }, { L: 8, lo: 0.85, hi: 0.90, nm: '较难题' },
  { L: 9, lo: 0.90, hi: 0.94, nm: '较难→极难' },
];
function toLambda(D) {
  const d = Math.max(0.01, Math.min(0.94, D));
  for (const x of L) if (d >= x.lo && d < x.hi) return (x.L - 1) + (d - x.lo) / (x.hi - x.lo);
  return 9;
}
function toD(lam) {
  const l = Math.max(0, Math.min(9, lam));
  const i = Math.min(L.length - 1, Math.floor(l));
  return L[i].lo + (l - i) * (L[i].hi - L[i].lo);
}
function lamToLabel(lam) {
  const i = Math.min(L.length - 1, Math.floor(lam));
  const frac = lam - i;
  return `L${L[i].L} ${L[i].nm}${frac > 0.05 ? `（档内 ${(frac * 100).toFixed(0)}%）` : ''}`;
}
const logit = (p) => Math.log(p / (1 - p));
const DENOM = 9.2;

// ══════════════════════════════════════════════════════
// 两类学生：由"他能稳定做对什么难度"定义
// ══════════════════════════════════════════════════════
// 做题模型：学生对难度 D 的题，过程分 P 由他的真实水平决定
// P(真实水平 θ, 难度 D) = sigmoid((θ - D) / 0.12)   ← 越难越低
const trueP = (theta, D) => 1 / (1 + Math.exp((D - theta) / 0.12));

// 学生画像：真实水平 θ（在 D 轴上）
const STUDENTS = [
  { nm: '基础生', theta: 0.45, desc: '能稳做中下题，中档题吃力' },
  { nm: '中等生', theta: 0.62, desc: '能稳做中档题，中上题吃力' },
  { nm: '中上生', theta: 0.75, desc: '能稳做中上题，较难题吃力' },
  { nm: '优等生', theta: 0.86, desc: '能稳做较难题，压轴吃力' },
  { nm: '你的水平', theta: 0.83, desc: '（用你实际数据推的水平）' },
];

// 每个学生的题单：从 θ-0.25 到 θ+0.15，每档若干题
function makeBatch(theta) {
  const qs = [];
  for (const lv of L) {
    const D = (lv.lo + lv.hi) / 2;
    if (D < theta - 0.30 || D > theta + 0.18) continue;
    for (let r = 0; r < 4; r++) {
      // 加一点随机性（固定种子，可复现）
      const noise = Math.sin((lv.L * 7 + r * 13)) * 0.06;
      qs.push({ D, P: Math.max(0, Math.min(1, trueP(theta, D) + noise)) });
    }
  }
  return qs;
}

// ══════════════════════════════════════════════════════
// D 轴引擎
// ══════════════════════════════════════════════════════
function runD(qs, cfg = {}) {
  const { k = 3, s0 = 0.10, p_t = 0.80, alpha = 0.1, delta_d = 0.03, k_low = 3, P_c = 0.6, a_u = 0.75 } = cfg;
  let A = 0.30, U = 0.50, n = 0;
  const E = (D, A, U) => { const s = (U - A) / 2 + s0, m = A - (s / k) * logit(1 - p_t); return 1 / (1 + Math.exp(k * (D - m) / s)); };
  for (const q of qs) {
    const e = E(q.D, A, U);
    A = Math.min(U, Math.max(0, A + alpha * (q.P - e)));
    if (q.D > U && q.P >= P_c) { const g = a_u + (1 - a_u) * ((q.P - P_c) / (1 - P_c)); const c = q.D * g; if (c > U) U = c; n = 0; }
    else if (q.D < A && q.P < P_c) { n++; if (n >= k_low) { U = Math.max(A, U - delta_d * (U - A)); n = 0; } }
    else n = 0;
  }
  return { A, U };
}
// ══════════════════════════════════════════════════════
// λ 轴引擎
// ══════════════════════════════════════════════════════
function runL(qs, cfg = {}) {
  const { k = 3, s0 = 0.35, p_t = 0.80, alpha = 0.9, delta_d = 0.03, k_low = 3, P_c = 0.6, a_u = 0.75 } = cfg;
  let lA = toLambda(0.30), lU = toLambda(0.50), n = 0;
  const E = (lD, lA, lU) => { const s = (lU - lA) / 2 + s0, m = lA - (s / k) * logit(1 - p_t); return 1 / (1 + Math.exp(k * (lD - m) / s)); };
  for (const q of qs) {
    const lD = toLambda(q.D);
    const e = E(lD, lA, lU);
    lA = Math.min(lU, Math.max(0, lA + alpha * (q.P - e)));
    const dA = toD(lA), dU = toD(lU);   // ★ 修正：正确反映射
    if (q.D > dU && q.P >= P_c) { const g = a_u + (1 - a_u) * ((q.P - P_c) / (1 - P_c)); const c = toLambda(Math.min(0.94, q.D * g)); if (c > lU) lU = c; n = 0; }
    else if (q.D < dA && q.P < P_c) { n++; if (n >= k_low) { lU = Math.max(lA, lU - delta_d * (lU - lA)); n = 0; } }
    else n = 0;
  }
  return { lamA: lA, lamU: lU, A: lA / DENOM, U: lU / DENOM };
}

console.log('='.repeat(96));
console.log('  不同水平的学生，两套公式分别显示成什么');
console.log('='.repeat(96));
console.log('\n  说明：每个学生做一批"符合他水平"的题（比他水平低一档到高一档），跑完整更新');
console.log('       看最终 A 落在哪，以及这个 A 该怎么读给学生听\n');

console.log('  学生      真实水平   │  D 轴方案                      │  λ 轴方案');
console.log('            （D 值）    │  A     读作"能做的难度"         │  A     读作"能到哪一档"');
console.log('  ' + '-'.repeat(92));
for (const st of STUDENTS) {
  const qs = makeBatch(st.theta);
  const d = runD(qs);
  const l = runL(qs);
  const dRead = `D=${d.A.toFixed(2)} → ${(L.find((x) => d.A >= x.lo && d.A < x.hi) || L[8]).nm}`;
  const lRead = lamToLabel(l.lamA);
  console.log(`  ${st.nm.padEnd(10)} ${st.theta.toFixed(2)}       │  ${d.A.toFixed(3)}  ${dRead.padEnd(24)} │  ${l.A.toFixed(3)}  ${lRead}`);
}

console.log('\n' + '='.repeat(96));
console.log('  关键对照：从"基础生"到"优等生",两套方案的读数变化');
console.log('='.repeat(96));
const base = runD(makeBatch(0.45)), baseL = runL(makeBatch(0.45));
console.log('\n  学生      真实水平 │  D 轴 A   相对基础生 │  λ 轴 A   相对基础生');
console.log('  ' + '-'.repeat(76));
for (const st of STUDENTS.slice(0, 4)) {
  const d = runD(makeBatch(st.theta)), l = runL(makeBatch(st.theta));
  const dd = d.A - base.A, dl = l.A - baseL.A;
  console.log(`  ${st.nm.padEnd(10)} ${st.theta.toFixed(2)}    │  ${d.A.toFixed(3)}    +${dd.toFixed(3)}      │  ${l.A.toFixed(3)}    +${dl.toFixed(3)}`);
}

console.log('\n' + '='.repeat(96));
console.log('  这一点最关键：高分段学生"从较难到极难"的进步，两套方案各显示多少');
console.log('='.repeat(96));
console.log('\n  场景：一个学生把水平从"稳做较难题（L8）"提到"稳做压轴（L9）"');
console.log('       这在他的世界里是【跨了一个大台阶】，看两套方案给他多少读数\n');
console.log('  水平变化              │  D 轴读数变化          │  λ 轴读数变化');
console.log('  ' + '-'.repeat(80));
for (const [from, to, label] of [[0.45, 0.55, '基础→中下'], [0.55, 0.65, '中下→中档'], [0.65, 0.75, '中档→中上'], [0.75, 0.85, '中上→较难'], [0.85, 0.92, '较难→压轴']]) {
  const a = runD(makeBatch(from)), b = runD(makeBatch(to));
  const la = runL(makeBatch(from)), lb = runL(makeBatch(to));
  const dd = b.A - a.A, dl = lb.A - la.A;
  const flag = (dd < 0.05 && dl > 0.05) ? '  ← D 轴几乎不动' : '';
  console.log(`  ${label.padEnd(20)} │  +${dd.toFixed(3)}                 │  +${dl.toFixed(3)}${flag}`);
}

console.log('\n' + '='.repeat(96));
console.log('  你的学生（用线上 17 题实跑）');
console.log('='.repeat(96));
console.log('\n  （见前一轮：D 轴 A=0.680 / λ 轴 A=0.550，读作 L6 中档→中上）');
