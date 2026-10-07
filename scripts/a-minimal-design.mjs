/**
 * 从头构想：极简版A（只保留天花板机制）
 * 跑法：node scripts/a-minimal-design.mjs
 *
 * 目标：砍掉今天 9 处改动里属于「补丁」的部分，只留必需骨架
 */

const CAL = (d) => 0.8 + 0.2 * d;
const p3 = (x) => x.toFixed(3);
const line = '='.repeat(94);

// ─────────────────────────────────────────────────────────────
// 第一层：什么是必需的
// ─────────────────────────────────────────────────────────────
console.log(line);
console.log('一、今天 9 处改动，按「必需 / 补丁 / 可疑」分类');
console.log(line);
const CHANGES = [
  ['1', '校准 0.6+0.4D → 0.8+0.2D', '补丁', '70% 是简单题，0.6+0.4D 让它上限 0.68 → 锁死不动点'],
  ['2', '删掉 q', '必需', 'q 的输入已撤（segments 62% 不一致）'],
  ['3', 'α 0.25 → 0.1', '参数', '量级对齐 §5.6 设计'],
  ['4', '√阻尼 + δ=0.01', '补丁', '线性阻尼下 gap 小时锁死'],
  ['5', 'errorLevel 闸门', '必需', '算错本来就该进 A'],
  ['6', 'η 移除', '必需', '路径质量归 T'],
  ['7', '触发 s≥0.8 → s>U', '必需', '绝对阈值让新手死锁'],
  ['8', 'U 涨幅 × D', '补丁', '压住简单题灌水'],
  ['9', '下浮改 s̄<U−0.15', '补丁', '绝对 0.6 是旧校准产物'],
];
for (const [n, c, kind, why] of CHANGES) {
  console.log(`  ${n}. ${c.padEnd(28)} 【${kind}】${why}`);
}
const bugs = CHANGES.filter(c => c[2] === '补丁').length;
console.log(`\n  → 9 处里有 ${bugs} 处是「补丁」（为修前面一处引入的问题）`);
console.log('  → 补丁越多，说明骨架越不对');

// ─────────────────────────────────────────────────────────────
// 第二层：从头推
// ─────────────────────────────────────────────────────────────
console.log('\n' + line);
console.log('二、从头推导 —— 三个问题');
console.log(line);
console.log(`
  Q1：要测什么？
      A = 在已知要用这个知识点的前提下，完成步骤并得出正确答案的能力

  Q2：一次作答能给什么信息？
      只能给一个数：**P**（过程与正确答案的距离，0~1）
      模型判的，没有别的

  Q3：为什么需要两个数？
      一次 P 只能说明「这一次」，说明不了「他现在到哪」
      → 需要一个跟随最近水平的数（A）
      → 需要一个记录他到过哪里的数（U）
      → 这就是「天花板机制」的全部理由
`);

console.log(line);
console.log('三、极简设计：只有三个量');
console.log(line);
console.log(`
  ┌────────────────────────────────────────────────────────┐
  │观测：每次作答得到 P ∈ [0,1]                            │
  │                                                        │
  │ A ← 当前能力（跟随最近）│
  │    A += α × (P − A)                                   │
  │    clamp(A, 0, U)                                     │
  │                                                        │
  │ U ← 天花板（他到过的最高）                             │
  │    若 P > U 且这是第 2 次 →U += δ × (1 − U)│
  │    否则不动（U 只涨不跌）│
  │                                                        │
  │ A₀ = 0.30   U₀ = 0.50   α = 0.1   δ = 0.05              │
  └────────────────────────────────────────────────────────┘

  **没有的东西**（对比今天）：
  ✗ 难度校准 0.8+0.2D    → s = P，直接用 P
  ✗ √阻尼 + δ=0.01       → 线性阻尼 (U−A)
  ✗ U 涨幅 × D           → 涨幅就是 0.05×(1−U)
  ✗ 下浮规则             → 删掉，U 只涨不跌
  ✗ s̄ 窗口               → 只存「上一次 P 是否 > U」一个布尔
`);

// ─────────────────────────────────────────────────────────────
// 第四层：验证极简版
// ─────────────────────────────────────────────────────────────
const PD = {
  L4: { D: 0.518, P: [1,1,1,1,1,1,0,0,1,1,0.5,1,1,1,0,1,1,1,0,0,1] },
  L5: { D: 0.650, P: [1,1,1,1] },
  L6: { D: 0.735, P: [1,0.9,0.8,0.6,0.6,0.6,0.4,0.3,0.2,0,0,1,0.9,1] },
};
const MIX = [['L4',0.55],['L5',0.10],['L6',0.35]];

function gen(n, lift) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = Math.random(); let lv='L4', acc=0;
    for (const [L,p] of MIX) { acc+=p; if (r<=acc) { lv=L; break; } }
    const pool = PD[lv].P;
    const strength = lift + 0.5;
    const base = (1-strength)*(pool.length-1);
    const idx = Math.max(0, Math.min(pool.length-1, Math.round(base+(Math.random()-0.5)*1.2)));
    out.push({ P: pool[idx], D: PD[lv].D, lv });
  }
  return out;
}

function simMin(seq, opt={}) {
  const { alpha=0.1, U0=0.5, A0=0.3, dU=0.05, need=2, useCal=true } = opt;
  let A=A0, U=U0, above=0, ups=0;
  for (const o of seq) {
    const P = o.P;
    if (P > U) { above++; if (above >= need) { U += dU*(1-U); ups++; above=0; } }
    else above = 0;
    A = Math.max(0, Math.min(U, A + alpha*(P-A)));
  }
  return { A, U, ups };
}

function simFull(seq, opt={}) {
  const { alpha=0.1, U0=0.5, A0=0.3, dU=0.05, dD=0.03, delta=0.01, barN=10, dnGap=0.15, dnStreak=5 } = opt;
  let A=A0, U=U0, lown=0; const bar=[]; let ups=0, downs=0;
  for (const o of seq) {
    const s = o.P * CAL(o.D);
    bar.push({s, D:o.D}); if (bar.length>barN) bar.shift();
    const sAvg = bar.reduce((a,b)=>a+b.s,0)/bar.length;
    if (sAvg > U) { U += dU*(1-U)*bar[bar.length-1].D; ups++; bar.length=0; }
    const sA2 = bar.length? bar.reduce((a,b)=>a+b.s,0)/bar.length : s;
    if (sA2 < U - dnGap) { lown++; if (lown>=dnStreak){ U-=dD*(U-A); downs++; lown=0; } } else lown=0;
    const gap=Math.max(0,U-A);
    A=Math.max(0,Math.min(U,A+alpha*(s-A)*(Math.sqrt(gap)+delta)));
  }
  return { A, U, ups, downs };
}

console.log('四、极简版 vs 现行版（真实 P 分布，2000 次观测）');
console.log(line);
console.log('  档定义                lift    极简A     极简U    现行A     现行U');
const TIERS = [
  ['能做难题', 0.30],
  ['中等', 0.00],
  ['基础题也做不出', -0.40],
];
for (const [name, lift] of TIERS) {
  const seq = gen(2000, lift);
  let m1=0,m1u=0,m2=0,m2u=0;
  const R=15;
  for (let t=0;t<R;t++){ const s=gen(2000,lift); const a=simMin(s); m1+=a.A; m1u+=a.U; const b=simFull(s); m2+=b.A; m2u+=b.U; }
  console.log(`  ${name.padEnd(20)} ${(lift>=0?'+':'')}${lift.toFixed(2)}  ${p3(m1/R)}   ${p3(m1u/R)}   ${p3(m2/R)}   ${p3(m2u/R)}`);
}

console.log('\n' + line);
console.log('五、极简版的关键性质检验');
console.log(line);
const tests = [
  ['恒定P=0.90（一直很强）', () => Array.from({length:2000},()=>({P:0.90,D:0.5}))],
  ['恒定P=0.60（一直中等）', () => Array.from({length:2000},()=>({P:0.60,D:0.5}))],
  ['恒定P=0.30（一直很弱）', () => Array.from({length:2000},()=>({P:0.30,D:0.5}))],
  ['★前强后弱 0.9→0.3', () => [...Array.from({length:1000},()=>({P:0.90,D:0.5})), ...Array.from({length:1000},()=>({P:0.30,D:0.5}))]],
  ['★间歇 90%高+10%低', () => Array.from({length:2000},(_,i)=>({P:i%10<9?0.90:0.30,D:0.5}))],
  ['真实混合（较强）', () => gen(2000, 0.30)],
  ['真实混合（中等）', () => gen(2000, 0.00)],
  ['真实混合（较弱）', () => gen(2000, -0.40)],
];
console.log('  场景                     极简A     极简U   现行A     现行U   两者差');
for (const [name, g] of tests) {
  const R=12; let m1=0,m1u=0,m2=0,m2u=0;
  for (let t=0;t<R;t++){ const s=g(); const a=simMin(s); m1+=a.A; m1u+=a.U; const b=simFull(s); m2+=b.A; m2u+=b.U; }
  const d1=m1/R, d2=m2/R;
  const v = Math.abs(d1-d2) < 0.08 ? '✅接近' : Math.abs(d1-d2) < 0.15 ? '🟡' : '❌差很多';
  console.log(`  ${name.padEnd(24)} ${p3(d1)}   ${p3(m1u/R)}   ${p3(d2)}   ${p3(m2u/R)}   ${p3(d1-d2)} ${v}`);
}

console.log('\n' + line);
console.log('六、极简版缺了什么 —— 诚实清单');
console.log(line);
console.log(`
  缺① **难度不进了**
     极简版 A = P 的 EWMA，不看题目难度
     → 一个做难题全对的学生和一个做简单题全对的学生，A 一样
     → 这是极简版最大的代价

     能否接受？取决于 A 是什么：
     · 若 A = 「他执行得顺不顺」→ 不需要难度 ✅
     · 若 A = 「他到什么水平了」→ 需要难度 ❌

  缺② **下浮没了**
     U 只涨不跌 → 学生退步时 U 不反映
     → 报告上必须同时显示 A 和 U（「当前0.60 / 达到过0.93」）
     → 这不是缺陷，是「镜子只照事实」的必然

  缺③ **A 的趋近速度变慢**
     线性阻尼在 gap 小时更新量趋零 → A 停在 U 下方不动
     → 实测：恒定 P=0.90 时 A 能到多少？要看下面第七节
`);

console.log(line);
console.log('七、极简版的 A 能不能贴住 U（线性阻尼的代价）');
console.log(line);
for (const p of [0.90, 0.70, 0.50, 0.30]) {
  const seq = Array.from({length:2000},()=>({P:p,D:0.5}));
  const r = simMin(seq);
  console.log(`  恒定 P=${p}  →  A=${p3(r.A)}  U=${p3(r.U)}  U−A=${p3(r.U-r.A)}`);
}
console.log('\n  → 线性阻尼下A 会停在 U 下方一小段，收敛很慢');
console.log('  → 但这个「一小段」恰好让 A 和 U 不会完全重合 —— 也许不是坏事');

console.log('\n' + line);
console.log('八、要不要保留难度 —— 折中方案实测');
console.log(line);
console.log('  方案甲：s = P（完全不用难度）');
console.log('  方案乙：s = P × (0.5 + 0.5D)（弱权重）');
console.log('  方案丙：s = P × (0.8 + 0.2D)（现行的）\n');
console.log('  档                甲A     乙A     丙A     甲U     乙U     丙U');
for (const [name, lift] of TIERS) {
  const R=12; const r={甲:0,乙:0,丙:0,u甲:0,u乙:0,u丙:0};
  for (let t=0;t<R;t++){
    const s=gen(2000,lift);
    for(const [k,cal] of [['甲',null],['乙',d=>0.5+0.5*d],['丙',d=>0.8+0.2*d]]){
      const ss = s.map(o=>({s: cal? o.P*cal(o.D) : o.P, D:o.D}));
      const res = simMin2(ss);
      r[k]+=res.A; r['u'+k]+=res.U;
    }
  }
  console.log(`  ${name.padEnd(16)} ${p3(r.甲/R)}  ${p3(r.乙/R)}  ${p3(r.丙/R)}  ${p3(r.u甲/R)}  ${p3(r.u乙/R)}  ${p3(r.u丙/R)}`);
}
function simMin2(seq, opt={}) {
  const {alpha=0.1,U0=0.5,A0=0.3,dU=0.05,need=2}=opt;
  let A=A0,U=U0,above=0;
  for(const o of seq){
    if(o.s>U){above++; if(above>=need){U+=dU*(1-U); above=0;}} else above=0;
    A=Math.max(0,Math.min(U,A+alpha*(o.s-A)));
  }
  return {A,U};
}

console.log('\n' + line);
console.log('九、极简版的存储需求');
console.log(line);
console.log(`
  现行版需要：
    unit_progress: aValue, aUpper, n, lowEtaStreak, sHiStreak, lastS, algorithm
                   + 窗口 10 个布尔（U 上浮用）
                   + s 滑动窗口 10 个数（s̄ 上浮 + 下浮用）

  极简版只需要：
    unit_progress: aValue, aUpper, n, lastP, aboveStreak, algorithm
                   **aboveStreak 是 0/1**（上一次 P 是否 > U）
  → 从「10+10 个数」降到「1 个 0/1」
`);
