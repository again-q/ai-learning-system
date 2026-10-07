#!/usr/bin/env node
/**
 * 决策 063 · 起点与结构分析
 *
 * 目的（用户要求）：从【数学结构】分析数据形态，而不是描述现象
 *
 * 三个层次：
 *   层次 1：观测空间的几何结构 —— (D, P) 落在哪、A/U 门槛把平面切成什么
 *   层次 2：五情况作为划分函数 —— 每条路径被触发的【条件概率】是多少
 *   层次 3：A 的不动点结构 —— 在给定 D 分布下，A 收敛到哪、由什么决定
 *
 * 用法：node scripts/analyze-a-structure.mjs
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
const D = main.map((q) => q.D), P = main.map((q) => q.P);
const n = main.length;
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => Math.sqrt(mean(a.map((x) => (x - mean(a)) ** 2)));

console.log('='.repeat(88));
console.log('  决策 063 · 数学结构分析（n=' + n + '，单元=第一章）');
console.log('='.repeat(88));

// ═══════════════════════════════════════════
// 层次 1：观测空间的几何结构
// ═══════════════════════════════════════════
console.log('\n【层次 1】观测空间的几何结构\n');
console.log(`  D: 均值 ${mean(D).toFixed(3)}  标准差 ${sd(D).toFixed(3)}  范围 [${Math.min(...D).toFixed(2)}, ${Math.max(...D).toFixed(2)}]`);
console.log(`  P: 均值 ${mean(P).toFixed(3)}  标准差 ${sd(P).toFixed(3)}  范围 [${Math.min(...P).toFixed(2)}, ${Math.max(...P).toFixed(2)}]`);
console.log(`  协方差结构：r(D,P) = ${( (()=>{const mD=mean(D),mP=mean(P);let c=0,v1=0,v2=0;main.forEach(q=>{c+=(q.D-mD)*(q.P-mP);v1+=(q.D-mD)**2;v2+=(q.P-mP)**2;});return c/Math.sqrt(v1*v2);})() ).toFixed(3)}`);

// 中心化后的结构性观察
console.log('\n  把 (D, P) 中心化后看结构：');
const mD = mean(D), mP = mean(P);
const centered = main.map((q) => ({ d: q.D - mD, p: q.P - mP }));
const q1 = centered.filter((c) => c.d < 0 && c.p < 0).length;
const q2 = centered.filter((c) => c.d < 0 && c.p >= 0).length;
const q3 = centered.filter((c) => c.d >= 0 && c.p < 0).length;
const q4 = centered.filter((c) => c.d >= 0 && c.p >= 0).length;
console.log(`    左上(D低P高) ${q2}   右上(D高P高) ${q4}`);
console.log(`    左下(D低P低) ${q1}   右下(D高P低) ${q3}`);
console.log(`  → 四象限分布 ${q1}/${q2}/${q3}/${q4}`);

// 关键：D 与 P 的秩相关（对异常值稳健）
function rank(arr) {
  const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(arr.length);
  idx.forEach(([_, i], k) => { r[i] = k + 1; });
  return r;
}
const rD = rank(D), rP = rank(P);
const mrD = mean(rD), mrP = mean(rP);
let num = 0, den1 = 0, den2 = 0;
for (let i = 0; i < n; i++) { num += (rD[i] - mrD) * (rP[i] - mrP); den1 += (rD[i] - mrD) ** 2; den2 += (rP[i] - mrP) ** 2; }
console.log(`  Spearman 秩相关 = ${(num / Math.sqrt(den1 * den2)).toFixed(3)}`);

// 按 D 分簇（三簇结构）
console.log('\n  D 的三簇结构（k-means 手工按断点切）：');
const breaks = [[0, 0.4], [0.4, 0.75], [0.75, 1.01]];
breaks.forEach(([lo, hi]) => {
  const g = main.filter((q) => q.D >= lo && q.D < hi);
  if (!g.length) { console.log(`    D∈[${lo},${hi})  n=0`); return; }
  const gp = g.map((q) => q.P);
  console.log(`    D∈[${lo},${hi})  n=${g.length}  P均=${mean(gp).toFixed(2)}  Pσ=${sd(gp).toFixed(3)}  P范围[${Math.min(...gp).toFixed(2)},${Math.max(...gp).toFixed(2)}]`);
});

// ═══════════════════════════════════════════
// 层次 2：五情况的条件概率
// ═══════════════════════════════════════════
console.log('\n' + '='.repeat(88));
console.log('【层次 2】五情况作为划分函数：在给定起点下，各路径的触发概率');
console.log('='.repeat(88));

function makeEngine(cfg) {
  const { P_c, alpha, delta_u, delta_d, k_low, k_fail, A0, U0 } = cfg;
  let A = A0, U = U0, nLow = 0, nFail = 0;
  const cnt = { p1: 0, p2: 0, p3: 0, p3b: 0, p4: 0, p5: 0 };
  const trace = [];
  return {
    get A() { return A; }, get U() { return U; }, get cnt() { return cnt; }, get trace() { return trace; },
    step(q) {
      const { D, P } = q;
      let path;
      if (D < A) {
        if (P >= P_c) { path = 'p1'; nLow = 0; }
        else { nLow++; if (nLow >= k_low) { A = Math.max(0, A - alpha * (A - P)); nLow = 0; } path = 'p2'; }
      } else if (D <= U) {
        A = Math.min(U, A + alpha * (P - A));
        if (P >= P_c) { path = 'p3'; nFail = 0; }
        else { path = 'p3b'; nFail++; if (nFail >= k_fail) { U = Math.max(A, U - delta_d * (U - A)); nFail = 0; } }
      } else {
        if (P >= P_c) { A = Math.min(U, A + alpha * (P - A)); U = U + delta_u * (1 - U); path = 'p4'; nFail = 0; }
        else { path = 'p5'; nFail++; if (nFail >= k_fail) { U = Math.max(A, U - delta_d * (U - A)); nFail = 0; } }
      }
      cnt[path]++;
      trace.push({ D, P, A, U, path });
    },
  };
}

const BASE = { P_c: 0.6, alpha: 0.1, delta_u: 0.05, delta_d: 0.03, k_low: 3, k_fail: 2, A0: 0.30, U0: 0.50 };

console.log('\n  U₀ 扫描（其余用基准），看③区能否被激活：\n');
console.log('  U₀    │ A末    U末   │ ①   ②   ③   ③′  ④   ⑤  │ ③区占比');
console.log('  ' + '-'.repeat(70));
for (const u0 of [0.50, 0.60, 0.70, 0.80, 0.90]) {
  const e = makeEngine({ ...BASE, U0: u0 });
  for (const q of main) e.step(q);
  const c = e.cnt;
  const c3 = c.p3 + c.p3b;
  console.log(`  ${u0.toFixed(2)}  │ ${e.A.toFixed(3)}  ${e.U.toFixed(3)} │ ${String(c.p1).padStart(3)} ${String(c.p2).padStart(3)} ${String(c.p3).padStart(3)} ${String(c.p3b).padStart(3)} ${String(c.p4).padStart(3)} ${String(c.p5).padStart(3)} │ ${(c3 / n * 100).toFixed(0)}%`);
}

console.log('\n  A₀ 扫描（U₀=0.7）：\n');
console.log('  A₀    │ A末    U末   │ ①   ②   ③   ③′  ④   ⑤');
console.log('  ' + '-'.repeat(60));
for (const a0 of [0.30, 0.40, 0.50, 0.60, 0.70]) {
  const e = makeEngine({ ...BASE, A0: a0, U0: 0.70 });
  for (const q of main) e.step(q);
  const c = e.cnt;
  console.log(`  ${a0.toFixed(2)}  │ ${e.A.toFixed(3)}  ${e.U.toFixed(3)} │ ${String(c.p1).padStart(3)} ${String(c.p2).padStart(3)} ${String(c.p3).padStart(3)} ${String(c.p3b).padStart(3)} ${String(c.p4).padStart(3)} ${String(c.p5).padStart(3)}`);
}

// ═══════════════════════════════════════════
// 层次 3：A 的不动点结构
// ═══════════════════════════════════════════
console.log('\n' + '='.repeat(88));
console.log('【层次 3】A 的不动点：由什么决定');
console.log('='.repeat(88));

console.log('\n  在③区，A 的更新是 A ← A + α(P − A)，不动点 = 该区 P 的均值。');
console.log('  但"哪些题进③区"取决于 A 本身 —— 这是一个自洽方程：\n');
console.log('      A* = E[ P | A* ≤ D ≤ U ]\n');

console.log('  用数据算这个条件期望（U=0.7 下）：\n');
for (const u0 of [0.60, 0.70, 0.80]) {
  console.log(`    U=${u0.toFixed(2)}：`);
  for (const A of [0.3, 0.4, 0.5, 0.6, 0.65, 0.7]) {
    const inRange = main.filter((q) => q.D >= A && q.D <= u0);
    const belowA = main.filter((q) => q.D < A);
    const aboveU = main.filter((q) => q.D > u0);
    const ep = inRange.length ? mean(inRange.map((q) => q.P)) : null;
    console.log(`      A=${A.toFixed(2)} → ③区题数 ${String(inRange.length).padStart(2)}（D<A:${belowA.length} D>U:${aboveU.length}）  E[P|③]=${ep == null ? '  -  ' : ep.toFixed(3)}  ${ep != null && Math.abs(ep - A) < 0.05 ? '← 近似不动点' : ''}`);
  }
}

console.log('\n  关键结构：条件期望 E[P|A≤D≤U] 随 A 单调吗？');
const uFix = 0.70;
const xs = [], ys = [];
for (let A = 0.30; A <= 0.70; A += 0.025) {
  const g = main.filter((q) => q.D >= A && q.D <= uFix);
  if (!g.length) continue;
  xs.push(A); ys.push(mean(g.map((q) => q.P)));
}
console.log('    A     E[P|③]');
xs.forEach((x, i) => console.log(`    ${x.toFixed(3)}  ${ys[i].toFixed(3)} ${'█'.repeat(Math.round(ys[i] * 50))}`));

const up = ys.every((y, i) => i === 0 || y >= ys[i - 1] - 0.02);
console.log(`\n    → ${up ? '近似单调不减：A 的上升不会导致条件期望下降（稳定）' : '非单调：存在多个不动点的可能（需要检查）'}`);

fs.mkdirSync(path.join(ROOT, 'output/a-fit'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'output/a-fit/structure.json'), JSON.stringify({
  generatedAt: new Date().toISOString(), n, meanD: mean(D), sdD: sd(D), meanP: mean(P), sdP: sd(P),
  quadrants: { q1, q2, q3, q4 }, spearman: num / Math.sqrt(den1 * den2),
}, null, 1));
console.log('\n  落盘：output/a-fit/structure.json');
