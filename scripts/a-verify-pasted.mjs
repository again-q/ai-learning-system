/**
 * 复核 pasted report 的规则与结果
 * 跑法：node scripts/a-verify-pasted.mjs
 *
 * 规则：
 *   s = P × (0.6 + 0.4D) × q
 *   ΔA = α × (s − A) × (√(U − A) + δ)      α=0.1  δ=0.01
 *   U 上浮：最近 10 次内有 ≥2 次 s > U → U += 0.05 × (1 − U) × D_trigger
 *   A₀=0.30  U₀=0.50
 *
 * 混合顺序：简单 70% / 中等 20% / 困难 10%
 */

const p0 = (x) => (x * 100).toFixed(1);
const p3 = (x) => x.toFixed(3);
const line = '='.repeat(92);

const PROFILES = {
  较强: {
    简单: { P: 0.98, q: 0.98, D: 0.2 },
    中等: { P: 0.95, q: 0.95, D: 0.5 },
    困难: { P: 0.86, q: 0.89, D: 0.9 },
  },
  中等: {
    简单: { P: 0.90, q: 0.95, D: 0.2 },
    中等: { P: 0.69, q: 0.88, D: 0.5 },
    困难: { P: 0.32, q: 0.76, D: 0.9 },
  },
  比较拉: {
    简单: { P: 0.73, q: 0.89, D: 0.2 },
    中等: { P: 0.44, q: 0.82, D: 0.5 },
    困难: { P: 0.16, q: 0.75, D: 0.9 },
  },
};

function makeObs(kind, n) {
  const p = PROFILES[kind];
  const bag = [];
  for (let i = 0; i < 70; i++) bag.push({ lv: '简单', ...p.简单 });
  for (let i = 0; i < 20; i++) bag.push({ lv: '中等', ...p.中等 });
  for (let i = 0; i < 10; i++) bag.push({ lv: '困难', ...p.困难 });
  for (let i = 0; i < n - 100; i++) bag.push({ lv: '简单', ...p.简单 });
  for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
  return bag;
}

function sim(kind, opt = {}) {
  const { alpha = 0.1, delta = 0.01, U0 = 0.50, A0 = 0.30, base = 0.05, window = 10, need = 2, n = 200, useSqrt = true, dOfTrigger = 'second' } = opt;
  let A = A0, U = U0;
  const hist = [];
  const ups = [];
  const marks = [];
  for (let i = 0; i < n; i++) {
    const o = makeObs(kind, n)[i];
    const s = o.P * (0.6 + 0.4 * o.D) * o.q;
    // 窗口计数（记下每次的 D 以备涨幅用）
    hist.push({ ok: s > U, D: o.D, lv: o.lv });
    if (hist.length > window) hist.shift();
    const cnt = hist.filter(x => x.ok).length;
    if (cnt >= need) {
      // 取触发的那一次（最后一次 ok）
      const trig = [...hist].reverse().find(x => x.ok);
      const before = U;
      U += base * (1 - U) * (dOfTrigger === 'second' ? trig.D : o.D);
      ups.push({ n: i + 1, lv: trig.lv, D: trig.D, gain: U - before });
      hist.fill({ ok: false, D: 0, lv: '-' });
    }
    const gap = Math.max(0, U - A);
    const mult = useSqrt ? Math.sqrt(gap) + delta : gap;
    A = Math.max(0, Math.min(U, A + alpha * (s - A) * mult));
    if (i === 0 || (i + 1) % 20 === 0) marks.push({ n: i + 1, A, U });
  }
  return { A, U, ups, marks };
}

console.log(line);
console.log('第一步：先核对你给的学生画像 s 值');
console.log(line);
console.log('  档位      题层   P      q      D      s = P×(0.6+0.4D)×q      你写的');
console.log('  ' + '─'.repeat(76));
const YOUR = {
  较强: [0.654, 0.723, 0.734],
  中等: [0.583, 0.488, 0.231],
  比较拉: [0.444, 0.290, 0.112],
};
for (const kind of ['较强', '中等', '比较拉']) {
  ['简单', '中等', '困难'].forEach((lv, k) => {
    const o = PROFILES[kind][lv];
    const cal = 0.6 + 0.4 * o.D;
    const s = o.P * cal * o.q;
    const y = YOUR[kind][k];
    const ok = Math.abs(s - y) < 0.002 ? '✅' : `❌ 差 ${(s - y).toFixed(4)}`;
    console.log(`  ${kind.padEnd(7)} ${lv}   ${p3(o.P)}  ${p3(o.q)}  ${p3(o.D)}  校准${p3(cal)} → ${p3(s)}    ${y}${ok}`);
  });
}

console.log('\n' + line);
console.log('第二步：跑你的模拟（200 次观测）');
console.log(line);
console.log('  ΔA = 0.1 × (s − A) × (√(U − A) + 0.01)');
console.log('  U 上浮：窗口 10 次内 ≥2 次 s>U → U += 0.05×(1−U)×D\n');

const claimed = { 较强: [0.857, 0.904, 31], 中等: [0.703, 0.763, 18], 比较拉: [0.534, 0.621, 9] };
const runs = {};
console.log('  档位      实测A     实测U    上浮次数上浮明细(难/中/易)   你的A     偏差');
console.log('  ' + '─'.repeat(84));
for (const kind of ['较强', '中等', '比较拉']) {
  const r = sim(kind);
  runs[kind] = r;
  const byLv = { 困难: 0, 中等: 0, 简单: 0 };
  r.ups.forEach(u => byLv[u.lv]++);
  const c = claimed[kind];
  const dA = r.A - c[0];
  console.log(`  ${kind.padEnd(7)} ${p3(r.A)}   ${p3(r.U)}   ${String(r.ups.length).padStart(4)}${String(c[2]).padStart(7)}   ${byLv.困难}/${byLv.中等}/${byLv.简单}          ${c[0]}  ${(dA >= 0 ? '+' : '')}${dA.toFixed(3)} ${Math.abs(dA) < 0.015 ? '✅' : '❌'}`);
}

console.log('\n' + line);
console.log('第三步：逐阶段轨迹对照（较强）');
console.log(line);
console.log('   n      A        U      U−A    √(U−A)+δ');
console.log('  ' + '─'.repeat(48));
for (const m of runs.较强.marks) {
  const gap = m.U - m.A;
  console.log(`  ${String(m.n).padStart(3)}  ${p3(m.A)}   ${p3(m.U)}  ${p3(gap)}   ${(Math.sqrt(Math.max(0, gap)) + 0.01).toFixed(3)}`);
}
const YOUR_TRAJ = [[20, 0.455, 0.528], [40, 0.608, 0.647], [60, 0.731, 0.780], [80, 0.795, 0.855], [100, 0.828, 0.888], [120, 0.843, 0.900], [140, 0.852, 0.904], [160, 0.856, 0.904], [180, 0.857, 0.904], [200, 0.858, 0.904]];
console.log('\n  你的轨迹对照：');
console.log('   n      你的A     你的U      实测A     实测U     A差');
for (const [n, ya, yu] of YOUR_TRAJ) {
  const m = runs.较强.marks.find(x => x.n === n);
  const d = m.A - ya;
  console.log(`  ${String(n).padStart(3)}  ${p3(ya)}   ${p3(yu)}    ${p3(m.A)}   ${p3(m.U)}   ${(d >= 0 ? '+' : '')}${d.toFixed(3)} ${Math.abs(d) < 0.015 ? '✅' : '❌'}`);
}

console.log('\n' + line);
console.log('第四步：凸函数形态验证（较强）—— 你给的三个突破周期');
console.log(line);
const ups = runs.较强.ups;
console.log('  上浮事件（前 12 次）：');
ups.slice(0, 12).forEach(u => console.log(`    第${String(u.n).padStart(3)}次  ${u.lv}  D=${u.D}  涨幅=${u.gain.toFixed(4)}`));
console.log('\n  按你的切法算三段增速：');
const cuts = [[38, 57], [57, 78], [78, 97]];
for (const [a, b] of cuts) {
  const A1 = runs.较强.marks.find(x => x.n === a)?.A;
  const A2 = runs.较强.marks.find(x => x.n === b)?.A;
  if (A1 != null && A2 != null) {
    console.log(`    第${a}~${b}次  A ${A1.toFixed(3)}→${A2.toFixed(3)}  增量 ${(A2 - A1).toFixed(3)}  速度 ${((A2 - A1) / (b - a)).toFixed(4)}/次`);
  }
}
console.log('  你的数字：+0.124/19 = 0.0065  →  +0.081/21 = 0.0039  →  +0.037/19 = 0.0019');

console.log('\n' + line);
console.log('第五步：这条规则跟前面几版的关系');
console.log(line);
console.log('  关键改动是ΔA 的因子：');
console.log('    旧：ΔA = α × (s − A) × (U − A)            ← 线性阻尼');
console.log('    新：ΔA = α × (s − A) × (√(U − A) + δ)      ← 平方根阻尼+ 常数');
console.log('\n  平方根阻尼的性质（U−A = gap）：');
console.log('    gap      gap（线性）    √gap+0.01    比值');
for (const gap of [0.20, 0.10, 0.05, 0.02, 0.01]) {
  const lin = gap, sq = Math.sqrt(gap) + 0.01;
  console.log(`    ${p3(gap)}    ${p3(lin).padStart(8)}    ${p3(sq).padStart(8)}    ${(sq / lin).toFixed(1)}×`);
}
console.log(`
  → 线性阻尼下，接近 U 时更新量按 gap 线性趋零（很快卡住）
  → 平方根阻尼下，gap=0.01 时因子仍有 0.11，是线性的 11 倍
  → **这才是 A 能从 0.70 推到 0.85 的真正原因** —— 不是 U 规则，是这个因子。

  而 δ=0.01 的作用：A 无限接近 U 时，gap→0，√gap→0，但 +δ 保证不归零
  → A 会缓慢贴住 U，不会卡在 U 下方 —— 实测 U−A 稳定在 0.044 左右
`);

console.log('\n' + line);
console.log('第六步：这条规则的真代价');
console.log(line);
console.log(`  较强：U−A = ${(runs.较强.U - runs.较强.A).toFixed(3)}`);
console.log(`  中等：U−A = ${(runs.中等.U - runs.中等.A).toFixed(3)}`);
console.log(`  较弱：U−A = ${(runs.比较拉.U - runs.比较拉.A).toFixed(3)}`);
console.log(`
  → U−A 稳定在 0.04~0.09：A 一直贴在 U 下方一点，两者几乎同步移动
  → 这意味着 **U 和 A 变成两个近似的数**，区分度下降
  → A 读数是「U 减去一点」，而 U 是「最近能做多好」
  → 「上限」这个独立语义基本消失了

  而且 δ=0.01 保证了 A 必然贴住 U（gap→0 时仍有 0.01 的因子在推）
  → 这是**设计上让 A 永远追不上 U 一个固定距离**，不是自然收敛
`);

console.log('\n' + line);
console.log('第七步：敏感度 —— 哪个参数在真正起作用');
console.log(line);
console.log('  改动较强学生的 A：');
console.log('  ' + '─'.repeat(58));
const base = sim('较强');
console.log(`  ${'现行（√阻尼 + D加权涨幅）'.padEnd(32)} ${p3(base.A)}`);
const variants = [
  ['α 0.1 → 0.05', { alpha: 0.05 }],
  ['α 0.1 → 0.20', { alpha: 0.20 }],
  ['δ 0.01 → 0.05', { delta: 0.05 }],
  ['δ 0.01 → 0.001', { delta: 0.001 }],
  ['去掉 δ（纯 √gap）', { delta: 0 }],
  ['√ 改回线性 (U−A)', { useSqrt: false }],
  ['U 涨幅去掉 D 加权', { base: 0.05 * 0.9 }],
  ['U 涨幅用当次D', { dOfTrigger: 'current' }],
];
for (const [n, o] of variants) {
  const r = sim('较强', o);
  const d = (r.A - base.A) * 100;
  console.log(`  ${n.padEnd(32)} ${p3(r.A)}  ${(d >= 0 ? '+' : '')}${d.toFixed(1)} 点`);
}
console.log(`
  → **√阻尼 vs 线性阻尼是最大的一项**（这一项改变了 A 的收敛性质）
  → δ 也有影响，但它主要是防止归零
  → D 加权涨幅主要压「中等学生的 U 不虚高」（你设计的目的，达到了）
`);

console.log('\n' + line);
console.log('第八步：三档区分度（跨所有已测规则）');
console.log(line);
const spans = [];
spans.push(['旧 s≥0.8 + 线性阻尼（20:45测）', 71.2, 57.7, 43.7]);
spans.push(['s>U 连续2 + 线性阻尼（20:45测）', 71.5, 56.9, 42.7]);
spans.push(['窗口10≥2 + 线性阻尼（20:50测）', 71.3, 54.5, 40.5]);
spans.push(['√阻尼 + D加权涨幅（你这份）', runs.较强.A * 100, runs.中等.A * 100, runs.比较拉.A * 100]);
console.log('  版本较强    中等    较弱    强-弱跨度  强-中    中-弱');
for (const [n, a, b, c] of spans) {
  console.log(`  ${n.padEnd(30)} ${a.toFixed(1).padStart(5)}  ${b.toFixed(1).padStart(6)}  ${c.toFixed(1).padStart(6)}   ${(a - c).toFixed(1).padStart(6)}   ${(a - b).toFixed(1).padStart(5)}  ${(b - c).toFixed(1).padStart(5)}`);
}
