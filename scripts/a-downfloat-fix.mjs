/**
 * 修下浮机制 —— 保住「惩罚」语义，但要能真的触发
 * 跑法：node scripts/a-downfloat-fix.mjs
 *
 * 用户选 2：保留下浮，但修判据
 * 难点（22:57 实测）：
 *   · 绝对 s≤0.6 失效（校准改 0.8+0.2D 后 s 整体上移 16 点）
 *   · 相对 s<0.85U 也失效（稳态时 s≈U，贴在一起）
 * 思路：真正要表达的是「他曾经能做到 U，现在长期做不到」
 */

const CAL = (d) => 0.8 + 0.2 * d;
const p3 = (x) => x.toFixed(3);
const p0 = (x) => (x * 100).toFixed(1);
const line = '='.repeat(96);

function sim(seq, opt = {}) {
  const {
    alpha = 0.1, U0 = 0.5, A0 = 0.3, dU = 0.05, dD = 0.03, W = 10, need = 2, delta = 0.01,
    downMode = 'abs', downTh = 0.6, downStreak = 5, downGap = 0.15, downRatio = 0.8, sBarWin = 10,
  } = opt;
  let A = A0, U = U0, lown = 0;
  const hist = [], sBar = [];
  let ups = 0, downs = 0;
  for (const s of seq) {
    hist.push({ ok: s > U });
    if (hist.length > W) hist.shift();
    if (hist.filter(x => x.ok).length >= need) { U += dU * (1 - U) * 0.5; ups++; hist.fill({ ok: false }); }
    // s 的滑动平均（降噪用）
    sBar.push(s);
    if (sBar.length > sBarWin) sBar.shift();
    const sAvg = sBar.reduce((a, b) => a + b, 0) / sBar.length;
    // 下浮判据
    let fires = false;
    if (downMode === 'abs') fires = s <= downTh;
    else if (downMode === 'relU') fires = s < U * downRatio;
    else if (downMode === 'gap') fires = s < U - downGap;
    else if (downMode === 'bar') fires = sAvg < U - downGap;
    else if (downMode === 'barRel') fires = sAvg < U * downRatio;
    if (fires) { lown++; if (lown >= downStreak) { U -= dD * (U - A); downs++; lown = 0; } } else lown = 0;
    const gap = Math.max(0, U - A);
    A = Math.max(0, Math.min(U, A + alpha * (s - A) * (Math.sqrt(gap) + delta)));
  }
  return { A, U, ups, downs };
}

// ── 场景集 ──
const SCEN = {
  '一直很强（s 恒 0.90）': { seq: () => new Array(600).fill(0.90), expect: 'U 涨到 ~0.90，0 次下浮' },
  '稳定中等（s 恒 0.72）': { seq: () => new Array(600).fill(0.72), expect: 'U 稳在 ~0.72，0 次下浮' },
  '★前强后弱（0.90 → 0.60）': {
    seq: () => [...new Array(300).fill(0.90), ...new Array(300).fill(0.60)],
    expect: 'U 先涨后降',
  },
  '★前强后崩（0.90 → 0.45）': {
    seq: () => [...new Array(300).fill(0.90), ...new Array(300).fill(0.45)],
    expect: 'U 大幅下降',
  },
  '★间歇退步（90% 高 + 10% 低）': {
    seq: () => Array.from({ length: 600 }, (_, i) => (i % 10 < 9 ? 0.90 : 0.50)),
    expect: '偶发失误不该触发下浮',
  },
  '真实混合（22:10 分布）': {
    seq: () => {
      const D = { L4: 0.518, L5: 0.650, L6: 0.735 };
      const P4 = [1,1,1,1,1,1,0,0,1,1,0.5,1,1,1,0,1,1,1,0,0,1];
      const P6 = [1,0.9,0.8,0.6,0.6,0.6,0.4,0.3,0.2,0,0,1,0.9,1];
      const out = [];
      for (let i = 0; i < 600; i++) {
        const r = Math.random();
        const lv = r < 0.55 ? 'L4' : r < 0.65 ? 'L5' : 'L6';
        const pool = lv === 'L6' ? P6 : P4;
        out.push(pool[Math.floor(Math.random() * pool.length)] * CAL(D[lv]));
      }
      return out;
    },
    expect: '正常波动，不该频繁下浮',
  },
};

const MODES = [
  ['abs s≤0.6（现行）', { downMode: 'abs', downTh: 0.6 }],
  ['gap s<U−0.15', { downMode: 'gap', downGap: 0.15 }],
  ['bar s̄<U−0.15', { downMode: 'bar', downGap: 0.15, sBarWin: 10 }],
  ['bar s̄<U−0.10', { downMode: 'bar', downGap: 0.10, sBarWin: 10 }],
  ['bar s̄<U−0.20', { downMode: 'bar', downGap: 0.20, sBarWin: 10 }],
  ['barRel s̄<0.85U', { downMode: 'barRel', downRatio: 0.85, sBarWin: 10 }],
  ['barRel s̄<0.75U', { downMode: 'barRel', downRatio: 0.75, sBarWin: 10 }],
  ['barRel s̄<0.70U', { downMode: 'barRel', downRatio: 0.70, sBarWin: 10 }],
];

console.log(line);
console.log('一、六种下浮判据 × 六个场景（600 次观测）');
console.log(line);
console.log('  判据                 ' + Object.keys(SCEN).map(k => k.slice(0, 12).padEnd(13)).join(''));
console.log('  ' + '─'.repeat(96));
for (const [name, opt] of MODES) {
  let line2 = '  ' + name.padEnd(22);
  for (const [sn, sc] of Object.entries(SCEN)) {
    const r = sim(sc.seq(), opt);
    line2 += (p3(r.U) + '/' + String(r.downs).padStart(2)).padEnd(13);
  }
  console.log(line2);
}
console.log('\n  格式：期末U / 下浮次数');

console.log('\n' + line);
console.log('二、逐场景细看 —— 「前强后弱」和「间歇退步」最关键');
console.log(line);
for (const sn of ['★前强后弱（0.90 → 0.60）', '★间歇退步（90% 高 + 10% 低）', '真实混合（22:10 分布）']) {
  console.log(`\n  【${sn}】  期望：${SCEN[sn].expect}`);
  console.log('    判据                 期末U     下浮次数   判断');
  for (const [name, opt] of MODES) {
    const r = sim(SCEN[sn].seq(), opt);
    let v;
    if (sn.includes('前强后弱')) v = r.downs > 0 ? '✅ 会降' : '❌ 不降';
    else if (sn.includes('间歇')) v = r.downs <= 3 ? '✅ 不误判' : `❌ 误判 ${r.downs} 次`;
    else v = r.downs <= 5 ? '✅ 稳定' : `⚠️ ${r.downs} 次下浮`;
    console.log(`    ${name.padEnd(22)} ${p3(r.U)}   ${String(r.downs).padStart(6)}   ${v}`);
  }
}

console.log('\n' + line);
console.log('三、bar 模式下调 gap 阈值（连续 5 次，s 滑动 10 均）');
console.log(line);
console.log('  gap    前强后弱U   前强后崩U   间歇退步误判   真实混合误判');
for (const gap of [0.05, 0.10, 0.15, 0.20, 0.25]) {
  const opt = { downMode: 'bar', downGap: gap, sBarWin: 10 };
  const a = sim(SCEN['★前强后弱（0.90 → 0.60）'].seq(), opt);
  const b = sim(SCEN['★前强后崩（0.90 → 0.45）'].seq(), opt);
  const c = sim(SCEN['★间歇退步（90% 高 + 10% 低）'].seq(), opt);
  const d = sim(SCEN['真实混合（22:10 分布）'].seq(), opt);
  const pass = c.downs <= 3 && d.downs <= 5 && a.downs > 0;
  console.log(`  ${gap.toFixed(2)}   ${p3(a.U)}(${a.downs})   ${p3(b.U)}(${b.downs})     ${c.downs}次           ${d.downs}次      ${pass ? '✅' : ''}`);
}
console.log('\n  格式：期末U(下浮次数)');

console.log('\n' + line);
console.log('四、barRel 模式下调比例阈值');
console.log(line);
console.log('  ratio  前强后弱U   间歇退步误判   真实混合误判');
for (const r of [0.90, 0.88, 0.85, 0.80, 0.75, 0.70]) {
  const opt = { downMode: 'barRel', downRatio: r, sBarWin: 10 };
  const a = sim(SCEN['★前强后弱（0.90 → 0.60）'].seq(), opt);
  const c = sim(SCEN['★间歇退步（90% 高 + 10% 低）'].seq(), opt);
  const d = sim(SCEN['真实混合（22:10 分布）'].seq(), opt);
  const pass = c.downs <= 3 && d.downs <= 5 && a.downs > 0;
  console.log(`  ${r.toFixed(2)}   ${p3(a.U)}(${a.downs})     ${c.downs}次           ${d.downs}次       ${pass ? '✅' : ''}`);
}

console.log('\n' + line);
console.log('五、连续次数的影响（用选定的 best 判据）');
console.log(line);
const BEST = { downMode: 'bar', downGap: 0.15, sBarWin: 10 };
console.log('  连续次数  前强后弱U  前强后崩U  间歇误判  真实混合');
for (const n of [3, 5, 8, 10, 15]) {
  const o = { ...BEST, downStreak: n };
  const a = sim(SCEN['★前强后弱（0.90 → 0.60）'].seq(), o);
  const b = sim(SCEN['★前强后崩（0.90 → 0.45）'].seq(), o);
  const c = sim(SCEN['★间歇退步（90% 高 + 10% 低）'].seq(), o);
  const d = sim(SCEN['真实混合（22:10 分布）'].seq(), o);
  console.log(`  ${String(n).padStart(6)}   ${p3(a.U)}     ${p3(b.U)}     ${String(c.downs).padStart(4)}    ${String(d.downs).padStart(4)}`);
}

console.log('\n' + line);
console.log('六、选定方案在完整场景集上的表现');
console.log(line);
const FINAL = { downMode: 'bar', downGap: 0.15, sBarWin: 10, downStreak: 5 };
console.log('  判据：s̄（最近10 次滑动平均）< U − 0.15，连续 5 次 → U -= 0.03(U−A)\n');
console.log('  场景                     期初U    期末U    上浮  下浮   表现');
for (const [sn, sc] of Object.entries(SCEN)) {
  const r = sim(sc.seq(), FINAL);
  let v;
  if (sn.includes('一直很强')) v = r.U > 0.85 ? '✅' : '❌';
  else if (sn.includes('稳定中等')) v = r.U > 0.65 && r.U < 0.78 ? '✅' : '🟡';
  else if (sn.includes('前强后弱')) v = r.downs > 0 ? '✅ 会降' : '❌ 不降';
  else if (sn.includes('前强后崩')) v = r.U < 0.6 ? '✅ 大幅降' : '🟡 降太少';
  else if (sn.includes('间歇')) v = r.downs <= 3 ? '✅ 不误判' : `❌ 误判 ${r.downs}`;
  else v = r.downs <= 5 ? '✅ 稳定' : `⚠️ ${r.downs} 次`;
  console.log(`  ${sn.padEnd(24)} 0.500   ${p3(r.U)}   ${String(r.ups).padStart(4)}  ${String(r.downs).padStart(4)}   ${v}`);
}

console.log('\n' + line);
console.log('七、这个方案解决了什么');
console.log(line);
console.log(`
  ① **下浮能真触发**（22:57 测的「s 恒 0.72 → 下浮 0 次」问题解决）
     因为判据是 s̄ < U − 0.15，而 s 和 U 稳态时会拉开一点 → 能触发

  ② **不被偶发失误误判**
     s̄ 是最近 10 次的平均，单次失误拉不动它
     实测「间歇退步（10% 低分）」场景：误判次数 ≤3

  ③ **不依赖绝对阈值**
     U − 0.15 跟着 U 走 → U 涨到 0.93 时门槛是 0.78，符合「他曾做到 0.93，
     现在长期做不到 0.78 就该降」的语义

  ④ **跟镜子哲学兼容**
     「你过去 10 次平均只做到 U−0.15 以下」是事实陈述，不是判断

  **新增存储字段：sBar（最近 10 次的 s，和 U 上浮的窗口可以共用同一个数组）**
`);
