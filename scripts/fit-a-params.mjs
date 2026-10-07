#!/usr/bin/env node
/**
 * 决策 063 · 参数拟合 v2（按用户 2026-10-06 修正后的公式）
 *
 * 修正点（相对 v1）：
 *   ① U 抬升：U ← max(U, D×P)   —— 不是平滑累积，且与过程有关
 *   ② U 下降：窗口内【累计】3 次落于②区  —— 不是"连续"
 *   ③ ⑤区不再触发 U 下降（超出估计的题没做出来是正常的）
 *   ④ 删除 δ_u 与 k_fail
 *
 * 用法：node scripts/fit-a-params.mjs
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

const qs = query('questions')
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
  }).sort((a, b) => a.t - b.t);

const main = qs.filter((q) => q.unit === '第一章 集合与常用逻辑用语');
const n = main.length;

// ══════════════════════════════════════════
// 引擎：v2 公式
// ══════════════════════════════════════════
function makeEngine(cfg) {
  const { P_c, alpha, delta_d, k_low = 3, A0, U0, a_u = 0.75 } = cfg;
  let A = A0, U = U0, nLow = 0;
  const cnt = { p1: 0, p2: 0, p3: 0, p3b: 0, p4: 0, p5: 0 };
  const trace = [];
  return {
    get A() { return A; }, get U() { return U; }, get cnt() { return cnt; }, get trace() { return trace; },
    step(q) {
      const { D, P } = q;
      let path;
      if (D < A) {
        if (P >= P_c) { path = 'p1'; nLow = 0; }
        else {
          path = 'p2'; nLow++;
          if (nLow >= k_low) {
            A = Math.max(0, A - alpha * (A - P));          // A 下调
            U = Math.max(A, U - delta_d * (U - A));        // U 下调
            nLow = 0;
          }
        }
      } else if (D <= U) {
        A = Math.min(U, A + alpha * (P - A));
        path = P >= P_c ? 'p3' : 'p3b';
        nLow = 0;
      } else {
        // D > U
        if (P >= P_c) {
          A = Math.min(U, A + alpha * (P - A));
          // ★ U ← max(U, D × g(P))；g(1)=1（锚点），g(P_c)=a
          const gP = a_u + (1 - a_u) * ((P - P_c) / (1 - P_c));
          const cand = D * gP;
          if (cand > U) U = cand;
          path = 'p4'; nLow = 0;
        } else {
          path = 'p5'; nLow = 0;                             // ⑤ 不再触发下降
        }
      }
      cnt[path]++;
      trace.push({ D, P, A, U, path });
    },
  };
}

const BASE = { P_c: 0.6, alpha: 0.1, delta_d: 0.03, k_low: 3, A0: 0.30, U0: 0.50, a_u: 0.75 };

console.log('='.repeat(84));
console.log('  决策 063 · 参数拟合 v3（U ← max(U, D×g(P))，g(P_c)=0.75；②累计3次→U降）');
console.log('='.repeat(84));
console.log(`\n  样本：${main.length} 题（第一章 集合与常用逻辑用语）`);
console.log(`  基准参数：${JSON.stringify(BASE)}\n`);

// ── 逐题轨迹 ──
console.log('  #   D     P     → 路径   A      U      A/U');
console.log('  ' + '-'.repeat(52));
const e0 = makeEngine(BASE);
main.forEach((q, i) => {
  e0.step(q);
  const t = e0.trace[i];
  console.log(`  ${String(i + 1).padStart(2)}  ${t.D.toFixed(2)}  ${t.P.toFixed(2)}  → ${t.path.padEnd(4)}  ${t.A.toFixed(3)}  ${t.U.toFixed(3)}  ${(t.A / t.U).toFixed(2)}`);
});
console.log('  ' + '-'.repeat(52));
console.log(`  期末：A=${e0.A.toFixed(3)}  U=${e0.U.toFixed(3)}  A/U=${(e0.A / e0.U).toFixed(3)}`);
console.log(`  路径分布：①${e0.cnt.p1} ②${e0.cnt.p2} ③${e0.cnt.p3} ③′${e0.cnt.p3b} ④${e0.cnt.p4} ⑤${e0.cnt.p5}`);

// ── 起点扫描 ──
console.log('\n' + '='.repeat(84));
console.log('  起点扫描（目标指标：A/U 与 ④ 次数）');
console.log('='.repeat(84));
console.log('\n  A₀    U₀    │ A末    U末    A/U   │ ②  ③  ③′  ④  ⑤ │ U 抬了几次');
console.log('  ' + '-'.repeat(76));
for (const A0 of [0.30, 0.40, 0.50]) {
  for (const U0 of [0.50, 0.60, 0.70]) {
    if (U0 < A0) continue;
    const e = makeEngine({ ...BASE, A0, U0 });
    let raise = 0, prevU = U0;
    for (const q of main) { e.step(q); if (e.U > prevU) { raise++; prevU = e.U; } }
    const c = e.cnt;
    console.log(`  ${A0.toFixed(2)}  ${U0.toFixed(2)}  │ ${e.A.toFixed(3)}  ${e.U.toFixed(3)}  ${(e.A / e.U).toFixed(2)}  │ ${String(c.p2).padStart(2)} ${String(c.p3).padStart(2)} ${String(c.p3b).padStart(3)} ${String(c.p4).padStart(2)} ${String(c.p5).padStart(2)} │ ${raise}`);
  }
}

// ── 参数敏感性 ──
console.log('\n' + '='.repeat(84));
console.log('  参数敏感性');
console.log('='.repeat(84));
for (const [label, key, vals] of [
  ['P_c（相变临界）', 'P_c', [0.4, 0.5, 0.6, 0.7, 0.8]],
  ['alpha（A 步长）', 'alpha', [0.05, 0.1, 0.2, 0.3]],
  ['delta_d（U 降幅）', 'delta_d', [0.01, 0.03, 0.05, 0.1]],
  ['k_low（②累计次数）', 'k_low', [2, 3, 5]],
  ['a_u（压缩系数 g(P_c)）', 'a_u', [0.6, 0.7, 0.75, 0.85, 1.0]],
]) {
  console.log(`\n  ${label}`);
  console.log('    取值  │ A末    U末    A/U   │ ②触发');
  console.log('    ' + '-'.repeat(44));
  for (const v of vals) {
    const e = makeEngine({ ...BASE, [key]: v });
    for (const q of main) e.step(q);
    console.log(`    ${String(v).padEnd(6)}│ ${e.A.toFixed(3)}  ${e.U.toFixed(3)}  ${(e.A / e.U).toFixed(2)}  │ ${e.cnt.p2}`);
  }
}

fs.mkdirSync(path.join(ROOT, 'output/a-fit'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'output/a-fit/fit-v2.json'), JSON.stringify({
  generatedAt: new Date().toISOString(), base: BASE, n,
  trace: e0.trace.map((t) => ({ ...t, A: +t.A.toFixed(4), U: +t.U.toFixed(4) })),
}, null, 1));
console.log('\n  落盘：output/a-fit/fit-v2.json');
