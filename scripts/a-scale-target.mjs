/**
 * ★版本（s̄ 上浮 + s̄ 下浮）的三档读数 —— 对标 0.85 / 0.60 / 0.40
 * 跑法：node scripts/a-scale-target.mjs
 *
 * 用户接受：较强 0.85 / 中等 0.60 / 较弱 0.40
 * 任务：找一组参数，让三档落在这三个数上
 */

const CAL = (d) => 0.8 + 0.2 * d;
const p3 = (x) => x.toFixed(3);
const p0 = (x) => (x * 100).toFixed(1);
const line = '='.repeat(96);

// 真实 P 分布（22:10 实测）
const PD = {
  L4: { D: 0.518, P: [1,1,1,1,1,1,0,0,1,1,0.5,1,1,1,0,1,1,1,0,0,1] },
  L5: { D: 0.650, P: [1,1,1,1] },
  L6: { D: 0.735, P: [1,0.9,0.8,0.6,0.6,0.6,0.4,0.3,0.2,0,0,1,0.9,1] },
};
const MIX = [['L4',0.55],['L5',0.10],['L6',0.35]];
const LIFT = { 较强: 0.30, 中等: 0.00, 较弱: -0.28 };
const TARGET = { 较强: 0.85, 中等: 0.60, 较弱: 0.40 };

function gen(n, lift) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = Math.random();
    let lv = 'L4', acc = 0;
    for (const [L, p] of MIX) { acc += p; if (r <= acc) { lv = L; break; } }
    const pool = PD[lv].P;
    const strength = lift + 0.5;
    const base = (1 - strength) * (pool.length - 1);
    const idx = Math.max(0, Math.min(pool.length - 1, Math.round(base + (Math.random() - 0.5) * 1.2)));
    out.push({ s: pool[idx] * CAL(PD[lv].D), D: PD[lv].D });
  }
  return out;
}

function sim(seq, opt) {
  const { alpha=0.1, U0=0.5, A0=0.3, dU=0.05, dD=0.03, delta=0.01,
          barN=10, upGap=0, dnGap=0.15, dnStreak=5, calibrate=0 } = opt;
  let A = A0, U = U0, lown = 0;
  const bar = [];
  let ups = 0, downs = 0;
  for (const o of seq) {
    let s = o.s;
    if (calibrate) s = Math.max(0, Math.min(1, (s - calibrate) / (1 - calibrate)));
    bar.push({ s, D: o.D });
    if (bar.length > barN) bar.shift();
    const sAvg = bar.reduce((a, b) => a + b.s, 0) / bar.length;
    if (sAvg > U + upGap) {
      const t = [...bar].reverse().find(x => x.sAvg === undefined);
      U += dU * (1 - U) * (bar[bar.length - 1].D);
      ups++; bar.length = 0;
    }
    const sAvgNow = bar.length ? bar.reduce((a, b) => a + b.s, 0) / bar.length : s;
    if (sAvgNow < U - dnGap) { lown++; if (lown >= dnStreak) { U -= dD * (U - A); downs++; lown = 0; } } else lown = 0;
    const gap = Math.max(0, U - A);
    A = Math.max(0, Math.min(U, A + alpha * (s - A) * (Math.sqrt(gap) + delta)));
  }
  return { A, U, ups, downs };
}

const run = (tier, opt, n = 1000, R = 20) => {
  let a = 0, u = 0, du = 0;
  for (let t = 0; t < R; t++) { const r = sim(gen(n, LIFT[tier]), opt); a += r.A; u += r.U; du += r.downs; }
  return { A: a / R, U: u / R, downs: du / R };
};

console.log(line);
console.log('一、★版本现在落在哪（barN=10, dnGap=0.15, dnStreak=5, 无校准）');
console.log(line);
const BASE = { barN: 10, dnGap: 0.15, dnStreak: 5, calibrate: 0 };
console.log('  档      期末A     期末U    你的目标差值下浮次数');
const b0 = {};
for (const t of ['较强', '中等', '较弱']) {
  const r = run(t, BASE);
  b0[t] = r;
  const d = (r.A - TARGET[t]) * 100;
  console.log(`  ${t.padEnd(5)} ${p3(r.A)}   ${p3(r.U)}    ${TARGET[t]}     ${(d >= 0 ? '+' : '')}${d.toFixed(1)}    ${r.downs.toFixed(0)}`);
}
console.log('\n  → 三档的A 顺序是对的（较强 > 中等 > 较弱），但整体偏低');
console.log(`  → 较强 ${p3(b0.较强.A)} 差 ${((TARGET.较强 - b0.较强.A) * 100).toFixed(1)} 点`);
console.log(`  → 中等 ${p3(b0.中等.A)} 差 ${((TARGET.中等 - b0.中等.A) * 100).toFixed(1)} 点`);
console.log(`  → 较弱 ${p3(b0.较弱.A)} 差 ${((TARGET.较弱 - b0.较弱.A) * 100).toFixed(1)} 点`);

console.log('\n' + line);
console.log('二、尺度校准 —— s 线性拉伸（不动公式结构）');
console.log(line);
console.log('  s′ = (s − c) / (1 − c)，c 是校准下限');
console.log('  作用：把 s 的分布往上抬，让 A 的不动点跟着抬\n');
console.log('  c校准较强A    中等A    较弱A   较强差中等差   较弱差  跨度');
for (const c of [0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30]) {
  const o = { ...BASE, calibrate: c };
  const a = run('较强', o), m = run('中等', o), w = run('较弱', o);
  const d1 = (a.A - TARGET.较强) * 100, d2 = (m.A - TARGET.中等) * 100, d3 = (w.A - TARGET.较弱) * 100;
  const ok = Math.abs(d1) < 2 && Math.abs(d2) < 2 && Math.abs(d3) < 2;
  console.log(`  ${p3(c)}   ${p3(a.A)}  ${p3(m.A)}  ${p3(w.A)}   ${(d1>=0?'+':'')}${d1.toFixed(1)}   ${(d2>=0?'+':'')}${d2.toFixed(1)}    ${(d3>=0?'+':'')}${d3.toFixed(1)}   ${p3(a.A - w.A)}  ${ok ? '✅' : ''}`);
}

console.log('\n' + line);
console.log('三、参数细调 —— 找到三档都命中的一组');
console.log(line);
console.log('  扫描 barN × dnGap × dnStreak，找三档偏差都 < 2 点的组合\n');
let best = null;
const results = [];
for (const barN of [5, 8, 10, 15, 20, 30]) {
  for (const dnGap of [0.10, 0.12, 0.15, 0.18, 0.20, 0.25]) {
    for (const dnStreak of [5, 8, 10, 15]) {
      for (const c of [0, 0.05, 0.10, 0.15, 0.20]) {
        const o = { barN, dnGap, dnStreak, calibrate: c };
        const a = run('较强', o, 800, 12), m = run('中等', o, 800, 12), w = run('较弱', o, 800, 12);
        const err = Math.abs(a.A - 0.85) + Math.abs(m.A - 0.60) + Math.abs(w.A - 0.40);
        const maxErr = Math.max(Math.abs(a.A - 0.85), Math.abs(m.A - 0.60), Math.abs(w.A - 0.40));
        results.push({ o, a: a.A, m: m.A, w: w.A, err, maxErr, downs: a.downs });
        if (!best || err < best.err) best = { o, a: a.A, m: m.A, w: w.A, err, maxErr, downs: a.downs };
      }
    }
  }
}
results.sort((x, y) => x.err - y.err);
console.log('  排名  barN  dnGap  streak  校准c较强A    中等A    较弱A    总误差  最大偏差');
for (let i = 0; i < 10; i++) {
  const r = results[i];
  console.log(`  ${String(i + 1).padStart(4)}  ${String(r.o.barN).padStart(4)}  ${p3(r.o.dnGap)}  ${String(r.o.dnStreak).padStart(5)}   ${p3(r.o.calibrate)}   ${p3(r.a)}   ${p3(r.m)}   ${p3(r.w)}   ${r.err.toFixed(3)}  ${(r.maxErr * 100).toFixed(1)} 点`);
}

console.log('\n' + line);
console.log('四、最优解的完整表现（2000 次观测验证）');
console.log(line);
const bo = best.o;
console.log(`  参数：barN=${bo.barN}  dnGap=${p3(bo.dnGap)}  dnStreak=${bo.dnStreak}  校准 c=${p3(bo.calibrate)}\n`);
console.log('  档      期末A     期末U    目标     差      判');
for (const t of ['较强', '中等', '较弱']) {
  const r = run(t, bo, 2000, 25);
  const d = (r.A - TARGET[t]) * 100;
  console.log(`  ${t.padEnd(5)} ${p3(r.A)}   ${p3(r.U)}   ${TARGET[t]}   ${(d >= 0 ? '+' : '')}${d.toFixed(1)}   ${Math.abs(d) < 2 ? '✅' : '🟡'}`);
}
console.log('\n  误判检查（不该下浮的场景）：');
for (const [name, seq] of [
  ['恒定 s=0.90', new Array(2000).fill(0).map(() => ({ s: 0.90, D: 0.5 }))],
  ['恒定 s=0.72', new Array(2000).fill(0).map(() => ({ s: 0.72, D: 0.5 }))],
  ['间歇 10% 低分', Array.from({ length: 2000 }, (_, i) => ({ s: i % 10 < 9 ? 0.90 : 0.50, D: 0.5 }))],
]) {
  let d = 0;
  for (let t = 0; t < 10; t++) { const r = sim(seq, bo); d += r.downs; }
  console.log(`    ${name.padEnd(14)} ${(d / 10).toFixed(0).padStart(3)} 次下浮  ${d / 10 === 0 ? '✅ 不误判' : '⚠️'}`);
}
console.log('\n  真退步检查：');
for (const [name, seq] of [
  ['0.90 → 0.60', [...Array.from({ length: 1000 }, () => ({ s: 0.90, D: 0.5 })), ...gen(1000, -0.20)]],
  ['0.90 → 0.45', [...Array.from({ length: 1000 }, () => ({ s: 0.90, D: 0.5 })), ...gen(1000, -0.35)]],
]) {
  const r = sim(seq, bo);
  console.log(`    ${name.padEnd(14)} U 从 0.90 → ${p3(r.U)}（下浮 ${r.downs} 次）${r.U < 0.6 ? '✅ 会降' : '🟡'}`);
}

console.log('\n' + line);
console.log('五、代价：校准 c 对 A 的影响本质');
console.log(line);
console.log(`
  校准 c 是**线性拉伸 s 的定义域**：
    s′ = (s − c) / (1 − c)
    s = 0.5 → s′ = (0.5−c)/(1−c)
    c=0.10 → s′ = 0.444
    c=0.20 → s′ = 0.375

  作用：所有 s 整体下移 → A 的不动点（= s 加权平均）下移
  → 读数降低，但**三档的相对关系不变**

  而 c 不影响 P 的判据、不影响难度权重、不影响 s 的定义语义
  → **它是一个纯粹的读数刻度调整，不是公式改动**

  对比之前那个选择：
  · 校准 0.6+0.4D → 0.8+0.2D  = 改 s 的**定义**（改斜率和截距）
  · 校准 c = (s−c)/(1−c)      = 改 s 的**刻度**（只改截距）
  → 后者更保守
`);
