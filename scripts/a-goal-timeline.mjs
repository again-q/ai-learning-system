/**
 * 从用户最原始的目标出发：画一条时间线
 *
 * 目标（用户原话）：
 *   「A 应该很逼近 U，然后等学生有超出预期的表现之后，
 *     U 突破了之后，A 继续不断逼近 U」
 *
 * 本脚本只做一件事：把 A 和 U 随时间的变化画出来，看形状对不对。
 * 跑法：node scripts/a-goal-timeline.mjs
 */

const CAL = (d) => 0.6 + 0.4 * d;
const p3 = (x) => (x * 100).toFixed(1);

const LVL = [
  { n: '简单', D: 0.518, cap: CAL(0.518), w: 0.55 },
  { n: '中档', D: 0.650, cap: CAL(0.650), w: 0.10 },
  { n: '困难', D: 0.735, cap: CAL(0.735), w: 0.35 },
];

// 一个「会进步」的学生：能力基线随周次上升
function P_at(li, base) {
  const cap = LVL[li].cap;
  const b = Math.max(0.03, Math.min(cap, base));
  const r = Math.random();
  if (r < 0.12) return Math.min(1, b + 0.15);
  if (r < 0.24) return b * 0.35;
  return Math.max(0, Math.min(cap, b + (Math.random() - 0.5) * 0.42));
}
function pickLi() { const r = Math.random(); let a = 0; for (let k = 0; k < 3; k++) { a += LVL[k].w; if (r <= a) return k; } return 0; }

const WEEKS = 20, PER_WEEK = 100;
// 学生能力基线：第 1 周 0.55，第 20 周 0.90（线性进步）
const baseOf = (week) => 0.55 + (0.90 - 0.55) * (week / (WEEKS - 1));

function simulate(seed) {
  let A = 0.30, U = 0.50, consec = 0;
  const rows = [];
  let ups = 0;
  for (let w = 0; w < WEEKS; w++) {
    const base = baseOf(w);
    const bA = A, bU = U;
    for (let i = 0; i < PER_WEEK; i++) {
      const li = pickLi();
      const s = P_at(li, base) * CAL(LVL[li].D);
      if (s > U) { consec++; } else consec = 0;
      if (consec >= 2) { U = Math.min(1, U + 0.05 * (1 - U)); consec = 0; ups++; }
      A = Math.max(0, Math.min(U, A + 0.1 * (s - A)));
    }
    rows.push({ w: w + 1, A, U, gap: U - A, dA: A - bA, dU: U - bU });
  }
  return { rows, ups };
}

// ═══════════════════════════════════════════
console.log('='.repeat(88));
console.log('  一、A 和 U 随时间怎么走（20 周，每周 100 题，学生能力从 0.55 稳步涨到 0.90）');
console.log('='.repeat(88));

const R = [];
for (let k = 0; k < 30; k++) R.push(simulate(k));

console.log('\n  周    A      U      U−A   本周ΔA   本周ΔU   A/U    图形（A=█  U=▓）');
for (let w = 0; w < WEEKS; w++) {
  const A = R.reduce((a, r) => a + r.rows[w].A, 0) / R.length;
  const U = R.reduce((a, r) => a + r.rows[w].U, 0) / R.length;
  const dA = R.reduce((a, r) => a + r.rows[w].dA, 0) / R.length;
  const dU = R.reduce((a, r) => a + r.rows[w].dU, 0) / R.length;
  const bar = (v) => Math.round(v * 46);
  const aN = bar(A), uN = bar(U);
  let graph = '';
  for (let i = 1; i <= 46; i++) graph += (i <= aN ? '█' : (i <= uN ? '▓' : '·'));
  console.log(`  ${String(w + 1).padStart(2)}  ${p3(A).padStart(5)}  ${p3(U).padStart(5)}  ${((U-A)*100).toFixed(1).padStart(5)}  ${(dA*100).toFixed(1).padStart(6)}  ${(dU*100).toFixed(1).padStart(6)}  ${(A/U).toFixed(3)}  ${graph}`);
}

console.log('\n  █ = A（当前能力）   ▓ = A 到 U 之间的空隙   · = U 之上');

// ═══════════════════════════════════════════
console.log('\n' + '='.repeat(88));
console.log('  二、你要的三个特征，逐条核对');
console.log('='.repeat(88));

const last = R.map(r => r.rows[19]);
const gapAvg = last.reduce((a, r) => a + r.gap, 0) / R.length;
const ratioAvg = last.reduce((a, r) => a + r.A / r.U, 0) / R.length;

console.log('\n  【特征 1】A 很逼近 U');
console.log(`     第 20 周：U−A = ${(gapAvg*100).toFixed(1)} 点，A/U = ${ratioAvg.toFixed(3)}`);
console.log(`     ${ratioAvg > 0.95 ? '✅ 逼近了（A/U > 0.95）' : '⚠️ A/U = ' + ratioAvg.toFixed(3) + '，有残差'}`);

console.log('\n  【特征 2】U 突破后 A 继续追');
console.log('     看每周的 ΔU 和次周 ΔA：');
let okCount = 0, totCount = 0;
for (let w = 1; w < WEEKS - 1; w++) {
  const dU = R.reduce((a, r) => a + r.rows[w].dU, 0) / R.length;
  const nA = R.reduce((a, r) => a + r.rows[w + 1].dA, 0) / R.length;
  if (dU > 0.001) { totCount++; if (nA > 0) okCount++; console.log(`     第${String(w).padStart(2)}周 U 涨 ${(dU*100).toFixed(2)} 点 → 第${String(w+1).padStart(2)}周 A 涨 ${(nA*100).toFixed(2)} 点 ${nA > 0 ? '✅' : '❌'}`); }
}
console.log(`     → ${okCount}/${totCount} 次 U 突破后 A 确实继续涨 ${okCount === totCount ? '✅' : '⚠️'}`);

console.log('\n  【特征 3】A 和 U 同步上升（不是 A 追不上）');
const aRise = last.reduce((a, r) => a + r.A, 0) / R.length - 0.30;
const uRise = last.reduce((a, r) => a + r.U, 0) / R.length - 0.50;
console.log(`     20 周里：A 从 0.30 涨到 ${p3(last.reduce((a,r)=>a+r.A,0)/R.length)}（+${(aRise*100).toFixed(1)}）`);
console.log(`              U 从 0.50 涨到 ${p3(last.reduce((a,r)=>a+r.U,0)/R.length)}（+${(uRise*100).toFixed(1)}）`);
console.log(`     A 涨幅是 U 涨幅的 ${(aRise/uRise).toFixed(2)} 倍 ${aRise > uRise * 0.6 ? '✅ 同步' : '⚠️ A 落后'}`);

// ═══════════════════════════════════════════
console.log('\n' + '='.repeat(88));
console.log('  三、为什么会有残差（U−A 那一段）—— 一句话说清');
console.log('='.repeat(88));
console.log(`
  A 的更新式是： A ← A + 0.1 × (s − A)
  这个式子的含义：A 每天朝「今天这次得分 s」挪 10%。

  挪来挪去，A 会停在「s 的平均值」上 —— 这就是 A 的含义：
      A = 他最近稳定能做到的水平

  而 U 的更新式是：只要连续两次超过 U，U 就往上走
      U = 他曾经做到过的最高水平

  所以：
      · 他水平稳定时  → s 的均值 ≈ s 的最高值 → A ≈ U（贴合）
      · 他水平忽高忽低 → s 的均值 < s 的最高值 → A < U（有残差）

  你要的「突破」= 他做出一道以前做不到的题（s 超过了 U）
                 → U 抬高一格
                 → 之后他稳定做到的水平（A）慢慢爬上去
                 → 爬到接近新 U → 等下一次突破
  这就是「阶梯上升」。看上面的表：U 的涨幅集中在少数几周，
  A 则在每周平稳上升 —— 形状是对的。
`);
console.log('='.repeat(88));
