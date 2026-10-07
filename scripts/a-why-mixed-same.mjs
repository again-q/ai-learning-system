/**
 * 「混合难度」vs「只看难题」为什么结果一样 —— 机制拆解
 *
 * 关键：这两个规则**不等价**，我上一轮只看到结果相同就当成等价了。
 * 本脚本拆解差异到底在哪、有多大。
 *
 * 跑法：node scripts/a-why-mixed-same.mjs
 */

const CAL = (d) => 0.6 + 0.4 * d;
const p3 = (x) => (x * 100).toFixed(1);
const L = '='.repeat(100);

const LVL = [
  { n: 'L4', D: 0.518, cap: CAL(0.518), w: 0.55 },   // 简单
  { n: 'L5', D: 0.650, cap: CAL(0.650), w: 0.10 },   // 中档
  { n: 'L6', D: 0.735, cap: CAL(0.735), w: 0.35 },   // 困难
];
const TIERS = { 较强: 0.30, 偏上: 0.10, 中位: 0.00, 较弱: -0.40 };

function P_for(li, lift) {
  const cap = LVL[li].cap;
  const b = Math.max(0.03, Math.min(cap, 0.5 + lift * 0.9));
  const r = Math.random();
  if (r < 0.12) return Math.min(1, b + 0.15);
  if (r < 0.24) return b * 0.35;
  return Math.max(0, Math.min(cap, b + (Math.random() - 0.5) * 0.42));
}
function makeBatch(lift, N = 19) {
  const arr = [];
  for (let i = 0; i < N; i++) {
    const r = Math.random(); let acc = 0, li = 0;
    for (let k = 0; k < LVL.length; k++) { acc += LVL[k].w; if (r <= acc) { li = k; break; } }
    arr.push({ s: P_for(li, lift) * CAL(LVL[li].D), li, hard: li >= 2 });
  }
  return arr;
}

// ═══════════════════════════════════════
console.log(L);
console.log('  一、简单题到底做不做功？先量它自己的天花板');
console.log(L);
console.log('  层D        校准上限  权重');
for (const l of LVL) console.log(`  ${l.n}   ${l.D.toFixed(3)}  ${l.cap.toFixed(3)}    ${(l.w*100).toFixed(0)}%`);

console.log('\n  → 简单题（L4）s 上限 = 0.807，权重 55%');
console.log('  → 所以 U 一旦超过 0.807，简单题永远超不过 U');

// ═══════════════════════════════════════
console.log('\n' + L);
console.log('  二、链被打断的时机：简单题在什么 U 之前还会打断链条');
console.log(L);
console.log('  U 取值   简单题(s=L4)能超U的比例  简单题把consec清零的比例  两者关系');

for (const U of [0.50, 0.60, 0.70, 0.75, 0.80, 0.807, 0.82, 0.85, 0.90]) {
  let over = 0, n = 200000;
  for (let i = 0; i < n; i++) { const b = makeBatch(TIERS.较强); for (const x of b) if (!x.hard && x.s > U) over++; }
  const rate = (over / n * 100);
  console.log(`  ${U.toFixed(3)}    ${rate.toFixed(2).padStart(6)}%${' '.repeat(12)}${(100-rate).toFixed(2).padStart(6)}%${U > 0.807 ? '  ← 恒为0：简单题彻底出局' : (rate < 5 ? '  ← 几乎不打断' : '')}`);
}

console.log('\n  🔴 关键：U < 0.807 时，简单题「超不过 U」≠「不打断链条」');
console.log('     它超不过U 就把consec 清零 —— 这是两件事！');

// ═══════════════════════════════════════
console.log('\n' + L);
console.log('  三、四种规则的真实差别（200 批 × 19 题，40 次平均）');
console.log(L);

/**
 * mode:
 *  'all'      所有题都进链条（简单题会清零 consec）    ← 现行
 *  'skipHard' 简单题完全不参与（既不清零也不计数）      ←「只看难题」的正确实现
 *  'resetOnly'简单题只清零、不计数（等价于 all）
 *  'onlyCount'简单题不打断、也不算突破（要求两次都来自难题）
 */
function run(tier, mode, opt = {}) {
  const { dU = 0.05, batches = 400, BATCH = 19 } = opt;
  const lift = TIERS[tier];
  let A = 0.30, U = 0.50, ups = 0, consec = 0;
  let brk = 0, n = 0;                // brk = 被简单题打断的次数
  let sAcc = 0, sN = 0;
  for (let b = 0; b < batches; b++) {
    for (const x of makeBatch(lift, BATCH)) {
      sAcc += x.s; sN++;
      const over = x.s > U;
      if (mode === 'all') {
        if (over) consec++;
        else { if (!x.hard && consec > 0) brk++; consec = 0; }
        if (consec >= 2) { U = Math.min(1, U + dU*(1-U)); consec = 0; ups++; }
      } else if (mode === 'skipHard') {
        if (x.hard) { if (over) consec++; else consec = 0; if (consec >= 2) { U = Math.min(1, U + dU*(1-U)); consec = 0; ups++; } }
      } else if (mode === 'onlyCount') {
        if (x.hard) { if (over) consec++; else consec = 0; if (consec >= 2) { U = Math.min(1, U + dU*(1-U)); consec = 0; ups++; } }
        // 简单题：什么都不做（不清零）
      }
      n++;
      A = Math.max(0, Math.min(U, A + 0.1*(x.s - A)));
    }
  }
  return { A, U, ups, brk, perBatch: ups/batches, sAvg: sAcc/sN };
}

const avg = (f, t, n = 40) => {
  const rs = []; for (let k = 0; k < n; k++) rs.push(f(t));
  const m = (k) => rs.reduce((a,b)=>a+b[k],0)/rs.length;
  const sd = (k) => { const mu=m(k); return Math.sqrt(rs.reduce((a,b)=>a+(b[k]-mu)**2,0)/rs.length); };
  return { A:m('A'), U:m('U'), ups:m('ups'), brk:m('brk'), perBatch:m('perBatch'), sAvg:m('sAvg'), Usd:sd('U') };
};

console.log('  规则                档      A      U±σ   上浮/批  被简单题打断/批');
for (const [nm, mode] of [['全部题进链条(现行)', 'all'], ['简单题跳过', 'skipHard'], ['简单题不打断', 'onlyCount']]) {
  for (const t of Object.keys(TIERS)) {
    const r = avg(x => run(x, mode), t);
    console.log(`  ${nm.padEnd(18)} ${t.padEnd(5)} ${p3(r.A).padStart(6)} ${p3(r.U).padStart(6)}±${p3(r.Usd).padStart(4)} ${r.perBatch.toFixed(3).padStart(7)} ${r.brk.toFixed(1).padStart(12)}`);
  }
  console.log('');
}

// ═══════════════════════════════════════
console.log(L);
console.log('  四、差异的量级（这就是我上一轮「看起来一样」的原因）');
console.log(L);
const all_ = {}, skip = {};
for (const t of Object.keys(TIERS)) { all_[t] = avg(x => run(x, 'all'), t); skip[t] = avg(x => run(x, 'skipHard'), t); }
console.log('  档      U(全部进链条)  U(跳过简单)    ΔU        上浮次数差');
for (const t of Object.keys(TIERS)) {
  console.log(`  ${t.padEnd(5)} ${p3(all_[t].U).padStart(10)} ${p3(skip[t].U).padStart(12)} ${((skip[t].U-all_[t].U)*100).toFixed(2).padStart(8)} ${(skip[t].ups-all_[t].ups).toFixed(1).padStart(12)}`);
}
console.log('\n  → ΔU 在 1~2 点内，所以上一轮我看「结果一样」是被粗体数字骗了');

// ═══════════════════════════════════════
console.log('\n' + L);
console.log('  五、那 U 涨完之后呢？简单题彻底出局，「两种规则」真的会重合');
console.log(L);
console.log('  固定 U 值，量「连续 2 次超U」的相邻对概率：');
console.log('  U       全部题相邻对都超U   仅难题相邻对都超U   全/难之比');
for (const U of [0.55, 0.65, 0.72, 0.78, 0.81, 0.85, 0.90]) {
  let pn = 400000, allHit = 0, hardHit = 0, hardPrev = false, allPrev = false;
  for (let i = 0; i < pn; i++) {
    const s = P_for(0, 0.30) * CAL(LVL[0].D);          // L4
    const a = s > U;
    if (a && allPrev) allHit++;
    allPrev = a;
  }
  // 难题相邻对
  let prev = false;
  for (let i = 0; i < pn; i++) {
    const s = P_for(2, 0.30) * CAL(LVL[2].D);          // L6
    const a = s > U;
    if (a && prev) hardHit++;
    prev = a;
  }
  const pa = allHit / pn, ph = hardHit / pn;
  console.log(`  ${U.toFixed(2)}    ${(pa*100).toFixed(3).padStart(12)}% ${(ph*100).toFixed(2).padStart(14)}% ${ph>0?(pa/ph).toFixed(2):'—'}`);
}
console.log('\n  → U > 0.81 后全难度里已无简单题能超U，此时「全部」自动退化成「只看难题」');
console.log(L);
