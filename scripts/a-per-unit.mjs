/**
 * A 是「单元级」的 —— 按单元重算
 *
 * 用户的目标（都在一个单元内）：
 *   课内比较强        → A ≈ 0.85
 *   能做出高考压轴     → A ≈ 0.90+
 *   含压轴的强学生     → 0.90
 *
 * 一个单元内的题：基础 / 中档 / 较难 / 本单元压轴
 * 跑法：node scripts/a-per-unit.mjs
 */

const p3 = (x) => (x * 100).toFixed(1);
const L = '='.repeat(98);
const CAL = (d) => 0.6 + 0.4 * d;

// ── 一个单元里的题目结构（我按课内单元的常规构成拟）──
const UNIT = [
  { n: '基础', d: 0.25, w: 0.30 },
  { n: '中档', d: 0.55, w: 0.40 },
  { n: '较难', d: 0.72, w: 0.20 },
  { n: '压轴', d: 0.93, w: 0.10 },
];
console.log(L);
console.log('  一、一个单元的题目结构与各档满分值');
console.log(L);
console.log('  档      D      占比    满分值(0.6+0.4D)   加权贡献');
let unitCal = 0;
for (const u of UNIT) {
  unitCal += CAL(u.d) * u.w;
  console.log(`  ${u.n.padEnd(5)} ${u.d.toFixed(2)}   ${(u.w*100).toFixed(0).padStart(3)}%    ${CAL(u.d).toFixed(3)}              ${(CAL(u.d)*u.w).toFixed(3)}`);
}
console.log(`  → 单元的加权平均校准 = ${unitCal.toFixed(3)}（= 满分学生在这个单元的 A 上限）`);

// ── 三种学生（按各档的 P 定义）──
const STUDENTS = {
  '课内较强': { 基础: 0.97, 中档: 0.92, 较难: 0.82, 压轴: 0.45 },
  '能解压轴': { 基础: 0.99, 中档: 0.96, 较难: 0.90, 压轴: 0.80 },
  '满分学生': { 基础: 1.00, 中档: 1.00, 较难: 1.00, 压轴: 1.00 },
  '中等': { 基础: 0.90, 中档: 0.75, 较难: 0.50, 压轴: 0.15 },
  '较弱': { 基础: 0.65, 中档: 0.35, 较难: 0.10, 压轴: 0.00 },
};

console.log('\n' + L);
console.log('  二、三种口径下各档学生在「一个单元」里的 A');
console.log(L);
console.log('  口径说明：');
console.log('    ① 现行：s = P×(0.6+0.4D)  ← 绝对折扣');
console.log('    ② 只算中等以上：D≥0.5 的题才进 A');
console.log('    ③ 加权平均P：s = P，难度只进权重（权重按真实卷子配比反过来 0.1/0.2/0.7）');

const W_BY_D = (d) => d < 0.45 ? 0.1 : d < 0.65 ? 0.2 : 0.7;   // 跟 K 同构

function calcA(pObj, mode) {
  let num = 0, den = 0;
  for (const u of UNIT) {
    const P = pObj[u.n];
    const w = u.w;
    if (mode === 'now') { num += P * CAL(u.d) * w; den += w; }
    else if (mode === 'mid+') { if (u.d < 0.5) continue; num += P * CAL(u.d) * w; den += w; }
    else { const ww = w * W_BY_D(u.d); num += P * ww; den += ww; }
  }
  return den > 0 ? num / den : 0;
}

console.log('\n  学生        ① 现行     ② 只算中等以上   ③ 加权平均P   你的目标');
const TGT = { '课内较强': 0.85, '能解压轴': 0.90, '满分学生': 1.00, '中等': 0.60, '较弱': 0.35 };
for (const s of Object.keys(STUDENTS)) {
  const a = calcA(STUDENTS[s], 'now'), b = calcA(STUDENTS[s], 'mid+'), c = calcA(STUDENTS[s], 'weighted');
  console.log(`  ${s.padEnd(8)} ${p3(a).padStart(7)}     ${p3(b).padStart(9)}      ${p3(c).padStart(9)}     ${String(TGT[s]*100).padStart(5)}`);
}

console.log('\n' + L);
console.log('  三、对目标：哪种口径能让「课内较强=0.85 / 能解压轴=0.90」同时成立');
console.log(L);
console.log('  口径              课内较强   能解压轴   两者之差   满分   是否命中');
for (const [nm, mode] of [['① 现行', 'now'], ['② 只算中等以上', 'mid+'], ['③ 加权平均P', 'weighted']]) {
  const a = calcA(STUDENTS['课内较强'], mode), b = calcA(STUDENTS['能解压轴'], mode), c = calcA(STUDENTS['满分学生'], mode);
  const ok = Math.abs(a - 0.85) < 0.04 && b >= 0.88;
  console.log(`  ${nm.padEnd(16)} ${p3(a).padStart(7)}   ${p3(b).padStart(8)}   ${p3(b-a).padStart(8)}   ${p3(c).padStart(6)}   ${ok ? '✅' : '❌'}`);
}

console.log('\n' + L);
console.log('  四、逐档拆解：三种口径下「课内较强」那个学生在每个难度上贡献多少');
console.log(L);
for (const [nm, mode] of [['① 现行', 'now'], ['② 只算中等以上', 'mid+'], ['③ 加权平均P', 'weighted']]) {
  console.log(`\n  ▸ ${nm}`);
  console.log('    档      P     s=满分值/权重   加权后贡献');
  let num = 0, den = 0;
  for (const u of UNIT) {
    const P = STUDENTS['课内较强'][u.n];
    if (mode === 'mid+' && u.d < 0.5) { console.log(`    ${u.n.padEnd(5)} ${P.toFixed(2)}   ——（被排除）`); continue; }
    if (mode === 'now') { const c = P * CAL(u.d) * u.w; num += c; den += u.w; console.log(`    ${u.n.padEnd(5)} ${P.toFixed(2)}   ${CAL(u.d).toFixed(3)}          ${c.toFixed(4)}`); }
    else { const w = u.w * W_BY_D(u.d); const c = P * w; num += c; den += w; console.log(`    ${u.n.padEnd(5)} ${P.toFixed(2)}   权重${W_BY_D(u.d).toFixed(1)}×占比${(u.w*100).toFixed(0)}%  ${c.toFixed(4)}`); }
  }
  console.log(`    → A = ${p3(num / den)}`);
}
console.log(L);
