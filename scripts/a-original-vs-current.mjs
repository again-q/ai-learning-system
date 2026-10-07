/**
 * 最初版（决策 055）vs 现行版（极简）—— 用真实 P 分布跑三档
 * 跑法：node scripts/a-original-vs-current.mjs
 *
 * 最初版 055：s = P×(0.6+0.4D)×q   ΔA = 0.25(s−A)(U−A)
 *            U↑: 连续2次 s≥0.8 → U += 0.05(1−U)
 *            U↓: 连续5次 s≤0.6 → U -= 0.03(U−A)
 * 现行版：   s = P×(0.6+0.4D)      A += 0.1(s−A)  clamp(0,U)
 *            U↑: 连续2次 s>U → U += 0.05(1−U)   （只涨不跌）
 * 差异只有五处：q / α / 阻尼 / 上浮门槛 / 下浮
 */

const CAL = (d) => 0.6 + 0.4 * d;          // 两版共用同一校准（你定的锚点）
const p3 = (x) => (x * 100).toFixed(1);
const L = '='.repeat(96);

// ── 真实 P 分布（22:10 从 323 个 raw 文件实测）──
const REAL_BY_LV = {
  L4: { D: 0.518, Ps: [1,1,1,1,1,1,0,0,1,1,0.5,1,1,1,0,1,1,1,0,0,1] },
  L5: { D: 0.650, Ps: [1,1,1,1] },
  L6: { D: 0.735, Ps: [1,0.9,0.8,0.6,0.6,0.6,0.4,0.3,0.2,0,0,1,0.9,1] },
};
const LV_MIX = [['L4', 0.55], ['L5', 0.10], ['L6', 0.35]];

const TIERS = {
  较强: { lift: 0.30 },
  偏上: { lift: 0.10 },
  中位: { lift: 0.00 },
  较弱: { lift: -0.40 },
};

function pickP(lv, lift) {
  const pool = REAL_BY_LV[lv].Ps;
  const strength = lift + 0.5;
  const base = (1 - strength) * (pool.length - 1);
  const idx = Math.round(base + (Math.random() - 0.5) * 1.2);
  return pool[Math.max(0, Math.min(pool.length - 1, idx))];
}

// ── 最初版 055 ──
function runOrig(tier, N = 2000, useQ = true) {
  const lift = TIERS[tier].lift;
  let A = 0.30, U = 0.50, hi = 0, lo = 0, ups = 0, downs = 0;
  let sAcc = 0, dead = 0;                    // dead = A 被 U 压住多少次
  for (let i = 0; i < N; i++) {
    const r = Math.random();
    let acc = 0, lv = 'L4';
    for (const [Lv, p] of LV_MIX) { acc += p; if (r <= acc) { lv = Lv; break; } }
    const P = pickP(lv, lift);
    const D = REAL_BY_LV[lv].D;
    // q 只能用 P 近似（断段率与错误率同向）；useQ=false 时 q≡1
    const q = useQ ? Math.max(0.5, Math.min(1, 0.72 + 0.28 * P)) : 1;
    const s = P * CAL(D) * q;
    sAcc += s;

    if (s >= 0.8) { hi++; lo = 0; } else hi = 0;
    if (hi >= 2) { U += 0.05 * (1 - U); hi = 0; ups++; }
    if (s <= 0.6) { lo++; hi = 0; } else lo = 0;
    if (lo >= 5) { U -= 0.03 * (U - A); lo = 0; downs++; }

    const dA = 0.25 * (s - A) * Math.max(0, U - A);
    A = Math.max(0, Math.min(U, A + dA));
    if (Math.abs(s - A) < 0.005 && s > A) dead++;
  }
  return { A, U, ups, downs, sAvg: sAcc / N, dead };
}

// ── 现行版（极简）──
function runNow(tier, N = 2000) {
  const lift = TIERS[tier].lift;
  let A = 0.30, U = 0.50, above = 0, ups = 0, sAcc = 0;
  for (let i = 0; i < N; i++) {
    const r = Math.random();
    let acc = 0, lv = 'L4';
    for (const [Lv, p] of LV_MIX) { acc += p; if (r <= acc) { lv = Lv; break; } }
    const P = pickP(lv, lift);
    const s = P * CAL(REAL_BY_LV[lv].D);
    sAcc += s;

    if (s > U) { above++; if (above >= 2) { U += 0.05 * (1 - U); above = 0; ups++; } }
    else above = 0;

    A = Math.max(0, Math.min(U, A + 0.1 * (s - A)));
  }
  return { A, U, ups, downs: 0, sAvg: sAcc / N };
}

const avg = (f, tier, n = 30) => {
  const rs = []; for (let k = 0; k < n; k++) rs.push(f(tier));
  const m = (key) => rs.reduce((a, b) => a + b[key], 0) / rs.length;
  const sd = (key) => { const mu = m(key); return Math.sqrt(rs.reduce((a, b) => a + (b[key] - mu) ** 2, 0) / rs.length); };
  return { A: m('A'), U: m('U'), ups: m('ups'), downs: m('downs'), sAvg: m('sAvg'), Asd: sd('A') };
};

console.log(L);
console.log('  最初版（055） vs 现行版（极简）  —— 2000 次观测，真实 P 分布，30 次平均');
console.log(L);

console.log('\n【一】最初版 055（含 q，q 由 P 近似）');
console.log('  档      期末A    期末U    A波动σ   s均值   上浮   下浮');
for (const t of Object.keys(TIERS)) {
  const r = avg(runOrig, t);
  console.log(`  ${t.padEnd(6)} ${p3(r.A).padStart(7)} ${p3(r.U).padStart(8)} ${p3(r.Asd).padStart(9)} ${p3(r.sAvg).padStart(8)} ${r.ups.toFixed(0).padStart(6)} ${r.downs.toFixed(0).padStart(6)}`);
}

console.log('\n【二】最初版 055 但 q ≡ 1（隔离 q 的影响）');
console.log('  档      期末A    期末U    A波动σ   s均值   上浮   下浮');
for (const t of Object.keys(TIERS)) {
  const r = avg((tier) => runOrig(tier, 2000, false), t);
  console.log(`  ${t.padEnd(6)} ${p3(r.A).padStart(7)} ${p3(r.U).padStart(8)} ${p3(r.Asd).padStart(9)} ${p3(r.sAvg).padStart(8)} ${r.ups.toFixed(0).padStart(6)} ${r.downs.toFixed(0).padStart(6)}`);
}

console.log('\n【三】现行版（极简，q 删 / α=0.1 / 线性阻尼 / s>U / 只涨不跌）');
console.log('  档      期末A    期末U    A波动σ   s均值   上浮   下浮');
const now = {};
for (const t of Object.keys(TIERS)) {
  const r = avg(runNow, t); now[t] = r;
  console.log(`  ${t.padEnd(6)} ${p3(r.A).padStart(7)} ${p3(r.U).padStart(8)} ${p3(r.Asd).padStart(9)} ${p3(r.sAvg).padStart(8)} ${r.ups.toFixed(0).padStart(6)} ${r.downs.toFixed(0).padStart(6)}`);
}

console.log('\n【四】两版对照（差 = 现行 − 最初）');
console.log('  档        ΔA      ΔU     A波动σ变化');
const orig = {};
for (const t of Object.keys(TIERS)) orig[t] = avg((tier) => runOrig(tier, 2000, false), t);
for (const t of Object.keys(TIERS)) {
  const dA = now[t].A - orig[t].A, dU = now[t].U - orig[t].U;
  const dS = now[t].Asd - orig[t].Asd;
  console.log(`  ${t.padEnd(6)} ${(dA*100).toFixed(1).padStart(7)} ${(dU*100).toFixed(1).padStart(7)}   ${(dS*100).toFixed(2).padStart(7)}`);
}

console.log('\n【五】现行版：固定 P=0.9 恒定输入下的收敛（隔离难度结构）');
for (const pv of [0.5, 0.7, 0.9, 1.0]) {
  let A = 0.30, U = 0.50, above = 0;
  for (let i = 0; i < 2000; i++) {
    const s = pv * CAL(0.735);            // 统一按 L6 难度
    if (s > U) { above++; if (above >= 2) { U += 0.05 * (1 - U); above = 0; } } else above = 0;
    A = Math.max(0, Math.min(U, A + 0.1 * (s - A)));
  }
  console.log(`  P≡${pv.toFixed(2)}  s=${(pv*CAL(0.735)).toFixed(3)}   A=${p3(A)}   U=${p3(U)}   gap=${p3(U-A)}`);
}

console.log('\n【六】现行版：简单题全对 vs 难题全对（难度的话语权）');
for (const lv of ['L4', 'L5', 'L6']) {
  let A = 0.30, U = 0.50, above = 0;
  for (let i = 0; i < 2000; i++) {
    const s = 1.0 * CAL(REAL_BY_LV[lv].D);
    if (s > U) { above++; if (above >= 2) { U += 0.05 * (1 - U); above = 0; } } else above = 0;
    A = Math.max(0, Math.min(U, A + 0.1 * (s - A)));
  }
  console.log(`  ${lv}  D=${REAL_BY_LV[lv].D.toFixed(3)}  s上限=${CAL(REAL_BY_LV[lv].D).toFixed(3)}   A=${p3(A)}   U=${p3(U)}`);
}
console.log(L);
