#!/usr/bin/env node
/**
 * A 的目标分位点：50% 点 vs 80% 点
 *
 * 用户论证（2026-10-06）：
 *   "U 更新的就是按照它，我们又更新了都根据它的难度，还有 P，我们去做了一个下压了，
 *    而 A 跟 U 的尺度是一致的"
 *   → U 已经被 P 下压过了（U = max(U, D·g(P))）
 *   → A 不该再压一次
 *   → A 该是"大概率能做到的难度"（80% 点），不是"一半一半"（50% 点）
 *
 * 实现：
 *   让 A 的平衡点对应"他在难度 D=A 时拿到 p_target"
 *   即：E(A | A, U) = p_target  是 A 的不动点条件
 *
 *   期望函数：E = 1/(1+e^{k(D-m)/s}),  m=(A+U)/2,  s=(U-A)/2+s0
 *   在中点处 E=0.5。要让 D=A 处 E=p_target，需要把曲线整体平移。
 *
 * 用法：node scripts/tune-a-target-quantile.mjs
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

// ══════════════════════════════════════════════════════
// 期望函数：加一个"目标分位点"参数
//   标准形式在中点给 0.5。要让 D=A 处给 p_t，需要把曲线右移：
//     令 D=A 时 (D-m)/s = 0  →  若希望 E(A)=p_t，则 m 要右移
//   用 logit 偏移实现：
//     E = 1/(1 + e^{ k(D-m)/s + b }),   b = logit(1-p_t) 的偏移
//   即 b 使 E(m)=p_t
// ══════════════════════════════════════════════════════
function makeEngine(cfg) {
  const { k = 3, s0 = 0.10, alpha = 0.1, p_t = 0.8, delta_d = 0.03, k_low = 3,
          A0 = 0.30, U0 = 0.50, P_c = 0.6, a_u = 0.75 } = cfg;
  let A = A0, U = U0, nLow = 0;
  const trace = [];
  // logit 偏移：使 E(D=a) = p_t（锚点在 A，不是中点）
  //   E(D) = 1/(1+e^{k(D-a)/s + b})，要求 E(a)=p_t  → e^b=(1-p_t)/p_t
  //   同时希望在 D=u 处 E 很小 → s 由 (u-a) 决定
  const b = Math.log((1 - p_t) / p_t);
  const expect = (D, a, u) => {
    const s = (u - a) + 2 * s0;          // 从 A 到 U 是完整的过渡
    return 1 / (1 + Math.exp(k * (D - a) / s + b));
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

console.log('='.repeat(86));
console.log('  A 的目标分位点：p_t 取多少');
console.log('='.repeat(86));
console.log('\n  p_t 的语义：A 停在"他在难度 D=A 的题上，过程分达到 p_t"的位置');
console.log('  p_t = 0.5 → A 是 50% 点（旧，A/U 偏低）');
console.log('  p_t = 0.8 → A 是 80% 点（用户倾向）\n');

console.log('  p_t   │ A末    U末    余量    A/U   │ 简单题不动性 │ ③区涨跌是否正常');
console.log('  ' + '-'.repeat(84));
for (const p_t of [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9]) {
  const e = makeEngine({ p_t });
  for (const q of main) e.step(q);
  // 简单题不动性
  let At = 0.30, Ut = 0.50;
  const b = Math.log((1 - p_t) / p_t);
  for (let i = 0; i < 8; i++) {
    const s = (Ut - At) + 0.20;
    const E = 1 / (1 + Math.exp(3 * (0.25 - At) / s + b));
    At = At + 0.1 * (0.90 - E);
    if (At > Ut) At = Ut;
  }
  const drift = At - 0.30;
  // ③区检验：D=0.60, P=0.90，A=0.5,U=0.75 应涨；P=0.25 应跌
  const s0_ = (0.75 - 0.5) + 0.20;
  const Ehi = 1 / (1 + Math.exp(3 * (0.60 - 0.5) / s0_ + b));
  const Elo = Ehi;
  const okHi = (0.90 - Ehi) > 0.02, okLo = (0.25 - Elo) < -0.02;
  console.log(`  ${p_t.toFixed(2)}  │ ${e.A.toFixed(3)}  ${e.U.toFixed(3)}  ${(e.U - e.A).toFixed(3)}  ${(e.A / e.U).toFixed(2)}  │ ${((drift >= 0 ? '+' : '') + drift.toFixed(4)).padEnd(12)} │ ${okHi && okLo ? '✅ 涨跌正常' : '⚠️ ' + (okHi ? '' : '③区不涨 ') + (okLo ? '' : '③′不跌')}`);
}

console.log('\n' + '='.repeat(86));
console.log('  p_t = 0.80 的详细轨迹');
console.log('='.repeat(86));
const e80 = makeEngine({ p_t: 0.80 });
console.log('\n  #   D     P     E(期望)  惊讶度   A      U      余量   动作');
console.log('  ' + '-'.repeat(74));
main.forEach((q, i) => {
  e80.step(q);
  const t = e80.trace[i];
  console.log(`  ${String(i + 1).padStart(2)}  ${t.D.toFixed(2)}  ${t.P.toFixed(2)}  ${t.E.toFixed(3)}   ${(t.surprise >= 0 ? '+' : '') + t.surprise.toFixed(3)}   ${t.A.toFixed(3)}  ${t.U.toFixed(3)}  ${(t.U - t.A).toFixed(3)}  ${t.act}`);
});
console.log('  ' + '-'.repeat(74));
console.log(`  期末 A=${e80.A.toFixed(3)}  U=${e80.U.toFixed(3)}  余量=${(e80.U - e80.A).toFixed(3)}  A/U=${(e80.A / e80.U).toFixed(3)}`);

console.log('\n' + '='.repeat(86));
console.log('  五情况行为检验（p_t=0.80）');
console.log('='.repeat(86));
{
  const p_t = 0.80, k = 3, s0 = 0.10, A = 0.50, U = 0.75;
  const b = Math.log((1 - p_t) / p_t);
  const s = (U - A) + 2 * s0;
  const E = (D) => 1 / (1 + Math.exp(k * (D - A) / s + b));
  const cases = [
    ['① D<A, P高（应忽略）', 0.30, 0.90, 'flat'],
    ['② D<A, P低（应降A）', 0.30, 0.20, 'down'],
    ['③ A≤D≤U, P高（应涨A）', 0.60, 0.90, 'up'],
    ['③′ A≤D≤U, P低（应降A）', 0.60, 0.25, 'down'],
    ['④ D>U, P高（突破）', 0.87, 0.90, 'up'],
    ['⑤ D>U, P低（应忽略）', 0.87, 0.20, 'flat'],
  ];
  console.log('\n  情况                      D     P     E(期望)  惊讶度   A 变化   符合？');
  console.log('  ' + '-'.repeat(78));
  for (const [name, D, P, want] of cases) {
    const e = E(D), su = P - e, dA = 0.1 * su;
    const ok = want === 'flat' ? Math.abs(dA) < 0.03 : want === 'up' ? dA > 0.02 : dA < -0.02;
    console.log(`  ${name.padEnd(24)} ${D.toFixed(2)}  ${P.toFixed(2)}  ${e.toFixed(3)}   ${(su >= 0 ? '+' : '') + su.toFixed(3)}   ${(dA >= 0 ? '+' : '') + dA.toFixed(4)}  ${ok ? '✅' : '❌'}`);
  }
}

fs.mkdirSync(path.join(ROOT, 'output/a-fit'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'output/a-fit/target-quantile.json'), JSON.stringify({
  generatedAt: new Date().toISOString(), n: main.length,
  p80: { A: e80.A, U: e80.U, trace: e80.trace.map((t) => ({ D: t.D, P: t.P, E: +t.E.toFixed(4), A: +t.A.toFixed(4), U: +t.U.toFixed(4) })) },
}, null, 1));
console.log('\n  落盘：output/a-fit/target-quantile.json');
