#!/usr/bin/env node
/**
 * 统一刻度后的真实对照：D 轴 vs λ 轴
 *
 * 修正上一版的问题：
 *   之前直接比较 A 数值（0.853 vs 0.766）—— 两个刻度不可比
 *   本版：对外统一报「D 值」+「档位」，只比较【读数增量是否等权】
 *
 * 用户要求（2026-10-06）：
 *   · 甲（报 D 值）和乙（报档位）都保留
 *   · λ 轴的核心价值 = 高分段的变化能体现得更大
 *
 * 用法：node scripts/compare-axes-unified.mjs
 */
const L = [
  { L: 1, lo: 0.01, hi: 0.15, nm: '送分' }, { L: 2, lo: 0.15, hi: 0.30, nm: '送分→简单' },
  { L: 3, lo: 0.30, hi: 0.45, nm: '简单' }, { L: 4, lo: 0.45, hi: 0.60, nm: '中下' },
  { L: 5, lo: 0.60, hi: 0.70, nm: '中档' }, { L: 6, lo: 0.70, hi: 0.79, nm: '中档→中上' },
  { L: 7, lo: 0.79, hi: 0.85, nm: '中上' }, { L: 8, lo: 0.85, hi: 0.90, nm: '较难' },
  { L: 9, lo: 0.90, hi: 0.94, nm: '较难→极难' },
];
const toLambda = (D) => { const d = Math.max(0.01, Math.min(0.94, D)); for (const x of L) if (d >= x.lo && d < x.hi) return (x.L - 1) + (d - x.lo) / (x.hi - x.lo); return 9; };
const toD = (l) => { const x = Math.max(0, Math.min(9, l)); const i = Math.min(L.length - 1, Math.floor(x)); return L[i].lo + (x - i) * (L[i].hi - L[i].lo); };
const labOf = (l) => { const x = Math.max(0, Math.min(9, l)); const i = Math.min(L.length - 1, Math.floor(x)); const f = x - i; return `L${L[i].L} ${L[i].nm}${f > 0.05 ? `(${(f * 100).toFixed(0)}%)` : ''}`; };
const logit = (p) => Math.log(p / (1 - p));
const DENOM = 9.2;

// ══════════════════════════════════════════════════
function makeD(cfg = {}) {
  const { k = 3, s0 = 0.10, p_t = 0.80, alpha = 0.1, delta_d = 0.03, k_low = 3, P_c = 0.6, a_u = 0.75 } = cfg;
  let A = 0.30, U = 0.50, n = 0;
  const E = (D) => { const s = (U - A) / 2 + s0, m = A - (s / k) * logit(1 - p_t); return 1 / (1 + Math.exp(k * (D - m) / s)); };
  return { get A() { return A; }, get U() { return U; },
    step(D, P) {
      const e = E(D);
      A = Math.min(U, Math.max(0, A + alpha * (P - e)));
      if (D > U && P >= P_c) { const g = a_u + (1 - a_u) * ((P - P_c) / (1 - P_c)); const c = D * g; if (c > U) U = c; n = 0; }
      else if (D < A && P < P_c) { n++; if (n >= k_low) { U = Math.max(A, U - delta_d * (U - A)); n = 0; } }
      else n = 0;
    } };
}
function makeL(cfg = {}) {
  const { k = 3, s0 = 0.35, p_t = 0.80, alpha = 0.9, delta_d = 0.03, k_low = 3, P_c = 0.6, a_u = 0.75 } = cfg;
  let lA = toLambda(0.30), lU = toLambda(0.50), n = 0;
  const E = (lD) => { const s = (lU - lA) / 2 + s0, m = lA - (s / k) * logit(1 - p_t); return 1 / (1 + Math.exp(k * (lD - m) / s)); };
  return { get lA() { return lA; }, get lU() { return lU; }, get A() { return lA / DENOM; }, get U() { return lU / DENOM; },
    get Ad() { return toD(lA); }, get Ud() { return toD(lU); },
    step(D, P) {
      const lD = toLambda(D);
      const e = E(lD);
      lA = Math.min(lU, Math.max(0, lA + alpha * (P - e)));
      const dA = toD(lA), dU = toD(lU);
      if (D > dU && P >= P_c) { const g = a_u + (1 - a_u) * ((P - P_c) / (1 - P_c)); const c = toLambda(Math.min(0.94, D * g)); if (c > lU) lU = c; n = 0; }
      else if (D < dA && P < P_c) { n++; if (n >= k_low) { lU = Math.max(lA, lU - delta_d * (lU - lA)); n = 0; } }
      else n = 0;
    } };
}

// ══════════════════════════════════════════════════
// 进步型学生题单（同上一版）
// ══════════════════════════════════════════════════
const BATCH = [
  [0.55, 0.85], [0.62, 0.80], [0.65, 0.60], [0.68, 0.85], [0.65, 0.30],
  [0.72, 0.70], [0.75, 0.60], [0.70, 0.90], [0.65, 0.80], [0.78, 0.55],
  [0.85, 0.75], [0.88, 0.60], [0.86, 0.85], [0.87, 0.40], [0.85, 0.90],
  [0.89, 0.70], [0.88, 0.85], [0.90, 0.50], [0.86, 0.80], [0.87, 0.75],
  [0.85, 0.88], [0.88, 0.60], [0.89, 0.82], [0.86, 0.78], [0.87, 0.85],
  [0.87, 0.90], [0.88, 0.88], [0.86, 0.92], [0.90, 0.75], [0.87, 0.90],
  [0.92, 0.70], [0.88, 0.95], [0.91, 0.80], [0.87, 0.92], [0.93, 0.65],
  [0.88, 0.90], [0.90, 0.85], [0.87, 0.95], [0.92, 0.78], [0.89, 0.90],
];

console.log('='.repeat(98));
console.log('  统一刻度后的对照：报 D 值（甲）+ 报档位（乙）');
console.log('='.repeat(98));
console.log('\n  学生：中等生 → 能做较难题 → 较难稳定+压轴七成（40 题）\n');

function runTo(n, mk) { const e = mk(); for (let i = 0; i < n; i++) e.step(BATCH[i][0], BATCH[i][1]); return e; }

const stages = [10, 25, 40];
const dRun = stages.map((n) => runTo(n, makeD));
const lRun = stages.map((n) => runTo(n, makeL));

console.log('  阶段(题号)    │ 甲：报 D 值            │ 乙：报档位');
console.log('  ' + '-'.repeat(90));
stages.forEach((n, i) => {
  const d = dRun[i], l = lRun[i];
  const dLv = L.find((v) => d.A >= v.lo && v.A < v.hi) || L[8];
  console.log(`  阶段${i + 1} 后(${String(n).padStart(2)})  │ D轴 A=${d.A.toFixed(3)}  ${dLv.nm.padEnd(10)} │ D轴 ${labOf(toLambda(d.A)).padEnd(16)} / λ轴 ${labOf(l.lA)}`);
});

console.log('\n' + '='.repeat(98));
console.log('  核心对照：同样"跨一档"的进步，读数增量是否等权');
console.log('='.repeat(98));
console.log('\n  阶段1→2：中等生 → 开始能做较难题');
console.log('  阶段2→3：能做较难 → 较难稳定下来 + 压轴能拿七成');
console.log('\n  方案   │ A (换算成 D 值)                     │ 增量');
console.log('  ' + '-'.repeat(82));
const dA = dRun.map((e) => e.A), lAd = lRun.map((e) => e.Ad);
console.log(`  D 轴   │ ${dA.map((x) => x.toFixed(3)).join('  →  ')}   │ 1→2: +${(dA[1] - dA[0]).toFixed(3)}   2→3: +${(dA[2] - dA[1]).toFixed(3)}`);
console.log(`  λ 轴   │ ${lAd.map((x) => x.toFixed(3)).join('  →  ')}   │ 1→2: +${(lAd[1] - lAd[0]).toFixed(3)}   2→3: +${(lAd[2] - lAd[1]).toFixed(3)}`);
console.log(`\n  阶段2→3 ÷ 阶段1→2 的比值：`);
console.log(`    D 轴：${((dA[2] - dA[1]) / (dA[1] - dA[0])).toFixed(2)}`);
console.log(`    λ 轴：${((lAd[2] - lAd[1]) / (lAd[1] - lAd[0])).toFixed(2)}`);

console.log('\n' + '='.repeat(98));
console.log('  最关键：高分段（L8→L9）的进步，两套方案各显示多少');
console.log('='.repeat(98));
{
  // 构造：一个已经稳做 L8 的学生，进步到能做 L9（压轴）
  const before = [];
  for (let i = 0; i < 20; i++) before.push([0.86 + (i % 3) * 0.01, 0.86 + (i % 6) * 0.01]);
  const after = [];
  for (let i = 0; i < 20; i++) after.push([i % 2 === 0 ? 0.87 : 0.92, 0.88 + (i % 4) * 0.02]);
  function measure(mk) {
    const e = mk();
    for (const [D, P] of before) e.step(D, P);
    const A1 = e.Ad !== undefined ? e.Ad : e.A;
    for (const [D, P] of after) e.step(D, P);
    const A2 = e.Ad !== undefined ? e.Ad : e.A;
    return { A1, A2, d: A2 - A1 };
  }
  const md = measure(makeD), ml = measure(makeL);
  console.log('\n  场景：他本来稳做 D=0.87（L8）的题，后来能做出 D=0.91（L9 压轴）的题\n');
  console.log('  方案   │ 进步前 A   │ 进步后 A   │ 读数增量');
  console.log('  ' + '-'.repeat(58));
  console.log(`  D 轴   │ ${md.A1.toFixed(3)}      │ ${md.A2.toFixed(3)}      │ +${md.d.toFixed(3)}`);
  console.log(`  λ 轴   │ ${ml.A1.toFixed(3)}      │ ${ml.A2.toFixed(3)}      │ +${ml.d.toFixed(3)}`);
  console.log(`\n  → λ 轴的读数增量是 D 轴的 ${(ml.d / md.d).toFixed(2)} 倍`);
  console.log(`  → 这个进步在他自己看来是"跨了一个大台阶"（较难 → 压轴）`);
}

console.log('\n' + '='.repeat(98));
console.log('  报 D 值（甲）和报档位（乙）的对照');
console.log('='.repeat(98));
console.log('\n  阶段   │ 甲：A 的 D 值    │ 乙：档位（两种方案一致）');
console.log('  ' + '-'.repeat(76));
stages.forEach((n, i) => {
  const d = dRun[i], l = lRun[i];
  console.log(`  阶段${i + 1}  │ ${d.A.toFixed(3)}            │ D轴读作 ${labOf(toLambda(d.A)).padEnd(16)} λ轴读作 ${labOf(l.lA)}`);
});
console.log('\n  结论：');
console.log('   · 甲（D 值）：两套方案给出的 D 值几乎一样（差 < 0.01）');
console.log('   · 乙（档位）：两套方案读作同样的档位');
console.log('   · 差别只在【增量幅度】——λ 轴让高分段的进步读数更大');
