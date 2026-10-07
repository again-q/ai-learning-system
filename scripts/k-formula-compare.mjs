/**
 * K 的两种口径对比计算（决策 060 附验证脚本）
 *
 * 背景：K 要不要加学习率？难题权重要多大？K 到底能不能读成「这个知识点单独考能拿多少分」？
 *
 * 跑法：node scripts/k-formula-compare.mjs
 * 数据：线上 61 道题的真实难度分布（2026-10-02 实查口径，此处只用到 D 的分布形态）
 */

const LEVELS = ['简单', '中等', '困难'];

// ── 权重方案 ────────────────────────────────────────────
// 方案 A：用户那句「难题权重要大」的字面值（来自方法二原文）
const W_SPREAD = { 简单: 0.2, 中等: 0.3, 困难: 0.5 };
// 方案 B：压窄后的比值（避免困难层全错却算出一个好看的总分）
const W_TIGHT = { 简单: 0.25, 中等: 0.35, 困难: 0.4 };

// ── 两个典型学生 ─────────────────────────────────────────
// A：简单题全对、困难题全错 —— 考权重压不压得住
const stuA = [
  { d: '简单', ok: true, n: 10 },
  { d: '简单', ok: true, n: 5 },
  { d: '中等', ok: true, n: 4 },
  { d: '困难', ok: false, n: 2 },
];
// B：他真实的形态（实测：中等题 3 道拿 40%、4 道拿 71~73%）
const stuB = [
  { d: '简单', ok: true, n: 8 },
  { d: '中等', ok: true, n: 4 },
  { d: '中等', ok: false, n: 3 },
  { d: '困难', ok: false, n: 2 },
];

// ── 口径一：累加权重的频率 ───────────────────────────────
function weightedRate(rows, W) {
  let num = 0, den = 0;
  for (const r of rows) {
    num += W[r.d] * (r.ok ? r.n : 0);
    den += W[r.d] * r.n;
  }
  return den > 0 ? num / den : null;
}

// ── 口径二：带学习率的平滑（难度只进目标值 s，不进权重）──
function smoothRate(rows, alpha = 0.25, init = 0.5) {
  let K = init;
  const diffFactor = { 简单: 0.4, 中等: 0.7, 困难: 1.0 }; // 难度只在这里生效
  for (const r of rows) {
    for (let i = 0; i < r.n; i++) {
      const s = r.ok ? 1 : 0;
      const target = s * diffFactor[r.d];
      K = K + alpha * (target - K);
      K = Math.max(0, Math.min(1, K));
    }
  }
  return K;
}

// ── 报告 ────────────────────────────────────────────────
function pct(x) { return (x * 100).toFixed(1).padStart(5) + '%'; }

console.log('='.repeat(78));
console.log('K 的两种口径 · 同一批作答算出什么');
console.log('='.repeat(78));

for (const stu of [{ name: '甲', rows: stuA, desc: '简单全对 + 困难全错' },
                   { name: '乙', rows: stuB, desc: '真实形态（简单好 中等飘 困难错）' }]) {
  console.log(`\n【学生${stu.name}】${stu.desc}`);
  for (const r of stu.rows) {
    console.log(`   ${r.d}　${r.ok ? '对' : '错'} × ${r.n}`);
  }
  console.log('   ─────────────────────────────────────────────');
  const a = weightedRate(stu.rows, W_SPREAD);
  const b = weightedRate(stu.rows, W_TIGHT);
  const c = smoothRate(stu.rows, 0.25);
  console.log(`   权重 0.2/0.3/0.5（字面）      K = ${pct(a)}`);
  console.log(`   权重 0.25/0.35/0.4（压窄）    K = ${pct(b)}`);
  console.log(`   学习率 α=0.25（平滑）        K = ${pct(c)}`);
}

// ── 关键检验：权重够不够压 ───────────────────────────────
console.log('\n' + '='.repeat(78));
console.log('检验：困难层全错的学生，K 应该看起来明显偏低');
console.log('='.repeat(78));
console.log('   目标：困难层 0/2 时，K 应低于 0.6，否则「难题权重」形同虚设\n');
for (const [name, W] of [['0.2/0.3/0.5', W_SPREAD], ['0.25/0.35/0.4', W_TIGHT]]) {
  const K = weightedRate(stuA, W);
  console.log(`   权重 ${name.padEnd(16)} K = ${pct(K)}  ${K < 0.6 ? '✅ 压得住' : '⚠️  偏高，学生会以为还行'}`);
}

// ── K 能不能读成「单独考能拿多少分」 ──────────────────────
console.log('\n' + '='.repeat(78));
console.log('可读性检验：K 是不是「单独出一张卷子能拿多少分」');
console.log('='.repeat(78));
console.log('   要成立，必须能反推出「多少分」——即 K × 100 可读');
console.log('\n   累加权重的频率：✅ 可以。分母就是「加权后的总分」，K×100 直接是得分率');
console.log('   学习率平滑：    ❌ 不行。K 是被 α 改写过的，读不出「答对几道」\n');
console.log('   举例：乙在两种口径下');
console.log(`     累加权重   → ${pct(weightedRate(stuB, W_TIGHT))}  读作「这张卷子他拿 62 分」`);
console.log(`     学习率平滑 → ${pct(smoothRate(stuB, 0.25))}  读不出 —— 不知道分母是几次`);

// ── 线上现状提醒 ────────────────────────────────────────
console.log('\n' + '='.repeat(78));
console.log('线上现状（决定要不要马上调权重）');
console.log('='.repeat(78));
console.log('   knowledge_progress 52 条，大量 attempts ≤ 1（判 insufficient）');
console.log('   → 样本量本来就少，所以「能数回去」比「涨得快」更重要');
console.log('   → 建议先跑累加权重的频率，学习率等数据量起来再加');
