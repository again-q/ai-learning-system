/**
 * 单元级 A 是怎么算的 —— 用真实数据核对
 *
 * 代码链路（updateMastery.js:69-100 + knowledgeMatch.js:159）：
 *   一道题 → knowledgeUsage（2~4 个知识点）
 *         → 取【第一个】能匹配图谱的节点 → node.path[2] = 单元名
 *         → 用【题目级 D】算 s = P × (0.6+0.4D) × q
 *         → 更新那个单元的 A
 *         → 其余知识点所属单元不更新
 *
 * 跑法：node scripts/a-unit-level-facts.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const CAL = (d) => 0.6 + 0.4 * d;
const p3 = (x) => (x * 100).toFixed(1);
const L = '='.repeat(98);
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const DIR = path.resolve(__dirname, '..', 'output', 'golden', 'results', 'stability-raw');

const rows = [];
for (const f of fs.readdirSync(DIR)) {
  const j = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  if (j.questionType === '解答') rows.push(j);
}

console.log(L);
console.log('  事实 1：一道题涉及几个知识点？（这决定「一笔账记到几个单元」）');
console.log(L);
const cnt = {};
for (const r of rows) { const n = (r.knowledgeUsage || []).length; cnt[n] = (cnt[n] || 0) + 1; }
for (const n of Object.keys(cnt).sort()) console.log(`  ${n} 个知识点：${String(cnt[n]).padStart(3)} 道`);
const multi = rows.filter(r => (r.knowledgeUsage || []).length > 1).length;
console.log(`\n  → ${multi}/${rows.length} 道是多知识点题`);
console.log('  → 而代码只更新【第一个】匹配到的单元 → 其余单元的 A 该涨没涨');
console.log('\n  样例（3 道）：');
for (const r of rows.slice(0, 3)) {
  console.log(`    题目D=${r.D}  知识点：${(r.knowledgeUsage || []).map(x => `${x.name}(D=${x.D})`).join(' + ')}`);
}
console.log('\n  ⚠️ 注意两个 D 不一样：');
console.log('     · 题目级 D（用于算 s）    —— 上面样例 ' + rows[0].D);
console.log('     · 知识点级 D（每条的 D）  —— ' + (rows[0].knowledgeUsage || []).map(x => x.D).join(' / '));

console.log('\n' + L);
console.log('  事实 2：每个单元的难度天花板不同（按知识点聚类还原单元）');
console.log(L);
const GROUPS = {
  '数列': ['数列求和', '等比数列的通项公式', '数列的通项公式', '数列的递推公式与通项公式', '数列的递推公式', '等比数列'],
  '导数': ['导数的几何意义', '利用导数研究函数的单调性', '利用导数研究不等式恒成立问题', '导数与不等式恒成立', '利用导数研究函数的单调性与最值', '利用导数研究函数单调性与恒成立问题', '利用导数研究函数单调性', '导数与函数单调性'],
  '圆锥曲线': ['椭圆的简单几何性质', '抛物线的方程与几何性质', '椭圆的标准方程', '抛物线的方程与性质', '抛物线的方程', '椭圆的标准方程与几何性质', '椭圆的几何性质'],
  '统计': ['独立性检验', '频率分布表', '用样本的频率分布估计总体分布'],
  '不等式': ['含绝对值的不等式', '绝对值不等式', '含绝对值的函数'],
  '概率': ['离散型随机变量的分布列与数学期望'],
};
const byNode = {};
for (const r of rows) (byNode[r.knowledgeNodeName] = byNode[r.knowledgeNodeName] || []).push(r.D);
console.log('  单元        题数   D 范围        单元 D 均值   单元天花板(=P=1.0 时的 A)');
for (const [g, nodes] of Object.entries(GROUPS)) {
  const all = [];
  for (const n of nodes) if (byNode[n]) all.push(...byNode[n]);
  if (!all.length) continue;
  const dm = all.reduce((a, b) => a + b, 0) / all.length;
  console.log(`  ${g.padEnd(10)} ${String(all.length).padStart(4)}   ${Math.min(...all).toFixed(2)}~${Math.max(...all).toFixed(2)}        ${dm.toFixed(3)}        ${p3(CAL(dm))}`);
}
console.log('\n  → 数列单元满分 82 / 导数单元满分 89 —— 差 8 分');
console.log('  → 所以单元之间的 A 不能直接比较（尺子不一样长）');

console.log('\n' + L);
console.log('  事实 3：同一个知识点内的 D 跨度（检验「单元内难度是否分散」）');
console.log(L);
console.log('  知识点                    题数   D 范围        跨度');
const spans = Object.entries(byNode).filter(([, a]) => a.length >= 5)
  .map(([n, a]) => ({ n, lo: Math.min(...a), hi: Math.max(...a), span: Math.max(...a) - Math.min(...a), c: a.length }))
  .sort((x, y) => y.span - x.span);
for (const s of spans) console.log(`  ${s.n.slice(0, 24).padEnd(26)} ${String(s.c).padStart(3)}   ${s.lo.toFixed(2)}~${s.hi.toFixed(2)}      ${s.span.toFixed(2)}`);
console.log('\n  → 跨度普遍只有 0.10~0.16');
console.log('  → 说明「同一单元的题难度是集中的」，不存在我上一轮假设的「30% 基础 + 10% 压轴」');
console.log('  → 单元天花板 = 该单元本身的难度水平决定，不是「基础题拉低的」');

console.log('\n' + L);
console.log('  一、代码现在实际在算什么（逐行）');
console.log(L);
console.log(`
  每个 (学生 × 单元) 一条记录 unit_progress，字段 = { aValue, aUpper, n, sHiStreak, lowEtaStreak, lastS }

  学生做一道题：
    ① 从 knowledgeUsage 取第一个匹配到图谱的知识点 → 它的 path[2] 定单元
    ② q = 1 − 断段数/总段数
    ③ s = P × (0.6 + 0.4·题目D) × q
    ④ U：s ≥ 0.8 连续 2 次 → U += 0.05(1−U)；s ≤ 0.6 连续 5 次 → U -= 0.03(U−A)
    ⑤ ΔA = 0.25 × (s − A) × (U − A)；A = clamp(A + ΔA, 0, U)

  初始：A = 0.30   U = 0.50
  闸门：errorLevel = 'skill' 的题不进 A
  标记：algorithm = 's0955_v1'
`);
console.log(L);
