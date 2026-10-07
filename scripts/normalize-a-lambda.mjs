#!/usr/bin/env node
/**
 * A 的 λ 轴归一化（适配 D 的金字塔结构）
 *
 * ═══════════════════════════════════════════════════════════════
 * 问题
 * ═══════════════════════════════════════════════════════════════
 * D 不是线性刻度，是金字塔形：
 *   L1 跨度 0.140  →  L9 跨度 0.040  →  L11 跨度 0.019
 *   越往上，一个"难度档"占的 D 空间越小（压缩 7 倍）
 *
 * 后果：如果 A、U 直接定义在 D 轴上，
 *   · 高端的"同样的涨幅"比低端值钱得多（不等价）
 *   · A 在高端难涨（D 空间不够）
 *   · 课内极限被压在 0.94，看起来"上不去"
 *
 * ═══════════════════════════════════════════════════════════════
 * 方案：把 A、U 定义在 λ 轴（线性档位坐标）
 * ═══════════════════════════════════════════════════════════════
 * λ(D)：按 L 表分段线性映射，L1 起点 = 0，L9 终点 = 9
 *        每档恰好占 1.0 的 λ 宽度 → 等权
 *
 * 归一化：A_norm = λ / 9.2
 *        → 课内极限（L9 顶端）≈ 0.978，符合"0.96~0.98"
 *
 * 期望函数全在 λ 轴上：
 *   E(P|λ) = 1/(1 + e^{ k(λ − m)/s })
 *   s = (λ_U − λ_A)/2 + s0_λ
 *   m = λ_A − (s/k)·logit(1 − p_t)      → E(λ_A) = p_t
 *
 * ═══════════════════════════════════════════════════════════════
 * 用法：node scripts/normalize-a-lambda.mjs
 * ═══════════════════════════════════════════════════════════════
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tcb = path.join(ROOT, 'node_modules/.bin/tcb');
const ENV = process.env.TCB_ENV || 'cloud1-d8g0ty39wd73f430a';

// ── L 表（来自 doc/architecture/D难度标尺-L11分层.md）──
const L = [
  { L: 1, lo: 0.01, hi: 0.15 }, { L: 2, lo: 0.15, hi: 0.30 },
  { L: 3, lo: 0.30, hi: 0.45 }, { L: 4, lo: 0.45, hi: 0.60 },
  { L: 5, lo: 0.60, hi: 0.70 }, { L: 6, lo: 0.70, hi: 0.79 },
  { L: 7, lo: 0.79, hi: 0.85 }, { L: 8, lo: 0.85, hi: 0.90 },
  { L: 9, lo: 0.90, hi: 0.94 }, { L: 10, lo: 0.94, hi: 0.98 },
  { L: 11, lo: 0.98, hi: 0.999 },
];

/** D → λ（线性档位坐标；L1 起点 = 0） */
function toLambda(D) {
  const d = Math.max(0.01, Math.min(0.995, D));
  for (const x of L) {
    if (d >= x.lo && d < x.hi) return (x.L - 1) + (d - x.lo) / (x.hi - x.lo);
  }
  return 9; // D ≥ 0.94 → 归到 L9 顶端（课内口径）
}
/** λ → D（反映射） */
function toD(lambda) {
  const l = Math.max(0, Math.min(11, lambda));
  const idx = Math.min(L.length - 1, Math.floor(l));
  const x = L[idx];
  return x.lo + (l - idx) * (x.hi - x.lo);
}
const LAMBDA_MAX = 9;          // 课内：L1 起点 → L9 终点
const NORM_DENOM = 9.2;        // 归一化分母 → 课内极限 ≈ 0.978

function uw(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(uw);
  const ks = Object.keys(v);
  if (ks.length === 1) { const k = ks[0];
    if (/^\$(numberInt|numberLong|numberDouble)$/.test(k)) return Number(v[k]);
    if (k === '$oid' || k === '$date') return v[k]; }
  const o = {}; for (const k of ks) o[k] = uw(v[k]); return o;
}
function query(t, limit = 1000) {
  const p = [{ TableName: t, CommandType: 'QUERY', Command: JSON.stringify({ find: t, filter: {}, limit }) }];
  const raw = execFileSync(tcb, ['db', 'nosql', 'execute', '--json', '-e', ENV, '--command', JSON.stringify(p)],
    { cwd: ROOT, encoding: 'utf8', timeout: 300000, maxBuffer: 1e8 });
  const s = raw.indexOf('['), e = raw.lastIndexOf(']');
  const a = uw(JSON.parse(raw.slice(s, e + 1)));
  const f = Array.isArray(a) ? a[0] : null;
  return Array.isArray(f) ? f : (f && f.data) || [];
}
function simName(a, b) {
  a = String(a || '').trim(); b = String(b || '').trim();
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    const s = Math.min(a.length, b.length), l = Math.max(a.length, b.length);
    return Math.min(1, 0.6 + 0.4 * (s / l));
  }
  const sa = new Set(a), sb = new Set(b);
  let i = 0; for (const c of sa) if (sb.has(c)) i++;
  return (2 * i) / (sa.size + sb.size);
}
const nodes = query('knowledge_nodes');
const findNode = (nm) => {
  let b = null, bs = 0;
  for (const n of nodes) { const s = simName(nm, String(n.name || '')); if (s > bs) { bs = s; b = n; } }
  return bs >= 0.75 ? b : null;
};
const main = query('questions')
  .filter((x) => x.questionType === '解答' && x.processScore != null
    && x.difficultyValue != null && x.processAvailable !== false)
  .map((x) => {
    let unit = null;
    for (const it of (x.knowledgeUsage || [])) {
      const nm = String((it && it.name) || '').trim(); if (!nm) continue;
      const nd = findNode(nm);
      if (nd && Array.isArray(nd.path) && nd.path.length >= 3) { unit = nd.path[2]; break; }
    }
    return { D: Number(x.difficultyValue), P: Number(x.processScore), unit: unit || '?',
      t: x.createdAt ? new Date(x.createdAt.$date || x.createdAt).getTime() : 0 };
  })
  .sort((a, b) => a.t - b.t)
  .filter((q) => q.unit === '第一章 集合与常用逻辑用语');

const logit = (p) => Math.log(p / (1 - p));

console.log('='.repeat(92));
console.log('  A 的 λ 轴归一化（适配 D 的金字塔结构）');
console.log('='.repeat(92));

// ─────────── 一、D → λ → A_norm 映射表 ───────────
console.log('\n【一】D → λ → A_norm 映射（这就是新刻度）\n');
console.log('  D      │ λ      │ 档位           │ A_norm = λ/9.2 │ 旧刻度(D 值)');
console.log('  ' + '-'.repeat(74));
const LABEL = { 1: '送分', 2: '送分→简单', 3: '简单', 4: '中下', 5: '中档', 6: '中档→中上', 7: '中上', 8: '较难', 9: '较难→极难' };
for (const D of [0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.79, 0.85, 0.90, 0.94]) {
  const lam = toLambda(D);
  const an = lam / NORM_DENOM;
  console.log(`  ${D.toFixed(2)}   │ ${lam.toFixed(3)}  │ L${Math.floor(lam) + 1} ${(LABEL[Math.floor(lam) + 1] || '').padEnd(10)} │ ${an.toFixed(3)}          │ ${D.toFixed(3)}`);
}
console.log(`\n  → 每档恰好占 Δλ = 1.0（等权）✅`);
console.log(`  → 课内极限 D=0.94（L9 顶端）→ A_norm = ${(9 / NORM_DENOM).toFixed(3)} ✅ 落在 0.96~0.98`);

// ─────────── 二、期望函数（λ 轴）───────────
function makeEngine(cfg) {
  const { k = 3, s0 = 0.35, p_t = 0.80, alpha = 0.1, delta_d = 0.03, k_low = 3,
          lamA0 = toLambda(0.30), lamU0 = toLambda(0.50), P_c = 0.6, a_u = 0.75 } = cfg;
  let lamA = lamA0, lamU = lamU0, nLow = 0;
  const trace = [];
  const expect = (lamD, lamA, lamU) => {
    const s = (lamU - lamA) / 2 + s0;
    const m = lamA - (s / k) * logit(1 - p_t);
    return 1 / (1 + Math.exp(k * (lamD - m) / s));
  };
  return {
    get lamA() { return lamA; }, get lamU() { return lamU; },
    get A() { return lamA / NORM_DENOM; }, get U() { return lamU / NORM_DENOM; },
    get trace() { return trace; }, get expect() { return expect; },
    step(q) {
      const lamD = toLambda(q.D);
      const { P } = q;
      const E = expect(lamD, lamA, lamU);
      const su = P - E;
      lamA = lamA + alpha * su;
      if (lamA > lamU) lamA = lamU; if (lamA < 0) lamA = 0;
      let act = '';
      // U 抬升：D > U（在 λ 轴）且 P ≥ P_c → λ_U ← max(λ_U, λ(D·g(P)))
      const UD = toD(lamU); // 当前 U 对应的 D
      if (q.D > UD && P >= P_c) {
        const g = a_u + (1 - a_u) * ((P - P_c) / (1 - P_c));
        const cand = toLambda(Math.min(0.94, q.D * g));
        if (cand > lamU) { lamU = cand; act = 'U↑'; }
        nLow = 0;
      } else if (q.D < toD(lamA) && P < P_c) {
        nLow++;
        if (nLow >= k_low) { lamU = Math.max(lamA, lamU - delta_d * (lamU - lamA)); nLow = 0; act = 'U↓'; }
        else act = `累计${nLow}/3`;
      } else nLow = 0;
      trace.push({ D: q.D, P, lamD, E, su, lamA, lamU, A: lamA / NORM_DENOM, U: lamU / NORM_DENOM, act });
    },
  };
}

const BASE = { k: 3, s0: 0.35, p_t: 0.80, alpha: 0.9, delta_d: 0.03, k_low: 3, P_c: 0.6, a_u: 0.75 };

// ─────────── 三、四判据 ───────────
console.log('\n' + '='.repeat(92));
console.log('  【二】四判据检验');
console.log('='.repeat(92));

// 判据 1：E(λ_A) 恒定
console.log('\n  判据 1：E(λ_A) 是否恒定 = p_t（不管 gap 多大）\n');
console.log('    gap(λ)  │ E(λ_A)  →  期望值（应恒为 0.8）');
console.log('    ' + '-'.repeat(44));
for (const gapLam of [0.5, 1.0, 2.0, 3.0, 5.0]) {
  const lamA = 4.0, lamU = lamA + gapLam;
  const e = makeEngine({ ...BASE, lamA0: lamA, lamU0: lamU });
  const E = e.expect(lamA, lamA, lamU);
  console.log(`    ${gapLam.toFixed(1)}     │ ${E.toFixed(4)}  ${Math.abs(E - 0.8) < 1e-6 ? '✅' : '❌'}`);
}

// 判据 2：①区不动性
console.log('\n  判据 2：①区不动性 —— 8 道简单题（D=0.25, P=0.90）后 A 的漂移\n');
console.log('    起点 A_norm=0.30  →  终点       漂移      判定');
console.log('    ' + '-'.repeat(56));
{
  let lamA = toLambda(0.30), lamU = toLambda(0.50);
  const e = makeEngine({ ...BASE, lamA0: lamA, lamU0: lamU });
  const A0 = lamA / NORM_DENOM;
  for (let i = 0; i < 8; i++) {
    const E = e.expect(toLambda(0.25), lamA, lamU);
    lamA = lamA + BASE.alpha * (0.90 - E);
    if (lamA > lamU) lamA = lamU;
  }
  const d = lamA / NORM_DENOM - A0;
  console.log(`    ${A0.toFixed(4)}          →  ${(lamA / NORM_DENOM).toFixed(4)}     ${((d >= 0 ? '+' : '') + d.toFixed(4)).padEnd(10)} ${Math.abs(d) < 0.05 ? '✅ 不动' : '❌ 被刷'}`);
}

// 判据 3：五情况
console.log('\n  判据 3：五情况行为（A_norm=0.5 → λ_A=4.6, U_norm=0.75 → λ_U=6.9）\n');
console.log('    情况                      惊讶度     ΔA       判定');
console.log('    ' + '-'.repeat(58));
{
  const lamA = 0.5 * NORM_DENOM, lamU = 0.75 * NORM_DENOM;
  const e = makeEngine({ ...BASE, lamA0: lamA, lamU0: lamU });
  const cases = [
    ['① D<A, P高（应忽略）', 0.30, 0.90, 'flat'],
    ['② D<A, P低（应降A）', 0.30, 0.20, 'down'],
    ['③ A≤D≤U, P高（应涨A）', 0.75, 0.90, 'up'],
    ['③′ A≤D≤U, P低（应降A）', 0.75, 0.25, 'down'],
    ['④ D>U, P高（突破）', 0.90, 0.90, 'up'],
    ['⑤ D>U, P低（应忽略）', 0.90, 0.20, 'flat'],
  ];
  for (const [name, D, P, want] of cases) {
    const E = e.expect(toLambda(D), lamA, lamU);
    const su = P - E, dA = 0.1 * su;
    const ok = want === 'flat' ? Math.abs(dA) < 0.30 : want === 'up' ? dA > 0.30 : dA < -0.30;  // 阈值单位 λ
    console.log(`    ${name.padEnd(26)} ${(su >= 0 ? '+' : '') + su.toFixed(3)}    ${((dA >= 0 ? '+' : '') + dA.toFixed(3)).padEnd(9)} ${ok ? '✅' : '❌'}`);
  }
}

// 判据 4：U 是否在期望里起作用
console.log('\n  判据 4：U 是否在期望里起作用（同 λ_A=4.6，λ_U 分别 5.1 / 8.3）\n');
console.log('    D=0.62 期望(甲/乙)   差异   │ D=0.79 期望(甲/乙)   差异');
console.log('    ' + '-'.repeat(60));
{
  const lamA = 4.6;
  const e1 = makeEngine({ ...BASE, lamA0: lamA, lamU0: 5.1 });
  const e2 = makeEngine({ ...BASE, lamA0: lamA, lamU0: 8.3 });
  const r1 = [e1.expect(toLambda(0.62), lamA, 5.1), e2.expect(toLambda(0.62), lamA, 8.3)];
  const r2 = [e1.expect(toLambda(0.79), lamA, 5.1), e2.expect(toLambda(0.79), lamA, 8.3)];
  const d1 = Math.abs(r1[0] - r1[1]), d2 = Math.abs(r2[0] - r2[1]);
  console.log(`    ${r1[0].toFixed(3)}/${r1[1].toFixed(3)}        ${d1.toFixed(3)} ${d1 > 0.05 ? '✅' : '❌'} │ ${r2[0].toFixed(3)}/${r2[1].toFixed(3)}        ${d2.toFixed(3)} ${d2 > 0.05 ? '✅' : '❌'}`);
}

// ─────────── 四、真实数据 ───────────
console.log('\n' + '='.repeat(92));
console.log('  【三】真实 17 题轨迹');
console.log('='.repeat(92));
const eng = makeEngine(BASE);
console.log('\n  #   D     λ_D    P     E(期望)  惊讶度  λ_A    λ_U    A_norm U_norm 动作');
console.log('  ' + '-'.repeat(82));
main.forEach((q, i) => {
  eng.step(q);
  const t = eng.trace[i];
  console.log(`  ${String(i + 1).padStart(2)}  ${t.D.toFixed(2)}  ${t.lamD.toFixed(2)}  ${t.P.toFixed(2)}  ${t.E.toFixed(3)}   ${(t.su >= 0 ? '+' : '') + t.su.toFixed(3)}  ${t.lamA.toFixed(2)}  ${t.lamU.toFixed(2)}  ${t.A.toFixed(3)}  ${t.U.toFixed(3)}  ${t.act}`);
});
console.log('  ' + '-'.repeat(82));
const last = eng.trace[eng.trace.length - 1];
console.log(`  期末：λ_A=${last.lamA.toFixed(3)}  λ_U=${last.lamU.toFixed(3)}`);
console.log(`        A_norm=${last.A.toFixed(3)}  U_norm=${last.U.toFixed(3)}  gap=${(last.U - last.A).toFixed(3)}  A/U=${(last.A / last.U).toFixed(3)}`);
console.log(`  A 对应的档位：λ_A=${last.lamA.toFixed(2)} → L${Math.floor(last.lamA) + 1} ${LABEL[Math.floor(last.lamA) + 1] || ''} 内 ${((last.lamA % 1) * 100).toFixed(0)}%`);
console.log(`  面向学生：「这个单元，你能稳定做到 L${Math.floor(last.lamA) + 1}（${LABEL[Math.floor(last.lamA) + 1]}）的题」`);

// ─────────── 五、参数扫描 ───────────
console.log('\n' + '='.repeat(92));
console.log('  【四】参数扫描（s0 是 λ 轴的，量级和 D 轴不同）');
console.log('='.repeat(92));
console.log('\n  s0(λ)  │ A_norm U_norm gap    │ E(λ_A) │ ①区漂移');
console.log('  ' + '-'.repeat(58));
for (const s0 of [0.15, 0.25, 0.35, 0.50, 0.70]) {
  const e = makeEngine({ ...BASE, s0 });
  for (const q of main) e.step(q);
  let la = toLambda(0.30), lu = toLambda(0.50);
  const ee = makeEngine({ ...BASE, s0, lamA0: la, lamU0: lu });
  for (let i = 0; i < 8; i++) { la = la + BASE.alpha * (0.90 - ee.expect(toLambda(0.25), la, lu)); if (la > lu) la = lu; }
  const drift = la / NORM_DENOM - toLambda(0.30) / NORM_DENOM;
  const EA = e.expect(e.trace[e.trace.length - 1].lamA, e.trace[e.trace.length - 1].lamA, e.trace[e.trace.length - 1].lamU);
  console.log(`  ${s0.toFixed(2)}   │ ${e.A.toFixed(3)}  ${e.U.toFixed(3)}  ${(e.U - e.A).toFixed(3)}  │ ${EA.toFixed(3)}  │ ${((drift >= 0 ? '+' : '') + drift.toFixed(4))} ${Math.abs(drift) < 0.05 ? '✅' : '⚠️'}`);
}
console.log('\n  k      │ A_norm U_norm gap    │ ①区漂移');
console.log('  ' + '-'.repeat(48));
for (const k of [1.5, 2, 3, 4, 6]) {
  const e = makeEngine({ ...BASE, k });
  for (const q of main) e.step(q);
  let la = toLambda(0.30), lu = toLambda(0.50);
  const ee = makeEngine({ ...BASE, k, lamA0: la, lamU0: lu });
  for (let i = 0; i < 8; i++) { la = la + BASE.alpha * (0.90 - ee.expect(toLambda(0.25), la, lu)); if (la > lu) la = lu; }
  const drift = la / NORM_DENOM - toLambda(0.30) / NORM_DENOM;
  console.log(`  ${k.toFixed(1)}    │ ${e.A.toFixed(3)}  ${e.U.toFixed(3)}  ${(e.U - e.A).toFixed(3)}  │ ${((drift >= 0 ? '+' : '') + drift.toFixed(4))} ${Math.abs(drift) < 0.05 ? '✅' : '⚠️'}`);
}
console.log('\n  p_t    │ A_norm U_norm gap    │ E(λ_A) │ ①区漂移');
console.log('  ' + '-'.repeat(52));
for (const p_t of [0.70, 0.75, 0.80, 0.85, 0.90]) {
  const e = makeEngine({ ...BASE, p_t });
  for (const q of main) e.step(q);
  let la = toLambda(0.30), lu = toLambda(0.50);
  const ee = makeEngine({ ...BASE, p_t, lamA0: la, lamU0: lu });
  for (let i = 0; i < 8; i++) { la = la + BASE.alpha * (0.90 - ee.expect(toLambda(0.25), la, lu)); if (la > lu) la = lu; }
  const drift = la / NORM_DENOM - toLambda(0.30) / NORM_DENOM;
  const EA = e.expect(e.trace[e.trace.length - 1].lamA, e.trace[e.trace.length - 1].lamA, e.trace[e.trace.length - 1].lamU);
  console.log(`  ${p_t.toFixed(2)}   │ ${e.A.toFixed(3)}  ${e.U.toFixed(3)}  ${(e.U - e.A).toFixed(3)}  │ ${EA.toFixed(3)}  │ ${((drift >= 0 ? '+' : '') + drift.toFixed(4))} ${Math.abs(drift) < 0.05 ? '✅' : '⚠️'}`);
}

console.log('\n  alpha  │ A_norm U_norm gap    │ ①区漂移');
console.log('  ' + '-'.repeat(48));
for (const alpha of [0.3, 0.5, 0.7, 0.9, 1.2]) {
  const e = makeEngine({ ...BASE, alpha });
  for (const q of main) e.step(q);
  let la = toLambda(0.30), lu = toLambda(0.50);
  const ee = makeEngine({ ...BASE, alpha, lamA0: la, lamU0: lu });
  for (let i = 0; i < 8; i++) { la = la + alpha * (0.90 - ee.expect(toLambda(0.25), la, lu)); if (la > lu) la = lu; }
  const drift = la / NORM_DENOM - toLambda(0.30) / NORM_DENOM;
  console.log(`  ${alpha.toFixed(1)}    │ ${e.A.toFixed(3)}  ${e.U.toFixed(3)}  ${(e.U - e.A).toFixed(3)}  │ ${((drift >= 0 ? '+' : '') + drift.toFixed(4))} ${Math.abs(drift) < 0.05 ? '✅' : '⚠️'}`);
}

fs.mkdirSync(path.join(ROOT, 'output/a-fit'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'output/a-fit/lambda-norm.json'), JSON.stringify({
  generatedAt: new Date().toISOString(), base: BASE, normDenom: NORM_DENOM, n: main.length,
  final: { lamA: last.lamA, lamU: last.lamU, A: last.A, U: last.U },
  trace: eng.trace.map((t) => ({ D: t.D, lamD: +t.lamD.toFixed(3), P: t.P, E: +t.E.toFixed(4), lamA: +t.lamA.toFixed(4), lamU: +t.lamU.toFixed(4), act: t.act })),
}, null, 1));
console.log('\n  落盘：output/a-fit/lambda-norm.json');
