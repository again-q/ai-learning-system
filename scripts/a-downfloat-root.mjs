/**
 * 下浮判据的根因修法 —— U 收敛到「最近平均水平」
 * 跑法：node scripts/a-downfloat-root.mjs
 *
 * 上一版（s̄<U−0.15）在真实分布上触发 62 次下浮 —— 太多
 * 根因：上浮判据是「单次 s > U」，只需超过一点点就能把 U 推很高
 *       而真实 s̄ 远低于 U → U−0.15 门槛被频繁击穿
 *
 * 修法：上浮和下浮都用「最近 N 次平均 s」→ 两者对称 → U 收敛到 s̄ 附近
 */

const CAL = (d) => 0.8 + 0.2 * d;
const p3 = (x) => x.toFixed(3);
const line = '='.repeat(96);

// 真实 P 分布（22:10 实测）
const PD = { L4: { D: 0.518, P: [1,1,1,1,1,1,0,0,1,1,0.5,1,1,1,0,1,1,1,0,0,1] },
             L5: { D: 0.650, P: [1,1,1,1] },
             L6: { D: 0.735, P: [1,0.9,0.8,0.6,0.6,0.6,0.4,0.3,0.2,0,0,1,0.9,1] } };
const MIX = [['L4',0.55],['L5',0.10],['L6',0.35]];

function genReal(n, lift = 0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = Math.random();
    let lv = 'L4', acc = 0;
    for (const [L, p] of MIX) { acc += p; if (r <= acc) { lv = L; break; } }
    const pool = PD[lv].P;
    const strength = lift + 0.5;
    const base = (1 - strength) * (pool.length - 1);
    const idx = Math.max(0, Math.min(pool.length - 1, Math.round(base + (Math.random() - 0.5) * 1.2)));
    out.push(pool[idx] * CAL(PD[lv].D));
  }
  return out;
}

function sim(seq, opt = {}) {
  const {
    alpha = 0.1, U0 = 0.5, A0 = 0.3, dU = 0.05, dD = 0.03, delta = 0.01,
    upN = 10, upNeed = 2, upBar = false,     // 上浮：窗口 N 内≥ need 次，或 s̄>U
    dnN = 10, dnStreak = 5, dnBar = true, dnGap = 0.10,
  } = opt;
  let A = A0, U = U0, lown = 0;
  const hist = [], bar = [];
  let ups = 0, downs = 0;
  const sN = [];
  for (const s of seq) {
    // 上浮判据
    if (upBar) {
      bar.push(s); if (bar.length > upN) bar.shift();
      const sAvg = bar.reduce((a,b)=>a+b,0) / bar.length;
      if (sAvg > U) { U += dU * (1 - U) * 0.5; ups++; bar.length = 0; }
    } else {
      hist.push({ ok: s > U });
      if (hist.length > upN) hist.shift();
      if (hist.filter(x => x.ok).length >= upNeed) { U += dU * (1 - U) * 0.5; ups++; hist.fill({ ok:false }); }
    }
    // 下浮判据
    const sBar = sN.slice(-dnN);
    const sAvg = sBar.length ? sBar.reduce((a,b)=>a+b,0) / sBar.length : s;
    if (sAvg < U - dnGap) { lown++; if (lown >= dnStreak) { U -= dD * (U - A); downs++; lown = 0; } } else lown = 0;
    sN.push(s);
    const gap = Math.max(0, U - A);
    A = Math.max(0, Math.min(U, A + alpha * (s - A) * (Math.sqrt(gap) + delta)));
  }
  return { A, U, ups, downs, sEnd: sN.slice(-dnN).reduce((a,b)=>a+b,0)/Math.min(dnN, sN.length) };
}

const SCEN = {
  '真实混合（中等生）': () => genReal(1000, 0),
  '真实混合（较强生）': () => genReal(1000, 0.30),
  '真实混合（较弱生）': () => genReal(1000, -0.28),
  '一直很强 s=0.90': () => new Array(1000).fill(0.90),
  '稳定中等 s=0.72': () => new Array(1000).fill(0.72),
  '★前强后弱 0.90→0.60': () => [...new Array(500).fill(0.90), ...genReal(500, -0.20)],
  '★间歇退步 90%高+10%低': () => Array.from({ length: 1000 }, (_, i) => (i % 10 < 9 ? 0.90 : 0.50)),
};

const V = [
  ['上浮窗口(现) + 下浮 s̄<U−0.10', { upBar: false, dnGap: 0.10 }],
  ['上浮窗口(现) + 下浮 s̄<U−0.05', { upBar: false, dnGap: 0.05 }],
  ['上浮窗口(现) + 下浮 s<U−0.10（单次）', { upBar: false, dnGap: 0.10, dnBar: false }],
  ['★上浮 s̄>U + 下浮 s̄<U−0.10', { upBar: true, dnGap: 0.10 }],
  ['★上浮 s̄>U + 下浮 s̄<U−0.05', { upBar: true, dnGap: 0.05 }],
  ['★上浮 s̄>U + 下浮 s̄<U−0.15', { upBar: true, dnGap: 0.15 }],
  ['★上浮 s̄>U + 下浮 s̄<U−0.20', { upBar: true, dnGap: 0.20 }],
];

console.log(line);
console.log('一、七种组合 × 七个场景（1000 次观测）');
console.log(line);
console.log('  组合                              ' + Object.keys(SCEN).map(k => k.slice(0,10).padEnd(11)).join(''));
console.log('  ' + '─'.repeat(96));
console.log('  （格式：期末U/下浮次数）');
for (const [name, opt] of V) {
  let l = '  ' + name.padEnd(34);
  for (const sc of Object.values(SCEN)) {
    const r = sim(sc(), opt);
    l += (p3(r.U) + '/' + String(r.downs).padStart(2)).padEnd(11);
  }
  console.log(l);
}

console.log('\n' + line);
console.log('二、关键场景细看');
console.log(line);
for (const [sn, gen] of Object.entries(SCEN)) {
  console.log(`\n  【${sn}】`);
  console.log('    组合                              期末U     下浮  末段s̄   U−末段s̄');
  for (const [name, opt] of V) {
    const r = sim(gen(), opt);
    const gap = r.U - r.sEnd;
    console.log(`    ${name.padEnd(34)} ${p3(r.U)}   ${String(r.downs).padStart(4)}  ${p3(r.sEnd)}   ${gap >= 0 ? '+' : ''}${p3(gap)}`);
  }
}

console.log('\n' + line);
console.log('三、根因验证：U 为什么会远高于末段 s̄');
console.log(line);
console.log('  场景「真实混合（中等生）」\n');
console.log('  组合U末段s̄  U−s̄   诊断');
for (const [name, opt] of V) {
  const r = sim(SCEN['真实混合（中等生）'](), opt);
  const gap = r.U - r.sEnd;
  let v;
  if (gap > 0.2) v = '❌ U 远高于实际水平';
  else if (gap > 0.1) v = '⚠️ U 偏高';
  else if (gap > 0) v = '✅ 合理（U 略高，留上升空间）';
  else v = '⚠️ U 低于实际水平';
  console.log(`  ${name.padEnd(34)} ${p3(r.U)} ${p3(r.sEnd)} ${p3(gap)}   ${v}`);
}
console.log('\n  → 用「单次 s > U」上浮时，U 会被少数高分推到 0.93，而实际水平只有 0.7');
console.log('  → 用「s̄ > U」上浮时，U 收敛到 s̄ 附近，两者差距小');

console.log('\n' + line);
console.log('四、「上浮 s̄>U」的敏感度（窗口大小）');
console.log(line);
console.log('  上浮窗口  较强生U  中等生U  较弱生U  真实中等s̄下浮次数  前强后弱U');
for (const N of [5, 10, 20, 30]) {
  const a = sim(SCEN['真实混合（较强生）'](), { upBar: true, upN: N, dnGap: 0.10 });
  const b = sim(SCEN['真实混合（中等生）'](), { upBar: true, upN: N, dnGap: 0.10 });
  const c = sim(SCEN['真实混合（较弱生）'](), { upBar: true, upN: N, dnGap: 0.10 });
  const d = sim(SCEN['真实混合（中等生）'](), { upBar: true, upN: N, dnGap: 0.10 });
  const e = sim(SCEN['★前强后弱 0.90→0.60'](), { upBar: true, upN: N, dnGap: 0.10 });
  console.log(`  ${String(N).padStart(6)}  ${p3(a.U)}   ${p3(b.U)}   ${p3(c.U)}    ${String(d.downs).padStart(4)}              ${p3(e.U)}`);
}

console.log('\n' + line);
console.log('五、定案对比：两个版本');
console.log(line);
const V_OLD = { upBar: false, dnGap: 0.10 };
const V_NEW = { upBar: true, upN: 10, dnGap: 0.10 };
console.log('  指标版本（旧上浮 + 新下浮）      ★版本（s̄ 上浮 + s̄ 下浮）');
console.log('  ' + '─'.repeat(62));
const rows = [
  ['较强生 U', SCEN['真实混合（较强生）'], 0.80],
  ['中等生 U', SCEN['真实混合（中等生）'], 0.60],
  ['较弱生 U', SCEN['真实混合（较弱生）'], 0.45],
];
for (const [name, gen, target] of rows) {
  const o = sim(gen(), V_OLD), n = sim(gen(), V_NEW);
  const vo = Math.abs(o.U - target) < 0.10 ? '✅' : '🟡';
  const vn = Math.abs(n.U - target) < 0.10 ? '✅' : '🟡';
  console.log(`  ${name.padEnd(14)} ${p3(o.U)} (目标${target}) ${vo}      ${p3(n.U)} ${vn}`);
}
const do_ = sim(SCEN['真实混合（中等生）'](), V_OLD).downs;
const dn_ = sim(SCEN['真实混合（中等生）'](), V_NEW).downs;
console.log(`  ${'误判下浮次数'.padEnd(16)} ${String(do_).padStart(4)}                        ${String(dn_).padStart(4)}`);
const eo = sim(SCEN['★前强后弱 0.90→0.60'](), V_OLD);
const en = sim(SCEN['★前强后弱 0.90→0.60'](), V_NEW);
console.log(`  ${'真退步时降不降'.padEnd(14)} U降到 ${p3(eo.U)}                U降到 ${p3(en.U)}`);

console.log('\n' + line);
console.log('六、★版本在完整场景集上');
console.log(line);
console.log('  场景                       期末A    期末U    上浮  下浮   末段s̄  U−s̄');
for (const [sn, gen] of Object.entries(SCEN)) {
  const r = sim(gen(), V_NEW);
  const gap = r.U - r.sEnd;
  console.log(`  ${sn.padEnd(24)} ${p3(r.A)}   ${p3(r.U)}   ${String(r.ups).padStart(4)}  ${String(r.downs).padStart(4)}   ${p3(r.sEnd)}  ${gap >= 0 ? '+' : ''}${p3(gap)}`);
}
