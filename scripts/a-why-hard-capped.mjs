/**
 * 验证：哪些参数改动是「真修」，哪些是「假修」
 * 跑法：node scripts/a-why-hard-capped.mjs
 */

const D = { 简单: 0.2, 中等: 0.5, 困难: 0.85 };
const SEGS = { 简单: 3, 中等: 5, 困难: 7 };
const line = '='.repeat(80);
const p0 = (x) => (x * 100).toFixed(1);

function sim(profile, opt) {
  const { th = 0.8, cal = (x) => 0.6 + 0.4 * x, alpha = 0.25, U0 = 0.5, deltaU = 0.05, streak = 2 } = opt;
  let A = 0.30, U = U0, hi = 0, ups = 0;
  const byLv = { 简单: 0, 中等: 0, 困难: 0 };
  for (const { lv, D: d, P, brk } of profile) {
    const q = 1 - brk / SEGS[lv];
    const s = P * cal(d) * q;
    if (s >= th) hi++; else hi = 0;
    if (hi >= streak) { U += deltaU * (1 - U); ups++; byLv[lv]++; hi = 0; }
    A = Math.max(0, Math.min(U, A + alpha * (s - A) * (U - A)));
  }
  return { A, U, ups, byLv };
}

const strong = [];
for (let i = 0; i < 70; i++) strong.push({ lv: '简单', D: D.简单, P: 1, brk: 0 });
for (let i = 0; i < 20; i++) strong.push({ lv: '中等', D: D.中等, P: 1, brk: 0 });
[[0.9, 1], [0.85, 1], [0.9, 1], [0.8, 2], [0.9, 1], [0.7, 2], [0.85, 1], [0.9, 1], [0.6, 3], [0.8, 2]]
  .forEach(([P, brk]) => strong.push({ lv: '困难', D: D.困难, P, brk }));

console.log(line);
console.log('诊断：上浮次数分别由哪一层贡献');
console.log(line);
console.log('  改动                          A      U     上浮  ├──简单/中等/困难');
console.log('  ' + '─'.repeat(66));
const cases = [
  ['现状（门槛0.8 校准0.6+0.4D）', {}],
  ['门槛 0.8 → 0.7', { th: 0.7 }],
  ['门槛 0.8 → 0.7 + 校准 0.8+0.2D', { th: 0.7, cal: (x) => 0.8 + 0.2 * x }],
  ['门槛 0.8 → 0.65', { th: 0.65 }],
  ['门槛 0.65 + 校准 0.8+0.2D', { th: 0.65, cal: (x) => 0.8 + 0.2 * x }],
  ['门槛 0.6 + 校准 0.7+0.3D', { th: 0.6, cal: (x) => 0.7 + 0.3 * x }],
];
for (const [name, opt] of cases) {
  const r = sim(strong, opt);
  const t = `${r.byLv.简单}/${r.byLv.中等}/${r.byLv.困难}`;
  const verdict = r.byLv.简单 > 0 ? '⚠️ 靠简单题撑的 —— 假修' :
    r.byLv.困难 >= 5 ? '✅ 难题在撑 —— 真修' : '🟡 中档在撑';
  console.log(`  ${name.padEnd(30)} ${p0(r.A).padStart(5)} ${p0(r.U).padStart(6)} ${String(r.ups).padStart(5)}  ├── ${t.padEnd(10)} ${verdict}`);
}

console.log('\n' + line);
console.log('反解：要让「难题做对」能上浮，各参数必须同时满足');
console.log(line);
console.log('  目标场景：P=0.9，断 1 段（q=0.857）—— 这是「较强学生做难题」的典型形态\n');
const D_HARD = 0.85;
console.log('  ① 若保持 门槛 0.8、校准 0.6+0.4D：');
console.log(`     s = 0.9 × ${(0.6 + 0.4 * D_HARD).toFixed(3)} × 0.857 = ${(0.9 * 0.94 * 0.857).toFixed(3)}  ❌ 差 ${(0.8 - 0.9 * 0.94 * 0.857).toFixed(3)}`);
console.log('     → 三个因子里没有一个能单独补上：P 已经 0.9、q 已经 0.857、D 已经 0.85');
console.log('     → 唯一能动的是「难度校准的斜率」—— 但它最大只到 1.0，也只补 0.06\n');

console.log('  ② 逐一解，看每个参数要变到多少才够：');
const need = (cal, th) => {
  // 0.9 * cal * 0.857 >= th  →  求 cal
  return th / (0.9 * 0.857);
};
console.log(`     保持门槛 0.8 → 校准必须 ≥ ${need(0, 0.8).toFixed(3)}（现行 0.940，要涨到 0.933… 看似只差 0.007）`);
console.log('        但校准 = 0.6+0.4D 的最大值就是 1.0（D=1），所以数学上可行、实际取不到');
console.log(`     保持校准 0.94 → 门槛必须 ≤ ${(0.9 * 0.94 * 0.857).toFixed(3)}（现行 0.8，要降到 0.69）\n`);

console.log('  ③ 门槛能降到多少而不失「上浮 = 真突破」的意义：');
console.log('     简单题 s 上限 = 校准(0.2)。门槛必须高于它，否则刷简单题就能涨 U。');
for (const cal of [(x) => 0.6 + 0.4 * x, (x) => 0.7 + 0.3 * x, (x) => 0.8 + 0.2 * x]) {
  const easyMax = cal(0.2);
  console.log(`     校准 ${cal(0.2).toFixed(2)}+${(1 - cal(0.2)) / 0.8 * 0.8 / 0.8 === 0 ? '' : ''}${(cal(0.5) - cal(0.2)) / 0.3 > 0 ? `斜率${((cal(0.85) - cal(0.2)) / 0.65).toFixed(2)}` : ''}  简单题上限 ${easyMax.toFixed(3)}  → 门槛下限 ${easyMax.toFixed(3)}~`);
}

console.log('\n' + line);
console.log('核心矛盾（三个参数互相打架）');
console.log(line);
console.log(`
  门槛 0.8  ← 「上浮应该是突破」
     ↕ 冲突
  简单题校准 0.68  ← 「70% 的题都是简单题」
     → 简单题永远上不了浮，A 在前 70 道被钉在 0.50 附近
     → 全部上浮压力落在 30 道中/困难题上
     ↕ 冲突
  难题 q < 1  ← 「难题过程必然有断点」
     → 难题 s 上限 0.725 < 门槛 0.8
     → 难题做对也不涨 U

  三者叠加的结果：U 只能靠「中档题 P=1 且零断点」这一种组合上浮，
  而这种组合在一个学期里出现不到 20 次，每次只涨 0.05(1−U)。
`);
