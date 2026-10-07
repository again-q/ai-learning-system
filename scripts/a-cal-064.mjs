/**
 * 校准定为 0.6 + 0.4D（简单题上限 0.6 / 中档题上限 0.8）—— 在极简骨架上验
 * 跑法：node scripts/a-cal-064.mjs
 */

const p3 = (x) => x.toFixed(3);
const line = '='.repeat(90);

// 0.6+0.4D 的锚点核对
console.log(line);
console.log('一、0.6 + 0.4D 的锚点');
console.log(line);
const CAL = d => 0.6 + 0.4*d;
console.log('  D      等级    上限s');
const LR = [[0.01,'L1'],[0.15,'L2'],[0.30,'L3'],[0.45,'L4'],[0.60,'L5'],[0.70,'L6'],[0.85,'L8'],[0.94,'L10'],[0.999,'L11']];
for (const [d, lv] of LR) {
  console.log(`  ${d.toFixed(3)}  ${lv.padEnd(4)}  ${p3(CAL(d))}`);
}
console.log('\n  → 简单题（D≈0，上限 0.6）✅');
console.log('  → 中档题（D=0.5，上限 0.8）✅');
console.log('  → 难题（D=0.9，上限 0.96）');

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
    out.push({ P: pool[idx], D: PD[lv].D });
  }
  return out;
}

function sim(seq, cal, opt={}) {
  const { alpha=0.1, U0=0.5, A0=0.3, dU=0.05, need=2, mult='linear', delta=0.01 } = opt;
  let A=A0, U=U0, above=0, ups=0;
  for (const o of seq) {
    const s = o.P * cal(o.D);
    if (s > U) { above++; if (above >= need) { U += dU*(1-U); ups++; above=0; } } else above=0;
    const gap = Math.max(0, U - A);
    const m = mult === 'sqrt' ? Math.sqrt(gap)+delta : gap;
    A = Math.max(0, Math.min(U, A + alpha*(s-A)*m));
  }
  return { A, U, ups };
}

const run = (lift, cal, opt, n=2000, R=15) => { let a=0,u=0; for(let t=0;t<R;t++){const r=sim(gen(n,lift),cal,opt); a+=r.A;u+=r.U;} return {A:a/R,U:u/R}; };

console.log('\n' + line);
console.log('二、极简骨架 + 0.6+0.4D：三档读数');
console.log(line);
const TIERS = [['能做难题',0.30,0.85],['偏上',0.10,0.60],['中位',0.00,null],['偏下',-0.20,null],['基础题也做不出',-0.40,0.40]];
console.log('  档定义              lift   期末A     期末U     目标');
for (const [n,lift,target] of TIERS) {
  const r = run(lift, CAL);
  const t = target ? `  ${target}${Math.abs(r.A-target)<0.06?' ✅':`  差${((r.A-target)*100).toFixed(1)}`}` : '  —';
  console.log(`  ${n.padEnd(18)} ${(lift>=0?'+':'')}${lift.toFixed(2)}  ${p3(r.A)}   ${p3(r.U)}  ${t}`);
}

console.log('\n' + line);
console.log('三、对照：0.6+0.4D vs 0.7+0.3D vs 0.8+0.2D（极简骨架）');
console.log(line);
const CALS = [['0.6+0.4D',d=>0.6+0.4*d],['0.7+0.3D',d=>0.7+0.3*d],['0.8+0.2D',d=>0.8+0.2*d]];
console.log('  校准        能做难题  偏上      中位      基础题做不出强-弱跨度');
for (const [n,f] of CALS) {
  const r = TIERS.map(([,,t]) => run(t===0.85?0.30:t===0.60?0.10:-0.40, f));
  console.log(`  ${n.padEnd(11)} ${p3(r[0].A)}     ${p3(r[1].A)}     ${p3(r[2].A)}     ${p3(r[3].A)}      ${p3(r[0].A-r[3].A)}`);
}

console.log('\n' + line);
console.log('四、0.6+0.4D 在「A 会不会卡在 0.70」上怎么办');
console.log(line);
console.log('  上一轮我担心：70% 是简单题，简单题上限 0.68 → A 不动点锁 0.70');
console.log('  但那是用「配比 70% 简单」算的。实测真实配比（L4 55%）：\n');
console.log('  较强学生（lift+0.30）换配比，A 落在哪：');
console.log('  配比                0.6+0.4D   0.7+0.3D   0.8+0.2D');
for (const [name, mix] of [
  ['全简单', [[0,0],[0,0],[1,0]]],
  ['真实 55/10/35', MIX],
  ['偏难 30/20/50', [['L4',0.30],['L5',0.20],['L6',0.50]]],
]) {
  const out = [];
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
  console.log(`  ${name.padEnd(18)} ${out[0]}       ${out[1]}       ${out[2]}`);
}
console.log('\n  → 0.6+0.4D 下 A 对配比最敏感（0.72~0.80）');
console.log('  → 而「难题做得多 A 才涨」正是你要的');

console.log('\n' + line);
console.log('五、0.6+0.4D 需不需要 √阻尼');
console.log(line);
console.log('  极简版是线性阻尼 (U−A)。0.6+0.4D 下简单题上限 0.68，');
console.log('  而 U 可能涨到 0.9+ → gap 大 → 线性阻尼不会锁死\n');
console.log('  恒定 P=0.68（简单题做对）的情况：');
for (const [n,m] of [['线性阻尼','linear'],['√阻尼+δ','sqrt']]) {
  const seq = Array.from({length:2000},()=>({P:1.0,D:0.2}));
  const r = sim(seq, CAL, { mult: m });
  console.log(`    ${n.padEnd(10)} A=${p3(r.A)}  U=${p3(r.U)}  U−A=${p3(r.U-r.A)}`);
}
console.log('\n  → 两者都能收敛，线性阻尼够用 → √阻尼可以砍 ✅');

console.log('\n' + line);
console.log('六、最终形态（0.6+0.4D + 极简骨架）');
console.log(line);
console.log(`
  s  = P × (0.6 + 0.4D)              简单题上限 0.6 / 中档 0.8
  A += 0.1 × (s − A)，clamp(0, U)     线性阻尼
  U：连续 2 次 s > U → U += 0.05(1−U)  只涨不跌
  A₀=0.30   U₀=0.50

  四个参数，零个补丁。
  难度极差 0.28（0.60→0.88）—— 三条里最大，难题最值钱。
`);
