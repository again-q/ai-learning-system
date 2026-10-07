/**
 * 修正 D 的取值范围 —— 加入高考压轴/竞赛题
 *
 * 用户澄清：
 *   竞赛题 最难 D ≈ 0.98
 *   课内最难（高考压轴）D ≈ 0.92~0.94
 *
 * 我之前的错：样本里 208 条解答题的 D 最高只有 0.85，
 *   于是算出「A 上限 84.6」—— 那是样本没覆盖压轴题造成的假象。
 *
 * 校准 0.6+0.4D 的真实天花板：
 *   D=0.85 → 0.940     D=0.92 → 0.968
 *   D=0.94 → 0.976     D=0.98 → 0.992
 *
 * 跑法：node scripts/a-d-range-fix.mjs
 */

const p3 = (x) => (x * 100).toFixed(1);
const L = '='.repeat(96);
const CAL = (d) => 0.6 + 0.4 * d;

console.log(L);
console.log('  一、校准 0.6+0.4D 在各档难度上的「满分值」');
console.log(L);
console.log('  难度档             D       校准(=满分答案拿到的 s)');
const LVNAME = [
  ['课本例题级', 0.10], ['课后练习', 0.25], ['常规中档', 0.50],
  ['中档偏难', 0.62], ['高考常规', 0.72], ['高考较难', 0.82],
  ['高考压轴', 0.93], ['强基/竞赛入门', 0.98],
];
for (const [n, d] of LVNAME) {
  console.log(`  ${n.padEnd(16)} ${d.toFixed(2)}    ${CAL(d).toFixed(3)}`);
}
console.log('\n  → 高考压轴做满分 = 0.968~0.976（几乎 1.0）');
console.log('  → 竞赛题做满分 = 0.992');
console.log('  → 所以 A 的物理上限接近 0.98，不是 0.85 ✅');

console.log('\n' + L);
console.log('  二、A 上限到底由什么决定：他做过的「最难题」');
console.log(L);
console.log('  一个满分学生，如果只做这一档的题，A 最高是：');
console.log('  档            D       A 上限');
for (const [n, d] of LVNAME) console.log(`  ${n.padEnd(12)} ${d.toFixed(2)}    ${p3(CAL(d))}`);

// ══════════════════════════════════════
// 三档学生的真实练习结构（高分段）
const MIXES = {
  '只刷中档（低分段）': [[0.50, 0.6], [0.62, 0.4]],
  '常规高考（中等）': [[0.50, 0.3], [0.62, 0.4], [0.72, 0.3]],
  '高考为主+压轴（高分段）': [[0.62, 0.25], [0.72, 0.35], [0.82, 0.25], [0.93, 0.15]],
  '冲刺压轴（尖子）': [[0.72, 0.2], [0.82, 0.3], [0.93, 0.4], [0.98, 0.1]],
};

console.log('\n' + L);
console.log('  三、A 上限 = 他题单里的加权平均校准值');
console.log(L);
console.log('  练习结构                        A 上限（满分学生）');
for (const [nm, mix] of Object.entries(MIXES)) {
  const c = mix.reduce((s, [d, w]) => s + CAL(d) * w, 0);
  console.log(`  ${nm.padEnd(30)} ${p3(c)}`);
}

// ══════════════════════════════════════
const TIERS = {
  较强: { p: 0.93, fail: 0.04, failMul: 0.45 },
  偏上: { p: 0.84, fail: 0.07, failMul: 0.45 },
  中位: { p: 0.72, fail: 0.10, failMul: 0.40 },
  较弱: { p: 0.55, fail: 0.16, failMul: 0.35 },
};
function drawP(tier) {
  const { p, fail, failMul } = TIERS[tier];
  const r = Math.random();
  if (r < 0.06) return Math.min(1, p + 0.12);
  if (r < 0.06 + fail) return Math.max(0, p * failMul);
  return Math.max(0, Math.min(1, p + (Math.random() - 0.5) * 0.10));
}
function drawD(mix) {
  const r = Math.random(); let a = 0;
  for (const [d, w] of mix) { a += w; if (r <= a) return d; }
  return mix[0][0];
}

function sim(tier, mix, opt = {}) {
  const { N = 4000, dU = 0.05 } = opt;
  let A = 0.30, U = 0.50, consec = 0, ups = 0, sAcc = 0, sMax = 0;
  for (let i = 0; i < N; i++) {
    const d = drawD(mix), s = drawP(tier) * CAL(d);
    sAcc += s; sMax = Math.max(sMax, s);
    if (s > U) consec++; else consec = 0;
    if (consec >= 2) { U = Math.min(1, U + dU * (1 - U)); consec = 0; ups++; }
    A = Math.max(0, Math.min(U, A + 0.1 * (s - A)));
  }
  return { A, U, ups, sAvg: sAcc / N, sMax };
}
const avg = (t, mix, n = 30) => {
  const rs = []; for (let k = 0; k < n; k++) rs.push(sim(t, mix));
  const m = (k) => rs.reduce((a, b) => a + b[k], 0) / rs.length;
  const sd = (k) => { const mu = m(k); return Math.sqrt(rs.reduce((a, b) => a + (b[k] - mu) ** 2, 0) / rs.length); };
  return { A: m('A'), U: m('U'), ups: m('ups'), sAvg: m('sAvg'), sMax: m('sMax'), Asd: sd('A') };
};

console.log('\n' + L);
console.log('  四、用「高分段学生的练习结构」（含压轴）重跑四档');
console.log(L);
const MIX = MIXES['高考为主+压轴（高分段）'];
console.log(`  练习结构：${MIX.map(([d, w]) => `D=${d}×${(w*100)}%`).join('  ')}`);
console.log(`  满分学生上限 = ${p3(MIX.reduce((s,[d,w])=>s+CAL(d)*w,0))}\n`);
console.log('  档      A±σ          U±σ          U−A    A/U    s均值   平均D  你的目标');
const TGT = { 较强: 0.85, 偏上: 0.70, 中位: 0.55, 较弱: 0.35 };
const RES = {};
for (const t of Object.keys(TIERS)) {
  const r = avg(t, MIX); RES[t] = r;
  const d = (r.A - TGT[t]) * 100;
  console.log(`  ${t.padEnd(5)} ${p3(r.A).padStart(5)}±${p3(r.Asd).padStart(4)}  ${p3(r.U).padStart(5)}  ${((r.U-r.A)*100).toFixed(1).padStart(5)}  ${(r.A/r.U).toFixed(3)} ${p3(r.sAvg).padStart(6)}  ${String(TGT[t]*100).padStart(5)}   ${d>=0?'+':''}${d.toFixed(1)}`);
}
const As = Object.values(RES).map(x => x.A);
console.log(`\n  A 递减 ${As.every((v,i)=>i===0||As[i-1]>=v-1e-9)?'✅':'❌'}   跨度 ${p3(Math.max(...As)-Math.min(...As))}`);

console.log('\n' + L);
console.log('  五、强者要在不同练习结构下落到哪');
console.log(L);
console.log('  练习结构                        较强A   偏上A   上限');
for (const [nm, mix] of Object.entries(MIXES)) {
  const r = { 较强: avg('较强', mix, 20), 偏上: avg('偏上', mix, 20) };
  console.log(`  ${nm.padEnd(30)} ${p3(r.较强.A).padStart(5)}  ${p3(r.偏上.A).padStart(6)}  ${p3(mix.reduce((s,[d,w])=>s+CAL(d)*w,0)).padStart(5)}`);
}

console.log('\n' + L);
console.log('  六、结论');
console.log(L);
console.log(`  · 校准 0.6+0.4D 本身没问题 —— 它在 D=0.93 时给 0.968、D=0.98 时给 0.992`);
console.log(`  · 「A 上限 84.6」是我样本的错（最高 D 只有 0.85，没有压轴题）`);
console.log(`  · 只要题单里有压轴题，A 上限自然升到 ${p3(MIX.reduce((s,[d,w])=>s+CAL(d)*w,0))}~98`);
console.log(`  · 强者落点取决于他的练习结构：只刷中档 → 75 左右；含压轴 → 85 左右`);
console.log(L);
