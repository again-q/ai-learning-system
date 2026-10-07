/**
 * 为什么 A 到不了 1.0 —— 三种修法的实测
 *
 * 根因：s = P × (0.6 + 0.4D) 是个「绝对折扣」
 *   一个满分答案（P=1.0）在 D=0.85 的题上只能拿到 s = 0.94
 *   而真实解答题的 D 最高只到 0.85 → A 天花板 = 0.94，够不到 1.0
 *
 * 跑法：node scripts/a-ceiling-fix.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const p3 = (x) => (x * 100).toFixed(1);
const L = '='.repeat(96);
const __dirname = path.dirname(new URL(import.meta.url).pathname);

// ── 真实解答题 D 分布 ──
const DIR = path.resolve(__dirname, '..', 'output', 'golden', 'results', 'stability-raw');
const Ds = [];
for (const f of fs.readdirSync(DIR)) {
  const j = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  if (j.questionType === '解答' && j.D != null) Ds.push(j.D);
}
Ds.sort((a, b) => a - b);
const DMAX = Ds[Ds.length - 1];
const DMEAN = Ds.reduce((a, b) => a + b, 0) / Ds.length;
const Dmedian = Ds[Math.floor(Ds.length / 2)];

console.log(L);
console.log('  零、真实解答题的 D（208 条）');
console.log(L);
console.log(`  D 范围 ${Ds[0].toFixed(2)} ~ ${DMAX.toFixed(2)}   均值 ${DMEAN.toFixed(3)}   中位 ${Dmedian.toFixed(2)}`);

// ── 三种校准 ──
const CAL0 = (d) => 0.6 + 0.4 * d;                                   // 现行（绝对折扣）
const NORM = 1 / CAL0(DMAX);
const CAL1 = (d) => Math.min(1, CAL0(d) * NORM);                     // 修法1：归一化
const W_BY_D = (d) => d < 0.5 ? 0.1 : d <= 0.65 ? 0.2 : 0.7;         // 修法2：按层给权重（跟 K 同构）

console.log('\n' + L);
console.log('  一、三种口径下「满分学生」能到多少');
console.log(L);
console.log('  修法                        D=0.45    D=0.615   D=0.85    满分学生A上限');
console.log(`  ① 现行 0.6+0.4D（绝对折扣）  ${CAL0(0.45).toFixed(3)}     ${CAL0(0.615).toFixed(3)}     ${CAL0(DMAX).toFixed(3)}     ${p3(Ds.reduce((s,d)=>s+CAL0(d),0)/Ds.length)}`);
console.log(`  ② 归一化（÷${CAL0(DMAX).toFixed(3)}）        ${CAL1(0.45).toFixed(3)}     ${CAL1(0.615).toFixed(3)}     ${CAL1(DMAX).toFixed(3)}     ${p3(Ds.reduce((s,d)=>s+CAL1(d),0)/Ds.length)}`);
console.log(`  ③ 加权平均P（s=P，难度进权重） 1.000     1.000     1.000     ${p3(1.0)}`);

// ── 学生档位 ──
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

/** mode: 'cal0' | 'cal1' | 'weighted' */
function sim(tier, mode, opt = {}) {
  const { N = 3800, dU = 0.05 } = opt;
  let A = 0.30, U = 0.50, consec = 0, ups = 0;
  let sAcc = 0;
  let wSum = 0, wpSum = 0;
  for (let i = 0; i < N; i++) {
    const d = drawD(), P = drawP(tier);
    let s, w = 1;
    if (mode === 'cal0') s = P * CAL0(d);
    else if (mode === 'cal1') s = P * CAL1(d);
    else { s = P; w = W_BY_D(d); }
    sAcc += s;
    // U 的突破判据统一用 cal1 口径（难度可比）
    const sU = P * CAL1(d);
    if (sU > U) consec++; else consec = 0;
    if (consec >= 2) { U = Math.min(1, U + dU * (1 - U)); consec = 0; ups++; }
    // A 的更新
    if (mode === 'weighted') { wSum += w; wpSum += w * P; A = Math.max(0, Math.min(U, wpSum / wSum)); }
    else A = Math.max(0, Math.min(U, A + 0.1 * (s - A)));
  }
  return { A, U, ups, sAvg: sAcc / N };
}
const avg = (t, mode, n = 30, opt = {}) => {
  const rs = []; for (let k = 0; k < n; k++) rs.push(sim(t, mode, opt));
  const m = (k) => rs.reduce((a, b) => a + b[k], 0) / rs.length;
  const sd = (k) => { const mu = m(k); return Math.sqrt(rs.reduce((a, b) => a + (b[k] - mu) ** 2, 0) / rs.length); };
  return { A: m('A'), U: m('U'), ups: m('ups'), Asd: sd('A') };
};

console.log('\n' + L);
console.log('  二、四档落点（三种口径对比）');
console.log(L);
for (const [nm, mode] of [['① 现行 0.6+0.4D', 'cal0'], ['② 归一化折扣', 'cal1'], ['③ 加权平均P', 'weighted']]) {
  console.log(`\n  ▸ ${nm}`);
  console.log('    档       A      U      你的目标   偏差');
  const TGT = { 较强: 0.85, 偏上: 0.70, 中位: 0.55, 较弱: 0.35 };
  const res = {};
  for (const t of Object.keys(TIERS)) {
    const r = avg(t, mode); res[t] = r;
    const d = (r.A - TGT[t]) * 100;
    console.log(`    ${t.padEnd(5)} ${p3(r.A).padStart(6)} ${p3(r.U).padStart(6)}   ${String(TGT[t]*100).padStart(5)}    ${d >= 0 ? '+' : ''}${d.toFixed(1).padStart(5)}`);
  }
  const As = Object.values(res).map(x => x.A);
  console.log(`    → A 跨度 ${p3(Math.max(...As)-Math.min(...As))}  递减 ${As.every((v,i)=>i===0||As[i-1]>=v-1e-9)?'✅':'❌'}`);
}

console.log('\n' + L);
console.log('  三、三种口径的性质对照');
console.log(L);
console.log('  性质                              ① 绝对折扣   ② 归一化   ③ 加权平均P');
console.log(`  满分学生 A 上限                   ${p3(Ds.reduce((s,d)=>s+CAL0(d),0)/Ds.length).padStart(8)}   ${p3(Ds.reduce((s,d)=>s+CAL1(d),0)/Ds.length).padStart(8)}   ${'100.0'.padStart(9)}`);
console.log(`  最简单题(D=0.45)做满分值多少       ${p3(CAL0(0.45)).padStart(8)}   ${p3(CAL1(0.45)).padStart(8)}   ${'100.0'.padStart(9)}`);
console.log(`  最难题(D=0.85)做满分值多少         ${p3(CAL0(DMAX)).padStart(8)}   ${p3(CAL1(DMAX)).padStart(8)}   ${'100.0'.padStart(9)}`);
console.log('  难度是否影响 A                    ✅ 打折扣    ✅ 打折扣   ✅ 影响权重');
console.log('  A 能否被「刷简单题」顶高          ⚠️ 能        ⚠️ 能       ⚠️ 能');
console.log('  A 的读法                          被压缩      卷面分      掌握度');
console.log(L);
