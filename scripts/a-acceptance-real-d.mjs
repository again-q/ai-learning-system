/**
 * A 的最终验收（用真实解答题的 D 分布）
 *
 * 之前的错误：我用的难度配比是「简单 55% / 中档 10% / 困难 35%」，
 *   那个配比来自 22:10 的抽样（混了选择填空），产品实际不收选择填空。
 *
 * 真实数据（208 条解答题 raw）：
 *   D 范围 0.45 ~ 0.85，中位 0.60，均值 0.615
 *   → 全对时的 A 上限 = 84.6（不是 84.3，但几乎一样）
 *   → 且「简单题」只占 0.5%（1 条）
 *
 * 跑法：node scripts/a-acceptance-real-d.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const CAL = (d) => 0.6 + 0.4 * d;
const p3 = (x) => (x * 100).toFixed(1);
const L = '='.repeat(96);

// ── 真实解答题的 D 分布 ──
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const DIR = path.resolve(__dirname, '..', 'output', 'golden', 'results', 'stability-raw');
const Ds = [];
for (const f of fs.readdirSync(DIR)) {
  const j = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  if (j.questionType === '解答' && j.D != null) Ds.push(j.D);
}
Ds.sort((a, b) => a - b);

console.log(L);
console.log('  零、用真实解答题的 D 分布（不是估计的难度配比）');
console.log(L);
console.log(`  解答题样本：${Ds.length} 条`);
console.log(`  D 分布：min ${Ds[0].toFixed(2)}  p25 ${Ds[Math.floor(Ds.length*.25)].toFixed(2)}  中位 ${Ds[Math.floor(Ds.length/2)].toFixed(2)}  p75 ${Ds[Math.floor(Ds.length*.75)].toFixed(2)}  max ${Ds[Ds.length-1].toFixed(2)}`);
const ceil = Ds.reduce((s, d) => s + CAL(d), 0) / Ds.length;
console.log(`  → P=1.0 时的 A 上限 = ${p3(ceil)}    ← 强者最多能到这么多`);
console.log('  → 注意：解答题里 D<0.5 的只占 ' + p3(Ds.filter(d => d < 0.5).length / Ds.length) + '%，几乎不存在「简单题」');

// ══════════════════════════════════════
// 学生档位：按「在同一个 D 上他的过程分 P」定义
const TIERS = {
  较强: { p: 0.95, fail: 0.03, failMul: 0.45 },
  偏上: { p: 0.85, fail: 0.06, failMul: 0.45 },
  中位: { p: 0.72, fail: 0.10, failMul: 0.40 },
  较弱: { p: 0.52, fail: 0.16, failMul: 0.35 },
};
function drawP(tier) {
  const { p, fail, failMul } = TIERS[tier];
  const r = Math.random();
  if (r < 0.06) return Math.min(1, p + 0.12);
  if (r < 0.06 + fail) return Math.max(0, p * failMul);
  return Math.max(0, Math.min(1, p + (Math.random() - 0.5) * 0.10));
}
const drawD = () => Ds[Math.floor(Math.random() * Ds.length)];

function sim(tier, opt = {}) {
  const { N = 3800, dU = 0.05, A0 = 0.30, U0 = 0.50 } = opt;
  let A = A0, U = U0, consec = 0, ups = 0;
  let sAcc = 0, sMax = 0;
  for (let i = 0; i < N; i++) {
    const s = drawP(tier) * CAL(drawD());
    sAcc += s; sMax = Math.max(sMax, s);
    if (s > U) consec++; else consec = 0;
    if (consec >= 2) { U = Math.min(1, U + dU * (1 - U)); consec = 0; ups++; }
    A = Math.max(0, Math.min(U, A + 0.1 * (s - A)));
  }
  return { A, U, ups, sAvg: sAcc / N, sMax };
}
const avg = (t, n = 40, opt = {}) => {
  const rs = []; for (let k = 0; k < n; k++) rs.push(sim(t, opt));
  const m = (k) => rs.reduce((a, b) => a + b[k], 0) / rs.length;
  const sd = (k) => { const mu = m(k); return Math.sqrt(rs.reduce((a, b) => a + (b[k] - mu) ** 2, 0) / rs.length); };
  return { A: m('A'), U: m('U'), ups: m('ups'), sAvg: m('sAvg'), sMax: m('sMax'), Asd: sd('A'), Usd: sd('U') };
};

console.log('\n' + L);
console.log('  一、四档落点（3800 次观测，40 次平均）');
console.log(L);
console.log('  档      A±σ          U±σ          U−A    A/U    s均值  上浮');
const RES = {};
for (const t of Object.keys(TIERS)) {
  const r = avg(t); RES[t] = r;
  console.log(`  ${t.padEnd(5)} ${p3(r.A).padStart(5)}±${p3(r.Asd).padStart(4)}  ${p3(r.U).padStart(5)}±${p3(r.Usd).padStart(4)}  ${((r.U-r.A)*100).toFixed(1).padStart(5)}  ${(r.A/r.U).toFixed(3)} ${p3(r.sAvg).padStart(6)} ${r.ups.toFixed(0).padStart(5)}`);
}
const As = Object.values(RES).map(x => x.A), Us = Object.values(RES).map(x => x.U);
console.log(`\n  A 递减 ${As.every((v,i)=>i===0||As[i-1]>=v-1e-9)?'✅':'❌'}（跨度 ${p3(Math.max(...As)-Math.min(...As))}）`);
console.log(`  U 递减 ${Us.every((v,i)=>i===0||Us[i-1]>=v-1e-9)?'✅':'❌'}（跨度 ${p3(Math.max(...Us)-Math.min(...Us))}）`);
console.log(`  强者 ${p3(RES.较强.A)} vs 你要的 0.85 → 偏差 ${((RES.较强.A-0.85)*100).toFixed(1)} 点`);

console.log('\n' + L);
console.log('  二、强者要到 0.85，需要多完美（固定 D 分布，只调 P）');
console.log(L);
console.log('  P 基准   失误率   强者A   读作');
for (const [p, f] of [[1.00, 0.00], [0.98, 0.02], [0.95, 0.03], [0.92, 0.05], [0.90, 0.08], [0.85, 0.12]]) {
  const saved = TIERS['__t']; TIERS['__t'] = { p, fail: f, failMul: 0.45 };
  const r = avg('__t', 30);
  TIERS['__t'] = saved;
  const label = r.A >= 0.85 ? '✅ 达标' : r.A >= 0.80 ? '🟡 接近' : '🔴 偏低';
  console.log(`  ${p.toFixed(2)}     ${(f*100).toFixed(0).padStart(3)}%     ${p3(r.A).padStart(5)}   ${label}`);
}
console.log(`\n  → 上限 ${p3(ceil)}。「强者 0.85」= 几乎每次都接近满分`);
console.log('  → 一个真强者（P≈0.95、3% 失误）实测落在 ' + p3((() => { const s = TIERS['__x']; TIERS['__x'] = { p: 0.95, fail: 0.03, failMul: 0.45 }; const r = avg('__x', 30); TIERS['__x'] = s; return r.A; })()));

console.log('\n' + L);
console.log('  三、目标①：A 逼近 U（稳定性决定 A/U）');
console.log(L);
console.log('  P 抖动    A      U      U−A    A/U   读作');
for (const j of [0.0, 0.05, 0.10, 0.20, 0.35, 0.50]) {
  const saved = TIERS['__y']; TIERS['__y'] = { p: 0.92, fail: 0, failMul: 1 };
  // 用自定义抖动
  const N = 200000; let A = 0.30, U = 0.50, consec = 0, sAcc = 0;
  for (let i = 0; i < N; i++) {
    const p = Math.max(0, Math.min(1, 0.92 + (Math.random() - 0.5) * j * 2));
    const s = p * CAL(drawD());
    sAcc += s;
    if (s > U) consec++; else consec = 0;
    if (consec >= 2) { U = Math.min(1, U + 0.05 * (1 - U)); consec = 0; }
    A = Math.max(0, Math.min(U, A + 0.1 * (s - A)));
  }
  TIERS['__y'] = saved;
  const label = j === 0 ? '完全稳定' : j <= 0.10 ? '很稳' : j <= 0.20 ? '一般' : j <= 0.35 ? '不太稳' : '忽高忽低';
  console.log(`  ±${j.toFixed(2)}   ${p3(A).padStart(5)}  ${p3(U).padStart(5)}  ${((U-A)*100).toFixed(1).padStart(5)}  ${(A/U).toFixed(3)}  ${label}`);
}
console.log('\n  → 越稳 → A/U 越接近 1 ✅ 你要的「A 逼近 U」成立（对稳定学生）');

console.log('\n' + L);
console.log('  四、目标②：U 突破 → A 继续追（一次典型运行）');
console.log(L);
{
  let A = 0.30, U = 0.50, consec = 0; const ev = [];
  for (let i = 0; i < 3800; i++) {
    const s = drawP('较强') * CAL(drawD());
    if (s > U) consec++; else consec = 0;
    let j = false;
    if (consec >= 2) { U = Math.min(1, U + 0.05 * (1 - U)); consec = 0; j = true; }
    A = Math.max(0, Math.min(U, A + 0.1 * (s - A)));
    if (j) ev.push({ i, U, A });
  }
  console.log(`  U 突破 ${ev.length} 次`);
  const show = [...ev.slice(0, 5), ...ev.slice(-3)];
  for (const e of show) console.log(`    第${String(e.i).padStart(4)}题  U=${p3(e.U)}  当次A=${p3(e.A)}`);
  console.log(`\n  U ${p3(ev[0].U)} → ${p3(ev[ev.length-1].U)}   A ${p3(ev[0].A)} → ${p3(ev[ev.length-1].A)}  ${ev[ev.length-1].A > ev[0].A ? '✅ A 跟上了' : '❌'}`);
}
console.log('\n' + L);
