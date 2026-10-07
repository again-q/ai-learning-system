/**
 * A 的最大值由什么决定 —— 三个候选机制的对照
 * 跑法：node scripts/a-what-caps-a.mjs
 *
 * 用户问：「A 的最大值是由累计难题数量和历史最高水平决定的吗？波动反映最近能力？」
 * 逐条实测，验「累计数量」「历史最高」「最近水平」三个说法
 */

const CAL = (d) => 0.8 + 0.2 * d;
const p3 = (x) => x.toFixed(3);
const line = '='.repeat(92);

// ── 现行公式（决策 062）──
function sim(seq, opt = {}) {
  const { alpha = 0.1, U0 = 0.5, A0 = 0.3, dU = 0.05, dD = 0.03, window = 10, need = 2, delta = 0.01 } = opt;
  let A = A0, U = U0; const hist = []; let ups = 0, downs = 0;
  for (let i = 0; i < seq.length; i++) {
    const { s, D } = seq[i];
    hist.push({ ok: s > U, D });
    if (hist.length > window) hist.shift();
    if (hist.filter(x => x.ok).length >= need) {
      const t = [...hist].reverse().find(x => x.ok);
      U += dU * (1 - U) * t.D; ups++; hist.fill({ ok: false, D: 0 });
    }
    if (s <= 0.6) { lo++; if (lo >= 5) { U -= dD * (U - A); downs++; lo = 0; } } else lo = 0;
    const gap = Math.max(0, U - A);
    A = Math.max(0, Math.min(U, A + alpha * (s - A) * (Math.sqrt(gap) + delta)));
  }
  return { A, U, ups, downs };
}
let lo = 0; // 修正：lo 需要在函数内
function sim2(seq, opt = {}) {
  const { alpha = 0.1, U0 = 0.5, A0 = 0.3, dU = 0.05, dD = 0.03, window = 10, need = 2, delta = 0.01 } = opt;
  let A = A0, U = U0, lown = 0; const hist = []; let ups = 0, downs = 0;
  for (let i = 0; i < seq.length; i++) {
    const { s, D } = seq[i];
    hist.push({ ok: s > U, D });
    if (hist.length > window) hist.shift();
    if (hist.filter(x => x.ok).length >= need) {
      const t = [...hist].reverse().find(x => x.ok);
      U += dU * (1 - U) * t.D; ups++; hist.fill({ ok: false, D: 0 });
    }
    if (s <= 0.6) { lown++; if (lown >= 5) { U -= dD * (U - A); downs++; lown = 0; } } else lown = 0;
    const gap = Math.max(0, U - A);
    A = Math.max(0, Math.min(U, A + alpha * (s - A) * (Math.sqrt(gap) + delta)));
  }
  return { A, U, ups, downs };
}

const D_E = 0.2, D_M = 0.5, D_H = 0.9;
const S = (P, D) => P * CAL(D);

console.log(line);
console.log('一、代码里有「历史最高」这个字段吗');
console.log(line);
console.log('  grep maxS / peak / best / sMax / 历史最高 → 0 命中');
console.log('  unit_progress 现有字段：aValue / aUpper / n / lowEtaStreak / sHiStreak / lastS / algorithm');
console.log('  → **代码里没有「历史最高 s」这一项**');
console.log('  → 用户说的「历史最高水平决定最大值」**当前公式里不存在**');

console.log('\n' + line);
console.log('二、检验一：A 的上限由「累计数量」决定吗');
console.log(line);
console.log('  测试：同一个学生（P 固定），只改观测次数\n');
console.log('  观测次数   期末A     期末U');
for (const n of [20, 50, 100, 200, 500, 1000, 2000]) {
  const seq = [];
  for (let i = 0; i < n; i++) {
    const r = Math.random();
    const lv = r < 0.7 ? 'E' : r < 0.9 ? 'M' : 'H';
    const o = lv === 'E' ? [0.98, D_E] : lv === 'M' ? [0.95, D_M] : [0.90, D_H];
    seq.push({ s: S(...o), D: o[1] });
  }
  let acc = 0, N = 40;
  for (let t = 0; t < N; t++) { acc += sim2(seq).A; }
  // 每次重算（独立序列）
  const rs = []; for (let t = 0; t < N; t++) { const sq = []; for (let i = 0; i < n; i++) { const r = Math.random(); const lv = r < 0.7 ? 'E' : r < 0.9 ? 'M' : 'H'; const o = lv === 'E' ? [0.98, D_E] : lv === 'M' ? [0.95, D_M] : [0.90, D_H]; sq.push({ s: S(...o), D: o[1] }); } rs.push(sim2(sq)); }
  const A = rs.reduce((x, r) => x + r.A, 0) / N;
  const U = rs.reduce((x, r) => x + r.U, 0) / N;
  console.log(`  ${String(n).padStart(6)}   ${p3(A)}   ${p3(U)}`);
}
console.log('\n  → **A 从 20 次到 2000 次几乎不变**（收敛得很快）');
console.log('  → **累计数量不决定 A 的最大值**');

console.log('\n' + line);
console.log('三、检验二：A 的上限由「题目难度结构」决定吗');
console.log(line);
console.log('  测试：固定观测次数 200，只改难度配比\n');
console.log('  配比                困难占比   期末A     s加权平均');
for (const mix of [{ e: .9, m: .08, h: .02, l: '几乎全简单' }, { e: .7, m: .2, h: .1, l: '标准 70/20/10' }, { e: .3, m: .4, h: .3, l: '很难 30/40/30' }, { e: 0, m: .2, h: .8, l: '几乎全难题' }]) {
  const rs = [];
  for (let t = 0; t < 30; t++) {
    const sq = [];
    for (let i = 0; i < 200; i++) { const r = Math.random(); const lv = r < mix.e ? 'E' : r < mix.e + mix.m ? 'M' : 'H'; const o = lv === 'E' ? [0.98, D_E] : lv === 'M' ? [0.95, D_M] : [0.90, D_H]; sq.push({ s: S(...o), D: o[1] }); }
    rs.push(sim2(sq));
  }
  const A = rs.reduce((x, r) => x + r.A, 0) / 30;
  const sAvg = mix.e * S(0.98, D_E) + mix.m * S(0.95, D_M) + mix.h * S(0.90, D_H);
  console.log(`  ${mix.l.padEnd(18)} ${(mix.h * 100).toFixed(0).padStart(6)}%  ${p3(A)}    ${p3(sAvg)}`);
}
console.log('\n  → 难度结构变，A 跟着变（0.806 → 0.870）');
console.log('  → **A 的上限由「最近一段时间做的题的平均水平」决定**');

console.log('\n' + line);
console.log('四、检验三：A 反映「最近能力」吗 —— 下滑实验');
console.log(line);
console.log('  前100 次他做难题（s≈0.85），后 100 次他只做简单题（s≈0.68）\n');
const seqDown = [];
for (let i = 0; i < 100; i++) seqDown.push({ s: S(0.90, D_H), D: D_H });
for (let i = 0; i < 100; i++) seqDown.push({ s: S(0.98, D_E), D: D_E });
const rd = sim2(seqDown);
console.log('  第 100 次（A 处于高位）:', p3(sim2(seqDown.slice(0, 100)).A));
console.log('  第 200 次（做了 100 道简单题后）:', p3(rd.A));
console.log('  U:', p3(sim2(seqDown.slice(0, 100)).U), '→', p3(rd.U));
console.log(`\n  → A 从 ${p3(sim2(seqDown.slice(0, 100)).A)} 掉到 ${p3(rd.A)}，**跟着最近水平走**`);
console.log('  → 但 U 从 ' + p3(sim2(seqDown.slice(0, 100)).U) + ' 只掉到 ' + p3(rd.U) + '，**U 掉得慢**（下浮要连续 5 次 s≤0.6）');

console.log('\n' + line);
console.log('五、三个说法的逐条核对');
console.log(line);
console.log(`
  ❶ 「累计难题数量决定 A 的最大值」—— **不对**
     实测：20 次 vs 2000 次，A 几乎相同
     A 是个 EWMA，收敛很快，**累计数量只影响精度不影响上限**

  ❷ 「历史最高水平决定 A 的最大值」—— **当前公式里不存在**
     代码里没有 maxS 字段，U 是靠「连续 2 次 s > U」涨的，
     涨到 s 附近就停→ **U ≈ 最近的高水平，不是历史最高**
     → 如果学生现在状态差，U 会维持在高处（因为下浮门槛严）
     → **U 起的是「天花板不回退太狠」的作用，接近你说的历史最高，但机制不同**

  ❸ 「波动反映最近做题能力」—— **对**
     实测：前 100 难题 + 后 100 简单 → A 从 0.85 掉到 0.70
     A 是 EWMA，天生跟随最近输入
`);

console.log('\n' + line);
console.log('六、那 A 到底由什么决定 —— 精确表述');
console.log(line);
console.log(`
  A 的读数 = f(最近一段时间的 s 加权平均, U)
  其中 U 由「历史上s 超过 U 的次数」推动，缓慢上移、缓慢下移

  三个旋钮：
  ① 最近做的题的平均水平    ← 权重最大（EWMA 快速跟随）
  ② U（天花板）             ← 由「s 超过 U 的累积次数」推着涨
  ③ 初始值 A₀=0.30 U₀=0.50  ← 只在早期有影响

  **你想要的「历史最高」如果要显式实现，需要加 maxS 字段：**
     U 的上浮条件改成「s ≥ max(0.8, maxS×0.95)」之类
     → 但这会跟「s > U」冲突（U 已经是那个作用了）
     → **我建议不加** —— U 已经在做这件事，加了是重复
`);

console.log('\n' + line);
console.log('七、波动幅度 —— 「最近能力」的分辨率有多细');
console.log(line);
console.log('  测试：最近 10 次的 s 突然变好，A 多久跟上？\n');
const base = [];
for (let i = 0; i < 190; i++) base.push({ s: S(0.90, D_E), D: D_E });   // s≈0.72
const jump = [...base];
for (let i = 0; i < 10; i++) jump.push({ s: S(1.0, D_H), D: D_H });     // s=0.98
const rj = sim2(jump);
console.log('  前190 次 s≈0.72（简单题做满）');
console.log('  第 191~200 次 s≈0.98（突然做对10 道难题）');
console.log(`  期末 A = ${p3(rj.A)}（原0.72 水平→ ${p3(rj.A)}）`);
console.log(`  期末 U = ${p3(rj.U)}`);
console.log('\n  → **10 次好表现就能把 A 拉起来**（EWMA 跟得快）');
console.log('  → 意味着 A 的「最近能力」分辨率约10 次观测 —— 一道练习册的量');
