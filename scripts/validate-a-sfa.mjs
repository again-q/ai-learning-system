#!/usr/bin/env node
/**
 * 决策 063 · 算子定稿验证（SFA / V4 版）
 *
 * 理论定位（用户 2026-10-06 定的基石）：
 *   U = 能力前沿（真实能力 / 最大表现）      ← 随机前沿分析里的 f(x)
 *   A = 实际发挥（典型表现）                  ← 实际产出 y
 *   A ≤ U 结构性成立（发挥总有损失，单边误差 u ≥ 0）
 *   [A, U] = 余量区间
 *
 * 公式：
 *   E(P|D) = 1 / (1 + e^{ k(D−m)/s }),  m=(A+U)/2,  s=(U−A)/2 + s₀
 *   A ← A + α(P − E),  约束 0 ≤ A ≤ U
 *   U: ④ D>U 且 P≥P_c → U ← max(U, D·g(P))
 *      ② D<A 且 P<P_c 累计 3 次 → U ← U − δ_d(U−A)
 *
 * 四个检验：
 *   检验 A：SFA 结构是否成立（A ≤ U、余量区间非负）
 *   检验 B：①区是否真的被忽略（简单题做对不涨 A）
 *   检验 C：五情况行为是否与用户设计一致
 *   检验 D：真实 17 题轨迹 + 参数扫描
 *
 * 用法：node scripts/validate-a-sfa.mjs
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tcb = path.join(ROOT, 'node_modules/.bin/tcb');
const ENV = process.env.TCB_ENV || 'cloud1-d8g0ty39wd73f430a';

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

const BASE = { k: 3, s0: 0.08, alpha: 0.1, delta_d: 0.03, k_low: 3, A0: 0.30, U0: 0.50, P_c: 0.6, a_u: 0.75 };

function makeEngine(cfg) {
  const { k, s0, alpha, delta_d, k_low, A0, U0, P_c, a_u } = cfg;
  let A = A0, U = U0, nLow = 0;
  const trace = [];
  const expect = (D, a, u) => {
    const m = (a + u) / 2;
    const s = (u - a) / 2 + s0;
    return 1 / (1 + Math.exp(k * (D - m) / s));
  };
  return {
    get A() { return A; }, get U() { return U; }, get trace() { return trace; },
    step(q) {
      const { D, P } = q;
      const E = expect(D, A, U);
      const surprise = P - E;
      A = A + alpha * surprise;
      if (A > U) A = U; if (A < 0) A = 0;
      let act = '';
      if (D > U && P >= P_c) {
        const g = a_u + (1 - a_u) * ((P - P_c) / (1 - P_c));
        const c = D * g; if (c > U) { U = c; act = 'U↑'; }
        nLow = 0;
      } else if (D < A && P < P_c) {
        nLow++;
        if (nLow >= k_low) { U = Math.max(A, U - delta_d * (U - A)); nLow = 0; act = 'U↓'; }
        else act = `累计${nLow}/3`;
      } else nLow = 0;
      trace.push({ D, P, E, surprise, A, U, act });
    },
  };
}

console.log('='.repeat(88));
console.log('  决策 063 · 算子定稿验证（SFA 版：U=前沿，A=实际发挥）');
console.log('='.repeat(88));

// ══════════════════════════════════════════
console.log('\n【检验 A】SFA 结构是否成立');
console.log('═'.repeat(88));
console.log('\n  SFA 要求：A ≤ U 恒成立（实际发挥不超过前沿）');
console.log('  本引擎在代码里显式钳制 A ≤ U，验证其在 17 题上从未被触发或触发后收敛：\n');
{
  const e = makeEngine(BASE);
  let clamped = 0, maxGap = 0;
  for (const q of main) {
    e.step(q);
    const t = e.trace[e.trace.length - 1];
    const gap = t.U - t.A;
    if (gap < 1e-9) clamped++;
    maxGap = Math.max(maxGap, gap);
  }
  console.log(`  末态：A=${e.A.toFixed(3)}  U=${e.U.toFixed(3)}  余量=${(e.U - e.A).toFixed(3)}`);
  console.log(`  A 贴住 U 的次数：${clamped}/${main.length}`);
  console.log(`  → ${clamped === 0 ? '余量始终为正 ✅ 结构性成立' : '有余量归零的时刻（说明 A 追上了前沿）'}`);
}

// ══════════════════════════════════════════
console.log('\n【检验 B】①区是否真的被忽略（简单题做对不涨 A）');
console.log('═'.repeat(88));
console.log('\n  场景：8 道简单题（D=0.25），学生 A=0.30、U=0.50，每次 P=0.90');
console.log('  用户设计：① = 忽略 → A 不该被刷高\n');
{
  function simulate(A0, U0, D, P, n, s0) {
    let A = A0, U = U0;
    const es = [];
    for (let i = 0; i < n; i++) {
      const m = (A + U) / 2, s = (U - A) / 2 + s0;
      const E = 1 / (1 + Math.exp(3 * (D - m) / s));
      A = A + 0.1 * (P - E);
      if (A > U) A = U;
      es.push({ E, A });
    }
    return es;
  }
  console.log('  题次 │ 期望 E   │ A        │ 相对起点变化');
  console.log('  ' + '-'.repeat(48));
  const es = simulate(0.30, 0.50, 0.25, 0.90, 8, 0.08);
  es.forEach((x, i) => {
    if (i < 3 || i === 7) console.log(`   ${String(i + 1).padStart(2)}  │ ${x.E.toFixed(3)}   │ ${x.A.toFixed(4)}  │ ${((x.A - 0.30) >= 0 ? '+' : '') + (x.A - 0.30).toFixed(4)}`);
  });
  const drift = es[7].A - 0.30;
  console.log(`\n  → 8 道简单题后 A 的变化：${(drift >= 0 ? '+' : '') + drift.toFixed(4)}  ${Math.abs(drift) < 0.02 ? '✅ 基本不动（①区生效）' : '⚠️ 有漂移'}`);
}

// ══════════════════════════════════════════
console.log('\n【检验 C】五情况行为是否与设计一致');
console.log('═'.repeat(88));
console.log('\n  构造典型场景，看惊讶度符号是否符合设计：\n');
{
  const A = 0.50, U = 0.75, s0 = 0.08, k = 3;
  const E = (D) => { const m = (A + U) / 2, s = (U - A) / 2 + s0; return 1 / (1 + Math.exp(k * (D - m) / s)); };
  const cases = [
    ['① D<A, P高（应忽略）', 0.30, 0.90],
    ['② D<A, P低（应降A）', 0.30, 0.20],
    ['③ A≤D≤U, P高（应涨A）', 0.60, 0.90],
    ['③′ A≤D≤U, P低（应降A）', 0.60, 0.25],
    ['④ D>U, P高（突破）', 0.87, 0.90],
    ['⑤ D>U, P低（应忽略）', 0.87, 0.20],
  ];
  console.log('  情况                      D     P     E(期望)  惊讶度   A 变化   符合设计？');
  console.log('  ' + '-'.repeat(80));
  for (const [name, D, P] of cases) {
    const e = E(D); const s = P - e; const dA = 0.1 * s;
    let ok;
    if (name.startsWith('①')) ok = Math.abs(dA) < 0.02;
    else if (name.startsWith('②')) ok = dA < -0.02;
    else if (name.startsWith('③ ')) ok = dA > 0.02;
    else if (name.startsWith('③′')) ok = dA < -0.02;
    else if (name.startsWith('④')) ok = dA > 0.02;
    else ok = Math.abs(dA) < 0.02;
    console.log(`  ${name.padEnd(24)} ${D.toFixed(2)}  ${P.toFixed(2)}  ${e.toFixed(3)}   ${(s >= 0 ? '+' : '') + s.toFixed(3)}   ${(dA >= 0 ? '+' : '') + dA.toFixed(4)}  ${ok ? '✅' : '❌'}`);
  }
}

// ══════════════════════════════════════════
console.log('\n【检验 D】真实 17 题轨迹');
console.log('═'.repeat(88));
console.log('\n  #   D     P     E(期望)  惊讶度   A      U      余量   动作');
console.log('  ' + '-'.repeat(74));
const e0 = makeEngine(BASE);
main.forEach((q, i) => {
  e0.step(q);
  const t = e0.trace[i];
  console.log(`  ${String(i + 1).padStart(2)}  ${t.D.toFixed(2)}  ${t.P.toFixed(2)}  ${t.E.toFixed(3)}   ${(t.surprise >= 0 ? '+' : '') + t.surprise.toFixed(3)}   ${t.A.toFixed(3)}  ${t.U.toFixed(3)}  ${(t.U - t.A).toFixed(3)}  ${t.act}`);
});
console.log('  ' + '-'.repeat(74));
console.log(`  期末 A=${e0.A.toFixed(3)}  U=${e0.U.toFixed(3)}  余量=${(e0.U - e0.A).toFixed(3)}`);

// 参数扫描
console.log('\n' + '='.repeat(88));
console.log('  参数扫描');
console.log('='.repeat(88));
for (const [label, key, vals] of [
  ['s₀（状态噪声下限）', 's0', [0.02, 0.05, 0.08, 0.12, 0.20]],
  ['k（陡峭度）', 'k', [2, 3, 4, 6]],
  ['alpha（A 步长）', 'alpha', [0.05, 0.1, 0.2, 0.3]],
  ['A₀（A 起点）', 'A0', [0.20, 0.30, 0.40, 0.50]],
  ['U₀（U 起点）', 'U0', [0.50, 0.60, 0.70]],
]) {
  console.log(`\n  ${label}`);
  console.log('    取值  │ A末    U末    余量   │ ①区不动性');
  console.log('    ' + '-'.repeat(52));
  for (const v of vals) {
    const e = makeEngine({ ...BASE, [key]: v });
    for (const q of main) e.step(q);
    // 简单题不动性：用该参数跑 8 道简单题
    let At = BASE.A0, Ut = v && key === 'U0' ? v : BASE.U0;
    const A00 = key === 'A0' ? v : BASE.A0;
    At = A00; Ut = key === 'U0' ? v : BASE.U0;
    for (let i = 0; i < 8; i++) {
      const m = (At + Ut) / 2, s = (Ut - At) / 2 + (key === 's0' ? v : BASE.s0);
      const E = 1 / (1 + Math.exp((key === 'k' ? v : BASE.k) * (0.25 - m) / s));
      At = At + (key === 'alpha' ? v : BASE.alpha) * (0.90 - E);
      if (At > Ut) At = Ut;
    }
    const drift = At - A00;
    console.log(`    ${String(v).padEnd(6)}│ ${e.A.toFixed(3)}  ${e.U.toFixed(3)}  ${(e.U - e.A).toFixed(3)}  │ ${(drift >= 0 ? '+' : '') + drift.toFixed(4)} ${Math.abs(drift) < 0.02 ? '✅' : '⚠️'}`);
  }
}

fs.mkdirSync(path.join(ROOT, 'output/a-fit'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'output/a-fit/sfa-final.json'), JSON.stringify({
  generatedAt: new Date().toISOString(), base: BASE, n: main.length,
  final: { A: e0.A, U: e0.U },
  trace: e0.trace.map((t) => ({ D: t.D, P: t.P, E: +t.E.toFixed(4), s: +t.surprise.toFixed(4), A: +t.A.toFixed(4), U: +t.U.toFixed(4), act: t.act })),
}, null, 1));
console.log('\n  落盘：output/a-fit/sfa-final.json');
