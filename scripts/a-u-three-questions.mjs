/**
 * 三个问题的实测
 * ① 窗口 20 vs 连续 2 ——「突破发挥」的判据怎么定
 * ② 为什么 A 没有完全逼近 U
 * ③ 为什么较弱档 U 这么高（修掉 L5 污染后再看）
 *
 * 跑法：node scripts/a-u-three-questions.mjs
 */

const CAL = (d) => 0.6 + 0.4 * d;
const p3 = (x) => (x * 100).toFixed(1);
const L = '='.repeat(98);

// ── 真实 P 分布（22:10 实测），全部降序 ──
const RAW = {
  L4: { D: 0.518, Ps: [1,1,1,1,1,1,0,0,1,1,0.5,1,1,1,0,1,1,1,0,0,1] },
  L6: { D: 0.735, Ps: [1,0.9,0.8,0.6,0.6,0.6,0.4,0.3,0.2,0,0,1,0.9,1] },
};
const LV = {};
for (const [k, o] of Object.entries(RAW)) LV[k] = { D: o.D, Ps: [...o.Ps].sort((a, b) => b - a) };
// L5 实测只有 4 个样本且全 1.0 → 无法建模，改成「围绕 0.85 按档位抖动」
const L5D = 0.650;
const MIX = [['L4', 0.55], ['L5', 0.10], ['L6', 0.35]];

const TIERS = { 较强: 0.30, 偏上: 0.10, 中位: 0.00, 较弱: -0.40 };

function pickP(lv, lift) {
  if (lv === 'L5') {
    const m = Math.max(0.05, Math.min(1, 0.85 + lift * 0.5));
    return Math.min(1, Math.max(0, m + (Math.random() - 0.5) * 0.5));
  }
  const pool = LV[lv].Ps;
  const st = Math.max(0, Math.min(1, lift + 0.5));
  const base = (1 - st) * (pool.length - 1);
  const idx = Math.round(base + (Math.random() - 0.5) * 1.2);
  return pool[Math.max(0, Math.min(pool.length - 1, idx))];
}
function pickLv() {
  const r = Math.random(); let acc = 0;
  for (const [lv, p] of MIX) { acc += p; if (r <= acc) return lv; }
  return 'L4';
}

// ══════════════════════════════════════════════
console.log(L);
console.log('  问题①  突破判据：连续 2 次  vs  最近 N 次里有 2 次');
console.log(L);

// 统一引擎：trigger 决定何时涨，gain 决定涨多少
function run(tier, N, opt = {}) {
  const {
    W = 2, need = 2,            // W=窗口大小（2 = 连续），need=窗口内需要几次超 U
    gainMode = 'fixed',          // fixed: 0.05(1−U) | margin: k×(s−U) | fixedD: 0.05(1−U)D
    k = 0.5, dU = 0.05,
    downRule = null,             // {gap, streak}  才启用下浮
  } = opt;
  const lift = TIERS[tier];
  let A = 0.30, U = 0.50, ups = 0, downs = 0;
  const win = [];                // 窗口内的 s>U 标记
  let lo = 0, sAcc = 0, sHi = 0, marginAcc = 0;
  for (let i = 0; i < N; i++) {
    const lv = pickLv();
    const D = lv === 'L5' ? L5D : LV[lv].D;
    const s = pickP(lv, lift) * CAL(D);
    sAcc += s;
    if (s > 0.75) sHi++;

    if (s > U) { win.push(s); marginAcc += s - U; } else win.push(0);
    if (win.length > W) win.shift();
    const hits = win.reduce((a, b) => a + (b > 0 ? 1 : 0), 0);
    if (hits >= need) {
      // 涨幅：取窗口内超 U 的平均超出量
      const ms = win.filter(x => x > 0);
      const avgMargin = ms.reduce((a, b) => a + b, 0) / ms.length;
      const g = gainMode === 'margin' ? k * avgMargin
              : gainMode === 'fixedD' ? dU * (1 - U) * D
              : dU * (1 - U);
      U = Math.min(1, U + g);
      win.length = 0;             // 触发后清空
      ups++;
    }
    if (downRule) {
      if (s <= U - downRule.gap) { lo++; } else lo = 0;
      if (lo >= downRule.streak) { U = Math.max(A, U - 0.03 * (U - A)); lo = 0; downs++; }
    }
    A = Math.max(0, Math.min(U, A + 0.1 * (s - A)));
  }
  return { A, U, ups, downs, sAvg: sAcc / N, hiRate: sHi / N, margin: marginAcc / N };
}

const avg = (f, t, n = 40) => {
  const rs = []; for (let k = 0; k < n; k++) rs.push(f(t));
  const m = (k) => rs.reduce((a, b) => a + b[k], 0) / rs.length;
  const sd = (k) => { const mu = m(k); return Math.sqrt(rs.reduce((a, b) => a + (b[k] - mu) ** 2, 0) / rs.length); };
  return { A: m('A'), U: m('U'), ups: m('ups'), sAvg: m('sAvg'), hiRate: m('hiRate'), margin: m('margin'), Usd: sd('U') };
};

console.log('\n【1.1】触发规则对比（涨幅固定 0.05(1−U)，2000 次观测，40 次平均）');
console.log('  规则                    档      A      U     上浮次数  达标率');
const RULES = [
  ['连续 2 次', { W: 2, need: 2 }],
  ['窗口 5 内≥2', { W: 5, need: 2 }],
  ['窗口 10 内≥2', { W: 10, need: 2 }],
  ['窗口 20 内≥2', { W: 20, need: 2 }],
  ['窗口 20 内≥3', { W: 20, need: 3 }],
  ['窗口 30 内≥3', { W: 30, need: 3 }],
];
const table = {};
for (const [nm, opt] of RULES) {
  table[nm] = {};
  for (const t of Object.keys(TIERS)) {
    const r = avg((x) => run(x, 2000, opt), t);
    table[nm][t] = r;
    console.log(`  ${nm.padEnd(22)} ${t.padEnd(5)} ${p3(r.A).padStart(6)} ${p3(r.U).padStart(6)} ${r.ups.toFixed(0).padStart(8)} ${(r.hiRate*100).toFixed(0).padStart(7)}%`);
  }
  const Us = Object.values(table[nm]).map(x => x.U);
  console.log(`  ${''.padEnd(22)} → U 跨度 ${p3(Math.max(...Us)-Math.min(...Us)).padStart(5)}  递减 ${Us.every((v,i)=>i===0||Us[i-1]>=v-1e-9)?'✅':'❌'}`);
}

console.log('\n【1.2】涨幅方式对比（都用窗口 20 内≥2）');
console.log('  涨幅方式                档      A      U     平均超出量');
for (const [nm, opt] of [
  ['固定 0.05(1−U)', { W: 20, need: 2, gainMode: 'fixed' }],
  ['固定 ×D', { W: 20, need: 2, gainMode: 'fixedD' }],
  ['按超出量 0.3×(s−U)', { W: 20, need: 2, gainMode: 'margin', k: 0.3 }],
  ['按超出量 0.5×(s−U)', { W: 20, need: 2, gainMode: 'margin', k: 0.5 }],
  ['按超出量 1.0×(s−U)', { W: 20, need: 2, gainMode: 'margin', k: 1.0 }],
]) {
  for (const t of Object.keys(TIERS)) {
    const r = avg((x) => run(x, 2000, opt), t);
    console.log(`  ${nm.padEnd(22)} ${t.padEnd(5)} ${p3(r.A).padStart(6)} ${p3(r.U).padStart(6)} ${p3(r.margin).padStart(9)}`);
  }
  console.log('');
}

// ══════════════════════════════════════════════
console.log(L);
console.log('  问题②  为什么 A 没有完全逼近 U');
console.log(L);

console.log('\n【2.1】恒定输入下 A 与 U 的关系（单档跑到 4000 次）');
console.log('  设定                       n=100   n=500   n=2000n=4000   末段s均值  gap');
const cases = [
  ['P≡1.0  简单题',()=>1.0*CAL(0.518), 0.807],
  ['P≡1.0  中档题',()=>1.0*CAL(0.650), 0.860],
  ['P≡1.0  困难题',()=>1.0*CAL(0.735), 0.894],
  ['P≡0.9  困难题',()=>0.9*CAL(0.735), 0.805],
  ['P≡0.7  困难题',()=>0.7*CAL(0.735), 0.626],
  ['P≡0.5  困难题',()=>0.5*CAL(0.735), 0.447],
];
for (const [nm, f] of cases) {
  const marks = {};
  let A = 0.30, U = 0.50;
  const win = [];
  for (let i = 1; i <= 4000; i++) {
    const s = f();
    if (s > U) { win.push(s); } else win.push(0);
    if (win.length > 20) win.shift();
    if (win.filter(x=>x>0).length >= 2) { U += 0.05*(1-U); win.length=0; }
    A = Math.max(0, Math.min(U, A + 0.1*(s-A)));
    if (i===100||i===500||i===2000||i===4000) marks[i]={A,U};
  }
  const s0 = f();
  console.log(`  ${nm.padEnd(22)} ${p3(marks[100].A).padStart(6)} ${p3(marks[500].A).padStart(7)} ${p3(marks[2000].A).padStart(7)} ${p3(marks[4000].A).padStart(7)}   ${p3(s0).padStart(8)} ${p3(marks[4000].U-marks[4000].A).padStart(6)}`);
}

console.log('\n【2.2】s 波动时 gap 到底由什么决定（关键）');
console.log('  数学：A 的不动点 = s 的长期均值（EWMA），而 U ≥ s 的历史高位');
console.log('  →  gap = U − s̄，与 α 无关。测不同 α：');
console.log('  α          n=500   n=2000  n=8000   末段gap');
for (const al of [0.05, 0.1, 0.2, 0.4]) {
  let A=0.30,U=0.50; const win=[];
  const rec={};
  for (let i=1;i<=8000;i++){
    const r=Math.random(); let acc=0,lv='L4';
    for(const[L,p] of MIX){acc+=p;if(r<=acc){lv=L;break;}}
    const D = lv==='L5'?L5D:LV[lv].D;
    const s=pickP(lv,TIERS.中位)*CAL(D);
    if(s>U){win.push(s);}else win.push(0);
    if(win.length>20)win.shift();
    if(win.filter(x=>x>0).length>=2){U+=0.05*(1-U);win.length=0;}
    A=Math.max(0,Math.min(U,A+al*(s-A)));
    if(i===500||i===2000||i===8000) rec[i]={A,U};
  }
  console.log(`  ${al.toFixed(2)}      ${p3(rec[500].A).padStart(6)} ${p3(rec[2000].A).padStart(7)} ${p3(rec[8000].A).padStart(7)}   ${p3(rec[8000].U-rec[8000].A).padStart(6)}`);
}

console.log('\n【2.3】U 能否追上 A（把 A 的上限放开成 1，看 A 会不会自己涨上去）');
console.log('  若A 不受 U 限制，2000 次后 A = s̄ ≈ ' );
{
  let A=0.30; let sAcc=0;
  for(let i=0;i<2000;i++){const lv=pickLv();const D=lv==='L5'?L5D:LV[lv].D;const s=pickP(lv,TIERS.中位)*CAL(D);sAcc+=s;A+=(s-A)*0.1;}
  console.log(`  A(无 U 限制) = ${p3(A)}   s均值 = ${p3(sAcc/2000)}   → 完全相等 = A 就是 s 的滑动平均`);
}

// ══════════════════════════════════════════════
console.log(L);
console.log('  问题③  较弱档 U 为什么高（已修 L5 污染）');
console.log(L);

console.log('\n【3.1】较弱档的 s 构成拆解（他到底做了什么题、拿到多少 s）');
for (const t of ['较强', '中位', '较弱']) {
  const byLv = {}; let n = 0, hi = 0, hiLv = {};
  for (let i = 0; i < 20000; i++) {
    const lv = pickLv(); const D = lv==='L5'?L5D:LV[lv].D;
    const s = pickP(lv, TIERS[t]) * CAL(D);
    (byLv[lv] = byLv[lv] || []).push(s);
    if (s > 0.80) { hi++; hiLv[lv] = (hiLv[lv]||0)+1; }
    n++;
  }
  const parts = Object.entries(byLv).map(([lv, arr]) => {
    const m = arr.reduce((a,b)=>a+b,0)/arr.length;
    return `${lv} 均${p3(m)}`;
  });
  const h = Object.entries(hiLv).map(([lv,c]) => `${lv} ${(c/n*100).toFixed(1)}%`).join(' / ');
  console.log(`  ${t.padEnd(5)} ${parts.join('  ')}   s>0.80 的题: ${h || '无'}`);
}

console.log('\n【3.2】上浮次数的来源（较弱档的 U 是被哪一层推上去的）');
for (const [nm, opt] of [['固定涨幅', { gainMode: 'fixed' }], ['按超出量0.5', { gainMode: 'margin', k: 0.5 }]]) {
  console.log(`\n  ▸ ${nm}`);
  for (const t of Object.keys(TIERS)) {
    let A=0.30,U=0.50; const win=[]; const byLv={}, gainByLv={};
    for(let i=0;i<2000;i++){
      const lv=pickLv(); const D=lv==='L5'?L5D:LV[lv].D;
      const s=pickP(lv,TIERS[t])*CAL(D);
      if(s>U){win.push(s);}else win.push(0);
      if(win.length>20)win.shift();
      const ms=win.filter(x=>x>0);
      if(ms.length>=2){
        const am=ms.reduce((a,b)=>a+b,0)/ms.length;
        const g=opt.gainMode==='margin'?0.5*am:0.05*(1-U);
        U=Math.min(1,U+g); byLv[lv]=(byLv[lv]||0)+1; gainByLv[lv]=(gainByLv[lv]||0)+g; win.length=0;
      }
      A=Math.max(0,Math.min(U,A+0.1*(s-A)));
    }
    const tot=Object.values(byLv).reduce((a,b)=>a+b,0);
    const c=Object.entries(byLv).map(([lv,n])=>`${lv} ${n}次(+${p3(gainByLv[lv])})`).join('  ');
    console.log(`    ${t.padEnd(5)} U=${p3(U).padStart(5)}  上浮${String(tot).padStart(3)}次  ${c||'（无）'}`);
  }
}

console.log('\n【3.3】加「涨幅按超出量」能否压低弱者的 U');
console.log('  较弱档 U 的来源是「偶尔做对一道难题」→ 触发次数少但每次都涨满');
console.log('  若涨幅 ∝ 超出量，偶尔小超就涨得少：');
console.log('\n  k 值        较强U   偏上U   中位U   较弱U   U跨度   较弱A');
for (const k of [0.2, 0.3, 0.5, 0.8, 1.2, 2.0]) {
  const r={}; for(const t of Object.keys(TIERS)) r[t]=avg(x=>run(x,2000,{W:20,need:2,gainMode:'margin',k}),t);
  const Us=Object.values(r).map(x=>x.U);
  console.log(`  ${k.toFixed(1)}        ${p3(r.较强.U).padStart(6)} ${p3(r.偏上.U).padStart(7)} ${p3(r.中位.U).padStart(7)} ${p3(r.较弱.U).padStart(7)} ${p3(Math.max(...Us)-Math.min(...Us)).padStart(7)} ${p3(r.较弱.A).padStart(7)}`);
}
console.log(L);
