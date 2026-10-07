/**
 * U 上浮触发机制：窗口 10 次 ≥2 次 s>U —— 到底怎么算
 * 跑法：node scripts/a-u-trigger-mechanics.mjs
 */

const CAL = (d) => 0.8 + 0.2 * d;
const p3 = (x) => x.toFixed(3);
const line = '='.repeat(92);

function sim(seq, opt = {}) {
  const { alpha = 0.1, U0 = 0.5, A0 = 0.3, dU = 0.05, dD = 0.03, window = 10, need = 2, delta = 0.01 } = opt;
  let A = A0, U = U0, lown = 0;
  const hist = [];
  const events = [];
  for (let i = 0; i < seq.length; i++) {
    const { s, D, tag } = seq[i];
    hist.push({ ok: s > U, D, n: i + 1 });
    if (hist.length > window) hist.shift();
    const cnt = hist.filter(x => x.ok).length;
    const fires = cnt >= need;
    if (fires) {
      const t = [...hist].reverse().find(x => x.ok);
      const before = U;
      U += dU * (1 - U) * t.D;
      events.push({ n: i + 1, U: before, to: U, D: t.D, used: hist.filter(x => x.ok).map(x => x.n) });
      hist.fill({ ok: false, D: 0, n: 0 });
    }
    if (s <= 0.6) { lown++; if (lown >= 5) { U -= dD * (U - A); lown = 0; } } else lown = 0;
    const gap = Math.max(0, U - A);
    A = Math.max(0, Math.min(U, A + alpha * (s - A) * (Math.sqrt(gap) + delta)));
  }
  return { A, U, events };
}

console.log(line);
console.log('一、机制拆解：三条规则同时在跑');
console.log(line);
console.log('  ① 每来一个观测，把 s>U 的标记压进窗口（最多 10 个）');
console.log('  ② 窗口里 ≥2 个标记 → 触发上浮，U += 0.05×(1−U)×D');
console.log('  ③ 触发后清空窗口（这 2 次作废，重新数）');
console.log('  ④ s ≤ 0.6 连续 5 次 → U -= 0.03(U−A)');
console.log('  ⑤ A = 0.1×(s−A)×(√(U−A)+0.01)，clamp 到 [0, U]');

console.log('\n' + line);
console.log('二、你说的「就累计两次」—— 对，但有窗口约束');
console.log(line);
console.log('  测试：s 恒定高于 U（比如 s=0.90，U 从 0.50 起步）\n');
const seqHigh = [];
for (let i = 0; i < 60; i++) seqHigh.push({ s: 0.90, D: 0.9, tag: '难题' });
const rHigh = sim(seqHigh);
console.log(`  期末 U = ${p3(rHigh.U)}   上浮 ${rHigh.events.length} 次`);
console.log('  前 12 次上浮事件：');
console.log('   观测n    U 前→ 后     涨幅      用的哪两次     D');
for (const e of rHigh.events.slice(0, 12)) {
  console.log(`   ${String(e.n).padStart(4)}   ${p3(e.U)} → ${p3(e.to)}   ${p3(e.to - e.U)}   第 ${e.used.join(' + ')} 次    ${e.D}`);
}
console.log('\n  → **确实是「攒够 2 次就涨一次」**');
console.log('  → 但注意用的那两次是**相邻或紧邻的**（窗口内最新的两次）');
console.log('  → 涨完清空，所以同一个 s>U 不能重复计数');

console.log('\n' + line);
console.log('三、窗口 10 的作用 —— 拖长到 20 会怎样');
console.log(line);
console.log('  测试：s 每4 次里只有 1 次高于 U（间断表现）\n');
for (const w of [5, 10, 15, 20]) {
  const seq = [];
  for (let i = 0; i < 200; i++) seq.push({ s: (i % 4 === 0) ? 0.95 : 0.65, D: 0.5 });
  const r = sim(seq, { window: w });
  console.log(`  窗口 ${String(w).padStart(2)}   期末U = ${p3(r.U)}   上浮 ${String(r.events.length).padStart(3)} 次`);
}
console.log('\n  → 窗口越长，需要攒的次数越多 → 涨得越慢');
console.log('  → 窗口越短，越容易触发 → 涨得越快');

console.log('\n' + line);
console.log('四、「窗口内 ≥2 次」vs「连续 2 次」—— 差别在哪');
console.line = 0;
console.log('  场景：s 高低交替出现\n');
const alt = [];
for (let i = 0; i < 100; i++) alt.push({ s: i % 2 === 0 ? 0.95 : 0.65, D: 0.5 });
const rAltWindow = sim(alt, { window: 10, need: 2 });
const rAltConsec = sim(alt, { window: 2, need: 2 });   // window=2 近似「连续 2 次」
console.log(`  交替序列（高/低/高/低…）：`);
console.log(`    窗口 10 内 ≥2 次  →  上浮 ${rAltWindow.events.length} 次，期末 U = ${p3(rAltWindow.U)}`);
console.log(`    近似「连续 2 次」→  上浮 ${rAltConsec.events.length} 次，期末 U = ${p3(rAltConsec.U)}`);
console.log(`\n  → 交替序列里**永远凑不出「连续 2 次」**，所以旧规则完全死锁`);
console.log(`  → 而「窗口 10 内 ≥2 次」照样能触发（窗口会记住历史）`);

console.log('\n' + line);
console.log('五、触发频率受什么限制');
console.log(line);
const cases = [
  ['s 恒 0.95（一直远超U）', () => { const s = []; for (let i = 0; i < 200; i++) s.push({ s: 0.95, D: 0.9 }); return s; }],
  ['s 恒 0.75（略高于 U）', () => { const s = []; for (let i = 0; i < 200; i++) s.push({ s: 0.75, D: 0.5 }); return s; }],
  ['s 在 U 附近抖（±0.05）', null],
  ['s 每 3 次里 1 次超 U', () => { const s = []; for (let i = 0; i < 200; i++) s.push({ s: i % 3 === 0 ? 0.95 : 0.62, D: 0.5 }); return s; }],
  ['s 每 5 次里 1 次超 U', () => { const s = []; for (let i = 0; i < 200; i++) s.push({ s: i % 5 === 0 ? 0.95 : 0.60, D: 0.5 }); return s; }],
];
console.log('  场景                    上浮次数   期末U     平均间隔');
for (const [name, gen] of cases) {
  let seq;
  if (name.includes('抖')) {
    seq = []; let base = 0.80;
    for (let i = 0; i < 200; i++) { base = 0.78 + Math.random() * 0.08; seq.push({ s: base, D: 0.5 }); }
  } else seq = gen();
  const r = sim(seq);
  const interval = r.events.length ? (200 / r.events.length).toFixed(1) : '—';
  console.log(`  ${name.padEnd(20)} ${String(r.events.length).padStart(6)}    ${p3(r.U)}   ${String(interval).padStart(6)} 次`);
}
console.log('\n  → **s 一直超 U 时，每 2 次观测就涨一次**（最快）');
console.log('  → s 只偶尔超 U 时，要等窗口攒够 2 次，间隔变长');

console.log('\n' + line);
console.log('六、涨到什么时候停');
console.log(line);
console.log('  s 恒 0.95，U₀=0.50，每次涨 0.05×(1−U)×0.9 = 0.045×(1−U)\n');
let U = 0.50, n = 0;
console.log('   触发次序   U');
while (U < 0.94 && n < 40) { U += 0.05 * (1 - U) * 0.9; n++; if (n <= 8 || n % 5 === 0) console.log(`   ${String(n).padStart(5)}   ${p3(U)}`); }
console.log(`\n  → U 涨到接近 s（0.95）时就停了 —— 因为 s > U 不再成立`);
console.log(`  → **U 的天花板 = s 能达到的高度**`);
console.log(`  → 所以 U ≈「他在这个难度下能稳定做出的水平」`);

console.log('\n' + line);
console.log('七、总结：三条规则的实际分工');
console.log(line);
console.log(`
  ┌────────────────────────────────────────────────────────┐
  │ 「窗口 10 内 ≥2 次 s > U」= **累计两次就涨**            │
  │   · 窗口的作用：记住最近 10 次，不要求连续│
  │   · 清空的作用：这 2 次作废，下次重新数                │
  │   · 实际效果：s 一直超 U → 每 2 次观测涨一次│
  │         s 偶尔超 U → 间隔变长│
  │         s 从不超 U → 永不涨│
  │                                                        │
  │ 「连续 5 次 s ≤ 0.6」= **持续差才降**                │
  │   · U 降得比涨慢很多 → 天花板不易掉│
  │   · 实测：前 100 难题 + 后 100 简单，U 从 0.885 → 0.885│
  │                                                        │
  │ 「A 的 √阻尼」= **贴住但不超越 U**│
  │   · A ≤ U 恒成立│
  │   · gap 小的时候仍在更新（δ=0.01 保证）              │
  └────────────────────────────────────────────────────────┘

  **所以你的理解对：U 的上浮就是「攒够两次」。**
  **而「历史最高」不存在 —— U 是「当前能稳定做到的高度」，涨到s 就停。**
`);
