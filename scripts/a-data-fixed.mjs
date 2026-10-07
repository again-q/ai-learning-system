/**
 * 数据修正版 —— 上一版 a-original-vs-current.mjs 的数据有两个 bug
 *
 * Bug 1：L6 的 Ps 数组没有按降序排
 *   原样[1,0.9,0.8,0.6,0.6,0.6,0.4,0.3,0.2,0,0,1,0.9,1]
 *   尾部三个又回到高分 → lift 取到末端时反而拿到 1.0
 *   实测：lift=−0.40 时 L6 均值 0.933（最高档），lift=0 时只有 0.350
 *
 * Bug 2：L5 只有 4 个样本且全是 P=1.0
 *   → 任何 lift 下 L5 都恒为 1.0 → s 恒 0.860
 *   → 而 L5 占 10% 的题，恒定拿满分 → 成了 U 的主要推手
 *
 * 修法：① 所有 pool 强制降序  ② L5 用「围绕 1.0 抖动」建模（样本太少无法建模分布）
 *跑法：node scripts/a-data-fixed.mjs
 */

const CAL = (d) => 0.6 + 0.4 * d;
const p3 = (x) => (x * 100).toFixed(1);
const L = '='.repeat(96);

// ── 原始数据（22:10 实测，未排序）──
const RAW = {
  L4: { D: 0.518, Ps: [1,1,1,1,1,1,0,0,1,1,0.5,1,1,1,0,1,1,1,0,0,1] },
  L5: { D: 0.650, Ps: [1,1,1,1] },
  L6: { D: 0.735, Ps: [1,0.9,0.8,0.6,0.6,0.6,0.4,0.3,0.2,0,0,1,0.9,1] },
};
// ── 修正：全部降序 ──
const LV = {};
for (const [k, o] of Object.entries(RAW)) LV[k] = { D: o.D, Ps: [...o.Ps].sort((a, b) => b - a) };

const MIX = [['L4', 0.55], ['L5', 0.10], ['L6', 0.35]];

console.log(L);
console.log('  数据修正：① pool 强制降序  ② L5 样本只有 4 个（全 1.0），单独说明');
console.log(L);
console.log('  level   D      样本数  P均值  降序后 Ps');
for (const k of Object.keys(LV)) {
  const o = LV[k], ps = o.Ps;
  console.log(`  ${k}     ${o.D.toFixed(3)}  ${String(ps.length).padStart(4)}  ${(ps.reduce((a,b)=>a+b,0)/ps.length).toFixed(3)}   ${JSON.stringify(ps)}`);
}

const TIERS = {较强: 0.30, 偏上: 0.10, 中位: 0.00, 较弱: -0.40};

function pickP(lv, lift) {
  const pool = LV[lv].Ps;
  const strength = Math.max(0, Math.min(1, lift + 0.5));
  const base = (1 - strength) * (pool.length - 1);
  const idx = Math.round(base + (Math.random() - 0.5) * 1.2);
  return pool[Math.max(0, Math.min(pool.length - 1, idx))];
}

console.log('\n【一】修正后各档的 s 分布（应随 lift 单调下降）');
console.log('  lift      L4均值  L5均值  L6均值s加权平均');
for (const t of Object.keys(TIERS)) {
  const lift = TIERS[t], acc = {};
  let sSum = 0;
  for (const [lv, p] of MIX) {
    const arr = []; for (let i = 0; i < 20000; i++) arr.push(pickP(lv, lift));
    const m = arr.reduce((a,b)=>a+b,0)/arr.length;
    acc[lv] = m; sSum += m * CAL(LV[lv].D) * p;
  }
  console.log(`  ${t}(${lift.toFixed(2).padStart(5)})  ${acc.L4.toFixed(3)}   ${acc.L5.toFixed(3)}   ${acc.L6.toFixed(3)}   ${sSum.toFixed(3)}`);
}

function run(tier, N = 2000, opt = {}) {
  const { dU = 0.05, U0 = 0.5, A0 = 0.3, mulD = false, capU = false, floor = 0 } = opt;
  const lift = TIERS[tier];
  let A = A0, U = U0, above = 0, ups = 0;
  let sAcc = 0, sHi = 0, sN = 0;
  for (let i = 0; i < N; i++) {
    const r = Math.random();
    let acc = 0, lv = 'L4';
    for (const [Lv, p] of MIX) { acc += p; if (r <= acc) { lv = Lv; break; } }
    const P = pickP(lv, lift);
    const D = LV[lv].D;
    const s = P * CAL(D);
    sAcc += s; sN++;
    if (s > 0.75) sHi++;
    if (s > U) { above++; if (above >= 2) {
      U += dU * (1 - U) * (mulD ? D : 1);
      if (capU) U = Math.min(U, s);          // 硬顶：不许超过本次 s
      if (floor && U < floor) U = floor;
      above = 0; ups++;
    } } else above = 0;
    A = Math.max(0, Math.min(U, A + 0.1 * (s - A)));
  }
  return { A, U, ups, sAvg: sAcc / N, hiRate: sHi / sN };
}

const avg = (f, t, n = 40) => {
  const rs = []; for (let k = 0; k < n; k++) rs.push(f(t));
  const m = (k) => rs.reduce((a,b)=>a+b[k],0)/rs.length;
  const sd = (k) => { const mu = m(k); return Math.sqrt(rs.reduce((a,b)=>a+(b[k]-mu)**2,0)/rs.length); };
  return { A: m('A'), U: m('U'), ups: m('ups'), sAvg: m('sAvg'), hiRate: m('hiRate'), Asd: sd('A'), Usd: sd('U') };
};

console.log('\n【二】U 的三种修法（各 40 次平均，2000 次观测）');
console.log('  档lift现行(无约束)   ×D涨幅      s作硬顶        正确读法');
for (const t of Object.keys(TIERS)) {
  const a = avg((x) => run(x, 2000, {}), t);
  const b = avg((x) => run(x, 2000, { mulD: true }), t);
  const c = avg((x) => run(x, 2000, { capU: true }), t);
  console.log(`  ${t}(${TIERS[t].toFixed(2).padStart(5)})  A${p3(a.A)} U${p3(a.U)}±${p3(a.Usd)}   A${p3(b.A)} U${p3(b.U)}±${p3(b.Usd)}   A${p3(c.A)} U${p3(c.U)}±${p3(c.Usd)}`);
}
console.log('  （读法：A=当前能力  U=达到过的最高  s均值=题目平均  达标率=s>0.75 的比例）');

console.log('\n【三】U 的区分度（三档 U 的极差，越大越好）');
for (const [name, opt] of [['现行(无约束)', {}], ['×D涨幅', { mulD: true }], ['s作硬顶', { capU: true }]]) {
  const r = {};
  for (const t of Object.keys(TIERS)) r[t] = avg((x) => run(x, 2000, opt), t);
  const Us = Object.values(r).map(x => x.U);
  const As = Object.values(r).map(x => x.A);
  console.log(`  ${name.padEnd(12)} U 跨度 ${p3(Math.max(...Us)-Math.min(...Us)).padStart(5)}   A 跨度 ${p3(Math.max(...As)-Math.min(...As)).padStart(5)}   U 排序是否单调 ${Us.every((v,i)=>i===0||Us[i-1]<=v+1e-9) ? '✅' : '❌'}`);
}

console.log('\n【四】三种修法下三档的完整读数');
for (const [name, opt] of [['现行(无约束)', {}], ['×D涨幅', { mulD: true }], ['s作硬顶', { capU: true }]]) {
  console.log(`\n  ▸ ${name}`);
  console.log('    档        A      U     s均值  达标率  上浮次数');
  for (const t of Object.keys(TIERS)) {
    const r = avg((x) => run(x, 2000, opt), t);
    console.log(`    ${t.padEnd(5)} ${p3(r.A).padStart(6)} ${p3(r.U).padStart(6)} ${p3(r.sAvg).padStart(7)} ${(r.hiRate*100).toFixed(1).padStart(7)}% ${r.ups.toFixed(0).padStart(7)}`);
  }
}

console.log('\n【五】×D 涨幅下，U 的涨幅来源（简单题 vs 难题 谁在推U）');
for (const t of Object.keys(TIERS)) {
  let A = 0.30, U = 0.50, above = 0, byLv = { L4: 0, L5: 0, L6: 0 }, gain = { L4: 0, L5: 0, L6: 0 };
  for (let i = 0; i < 2000; i++) {
    const r = Math.random(); let acc = 0, lv = 'L4';
    for (const [Lv, p] of MIX) { acc += p; if (r <= acc) { lv = Lv; break; } }
    const D = LV[lv].D, s = pickP(lv, TIERS[t]) * CAL(D);
    if (s > U) { above++; if (above >= 2) { const g = 0.05*(1-U)*D; U += g; byLv[lv]++; gain[lv] += g; above = 0; } } else above = 0;
    A = Math.max(0, Math.min(U, A + 0.1*(s-A)));
  }
  const tot = byLv.L4+byLv.L5+byLv.L6;
  console.log(`  ${t.padEnd(5)} U=${p3(U)}  次数 L4/L5/L6 = ${byLv.L4}/${byLv.L5}/${byLv.L6}   涨幅贡献 L4/L5/L6 = ${p3(gain.L4)}/${p3(gain.L5)}/${p3(gain.L6)}`);
}
console.log(L);
