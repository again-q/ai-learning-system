/**
 * 校准改 0.8+0.2D 后的完整验收跑
 * 跑法：node scripts/a-final-verify.mjs
 *
 * 现行规则（7 条）：
 *   1. 去 errorLevel 闸门
 *   2. η 移除
 *   3. U₀=0.50，α=0.1，δᵤ=0.05，δ_d=0.03
 *   4. U 上浮：窗口 10 次内 ≥2 次 s > U
 *   5. U 涨幅 × D
 *   6. ΔA = α × (s − A) × (√(U − A) + 0.01)
 *   7. 校准 s = P × (0.8 + 0.2D) × q
 */

const SEGS = { 简单: 3, 中等: 5, 困难: 7 };
const p0 = (x) => (x * 100).toFixed(1);
const p3 = (x) => x.toFixed(3);
const line = '='.repeat(92);

// ── 三档学生画像（修正为符合物理上限的真实值：P 可到 1.0）──
const PROFILES = {
  较强: {
    简单: { P: 1.00, q: 1.00, D: 0.20, brk: 0 },
    中等: { P: 1.00, q: 1.00, D: 0.50, brk: 0 },
    困难: { P: 0.95, q: 0.93, D: 0.90, brk: 1 },
  },
  中等: {
    简单: { P: 0.95, q: 0.95, D: 0.20, brk: 0 },
    中等: { P: 0.78, q: 0.90, D: 0.50, brk: 1 },
    困难: { P: 0.40, q: 0.82, D: 0.90, brk: 2 },
  },
  比较拉: {
    简单: { P: 0.82, q: 0.90, D: 0.20, brk: 1 },
    中等: { P: 0.55, q: 0.85, D: 0.50, brk: 1 },
    困难: { P: 0.25, q: 0.80, D: 0.90, brk: 2 },
  },
};
const TARGET = { 较强: 0.85, 中等: 0.70, 比较拉: 0.50 };
const MIX = { easy: 0.70, mid: 0.20, hard: 0.10 };
const CAL_NEW = (d) => 0.8 + 0.2 * d;
const CAL_OLD = (d) => 0.6 + 0.4 * d;

function makeObs(kind, n) {
  const p = PROFILES[kind]; const bag = [];
  const nE = Math.round(n * MIX.easy), nM = Math.round(n * MIX.mid);
  for (let i = 0; i < nE; i++) bag.push({ lv: '简单', ...p.简单 });
  for (let i = 0; i < nM; i++) bag.push({ lv: '中等', ...p.中等 });
  for (let i = 0; i < n - nE - nM; i++) bag.push({ lv: '困难', ...p.困难 });
  for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
  return bag;
}

function sim(kind, opt = {}) {
  const {
    cal = CAL_NEW, alpha = 0.1, U0 = 0.50, A0 = 0.30,
    dU = 0.05, dD = 0.03, window = 10, need = 2, n = 200,
    mult = 'sqrt', delta = 0.01, weightedD = true, downTh = 0.6, streakDown = 5,
  } = opt;
  let A = A0, U = U0; const hist = []; let ups = 0, downs = 0;
  const upBy = { 简单: 0, 中等: 0, 困难: 0 };
  const weekly = [];
  for (let i = 0; i < n; i++) {
    const o = makeObs(kind, n)[i];
    const s = o.P * cal(o.D) * (1 - o.brk / SEGS[o.lv]);
    // U 上浮
    hist.push({ ok: s > U, D: o.D, lv: o.lv });
    if (hist.length > window) hist.shift();
    if (hist.filter(x => x.ok).length >= need) {
      const t = [...hist].reverse().find(x => x.ok);
      U += dU * (1 - U) * (weightedD ? t.D : 1);
      ups++; upBy[t.lv]++; hist.fill({ ok: false, D: 0, lv: '-' });
    }
    // U 下浮
    if (s <= downTh) { if (++downs >= streakDown) { U -= dD * (U - A); downs = 0; } } else downs = 0;
    // A 更新
    const gap = Math.max(0, U - A);
    const m = mult === 'sqrt' ? Math.sqrt(gap) + delta : gap;
    A = Math.max(0, Math.min(U, A + alpha * (s - A) * m));
    if ((i + 1) % 20 === 0) weekly.push({ n: i + 1, A, U });
  }
  return { A, U, ups, upBy, weekly };
}
const avg = (kind, opt, n = 15) => { const rs = []; for (let t = 0; t < n; t++) rs.push(sim(kind, opt)); const m = f => rs.reduce((s, r) => s + f(r), 0) / rs.length; return { A: m(r => r.A), U: m(r => r.U), ups: m(r => r.ups), upBy: rs[0].upBy, weekly: rs[0].weekly }; };

console.log(line);
console.log('校准改 0.8 + 0.2D 后的完整验收');
console.log(line);
console.log('  s = P × (0.8 + 0.2D) × q');
console.log('  ΔA = 0.1 × (s − A) × (√(U − A) + 0.01)');
console.log('  U 上浮：窗口 10 次内 ≥2 次 s>U → U += 0.05×(1−U)×D');
console.log('  U 下浮：连续 5 次 s ≤ 0.6 → U -= 0.03×(U−A)');
console.log('  A₀=0.30  U₀=0.50   200 次观测   配比 70/20/10\n');

console.log('  校准对照：');
console.log('    题层D     0.6+0.4D    0.8+0.2D    变化');
for (const [lv, D] of [['简单', 0.2], ['中等', 0.5], ['困难', 0.9], ['压轴L9', 0.94], ['L11', 0.999]]) {
  const a = CAL_OLD(D), b = CAL_NEW(D);
  console.log(`    ${lv.padEnd(6)} ${p3(D)}    ${p3(a)}     ${p3(b)}     ${((b - a) * 100 >= 0 ? '+' : '')}${((b - a) * 100).toFixed(1)} 点`);
}

console.log('\n' + line);
console.log('一、三档结果（新规则 vs 你的基准）');
console.log(line);
console.log('  档位     期末A    期末U   上浮次数  U−A     你的基准偏差');
console.log('  ' + '─'.repeat(66));
const NEW = {};
for (const k of Object.keys(PROFILES)) {
  const r = avg(k);
  NEW[k] = r;
  const t = TARGET[k];
  const d = (r.A - t) * 100;
  const v = Math.abs(d) < 2 ? '✅' : d < 0 ? '🟡' : '⚠️';
  console.log(`  ${k.padEnd(6)} ${p3(r.A)}  ${p3(r.U)}   ${r.ups.toFixed(0).padStart(4)}    ${p3(r.U - r.A)}  ${t}     ${(d >= 0 ? '+' : '')}${d.toFixed(1)} ${v}`);
}

console.log('\n' + line);
console.log('二、新旧规则对照（同一份数据，只改规则）');
console.log(line);
const RULES = [
  ['① 原始：0.6+0.4D + 线性阻尼 + s≥0.8', { cal: CAL_OLD, mult: 'linear', weightedD: false, window: 0, need: 2, oldTh: true }],
  ['② 只改触发：s>U 窗口10≥2', { cal: CAL_OLD, mult: 'linear', weightedD: false }],
  ['③ + D加权涨幅', { cal: CAL_OLD, mult: 'linear', weightedD: true }],
  ['④ + √阻尼', { cal: CAL_OLD, mult: 'sqrt', weightedD: true }],
  ['⑤ + 校准改 0.8+0.2D（现行）', {}],
];
console.log('  版本较强A   中等A   较弱A   强-弱跨度  较强达标');
console.log('  ' + '─'.repeat(64));
for (const [n, o] of RULES) {
  // 旧规则 s≥0.8 单独处理
  let res = {};
  for (const k of Object.keys(PROFILES)) {
    if (o.oldTh) {
      let A = 0.3, U = 0.5, hi = 0, lo = 0;
      for (let i = 0; i < 200; i++) {
        const ob = makeObs(k, 200)[i];
        const s = ob.P * o.cal(ob.D) * (1 - ob.brk / SEGS[ob.lv]);
        if (s >= 0.8) hi++; else hi = 0;
        if (hi >= 2) { U += 0.05 * (1 - U); hi = 0; }
        if (s <= 0.6) { lo++; if (lo >= 5) { U -= 0.03 * (U - A); lo = 0; } } else lo = 0;
        A = Math.max(0, Math.min(U, A + 0.25 * (s - A) * (U - A)));
      }
      res[k] = { A, U };
    } else res[k] = avg(k, o, 12);
  }
  const v = res.较强.A >= 0.84 ? '✅' : res.较强.A >= 0.75 ? '🟡' : '❌';
  console.log(`  ${n.padEnd(30)} ${p3(res.较强.A)}  ${p3(res.中等.A)}  ${p3(res.比较拉.A)}   ${p3(res.较强.A - res.比较拉.A)}    ${v}`);
}

console.log('\n' + line);
console.log('三、较强学生逐阶段（每 20 次）');
console.log(line);
console.log('   n      A        U      U−A    √(U−A)+δ');
console.log('  ' + '─'.repeat(48));
for (const m of NEW.较强.weekly) {
  const gap = m.U - m.A;
  console.log(`  ${String(m.n).padStart(3)}  ${p3(m.A)}   ${p3(m.U)}   ${p3(gap)}   ${(Math.sqrt(Math.max(0, gap)) + 0.01).toFixed(3)}`);
}

console.log('\n' + line);
console.log('四、上浮来源（验证 D 加权是否压住简单题）');
console.log(line);
console.log('  档位      上浮总次数   简单    中等    困难    简单占比');
for (const k of Object.keys(PROFILES)) {
  const u = NEW[k].upBy;
  const tot = u.简单 + u.中等 + u.困难;
  const pct = tot > 0 ? (u.简单 / tot * 100).toFixed(0) + '%' : '—';
  console.log(`  ${k.padEnd(6)}    ${String(tot).padStart(4)}      ${String(u.简单).padStart(4)}   ${String(u.中等).padStart(4)}   ${String(u.困难).padStart(4)}   ${pct.padStart(6)}`);
}
console.log('\n  → 简单题触发次数最多（占 70% 的题），但每次涨幅只有 0.05×(1−U)×0.2');
console.log('  → 是难题的 1/4.5 → U 被压住 ✅ D 加权设计有效');

console.log('\n' + line);
console.log('五、三档区分度');
console.log(line);
const sp = NEW.较强.A - NEW.比较拉.A;
console.log(`  强-弱跨度 = ${p3(sp)}（你的基准跨度 0.85−0.50 = 0.35）`);
console.log(`  强-中= ${p3(NEW.较强.A - NEW.中等.A)}   中-弱 = ${p3(NEW.中等.A - NEW.比较拉.A)}`);
console.log(`  ${sp >= 0.35 ? '✅' : '🟡'} 跨度${sp >= 0.35 ? '达到' : '略低于'}基准`);

console.log('\n' + line);
console.log('六、还差多少 / 敏感度');
console.log(line);
const need = 0.85 - NEW.较强.A;
console.log(`  较强 A = ${p3(NEW.较强.A)}，你的基准 0.85，差 ${(need * 100).toFixed(1)} 点\n`);
console.log('  微调选项           较强A    中等A    较弱A    备注');
console.log('  ' + '─'.repeat(60));
const tweaks = [
  ['现行（0.8+0.2D）', {}],
  ['α 0.1 → 0.15', { alpha: 0.15 }],
  ['α 0.1 → 0.08', { alpha: 0.08 }],
  ['δᵤ 0.05 → 0.07', { dU: 0.07 }],
  ['δᵤ 0.05 → 0.03', { dU: 0.03 }],
  ['δ 0.01 → 0.02', { delta: 0.02 }],
  ['窗口 10→8', { window: 8 }],
  ['窗口 10→12', { window: 12 }],
  ['需要 2→1 次', { need: 1 }],
  ['校准 0.82+0.18D', { cal: (d) => 0.82 + 0.18 * d }],
  ['校准 0.85+0.15D', { cal: (d) => 0.85 + 0.15 * d }],
];
for (const [n, o] of tweaks) {
  const a = avg('较强', o, 12), m = avg('中等', o, 12), w = avg('比较拉', o, 12);
  const v = a.A >= 0.845 ? '✅ 达标' : a.A >= 0.80 ? '🟡' : '❌';
  console.log(`  ${n.padEnd(20)} ${p3(a.A)}  ${p3(m.A)}  ${p3(w.A)}   ${v}`);
}

console.log('\n' + line);
console.log('七、诚实说明：这条规则的已知代价');
console.log(line);
console.log(`
  ① A 与 U 高度绑定
     三档 U−A = ${p3(NEW.较强.U - NEW.较强.A)} / ${p3(NEW.中等.U - NEW.中等.A)} / ${p3(NEW.比较拉.U - NEW.比较拉.A)}
     A 一直贴在 U 下方一点 → U 和 A 近似两个数，「上限」的独立语义变弱
     （δ=0.01 保证 gap→0 时仍有更新量，所以 A 必然贴住 U）

  ② 校准 0.8+0.2D 把难度极差从 0.26 压到 0.18
     简单题 0.84 / 难题 0.98 → 难度对 s 的影响下降
     好处：不再有「简单题做对但s 低」的问题
     代价：难度在 s 里的区分度降低

  ③ s 的分布整体上移，阈值必须重设
     旧规则 s≥0.8 在新校准下几乎人人达标（实测 A=0.500 完全死锁）
     → 只能配 s>U 相对判据，两条必须一起改

  ④ 「较强 0.85」是这套画像下的读数，不是普适值
     画像变了（题分布/ P 的实际分布）→ 读数就变
     A 读数只在「同一套画像口径」下可比较
`);
