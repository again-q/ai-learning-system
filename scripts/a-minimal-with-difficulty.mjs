/**
 * 极简版 + 难度 —— 难度系数怎么定
 * 跑法：node scripts/a-minimal-with-difficulty.mjs
 *
 * 用户定：「题目难度也要」
 * 骨架：s = P × 校准(D)，A = EWMA，U 只涨不跌
 * 待定：校准用 0.6+0.4D 还是别的
 */

const p3 = (x) => x.toFixed(3);
const line = '='.repeat(94);

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

function sim(seq, cal, opt={}) {
  const { alpha=0.1, U0=0.5, A0=0.3, dU=0.05, need=2 } = opt;
  let A=A0, U=U0, above=0, ups=0;
  for (const o of seq) {
    const s = o.P * cal(o.D);
    if (s > U) { above++; if (above >= need) { U += dU*(1-U); ups++; above=0; } } else above=0;
    A = Math.max(0, Math.min(U, A + alpha*(s-A)));
  }
  return { A, U, ups };
}

const TIERS = [['能做难题',0.30,0.85],['中等',0.00,0.60],['基础题也做不出',-0.40,0.40]];

console.log(line);
console.log('一、难度系数的三种取法（骨架固定：s=P×cal，A=EWMA，U 只涨不跌）');
console.log(line);
const CALS = [
  ['0.6 + 0.4D', d => 0.6 + 0.4*d],
  ['0.7 + 0.3D', d => 0.7 + 0.3*d],
  ['0.8 + 0.2D', d => 0.8 + 0.2*d],
];
console.log('  难度系数   简单上限  中等上限  困难上限  极差');
for (const [n, f] of CALS) {
  const a=f(0.2), b=f(0.5), c=f(0.9);
  console.log(`  ${n.padEnd(10)} ${p3(a)}     ${p3(b)}     ${p3(c)}     ${p3(c-a)}`);
}

console.log('\n' + line);
console.log('二、三档读数（2000 次观测，15 次平均）');
console.log(line);
console.log('  难度系数            能做难题      中等         基础题做不出  强-弱跨度');
console.log('  ' + '─'.repeat(72));
for (const [n, f] of CALS) {
  const out = [];
  for (const [, lift] of TIERS) {
    let a=0,u=0; const R=15;
    for (let t=0;t<R;t++){ const r=sim(gen(2000,lift), f); a+=r.A; u+=r.U; }
    out.push([a/R, u/R]);
  }
  console.log(`  ${n.padEnd(16)} ${p3(out[0][0])}/${p3(out[0][1])}  ${p3(out[1][0])}/${p3(out[1][1])}  ${p3(out[2][0])}/${p3(out[2][1])}   ${p3(out[0][0]-out[2][0])}`);
}

console.log('\n' + line);
console.log('三、对标你的基准 0.85 / 0.60 / 0.40');
console.log(line);
console.log('  难度系数            较强差    中等差    较弱差    最大差');
for (const [n, f] of CALS) {
  const ds = [];
  for (const [, lift, target] of TIERS) {
    let a=0; const R=15;
    for (let t=0;t<R;t++) a += sim(gen(2000,lift), f).A;
    ds.push((a/R - target)*100);
  }
  const mx = Math.max(...ds.map(Math.abs));
  console.log(`  ${n.padEnd(16)} ${ds[0]>=0?'+':''}${ds[0].toFixed(1)}    ${ds[1]>=0?'+':''}${ds[1].toFixed(1)}    ${ds[2]>=0?'+':''}${ds[2].toFixed(1)}     ${mx.toFixed(1)} 点`);
}

console.log('\n' + line);
console.log('四、难度权重到底解决什么问题 —— 单项检验');
console.log(line);
console.log('  测试：同一个学生，P 完全相同，只因题目难度不同，看 A 差多少\n');
console.log('  学生只做简单题vs 只做难题（P 相同）');
console.log('  ' + '─'.repeat(62));
console.log('  难度系数            只做简单A   只做难题A   差');
for (const [n, f] of CALS) {
  let a1=0,a2=0; const R=15;
  for (let t=0;t<R;t++){
    a1 += sim(Array.from({length:2000},()=>({P:0.95,D:0.2})), f).A;
    a2 += sim(Array.from({length:2000},()=>({P:0.95,D:0.9})), f).A;
  }
  console.log(`  ${n.padEnd(16)} ${p3(a1/R)}      ${p3(a2/R)}     ${p3((a1-a2)/R)}`);
}
console.log('\n  → 差越大，难度对 A 的影响越强');

console.log('\n' + line);
console.log('五、难度权重过强 / 过弱的代价');
console.log(line);
console.log('  0.8+0.2D（弱）：简单题上限 0.84 → 简单题做对也接近满分');
console.log('    → 后果：**做简单题就能拿高 A**，难题失去区分度');
console.log('    → 检验：');
for (const [n, f] of CALS) {
  let a=0; const R=15;
  for (let t=0;t<R;t++) a += sim(Array.from({length:2000},()=>({P:1.0,D:0.2})), f).A;
  console.log(`      ${n.padEnd(12)} 全做简单题且全对→ A = ${p3(a/R)}`);
}
console.log('\n  0.6+0.4D（强）：简单题上限 0.68 → 简单题做对只能到 0.68');
console.log('    → 后果：**70% 是简单题的话，A 的不动点被压低**');
console.log('    → 检验：不同配比下的 A（较强学生）');
console.log('      配比              0.6+0.4D   0.7+0.3D   0.8+0.2D');
const dists = [
  ['全简单', [[0,0],[0,0],[1,0]]],
  ['标准 55/10/35', MIX],
  ['偏难 30/20/50', [['L4',0.30],['L5',0.20],['L6',0.50]]],
];
for (const [name, mix] of dists) {
  const out=[];
  for (const [,f] of CALS) {
    let a=0; const R=12;
    for (let t=0;t<R;t++){
      const seq=[];
      for (let i=0;i<2000;i++){
        const r=Math.random(); let lv='L4',acc=0;
        for(const[L,p] of mix){acc+=p;if(r<=acc){lv=L;break;}}
        const pool=PD[lv].P; const strength=0.30+0.5;
        const base=(1-strength)*(pool.length-1);
        const idx=Math.max(0,Math.min(pool.length-1,Math.round(base+(Math.random()-0.5)*1.2)));
        seq.push({P:pool[idx],D:PD[lv].D});
      }
      a+=sim(seq,f).A;
    }
    out.push(p3(a/R));
  }
  console.log(`      ${name.padEnd(16)} ${out[0]}       ${out[1]}       ${out[2]}`);
}
console.log('\n  → 弱权重下 A 对配比不敏感（0.81~0.87），强权重下敏感（0.68~0.86）');
console.log('  → **这正是你要的：「难题做得多，A 才涨」**');

console.log('\n' + line);
console.log('六、结论');
console.log(line);
console.log(`
  难度必须进（你已定）→ s = P × 校准(D)

  校准取哪一条，看你要什么：
  · 0.6+0.4D  难度话语权最强，难题做得多 A 才涨，但简单题学生A 偏低
  · 0.7+0.3D  折中
  · 0.8+0.2D  难度话语权最弱，简单题也能拿高 A

  **我倾向 0.7 + 0.3D**：
  简单题上限 0.76（做对了算 0.76，不是 0.84 也不是 0.68）
  中等 0.85，困难 0.97 —— 难度区分度保留，A 读数不极端

  完整设计（6 个量，0 个补丁）：
  ┌──────────────────────────────────────────────────┐
  │  s  = P × (0.7 + 0.3D)                        │
  │  A += 0.1 × (s − A)，clamp(0, U)                │
  │  U：连续 2 次 s > U → U += 0.05 × (1 − U)       │
  │  U 只涨不跌│
  │  A₀=0.30   U₀=0.50                             │
  └──────────────────────────────────────────────────┘
`);
