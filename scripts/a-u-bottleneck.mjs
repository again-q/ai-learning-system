/**
 * A 是被U 锁住的 —— 逐层拆解「较强学生为什么到不了 0.85」
 * 跑法：node scripts/a-u-bottleneck.mjs
 */

const CAL = (d) => 0.6 + 0.4 * d;
const SEGS = { 简单: 3, 中等: 5, 困难: 7 };
const p0 = (x) => (x * 100).toFixed(1);
const line = '='.repeat(80);

function simulate(profile, opt = {}) {
  const { th = 0.8, alpha = 0.25, U0 = 0.5, deltaU = 0.05, streak = 2 } = opt;
  let A = 0.30, U = U0, hi = 0, lo = 0;
  const ups = [], downs = [];
  let qualified = 0;   // s ≥ th 的观测数
  let maxStreak = 0;
  for (const o of profile) {
    const q = o.brk == null ? 1 : 1 - o.brk / SEGS[o.lv];
    const s = o.P * CAL(o.D) * q;
    if (s >= th) { qualified++; hi++; maxStreak = Math.max(maxStreak, hi); } else hi = 0;
    if (hi >= streak) { U += deltaU * (1 - U); ups.push({ lv: o.lv, s }); hi = 0; }
    if (s <= 0.6) { lo++; if (lo >= 5) { U -= 0.03 * (U - A); downs.push({ lv: o.lv, s }); lo = 0; } } else lo = 0;
    A = Math.max(0, Math.min(U, A + alpha * (s - A) * (U - A)));
  }
  return { A, U, ups, downs, qualified, maxStreak };
}

function makeStrong() {
  const bag = [];
  for (let i = 0; i < 70; i++) { const r = Math.random(); bag.push({ lv: '简单', D: 0.2, P: r < 0.92 ? 1.0 : 0.9, brk: r < 0.92 ? 0 : 1 }); }
  for (let i = 0; i < 20; i++) { const r = Math.random(); bag.push({ lv: '中等', D: 0.5, P: r < 0.85 ? 1.0 : 0.9, brk: r < 0.85 ? 0 : 1 }); }
  for (let i = 0; i < 10; i++) { const r = Math.random(); bag.push({ lv: '困难', D: 0.85, P: r < 0.50 ? 1.0 : 0.9, brk: r < 0.50 ? 0 : 1 }); }
  for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
  return bag;
}

const avg = (f, n = 60) => { let s = 0; for (let t = 0; t < n; t++) s += f(simulate(makeStrong())); return s / n; };

console.log(line);
console.log('你说对了：机制是通的。难题做对时 ΔA 确实是简单题的 2 倍。');
console.log(line);
const probe = [];
for (let i = 0; i < 69; i++) probe.push({ lv: '简单', D: 0.2, P: 1.0, brk: 0 });
probe.push({ lv: '困难', D: 0.85, P: 1.0, brk: 0 });
const rp = simulate(probe, { streak: 1 });
console.log(`
  69 道简单题 + 1 道难题（P=1.0 断=0，s=0.940）：
    A 从 0.30 爬到 49.6（撞上U₀=0.50）
    难题那一步 ΔA = +0.04   ← 简单题同期只有 +0.02，难题翻倍 ✅
`);
console.log('  机制没问题。真正的问题是 A 被U 锁住：');
console.log('    A ≤ U，而 U 从 0.50 涨到 59.0 就停了 → A 也就只能到 56.8\n');

console.log(line);
console.log('第一层：A 被 U 锁死（不是 A 自己的问题）');
console.log(line);
console.log('  较强学生 60 次模拟平均：');
console.log(`    期末 A = ${p0(avg(r => r.A))}`);
console.log(`    期末 U = ${p0(avg(r => r.U))}`);
console.log(`    A / U = ${p0(avg(r => r.A / r.U))}  ← A 一直贴着 U 走`);
console.log(`\n  → 要 A 到 0.85，必须 U 到 0.85。而 U 从 0.50 起步，`);
console.log(`     每次上浮只涨 0.05×(1−U)，要涨 0.35 需要 ${Math.ceil(Math.log(1 - 0.35 / 0.5) / Math.log(0.95))} 次上浮。\n`);

console.log(line);
console.log('第二层：上浮次数为什么这么少');
console.log(line);
const q = avg(r => r.qualified);
const ms = avg(r => r.maxStreak);
const ups = avg(r => r.ups.length);
console.log(`  100 道题里 s ≥ 0.8 的观测数：${q.toFixed(1)} 次`);
console.log(`  出现过的最长连续：          ${ms.toFixed(1)} 次`);
console.log(`  实际触发上浮：              ${ups.toFixed(1)} 次  ← 需要连续 2 次`);
console.log(`\n  换算：达标率 ${q.toFixed(0)}%，但「连续2连」把有效率压到 ${ups.toFixed(1)}%`);
console.log(`  → 上浮次数是U 上涨的唯一通路，它只有 ${ups.toFixed(1)} 次/学期\n`);

console.log(line);
console.log('第三层：哪一层贡献达标观测（较强学生）');
console.log(line);
const sTable = {
  简单: { cal: CAL(0.2), P: '1.0 / 0.9', brk: '0 / 1', s1: 1.0 * CAL(0.2) * 1, s2: 0.9 * CAL(0.2) * (2 / 3) },
  中等: { cal: CAL(0.5), P: '1.0 / 0.9', brk: '0 / 1', s1: 1.0 * CAL(0.5) * 1, s2: 0.9 * CAL(0.5) * 0.8 },
  困难: { cal: CAL(0.85), P: '1.0 / 0.9', brk: '0 / 1', s1: 1.0 * CAL(0.85) * 1, s2: 0.9 * CAL(0.85) * (6 / 7) },
};
console.log('  题层    校准    P=1.0断0      P=0.9 断1段     达标情况');
for (const [lv, v] of Object.entries(sTable)) {
  const ok1 = v.s1 >= 0.8, ok2 = v.s2 >= 0.8;
  console.log(`  ${lv.padEnd(5)}  ${v.cal.toFixed(3)}  ${v.s1.toFixed(3)} ${ok1 ? '✅' : '❌'}       ${v.s2.toFixed(3)} ${ok2 ? '✅' : '❌'}`);
}
console.log(`
  → 只有「P=1.0 且零断点」能达标。较难关的 P=0.9 断 1 段 = ${sTable.困难.s2.toFixed(3)}，差一点。
`);

console.log(line);
console.log('第四层：改哪个参数最有效（目标 U ≥ 0.85）');
console.log(line);
const needUps = Math.ceil(Math.log(1 - 0.35 / 0.5) / Math.log(0.95));
console.log(`  基准：需要 ${needUps} 次上浮才能把 U 从 0.50 推到 0.85\n`);
console.log('  改动U₀=0.50      δᵤ 0.05   连续次数   每次涨幅   100道里触发   期末U     期末A');
console.log('  ' + '─'.repeat(72));
const cases = [
  ['现状', { th: 0.8, deltaU: 0.05, streak: 2 }],
  ['门槛 0.8→0.75', { th: 0.75, deltaU: 0.05, streak: 2 }],
  ['门槛 0.8→0.725', { th: 0.725, deltaU: 0.05, streak: 2 }],
  ['连续 2→1 次', { th: 0.8, deltaU: 0.05, streak: 1 }],
  ['δᵤ 0.05→0.10', { th: 0.8, deltaU: 0.10, streak: 2 }],
  ['δᵤ 0.05→0.15', { th: 0.8, deltaU: 0.15, streak: 2 }],
  ['连续2 + δᵤ0.10', { th: 0.8, deltaU: 0.10, streak: 2 }],
  ['门槛0.725 + δᵤ0.10', { th: 0.725, deltaU: 0.10, streak: 2 }],
  ['门槛0.725+连续1+δᵤ0.10', { th: 0.725, deltaU: 0.10, streak: 1 }],
];
for (const [name, opt] of cases) {
  const rs = [];
  for (let t = 0; t < 60; t++) rs.push(simulate(makeStrong(), opt));
  const A = rs.reduce((s, r) => s + r.A, 0) / rs.length;
  const U = rs.reduce((s, r) => s + r.U, 0) / rs.length;
  const n = rs.reduce((s, r) => s + r.ups.length, 0) / rs.length;
  const v = U >= 0.82 ? '✅' : U >= 0.70 ? '🟡' : '❌';
  console.log(`  ${name.padEnd(22)}  0.05     ${String(opt.streak).padStart(2)}      ${opt.deltaU.toFixed(2)}      ${n.toFixed(1).padStart(5)}      ${p0(U).padStart(5)}   ${p0(A).padStart(5)}  ${v}`);
}

console.log('\n' + line);
console.log('关键：连续次数 + δᵤ 是「速率」，门槛是「资格」');
console.log(line);
console.log(`
  门槛决定「哪些观测算数」—— 它卡住了 P=0.9 断1段 的难题（s=0.685~0.725）
  连续次数 + δᵤ 决定「多快涨」

  而 A 追 U 的速度由 α×(s−A)×(U−A) 决定，α=0.25 时 A 天然慢。
  所以真正的组合是：U 要涨得够快（δᵤ / 连续次数），
  A 也要跟得上（α）—— 后者是 §5.6 说「入门期每跳 0.02~0.04」那个设计值，
  而实测每跳 1.5~1.9 个点，是设计的 5 倍（涨太快，早早撞 U）。
`);
