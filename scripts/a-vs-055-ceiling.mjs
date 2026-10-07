/**
 * 对比：最初版天花板机制（决策 055） vs 甲方案（决策 062）
 *
 * 机制 · 最初版（055，线上现行）
 *   q   = 1 − 断段数/总段数
 *   s   = P × (0.6 + 0.4D) × q
 *   U   : s ≥ 0.8 连续2次 → U += 0.05(1−U)
 *         s ≤ 0.6 连续5次 → U -= 0.03(U−A)
 *   ΔA  = 0.25 × (s − A) × (U − A)，A = clamp(A+ΔA, 0, U)
 *   闸门: errorLevel !== 'skill'
 *   空题: 计入（P=0）
 *   A₀=0.30  U₀=0.50
 *
 * 机制 · 甲方案（062）
 *   w   = D（D≥0.94 则 w=0）
 *   s   = P
 *   A   = (w₀·A₀ + Σ w·s) / (w₀ + Σ w)      A₀=0.30 w₀=1
 *   U   : 连续2次 s > U → U += 0.05(1−U)，只涨不跌
 *   空题: 跳过
 *
 * 跑法: node scripts/a-vs-055-ceiling.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const p3 = (x) => (x == null ? '  — ' : (x * 100).toFixed(1).padStart(5));
const CAL = (d) => 0.6 + 0.4 * d;
const L = '='.repeat(100);
const S = '-'.repeat(100);
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const DIR = path.resolve(__dirname, '..', 'output', 'golden', 'results', 'stability-raw');

// ────────────────────────────────── 两个机制 ──────────────────────────────────
function qOf(j) {
  const segs = j.segments || [];
  if (!segs.length) return 1;
  const broken = segs.filter((x) => x && x.status === '断').length;
  return 1 - broken / Math.max(1, segs.length);
}

/** 最初版 055 */
function mech055() {
  let A = 0.30, U = 0.50, hiStreak = 0, loStreak = 0, n = 0, ups = 0, downs = 0, clamped = 0;
  return {
    name: '055 天花板',
    step(j) {
      const gate = j.errorLevel;
      if (gate === 'skill') { clamped++; return; }            // 闸门
      const s = j.P * CAL(j.D) * qOf(j);                      // 折扣 + q
      if (s >= 0.8) { hiStreak++; loStreak = 0; } else { hiStreak = 0; }
      if (s <= 0.6) { loStreak++; } else { loStreak = 0; }
      if (hiStreak >= 2) { U += 0.05 * (1 - U); hiStreak = 0; ups++; }
      if (loStreak >= 5) { U -= 0.03 * (U - A); loStreak = 0; downs++; }
      const dA = 0.25 * (s - A) * (U - A);
      A = Math.max(0, Math.min(U, A + dA));                   // A 被 U 钳住
      n++;
    },
    get A() { return A; },
    get U() { return U; },
    get n() { return n; },
    get info() { return `上浮 ${ups} / 下浮 ${downs} / 闸门挡下 ${clamped}`; },
  };
}

/** 甲方案 062 */
function mech062() {
  let A = 0.30, U = 0.50, W = 1, Sum = 1 * 0.30, consec = 0, n = 0, ups = 0, skipped = 0;
  return {
    name: '062 甲方案',
    step(j) {
      if (j.processAvailable === false) { skipped++; return; }     // 空题跳过
      const w = j.D >= 0.94 ? 0 : j.D;                             // 难度当权重
      if (!w) { skipped++; return; }
      const s = j.P;
      if (s > U) { consec++; if (consec >= 2) { U += 0.05 * (1 - U); consec = 0; ups++; } } else consec = 0;
      W += w; Sum += w * s;
      A = Sum / W;
      n++;
    },
    get A() { return A; },
    get U() { return U; },
    get n() { return n; },
    get info() { return `上浮 ${ups} / 跳过 ${skipped}`; },
  };
}

// ────────────────────────────────── 数据 ──────────────────────────────────
const seen = new Set(), rows = [];
for (const f of fs.readdirSync(DIR).sort()) {
  const j = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  if (j.questionType !== '解答' || j.P == null || j.D == null) continue;
  const k = (j.questionText || '').slice(0, 60);
  if (seen.has(k)) continue; seen.add(k);
  rows.push(j);
}
const done = rows.filter((r) => r.processAvailable !== false);

console.log(L);
console.log('  最初版天花板机制（055） vs 甲方案（062）· 用作者真实数据');
console.log(L);
console.log(`  样本：${rows.length} 道解答题（去重）  ── ${rows.length - done.length} 道空题 + ${done.length} 道做了的`);

// ── 一、逐题轨迹 ──
console.log('\n' + L);
console.log('  一、同一条真实作答序列，两套机制逐题怎么走');
console.log(L);
console.log('    题次   D     P    q     │ 055: s     A      U     │ 062: 权重   A      U');
console.log('  ' + S);
const m1 = mech055(), m2 = mech062();
rows.forEach((r, i) => {
  m1.step(r); m2.step(r);
  const q = qOf(r);
  const s055 = r.P * CAL(r.D) * q;
  const w062 = r.processAvailable === false ? '跳过' : (r.D >= 0.94 ? '0' : r.D.toFixed(2));
  if (i % 2 === 0 || i >= rows.length - 4) {
    console.log(
      `  ${String(i + 1).padStart(4)}  ${r.D.toFixed(2)}  ${r.P.toFixed(2)}  ${q.toFixed(2)}  │` +
      `        ${s055.toFixed(3)}  ${p3(m1.A)}  ${p3(m1.U)}  │` +
      `        ${String(w062).padStart(5)}  ${p3(m2.A)}  ${p3(m2.U)}`
    );
  }
});
console.log('  ' + S);
console.log(`  期末                │                  ${p3(m1.A)}  ${p3(m1.U)}  │` +
  `                   ${p3(m2.A)}  ${p3(m2.U)}`);
console.log(`  计入题数 / 备注      │  ${String(m1.n).padStart(2)} 道  ${m1.info.padEnd(26)} │  ${String(m2.n).padStart(2)} 道  ${m2.info}`);

// ── 二、行为对照实验 ──
console.log('\n' + L);
console.log('  二、五个行为对照（合成序列，同一输入跑两套机制）');
console.log(L);

const mk = (D, P, pa = true) => ({ D, P, processAvailable: pa });
function runBoth(list, label) {
  const a = mech055(), b = mech062();
  for (const j of list) { a.step(j); b.step(j); }
  return { label, a, b };
}

const cases = [
  ['恒定 P=0.80 · 30 道 D=0.6', Array.from({ length: 30 }, () => mk(0.6, 0.8))],
  ['恒定 P=0.50 · 30 道 D=0.6', Array.from({ length: 30 }, () => mk(0.6, 0.5))],
  ['单元里只有 3 道题（D=0.6，全满分）', [mk(0.6, 1.0), mk(0.6, 1.0), mk(0.6, 1.0)]],
  ['先强后弱：15 道 P=1.0 → 15 道 P=0.3', [...Array.from({ length: 15 }, () => mk(0.6, 1.0)), ...Array.from({ length: 15 }, () => mk(0.6, 0.3))]],
  ['含 10 道空题（30 道，其中 10 道 P=0）', [...Array.from({ length: 20 }, () => mk(0.6, 0.9)), ...Array.from({ length: 10 }, () => mk(0.6, 0, false))]],
  ['含 10 道超纲题（D=0.96，全错）', [...Array.from({ length: 20 }, () => mk(0.6, 0.9)), ...Array.from({ length: 10 }, () => mk(0.96, 0.0))]],
  ['难题失败被放大：10 道 D=0.5 满分 + 10 道 D=0.85 只拿 0.4', [...Array.from({ length: 10 }, () => mk(0.5, 1.0)), ...Array.from({ length: 10 }, () => mk(0.85, 0.4))]],
];

console.log('  场景                                              │ 055: A     U       │ 062: A     U');
console.log('  ' + S);
for (const [label, list] of cases) {
  const r = runBoth(list, label);
  console.log(`  ${label.padEnd(50)}│      ${p3(r.a.A)}  ${p3(r.a.U)}  │      ${p3(r.b.A)}  ${p3(r.b.U)}`);
}

// ── 三、结构差异 ──
console.log('\n' + L);
console.log('  三、结构差异（这才是真正的区别）');
console.log(L);

// A 与 U 的关系
const rel = [];
{
  const a = mech055(), b = mech062();
  for (let i = 0; i < 60; i++) { const j = mk(0.6, 0.85); a.step(j); b.step(j); }
  rel.push(['60 道稳定满分后 A 与 U 的差', (a.U - a.A), (b.U - b.A)]);
  rel.push(['A 是否被 U 钳住', a.A <= a.U ? '是' : '否', b.A <= b.U ? '是' : '否']);
}
console.log('  项                                       │ 055        │ 062');
console.log('  ' + S);
for (const [k, x, y] of rel) {
  const fx = typeof x === 'number' ? (x * 100).toFixed(1) + ' 点' : x;
  const fy = typeof y === 'number' ? (y * 100).toFixed(1) + ' 点' : y;
  console.log(`  ${k.padEnd(40)} │ ${String(fx).padEnd(10)} │ ${fy}`);
}

// 旧数据权重衰减
console.log('\n  旧数据话语权（前 20 道差、后 20 道好，看前 20 道还剩多少影响）');
{
  const list = [...Array.from({ length: 20 }, () => mk(0.6, 0.3)), ...Array.from({ length: 20 }, () => mk(0.6, 1.0))];
  const a = mech055(), b = mech062();
  // 只跑到前 20 道
  for (let i = 0; i < 20; i++) a.step(list[i]);
  for (let i = 0; i < 20; i++) b.step(list[i]);
  const a20 = a.A, b20 = b.A, bW = b.info;
  for (let i = 20; i < 40; i++) { a.step(list[i]); b.step(list[i]); }
  console.log(`    前 20 道结束时          055 A=${p3(a20)}   062 A=${p3(b20)}`);
  console.log(`    后 20 道做完            055 A=${p3(a.A)}   062 A=${b.A.toFixed(4).padStart(6)}`);
  console.log(`    → 前 20 道差表现的"残留影响"：055 已基本洗掉（EWMA），062 永久保留一半权重（20/(20+20)）`);
}

// 观测数对读数的影响
console.log('\n  观测数的影响（同一水平 P=0.9，D=0.6，看 A 需要几次才稳定）');
console.log('    观测数 │ 055 A    │ 062 A');
console.log('  ' + S);
for (const n of [1, 3, 5, 10, 20, 50, 100]) {
  const a = mech055(), b = mech062();
  for (let i = 0; i < n; i++) { const j = mk(0.6, 0.9); a.step(j); b.step(j); }
  console.log(`    ${String(n).padStart(5)}  │ ${p3(a.A)}   │ ${p3(b.A)}`);
}

// ── 四、汇总 ──
console.log('\n' + L);
console.log('  四、一句话对照');
console.log(L);
console.log(`  作者读数   055 = ${p3(m1.A)}      062 = ${p3(m2.A)}      差 ${((m2.A - m1.A) * 100).toFixed(1)} 点`);
console.log('');
console.log('  维度            │ 055 天花板机制              │ 062 甲方案');
console.log('  ' + S);
const table = [
  ['A 的性质', 'EWMA 滑动（旧数据指数衰减）', '累计加权平均（历史全留）'],
  ['A 的上界', 'U（硬钳位，A ≤ U）', '100（与 U 无关）'],
  ['U 的角色', '约束 A 的天花板', '只记录「达到过」'],
  ['U 涨的条件', 's ≥ 0.8 连续 2 次', 's > U 连续 2 次'],
  ['U 会不会降', '会（连续 5 次 s≤0.6 下浮）', '不会（只涨不跌）'],
  ['难度', '当折扣（压刻度）', '当权重（不打折）'],
  ['空题', '计入（P=0 拉低 A）', '跳过'],
  ['断段 q', '乘进去', '删'],
  ['entry 闸门', 'errorLevel ≠ skill', '无'],
  ['启动拖累', '有（α 从 0.30 起步）', '弱先验 w₀=1 极小'],
];
for (const [k, x, y] of table) console.log(`  ${k.padEnd(15)} │ ${x.padEnd(27)} │ ${y}`);
