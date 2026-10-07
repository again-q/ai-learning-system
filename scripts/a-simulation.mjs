/**
 * A 的公式实跑 · 模拟一个学期的 55 道解答题
 *
 * 跑法：node scripts/a-simulation.mjs
 *
 * 公式（决策 055，本轮不改）：
 *   s  = P × (0.6 + 0.4·D) × q        q = 1 − 断段数/总段数
 *   U  上浮：连续 2 次 s ≥ 0.8 → U += 0.05(1−U)
 *            下浮：连续 5 次 s ≤ 0.6 → U -= 0.03(U−A)
 *   ΔA = 0.25 × (s − A) × (U − A)     A = clamp(A+ΔA, 0, U)
 *   初值 A=0.30, U=0.50
 */

const LEVELS = {
  简单: { D: 0.2, 段: 3 },
  中等: { D: 0.5, 段: 5 },
  困难: { D: 0.85, 段: 7 },
};

function run(label, profile, opts = {}) {
  let A = 0.30, U = 0.50;
  let hiStreak = 0, lowStreak = 0;
  const log = [];
  let uMovedAt = null;

  for (let i = 0; i < profile.length; i++) {
    const { lv, P, broken } = profile[i];
    const { D, 段 } = LEVELS[lv];
    const q = broken != null ? 1 - broken / Math.max(1, 段) : opts.noQ ? 1 : 1 - broken / 段;

    const s = P * (0.6 + 0.4 * D) * q;

    if (s >= 0.8) hiStreak++; else hiStreak = 0;
    if (hiStreak >= 2) { U += 0.05 * (1 - U); hiStreak = 0; if (!uMovedAt) uMovedAt = i + 1; }
    if (s <= 0.6) { lowStreak++; if (lowStreak >= 5) { U -= 0.03 * (U - A); lowStreak = 0; } }
    else lowStreak = 0;

    const dA = 0.25 * (s - A) * (U - A);
    A = Math.max(0, Math.min(U, A + dA));

    if (i < 6 || i === profile.length - 1 || (i + 1) % 10 === 0) {
      log.push({ n: i + 1, lv, P, broken, s, A, U });
    }
  }
  return { label, log, finalA: A, finalU: U, uMovedAt };
}

// ═══ 场景一：认真练，能力稳步提升 ═══
const diligent = [];
{
  const plan = [];
  for (let i = 0; i < 38; i++) plan.push(['简单', 1.0, 0]);
  for (let i = 0; i < 11; i++) plan.push(['中等', 0.85, 1]);
  for (let i = 0; i < 6; i++) plan.push(['困难', 0.6, 3]);
  // 逐步进步：简单题从满分稳定，中等慢慢好，困难慢慢从0.4到0.8
  let n = 0;
  for (const [lv, base, brk] of plan) {
    let P = base, broken = brk;
    if (lv === '中等') { P = Math.min(1, 0.6 + n * 0.02); broken = Math.max(0, 2 - Math.floor(n / 4)); }
    if (lv === '困难') { P = Math.min(1, 0.4 + n * 0.03); broken = Math.max(1, 4 - Math.floor(n / 2)); }
    diligent.push({ lv, P, broken }); n++;
  }
}

// ═══ 场景二：只做简单题，中等困难全错 ═══
const simpleOnly = [];
for (let i = 0; i < 38; i++) simpleOnly.push(['简单', 1.0, 0].length ? { lv: '简单', P: 1.0, broken: 0 } : null);

// ═══ 场景三：中等全错（检验 q 打折的效果）═══
const midFail = [];
for (let i = 0; i < 38; i++) midFail.push({ lv: '简单', P: 1.0, broken: 0 });
for (let i = 0; i < 11; i++) midFail.push({ lv: '中等', P: 0.4, broken: 4 });
for (let i = 0; i < 6; i++) midFail.push({ lv: '困难', P: 0.2, broken: 6 });

const pct = (x) => (x * 100).toFixed(1);
const line = '─'.repeat(76);

console.log('='.repeat(78));
console.log('A 的公式实跑 · 一个学期 55 道解答题（简单38 / 中等11 / 困难6）');
console.log('='.repeat(78));
console.log('  s = P × (0.6+0.4D) × q      q = 1 − 断段数/总段数');
console.log('  ΔA = 0.25 × (s−A) × (U−A)   初值 A=0.30  U=0.50\n');

for (const { label, log, finalA, finalU, uMovedAt } of [
  run('认真练，稳步提升', diligent),
  run('只做简单题', simpleOnly),
  run('中等全错（断段多）', midFail),
]) {
  console.log(line);
  console.log(`【${label}】`);
  console.log(line);
  for (const r of log) {
    console.log(`  第${String(r.n).padStart(2)}题 ${r.lv}  P=${r.P.toFixed(2)} 断=${r.broken}  s=${r.s.toFixed(3)}  →  A=${pct(r.A).padStart(5)}  U=${r.U.toFixed(3)}`);
  }
  console.log(`  ────────────────────────────────────────────────────────`);
  console.log(`  期末 A = ${pct(finalA)}　　期末 U = ${finalU.toFixed(3)}　　U 第一次上浮在第 ${uMovedAt ?? '—'} 题`);
  console.log('');
}
