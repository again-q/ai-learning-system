#!/usr/bin/env node
/**
 * 构造一个"进步型"学生，看两套方案如何显示他的成长
 *
 * 学生画像（用户指定）：
 *   阶段 1（题 1-10）：中档题为主，偶有失误 —— 只是个中等生
 *   阶段 2（题 11-25）：开始稳定做对较难题（L8），但仍会错
 *   阶段 3（题 26-40）：L8 稳定了，时不时还能做出 L9（压轴）
 *
 * 看两套方案（D 轴 / λ 轴）在这个过程中的读数变化。
 *
 * 用法：node scripts/show-progress-student.mjs
 */
const L = [
  { L: 1, lo: 0.01, hi: 0.15, nm: '送分题' }, { L: 2, lo: 0.15, hi: 0.30, nm: '送分→简单' },
  { L: 3, lo: 0.30, hi: 0.45, nm: '简单题' }, { L: 4, lo: 0.45, hi: 0.60, nm: '中下题' },
  { L: 5, lo: 0.60, hi: 0.70, nm: '中档题' }, { L: 6, lo: 0.70, hi: 0.79, nm: '中档→中上' },
  { L: 7, lo: 0.79, hi: 0.85, nm: '中上题' }, { L: 8, lo: 0.85, hi: 0.90, nm: '较难题' },
  { L: 9, lo: 0.90, hi: 0.94, nm: '较难→极难（压轴）' },
];
const toLambda = (D) => { const d = Math.max(0.01, Math.min(0.94, D)); for (const x of L) if (d >= x.lo && d < x.hi) return (x.L - 1) + (d - x.lo) / (x.hi - x.lo); return 9; };
const toD = (l) => { const x = Math.max(0, Math.min(9, l)); const i = Math.min(L.length - 1, Math.floor(x)); return L[i].lo + (x - i) * (L[i].hi - L[i].lo); };
const lab = (l) => { const x = Math.max(0, Math.min(9, l)); const i = Math.min(L.length - 1, Math.floor(x)); const f = x - i; return `L${L[i].L} ${L[i].nm}${f > 0.05 ? `（档内${(f * 100).toFixed(0)}%）` : ''}`; };
const logit = (p) => Math.log(p / (1 - p));
const DENOM = 9.2;

// ══════════════════════════════════════════════════
// 学生题单（构造）
// ══════════════════════════════════════════════════
// 格式：[D, P, 说明]
const BATCH = [
  // ── 阶段 1：中等生（中档题为主，P 在 0.7~0.9 波动，偶尔失手）──
  [0.55, 0.85, '中下题，做对'], [0.62, 0.80, '中档，做对'], [0.65, 0.60, '中档，半对'],
  [0.68, 0.85, '中档，做对'], [0.65, 0.30, '中档，失手'], [0.72, 0.70, '中上，做出大半'],
  [0.75, 0.60, '中上，半对'], [0.70, 0.90, '中上，做对'], [0.65, 0.80, '中档，做对'],
  [0.78, 0.55, '中上，没做完'],
  // ── 阶段 2：开始能做较难题（L8），但不稳 ──
  [0.85, 0.75, '较难，大半做出'], [0.88, 0.60, '较难，一半'], [0.86, 0.85, '较难，做出来了'],
  [0.87, 0.40, '较难，卡住'], [0.85, 0.90, '较难，做出来了'], [0.89, 0.70, '较难，大半'],
  [0.88, 0.85, '较难，做出来了'], [0.90, 0.50, '压轴，做一半'], [0.86, 0.80, '较难，做出来'],
  [0.87, 0.75, '较难，大半'], [0.85, 0.88, '较难，做出来'], [0.88, 0.60, '较难，一半'],
  [0.89, 0.82, '较难，做出来'], [0.86, 0.78, '较难，大半'], [0.87, 0.85, '较难，做出来'],
  // ── 阶段 3：L8 稳定，时不时到 L9 ──
  [0.87, 0.90, '较难，做出来'], [0.88, 0.88, '较难，做出来'], [0.86, 0.92, '较难，做出来'],
  [0.90, 0.75, '压轴，做出大半'], [0.87, 0.90, '较难，做出来'], [0.92, 0.70, '压轴，做出大半'],
  [0.88, 0.95, '较难，完整做出'], [0.91, 0.80, '压轴，做出来'], [0.87, 0.92, '较难，做出来'],
  [0.93, 0.65, '压轴，一半多'], [0.88, 0.90, '较难，做出来'], [0.90, 0.85, '压轴，做出来'],
  [0.87, 0.95, '较难，完整做出'], [0.92, 0.78, '压轴，做出来'], [0.89, 0.90, '较难，做出来'],
];

// ══════════════════════════════════════════════════
function makeD(cfg = {}) {
  const { k = 3, s0 = 0.10, p_t = 0.80, alpha = 0.1, delta_d = 0.03, k_low = 3, P_c = 0.6, a_u = 0.75 } = cfg;
  let A = 0.30, U = 0.50, n = 0; const tr = [];
  const E = (D) => { const s = (U - A) / 2 + s0, m = A - (s / k) * logit(1 - p_t); return 1 / (1 + Math.exp(k * (D - m) / s)); };
  return { get A() { return A; }, get U() { return U; }, get tr() { return tr; },
    step(D, P) {
      const e = E(D);
      A = Math.min(U, Math.max(0, A + alpha * (P - e)));
      let act = '';
      if (D > U && P >= P_c) { const g = a_u + (1 - a_u) * ((P - P_c) / (1 - P_c)); const c = D * g; if (c > U) { U = c; act = 'U↑'; } n = 0; }
      else if (D < A && P < P_c) { n++; if (n >= k_low) { U = Math.max(A, U - delta_d * (U - A)); n = 0; act = 'U↓'; } }
      else n = 0;
      tr.push({ D, P, e, A, U, act });
    } };
}
function makeL(cfg = {}) {
  const { k = 3, s0 = 0.35, p_t = 0.80, alpha = 0.9, delta_d = 0.03, k_low = 3, P_c = 0.6, a_u = 0.75 } = cfg;
  let lA = toLambda(0.30), lU = toLambda(0.50), n = 0; const tr = [];
  const E = (lD) => { const s = (lU - lA) / 2 + s0, m = lA - (s / k) * logit(1 - p_t); return 1 / (1 + Math.exp(k * (lD - m) / s)); };
  return { get lA() { return lA; }, get lU() { return lU; }, get A() { return lA / DENOM; }, get U() { return lU / DENOM; }, get tr() { return tr; },
    step(D, P) {
      const lD = toLambda(D);
      const e = E(lD);
      lA = Math.min(lU, Math.max(0, lA + alpha * (P - e)));
      const dA = toD(lA), dU = toD(lU);
      let act = '';
      if (D > dU && P >= P_c) { const g = a_u + (1 - a_u) * ((P - P_c) / (1 - P_c)); const c = toLambda(Math.min(0.94, D * g)); if (c > lU) { lU = c; act = 'U↑'; } n = 0; }
      else if (D < dA && P < P_c) { n++; if (n >= k_low) { lU = Math.max(lA, lU - delta_d * (lU - lA)); n = 0; act = 'U↓'; } }
      else n = 0;
      tr.push({ D, P, lD, e, lA, lU, A: lA / DENOM, U: lU / DENOM, act });
    } };
}

console.log('='.repeat(100));
console.log('  进步型学生：一个中等生 → 能做较难题 → 时不时到压轴');
console.log('='.repeat(100));
console.log('\n  题单：40 道（阶段1 中等、阶段2 开始做较难、阶段3 较难稳定+偶尔压轴）\n');
console.log('  阶段     题号    这段的题在什么难度        他大概做到什么程度');
console.log('  ' + '-'.repeat(84));
console.log('  阶段1    1-10   中下~中上（D 0.55~0.78）   P 在 0.3~0.9 波动（不稳）');
console.log('  阶段2    11-25  较难（D 0.85~0.90）        P 0.4~0.9（开始能做，仍不稳）');
console.log('  阶段3    26-40  较难+压轴（D 0.86~0.93）   P 0.65~0.95（稳定了）');

const eD = makeD(); const eL = makeL();
console.log('\n' + '='.repeat(100));
console.log('  每道题之后，两套方案显示什么');
console.log('='.repeat(100));
console.log('\n  #    D     P     阶段 │ D轴: A      读作        │ λ轴: A      读作');
console.log('  ' + '-'.repeat(94));
const marks = [10, 25, 40];
BATCH.forEach(([D, P], i) => {
  eD.step(D, P); eL.step(D, P);
  const stage = i < 10 ? 1 : i < 25 ? 2 : 3;
  const showAll = i < 3 || marks.includes(i + 1) || i >= 37;
  if (!showAll) return;
  const dLv = L.find((v) => eD.A >= v.lo && eD.A < v.hi) || L[8];
  console.log(`  ${String(i + 1).padStart(2)}   ${D.toFixed(2)}  ${P.toFixed(2)}   ${stage}   │ ${eD.A.toFixed(3)}  ${dLv.nm.padEnd(12)} │ ${eL.A.toFixed(3)}  ${lab(eL.lA)}`);
});

// ══════════════════════════════════════════════════
console.log('\n' + '='.repeat(100));
console.log('  三个阶段的读数对比（这才是关键）');
console.log('='.repeat(100));

function runTo(n) {
  const a = makeD(); const b = makeL();
  for (let i = 0; i < n; i++) { a.step(BATCH[i][0], BATCH[i][1]); b.step(BATCH[i][0], BATCH[i][1]); }
  return { d: a, l: b };
}
const r10 = runTo(10), r25 = runTo(25), r40 = runTo(40);
console.log('\n  阶段         │ D 轴 A   读作          │ λ 轴 A   读作');
console.log('  ' + '-'.repeat(82));
const r10dLv = L.find((v) => r10.d.A >= v.lo && r10.d.A < v.hi) || L[8];
const r25dLv = L.find((v) => r25.d.A >= v.lo && r25.d.A < v.hi) || L[8];
const r40dLv = L.find((v) => r40.d.A >= v.lo && r40.d.A < v.hi) || L[8];
console.log(`  阶段1 后(10) │ ${r10.d.A.toFixed(3)}    ${r10dLv.nm.padEnd(12)} │ ${r10.l.A.toFixed(3)}    ${lab(r10.l.lA)}`);
console.log(`  阶段2 后(25) │ ${r25.d.A.toFixed(3)}    ${r25dLv.nm.padEnd(12)} │ ${r25.l.A.toFixed(3)}    ${lab(r25.l.lA)}`);
console.log(`  阶段3 后(40) │ ${r40.d.A.toFixed(3)}    ${r40dLv.nm.padEnd(12)} │ ${r40.l.A.toFixed(3)}    ${lab(r40.l.lA)}`);

console.log('\n  读数增量：');
console.log('  ' + '-'.repeat(70));
const dd1 = r25.d.A - r10.d.A, dd2 = r40.d.A - r25.d.A;
const dl1 = r25.l.A - r10.l.A, dl2 = r40.l.A - r25.l.A;
console.log(`  阶段1→2（中等 → 能做较难）  │ D 轴 +${dd1.toFixed(3)}          │ λ 轴 +${dl1.toFixed(3)}`);
console.log(`  阶段2→3（能做较难 → 稳定+压轴）│ D 轴 +${dd2.toFixed(3)}          │ λ 轴 +${dl2.toFixed(3)}`);
console.log(`\n  比值（阶段2→3 的读数 ÷ 阶段1→2 的读数）：`);
console.log(`     D 轴：${(dd2 / dd1).toFixed(2)}   ${dd2 / dd1 < 0.6 ? '❌ 明显衰减（越难的进步读数越小）' : ''}`);
console.log(`     λ 轴：${(dl2 / dl1).toFixed(2)}   ${dl2 / dl1 > 0.6 && dl2 / dl1 < 1.7 ? '✅ 大致相当（每档进步读数一致）' : ''}`);

console.log('\n' + '='.repeat(100));
console.log('  最终状态：他和"能到的极限"');
console.log('='.repeat(100));
console.log(`\n  D 轴：A=${r40.d.A.toFixed(3)}（${r40dLv.nm}）   U=${r40.d.U.toFixed(3)}   A/U=${(r40.d.A / r40.d.U).toFixed(2)}`);
console.log(`  λ 轴：A=${r40.l.A.toFixed(3)}（${lab(r40.l.lA)}）   U=${r40.l.U.toFixed(3)}（${lab(r40.l.lU)}）   A/U=${(r40.l.A / r40.l.U).toFixed(2)}`);
console.log(`\n  他实际做到过（阶段3）：D=0.87 稳定 P=0.90，D=0.92 能到 P=0.70~0.78`);
console.log(`  → 即：他【稳做 L8 较难题】，【压轴能拿 7 成】`);
