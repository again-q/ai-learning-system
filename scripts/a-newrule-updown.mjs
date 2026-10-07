/**
 * 新规则验证：U 上浮改为「连续 2 次 s > U」
 * 跑法：node scripts/a-newrule-updown.mjs
 *
 * 用户手算的强学生 s 序列（100 次，10 次一阶段）
 * 结论待验：A 能否到 0.93
 */

const p0 = (x) => (x * 100).toFixed(1);
const p2 = (x) => x.toFixed(3);
const line = '='.repeat(86);

// ── 用户给的 s 序列 ──
const STAGES = [
  [1, 10, 0.35, '刚学，不熟练'],
  [11, 20, 0.50, '开始掌握'],
  [21, 30, 0.65, '进步明显'],
  [31, 40, 0.75, '良好'],
  [41, 50, 0.82, '优秀'],
  [51, 60, 0.86, '更稳'],
  [61, 70, 0.89, '接近精通'],
  [71, 80, 0.91, '高水平'],
  [81, 90, 0.93, '稳定卓越'],
  [91, 100, 0.95, '近乎完美'],
];
const SEQ = [];
for (const [a, b, s] of STAGES) for (let i = a; i <= b; i++) SEQ.push(s);

// ── 模拟 ──
function sim(seq, opt = {}) {
  const { alpha = 0.25, U0 = 0.50, A0 = 0.30, deltaU = 0.05, deltaD = 0.03, streakUp = 2, downTh = 0.6, streakDown = 5 } = opt;
  let A = A0, U = U0, hi = 0, lo = 0, ups = 0, downs = 0;
  const log = [];
  seq.forEach((s, i) => {
    const bA = A, bU = U;
    // 上浮：连续 2 次 s > U
    if (s > U) hi++; else hi = 0;
    if (hi >= streakUp) { U += deltaU * (1 - U); ups++; hi = 0; }
    // 下浮：连续 5 次 s ≤ 0.6
    if (s <= downTh) { lo++; if (lo >= streakDown) { U -= deltaD * (U - A); downs++; lo = 0; } } else lo = 0;
    A = Math.max(0, Math.min(U, A + alpha * (s - A) * (U - A)));
    log.push({ n: i + 1, s, A, U, dA: A - bA, dU: U - bU, ups, downs });
  });
  return { A, U, ups, downs, log };
}

const r = sim(SEQ);

console.log(line);
console.log('新规则：U 上浮 = 连续 2 次 s > U   （下浮不变：连续 5 次 s ≤ 0.6）');
console.log(line);
console.log('  A₀=0.30  U₀=0.50  α=0.25  δᵤ=0.05  δ_d=0.03');
console.log(`  s 序列：${STAGES.map(x => x[2]).join(' → ')}（每阶段 10 次）\n`);

console.log('   n     s     A        U       ΔA         ΔU        累计上浮/下浮');
console.log('  ' + '─'.repeat(72));
r.log.forEach(e => {
  const mark = e.n % 10 === 0 ? '  ← 阶段末' : '';
  console.log(`  ${String(e.n).padStart(3)}  ${p2(e.s)}  ${p0(e.A).padStart(6)}  ${p0(e.U).padStart(6)}  ${(e.dA >= 0 ? '+' : '')}${(e.dA * 100).toFixed(2).padStart(6)}  ${(e.dU >= 0 ? '+' : '')}${(e.dU * 100).toFixed(2).padStart(6)}    ${String(e.ups).padStart(3)} / ${String(e.downs).padStart(3)}${mark}`);
});

console.log('\n' + line);
console.log('阶段汇总 vs 你的手算');
console.log(line);
console.log('  阶段   s      你的A    实测A     你的U    实测U');
console.log('  ' + '─'.repeat(58));
const rows = [
  [0, '初始', 0.30, 0.30, 0.50, 0.50],
  [10, '刚学', 0.33, null, 0.49, null],
  [20, '开始掌握', 0.40, null, 0.50, null],
  [30, '进步明显', 0.55, null, 0.63, null],
  [40, '良好', 0.65, null, 0.73, null],
  [50, '优秀', 0.75, null, 0.80, null],
  [60, '更稳', 0.80, null, 0.84, null],
  [70, '接近精通', 0.84, null, 0.87, null],
  [80, '高水平', 0.87, null, 0.90, null],
  [90, '稳定卓越', 0.90, null, 0.92, null],
  [100, '近乎完美', 0.93, null, 0.94, null],
];
for (const [n, label, aE, , uE] of rows) {
  const e = n === 0 ? { A: 0.30, U: 0.50 } : r.log[n - 1];
  const aAct = aE == null ? p0(e.A) : p0(aE);
  const uAct = uE == null ? p0(e.U) : p0(uE);
  const dA = aE == null ? '' : (Math.abs(e.A - aE) < 0.01 ? '✅' : `差${((e.A - aE) * 100).toFixed(1)}`);
  const dU = uE == null ? '' : (Math.abs(e.U - uE) < 0.01 ? '✅' : `差${((e.U - uE) * 100).toFixed(1)}`);
  console.log(`  第${String(n).padStart(3)}次  ${p2(n === 0 ? 0 : e.s)}  ${String(aE == null ? '' : p0(aE)).padStart(6)}   ${aAct.padStart(6)} ${dA.padStart(8)}   ${String(uE == null ? '' : p0(uE)).padStart(6)}   ${uAct.padStart(6)} ${dU.padStart(8)}`);
}

console.log('\n' + line);
console.log('最终结果');
console.log(line);
console.log(`  A = ${p0(r.A)}   U = ${p0(r.U)}   上浮 ${r.ups} 次   下浮 ${r.downs} 次`);
console.log(`  你的预期 A=0.93 / U=0.94 → ${Math.abs(r.A - 0.93) < 0.015 ? '✅ A 命中' : `❌ A 差 ${((r.A - 0.93) * 100).toFixed(1)} 点`}  ${Math.abs(r.U - 0.94) < 0.015 ? '✅ U 命中' : `❌ U 差 ${((r.U - 0.94) * 100).toFixed(1)} 点`}`);

console.log('\n' + line);
console.log('一个必须指出的问题：上浮和下浮在前 20 次同时触发');
console.log(line);
console.log('  s=0.35 / 0.50 阶段：s > U（触发上浮）但 s ≤ 0.6（也触发下浮）');
console.log('  两条规则在同一个 s 序列上竞争：');
console.log('  ' + '─'.repeat(58));
console.log('     n     s     A        U       备注');
r.log.slice(0, 22).forEach(e => {
  let note = '';
  if (e.dU > 0) note = '↑上浮';
  if (e.dU < 0) note = '↓下浮';
  if (e.n <= 2 || (e.dU !== 0 && e.n <= 20) || e.n === 20) {
    console.log(`    ${String(e.n).padStart(3)}  ${p2(e.s)}  ${p0(e.A).padStart(6)}  ${p0(e.U).padStart(6)}   ${note}`);
  }
});
console.log(`
  → 第 11 次 s=0.50 > U=0.49 触发上浮 → U 涨到 0.515
  → 但 s=0.50 ≤ 0.6，落进下浮计数，第 15、20 次各触发一次下浮
  → 两条规则互相抵消，U 在 0.49~0.52 之间来回
`);

console.log('\n' + line);
console.log('验证：下浮规则去掉后会怎样');
console.log(line);
const r2 = sim(SEQ, { streakDown: 999 });
console.log(`  保留上下浮：A=${p0(r.A)} U=${p0(r.U)}`);
console.log(`  去掉下浮：  A=${p0(r2.A)} U=${p0(r2.U)}`);
console.log(`\n  → 差异 ${(((r2.A - r.A)) * 100).toFixed(1)} 点 —— 下浮规则在前期确实在拖后腿`);

console.log('\n' + line);
console.log('对照：旧规则（s ≥ 0.8 绝对阈值）跑同一条 s 序列');
console.log(line);
function simOld(seq) {
  let A = 0.30, U = 0.50, hi = 0, lo = 0;
  seq.forEach(s => {
    if (s >= 0.8) hi++; else hi = 0;
    if (hi >= 2) { U += 0.05 * (1 - U); hi = 0; }
    if (s <= 0.6) { lo++; if (lo >= 5) { U -= 0.03 * (U - A); lo = 0; } } else lo = 0;
    A = Math.max(0, Math.min(U, A + 0.25 * (s - A) * (U - A)));
  });
  return { A, U };
}
const ro = simOld(SEQ);
console.log(`  旧规则（s≥0.8）：A=${p0(ro.A)}  U=${p0(ro.U)}`);
console.log(`  新规则（s>U）  ：A=${p0(r.A)}  U=${p0(r.U)}`);
console.log(`\n  → 旧规则下 U 停在 0.91 附近（A 的不动点），且 A 只能到 ${p0(ro.A)}`);
console.log(`  → 新规则下 U 跟着 s 一直涨到 ${p0(r.U)}，A 跟着到 ${p0(r.A)}`);

console.log('\n' + line);
console.log('新规则的代价 —— 逐项');
console.log(line);
console.log(`
  ① U 永远追着 s 跑 → U 不再是「能力上限」，是「最近表现的移动上限」
     后果：学生做难题表现好，U 就涨；一停止练习，s 掉下来 U 才开始下浮
     → U 变成了「状态」而不是「上限」，跟A 的区分度下降

  ② 抗噪性变差：s 只要连续 2次比 U 高 0.001 就能涨 U
     → 判定层P 的微小抖动会直接传到 U

  ③ 但它解决了真问题：早期（s=0.35）不被绝对阈值挡住
     旧规则下 s=0.35 永远 < 0.8，U 从 0.50 起步就永远上不去
`);

console.log('\n' + line);
console.log('第三条路：保留绝对阈值，但让它随 A 走');
console.log(line);
console.log('  门槛 = max(0.8, A + 0.1)  或  门槛 = 0.8 但要求 s是历史新高');
console.log('  —— 这样早期 0.8 门槛不变（保留「突破」语义），后期 A 超过 0.8 后自动放开');
console.log('  跑一遍看：');
function simThresh(seq, mode) {
  let A = 0.30, U = 0.50, hi = 0, lo = 0, best = 0;
  seq.forEach(s => {
    const th = mode === 'adaptive' ? Math.max(0.8, A + 0.1) : 0.8;
    if (s >= th) hi++; else hi = 0;
    if (hi >= 2) { U += 0.05 * (1 - U); hi = 0; }
    if (s <= 0.6) { lo++; if (lo >= 5) { U -= 0.03 * (U - A); lo = 0; } } else lo = 0;
    A = Math.max(0, Math.min(U, A + 0.25 * (s - A) * (U - A)));
    best = Math.max(best, s);
  });
  return { A, U };
}
for (const mode of ['fixed', 'adaptive']) {
  const rr = simThresh(SEQ, mode);
  console.log(`    ${mode === 'fixed' ? '固定 0.8      ' : 'max(0.8, A+0.1)'}  A=${p0(rr.A)}  U=${p0(rr.U)}`);
}
