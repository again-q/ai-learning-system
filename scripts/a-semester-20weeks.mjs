/**
 * A 按时间模拟 · 一个学期 20 周 × 每周 100 道 = 2000 道
 * 跑法：node scripts/a-semester-20weeks.mjs
 *
 * 用户纠正：「100 道相当于一周啊」→ 之前把一周当一学期算了
 * 「A1 是要按照时间模拟的」→ 按周推进，每周结算一次
 */

const CAL = (d) => 0.6 + 0.4 * d;
const SEGS = { 简单: 3, 中等: 5, 困难: 7 };
const p0 = (x) => (x * 100).toFixed(1);
const line = '='.repeat(84);

// ── 一周的真实构成：100 道，混合顺序，真实配比 70/20/10 ──
function makeWeek(kind, weekIndex) {
  const bag = [];
  // 学期中后期难题占比略升（学的越多，题越难）
  const hardShare = 0.10 + Math.min(0.05, weekIndex * 0.0025);
  const nHard = Math.round(100 * hardShare);
  const nMid = Math.round(100 * 0.20);
  const nEasy = 100 - nHard - nMid;

  for (let i = 0; i < nEasy; i++) {
    const r = Math.random();
    if (kind === '强')      bag.push({ lv: '简单', D: 0.2, P: r < 0.93 ? 1.0 : 0.9, brk: r < 0.93 ? 0 : 1 });
    else if (kind === '中') bag.push({ lv: '简单', D: 0.2, P: r < 0.82 ? 1.0 : r < 0.96 ? 0.8 : 0.5, brk: r < 0.82 ? 0 : r < 0.96 ? 1 : 2 });
    else                    bag.push({ lv: '简单', D: 0.2, P: r < 0.68 ? 1.0 : r < 0.92 ? 0.8 : 0.4, brk: r < 0.68 ? 0 : r < 0.92 ? 1 : 2 });
  }
  for (let i = 0; i < nMid; i++) {
    const r = Math.random();
    if (kind === '强')      bag.push({ lv: '中等', D: 0.5, P: r < 0.88 ? 1.0 : 0.9, brk: r < 0.88 ? 0 : 1 });
    else if (kind === '中') bag.push({ lv: '中等', D: 0.5, P: r < 0.55 ? 1.0 : r < 0.88 ? 0.7 : 0.4, brk: r < 0.55 ? 0 : r < 0.88 ? 2 : 4 });
    else                    bag.push({ lv: '中等', D: 0.5, P: r < 0.22 ? 1.0 : r < 0.62 ? 0.6 : 0.2, brk: r < 0.22 ? 0 : r < 0.62 ? 3 : 4 });
  }
  for (let i = 0; i < nHard; i++) {
    const r = Math.random();
    if (kind === '强')      bag.push({ lv: '困难', D: 0.85, P: r < 0.55 ? 1.0 : 0.9, brk: r < 0.55 ? 0 : 1 });
    else if (kind === '中') bag.push({ lv: '困难', D: 0.85, P: r < 0.18 ? 1.0 : r < 0.50 ? 0.6 : 0.3, brk: r < 0.18 ? 0 : 2 });
    else                    bag.push({ lv: '困难', D: 0.85, P: r < 0.06 ? 0.8 : 0.2, brk: 2 });
  }
  for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
  return bag;
}

// ── 按周推进的模拟 ──
function simulateSemester(kind, opt = {}) {
  const { th = 0.8, alpha = 0.25, U0 = 0.5, deltaU = 0.05, streak = 2, weeks = 20, growth = 0 } = opt;
  let A = 0.30, U = U0, hi = 0, lo = 0;
  let totalUps = 0, totalQualified = 0, totalObs = 0;
  const weekly = [];
  const downRate = 0.03, downStreak = 5;

  for (let w = 0; w < weeks; w++) {
    // 学生这周的水平会随练习缓慢提升（对齐 s 分布）
    const g = growth * w;
    const prof = makeWeek(kind, w).map(o => ({
      ...o,
      P: Math.max(0, Math.min(1, o.P + g * (o.lv === '困难' ? 0.06 : o.lv === '中等' ? 0.03 : 0.01))),
    }));
    const wStart = A, wStartU = U;
    let wUps = 0, wQual = 0;
    for (const o of prof) {
      const q = 1 - o.brk / SEGS[o.lv];
      const s = o.P * CAL(o.D) * q;
      totalObs++;
      if (s >= th) { wQual++; hi++; } else hi = 0;
      if (hi >= streak) { U += deltaU * (1 - U); totalUps++; wUps++; hi = 0; }
      if (s <= 0.6) { lo++; if (lo >= downStreak) { U -= downRate * (U - A); lo = 0; } } else lo = 0;
      A = Math.max(0, Math.min(U, A + alpha * (s - A) * (U - A)));
    }
    totalQualified += wQual;
    weekly.push({ w: w + 1, n: prof.length, A, U, wUps, wQual, dA: A - wStart, dU: U - wStartU });
  }
  return { A, U, totalUps, totalQualified, totalObs, weekly };
}

const KIND = { 强: '较强', 中: '中等', 弱: '比较拉' };
const avgRun = (kind, opt, n = 8) => {
  const rs = [];
  for (let t = 0; t < n; t++) rs.push(simulateSemester(kind, opt));
  const m = (f) => rs.reduce((s, r) => s + f(r), 0) / rs.length;
  return { A: m(r => r.A), U: m(r => r.U), ups: m(r => r.totalUps), qual: m(r => r.totalQualified), obs: m(r => r.totalObs), weekly: rs[0].weekly };
};

console.log(line);
console.log('A 按时间模拟 · 一个学期 20 周 × 每周 100 道 = 2000 道');
console.log(line);
console.log('  α=0.25  U₀=0.50  门槛 s≥0.8 两连  δᵤ=0.05  难度校准 0.6+0.4D  下浮 s≤0.6 五连');
console.log('  难度配比 70/20/10，中后期难题占比微升；混合顺序（真实做题顺序）\n');

const base = {};
for (const kind of ['强', '中', '弱']) {
  base[kind] = avgRun(kind);
  const target = kind === '强' ? 0.85 : kind === '中' ? 0.60 : 0.40;
  const r = base[kind];
  console.log(`  ${KIND[kind].padEnd(6)} 期末 A=${p0(r.A).padStart(5)}  U=${p0(r.U).padStart(5)}  上浮 ${r.ups.toFixed(0).padStart(3)} 次/  达标 ${r.qual.toFixed(0).padStart(4)}/${r.obs.toFixed(0)} (${(r.qual / r.obs * 100).toFixed(0)}%)  你的基准 ${target}  ${Math.abs(target - r.A) < 0.06 ? '✅' : '🟡 差 ' + ((target - r.A) * 100).toFixed(1) + ' 点'}`);
}

console.log('\n' + line);
console.log('「较强」学生的逐周轨迹（每100 道结算一次）');
console.log(line);
console.log('   周   题数   达标数   上浮次数A        U         ΔA本周   ΔU本周');
console.log('  ' + '─'.repeat(70));
for (const e of base.强.weekly) {
  if (e.w % 2 !== 0 && e.w !== 20) continue;
  console.log(`  ${String(e.w).padStart(3)}   ${String(e.n).padStart(4)}   ${String(e.wQual).padStart(5)}   ${String(e.wUps).padStart(6)}   ${p0(e.A).padStart(5)}   ${p0(e.U).padStart(5)}   ${(e.dA * 100 >= 0 ? '+' : '')}${(e.dA * 100).toFixed(1).padStart(6)}   ${(e.dU * 100 >= 0 ? '+' : '')}${(e.dU * 100).toFixed(1).padStart(4)}`);
}

console.log('\n' + line);
console.log('2000 道下「连续 2 次」不再是瓶颈');
console.log(line);
console.log(`  较强学生：2000 道里达标 ${base.强.qual.toFixed(0)} 次，上浮 ${base.强.ups.toFixed(0)} 次`);
console.log(`  有效率 = ${(base.强.ups / base.强.qual * 100).toFixed(0)}%（100 道时只有 18%）`);
console.log(`  U 从 0.50 涨到 ${p0(base.强.U)}，A 跟着到 ${p0(base.强.A)}`);

console.log('\n' + line);
console.log('三档对比（现行参数）');
console.log(line);
console.log('  档       期末A     期末U    上浮次数   A/U');
for (const kind of ['强', '中', '弱']) {
  const r = base[kind];
  const t = kind === '强' ? 0.85 : kind === '中' ? 0.60 : 0.40;
  console.log(`  ${KIND[kind].padEnd(6)} ${p0(r.A).padStart(6)}  ${p0(r.U).padStart(6)}   ${r.ups.toFixed(0).padStart(6)}   ${p0(r.A / r.U)}  ${r.A >= t - 0.06 ? '✅' : '🟡 差' + ((t - r.A) * 100).toFixed(1)}`);
}

console.log('\n' + line);
console.log('「较强」能不能到 0.85？—— 加练习成长项再试');
console.log(line);
console.log('  上一轮全是「水平固定」假设（他一直做同样的题）');
console.log('  真实情况：他这学期在进步，P 会缓慢上升。加 growth 项：\n');
console.log('  成长速度growth     期末A     期末U    上浮次数   你的基准0.85');
console.log('  ' + '─'.repeat(58));
for (const g of [0, 0.002, 0.005, 0.008, 0.012, 0.02]) {
  const r = avgRun('强', { growth: g }, 8);
  const v = r.A >= 0.80 ? '✅' : r.A >= 0.70 ? '🟡' : '❌';
  console.log(`  +${(g * 100).toFixed(1)}%/周           ${p0(r.A).padStart(6)}  ${p0(r.U).padStart(6)}   ${r.ups.toFixed(0).padStart(6)}   ${v}`);
}

console.log('\n' + line);
console.log('三个结论');
console.log(line);
console.log(`
  ① 一个学期 2000 道下，「连续 2 次」不再是主要瓶颈
     有效率从 100 道时的 18% 回升到 ${(base.强.ups / base.强.qual * 100).toFixed(0)}%
     → 我上一轮说的「连续 2 次是主要瓶颈」是**样本量不足造成的假象**

  ② 但「较强」仍到不了 0.85，期末 A = ${p0(base['强'].A)}
     原因不是触发次数（${base['强'].ups.toFixed(0)} 次足够把U 推很高），
     而是每次涨幅 0.05×(1−U) 递减 + 后期 s 不再显著高于 A

  ③ 加「练习成长」也没用 —— growth 提高的是 P，而 P 到 1.0 之后 s 就封顶了
     U 的天花板来自 s 的上限 0.940，不是来自练习量
`);
