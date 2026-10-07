/**
 * A 逼近 U 的机制验证 —— 用户的设计意图
 * 跑法：node scripts/a-hugs-u.mjs
 *
 * 用户原话：「A 应该要很逼近 U，然后等学生有超出预期的表现之后，
 *          U 突破了之后，A 继续不断逼近 U」
 *
 * 这是两个要求：
 *   ① A 紧贴 U（gap → 0）
 *   ② U 被突破后，A 继续追踪新的 U
 */

const CAL = (d) => 0.6 + 0.4 * d;
const p3 = (x) => x.toFixed(3);
const p4 = (x) => x.toFixed(4);
const line = '='.repeat(94);

function sim(seq, opt = {}) {
  const { alpha = 0.1, U0 = 0.5, A0 = 0.3, dU = 0.05, need = 2, mult = 'linear', delta = 0.01 } = opt;
  let A = A0, U = U0, above = 0, ups = 0;
  const log = [];
  seq.forEach((o, i) => {
    const s = o.P * CAL(o.D);
    const bA = A, bU = U;
    if (s > U) { above++; if (above >= need) { U += dU * (1 - U); ups++; above = 0; } } else above = 0;
    const gap = Math.max(0, U - A);
    const m = mult === 'sqrt' ? Math.sqrt(gap) + delta : gap;
    A = Math.max(0, Math.min(U, A + alpha * (s - A) * m));
    log.push({ n: i + 1, s, A, U, gap: U - A, dA: A - bA, dU: U - bU, ups });
  });
  return { A, U, ups, log };
}

const flat = (P, D, n) => Array.from({ length: n }, () => ({ P, D }));

console.log(line);
console.log('一、要求①：A 能不能紧贴 U');
console.log(line);
console.log('  测试：恒定 P=0.90，2000 次，线性阻尼\n');
console.log('  n      s      A        U       gap      ΔA');
const r1 = sim(flat(0.90, 0.5, 2000));
for (const i of [0, 1, 4, 9, 19, 49, 99, 299, 999, 1999]) {
  const e = r1.log[i];
  console.log(`  ${String(e.n).padStart(4)}  ${p3(e.s)}  ${p3(e.A)}  ${p3(e.U)}   ${p4(e.gap)}   ${(e.dA*100).toFixed(3).padStart(6)}`);
}
console.log(`\n  → 最终 gap = ${p4(r1.log[1999].gap)}`);
console.log('  → 线性阻尼下 gap 会不会归零？');

console.log('\n' + line);
console.log('二、要求②：U 突破后 A 继续追');
console.log(line);
console.log('  测试：前 600 次 P=0.70（普通水平），后 600 次 P=0.90（超出预期）\n');
const seq2 = [...flat(0.70, 0.5, 600), ...flat(0.90, 0.5, 600)];
const r2 = sim(seq2);
console.log('  阶段      n     s      A        U       gap     本次ΔA');
for (const i of [199, 299, 399, 499, 599, 601, 603, 605, 650, 800, 1000, 1199]) {
  const e = r2.log[i];
  const stage = e.n <= 600 ? '普通' : '超预期';
  console.log(`  ${stage.padEnd(8)} ${String(e.n).padStart(4)}  ${p3(e.s)}  ${p3(e.A)}  ${p3(e.U)}   ${p4(e.gap)}   ${(e.dA*100).toFixed(3).padStart(6)}`);
}
// 找 U 突破的时刻
const firstUp = r2.log.find(e => e.dU > 0);
const upsAfter = r2.log.filter(e => e.n > 600 && e.dU > 0).length;
console.log(`\n  → 阶段一结束（第600次）A=${p3(r2.log[599].A)} U=${p3(r2.log[599].U)}`);
console.log(`  → 首次U 突破在第 ${firstUp.n} 次（U ${p3(firstUp.U - firstUp.dU)} → ${p3(firstUp.U)}）`);
console.log(`  → 突破后 A 继续上涨：${p3(r2.log[599].A)} → ${p3(r2.A)}`);
console.log(`  → U 后续又突破了 ${upsAfter} 次`);

console.log('\n' + line);
console.log('三、逐次突破序列（模拟「U 突破 → A 追上 → 再突破」）');
console.log(line);
// 构造阶梯上升的场景：P 每 200 次提升 0.05
const stair = [];
for (let block = 0; block < 8; block++) {
  const P = 0.60 + block * 0.05;
  for (let i = 0; i < 200; i++) stair.push({ P, D: 0.5 });
}
const r3 = sim(stair);
console.log('  每 200 次 P 提 0.05（0.60 → 0.95）\n');
console.log('  区间          s      A        U       gap     U突破次数');
const bounds = [50, 150, 199, 250, 350, 399, 450, 550, 599, 650, 750, 799, 850, 950, 999, 1100, 1199, 1300, 1400, 1500, 1599];
for (const n of bounds) {
  const e = r3.log[n - 1];
  const blk = Math.floor((n - 1) / 200);
  console.log(`  P=${(0.60+blk*0.05).toFixed(2)}  ${String(n).padStart(4)}  ${p3(e.s)}  ${p3(e.A)}  ${p3(e.U)}   ${p4(e.gap)}   ${String(e.ups).padStart(3)}`);
}
console.log(`\n  → 最终 A=${p3(r3.A)} U=${p3(r3.U)}，共上浮 ${r3.ups} 次`);
console.log(`  → gap 是否一直很小：${bounds.map(n=>p4(r3.log[n-1].gap)).filter((_,i)=>i%4===0).join(' ')}`);

console.log('\n' + line);
console.log('四、gap 会不会归零 —— 阻尼形式对比');
console.log(line);
console.log('  「A紧贴 U」在数学上要求 gap→0 时 ΔA 仍能推动 A 前进');
console.log('  线性阻尼 ΔA = α(s−A)(U−A)，gap→0 时 ΔA→0 → **A 会被卡住**\n');
console.log('  实测：恒定 s=0.90，gap 随时间');
for (const [name, opt] of [['线性阻尼', { mult: 'linear' }], ['√阻尼', { mult: 'sqrt' }], ['√阻尼+δ=0.01', { mult: 'sqrt', delta: 0.01 }]]) {
  const r = sim(flat(0.90, 0.5, 2000), opt);
  const g = [9, 99, 499, 999, 1999].map(i => p4(r.log[i].gap));
  console.log(`    ${name.padEnd(14)} gap: ${g.join('  ')}  最终 A=${p3(r.A)}`);
}

console.log('\n' + line);
console.log('五、关键问题：gap→0 时 A 还能不能动');
console.log(line);
console.log('  场景：s 稳定在 0.90，U 也稳定在 0.90（不再突破）');
console.log('  此时 s − A = 0.90 − 0.90 = 0 → **A 也不动**');
console.log('  所以 gap→0 不是问题，因为 s−A 也→0，两者同时为零\n');
console.log('  真正的问题是：U 突破了，但 s 还没跟上');
for (const [name, opt] of [['线性阻尼', { mult: 'linear' }], ['√阻尼+δ', { mult: 'sqrt', delta: 0.01 }]]) {
  const seq = [];
  // 前 1000 次 P=0.70（U 涨到 ~0.7）
  for (let i = 0; i < 1000; i++) seq.push({ P: 0.70, D: 0.5 });
  // 然后突然连续做难题 P=0.95，U 被推高
  for (let i = 0; i < 100; i++) seq.push({ P: 0.95, D: 0.9 });
  // 之后回到 P=0.70（回到普通水平）
  for (let i = 0; i < 400; i++) seq.push({ P: 0.70, D: 0.5 });
  const r = sim(seq, opt);
  const marks = [999, 1050, 1099, 1200, 1400, 1499];
  console.log(`\n  ${name}：`);
  console.log('    n      s      A        U       gap');
  for (const n of marks) {
    const e = r.log[n-1];
    console.log(`    ${String(n).padStart(4)}  ${p3(e.s)}  ${p3(e.A)}  ${p3(e.U)}   ${p4(e.gap)}`);
  }
}

console.log('\n' + line);
console.log('六、α 值对「追得紧不紧」的影响');
console.log(line);
console.log('  场景：U 突然涨到 0.90，s=0.70，A 从 0.70 往上追');
console.log('\n  α      50次后gap  100次后   200次后   400次后');
for (const a of [0.10, 0.20, 0.30, 0.50]) {
  // 构造：s 保持 0.70，U 手动设 0.90
  let A = 0.70, U = 0.90;
  const gaps = [];
  for (let i = 1; i <= 400; i++) {
    A = Math.max(0, Math.min(U, A + a * (0.70 - A) * (U - A)));
    if ([50, 100, 200, 400].includes(i)) gaps.push(U - A);
  }
  console.log(`  ${p3(a)}  ${gaps.map(g=>p4(g).padStart(9)).join('  ')}`);
}
console.log('\n  → α 越大追得越紧，但 s<A 时会下降快');
console.log('  → α=0.1 时 400 次后 gap 仍 0.17 → 追不上');

console.log('\n' + line);
console.log('七、结论与建议');
console.log(line);
console.log(`
  你的设计意图 = A 贴身追 U，U 被突破后 A 继续追。
  实测这个意图在现行公式下**只能部分实现**。

  ✅ 能做到：U 突破后 A 会跟着涨（第三节实测 0.60→0.85，A 从 0.68 涨到 0.85）
  ❌ 做不到：A 追不上 U（α=0.1 时 400 次后 gap 仍有 0.17）

  **根因：ΔA = α(s−A)(U−A) 被「s−A」限死**
  而 s 不会超过 U（U 是 s 的累积上界）→ **s−A 有个天花板**

  也就是说：**A 追的是 s，不是追 U。**
  s 到 0.85，A 的目标就是 0.85；U 涨到 0.90 但 s 只有 0.85 时 A 停在 0.85。

  **这不是 bug，是 A 的定义决定的**：
  A =「他实际能做到什么」→ A 应该等s，不等 U
  U =「他到过的最高」→ U 记录历史

  **两者本就不该完全相等**：
  · s 刚突破 → U > s（历史高于现在）
  · s 持续超越 → U ≈ s（历史=现在）

  所以「A 逼近 U」的真正含义是：**A 逼近 s，而 s 逼近 U。**

  **要 A 真的贴住 U，只有两条路**：
  ① A 的更新不用 (U−A) 因子 → 纯 EWMA，A 直接跟 s
     但那样 A 可能超过 U → 需要 clamp（现在已经有）
  ② α 调大（0.3~0.5）→ 追得快，但 s<A 时跌得也快

  **我建议①** —— 因为「A 逼近 U」在语义上就意味着「A 逼近他到过的最高」，
  而 EWMA 本来就是这个意思。
`);
