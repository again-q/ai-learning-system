/**
 * 新规则候选：最近 10 次观测内有 ≥2 次 s > U → 上浮
 * 跑法：node scripts/a-window-rule.mjs
 *
 * 用户原话：「把连续两次的 s>U，改成最近10次观测内有至少两次的 s>U，就更新天花板」
 * 动机：连续 2 次在 s 波动时经常断链（上浮次数只有 25 次）
 */

const CAL = (d) => 0.6 + 0.4 * d;
const SEGS = { 简单: 3, 中等: 5, 困难: 7 };
const p0 = (x) => (x * 100).toFixed(1);
const line = '='.repeat(88);

function makeWeek(kind, w, growth = 0) {
  const bag = [];
  const hardShare = 0.10 + Math.min(0.05, w * 0.0025);
  const nHard = Math.round(100 * hardShare);
  const nMid = Math.round(100 * 0.20);
  const nEasy = 100 - nHard - nMid;
  for (let i = 0; i < nEasy; i++) {
    const r = Math.random();
    let P = kind === '强' ? (r < 0.93 ? 1.0 : 0.9) : kind === '中' ? (r < 0.82 ? 1.0 : r < 0.96 ? 0.8 : 0.5) : (r < 0.68 ? 1.0 : r < 0.92 ? 0.8 : 0.4);
    P = Math.max(0, Math.min(1, P + growth * w * 0.01));
    const brk = P > 0.95 ? 0 : P > 0.8 ? 1 : 2;
    bag.push({ lv: '简单', D: 0.2, P, brk });
  }
  for (let i = 0; i < nMid; i++) {
    const r = Math.random();
    let P = kind === '强' ? (r < 0.88 ? 1.0 : 0.9) : kind === '中' ? (r < 0.55 ? 1.0 : r < 0.88 ? 0.7 : 0.4) : (r < 0.22 ? 1.0 : r < 0.62 ? 0.6 : 0.2);
    P = Math.max(0, Math.min(1, P + growth * w * 0.03));
    const brk = P > 0.95 ? 0 : P > 0.8 ? 1 : 2;
    bag.push({ lv: '中等', D: 0.5, P, brk });
  }
  for (let i = 0; i < nHard; i++) {
    const r = Math.random();
    let P = kind === '强' ? (r < 0.55 ? 1.0 : 0.9) : kind === '中' ? (r < 0.18 ? 1.0 : r < 0.50 ? 0.6 : 0.3) : (r < 0.06 ? 0.8 : 0.2);
    P = Math.max(0, Math.min(1, P + growth * w * 0.06));
    const brk = P > 0.95 ? 0 : 2;
    bag.push({ lv: '困难', D: 0.85, P, brk });
  }
  for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
  return bag;
}

// ── 上浮规则：连续 streak 次 / 最近 window 次内有 ≥need 次 ──
function simSemester(kind, opt = {}) {
  const {
    cal = (d) => 0.6 + 0.4 * d, alpha = 0.25, U0 = 0.5, deltaU = 0.05, deltaD = 0.03,
    downTh = 0.6, streakDown = 5, weeks = 20, growth = 0,
    rule = 'window', window = 10, need = 2,
  } = opt;
  let A = 0.30, U = U0, hi = 0, lo = 0, ups = 0, downs = 0;
  const hist = [];// 窗口内 s>U 的标记
  const weekly = [];
  for (let w = 0; w < weeks; w++) {
    const bA = A, bU = U;
    for (const o of makeWeek(kind, w, growth)) {
      const q = 1 - o.brk / SEGS[o.lv];
      const s = o.P * cal(o.D) * q;
      const fire = s > U;
      if (rule === 'consec2') {
        if (fire) hi++; else hi = 0;
        if (hi >= 2) { U += deltaU * (1 - U); ups++; hi = 0; }
      } else if (rule === 'abs08') {
        if (s >= 0.8) hi++; else hi = 0;
        if (hi >= 2) { U += deltaU * (1 - U); ups++; hi = 0; }
      } else {
        hist.push(fire ? 1 : 0);
        if (hist.length > window) hist.shift();
        const cnt = hist.reduce((a, b) => a + b, 0);
        if (cnt >= need) { U += deltaU * (1 - U); ups++; hist.fill(0); }
      }
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
console.log('上浮规则三版对照 · 2000 道（20 周 × 每周 100 道，难度配比 70/20/10）');
console.log(line);
console.log('  α=0.25  U₀=0.50  δᵤ=0.05  下浮 s≤0.6 五连  难度校准 0.6+0.4D\n');

const RULES = [
  ['旧规则  s≥0.8 连续2次', { rule: 'abs08' }],
  ['上一版  s>U 连续2次', { rule: 'consec2' }],
  ['新规则  最近10次≥2次 s>U', { rule: 'window', window: 10, need: 2 }],
];
const all = {};
for (const kind of ['强', '中', '弱']) {
  const label = kind === '强' ? '较强' : kind === '中' ? '中等' : '比较拉';
  const target = kind === '强' ? 0.85 : kind === '中' ? 0.60 : 0.40;
  console.log(`  【${label}】 你的基准 ${target}`);
  all[kind] = {};
  for (const [name, opt] of RULES) {
    const r = avg(kind, opt);
    all[kind][name] = r;
    const v = Math.abs(r.A - target) < 0.06 ? '✅' : r.A > target ? '⚠️偏高' : '🟡差' + ((target - r.A) * 100).toFixed(1);
    console.log(`    ${name.padEnd(24)} A=${p0(r.A).padStart(5)}  U=${p0(r.U).padStart(5)}  上浮 ${r.ups.toFixed(0).padStart(3)} 次  下浮 ${r.downs.toFixed(0).padStart(3)}次  ${v}`);
  }
  const d = (all[kind][RULES[2][0]].A - all[kind][RULES[1][0]].A) * 100;
  console.log(`    → 新规则比上一版 A 高 ${d >= 0 ? '+' : ''}${d.toFixed(1)} 点\n`);
}

console.log(line);
console.log('「较强」逐周轨迹（三条规则）');
console.log(line);
console.log('   周   旧(s≥0.8)   连续2次     窗口10次≥2');
for (let i = 0; i < all.强[RULES[0][0]].weekly.length; i++) {
  const a = all.强[RULES[0][0]].weekly[i], b = all.强[RULES[1][0]].weekly[i], c = all.强[RULES[2][0]].weekly[i];
  console.log(`  ${String(a.w).padStart(3)}   ${p0(a.A).padStart(6)}    ${p0(b.A).padStart(6)}    ${p0(c.A).padStart(6)}`);
}

console.log('\n' + line);
console.log('窗口参数扫一遍（较强学生，2000 道）');
console.log(line);
console.log('  窗口  需要次数   A        U       上浮次数');
console.log('  ' + '─'.repeat(52));
for (const [w, n] of [[5, 1], [5, 2], [10, 1], [10, 2], [10, 3], [15, 2], [20, 2], [20, 3], [20, 4], [30, 3]]) {
  const r = avg('强', { rule: 'window', window: w, need: n });
  const rate = (n / w * 100).toFixed(0);
  const v = r.A >= 0.80 ? '✅' : r.A >= 0.72 ? '🟡' : '❌';
  console.log(`  ${String(w).padStart(4)}  ${String(n).padStart(6)}   ${p0(r.A).padStart(6)}  ${p0(r.U).padStart(6)}  ${r.ups.toFixed(0).padStart(6)}    (门槛率${rate}%)  ${v}`);
}

console.log('\n' + line);
console.log('三档在最优窗口下的表现（找区分度最好的组合）');
console.log(line);
console.log('  窗口/需要   较强A   中等A   较弱A    强-弱跨度   较强达标');
console.log('  ' + '─'.repeat(62));
let best = null;
for (const [w, n] of [[5, 1], [10, 1], [10, 2], [15, 2], [20, 2], [20, 3], [30, 3], [30, 4]]) {
  const a = avg('强', { rule: 'window', window: w, need: n }, 6);
  const b = avg('中', { rule: 'window', window: w, need: n }, 6);
  const c = avg('弱', { rule: 'window', window: w, need: n }, 6);
  const span = a.A - c.A;
  if (!best || span > best.span) best = { w, n, a, b, c, span };
  console.log(`  ${w}/${n}`.padEnd(12) + `${p0(a.A).padStart(6)}  ${p0(b.A).padStart(6)}  ${p0(c.A).padStart(6)}    ${p0(span).padStart(6)}    ${a.A >= 0.85 ? '✅' : '🟡'}`);
}
console.log(`\n  跨度最优：窗口 ${best.w} / 需要 ${best.n} 次 → 强 ${p0(best.a.A)} / 中 ${p0(best.b.A)} / 弱 ${p0(best.c.A)}，跨度 ${p0(best.span)}`);

console.log('\n' + line);
console.log('新规则能不能突破 0.70 不动点？—— 关键');
console.log(line);
console.log('  原因：A 的不动点 = s 的加权平均，与U 规则完全无关。');
console.log('  窗口规则只改 U 涨多快，不改 A 收敛到哪。\n');
const withNewRule = avg('强', { rule: 'window', window: best.w, need: best.n });
const withCal = avg('强', { rule: 'window', window: best.w, need: best.n, cal: (d) => 0.8 + 0.2 * d });
console.log(`  较强学生 A：`);
console.log(`    校准 0.6+0.4D（现状）      ${p0(withNewRule.A)}`);
console.log(`    校准 0.8+0.2D              ${p0(withCal.A)}   ← 唯一能突破 0.70 的改动`);
console.log(`\n  → 窗口规则的价值是让 U 涨得更顺（U 到 ${p0(withNewRule.U)} 而旧规则 ${p0(all['强'][RULES[0][0]].U)}）`);
console.log(`     但 A 的天花板要靠校准公式改`);

console.log('\n' + line);
console.log('加「练习成长」再叠加（新规则 + 校准 + 成长）');
console.log(line);
console.log('  成长/周    较强A     中等A     较弱A');
console.log('  ' + '─'.repeat(44));
for (const g of [0, 0.005, 0.01, 0.02, 0.04]) {
  const a = avg('强', { rule: 'window', window: best.w, need: best.n, cal: (d) => 0.8 + 0.2 * d, growth: g }, 6);
  const b = avg('中', { rule: 'window', window: best.w, need: best.n, cal: (d) => 0.8 + 0.2 * d, growth: g }, 6);
  const c = avg('弱', { rule: 'window', window: best.w, need: best.n, cal: (d) => 0.8 + 0.2 * d, growth: g }, 6);
  console.log(`  +${(g * 100).toFixed(1)}%      ${p0(a.A).padStart(6)}    ${p0(b.A).padStart(6)}    ${p0(c.A).padStart(6)}   ${a.A >= 0.85 ? '✅' : a.A >= 0.75 ? '🟡' : '❌'}`);
}
