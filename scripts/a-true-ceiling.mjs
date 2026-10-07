/**
 * A 的真实天花板 = s 的加权平均（不是 U）
 * 跑法：node scripts/a-true-ceiling.mjs
 *
 * 上一轮发现：U 到了 99.7，但 A 只到 70.3 → A/U = 70.6%
 * 这一版解释为什么
 */

const CAL = (d) => 0.6 + 0.4 * d;
const SEGS = { 简单: 3, 中等: 5, 困难: 7 };
const p0 = (x) => (x * 100).toFixed(1);
const line = '='.repeat(84);

function makeWeek(kind) {
  const bag = [];
  for (let i = 0; i < 70; i++) { const r = Math.random(); if (kind === '强') bag.push({ lv: '简单', D: 0.2, P: r < 0.93 ? 1.0 : 0.9, brk: r < 0.93 ? 0 : 1 }); else if (kind === '中') bag.push({ lv: '简单', D: 0.2, P: r < 0.82 ? 1.0 : r < 0.96 ? 0.8 : 0.5, brk: r < 0.82 ? 0 : r < 0.96 ? 1 : 2 }); else bag.push({ lv: '简单', D: 0.2, P: r < 0.68 ? 1.0 : r < 0.92 ? 0.8 : 0.4, brk: r < 0.68 ? 0 : r < 0.92 ? 1 : 2 }); }
  for (let i = 0; i < 20; i++) { const r = Math.random(); if (kind === '强') bag.push({ lv: '中等', D: 0.5, P: r < 0.88 ? 1.0 : 0.9, brk: r < 0.88 ? 0 : 1 }); else if (kind === '中') bag.push({ lv: '中等', D: 0.5, P: r < 0.55 ? 1.0 : r < 0.88 ? 0.7 : 0.4, brk: r < 0.55 ? 0 : r < 0.88 ? 2 : 4 }); else bag.push({ lv: '中等', D: 0.5, P: r < 0.22 ? 1.0 : r < 0.62 ? 0.6 : 0.2, brk: r < 0.22 ? 0 : r < 0.62 ? 3 : 4 }); }
  for (let i = 0; i < 10; i++) { const r = Math.random(); if (kind === '强') bag.push({ lv: '困难', D: 0.85, P: r < 0.55 ? 1.0 : 0.9, brk: r < 0.55 ? 0 : 1 }); else if (kind === '中') bag.push({ lv: '困难', D: 0.85, P: r < 0.18 ? 1.0 : r < 0.50 ? 0.6 : 0.3, brk: r < 0.18 ? 0 : 2 }); else bag.push({ lv: '困难', D: 0.85, P: r < 0.06 ? 0.8 : 0.2, brk: 2 }); }
  for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
  return bag;
}

function simSemester(kind, opt = {}) {
  const { th = 0.8, alpha = 0.25, U0 = 0.5, deltaU = 0.05, streak = 2, weeks = 20, wSelf = 0 } = opt;
  let A = 0.30, U = U0, hi = 0, lo = 0, ups = 0;
  const sByLv = { 简单: [], 中等: [], 困难: [] };
  for (let w = 0; w < weeks; w++) {
    for (const o of makeWeek(kind)) {
      const q = 1 - o.brk / SEGS[o.lv];
      const s = o.P * CAL(o.D) * q;
      sByLv[o.lv].push(s);
      if (s >= th) hi++; else hi = 0;
      if (hi >= streak) { U += deltaU * (1 - U); ups++; hi = 0; }
      if (s <= 0.6) { lo++; if (lo >= 5) { U -= 0.03 * (U - A); lo = 0; } } else lo = 0;
      // 可选：按题层给不同权重（模拟「简单题不该跟难题同权」）
      const wgt = wSelf > 0 ? ({ 简单: 1 - wSelf, 中等: wSelf * 0.6, 困难: wSelf * 0.4 })[o.lv] : 1;
      const sEff = s * wgt + A * (1 - wgt);   // 简单题打折：偏离A 的部分被压缩
      A = Math.max(0, Math.min(U, A + alpha * (sEff - A) * (U - A)));
    }
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  return { A, U, ups, meanS: mean(sByLv.简单.concat(sByLv.中等, sByLv.困难)), meanEasy: mean(sByLv.简单), meanMid: mean(sByLv.中等), meanHard: mean(sByLv.困难) };
}

const avg = (kind, opt, n = 8) => { const rs = []; for (let t = 0; t < n; t++) rs.push(simSemester(kind, opt)); const m = f => rs.reduce((s, r) => s + f(r), 0) / rs.length; return { A: m(r => r.A), U: m(r => r.U), ups: m(r => r.ups), meanS: m(r => r.meanS), meanEasy: m(r => r.meanEasy), meanMid: m(r => r.meanMid), meanHard: m(r => r.meanHard) }; };

console.log(line);
console.log('发现：U 到了 99.7，A 只到 70.3 —— 瓶颈不在 U，在 s 本身');
console.log(line);
console.log('  「较强」学生 20 周各题层的 s 平均值：\n');
const r = avg('强');
console.log(`    简单题 s 平均 = ${p0(r.meanEasy)}   （70% 的题）`);
console.log(`    中等题 s 平均 = ${p0(r.meanMid)}   （20% 的题）`);
console.log(`    困难题 s 平均 = ${p0(r.meanHard)}   （10% 的题）`);
console.log(`    ────────────────────────────`);
console.log(`    全部加权平均 = 0.7×${p0(r.meanEasy)} + 0.2×${p0(r.meanMid)} + 0.1×${p0(r.meanHard)}`);
console.log(`                = ${p0(0.7 * r.meanEasy + 0.2 * r.meanMid + 0.1 * r.meanHard)}`);
console.log(`    实测期末 A   = ${p0(r.A)}     ← 几乎完全等于 s 的加权平均`);

console.log('\n' + line);
console.log('这就是 A 的天花板：s 加权平均，与 U 无关');
console.log(line);
console.log(`
  ΔA = α × (s − A) × (U − A)

  U 很大时，(U−A) 很大 → 不再是限制。
  但 A 是一个 EWMA，它的**不动点**满足：
      s_平均 = A

  因为 70% 的题是简单题（s≈0.68），
  简单题把 A 往下拉，中难题往上拉，平衡点落在 0.70 附近。

  → A 卡在 0.70 是**结构决定的**，不是参数没调好。
  → U 涨到 0.997 也没用，因为 s 上不去。
`);

console.log(line);
console.log('验证：把 U 强行固定，看 A 停在哪');
console.log(line);
for (const Ufix of [0.5, 0.7, 0.9, 0.99]) {
  let A = 0.30;
  for (let w = 0; w < 20; w++) for (const o of makeWeek('强')) {
    const q = 1 - o.brk / SEGS[o.lv];
    const s = o.P * CAL(o.D) * q;
    A = Math.min(Ufix, A + 0.25 * (s - A) * (Ufix - A));
  }
  console.log(`  U 固定 ${p0(Ufix)}  →  A = ${p0(A)}`);
}
console.log('\n  → A 的终值几乎不随 U 变（除了极低 U 的情况）—— 确认瓶颈在 s');

console.log('\n' + line);
console.log('那么要让「较强」到 0.85，必须做什么');
console.log(line);
console.log('  A 的不动点 = s 的加权平均，要它到 0.85：\n');
console.log('  方案            简单题s    中等题s   困难题s   加权平均   能否到0.85');
console.log('  ' + '─'.repeat(70));
const rows = [
  ['现状', 0.68, r.meanMid, r.meanHard],
  ['简单题也满分(需校准≥0.85)', 0.85, 0.90, 0.95],
  ['简单题计 0 分权重', 0.0, r.meanMid, r.meanHard],
  ['难度校准改 0.8+0.2D', 0.84, 0.90, 0.97],
  ['简单题按 0.3 权重', 0.68, r.meanMid, r.meanHard],
];
for (const [name, e, m, h] of rows) {
  let wE = 0.7, wM = 0.2, wH = 0.1;
  if (name.includes('0.3 权重')) { wE = 0.7 * 0.3; wM = 0.2 + 0.7 * 0.35; wH = 0.1 + 0.7 * 0.35; }
  if (name.includes('0 分权重')) { wE = 0; wM = 0.2 / 0.3; wH = 0.1 / 0.3; }
  const avgS = wE * e + wM * m + wH * h;
  console.log(`  ${name.padEnd(26)} ${p0(e).padStart(6)}   ${p0(m).padStart(6)}   ${p0(h).padStart(6)}   ${p0(avgS).padStart(6)}    ${avgS >= 0.83 ? '✅' : '🟡'}`);
}

console.log('\n' + line);
console.log('代码级验证：给简单题降权（wSelf），A 能到多少');
console.log(line);
console.log('  简单题权重系数   较强A     中等A     较弱A      解读');
console.log('  ' + '─'.repeat(64));
for (const w of [0, 0.3, 0.5, 0.7, 1.0]) {
  const a = avg('强', { wSelf: w }, 6);
  const b = avg('中', { wSelf: w }, 6);
  const c = avg('弱', { wSelf: w }, 6);
  const label = w === 0 ? '简单题权重 0' : w === 1 ? '简单题权重 1(现状)' : `简单题权重 ${w}`;
  const hit = a.A >= 0.80 ? '✅ 到 0.85 附近' : a.A >= 0.70 ? '🟡 接近' : '❌';
  console.log(`  ${label.padEnd(16)} ${p0(a.A).padStart(6)}  ${p0(b.A).padStart(6)}  ${p0(c.A).padStart(6)}      ${hit}`);
}

console.log('\n' + line);
console.log('注意这样做的代价');
console.log(line);
console.log(`
  给简单题降权 = 承认「简单题不该影响 A」。
  但 A 的定义是「完成步骤并得出正确答案的能力」——
  简单题也是执行，只是不该跟难题同权。

  所以更准确的说法不是「简单题不算」，而是：
  **A 应该是「难度加权后的执行质量」，而现在的公式里难度只乘了一次、
  且被 P 的低分拖住了。**
`);
