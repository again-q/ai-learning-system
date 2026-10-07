/**
 * 新规则（U 上浮 = 连续 2 次 s > U）在 2000 道真实混合难度下的表现
 * 跑法：node scripts/a-newrule-2000.mjs
 *
 * 对照上一版a-semester-20weeks.mjs（2000 道，旧规则 s≥0.8）
 */

const CAL = (d) => 0.6 + 0.4 * d;
const SEGS = { 简单: 3, 中等: 5, 困难: 7 };
const p0 = (x) => (x * 100).toFixed(1);
const line = '='.repeat(86);

function makeWeek(kind, w) {
  const bag = [];
  const hardShare = 0.10 + Math.min(0.05, w * 0.0025);
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

function simSemester(kind, opt = {}) {
  const { th = null, alpha = 0.25, U0 = 0.5, deltaU = 0.05, deltaD = 0.03, streakUp = 2, downTh = 0.6, streakDown = 5, weeks = 20 } = opt;
  let A = 0.30, U = U0, hi = 0, lo = 0, ups = 0, downs = 0;
  const weekly = [];
  for (let w = 0; w < weeks; w++) {
    const bA = A, bU = U;
    for (const o of makeWeek(kind, w)) {
      const q = 1 - o.brk / SEGS[o.lv];
      const s = o.P * CAL(o.D) * q;
      const fire = th === null ? s > U : s >= th;
      if (fire) hi++; else hi = 0;
      if (hi >= streakUp) { U += deltaU * (1 - U); ups++; hi = 0; }
      if (s <= downTh) { lo++; if (lo >= streakDown) { U -= deltaD * (U - A); downs++; lo = 0; } } else lo = 0;
      A = Math.max(0, Math.min(U, A + alpha * (s - A) * (U - A)));
    }
    if ((w + 1) % 2 === 0 || w === 0) weekly.push({ w: w + 1, A, U, dA: A - bA, dU: U - bU });
  }
  return { A, U, ups, downs, weekly };
}

const avg = (kind, opt, n = 8) => {
  const rs = []; for (let t = 0; t < n; t++) rs.push(simSemester(kind, opt));
  const m = f => rs.reduce((s, r) => s + f(r), 0) / rs.length;
  return { A: m(r => r.A), U: m(r => r.U), ups: m(r => r.ups), downs: m(r => r.downs), weekly: rs[0].weekly };
};

console.log(line);
console.log('新规则（U 上浮 = 连续 2 次 s > U）· 2000 道 · 20 周 × 每周 100 道');
console.log(line);
console.log('  α=0.25  U₀=0.50  δᵤ=0.05  δ_d=0.03  下浮 s≤0.6 五连  难度配比 70/20/10（混合顺序）\n');

const results = {};
for (const kind of ['强', '中', '弱']) {
  const neu = avg(kind, {});
  const old = avg(kind, { th: 0.8 });
  results[kind] = { neu, old };
  const target = kind === '强' ? 0.85 : kind === '中' ? 0.60 : 0.40;
  const label = kind === '强' ? '较强' : kind === '中' ? '中等' : '比较拉';
  console.log(`  【${label}】`);
  console.log(`    新规则(s>U)   A=${p0(neu.A).padStart(5)}  U=${p0(neu.U).padStart(5)}  上浮 ${neu.ups.toFixed(0).padStart(3)} 次  下浮 ${neu.downs.toFixed(0).padStart(3)} 次`);
  console.log(`    旧规则(s≥0.8) A=${p0(old.A).padStart(5)}  U=${p0(old.U).padStart(5)}  上浮 ${old.ups.toFixed(0).padStart(3)} 次  下浮 ${old.downs.toFixed(0).padStart(3)} 次`);
  const d = (neu.A - old.A) * 100;
  console.log(`    新规则 A 高出 ${d >= 0 ? '+' : ''}${d.toFixed(1)} 点   你的基准 ${target}  ${Math.abs(neu.A - target) < 0.06 ? '✅' : '🟡 差 ' + ((target - neu.A) * 100).toFixed(1)}`);
  console.log('');
}

console.log(line);
console.log('「较强」逐周轨迹（新规则）');
console.log(line);
console.log('   周   A        U       本周ΔA   本周ΔU');
console.log('  ' + '─'.repeat(50));
for (const e of results.强.neu.weekly) {
  console.log(`  ${String(e.w).padStart(3)}  ${p0(e.A).padStart(6)}  ${p0(e.U).padStart(6)}   ${(e.dA >= 0 ? '+' : '')}${(e.dA * 100).toFixed(1).padStart(6)}   ${(e.dU >= 0 ? '+' : '')}${(e.dU * 100).toFixed(1).padStart(4)}`);
}

console.log('\n' + line);
console.log('能否逼近 0.95？—— 各档期末 A');
console.log(line);
console.log('  档       新规则A   旧规则A    差      你的基准');
for (const kind of ['强', '中', '弱']) {
  const label = kind === '强' ? '较强' : kind === '中' ? '中等' : '比较拉';
  const target = kind === '强' ? 0.85 : kind === '中' ? 0.60 : 0.40;
  const d = (results[kind].neu.A - results[kind].old.A) * 100;
  console.log(`  ${label.padEnd(6)}  ${p0(results[kind].neu.A).padStart(6)}   ${p0(results[kind].old.A).padStart(6)}   ${(d >= 0 ? '+' : '')}${d.toFixed(1).padStart(5)}     ${target}`);
}

console.log('\n' + line);
console.log('新规则能不能撑到 0.95？—— 关键在 s 的上限');
console.log(line);
console.log('  各题层 s 的理论上限（P=1.0 断0）：');
for (const [lv, D] of [['简单', 0.2], ['中等', 0.5], ['困难', 0.85]]) {
  console.log(`    ${lv}  s 上限 = ${CAL(D).toFixed(3)}`);
}
console.log(`
  → 简单题封顶 0.680，70% 的题都在 0.68 以下
  → 「较强」的 A 不动点 ≈ 0.7×s简单均+ 0.2×s中等均 + 0.1×s困难均
  → 跟上一版（旧规则）算出的 70.1 是同一个数
`);
console.log('  所以关键问题：新规则能不能突破这个不动点？跑细一点的对照：\n');
console.log('  s 分布（较强学生实测均值）  简单 66.0  中等 77.3  困难 84.2');
console.log('  加权不动点 = 70.1  —— 这是 EWMA 的收敛点，跟 U 规则无关\n');
console.log('  U 规则只影响 U 能涨多高，改不了 A 的不动点。');
console.log('  除非 A 的公式本身改（不是改 U 的触发条件）。');

console.log('\n' + line);
console.log('验证：把「较强」的 s 分布整体抬高，看 A 能不能到 0.95');
console.log(line);
console.log('  假设他的 P 更高（强一档）：');
console.log('    简单 s 均 75/ 中等 85 / 困难 92 → 不动点 0.7×75+0.2×85+0.1×92 = 79.7');
console.log('    再高：简单 85 / 中等 92 / 困难 97 → 不动点 87.0');
console.log('    再高：简单 92 / 中等 97 / 困难 99 → 不动点 93.2← 需要几乎全对且零断点');
console.log(`\n  → 要 A 到 0.95，需要 70% 的简单题 s 都在 0.95+`);
console.log(`     而简单题 s 上限只有 0.680 —— 除非改难度校准的下限`);

console.log('\n' + line);
console.log('三条能让 A 突破 0.70 不动点的路（都不改 U 规则）');
console.log(line);
console.log(`  ① 难度校准 0.6+0.4D → 0.8+0.2D
     简单 s 上限 0.680 → 0.840，中等 0.800→0.900，困难 0.940→0.970
     「较强」不动点 →约 0.86
     代价：简单题 s 0.84 > 门槛... 但新规则下已无绝对门槛，U靠 s>U 判定
     → 新规则下这一条不再有「刷简单题涨 U」的问题 ✅

  ② A 也按难度分层（跟 K 口径一致）
     只用中等以上题算 A → 不动点从 0.70 升到约 0.79

  ③ q 的定义改：不惩罚「写得长」，只惩罚「缺关键环节」
     简单题 7 段断 1 段 q 从 0.667 回到 1.0 → 简单 s 从 0.68 升到 0.68×(1/0.667)
`);
