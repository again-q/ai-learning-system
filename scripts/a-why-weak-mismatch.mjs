/**
 * 为什么「较弱」档对不上 0.40 —— 反解
 * 跑法：node scripts/a-why-weak-mismatch.mjs
 *
 * 上一版扫描：任何参数组合都命中不了三档目标
 * 较强 0.82（目标0.85，差3.3）✅ 接近
 * 中等 0.50（目标0.60，差10.5）🟡
 * 较弱 0.66（目标0.40，差25.8）❌ 差太远
 *
 * 而校准 c 只能整体平移，不能压缩差距 → 需要看「较弱」这一档本身
 */

const CAL = (d) => 0.8 + 0.2 * d;
const p3 = (x) => x.toFixed(3);
const line = '='.repeat(96);

const PD = {
  L4: { D: 0.518, P: [1,1,1,1,1,1,0,0,1,1,0.5,1,1,1,0,1,1,1,0,0,1] },
  L5: { D: 0.650, P: [1,1,1,1] },
  L6: { D: 0.735, P: [1,0.9,0.8,0.6,0.6,0.6,0.4,0.3,0.2,0,0,1,0.9,1] },
};
const MIX = [['L4',0.55],['L5',0.10],['L6',0.35]];

function simA(seq, opt={}) {
  const { alpha=0.1, U0=0.5, A0=0.3, dU=0.05, dD=0.03, delta=0.01, barN=10, dnGap=0.15, dnStreak=8 } = opt;
  let A=A0, U=U0, lown=0; const bar=[];
  for (const o of seq) {
    const s = o.s;
    bar.push({s, D:o.D}); if (bar.length>barN) bar.shift();
    const sAvg = bar.reduce((a,b)=>a+b.s,0)/bar.length;
    if (sAvg > U) { U += dU*(1-U)*bar[bar.length-1].D; bar.length=0; }
    const sA2 = bar.length ? bar.reduce((a,b)=>a+b.s,0)/bar.length : s;
    if (sA2 < U - dnGap) { lown++; if (lown>=dnStreak){ U-=dD*(U-A); lown=0; } } else lown=0;
    const gap=Math.max(0,U-A);
    A=Math.max(0,Math.min(U,A+alpha*(s-A)*(Math.sqrt(gap)+delta)));
  }
  return {A,U};
}

console.log(line);
console.log('一、A 的不动点 = s 加权平均 → 要 A 到 0.40，s 加权平均必须 ≈ 0.40');
console.log(line);
console.log('  反解：不同「P 上限」下，s 加权平均是多少\n');
console.log('  假设某档学生所有题的 P 都≤ cap（他做不出来的题就是0）\n');
console.log('  P上限L4 s上限L5 s上限L6 s上限   s加权平均');
for (const cap of [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3]) {
  // 简化：L4 校准 0.904（用真实 D 均值），实际 s = cap × CAL(D)
  const s4 = cap * CAL(PD.L4.D), s5 = cap * CAL(PD.L5.D), s6 = cap * CAL(PD.L6.D);
  const sAvg = 0.55 * s4 + 0.10 * s5 + 0.35 * s6;
  const v = Math.abs(sAvg - 0.40) < 0.03 ? '✅ 命中' : sAvg > 0.40 ? '偏高' : '偏低';
  console.log(`  ${p3(cap)}   ${p3(s4)}  ${p3(s5)}  ${p3(s6)}    ${p3(sAvg)}    ${v}`);
}
console.log('\n  → **P 上限要压到 ~0.45~0.50，A 才可能到 0.40**');
console.log('  → 而我模拟的「较弱」lift=−0.28 只是把 P 往低分段取，没有真正压到 0.45');

console.log('\n' + line);
console.log('二、检验：lift 值对三档 s 加权平均的影响');
console.log(line);
function genAvg(lift, n=20000) {
  const out=[];
  for (let i=0;i<n;i++){
    const r=Math.random(); let lv='L4',acc=0;
    for(const[L,p] of MIX){acc+=p;if(r<=acc){lv=L;break;}}
    const pool=PD[lv].P;
    const strength=lift+0.5;
    const base=(1-strength)*(pool.length-1);
    const idx=Math.max(0,Math.min(pool.length-1,Math.round(base+(Math.random()-0.5)*1.2)));
    out.push(pool[idx]*CAL(PD[lv].D));
  }
  return out.reduce((a,b)=>a+b,0)/out.length;
}
console.log('  lift     s加权平均   A落点（约）  目标   差');
for (const lift of [0.30, 0.15, 0, -0.15, -0.28, -0.40, -0.50, -0.60]) {
  const sAvg = genAvg(lift);
  const seq = [];
  for (let i=0;i<3000;i++){
    const r=Math.random(); let lv='L4',acc=0;
    for(const[L,p] of MIX){acc+=p;if(r<=acc){lv=L;break;}}
    const pool=PD[lv].P;
    const strength=lift+0.5;
    const base=(1-strength)*(pool.length-1);
    const idx=Math.max(0,Math.min(pool.length-1,Math.round(base+(Math.random()-0.5)*1.2)));
    seq.push({s:pool[idx]*CAL(PD[lv].D),D:PD[lv].D});
  }
  let a=0; for(let t=0;t<10;t++) a+=simA(seq).A;
  a/=10;
  const target = lift>0.2?0.85:lift>-0.1?0.60:0.40;
  const d=(a-target)*100;
  console.log(`  ${(lift>=0?'+':'')}${lift.toFixed(2)}    ${p3(sAvg)}      ${p3(a)}      ${target}   ${(d>=0?'+':'')}${d.toFixed(1)}`);
}
console.log('\n  → **要 A 到 0.40，lift 要到 −0.5 左右**（P 大量落在 0~0.3）');

console.log('\n' + line);
console.log('三、所以问题不是公式，是「较弱」这一档的定义');
console.log(line);
console.log('  我用的 lift=−0.28 意思是「他取P 分布的中低段」');
console.log('  但实测 L6 的 P 分布有 1/0.9/0.8/0.6/0.6/0.6/0.4/0.3/0.2/0/0 ——中位 0.6');
console.log('  取中低段（0~0.6）→ s 加权平均 0.66 → A=0.66\n');
console.log('  而「比较拉」按你的经验基准 0.40，隐含 s 加权平均 0.40');
console.log('  → **他的 P 加权平均要只有 0.45 左右，即大量题 P=0**\n');
console.log('  这两件事可能都对：');
console.log('  · 「比较拉」= 做不出难题（但能做基础题）→ A 0.65左右');
console.log('  · 0.40 对应的是「基础题也做不出」→ 那更像是完全没学会');

console.log('\n' + line);
console.log('四、结论：三档的目标值需要重新确认');
console.log(line);
console.log('  实测（用 22:10 真实 P 分布 + lift 定义）：\n');
console.log('  档定义                lift      s加权平均  A落点');
for (const [name, lift] of [['能做难题', 0.30], ['中等', 0], ['做不出难题', -0.28], ['基础题也做不出', -0.50]]) {
  const sAvg = genAvg(lift);
  const seq=[];
  for (let i=0;i<3000;i++){
    const r=Math.random(); let lv='L4',acc=0;
    for(const[L,p] of MIX){acc+=p;if(r<=acc){lv=L;break;}}
    const pool=PD[lv].P; const strength=lift+0.5;
    const base=(1-strength)*(pool.length-1);
    const idx=Math.max(0,Math.min(pool.length-1,Math.round(base+(Math.random()-0.5)*1.2)));
    seq.push({s:pool[idx]*CAL(PD[lv].D),D:PD[lv].D});
  }
  let a=0; for(let t=0;t<10;t++) a+=simA(seq).A;
  a/=10;
  console.log(`  ${name.padEnd(20)} ${(lift>=0?'+':'')}${lift.toFixed(2)}     ${p3(sAvg)}      ${p3(a)}`);
}
console.log('\n  **→ 若按「真实 P 分布」定义三档，A 的落点是 0.82 / 0.50 / 0.66**');
console.log('  **→ 与你的 0.85 / 0.60 / 0.40 不匹配，主要差在「较弱」那档**');

console.log('\n' + line);
console.log('五、可选的处理方式');
console.log(line);
console.log(`
  甲 接受实测值：较强 0.82 / 中等 0.50 / 较弱 0.66
     问题：**顺序反了**（较弱 0.66 > 中等 0.50）→ 因为我给「中等」的lift=0
     落在 P 分布中位，而「较弱」lift=−0.28 只是稍低
     → **说明我的三档定义本身有问题**

  乙 重新定义三档（用 lift 拉开）
     较强 lift=+0.30（0.82）、中等 lift=0（0.50）、较弱 lift=−0.50（~0.42）
     → 这是真正的三档，且顺序正确

  丙 保持公式不变，只调校准 c 平移读数
     实测 c 只能整体平移，不能压缩档间差距（见第二节）

  **我建议乙+ 丙：先把三档定义修正（lift 拉开），再用 c 平移到目标刻度**
`);
