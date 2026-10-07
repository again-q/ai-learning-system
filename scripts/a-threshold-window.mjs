/**
 * 门槛的可行窗口扫描
 * 跑法：node scripts/a-threshold-window.mjs
 */
const D = { 简单: 0.2, 中等: 0.5, 困难: 0.85 };
const SEGS = { 简单: 3, 中等: 5, 困难: 7 };
const CAL = (d) => 0.6 + 0.4 * d;
const p0 = (x) => (x * 100).toFixed(1);
const line = '='.repeat(78);

function sim(profile, th, opt = {}) {
  const { alpha = 0.25, U0 = 0.5, deltaU = 0.05, streak = 2 } = opt;
  let A = 0.30, U = U0, hi = 0, ups = 0;
  const byLv = { 简单: 0, 中等: 0, 困难: 0 };
  for (const o of profile) {
    const q = 1 - o.brk / SEGS[o.lv];
    const s = o.P * CAL(o.D) * q;
    if (s >= th) hi++; else hi = 0;
    if (hi >= streak) { U += deltaU * (1 - U); ups++; byLv[o.lv]++; hi = 0; }
    A = Math.max(0, Math.min(U, A + alpha * (s - A) * (U - A)));
  }
  return { A, U, ups, byLv };
}

function makeStrong(hardMode) {
  const p = [];
  for (let i = 0; i < 70; i++) p.push({ lv: '简单', D: D.简单, P: 1, brk: 0 });
  for (let i = 0; i < 20; i++) p.push({ lv: '中等', D: D.中等, P: 1, brk: 0 });
  const sets = {
    断1: [[0.9, 1], [0.9, 1], [0.9, 1], [0.85, 1], [0.9, 1], [0.9, 1], [0.9, 1], [0.9, 1], [0.8, 1], [0.9, 1]],
    断0: [[0.9, 0], [0.9, 0], [0.9, 0], [0.85, 0], [0.9, 0], [0.9, 0], [0.9, 0], [0.9, 0], [0.8, 0], [0.9, 0]],
  };
  sets[hardMode].forEach(([P, brk]) => p.push({ lv: '困难', D: D.困难, P, brk }));
  return p;
}

console.log(line);
console.log('门槛的可行窗口 —— 简单题上限 0.680，难题（断1段）上限 0.725');
console.log(line);
console.log('  门槛必须 > 0.680（否则简单题白涨 U）');
console.log('  门槛必须 ≤ 0.725（否则难题做对也不涨 U）');
console.log('  → 理论窗口只有 0.680 ~ 0.725，宽度 0.045\n');

for (const hardMode of ['断1', '断0']) {
  const prof = makeStrong(hardMode);
  console.log(`  【较强学生 · 难题 P≈0.9 断${hardMode.slice(1)}段】`);
  console.log('    门槛      A      U     上浮   简单/中等/困难         判定');
  console.log('    ' + '─'.repeat(64));
  for (const th of [0.85, 0.80, 0.75, 0.725, 0.72, 0.70, 0.69, 0.68, 0.65, 0.60]) {
    const r = sim(prof, th);
    const t = `${r.byLv.简单}/${r.byLv.中等}/${r.byLv.困难}`;
    let v;
    if (r.byLv.简单 > 0) v = '❌ 简单题混进来';
    else if (r.A >= 0.78) v = '✅ 命中 0.8';
    else if (r.A >= 0.65) v = '🟡 接近';
    else v = '⚠️ 上浮不足';
    if (th > 0.80) v = '⬆ 门槛过高，难题被挡';
    console.log(`    ${th.toFixed(3)}   ${p0(r.A).padStart(5)} ${p0(r.U).padStart(6)} ${String(r.ups).padStart(5)}   ${t.padEnd(14)}  ${v}`);
  }
  console.log('');
}

console.log(line);
console.log('窗口内最优门槛细扫（难题断 1 段的情形）');
console.log(line);
const prof = makeStrong('断1');
let best = null;
for (let th = 0.681; th <= 0.7255; th += 0.002) {
  const r = sim(prof, +th.toFixed(3));
  if (r.byLv.简单 === 0 && (!best || r.A > best.A)) best = { th: +th.toFixed(3), ...r };
}
if (best) {
  console.log(`  最优门槛 = ${best.th}   A = ${p0(best.A)}   U = ${p0(best.U)}   上浮 ${best.ups} 次`);
  console.log(`  上浮来源：简单 ${best.byLv.简单} / 中等 ${best.byLv.中等} / 困难 ${best.byLv.困难}`);
  console.log(`\n  → 即使卡在窗口最优，${strongNote()}`);
}
function strongNote() {
  const b = sim(prof, 0.80);
  return `A 只能到 ${p0(best.A)}，而门槛 0.8 时是 ${p0(b.A)} —— 提升 ${((best.A - b.A) * 100).toFixed(1)} 点。`;
}

console.log('\n' + line);
console.log('为什么窗口这么窄：三个数的相对位置是被 0.6+0.4D 固定的');
console.log(line);
console.log(`
  简单题校准 = 0.6 + 0.4×0.20 = ${CAL(0.2).toFixed(3)}
  中等题校准 = 0.6 + 0.4×0.50 = ${CAL(0.5).toFixed(3)}
  困难题校准 = 0.6 + 0.4×0.85 = ${CAL(0.85).toFixed(3)}

  难题 P=0.9 时：s = 0.9 × ${CAL(0.85).toFixed(3)} × (1−1/7) = ${(0.9 * CAL(0.85) * (6 / 7)).toFixed(3)}
  简单题 P=1.0 时：s = 1.0 × ${CAL(0.2).toFixed(3)} × 1.000 = ${CAL(0.2).toFixed(3)}

  两者之差 = ${(0.9 * CAL(0.85) * (6 / 7) - CAL(0.2)).toFixed(3)}

  而门槛必须落在这个 0.045 的缝里 —— 只要 D 的取值分布稍变（简单题 D 到 0.3），
  缝就消失。这不是「参数没调好」，是三个参数被同一个线性式绑在一起，
  门槛没有自由度。
`);
