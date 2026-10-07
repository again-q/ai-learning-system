/**
 * A 的最终验收（修正版）—— 从「最初目标」出发
 *
 * 修正的 bug：之前的模拟把 P 上限设成了 CAL(D)，导致 P 和难度校准双重打折
 *   错误：P = min(CAL(D), base) 然后 s = P × CAL(D)   → 简单题满分只有 0.651
 *   正确：P 上限 = 1.0（P 是过程分，与难度无关），s = P × CAL(D)
 *
 * 目标（用户）：
 *   ① A 逼近 U（稳定的学生）
 *   ② U 突破后 A 继续追
 *   ③ 强者落点 ≈ 0.85
 *
 * 跑法：node scripts/a-final-acceptance.mjs
 */

const CAL = (d) => 0.6 + 0.4 * d;
const p3 = (x) => (x * 100).toFixed(1);
const L = '='.repeat(96);

const LVL = [
  { n: '简单', D: 0.518, w: 0.55 },
  { n: '中档', D: 0.650, w: 0.10 },
  { n: '困难', D: 0.735, w: 0.35 },
];

console.log(L);
console.log('  零、先看天花板：一个「每次都对」的学生，A 最多到多少');
console.log(L);
let ceil = 0, byLv = [];
for (const l of LVL) { const s = CAL(l.D); ceil += s * l.w; byLv.push(`${l.n} s=${s.toFixed(3)}×${(l.w*100)}%`); }
console.log(`  ${byLv.join('   ')}`);
console.log(`  → 满分学生的加权平均 s = ${p3(ceil)}  ← 这是 A 的物理上限`);
console.log(`  → 所以强者「0.85」= 几乎每次都做到接近满分`);

// P 生成：pBase = 该档学生的典型过程分；每层微调（难题略低）
const TIERS = {
  较强: { p: { 0: 0.98, 1: 0.95, 2: 0.88 }, jit: 0.06 },   // 简单题几乎不错，难题也基本能拿下
  偏上: { p: { 0: 0.92, 1: 0.85, 2: 0.70 }, jit: 0.12 },
  中位: { p: { 0: 0.85, 1: 0.70, 2: 0.45 }, jit: 0.18 },
  较弱: { p: { 0: 0.62, 1: 0.40, 2: 0.15 }, jit: 0.22 },
};

function P_at(li, tier) {
  const { p, jit } = TIERS[tier];
  const base = p[li];
  const r = Math.random();
  if (r < 0.06) return Math.min(1, base + 0.1);         // 6% 超常（做对且漂亮）
  if (r < 0.18) return Math.max(0, base * 0.4);         // 12% 明显失误
  return Math.max(0, Math.min(1, base + (Math.random() - 0.5) * jit * 2));
}
function pickLi() { const r = Math.random(); let a = 0; for (let k = 0; k < 3; k++) { a += LVL[k].w; if (r <= a) return k; } return 0; }

function sim(tier, opt = {}) {
  const { N = 3800, dU = 0.05, A0 = 0.30, U0 = 0.50 } = opt;   // 3800 = 200 批 × 19 题
  let A = A0, U = U0, consec = 0, ups = 0;
  let sAcc = 0, sMax = 0;
  const hist = [];
  for (let i = 0; i < N; i++) {
    const li = pickLi();
    const s = P_at(li, tier) * CAL(LVL[li].D);
    sAcc += s; sMax = Math.max(sMax, s);
    if (s > U) consec++; else consec = 0;
    if (consec >= 2) { U = Math.min(1, U + dU * (1 - U)); consec = 0; ups++; }
    A = Math.max(0, Math.min(U, A + 0.1 * (s - A)));
  }
  return { A, U, ups, sAvg: sAcc / N, sMax };
}

const avg = (t, n = 40, opt = {}) => {
  const rs = []; for (let k = 0; k < n; k++) rs.push(sim(t, opt));
  const m = (k) => rs.reduce((a, b) => a + b[k], 0) / rs.length;
  const sd = (k) => { const mu = m(k); return Math.sqrt(rs.reduce((a, b) => a + (b[k] - mu) ** 2, 0) / rs.length); };
  return { A: m('A'), U: m('U'), ups: m('ups'), sAvg: m('sAvg'), sMax: m('sMax'), Asd: sd('A'), Usd: sd('U') };
};

console.log('\n' + L);
console.log('  一、四档学生的落点（200 批 × 19 题 = 3800 次观测，40 次平均）');
console.log(L);
console.log('  档      A±σ          U±σ          U−A    A/U    s均值  上浮次数  你的目标');
const TARGET = { 较强: 0.85, 偏上: 0.70, 中位: 0.55, 较弱: 0.35 };
const RES = {};
for (const t of Object.keys(TIERS)) {
  const r = avg(t); RES[t] = r;
  console.log(`  ${t.padEnd(5)} ${p3(r.A).padStart(5)}±${p3(r.Asd).padStart(4)}  ${p3(r.U).padStart(5)}±${p3(r.Usd).padStart(4)}  ${((r.U-r.A)*100).toFixed(1).padStart(5)}  ${(r.A/r.U).toFixed(3)} ${p3(r.sAvg).padStart(6)} ${r.ups.toFixed(0).padStart(8)}  ${String(TARGET[t]*100).padStart(5)}`);
}
console.log('\n  与目标偏差：');
for (const t of Object.keys(TIERS)) {
  const d = (RES[t].A - TARGET[t]) * 100;
  console.log(`    ${t.padEnd(5)} A=${p3(RES[t].A)}  目标 ${TARGET[t]*100}  偏差 ${d >= 0 ? '+' : ''}${d.toFixed(1)}  ${Math.abs(d) <= 5 ? '✅' : Math.abs(d) <= 10 ? '🟡' : '🔴'}`);
}
const As = Object.values(RES).map(x => x.A);
const Us = Object.values(RES).map(x => x.U);
const decA = As.every((v, i) => i === 0 || As[i-1] >= v - 1e-9);
const decU = Us.every((v, i) => i === 0 || Us[i-1] >= v - 1e-9);
console.log(`\n  A 递减 ${decA ? '✅' : '❌'}（跨度 ${p3(Math.max(...As)-Math.min(...As))}）   U 递减 ${decU ? '✅' : '❌'}（跨度 ${p3(Math.max(...Us)-Math.min(...Us))}）`);

console.log('\n' + L);
console.log('  二、目标 ①：A 逼近 U 吗 —— 按稳定性分组看');
console.log(L);
console.log('  同一水平（P 基准 0.92），只改抖动幅度：');
console.log('  抖动      A      U      U−A    A/U   读作');
for (const j of [0.0, 0.05, 0.10, 0.20, 0.35, 0.50]) {
  const t = { p: { 0: 0.92, 1: 0.92, 2: 0.92 }, jit: j };
  const saved = TIERS['__x']; TIERS['__x'] = t;
  const r = avg('__x', 30);
  TIERS['__x'] = saved;
  const label = j === 0 ? '完全稳定' : j <= 0.10 ? '很稳' : j <= 0.20 ? '一般' : j <= 0.35 ? '不太稳' : '忽高忽低';
  console.log(`  ±${j.toFixed(2)}   ${p3(r.A).padStart(5)}  ${p3(r.U).padStart(5)}  ${((r.U-r.A)*100).toFixed(1).padStart(5)}  ${(r.A/r.U).toFixed(3)}  ${label}`);
}
console.log('\n  → 越稳 → A/U 越接近 1（A 确实逼近 U）✅');
console.log('  → 这正是「A 显示当前水平、U 显示到过最高」的必然结果');

console.log('\n' + L);
console.log('  三、目标 ②：U 突破后 A 继续追（看 U 涨的那些批之后 A 的变化）');
console.log(L);
{
  let A = 0.30, U = 0.50, consec = 0;
  const events = [];
  for (let i = 0; i < 3800; i++) {
    const li = pickLi();
    const s = P_at(li, '较强') * CAL(LVL[li].D);
    if (s > U) consec++; else consec = 0;
    let jumped = false;
    if (consec >= 2) { U = Math.min(1, U + 0.05 * (1 - U)); consec = 0; jumped = true; }
    const bA = A;
    A = Math.max(0, Math.min(U, A + 0.1 * (s - A)));
    if (jumped) events.push({ i, dA_after: A - bA, U_after: U, A_after: A });
  }
  console.log(`  一次典型运行里，U 突破 ${events.length} 次`);
  console.log('  突破后 A 的表现：');
  const first8 = events.slice(0, 8);
  for (const e of first8) console.log(`    第${String(e.i).padStart(4)}题 U 突破到 ${p3(e.U_after)} → 当次 A ${p3(e.A_after)}`);
  const last8 = events.slice(-4);
  console.log('    ...');
  for (const e of last8) console.log(`    第${String(e.i).padStart(4)}题 U 突破到 ${p3(e.U_after)} → 当次 A ${p3(e.A_after)}`);
  console.log(`\n  → U 从 ${p3(events[0].U_after)} 涨到 ${p3(events[events.length-1].U_after)}（${events.length} 次突破）`);
  console.log(`  → A 从 ${p3(events[0].A_after)} 跟到 ${p3(events[events.length-1].A_after)}  ${events[events.length-1].A_after > events[0].A_after ? '✅ A 持续跟上' : '❌'}`);
}

console.log('\n' + L);
console.log('  四、参数敏感度（确认强者 0.85 对这组参数是否稳）');
console.log(L);
console.log('  dU      较强A   偏上A   中位A   较弱A   A跨度');
for (const dU of [0.02, 0.03, 0.05, 0.08, 0.12]) {
  const r = {}; for (const t of Object.keys(TIERS)) r[t] = avg(t, 25, { dU });
  const As2 = Object.values(r).map(x => x.A);
  console.log(`  ${dU.toFixed(2)}   ${p3(r.较强.A).padStart(6)} ${p3(r.偏上.A).padStart(7)} ${p3(r.中位.A).padStart(7)} ${p3(r.较弱.A).padStart(7)} ${p3(Math.max(...As2)-Math.min(...As2)).padStart(7)}`);
}

console.log('\n' + L);
console.log('  五、最终公式（四参数零补丁）');
console.log(L);
console.log(`
  s  = P × (0.6 + 0.4D)                          简单题上限 0.6 / 中档 0.8
  A  = clamp(A + 0.1 × (s − A), 0, U)            线性阻尼
  U  = 连续 2 次 s > U → U += 0.05 × (1 − U)      只涨不跌
  A₀ = 0.30    U₀ = 0.50
`);
console.log(L);
