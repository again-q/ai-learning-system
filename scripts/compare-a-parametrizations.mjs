#!/usr/bin/env node
/**
 * A 的参数化方案对比：哪一种能真正反映"A 是有把握做到的难度"
 *
 * 背景（用户 2026-10-06）：
 *   "在这个难度下有一定把握做出来，不然我为什么 U 要用过程去压难度呢?"
 *   → U = D×g(P) 里，g(P) 就是"把握度"的体现
 *   → A 也该是"有一定把握"的难度，只是把握度低于 U
 *
 * 三种参数化：
 *   P1：m = (A+U)/2          （中点；现行）→ E(A) 随 gap 漂移
 *   P2：m = A − (s/k)·logit  （由 p_t 反解）→ E(A) 恒定 = p_t
 *   P3：锚点在 A，s 固定    （E(D)=σ((A−D)/s + b)）→ E(A) 恒定，但 U 不进期望
 *
 * 检验判据（四条，全部来自用户设计）：
 *   判据 1：E(A) 是否稳定在"有把握"区间（0.75~0.90）
 *   判据 2：①区不动性 —— 简单题做对，A 的漂移 |ΔA| < 0.02
 *   判据 3：五情况行为符合设计（①忽略/②降/③涨/③′降/④突破/⑤忽略）
 *   判据 4：U 是否仍在期望里起作用（同 A 不同 U → 期望不同）
 *
 * 用法：node scripts/compare-a-parametrizations.mjs
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

const logit = (p) => Math.log(p / (1 - p));

// ══════════════════════════════════════════════════════════
// 三种期望函数
// ══════════════════════════════════════════════════════════
function expectOf(scheme, cfg) {
  const { k, s0, p_t } = cfg;
  if (scheme === 'P1') {
    // 中点式（现行）
    return (D, A, U) => {
      const m = (A + U) / 2;
      const s = (U - A) / 2 + s0;
      return 1 / (1 + Math.exp(k * (D - m) / s));
    };
  }
  if (scheme === 'P2') {
    // 由 p_t 反解 m：E(A) = p_t  →  k(A−m)/s = logit(1−p_t)  →  m = A − (s/k)·logit(1−p_t)
    return (D, A, U) => {
      const s = (U - A) / 2 + s0;
      const m = A - (s / k) * logit(1 - p_t);
      return 1 / (1 + Math.exp(k * (D - m) / s));
    };
  }
  // P3：锚在 A，U 只扩展宽度
  return (D, A, U) => {
    const s = (U - A) / 2 + s0;
    return 1 / (1 + Math.exp(k * (D - A) / s));
  };
}

function makeEngine(scheme, cfg) {
  const { alpha = 0.1, delta_d = 0.03, k_low = 3, A0 = 0.30, U0 = 0.50,
          P_c = 0.6, a_u = 0.75 } = cfg;
  let A = A0, U = U0, nLow = 0;
  const expect = expectOf(scheme, cfg);
  const trace = [];
  return {
    get A() { return A; }, get U() { return U; }, get trace() { return trace; }, get E() { return expect; },
    step(q) {
      const { D, P } = q;
      const E = expect(D, A, U);
      const su = P - E;
      A = A + alpha * su;
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
      trace.push({ D, P, E, su, A, U, act });
    },
  };
}

const BASE = { k: 3, s0: 0.10, p_t: 0.80, alpha: 0.1, delta_d: 0.03, k_low: 3, A0: 0.30, U0: 0.50, P_c: 0.6, a_u: 0.75 };

console.log('='.repeat(90));
console.log('  A 的参数化方案对比（判据全部来自用户设计）');
console.log('='.repeat(90));

// ─────────── 判据 1：E(A) 稳定性 ───────────
console.log('\n【判据 1】E(A) 是否稳定在"有把握"区间（0.75~0.90）\n');
console.log('  方案   gap=0.05   gap=0.10   gap=0.13   gap=0.20   gap=0.30   稳定性');
console.log('  ' + '-'.repeat(84));
for (const scheme of ['P1', 'P2', 'P3']) {
  const row = [];
  for (const gap of [0.05, 0.10, 0.13, 0.20, 0.30]) {
    const A = 0.80 - gap, U = 0.80;
    const E = expectOf(scheme, BASE)(A, A, U);
    row.push(E);
  }
  const spread = Math.max(...row) - Math.min(...row);
  const ok = spread < 0.05 ? '✅ 恒定' : `⚠️ 漂移 ${spread.toFixed(3)}`;
  console.log(`  ${scheme}    ` + row.map((x) => x.toFixed(3).padEnd(10)).join(' ') + ' ' + ok);
}

// ─────────── 判据 2：①区不动性 ───────────
console.log('\n【判据 2】①区不动性 —— 8 道简单题（D=0.25, P=0.90）后 A 的漂移\n');
console.log('  方案   │ 起点 A=0.30,U=0.50 │ 终点 A  │ 漂移     判定');
console.log('  ' + '-'.repeat(66));
for (const scheme of ['P1', 'P2', 'P3']) {
  let A = 0.30, U = 0.50;
  const expect = expectOf(scheme, BASE);
  for (let i = 0; i < 8; i++) {
    const E = expect(0.25, A, U);
    A = A + 0.1 * (0.90 - E);
    if (A > U) A = U;
  }
  const d = A - 0.30;
  console.log(`  ${scheme}     │                    │ ${A.toFixed(4)}  │ ${((d >= 0 ? '+' : '') + d.toFixed(4)).padEnd(9)} ${Math.abs(d) < 0.02 ? '✅ 不动' : '❌ 被刷'}`);
}

// ─────────── 判据 3：五情况行为 ───────────
console.log('\n【判据 3】五情况行为（A=0.50, U=0.75）\n');
console.log('  方案  ①忽略     ②降A      ③涨A      ③′降A     ④突破     ⑤忽略');
console.log('  ' + '-'.repeat(76));
for (const scheme of ['P1', 'P2', 'P3']) {
  const expect = expectOf(scheme, BASE);
  const A = 0.50, U = 0.75;
  const cases = [[0.30, 0.90, 'flat'], [0.30, 0.20, 'down'], [0.60, 0.90, 'up'],
                 [0.60, 0.25, 'down'], [0.87, 0.90, 'up'], [0.87, 0.20, 'flat']];
  const cells = cases.map(([D, P, want]) => {
    const dA = 0.1 * (P - expect(D, A, U));
    const ok = want === 'flat' ? Math.abs(dA) < 0.03 : want === 'up' ? dA > 0.02 : dA < -0.02;
    return (ok ? '✅' : '❌') + dA.toFixed(3).padStart(8);
  });
  console.log(`  ${scheme}   ` + cells.join(' '));
}

// ─────────── 判据 4：U 是否在期望里起作用 ───────────
console.log('\n【判据 4】U 是否在期望里起作用（同 A=0.50，分别 U=0.55 / U=0.90）\n');
console.log('  方案   D=0.65 期望(甲/乙)   差异    │ D=0.75 期望(甲/乙)   差异');
console.log('  ' + '-'.repeat(72));
for (const scheme of ['P1', 'P2', 'P3']) {
  const expect = expectOf(scheme, BASE);
  const r1 = [expect(0.65, 0.50, 0.55), expect(0.65, 0.50, 0.90)];
  const r2 = [expect(0.75, 0.50, 0.55), expect(0.75, 0.50, 0.90)];
  const d1 = Math.abs(r1[0] - r1[1]), d2 = Math.abs(r2[0] - r2[1]);
  console.log(`  ${scheme}   ${r1[0].toFixed(3)}/${r1[1].toFixed(3)}       ${d1.toFixed(3)} ${d1 > 0.05 ? '✅' : '❌'}  │ ${r2[0].toFixed(3)}/${r2[1].toFixed(3)}       ${d2.toFixed(3)} ${d2 > 0.05 ? '✅' : '❌'}`);
}

// ─────────── 真实数据轨迹 ───────────
console.log('\n' + '='.repeat(90));
console.log('  真实 17 题轨迹');
console.log('='.repeat(90));
console.log('\n  方案  │ A末    U末    gap    A/U   │ E(A末)  │ 动作');
console.log('  ' + '-'.repeat(70));
const runs = {};
for (const scheme of ['P1', 'P2', 'P3']) {
  const e = makeEngine(scheme, BASE);
  for (const q of main) e.step(q);
  runs[scheme] = e;
  const EA = e.E(e.A, e.A, e.U);
  const acts = e.trace.filter((t) => t.act).map((t) => t.act).join(',') || '无';
  console.log(`  ${scheme}    │ ${e.A.toFixed(3)}  ${e.U.toFixed(3)}  ${(e.U - e.A).toFixed(3)}  ${(e.A / e.U).toFixed(2)}  │ ${EA.toFixed(3)}   │ ${acts}`);
}

console.log('\n  P2 逐题（p_t=0.80）：\n');
console.log('  #   D     P     E(期望)  惊讶度   A      U      gap   E(A)   动作');
console.log('  ' + '-'.repeat(78));
runs.P2.trace.forEach((t, i) => {
  const EA = runs.P2.E(t.A, t.A, t.U);
  console.log(`  ${String(i + 1).padStart(2)}  ${t.D.toFixed(2)}  ${t.P.toFixed(2)}  ${t.E.toFixed(3)}   ${(t.su >= 0 ? '+' : '') + t.su.toFixed(3)}   ${t.A.toFixed(3)}  ${t.U.toFixed(3)}  ${(t.U - t.A).toFixed(3)}  ${EA.toFixed(3)}  ${t.act}`);
});

// ─────────── p_t 扫描（P2） ───────────
console.log('\n' + '='.repeat(90));
console.log('  P2 的 p_t 扫描');
console.log('='.repeat(90));
console.log('\n  p_t   │ A末    U末    gap    A/U   │ E(A末)  │ ①区不动性');
console.log('  ' + '-'.repeat(66));
for (const p_t of [0.70, 0.75, 0.80, 0.85, 0.90]) {
  const e = makeEngine('P2', { ...BASE, p_t });
  for (const q of main) e.step(q);
  let At = 0.30, Ut = 0.50;
  const expect = expectOf('P2', { ...BASE, p_t });
  for (let i = 0; i < 8; i++) { At = At + 0.1 * (0.90 - expect(0.25, At, Ut)); if (At > Ut) At = Ut; }
  const drift = At - 0.30;
  const EA = e.E(e.A, e.A, e.U);
  console.log(`  ${p_t.toFixed(2)}  │ ${e.A.toFixed(3)}  ${e.U.toFixed(3)}  ${(e.U - e.A).toFixed(3)}  ${(e.A / e.U).toFixed(2)}  │ ${EA.toFixed(3)}   │ ${((drift >= 0 ? '+' : '') + drift.toFixed(4))} ${Math.abs(drift) < 0.02 ? '✅' : '⚠️'}`);
}

fs.mkdirSync(path.join(ROOT, 'output/a-fit'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'output/a-fit/parametrization-compare.json'), JSON.stringify({
  generatedAt: new Date().toISOString(), base: BASE, n: main.length,
  final: Object.fromEntries(Object.entries(runs).map(([k, e]) => [k, { A: e.A, U: e.U, EA: e.E(e.A, e.A, e.U) }])),
  p2trace: runs.P2.trace.map((t) => ({ D: t.D, P: t.P, E: +t.E.toFixed(4), A: +t.A.toFixed(4), U: +t.U.toFixed(4), act: t.act })),
}, null, 1));
console.log('\n  落盘：output/a-fit/parametrization-compare.json');
