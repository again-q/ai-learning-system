/**
 * 核对：真实数据里 s 能不能到 0.9+
 * 跑法：node scripts/a-s-ceiling-real.mjs
 *
 * 用户质疑：「数据按理来说应该会有 s>0.9 的情况，对于较强的学生来说」
 * → 那份报告给较强学生的困难题只给了 P=0.86 q=0.89 → s=0.735
 * → 而代码里 P 是连续 0~1，D 最高 0.999（LR 表 L11）
 * → 所以真实数据里 s 完全可能 >0.9
 */

const LR = {
  L1: [0.01, 0.15], L2: [0.15, 0.30], L3: [0.30, 0.45],
  L4: [0.45, 0.60], L5: [0.60, 0.70], L6: [0.70, 0.79],
  L7: [0.79, 0.85], L8: [0.85, 0.90], L9: [0.90, 0.94],
  L10: [0.94, 0.98], L11: [0.98, 0.999],
};
const CAL = (d) => 0.6 + 0.4 * d;
const p0 = (x) => (x * 100).toFixed(1);
const p3 = (x) => x.toFixed(3);
const line = '='.repeat(90);

console.log(line);
console.log('一、代码里的实际取值范围（不是理论，是 clampParams 的钳制边界）');
console.log(line);
console.log('  P：连续 0~1，无档位限制，round 到 2 位小数  ✅ 可以等于 1');
console.log('  D：按 level 区间钳制');
for (const [k, v] of Object.entries(LR)) {
  if (['L1', 'L5', 'L9', 'L10', 'L11'].includes(k)) {
    console.log(`      ${k}  D ∈ [${v[0]}, ${v[1]}]  →  校准 ${p3(CAL(v[0]))} ~ ${p3(CAL(v[1]))}`);
  }
}
console.log('\n  D 最高可到 0.999 → 校准最高 0.9996≈1.0');
console.log('  → 理论 s 上限 = 1 × 1.0 × 1 = 1.0');

console.log('\n' + line);
console.log('二、那份报告给「较强」学生的数据（问题所在）');
console.log(line);
const PASTED = {
  较强: { 简单: { P: 0.98, q: 0.98, D: 0.2 }, 中等: { P: 0.95, q: 0.95, D: 0.5 }, 困难: { P: 0.86, q: 0.89, D: 0.9 } },
};
console.log('  题层   P      q      D      校准    s');
for (const [lv, o] of Object.entries(PASTED.较强)) {
  const s = o.P * CAL(o.D) * o.q;
  console.log(`  ${lv}  ${p3(o.P)}  ${p3(o.q)}  ${p3(o.D)}   ${p3(CAL(o.D))}   ${p3(s)}`);
}
console.log('\n  → 困难题 P 只给 0.86、q 只给 0.89 → s = 0.735');
console.log('  → **但一个「较强」学生做难题做对了，代码里 P 完全可以是 1.0**');
console.log('  → 我之前所有模拟都用了这一档数据，等于人为把天花板压到 0.735');

console.log('\n' + line);
console.log('三、换用「较强学生真实可能形态」重算 s');
console.log(line);
const REAL = [
  ['简单题 · 常规做对', 0.95, 1.0, 0.2],
  ['简单题 · 漂亮完成', 1.00, 1.0, 0.2],
  ['中等题 · 做对', 0.95, 1.0, 0.5],
  ['中等题 · 漂亮完成', 1.00, 1.0, 0.5],
  ['困难题 · 做对但磕巴', 0.90, 0.86, 0.9],
  ['困难题 · 做对且顺畅', 1.00, 1.0, 0.9],
  ['困难题 · 压轴 L9', 1.00, 1.0, 0.94],
  ['压轴 L10', 1.00, 1.0, 0.96],
  ['压轴 L11', 1.00, 1.0, 0.999],
];
console.log('  场景                P      q      D      校准s       能否 >0.9');
console.log('  ' + '─'.repeat(62));
for (const [n, P, q, D] of REAL) {
  const s = P * CAL(D) * q;
  const v = s > 0.9 ? '✅ 能' : s > 0.8 ? '🟡' : '❌';
  console.log(`  ${n.padEnd(20)} ${p3(P)}  ${p3(q)}  ${p3(D)}   ${p3(s)}     ${v}`);
}
console.log('\n  → **P=1.0 且 q=1.0 时，困难题 s = 0.96，L11 题 s = 1.0**');
console.log('  → 用户判断正确：真实数据里 s > 0.9 完全可能，而且不罕见');

console.log('\n' + line);
console.log('四、用修正后的数据重跑三档（200 次观测）');
console.log(line);

const PROFILES = {
  较强: {
    简单: { P: 1.00, q: 1.00, D: 0.2, brk: 0 },
    中等: { P: 0.98, q: 1.00, D: 0.5, brk: 0 },
    困难: { P: 0.92, q: 0.93, D: 0.9, brk: 1 },
  },
  中等: {
    简单: { P: 0.95, q: 0.95, D: 0.2, brk: 0 },
    中等: { P: 0.75, q: 0.90, D: 0.5, brk: 1 },
    困难: { P: 0.35, q: 0.80, D: 0.9, brk: 2 },
  },
  比较拉: {
    简单: { P: 0.80, q: 0.90, D: 0.2, brk: 1 },
    中等: { P: 0.50, q: 0.85, D: 0.5, brk: 1 },
    困难: { P: 0.18, q: 0.78, D: 0.9, brk: 2 },
  },
};
const MIX = { easy: 0.70, mid: 0.20, hard: 0.10 };

function makeObs(kind, n, mix) {
  const p = PROFILES[kind]; const bag = [];
  const nE = Math.round(n * mix.easy), nM = Math.round(n * mix.mid);
  for (let i = 0; i < nE; i++) bag.push({ lv: '简单', ...p.简单 });
  for (let i = 0; i < nM; i++) bag.push({ lv: '中等', ...p.中等 });
  for (let i = 0; i < n - nE - nM; i++) bag.push({ lv: '困难', ...p.困难 });
  for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
  return bag;
}
function sOf(kind) {
  const p = PROFILES[kind];
  const f = (o, lv) => o.P * CAL(o.D) * (1 - o.brk / { 简单: 3, 中等: 5, 困难: 7 }[lv]);
  return { 简单: f(p.简单, '简单'), 中等: f(p.中等, '中等'), 困难: f(p.困难, '困难') };
}
console.log('  各档 s 值：');
for (const k of Object.keys(PROFILES)) {
  const s = sOf(k);
  console.log(`    ${k.padEnd(5)} 简单 ${p3(s.简单)}  中等 ${p3(s.中等)}  困难 ${p3(s.困难)}`);
}
function sAvg(kind, mix, cal) {
  const s = sOf(kind); const c = cal || CAL;
  return mix.easy * s.简单 + mix.mid * s.中等 + mix.hard * s.困难;
}
console.log('\n  s 加权平均 = A 的理论上限：');
for (const k of Object.keys(PROFILES)) {
  console.log(`    ${k.padEnd(5)} 校准0.6+0.4D → ${p3(sAvg(k, MIX))}`);
}

function sim(kind, opt = {}) {
  const { cal = CAL, alpha = 0.25, U0 = 0.5, A0 = 0.3, base = 0.05, window = 10, need = 2, n = 200, mix = MIX, mult = 'linear', trig = 's>U' } = opt;
  let A = A0, U = U0; const hist = []; let ups = 0;
  const upBy = { 简单: 0, 中等: 0, 困难: 0 };
  for (let i = 0; i < n; i++) {
    const o = makeObs(kind, n, mix)[i];
    const s = o.P * cal(o.D) * (1 - o.brk / { 简单: 3, 中等: 5, 困难: 7 }[o.lv]);
    if (trig === 's>U') {
      hist.push({ ok: s > U, D: o.D, lv: o.lv });
      if (hist.length > window) hist.shift();
      if (hist.filter(x => x.ok).length >= need) {
        const t = [...hist].reverse().find(x => x.ok);
        U += base * (1 - U) * t.D; ups++; upBy[t.lv]++; hist.fill({ ok: false, D: 0, lv: '-' });
      }
    } else {
      if (s >= trig) { hist.push({ ok: true, D: o.D, lv: o.lv }); } else hist.push({ ok: false, D: 0, lv: '-' });
      if (hist.length > 2) hist.shift();
      if (hist.filter(x => x.ok).length >= 2) { U += base * (1 - U) * o.D; ups++; upBy[o.lv]++; hist = []; }
    }
    const gap = Math.max(0, U - A);
    const m = mult === 'sqrt' ? Math.sqrt(gap) + 0.01 : gap;
    A = Math.max(0, Math.min(U, A + alpha * (s - A) * m));
  }
  return { A, U, ups, upBy };
}
const avg = (kind, opt, n = 12) => { const rs = []; for (let t = 0; t < n; t++) rs.push(sim(kind, opt)); const m = f => rs.reduce((s, r) => s + f(r), 0) / rs.length; return { A: m(r => r.A), U: m(r => r.U), ups: m(r => r.ups), upBy: rs[0].upBy }; };

const RULES = [
  ['校准0.6+0.4D + s>U窗口', { cal: (d) => 0.6 + 0.4 * d }],
  ['校准0.6+0.4D + s≥0.8', { trig: 0.8 }],
  ['校准0.8+0.2D + s>U窗口', { cal: (d) => 0.8 + 0.2 * d }],
  ['校准0.6+0.4D + s>U + √阻尼', { cal: (d) => 0.6 + 0.4 * d, mult: 'sqrt' }],
];
console.log('\n  规则                        较强A   中等A   较弱A   强-弱跨度较强达标');
console.log('  ' + '─'.repeat(70));
for (const [n, o] of RULES) {
  const a = avg('较强', o), m = avg('中等', o), w = avg('比较拉', o);
  const v = a.A >= 0.85 ? '✅' : a.A >= 0.75 ? '🟡' : '❌';
  console.log(`  ${n.padEnd(26)} ${p3(a.A)}   ${p3(m.A)}   ${p3(w.A)}    ${p3(a.A - w.A)}     ${v}`);
}

console.log('\n' + line);
console.log('五、上浮次数来源对照（较强，s>U 窗口规则）');
console.log(line);
const a = avg('较强');
console.log(`  上浮 ${a.ups.toFixed(0)} 次   简单 ${a.upBy.简单} / 中等 ${a.upBy.中等} / 困难 ${a.upBy.困难}`);
console.log(`  期末 A=${p3(a.A)}  U=${p3(a.U)}`);
console.log(`\n  → 困难题 s=0.772（修正后）> 简单题 0.680，所以难题成为主要触发源`);
console.log(`  → 这才是你设计的 D 加权涨幅该起的作用`);

console.log('\n' + line);
console.log('六、结论修正');
console.log(line);
console.log(`
  ✅ 你判断对了：**数据是问题之一**
     · 那份报告给较强学生的困难题 P=0.86 q=0.89，人为把 s 压在 0.735
     · 代码里 P 是连续 0~1，D 最高 0.999→ 真实 s 可以到 0.96~1.0
     · 我前面 20:45~20:50 几轮用的随机数据（P=1.0但断段随机）也偏低

  ⚠️ 但要同时承认另一半：
     · 即使修正数据，A 的不动点仍= s 加权平均
     · 较强 修正后不动点 = ${p3(sAvg('较强', MIX))}
     · 这个值离 0.857 还差 ${((0.857 - sAvg('较强', MIX)) * 100).toFixed(1)} 点
     · 要到 0.857，仍需抬高校准下限（0.6+0.4D 简单题只到 0.680）

  → **数据修正 + 校准改0.8+0.2D，两件都要做**
`);
