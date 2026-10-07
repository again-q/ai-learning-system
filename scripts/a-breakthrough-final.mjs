/**
 * 「突破发挥」怎么定义 —— 最后一版候选
 *
 * 已排除的方案（实测失败）：
 *   ✗ 涨幅 ∝ (s−U)     → 触发时 U 一次性跳到 s 附近 → 全部顶到 100
 *   ✗ 窗口 20 内 ≥2 次  → 比「连续 2 次」更容易凑齐 → 弱者 U 反而更高
 *
 * 本轮测：门槛跟着能力走（max(U, A+δ)）——「超越自己」而不是「超越固定数」
 * 跑法：node scripts/a-breakthrough-final.mjs
 */

const CAL = (d) => 0.6 + 0.4 * d;
const p3 = (x) => (x * 100).toFixed(1);
const L = '='.repeat(98);

// ── 真实 P 分布（22:10 实测）──
const LV = {
  L4: { D: 0.518, Ps: [1,1,1,1,1,1,0,0,1,1,0.5,1,1,1,0,1,1,1,0,0,1].sort((a,b)=>b-a) },
  L6: { D: 0.735, Ps: [1,0.9,0.8,0.6,0.6,0.6,0.4,0.3,0.2,0,0,1,0.9,1].sort((a,b)=>b-a) },
};
const L5D = 0.650;
const MIX = [['L4', 0.55], ['L5', 0.10], ['L6', 0.35]];
const TIERS = { 较强: 0.30, 偏上: 0.10, 中位: 0.00, 较弱: -0.40 };

// ── 修正后：用「对数正态式」生成 P，不再用数组下标（避免极化）──
function pickP(lv, lift) {
  // lift ∈ [−0.5, 0.5] → 映射到「成功率基准」b
  const b = Math.max(0.03, Math.min(0.97, 0.5 + lift * 0.9));
  // 每层有一个难度天花板上限，b 不能超
  const cap = lv === 'L5' ? CAL(L5D) : CAL(LV[lv].D);
  const mean = Math.min(b, cap);
  // 抖动：20% 概率满分/零分，其余围绕 mean
  const r = Math.random();
  let p;
  if (r < 0.12) p = Math.min(1, cap);            // 做对且漂亮
  else if (r < 0.24) p = mean * 0.35;             // 明显失误
  else p = Math.max(0, Math.min(1, mean + (Math.random() - 0.5) * 0.42));
  return p;
}
function pickLv() {
  const r = Math.random(); let acc = 0;
  for (const [lv, p] of MIX) { acc += p; if (r <= acc) return lv; }
  return 'L4';
}

/**
 * breakRule: 'aboveU'  = s > U（现行）
 *            'aboveUA' = s > max(U, A + δ)  「超越自己」
 *            'aboveFloor' = s > max(U, floor)  绝对门槛地板
 */
function run(tier, N, opt = {}) {
  const {
    W = 20, need = 2, dU = 0.05,
    breakRule = 'aboveU', delta = 0.15, floor = 0.80, mulD = false,
  } = opt;
  const lift = TIERS[tier];
  let A = 0.30, U = 0.50, ups = 0;
  const win = [];                 // 存「本次是否突破」的标记
  let sAcc = 0, nHi = 0;
  for (let i = 0; i < N; i++) {
    const lv = pickLv();
    const D = lv === 'L5' ? L5D : LV[lv].D;
    const s = pickP(lv, lift) * CAL(D);
    sAcc += s;

    const bar = breakRule === 'aboveU'    ? U
              : breakRule === 'aboveUA'   ? Math.max(U, A + delta)
              : Math.max(U, floor);
    if (s > bar) { win.push(1); nHi++; } else win.push(0);
    if (win.length > W) win.shift();
    if (win.reduce((a, b) => a + b, 0) >= need) {
      U = Math.min(1, U + dU * (1 - U) * (mulD ? D : 1));
      win.length = 0; ups++;
    }
    A = Math.max(0, Math.min(U, A + 0.1 * (s - A)));
  }
  return { A, U, ups, sAvg: sAcc / N, brkRate: nHi / N };
}

const avg = (f, t, n = 60) => {
  const rs = []; for (let k = 0; k < n; k++) rs.push(f(t));
  const m = (k) => rs.reduce((a, b) => a + b[k], 0) / rs.length;
  const sd = (k) => { const mu = m(k); return Math.sqrt(rs.reduce((a, b) => a + (b[k] - mu) ** 2, 0) / rs.length); };
  return { A: m('A'), U: m('U'), ups: m('ups'), sAvg: m('sAvg'), brkRate: m('brkRate'), Usd: sd('U') };
};

console.log(L);
console.log('  「突破发挥」的三种判据 —— 2000 次观测，60 次平均');
console.log(L);

console.log('\n【0】先看修正后的学生画像（确认不极化）');
console.log('  档lift      L4均值  L5均值  L6均值  s均值');
for (const t of Object.keys(TIERS)) {
  const acc = {}; let sSum = 0;
  for (const [lv, w] of MIX) {
    const arr = []; for (let i = 0; i < 20000; i++) arr.push(pickP(lv, TIERS[t]));
    acc[lv] = arr.reduce((a, b) => a + b, 0) / arr.length;
    sSum += acc[lv] * CAL(lv === 'L5' ? L5D : LV[lv].D) * w;
  }
  const f = (x) => p3(x).padStart(7);
  console.log(`  ${t.padEnd(5)}(${TIERS[t].toFixed(2)}) ${f(acc.L4)} ${f(acc.L5)} ${f(acc.L6)} ${f(sSum)}`);
}

console.log('\n【1】突破判据对比（涨幅固定 0.05(1−U)）');
console.log('  判据                  档      A      U±σ   上浮   突破率');
const CAND = [
  ['连续 2 次 s>U', { W: 2, need: 2, breakRule: 'aboveU' }],
  ['窗口20内2次 s>U', { W: 20, need: 2, breakRule: 'aboveU' }],
  ['窗口20内2次 s>U+0.10', { W: 20, need: 2, breakRule: 'aboveUA', delta: 0.10 }],
  ['窗口20内2次 s>U+0.15', { W: 20, need: 2, breakRule: 'aboveUA', delta: 0.15 }],
  ['窗口20内2次 s>U+0.20', { W: 20, need: 2, breakRule: 'aboveUA', delta: 0.20 }],
  ['窗口20内2次 s>0.85', { W: 20, need: 2, breakRule: 'aboveFloor', floor: 0.85 }],
  ['窗口20内2次 s>0.90', { W: 20, need: 2, breakRule: 'aboveFloor', floor: 0.90 }],
  ['窗口19内2次 s>U+0.15', { W: 19, need: 2, breakRule: 'aboveUA', delta: 0.15 }],
  ['窗口19内3次 s>U+0.15', { W: 19, need: 3, breakRule: 'aboveUA', delta: 0.15 }],
];
for (const [nm, opt] of CAND) {
  const r = {};
  for (const t of Object.keys(TIERS)) r[t] = avg((x) => run(x, 2000, opt), t);
  for (const t of Object.keys(TIERS)) {
    const x = r[t];
    console.log(`  ${nm.padEnd(20)} ${t.padEnd(5)} ${p3(x.A).padStart(6)} ${p3(x.U).padStart(6)}±${p3(x.Usd).padStart(4)} ${x.ups.toFixed(0).padStart(5)} ${(x.brkRate*100).toFixed(1).padStart(7)}%`);
  }
  const Us = Object.values(r).map(x => x.U), As = Object.values(r).map(x => x.A);
  const dec = Us.every((v, i) => i === 0 || Us[i-1] >= v - 1e-9);
  const mon = As.every((v, i) => i === 0 || As[i-1] >= v - 1e-9);
  console.log(`  ${''.padEnd(20)} → U跨度${p3(Math.max(...Us)-Math.min(...Us)).padStart(5)} 递减${dec?'✅':'❌'} | A跨度${p3(Math.max(...As)-Math.min(...As)).padStart(5)} 递减${mon?'✅':'❌'}\n`);
}

console.log('\n【2】最优候选的稳健性：涨幅 × 系数是否影响结论');
for (const [nm, base] of [
  ['窗口20内2次 s>U+0.15', { W: 20, need: 2, breakRule: 'aboveUA', delta: 0.15 }],
  ['窗口20内2次 s>0.85', { W: 20, need: 2, breakRule: 'aboveFloor', floor: 0.85 }],
]) {
  console.log(`\n  ▸ ${nm}`);
  console.log('    涨幅          较强A/较强U   偏上A/偏上U   中位A/中位U   较弱A/较弱U   U跨度  A跨度');
  for (const [g, mD] of [['0.03', false], ['0.05', false], ['0.05×D', true], ['0.10', false]]) {
    const r = {};
    for (const t of Object.keys(TIERS)) r[t] = avg((x) => run(x, 2000, { ...base, dU: mD ? 0.05 : parseFloat(g), mulD: mD }), t);
    const Us = Object.values(r).map(x => x.U), As = Object.values(r).map(x => x.A);
    const f = (t) => `${p3(r[t].A)}/${p3(r[t].U)}`.padStart(13);
    console.log(`    ${g.padEnd(8)} ${f('较强')} ${f('偏上')} ${f('中位')} ${f('较弱')}  ${p3(Math.max(...Us)-Math.min(...Us)).padStart(6)} ${p3(Math.max(...As)-Math.min(...As)).padStart(6)}`);
  }
}

console.log('\n【3】「较弱U 应该很低」能做到多低（扫 δ）');
console.log('  窗口20内2次 s>U+δ，涨 0.05(1−U)');
console.log('  δ        较强U   偏上U   中位U   较弱U   U跨度  较弱U/较强U');
for (const d of [0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.40]) {
  const r = {};
  for (const t of Object.keys(TIERS)) r[t] = avg((x) => run(x, 2000, { W: 20, need: 2, breakRule: 'aboveUA', delta: d }), t);
  const Us = Object.values(r).map(x => x.U);
  const f = (t) => p3(r[t].U).padStart(7);
  console.log(`  ${d.toFixed(2)}   ${f('较强')} ${f('偏上')} ${f('中位')} ${f('较弱')} ${p3(Math.max(...Us)-Math.min(...Us)).padStart(7)}  ${(r.较弱.U/r.较强.U).toFixed(3)}`);
}
console.log(L);
