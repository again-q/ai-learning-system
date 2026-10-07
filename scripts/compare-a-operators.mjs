#!/usr/bin/env node
/**
 * A 的算子改进：从 IRT/Elo 的"惊讶度"出发，重新设计 A 的更新
 *
 * 核心观察：
 *   用户的五情况准入表，本质上是 IRT 惊讶度信号 (S − E(S)) 的【分区域离散化】
 *   ────────────────────────────────────────────────────────
 *      ① D<A, P高 → E(S)→1, S=1 → 惊讶≈0    （用户：忽略）
 *      ② D<A, P低 → E(S)→1, S=0 → 惊讶≈−1   （用户：A降）
 *      ③ A≤D≤U    → E(S)≈0.5               （用户：A更新）
 *      ④ D>U, P高 → E(S)→0, S=1 → 惊讶≈+1   （用户：突破）
 *      ⑤ D>U, P低 → E(S)→0, S=0 → 惊讶≈0    （用户：忽略）
 *   ────────────────────────────────────────────────────────
 *
 * 但 IRT 只有【一个】θ，用户有 A、U 【两个】。
 * 所以不能直接套 —— 需要把 IRT 的"期望"概念，用 A、U 作锚点重新构造。
 *
 * 本脚本的改进方案：
 *   让期望过程分由 A、U【共同定义】（两个锚点确定一条 S 曲线）
 *       E(P|D) = 1 / (1 + exp( k(D−m)/s ))
 *       m = (A+U)/2   （能力区间的中点）
 *       s = (U−A)/2   （区间的半宽）
 *
 *   性质：D=A → E≈0.95；D=m → E=0.50；D=U → E≈0.05
 *   → A、U 就是这条"难度-表现曲线"的上下锚点
 *   → 硬阈值（含 P_c）全部消失
 *
 * 用法：node scripts/compare-a-operators.mjs
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
// 引擎 A：现行五情况（离散阈值 + P_c）
// ══════════════════════════════════════════════════════
function engineV1(cfg) {
  const { P_c = 0.6, alpha = 0.1, delta_d = 0.03, k_low = 3, A0 = 0.30, U0 = 0.50, a_u = 0.75 } = cfg;
  let A = A0, U = U0, nLow = 0;
  const cnt = { p1: 0, p2: 0, p3: 0, p3b: 0, p4: 0, p5: 0 }; const trace = [];
  return {
    get A() { return A; }, get U() { return U; }, get cnt() { return cnt; }, get trace() { return trace; },
    step(q) {
      const { D, P } = q; let p;
      if (D < A) {
        if (P >= P_c) { p = 'p1'; nLow = 0; }
        else { p = 'p2'; nLow++;
          if (nLow >= k_low) { A = Math.max(0, A - alpha * (A - P)); U = Math.max(A, U - delta_d * (U - A)); nLow = 0; } }
      } else if (D <= U) {
        A = Math.min(U, A + alpha * (P - A)); p = P >= P_c ? 'p3' : 'p3b'; nLow = 0;
      } else {
        if (P >= P_c) { A = Math.min(U, A + alpha * (P - A));
          const g = a_u + (1 - a_u) * ((P - P_c) / (1 - P_c)); const c = D * g; if (c > U) U = c;
          p = 'p4'; nLow = 0; } else { p = 'p5'; nLow = 0; }
      }
      cnt[p]++; trace.push({ D, P, A, U, p, E: null });
    },
  };
}

// ══════════════════════════════════════════════════════
// 引擎 B：连续期望（IRT 式的惊讶度，锚点用 A、U）
// ══════════════════════════════════════════════════════
function engineV2(cfg) {
  const { k = 3, alpha = 0.1, s_min = 0.05, delta_u = 0.05, delta_d = 0.03,
          k_low = 3, A0 = 0.30, U0 = 0.50 } = cfg;
  let A = A0, U = U0, nLow = 0;
  const trace = [];
  const expect = (D, A, U) => {
    const m = (A + U) / 2;
    const s = Math.max(s_min, (U - A) / 2);
    return 1 / (1 + Math.exp(k * (D - m) / s));
  };
  return {
    get A() { return A; }, get U() { return U; }, get trace() { return trace; },
    step(q) {
      const { D, P } = q;
      const E = expect(D, A, U);
      const surprise = P - E;                      // ← 核心：惊讶度
      A = A + alpha * surprise;                    // A 由惊讶度驱动
      if (A > U) A = U; if (A < 0) A = 0;

      // U：只在"确证超出估计"时抬（用户设计）
      if (D > U && P >= 0.6) {
        const g = 0.75 + 0.25 * ((P - 0.6) / 0.4);
        const c = D * g; if (c > U) U = c;
        nLow = 0;
      } else if (D < A && P < 0.6) {
        nLow++; if (nLow >= k_low) { U = Math.max(A, U - delta_d * (U - A)); nLow = 0; }
      } else nLow = 0;

      trace.push({ D, P, A, U, E, surprise, p: null });
    },
  };
}


// ══════════════════════════════════════════════════════
// 引擎 C：单锚点（最贴近 IRT —— θ=A，期望只由 A 决定）
//   E(P|D) = 1 / (1 + exp( (D − A) / tau ))
//   U 不参与期望，只作"突破"的门槛（用户设计）
// ══════════════════════════════════════════════════════
function engineV3(cfg) {
  const { tau = 0.12, alpha = 0.1, delta_d = 0.03, k_low = 3,
          A0 = 0.30, U0 = 0.50, P_c = 0.6, a_u = 0.75 } = cfg;
  let A = A0, U = U0, nLow = 0;
  const trace = [];
  const expect = (D, A) => 1 / (1 + Math.exp((D - A) / tau));
  return {
    get A() { return A; }, get U() { return U; }, get trace() { return trace; },
    step(q) {
      const { D, P } = q;
      const E = expect(D, A);
      const surprise = P - E;
      A = A + alpha * surprise;
      if (A > U) A = U; if (A < 0) A = 0;
      if (D > U && P >= P_c) {
        const g = a_u + (1 - a_u) * ((P - P_c) / (1 - P_c));
        const c = D * g; if (c > U) U = c;
        nLow = 0;
      } else if (D < A && P < P_c) {
        nLow++; if (nLow >= k_low) { U = Math.max(A, U - delta_d * (U - A)); nLow = 0; }
      } else nLow = 0;
      trace.push({ D, P, A, U, E, surprise });
    },
  };
}

// ══════════════════════════════════════════════════════
function run(engineFn, cfg) {
  const e = engineFn(cfg);
  for (const q of main) e.step(q);
  return e;
}

console.log('='.repeat(88));
console.log('  两种 A 算子的对照（n=' + main.length + '）');
console.log('='.repeat(88));

console.log('\n【现行：五情况离散阈值】\n');
console.log('  #   D     P     → 路径   A      U      A/U');
console.log('  ' + '-'.repeat(50));
const e1 = run(engineV1, {});
e1.trace.forEach((t, i) => {
  console.log(`  ${String(i + 1).padStart(2)}  ${t.D.toFixed(2)}  ${t.P.toFixed(2)}  → ${t.p.padEnd(4)}  ${t.A.toFixed(3)}  ${t.U.toFixed(3)}  ${(t.A / t.U).toFixed(2)}`);
});
console.log(`  期末 A=${e1.A.toFixed(3)} U=${e1.U.toFixed(3)} A/U=${(e1.A / e1.U).toFixed(3)}`);

console.log('\n【改进：连续期望（A、U 作锚点，无硬阈值）】\n');
console.log('  #   D     P     E(期望)  惊讶度   A      U      A/U');
console.log('  ' + '-'.repeat(62));
const e2 = run(engineV2, {});
e2.trace.forEach((t, i) => {
  console.log(`  ${String(i + 1).padStart(2)}  ${t.D.toFixed(2)}  ${t.P.toFixed(2)}  ${t.E.toFixed(3)}   ${(t.surprise >= 0 ? '+' : '') + t.surprise.toFixed(3)}   ${t.A.toFixed(3)}  ${t.U.toFixed(3)}  ${(t.A / t.U).toFixed(2)}`);
});
console.log(`  期末 A=${e2.A.toFixed(3)} U=${e2.U.toFixed(3)} A/U=${(e2.A / e2.U).toFixed(3)}`);

// ══════════════════════════════════════════════════════
console.log('\n' + '='.repeat(88));
console.log('  关键验证：改进版是否复现了五情况的行为');
console.log('='.repeat(88));
console.log('\n  按"D 与 A、U 的关系"分组，看惊讶度的符号与大小：\n');
const groups = { 'D<A, P高(应忽略)': [], 'D<A, P低(应降A)': [], 'A≤D≤U(应更新)': [], 'D>U, P高(应突破)': [], 'D>U, P低(应忽略)': [] };
// 用初始 A、U 分区（排除路径依赖）
for (const t of e2.trace) {
  let key;
  if (t.D < 0.30 + 0.0) key = t.P >= 0.6 ? 'D<A, P高(应忽略)' : 'D<A, P低(应降A)';
  else if (t.D > 0.50) key = t.P >= 0.6 ? 'D>U, P高(应突破)' : 'D>U, P低(应忽略)';
  else key = 'A≤D≤U(应更新)';
  groups[key].push(t.surprise);
}
for (const [k, arr] of Object.entries(groups)) {
  if (!arr.length) { console.log(`  ${k.padEnd(24)} n=0`); continue; }
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  console.log(`  ${k.padEnd(24)} n=${String(arr.length).padStart(2)}  平均惊讶度=${(mean >= 0 ? '+' : '') + mean.toFixed(3)}  ${arr.map((x) => (x >= 0 ? '+' : '') + x.toFixed(2)).join(' ')}`);
}

// ══════════════════════════════════════════════════════
console.log('\n' + '='.repeat(88));
console.log('  引擎 C：单锚点（θ=A，最接近 IRT）');
console.log('='.repeat(88));
console.log('\n  #   D     P     E(期望)  惊讶度   A      U      A/U');
console.log('  ' + '-'.repeat(62));
const e3 = run(engineV3, {});
e3.trace.forEach((t, i) => {
  console.log(`  ${String(i + 1).padStart(2)}  ${t.D.toFixed(2)}  ${t.P.toFixed(2)}  ${t.E.toFixed(3)}   ${(t.surprise >= 0 ? '+' : '') + t.surprise.toFixed(3)}   ${t.A.toFixed(3)}  ${t.U.toFixed(3)}  ${(t.A / t.U).toFixed(2)}`);
});
console.log(`  期末 A=${e3.A.toFixed(3)} U=${e3.U.toFixed(3)} A/U=${(e3.A / e3.U).toFixed(3)}`);

// ══════════════════════════════════════════════════════
console.log('\n' + '='.repeat(88));
console.log('  三引擎总对照');
console.log('='.repeat(88));
console.log('\n  引擎                                  A末    U末    A/U   结构问题');
console.log('  ' + '-'.repeat(80));
console.log(`  V1 五情况离散阈值（现行）              ${e1.A.toFixed(3)}  ${e1.U.toFixed(3)}  ${(e1.A / e1.U).toFixed(2)}  ①区浪费正向信号；A/U 受 α 污染`);
console.log(`  V2 双锚点 sigmoid（A、U 定曲线）        ${e2.A.toFixed(3)}  ${e2.U.toFixed(3)}  ${(e2.A / e2.U).toFixed(2)}  s=(U−A)/2 会随 A 逼近 U 而收缩 → 退化成硬阈值`);
console.log(`  V3 单锚点 sigmoid（θ=A，贴近 IRT）      ${e3.A.toFixed(3)}  ${e3.U.toFixed(3)}  ${(e3.A / e3.U).toFixed(2)}  需要定 tau（过渡带宽度）`);

// tau 扫描
console.log('\n' + '='.repeat(88));
console.log('  V3 的 tau 扫描（过渡带宽度，越小越陡）');
console.log('='.repeat(88));
console.log('\n  tau    │ A末    U末    A/U   │ 过渡带宽度 │ 说明');
console.log('  ' + '-'.repeat(70));
for (const tau of [0.05, 0.08, 0.12, 0.20, 0.30]) {
  const e = run(engineV3, { tau });
  const note = tau <= 0.05 ? '很陡（接近硬阈值：D>A 就几乎判 0）'
    : tau >= 0.30 ? '很平缓（难度影响被削弱）'
    : tau === 0.12 ? '← 默认' : '';
  console.log(`  ${String(tau).padEnd(6)} │ ${e.A.toFixed(3)}  ${e.U.toFixed(3)}  ${(e.A / e.U).toFixed(2)}  │ ~${(tau * 4).toFixed(2)} 难度单位 │ ${note}`);
}

fs.mkdirSync(path.join(ROOT, 'output/a-fit'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'output/a-fit/operator-compare.json'), JSON.stringify({
  generatedAt: new Date().toISOString(), n: main.length,
  v1: { A: e1.A, U: e1.U }, v2: { A: e2.A, U: e2.U }, v3: { A: e3.A, U: e3.U },
  v3trace: e3.trace.map((t) => ({ D: t.D, P: t.P, A: +t.A.toFixed(4), U: +t.U.toFixed(4), E: +t.E.toFixed(4), s: +t.surprise.toFixed(4) })),
}, null, 1));
console.log('\n  落盘：output/a-fit/operator-compare.json');
