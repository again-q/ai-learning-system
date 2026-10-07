/**
 * 批次上传的真实结构：一次上传 = 一张卷子 19 道题，难度混杂
 *
 * 用户的质疑：连续 2 次 s>U —— 同一批里简单题会把 s 拉到 U 以下，
 *   连续两次几乎不可能凑齐 → 门槛必须提高？
 *
 * 跑法：node scripts/a-batch-upload.mjs
 */

const CAL = (d) => 0.6 + 0.4 * d;
const p3 = (x) => (x * 100).toFixed(1);
const L = '='.repeat(100);

// ── 难度层级（D 为 level 中值，校准 0.6+0.4D）──
const LVL = [
  { n: 'L1', D: 0.01, sMax: CAL(0.01) },
  { n: 'L2', D: 0.10, sMax: CAL(0.10) },
  { n: 'L3', D: 0.25, sMax: CAL(0.25) },
  { n: 'L4', D: 0.518, sMax: CAL(0.518) },
  { n: 'L5', D: 0.650, sMax: CAL(0.650) },
  { n: 'L6', D: 0.735, sMax: CAL(0.735) },
  { n: 'L7', D: 0.82, sMax: CAL(0.82) },
  { n: 'L8', D: 0.90, sMax: CAL(0.90) },
  { n: 'L9', D: 0.95, sMax: CAL(0.95) },
  { n: 'L10', D: 0.98, sMax: CAL(0.98) },
];
// 真实卷子难度配比（22:10 实测 L4 55% / L5 10% / L6 35%）
const MIX = [['L4', 0.55], ['L5', 0.10], ['L6', 0.35]];

const TIERS = { 较强: 0.30, 偏上: 0.10, 中位: 0.00, 较弱: -0.40 };

// lift → 各层成功率基准（b = base + lift×0.9，cap 到该层上限）
function P_for(lvIdx, lift) {
  const cap = LVL[lvIdx].sMax;
  const b = Math.max(0.03, Math.min(cap, 0.5 + lift * 0.9));
  const r = Math.random();
  let p;
  if (r < 0.12) p = Math.min(1, b + 0.15);
  else if (r < 0.24) p = b * 0.35;
  else p = Math.max(0, Math.min(cap, b + (Math.random() - 0.5) * 0.42));
  return p;
}
function pickLevel() {
  const r = Math.random(); let acc = 0;
  for (const [n, p] of MIX) { acc += p; if (r <= acc) return LVL.findIndex(l => l.n === n); }
  return 3;
}

/** 生成一批 BATCH_SIZE 道题，返回 [{s, D, lvl}] */
function makeBatch(lift, BATCH = 19) {
  const arr = [];
  for (let i = 0; i < BATCH; i++) {
    const li = pickLevel();
    arr.push({ s: P_for(li, lift) * CAL(LVL[li].D), D: LVL[li].D, li });
  }
  return arr;
}

// ═══════════════════════════════════════
console.log(L);
console.log('  批次上传（19 道/批，难度混杂）下的 U 上浮判据');
console.log(L);

console.log('\n【0】先看一批 19 道题的 s 序列长什么样（较强 / 中位 / 较弱）');
for (const t of ['较强', '中位', '较弱']) {
  const b = makeBatch(TIERS[t]);
  console.log(`\n  ${t}(lift ${TIERS[t].toFixed(2)})：`);
  console.log('   s 序列: ' + b.map(x => x.s.toFixed(2)).join(' '));
  const srt = [...b].sort((x, y) => x.s - y.s);
  console.log('   排序后: ' + srt.map(x => x.s.toFixed(2)).join(' '));
  console.log(`   最高${Math.max(...b.map(x=>x.s)).toFixed(3)}  中位${(b.reduce((a,c)=>a+c.s,0)/19).toFixed(3)}  最低${Math.min(...b.map(x=>x.s)).toFixed(3)}`);
}

console.log('\n【0.2】关键：一旦 U 涨到某层上限之上，那层的题永远不再触发');
for (const t of ['较强', '中位', '较弱']) {
  const sMaxes = {};
  for (let b = 0; b < 2000; b++) {
    const batch = makeBatch(TIERS[t]);
    for (const x of batch) {
      sMaxes[x.li] = Math.max(sMaxes[x.li] || 0, x.s);
    }
  }
  const rows = Object.entries(sMaxes).sort((a,b)=>a[0]-b[0]).map(([li, v]) => `L${+li+1} 上限${v.toFixed(3)}`);
  console.log(`  ${t.padEnd(4)} 2000 批里各层能达到的最高 s：${rows.join('  ')}`);
}
console.log('  → 校准 0.6+0.4D 下：简单题上限 0.61~0.70，中档 0.81~0.86，困难 0.89~0.99');
console.log('  → U 超过 0.70 之后，简单题永远超不过 U');
console.log('  → 而一批 19 道里有 55% 是 L4 → 「连续 2 次都超 U」在 U>0.70 后几乎不可能');

// ═══════════════════════════════════════
console.log('\n' + L);

/**
 * rule: 
 *   'consec2' 连续 2 次
 *   'batchN'  每批（19 题）里≥ need 次超 U
 *   'winN'    滑动窗口 W 内 ≥ need 次超 U（以题为单位）
 *   'hardOnly'只看难题（L6/L7/L8+）里连续 2 次
 */
function run(tier, opt = {}) {
  const {
    rule = 'consec2', need = 2, W = 19, dU = 0.05,
    batches = 200, BATCH = 19, hardOnly = false,
  } = opt;
  const lift = TIERS[tier];
  let A = 0.30, U = 0.50, ups = 0;
  let sAcc = 0, sN = 0, nHi = 0;
  const win = [];              // 逐题窗口
  let consec = 0, batchCnt = 0, batchTrig = false;

  for (let b = 0; b < batches; b++) {
    const batch = makeBatch(lift, BATCH);
    batchCnt = 0; batchTrig = false;
    for (const x of batch) {
      const pool = hardOnly ? (x.li >= 5) : true;
      const s = x.s;
      sAcc += s; sN++;
      if (!pool) { A = Math.max(0, Math.min(U, A + 0.1*(s-A))); continue; }
      const over = s > U;
      if (over) { nHi++; consec++; batchCnt++; } else consec = 0;
      win.push(over ? 1 : 0);
      if (win.length > W) win.shift();

      if (rule === 'consec2' && consec >= need) { U = Math.min(1, U + dU*(1-U)); consec = 0; ups++; win.length = 0; }
      if (rule === 'winN') {
        const hits = win.reduce((a,b)=>a+b,0);
        if (hits >= need) { U = Math.min(1, U + dU*(1-U)); ups++; win.length = 0; consec = 0; }
      }
      A = Math.max(0, Math.min(U, A + 0.1*(s-A)));
    }
    if (rule === 'batchN' && batchCnt >= need && !batchTrig) {
      U = Math.min(1, U + dU*(1-U)); ups++; batchTrig = true;
    }
  }
  return { A, U, ups, sAvg: sAcc/sN, hiRate: nHi/sN, perBatch: ups/batches };
}

const avg = (f, t, n = 40) => {
  const rs = []; for (let k = 0; k < n; k++) rs.push(f(t));
  const m = (k) => rs.reduce((a,b)=>a+b[k],0)/rs.length;
  const sd = (k) => { const mu = m(k); return Math.sqrt(rs.reduce((a,b)=>a+(b[k]-mu)**2,0)/rs.length); };
  return { A: m('A'), U: m('U'), ups: m('ups'), sAvg: m('sAvg'), hiRate: m('hiRate'), perBatch: m('perBatch'), Usd: sd('U') };
};

console.log('\n【1】各种判据在批次结构下的表现（200 批 = 3800 次观测，40 次平均）');
console.log('  判据                        档      A      U±σ   总上浮  每批上浮  突破率');
const CAND = [
  ['连续 2 次 s>U', { rule: 'consec2', need: 2 }],
  ['每批 19 题≥2次', { rule: 'batchN', need: 2 }],
  ['每批 19 题≥3 次', { rule: 'batchN', need: 3 }],
  ['每批 19 题≥4 次', { rule: 'batchN', need: 4 }],
  ['每批 19 题≥5 次', { rule: 'batchN', need: 5 }],
  ['每批 19 题≥6 次', { rule: 'batchN', need: 6 }],
  ['每批 19 题≥8 次', { rule: 'batchN', need: 8 }],
  ['窗口 38 内≥3 次', { rule: 'winN', W: 38, need: 3 }],
  ['窗口 38 内≥5 次', { rule: 'winN', W: 38, need: 5 }],
  ['窗口 57 内≥6 次', { rule: 'winN', W: 57, need: 6 }],
  ['只看难题·连续 2 次', { rule: 'consec2', need: 2, hardOnly: true }],
  ['只看难题·每批≥2 次', { rule: 'batchN', need: 2, hardOnly: true }],
  ['只看难题·每批≥4 次', { rule: 'batchN', need: 4, hardOnly: true }],
];
const TBL = {};
for (const [nm, opt] of CAND) {
  TBL[nm] = {};
  for (const t of Object.keys(TIERS)) {
    const r = avg((x) => run(x, opt), t);
    TBL[nm][t] = r;
    console.log(`  ${nm.padEnd(24)} ${t.padEnd(5)} ${p3(r.A).padStart(6)} ${p3(r.U).padStart(6)}±${p3(r.Usd).padStart(4)} ${r.ups.toFixed(0).padStart(7)} ${r.perBatch.toFixed(2).padStart(8)} ${(r.hiRate*100).toFixed(1).padStart(7)}%`);
  }
  const Us = Object.values(TBL[nm]).map(x=>x.U), As = Object.values(TBL[nm]).map(x=>x.A);
  const dec = Us.every((v,i)=>i===0||Us[i-1]>=v-1e-9);
  const mon = As.every((v,i)=>i===0||As[i-1]>=v-1e-9);
  console.log(`  ${''.padEnd(24)} → U跨度${p3(Math.max(...Us)-Math.min(...Us)).padStart(5)} 递减${dec?'✅':'❌'} | A跨度${p3(Math.max(...As)-Math.min(...As)).padStart(5)} 递减${mon?'✅':'❌'}\n`);
}

console.log('\n【2】突破率：U 涨到 0.70 之后，各层还能不能超U（混合 55% 简单题）');
{
  const U = 0.72;
  for (const t of Object.keys(TIERS)) {
    const cnt = {}; let tot = 0;
    for (let b = 0; b < 3000; b++) {
      for (const x of makeBatch(TIERS[t])) {
        tot++;
        if (x.s > U) cnt[x.li] = (cnt[x.li]||0)+1;
      }
    }
    const byLv = [3,4,5].map(li => `L${li+1} ${(cnt[li]||0) ? ((cnt[li]/tot)*100).toFixed(2)+'%' : '0'}`).join('  ');
    const anyPer = [];
    for (let b = 0; b < 3000; b++) anyPer.push(makeBatch(TIERS[t]).filter(x=>x.s>U).length);
    const dist = {}; anyPer.forEach(n => dist[n]=(dist[n]||0)+1);
    const distStr = Object.entries(dist).sort((a,b)=>a[0]-b[0]).map(([k,v])=>`${k}题: ${(v/30).toFixed(0)}%`).join('  ');
    console.log(`  ${t.padEnd(4)} U=0.72 时各层超U率: ${byLv}   |每批超U题数分布 ${distStr}`);
  }
}

console.log('\n【3】判据 + 涨幅的稳健性（对最优候选）');
for (const [nm, base] of [
  ['每批19题≥5次', { rule: 'batchN', need: 5 }],
  ['只看难题·每批≥2次', { rule: 'batchN', need: 2, hardOnly: true }],
]) {
  console.log(`\n  ▸ ${nm}`);
  console.log('    涨幅         较强A/较强U   偏上A/偏上U   中位A/中位U   较弱A/较弱U   U跨度  A跨度');
  for (const g of [0.02, 0.03, 0.05, 0.08, 0.12]) {
    const r = {};
    for (const t of Object.keys(TIERS)) r[t] = avg(x => run(x, {...base, dU: g}), t);
    const Us = Object.values(r).map(x=>x.U), As = Object.values(r).map(x=>x.A);
    const f = (t) => `${p3(r[t].A)}/${p3(r[t].U)}`.padStart(13);
    console.log(`    ${g.toFixed(2)}       ${f('较强')} ${f('偏上')} ${f('中位')} ${f('较弱')}  ${p3(Math.max(...Us)-Math.min(...Us)).padStart(6)} ${p3(Math.max(...As)-Math.min(...As)).padStart(6)}`);
  }
}
console.log(L);
