/**
 * 要达到 A=0.857 需要什么调整 —— 系统搜索
 * 跑法：node scripts/a-reach-0857.mjs
 *
 * 数学前提：A 是 EWMA，不动点 = s 的加权平均
 *   → 想让 A 到 0.857，必须让 s 的加权平均 ≥ 0.857
 *   → 必须抬高简单题的 s（它占 70%）
 */

const SEGS = { 简单: 3, 中等: 5, 困难: 7 };
const p0 = (x) => (x * 100).toFixed(1);
const p3 = (x) => x.toFixed(3);
const line = '='.repeat(92);

// 较强学生画像（沿用那份报告的 P / q）
const PROF = {
  较强: { 简单: { P: 0.98, q: 0.98, D: 0.2, brk: 0 }, 中等: { P: 0.95, q: 0.95, D: 0.5, brk: 0 }, 困难: { P: 0.86, q: 0.89, D: 0.9, brk: 1 } },
  中等: { 简单: { P: 0.90, q: 0.95, D: 0.2, brk: 0 }, 中等: { P: 0.69, q: 0.88, D: 0.5, brk: 1 }, 困难: { P: 0.32, q: 0.76, D: 0.9, brk: 2 } },
  比较拉: { 简单: { P: 0.73, q: 0.89, D: 0.2, brk: 1 }, 中等: { P: 0.44, q: 0.82, D: 0.5, brk: 1 }, 困难: { P: 0.16, q: 0.75, D: 0.9, brk: 2 } },
};

function makeObs(kind, n, mix) {
  const p = PROF[kind]; const bag = [];
  const nEasy = Math.round(n * mix.easy), nMid = Math.round(n * mix.mid);
  const nHard = n - nEasy - nMid;
  for (let i = 0; i < nEasy; i++) bag.push({ lv: '简单', ...p.简单 });
  for (let i = 0; i < nMid; i++) bag.push({ lv: '中等', ...p.中等 });
  for (let i = 0; i < nHard; i++) bag.push({ lv: '困难', ...p.困难 });
  for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
  return bag;
}

const MIX = { easy: 0.70, mid: 0.20, hard: 0.10 };

function sim(kind, opt = {}) {
  const {
    cal = (d) => 0.6 + 0.4 * d, alpha = 0.25, U0 = 0.50, A0 = 0.30,
    base = 0.05, window = 10, need = 2, n = 200, qMode = 'seg', mix = MIX,
    trig = 's>U', mult = 'linear', delta = 0.01, floorSimple = 1,
  } = opt;
  let A = A0, U = U0; const hist = []; let ups = 0;
  for (let i = 0; i < n; i++) {
    const o = makeObs(kind, n, mix)[i];
    // q：seg = 1−断段/总段；flat = 恒1（不惩罚写得长）
    const q = qMode === 'flat' ? 1 : 1 - o.brk / SEGS[o.lv];
    const s = o.P * cal(o.D) * q;
    if (trig === 's>U') {
      hist.push({ ok: s > U, D: o.D });
      if (hist.length > window) hist.shift();
      if (hist.filter(x => x.ok).length >= need) {
        const t = [...hist].reverse().find(x => x.ok);
        U += base * (1 - U) * t.D; ups++; hist.fill({ ok: false, D: 0 });
      }
    }
    const gap = Math.max(0, U - A);
    const m = mult === 'sqrt' ? Math.sqrt(gap) + delta : gap;
    A = Math.max(0, Math.min(U, A + alpha * (s - A) * m));
  }
  return { A, U, ups };
}

const avg = (kind, opt, n = 10) => { const rs = []; for (let t = 0; t < n; t++) rs.push(sim(kind, opt)); const m = f => rs.reduce((s, r) => s + f(r), 0) / rs.length; return { A: m(r => r.A), U: m(r => r.U) }; };

console.log(line);
console.log('起点：照那份报告的字面规则跑');
console.log(line);
const start = avg('较强', { trig: 's>U', mult: 'sqrt' });
console.log(`  较强 A = ${p3(start.A)}   U = ${p3(start.U)}    目标 0.857   差 ${((0.857 - start.A) * 100).toFixed(1)} 点`);

console.log('\n' + line);
console.log('第一层：先算出 s 的加权平均（A 的理论上限）');
console.log(line);
function sAvg(cal, kind, mix, qMode) {
  const p = PROF[kind];
  const f = (o, lv) => {
    const q = qMode === 'flat' ? 1 : 1 - o.brk / SEGS[lv];
    return o.P * cal(o.D) * q;
  };
  return mix.easy * f(p.简单, '简单') + mix.mid * f(p.中等, '中等') + mix.hard * f(p.困难, '困难');
}
const calNow = (d) => 0.6 + 0.4 * d;
console.log(`  校准 0.6+0.4D（现状）：`);
for (const k of ['较强', '中等', '比较拉']) {
  console.log(`    ${k.padEnd(5)} s 加权平均 = ${p3(sAvg(calNow, k, MIX, 'seg'))}`);
}
console.log(`\n  → 较强只有 ${p3(sAvg(calNow, '较强', MIX, 'seg'))}，而 A 要 0.857 —— 差 ${((0.857 - sAvg(calNow, '较强', MIX, 'seg')) * 100).toFixed(1)} 点`);
console.log(`  → 而 A 的不动点就是这个值，无论 U 涨多高都过不去`);

console.log('\n' + line);
console.log('第二层：校准公式搜索 —— 要不动点到 0.857，底线是多少');
console.log(line);
console.log('  校准形式：cal(D) = b + k×D，且 b + k ≤ 1（不能超 1）');
console.log('  简单题 D=0.2 → cal = b + 0.2k');
console.log('  要求：较强 s 加权平均 ≥ 0.857\n');
console.log('  b      k      简单校准  中等校准  困难校准  较强不动点  中等  较弱  跨度');
console.log('  ' + '─'.repeat(74));
const cands = [];
for (const b of [0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90]) {
  for (const k of [0.40, 0.30, 0.20, 0.15, 0.10, 0.05]) {
    if (b + k > 1.001) continue;
    const cal = (d) => b + k * d;
    const sS = sAvg(cal, '较强', MIX, 'seg');
    const sM = sAvg(cal, '中等', MIX, 'seg');
    const sW = sAvg(cal, '比较拉', MIX, 'seg');
    cands.push({ b, k, cal, sS, sM, sW });
    const hit = sS >= 0.857 ? '✅' : sS >= 0.80 ? '🟡' : '';
    if (b <= 0.90 && k <= 0.30) console.log(`  ${p3(b)}  ${p3(k)}   ${p3(cal(0.2))}     ${p3(cal(0.5))}     ${p3(cal(0.9))}     ${p3(sS)}     ${p3(sM)}  ${p3(sW)}  ${p3(sS - sW)}  ${hit}`);
  }
}

console.log('\n' + line);
console.log('第三层：四条候选方案实测（200 次观测，三档）');
console.log(line);
const schemes = [
  ['① 现状 0.6+0.4D', { cal: (d) => 0.6 + 0.4 * d }],
  ['② 0.8+0.2D（上轮建议）', { cal: (d) => 0.8 + 0.2 * d }],
  ['③ 0.85+0.15D', { cal: (d) => 0.85 + 0.15 * d }],
  ['④ 0.9+0.1D', { cal: (d) => 0.9 + 0.1 * d }],
  ['⑤ 校准1.0（不区分难度）', { cal: () => 1.0 }],
  ['⑥ 剔除简单题（只算中+难）', { mix: { easy: 0, mid: 0.667, hard: 0.333 } }],
  ['⑦ q 恒为1（不惩罚写得长）', { qMode: 'flat' }],
  ['⑧ 0.85+0.15D + q恒1', { cal: (d) => 0.85 + 0.15 * d, qMode: 'flat' }],
  ['⑨ 0.85+0.15D + 剔除简单题', { cal: (d) => 0.85 + 0.15 * d, mix: { easy: 0, mid: 0.667, hard: 0.333 } }],
];
console.log('  方案                       较强A   中等A   较弱A   强-弱跨度  强-中  中-弱较强达标');
console.log('  ' + '─'.repeat(78));
const results = [];
for (const [n, o] of schemes) {
  const a = avg('较强', o, 10), m = avg('中等', o, 10), w = avg('比较拉', o, 10);
  results.push({ n, a: a.A, m: m.A, w: w.A });
  const v = a.A >= 0.84 ? '✅' : a.A >= 0.75 ? '🟡' : '❌';
  console.log(`  ${n.padEnd(26)} ${p3(a.A)}   ${p3(m.A)}   ${p3(w.A)}    ${p3(a.A - w.A)}   ${p3(a.A - m.A)}  ${p3(m.A - w.A)}  ${v}`);
}

console.log('\n' + line);
console.log('第四层：最优组合细调（目标：较强 ≥0.85 且三档不塌）');
console.log(line);
console.log('  在 0.85+0.15D 基础上，叠加 √阻尼 / 剔除简单题 / q恒1：');
console.log('  ' + '─'.repeat(72));
const combos = [
  ['0.85+0.15D 线性阻尼', { cal: (d) => 0.85 + 0.15 * d }],
  ['0.85+0.15D + √阻尼', { cal: (d) => 0.85 + 0.15 * d, mult: 'sqrt' }],
  ['0.85+0.15D + q恒1', { cal: (d) => 0.85 + 0.15 * d, qMode: 'flat' }],
  ['0.85+0.15D + 剔简单 + √阻尼', { cal: (d) => 0.85 + 0.15 * d, mix: { easy: 0, mid: 0.667, hard: 0.333 }, mult: 'sqrt' }],
  ['0.85+0.15D + α0.15', { cal: (d) => 0.85 + 0.15 * d, alpha: 0.15 }],
  ['0.9+0.1D + √阻尼', { cal: (d) => 0.9 + 0.1 * d, mult: 'sqrt' }],
];
for (const [n, o] of combos) {
  const a = avg('较强', o, 10), m = avg('中等', o, 10), w = avg('比较拉', o, 10);
  const v = a.A >= 0.85 ? '✅ 达标' : a.A >= 0.80 ? '🟡 接近' : '❌';
  console.log(`  ${n.padEnd(28)} 较强 ${p3(a.A)}  中等 ${p3(m.A)}  较弱 ${p3(w.A)}  跨度 ${p3(a.A - w.A)}  ${v}`);
}

console.log('\n' + line);
console.log('第五层：校准改到 0.85 底座的代价 —— 简单题也满分，会怎样');
console.log(line);
const cal85 = (d) => 0.85 + 0.15 * d;
console.log('  校准 0.85+0.15D 时，各题层 s 上限（P=1, q=1）：');
for (const [lv, D] of [['简单', 0.2], ['中等', 0.5], ['困难', 0.9]]) {
  console.log(`    ${lv}  上限 = ${p3(cal85(D))}`);
}
console.log(`
  → 简单题满分 s = ${p3(cal85(0.2))}，仍 < 1.0
  → 「较强」的 s 都在 0.88~0.99 → 不动点自然高
  → 「比较拉」的 s 也在 0.68~0.86 → 不动点被一起抬高（实测 ${p3(sAvg(cal85, '比较拉', MIX, 'seg'))}）
  → **三档一起上移，区分度可能压缩**
`);

console.log('\n' + line);
console.log('第六层：最终建议方案');
console.log(line);
const best = combos[3];
const ba = avg('较强', best[1], 12), bm = avg('中等', best[1], 12), bw = avg('比较拉', best[1], 12);
console.log(`  推荐：${best[0]}`);
console.log(`  规则：`);
console.log(`    s   = P × (0.85 + 0.15D) × q`);
console.log(`    ΔA  = ${best[1].mult === 'sqrt' ? 'α × (s − A) × (√(U−A) + 0.01)' : 'α × (s − A) × (U − A)'}`);
console.log(`    U 上浮：窗口 ${best[1].window || 10} 次内 ≥${best[1].need || 2} 次 s>U → U += 0.05×(1−U)×D`);
console.log(`    A₀=0.30  U₀=0.50  α=0.25（或 0.1 若用√）`);
console.log(`    样本：只用中等以上题（简单题 0%）`);
console.log(`\n  实测：`);
console.log(`    较强 A = ${p3(ba.A)}  U = ${p3(ba.U)}`);
console.log(`    中等 A = ${p3(bm.A)}`);
console.log(`    较弱 A = ${p3(bw.A)}`);
console.log(`    强-弱跨度 = ${p3(ba.A - bw.A)}`);
console.log(`\n  你的基准 0.85 / 0.70 / 0.50 → 偏差 ${((ba.A - 0.85) * 100 >= 0 ? '+' : '')}${((ba.A - 0.85) * 100).toFixed(1)} / ${((bm.A - 0.70) * 100 >= 0 ? '+' : '')}${((bm.A - 0.70) * 100).toFixed(1)} / ${((bw.A - 0.50) * 100 >= 0 ? '+' : '')}${((bw.A - 0.50) * 100).toFixed(1)}`);
