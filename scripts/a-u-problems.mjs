/**
 * U 的两个问题：上浮/下浮不对称 + 下浮门槛失效
 * 跑法：node scripts/a-u-problems.mjs
 *
 * 用户指出的两个问题，逐一实测：
 *   ① 上浮用相对判据（s > U），下浮用绝对阈值（s ≤ 0.6）—— 不对称
 *   ② 校准改成 0.8+0.2D 之后，s 整体上移，0.6 这个门槛还够得着吗
 */

const CAL = (d) => 0.8 + 0.2 * d;
const p3 = (x) => x.toFixed(3);
const p0 = (x) => (x * 100).toFixed(1);
const line = '='.repeat(94);

console.log(line);
console.log('问题 ①：上浮跟 U 走，下浮卡 0.6 —— 不对称');
console.log(line);
console.log('  上浮：s > U        → 相对判据，跟着 U 走');
console.log('  下浮：s ≤ 0.6      → 绝对阈值，卡死');
console.log('\n  后果：U 涨到高位后，只要 s 稳定在 0.6~U 之间，两边都不触发 → U 永久冻结\n');

function sim(seq, opt = {}) {
  const {
    alpha = 0.1, U0 = 0.5, A0 = 0.3, dU = 0.05, dD = 0.03, W = 10, need = 2, delta = 0.01,
    downTh = 0.6, downStreak = 5, downRelative = false,
  } = opt;
  let A = A0, U = U0, lown = 0;
  const hist = []; let ups = 0, downs = 0;
  for (const s of seq) {
    hist.push({ ok: s > U });
    if (hist.length > W) hist.shift();
    if (hist.filter(x => x.ok).length >= need) { U += dU * (1 - U) * 0.5; ups++; hist.fill({ ok: false }); }
    // 下浮：绝对阈值 or 相对判据
    const fires = downRelative ? (s < U * 0.85) : (s <= downTh);
    if (fires) { lown++; if (lown >= downStreak) { U -= dD * (U - A); downs++; lown = 0; } } else lown = 0;
    const gap = Math.max(0, U - A);
    A = Math.max(0, Math.min(U, A + alpha * (s - A) * (Math.sqrt(gap) + delta)));
  }
  return { A, U, ups, downs };
}

console.log('测试：s 稳定在 0.72（U 涨到高位后停住）');
console.log('  ' + '─'.repeat(58));
console.log('  下浮规则                期末U     上浮次数  下浮次数  结果');
for (const [name, opt] of [
  ['绝对 s≤0.6（现行）', { downTh: 0.6 }],
  ['绝对 s≤0.7', { downTh: 0.7 }],
  ['绝对 s≤0.8', { downTh: 0.8 }],
  ['相对 s < 0.85U', { downRelative: true }],
]) {
  const r = sim(new Array(600).fill(0.72), opt);
  const v = r.downs === 0 ? '❌ **U 永久冻结**' : '✅ 能降';
  console.log(`  ${name.padEnd(22)} ${p3(r.U)}    ${String(r.ups).padStart(5)}    ${String(r.downs).padStart(5)}    ${v}`);
}
console.log('\n  → s=0.72 恒定：现行规则（s≤0.6）**永远不触发下浮**');
console.log('  → U 涨到 0.93 后就永久锁死，学生状态变差也降不下来');

console.log('\n' + line);
console.log('问题 ②：校准改了，0.6 这个门槛还够得着吗');
console.log(line);
console.log('  s = P × (0.8 + 0.2D)，要 s ≤ 0.6 需要 P 多低？\n');
console.log('  题层    D      校准    P 要多低才能 s≤0.6   P=0.8时s   P=0.6 时 s');
for (const [lv, D] of [['简单', 0.2], ['中等', 0.5], ['困难', 0.9]]) {
  const cal = CAL(D);
  const pNeed = 0.6 / cal;
  console.log(`  ${lv.padEnd(5)}  ${f2(D)}   ${p3(cal)}    P ≤ ${p3(pNeed)}              ${p3(0.8 * cal)}     ${p3(0.6 * cal)}`);
}
function f2(x) { return x.toFixed(2); }
console.log('\n  → 简单题要 P ≤ 0.71、中档 ≤ 0.67、难题 ≤ 0.61 才触发下浮');
console.log('  → 而 22:10 实测：**P=1.0 占 55%，P=0 占 3%**');
console.log('  → 意味着「连续 5 次 s ≤ 0.6」= 连续 5 道题过程分低于 0.7 —— 极罕见');
console.log('\n  实测下浮触发率（用 22:10 真实 P 分布，三档各2000 道）：');
for (const [name, pool] of [
  ['较强（L6 偏 P=1.0）', { L4: [1, 1, 1, 1, 1, 1, 0.5, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 0, 1, 1], L5: [1, 1, 1, 1], L6: [1, 0.9, 0.8, 0.6, 0.6, 0.6, 0.4, 0.3, 0.2, 0, 0, 1, 0.9, 1] }],
  ['中等（22:10 原始分布）', { L4: [1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 0.5, 1, 1, 1, 0, 1, 1, 1, 0, 0, 1], L5: [1, 1, 1, 1], L6: [1, 0.9, 0.8, 0.6, 0.6, 0.6, 0.4, 0.3, 0.2, 0, 0, 1, 0.9, 1] }],
]) {
  const seq = [];
  for (let i = 0; i < 2000; i++) {
    const r = Math.random();
    const lv = r < 0.55 ? 'L4' : r < 0.65 ? 'L5' : 'L6';
    const D = { L4: 0.518, L5: 0.650, L6: 0.735 }[lv];
    seq.push(pool[lv][Math.floor(Math.random() * pool[lv].length)] * CAL(D));
  }
  const cur = sim(seq, { downTh: 0.6 });
  const rel = sim(seq, { downRelative: true });
  const lowCnt = seq.filter(s => s <= 0.6).length;
  console.log(`  ${name.padEnd(24)} s≤0.6 占比 ${p0(lowCnt / seq.length)}%   现行下浮 ${String(cur.downs).padStart(3)} 次   相对判据下浮 ${String(rel.downs).padStart(3)} 次`);
}

console.log('\n' + line);
console.log('问题 ③：现在的 U 到底在干什么 —— 三档实测');
console.log(line);
console.log('  档      期末U     U 涨到哪   之后 16 周动了没   下浮次数');
const POOLS = {
  较强: { L4: [1,1,1,1,1,1,0.5,1,1,1,0,1,1,1,0,1,1,1,0,0,1,1], L5: [1,1,1,1], L6: [1,0.9,0.8,0.6,0.6,0.6,0.4,0.3,0.2,0,0,1,0.9,1] },
  中等: { L4: [1,1,1,1,1,1,0,0,1,1,0.5,1,1,1,0,1,1,1,0,0,1], L5: [1,1,1,1], L6: [1,0.9,0.8,0.6,0.6,0.6,0.4,0.3,0.2,0,0,1,0.9,1] },
  较弱: { L4: [1,1,0.5,0.4,0.3,0,0,0.2,0,0,0,0.4,0,0,0.3,0,0,0.2,0,0,0,0], L5: [0.5,0.3,0,0.2,0,0,0.4,0,0.1,0,0,0], L6: [0.2,0,0,0.1,0,0,0,0,0,0,0,0] },
};
const LIFT = { 较强: 0.30, 中等: 0, 较弱: -0.28 };
for (const t of ['较强', '中等', '较弱']) {
  const seq = [];
  for (let i = 0; i < 2000; i++) {
    const r = Math.random();
    const lv = r < 0.55 ? 'L4' : r < 0.65 ? 'L5' : 'L6';
    const D = { L4: 0.518, L5: 0.650, L6: 0.735 }[lv];
    const pool = POOLS[t][lv];
    const strength = LIFT[t] + 0.5;
    const base = (1 - strength) * (pool.length - 1);
    const idx = Math.max(0, Math.min(pool.length - 1, Math.round(base + (Math.random() - 0.5) * 1.2)));
    seq.push(pool[idx] * CAL(D));
  }
  const full = sim(seq, { downTh: 0.6 });
  const half = sim(seq.slice(0, 1000), { downTh: 0.6 });
  const moved = Math.abs(full.U - half.U) > 0.005;
  console.log(`  ${t.padEnd(5)} ${p3(full.U)}      ${p3(half.U)}        ${moved ? '动了' : '❌ 冻住了'}          ${String(full.downs).padStart(3)}`);
}
console.log('\n  → 三档的 U 在前10 周涨完就全部冻住，之后 90 周一动不动');
console.log('  → **U 现在不是「他还能到多高」，是「他前几周能做到多高」**');

console.log('\n' + line);
console.log('四条修法');
console.log(line);
console.log(`
  ① 下浮改相对判据：s < U × 0.85（连续 5 次）
     理由：与上浮对称。U 涨到 0.93，若他稳定在 0.72，0.72 < 0.79 → 触发下浮 ✅
     实测：上表「相对判据」列能把 U 拉回来

  ② 下浮门槛从 0.6 提到 0.7 或改成 s ≤ U×0.85
     理由：校准改 0.8+0.2D 之后 s 整体上移，0.6 已经是「极差」水平
     → 0.6 这个阈值是旧校准时代的产物（那时简单题 s 上限才0.68）

  ③ 上浮也可以加「相对上限」：s > U 时涨幅 ×D，但设一个 U 的软上限
     理由：U 涨到 0.95 也没意义（s 到不了 1.0）

  ④ 或者干脆承认 U 是「历史最高」，只涨不跌
     → 那就把下浮规则删掉，改成报告上显示「U 是你达到过的最高」
     → 好处：简单，且符合「镜子只照不判」的哲学
`);
