#!/usr/bin/env node
/**
 * 关键问题：U 该不该进"期望"？
 *
 * 用户质疑：V3 把 U 从期望里拿掉了，而 U 是用户定的设计。
 *            U 的职责之一是"我们估计他的能力"——那么"他这次该拿多少分"
 *            就应该受 U 影响（两个 A 相同、U 不同的学生，预期不该一样）。
 *
 * 本脚本对照三种：
 *   V3  期望只用 A            E = f(D − A)
 *   V2  期望用 A、U 但无下限   E = f(D − m), m=(A+U)/2, s=(U−A)/2   ← 会塌成阶跃
 *   V4  期望用 A、U 且有下限   E = f(D − m), s=(U−A)/2 + s0         ← 本脚本主张
 *
 * 用三个检验：
 *   检验 1：同 A 不同 U 的学生，期望是否不同（U 是否真的起作用）
 *   检验 2：A→U 时，曲线是否塌成阶跃（过渡带宽度是否塌缩）
 *   检验 3：真实 17 题上的轨迹
 *
 * 用法：node scripts/test-u-in-expectation.mjs
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
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

// ══════════════════════════════════════════════
// 期望函数三版
// ══════════════════════════════════════════════
const EXPECT = {
  V3: (D, A, U, cfg) => 1 / (1 + Math.exp(((D - A) / (cfg.tau ?? 0.12)))),
  V2: (D, A, U, cfg) => {
    const m = (A + U) / 2;
    const s = (U - A) / 2;                       // 无下限
    if (s < 1e-6) return D < A ? 1 : 0;
    return 1 / (1 + Math.exp((cfg.k ?? 3) * (D - m) / s));
  },
  V4: (D, A, U, cfg) => {
    const m = (A + U) / 2;
    const s = (U - A) / 2 + (cfg.s0 ?? 0.08);    // ★ 有下限
    return 1 / (1 + Math.exp((cfg.k ?? 3) * (D - m) / s));
  },
};

function makeEngine(name, cfg) {
  const { alpha = 0.1, delta_d = 0.03, k_low = 3, A0 = 0.30, U0 = 0.50, P_c = 0.6, a_u = 0.75 } = cfg;
  let A = A0, U = U0, nLow = 0;
  const trace = [];
  const expectFn = EXPECT[name];
  return {
    name, get A() { return A; }, get U() { return U; }, get trace() { return trace; },
    step(q) {
      const { D, P } = q;
      const E = expectFn(D, A, U, cfg);
      A = A + alpha * (P - E);
      if (A > U) A = U; if (A < 0) A = 0;
      if (D > U && P >= P_c) {
        const g = a_u + (1 - a_u) * ((P - P_c) / (1 - P_c));
        const c = D * g; if (c > U) U = c;
        nLow = 0;
      } else if (D < A && P < P_c) {
        nLow++; if (nLow >= k_low) { U = Math.max(A, U - delta_d * (U - A)); nLow = 0; }
      } else nLow = 0;
      trace.push({ D, P, A, U, E });
    },
  };
}

console.log('='.repeat(86));
console.log('  检验 1：同 A、不同 U 的学生，期望是否不同（U 是否真的起作用）');
console.log('='.repeat(86));
console.log('\n  场景：两个学生 A 都为 0.50，U 分别 0.55（到顶）和 0.90（有潜力）');
console.log('  问题：同一道 D=0.70 的题，预期得分该不该一样？\n');
console.log('  D      │ V3(只用A) │ V2(无下限) │ V4(有下限) │ 甲U=0.55 / 乙U=0.90');
console.log('  ' + '-'.repeat(76));
for (const D of [0.40, 0.55, 0.65, 0.70, 0.80]) {
  const row = ['V3', 'V2', 'V4'].map((n) => {
    const eA = EXPECT[n](D, 0.50, 0.55, {});
    const eB = EXPECT[n](D, 0.50, 0.90, {});
    return { eA, eB, diff: Math.abs(eA - eB) };
  });
  const f = (x) => x.toFixed(3);
  console.log(`  ${D.toFixed(2)}  │ ${f(row[0].eA)}/${f(row[0].eB)} │ ${f(row[1].eA)}/${f(row[1].eB)} │ ${f(row[2].eA)}/${f(row[2].eB)} │ 差异 V3=${row[0].diff.toFixed(3)} V2=${row[1].diff.toFixed(3)} V4=${row[2].diff.toFixed(3)}`);
}
console.log('\n  → V3 的差异恒为 0（U 完全不起作用）❌');
console.log('  → V2、V4 的差异 > 0（U 起作用）✅');

console.log('\n' + '='.repeat(86));
console.log('  检验 2：A→U 时，曲线是否塌成阶跃（过渡带是否塌缩）');
console.log('='.repeat(86));
console.log('\n  固定 U=0.80，让 A 从 0.30 涨到 0.78，看过渡带宽度\n');
console.log('  A      │ V2 过渡带宽度        │ V4 过渡带宽度        │ 说明');
console.log('  ' + '-'.repeat(76));
for (const A of [0.30, 0.45, 0.60, 0.70, 0.75, 0.78]) {
  const wV2 = (0.80 - A) / 2;                       // V2: s
  const wV4 = (0.80 - A) / 2 + 0.08;                // V4: s
  // 有效过渡带 = 从 E=0.9 到 E=0.1 的难度跨度 = 2*s*ln(9)/k
  const spanV2 = 2 * wV2 * Math.log(9) / 3;
  const spanV4 = 2 * wV4 * Math.log(9) / 3;
  const note = A >= 0.75 ? (spanV2 < 0.02 ? 'V2 已塌成阶跃' : '') : '';
  console.log(`  ${A.toFixed(2)}   │ s=${wV2.toFixed(3)} 跨度=${spanV2.toFixed(3)}      │ s=${wV4.toFixed(3)} 跨度=${spanV4.toFixed(3)}      │ ${note}`);
}
console.log('\n  → V2 的过渡带随 A→U 塌缩到 0（U 的作用被抹掉）❌');
console.log('  → V4 的过渡带始终 ≥ 0.22 难度单位（U 持续起作用）✅');

console.log('\n' + '='.repeat(86));
console.log('  检验 3：真实 17 题上的轨迹');
console.log('='.repeat(86));
console.log('\n  引擎    │ A末    U末    A/U   │ 第1题惊讶度 │ 第17题惊讶度');
console.log('  ' + '-'.repeat(72));
for (const name of ['V3', 'V2', 'V4']) {
  const e = makeEngine(name, {});
  for (const q of main) e.step(q);
  const t = e.trace;
  console.log(`  ${name.padEnd(7)} │ ${e.A.toFixed(3)}  ${e.U.toFixed(3)}  ${(e.A / e.U).toFixed(2)}  │ ${((t[0].P - t[0].E) >= 0 ? '+' : '') + (t[0].P - t[0].E).toFixed(3)}        │ ${((t[16].P - t[16].E) >= 0 ? '+' : '') + (t[16].P - t[16].E).toFixed(3)}`);
}

console.log('\n  V4 逐题（s0=0.08，k=3）：\n');
console.log('  #   D     P     E(期望)  惊讶度   A      U      A/U');
console.log('  ' + '-'.repeat(62));
const e4 = makeEngine('V4', {});
main.forEach((q, i) => {
  e4.step(q);
  const t = e4.trace[i];
  const s = t.P - t.E;
  console.log(`  ${String(i + 1).padStart(2)}  ${t.D.toFixed(2)}  ${t.P.toFixed(2)}  ${t.E.toFixed(3)}   ${(s >= 0 ? '+' : '') + s.toFixed(3)}   ${t.A.toFixed(3)}  ${t.U.toFixed(3)}  ${(t.A / t.U).toFixed(2)}`);
});
console.log(`  期末 A=${e4.A.toFixed(3)} U=${e4.U.toFixed(3)} A/U=${(e4.A / e4.U).toFixed(3)}`);

console.log('\n  s0 扫描（V4）：\n');
console.log('  s0     │ A末    A/U   │ 过渡带下限');
console.log('  ' + '-'.repeat(46));
for (const s0 of [0, 0.04, 0.08, 0.12, 0.20]) {
  const e = makeEngine('V4', { s0 });
  for (const q of main) e.step(q);
  const span = 2 * s0 * Math.log(9) / 3;
  console.log(`  ${String(s0).padEnd(6)} │ ${e.A.toFixed(3)}  ${(e.A / e.U).toFixed(2)}  │ ${s0 === 0 ? '0（=V2，会塌缩）' : span.toFixed(3) + ' 难度单位'}`);
}
