/**
 * A 最终版（甲：难度当权重 w = D）—— 完整验收
 *
 * 依据：《D难度标尺-L11分层》§十 line 165「D 是五维更新的乘法因子（K=Σ(D×P)/ΣD 等）」
 * 跑法：node scripts/a-final-weight-d.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const p3 = (x) => (x * 100).toFixed(1);
const L = '='.repeat(96);
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const DIR = path.resolve(__dirname, '..', 'output', 'golden', 'results', 'stability-raw');

const seen = new Set(), rows = [];
for (const f of fs.readdirSync(DIR)) {
  const j = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  if (j.questionType !== '解答' || j.P == null || j.D == null) continue;
  const k = (j.questionText || '').slice(0, 60);
  if (seen.has(k)) continue; seen.add(k);
  rows.push(j);
}
const done = rows.filter(r => r.processAvailable !== false);

// ── 最终口径 ──
const A0 = 0.30, W0 = 1, U0 = 0.50;
const weightOf = (D) => (D >= 0.94 ? 0 : D);      // 超纲不计入

/** 累计加权平均（A 的最终实现） */
function computeA(list) {
  let num = W0 * A0, den = W0;
  for (const r of list) {
    const w = weightOf(r.D);
    if (!w) continue;
    num += w * r.P; den += w;
  }
  return den > W0 ? num / den : null;
}

console.log(L);
console.log('  A 最终版 · 用作者真实数据验收');
console.log(L);
console.log(`\n  样本：${rows.length} 道解答题（去重）`);
console.log(`    空题（没作答）  ${rows.length - done.length} 道 → 全部跳过`);
console.log(`    做了的题        ${done.length} 道 → 计账`);

console.log('\n' + L);
console.log('  一、逐题明细（做了的 ' + done.length + ' 道）');
console.log(L);
console.log('  #   D      L档    权重w    P     加权贡献 w×P');
let num = W0 * A0, den = W0;
done.forEach((r, i) => {
  const w = weightOf(r.D);
  const lv = r.D < 0.45 ? 'L1-L3' : r.D < 0.79 ? 'L4-L6' : r.D < 0.94 ? 'L7-L9' : 'L10+';
  num += w * r.P; den += w;
  console.log(`  ${String(i + 1).padStart(2)}  ${r.D.toFixed(2)}   ${lv.padEnd(6)} ${w.toFixed(2)}    ${r.P.toFixed(2)}   ${(w * r.P).toFixed(4)}`);
});
console.log(`  ${'—'.repeat(50)}`);
console.log(`  先验              ${W0.toFixed(2)}    ${A0.toFixed(2)}   ${(W0 * A0).toFixed(4)}`);
console.log(`  Σ权重 / Σ加权     ${den.toFixed(2)}            ${num.toFixed(4)}`);
console.log(`\n  A = ${num.toFixed(4)} ÷ ${den.toFixed(2)} = ${p3(num / den)}`);

console.log('\n' + L);
console.log('  二、与各口径对比');
console.log(L);
const CAL = (d) => 0.6 + 0.4 * d;
const algo = {
  '现行线上（含空题+折扣+q+三因子）': null,
  '排除空题 + 等权（不看难度）': (() => { let n = W0 * A0, d = W0; for (const r of done) { n += r.P; d++; } return n / d; })(),
  '排除空题 + 折扣 s=P×cal(D)': (() => { let n = W0 * A0, d = W0; for (const r of done) { n += r.P * CAL(r.D); d++; } return n / d; })(),
  '排除空题 + 权重 w=按L档': (() => { const W = d => d < 0.45 ? 0.3 : d < 0.79 ? 1.0 : d < 0.94 ? 0.7 : 0; let n = W0 * A0, d = W0; for (const r of done) { const w = W(r.D); if (!w) continue; n += w * r.P; d += w; } return n / d; })(),
  '★ 排除空题 + 权重 w=D（最终版）': computeA(done),
};
for (const [k, v] of Object.entries(algo)) {
  console.log(`  ${k.padEnd(36)} ${v == null ? '51.7 (实测)' : p3(v)}`);
}

console.log('\n' + L);
console.log('  三、难度确实起作用 —— 混合例子（3 道 D=0.5 满分 + 3 道 D=0.75 只拿 0.4）');
console.log(L);
const demo = [{ D: 0.5, P: 1 }, { D: 0.5, P: 1 }, { D: 0.5, P: 1 }, { D: 0.75, P: 0.4 }, { D: 0.75, P: 0.4 }, { D: 0.75, P: 0.4 }];
const demoA = (sFn, wFn) => { let n = 0, d = 0; for (const r of demo) { const w = wFn(r.D); n += w * sFn(r); d += w; } return n / d; };
console.log(`  等权                    A = ${p3(demoA(r => r.P, () => 1))}`);
console.log(`  ★ 权重 w=D              A = ${p3(demoA(r => r.P, d => d))}   ← 难题失败被放大`);
console.log(`  折扣 s=P×cal(D)         A = ${p3(demoA(r => r.P * CAL(r.D), () => 1))}`);

console.log('\n' + L);
console.log('  四、权重 w=D 的行为检查');
console.log(L);
console.log('  ① 只做简单题（D=0.2，全对）→ 权重小，爬得慢（简单题是弱证据）');
{
  let n = W0 * A0, d = W0;
  for (let i = 0; i < 50; i++) { n += 0.2 * 1; d += 0.2; }
  console.log(`     50 道 D=0.2 满分 → A = ${p3(n / d)}`);
}
console.log('  ② 做中档题（D=0.6，全对）');
{
  let n = W0 * A0, d = W0;
  for (let i = 0; i < 50; i++) { n += 0.6 * 1; d += 0.6; }
  console.log(`     50 道 D=0.6 满分 → A = ${p3(n / d)}`);
}
console.log('  ③ 做较难题（D=0.75，全对）');
{
  let n = W0 * A0, d = W0;
  for (let i = 0; i < 50; i++) { n += 0.75 * 1; d += 0.75; }
  console.log(`     50 道 D=0.75 满分 → A = ${p3(n / d)}`);
}
console.log('  ④ 超纲题（D=0.96）→ 权重 0，完全不计入');
console.log(`     10 道 D=0.96 → A 不变（仍是先验 ${p3(A0)}）`);
console.log('  ⑤ 单元内只有 3 道题时，先验占 1/(1+Σw)');
{
  let n = W0 * A0, d = W0;
  for (let i = 0; i < 3; i++) { n += 0.6 * 1; d += 0.6; }
  console.log(`     3 道 D=0.6 满分 → A = ${p3(n / d)}（先验占 ${(W0 / d * 100).toFixed(0)}%）`);
}
console.log('\n' + L);
