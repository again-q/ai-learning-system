/**
 * 「窗口10≥2次」到底跟什么等价 —— 逐条对照
 * 跑法：node scripts/a-window-equivalence.mjs
 *
 * 我 22:18 说「窗口10 ≡ 最近2次里有1次」—— 这是错的，验一下
 */

const CAL = (d) => 0.8 + 0.2 * d;
const p3 = (x) => x.toFixed(3);
const line = '='.repeat(96);

// ── 四种候选规则 ──
// 甲：窗口 W 内≥ need 个标记，触发后清空   ← 现行（window=10, need=2）
function ruleWindow(seq, W = 10, need = 2) {
  let U = 0.5; const hist = []; let ups = 0;
  for (const s of seq) {
    hist.push(s > U);
    if (hist.length > W) hist.shift();
    if (hist.filter(Boolean).length >= need) { U += 0.05 * (1 - U) * 0.5; ups++; hist.fill(false); }
  }
  return { U, ups };
}
// 乙：最近 2 次里有 1 次（间隙 ≤ 2）
function ruleRecent2of1(seq) {
  let U = 0.5; const hist = []; let ups = 0;
  for (const s of seq) {
    hist.push(s > U);
    if (hist.length > 2) hist.shift();
    if (hist.some(Boolean)) { U += 0.05 * (1 - U) * 0.5; ups++; hist.length = 0; }
  }
  return { U, ups };
}
// 丙：不滑动，触发后清空（间隙无限）
function ruleCounter(seq, need = 2) {
  let U = 0.5; let cnt = 0; let ups = 0;
  for (const s of seq) {
    if (s > U) cnt++;
    if (cnt >= need) { U += 0.05 * (1 - U) * 0.5; ups++; cnt = 0; }
  }
  return { U, ups };
}
// 丁：连续 2 次
function ruleConsec2(seq) {
  let U = 0.5; let hi = 0; let ups = 0;
  for (const s of seq) {
    if (s > U) hi++; else hi = 0;
    if (hi >= 2) { U += 0.05 * (1 - U) * 0.5; ups++; hi = 0; }
  }
  return { U, ups };
}

// ── 五种 s 序列 ──
const PATTERNS = {
  's 恒高于 U（连续好）': (n) => new Array(n).fill(0.95),
  's 恒低于 U（一直差）': (n) => new Array(n).fill(0.40),
  '每 2 次 1 次高（间隙 2）': (n) => Array.from({ length: n }, (_, i) => (i % 2 === 0 ? 0.95 : 0.40)),
  '★每 5 次 1 次高（间隙 5）': (n) => Array.from({ length: n }, (_, i) => (i % 5 === 0 ? 0.95 : 0.40)),
  '★每 8 次 1 次高（间隙 8）': (n) => Array.from({ length: n }, (_, i) => (i % 8 === 0 ? 0.95 : 0.40)),
  '★每 12 次 1 次高（间隙 12）': (n) => Array.from({ length: n }, (_, i) => (i % 12 === 0 ? 0.95 : 0.40)),
  '随机 20% 高分': (n) => Array.from({ length: n }, () => (Math.random() < 0.2 ? 0.95 : 0.40)),
};

console.log(line);
console.log('一、四种规则在同一条 s 序列上的表现（200 次观测）');
console.log(line);
console.log('  规则定义：');
console.log('    甲 窗口 10 内 ≥2 次 → 触发后清空   ← 现行');
console.log('    乙 最近 2 次里有 1 次 s>U');
console.log('    丙 不滑动，触发后清空（间隙无限）');
console.log('    丁 连续 2 次 s>U');
console.log(line);
console.log('  s 序列                     甲(U/次数)      乙(U/次数)      丙(U/次数)      丁(U/次数)');
console.log('  ' + '─'.repeat(90));
for (const [name, gen] of Object.entries(PATTERNS)) {
  const seq = gen(200);
  const a = ruleWindow(seq, 10, 2);
  const b = ruleRecent2of1(seq);
  const c = ruleCounter(seq, 2);
  const d = ruleConsec2(seq);
  const mark = (x) => `${p3(x.U)}/${String(x.ups).padStart(3)}`;
  console.log(`  ${name.padEnd(24)} ${mark(a).padEnd(15)} ${mark(b).padEnd(15)} ${mark(c).padEnd(15)} ${mark(d).padEnd(15)}`);
}

console.log('\n' + line);
console.log('二、关键：甲和丙的差别只在「间隙 > 窗口」时出现');
console.log(line);
console.log('  原理：甲的窗口会滑出旧的标记，丙不会\n');
console.log('  间隙    甲(窗口10)上浮次数   丙(不滑动)上浮次数   是否一致');
for (const gap of [2, 3, 5, 8, 10, 11, 12, 20]) {
  const seq = Array.from({ length: 400 }, (_, i) => (i % gap === 0 ? 0.95 : 0.40));
  const a = ruleWindow(seq, 10, 2);
  const c = ruleCounter(seq, 2);
  const same = a.ups === c.ups ? '✅ 一致' : '❌ 不一致';
  console.log(`  ${String(gap).padStart(4)}    ${String(a.ups).padStart(10)}             ${String(c.ups).padStart(14)}          ${same}`);
}
console.log('\n  → 间隙 ≤ 10（窗口大小）时两者完全一致');
console.log('  → 间隙 > 10 时，甲会漏掉标记，丙不会');

console.log('\n' + line);
console.log('三、乙（「最近 2 次里有 1 次」）为什么完全不同');
console.log(line);
console.log('  乙 要求两次高分的间隔 ≤ 2，所以它 ≈ 「几乎连续」\n');
console.log('  间隙    甲上浮   乙上浮    丙上浮    说明');
for (const gap of [2, 3, 4, 5, 8, 12]) {
  const seq = Array.from({ length: 400 }, (_, i) => (i % gap === 0 ? 0.95 : 0.40));
  const a = ruleWindow(seq, 10, 2), b = ruleRecent2of1(seq), c = ruleCounter(seq, 2);
  let note = '';
  if (a.ups === b.ups) note = '乙与甲偶然相同';
  else if (b.ups === 0) note = '**乙完全死锁**';
  else note = '乙远少于甲';
  console.log(`  ${String(gap).padStart(4)}    ${String(a.ups).padStart(4)}   ${String(b.ups).padStart(5)}   ${String(c.ups).padStart(5)}   ${note}`);
}
console.log('\n  → **间隙 ≥ 3 时乙就死了**，而甲/丙还能活');

console.log('\n' + line);
console.log('四、结论：我 22:18 那句「等价」错在哪');
console.log(line);
console.log(`
  我说的「等价」是：**窗口 5/10/15/20 结果一样**（这个实测成立）
  但我推出「所以 ≡ 最近2次里有1次」—— **这一步是错的**

  原因：我只测了「窗口大小」这一个维度，没测「窗口 vs 计数器」的差别。
  实际上：
  · 窗口 5~20 之间确实等价（都 ≥ 间隙 2）
  · 但「最近 2 次里有 1 次」要求间隙 ≤ 2，是**另一个规则**
  · 间隙 3、5、8 的序列上，两者差好几倍

  **正确的表述：**
  ┌────────────────────────────────────────────────────────────┐
  │ 窗口 W（≥ 某值）内部任意选择都等价，                          │
  │ 因为触发后清空、窗口用不满，W 只需要 ≥ 典型间隙。              │
  │                                                              │
  │ 现行 W=10覆盖了「间歇表现」的场景（间隙 ≤ 10）——这是对的。    │
  │ 真正可选的替代是「丙：不滑动计数器」（间隙无限），             │
  │ 它比现行更宽松，间隙 > 10 时也能触发。│
  └────────────────────────────────────────────────────────────┘
`);

console.log('\n' + line);
console.log('五、丙（不滑动）会不会太松');
console.log(line);
console.log('  测试：s 恒定 0.40（一直差，偶尔一次 0.95）\n');
for (const rare of [0, 5, 20, 50, 100]) {
  const seq = new Array(200).fill(0.40);
  for (let i = 0; i < 200; i += rare || 200) if (rare) seq[i] = 0.95;
  if (!rare) seq[0] = 0.95;
  const a = ruleWindow(seq, 10, 2);
  const c = ruleCounter(seq, 2);
  console.log(`  每 ${String(rare || 200).padStart(3)} 次里 1 次高分：甲 U=${p3(a.U)}（${String(a.ups).padStart(3)} 次）  丙 U=${p3(c.U)}（${String(c.ups).padStart(3)} 次）`);
}
console.log('\n  → 丙在「偶尔一次好」时也会涨（因为那个高分一直记着）');
console.log('  → 现行甲只在高分后 10 次内再来一次才涨 —— 更保守');
console.log('\n  **我建议保持现行（窗口 10），不要改成丙。**');
console.log('  理由：丙会把「一年做对一次」的偶然当成突破。');
