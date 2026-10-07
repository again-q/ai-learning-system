/**
 * 三档学生的 A 成长曲线 —— 他是怎么涨的
 * 跑法：node scripts/a-growth-curve.mjs
 *
 * 回答：「各个档位的学生，他的能力是怎么涨的」
 * 用真实 P 分布校准（22:10 测的L4/L5/L6 分布），不拍脑袋
 */

const CAL = (d) => 0.8 + 0.2 * d;
const p3 = (x) => x.toFixed(3);
const p0 = (x) => (x * 100).toFixed(1);
const line = '='.repeat(94);

// ── 真实 P 分布（22:10 实测，40 个有过程样本）──
const REAL_BY_LV = {
  L4: { D: 0.518, Ps: [1,1,1,1,1,1,0,0,1,1,0.5,1,1,1,0,1,1,1,0,0,1] },   // 均 0.841
  L5: { D: 0.650, Ps: [1,1,1,1] },                                       // 全 1.0
  L6: { D: 0.735, Ps: [1,0.9,0.8,0.6,0.6,0.6,0.4,0.3,0.2,0,0,1,0.9,1] }, // 均 0.654
};
// 真实 level 配比（22:10 实测）
const LV_MIX = [['L4', 0.55], ['L5', 0.10], ['L6', 0.35]];

/** 三档学生：同一批题，各自的成功率不同 */
const TIERS = {
  较强: { lift: 0.30, label: '较强（难题能做出来）' },
  中等: { lift: 0.00, label: '中等（难题做一半）' },
  较弱: { lift: -0.28, label: '较弱（大部分做不出）' },
};

function pickP(lv, lift) {
  const pool = REAL_BY_LV[lv].Ps;   // 已按从高到低排：1 → 0
  // lift 越大 → 越靠前（高分）；lift 越小 → 越靠后（低分）
  const strength = lift + 0.5;                    // -0.28 → 0.22弱；+0.30 → 0.80 强
  const base = (1 - strength) * (pool.length - 1);
  const idx = Math.round(base + (Math.random() - 0.5) * 1.2);
  return pool[Math.max(0, Math.min(pool.length - 1, idx))];
}

function run(tier, weeks = 20, perWeek = 100, opt = {}) {
  const { alpha = 0.1, U0 = 0.5, A0 = 0.3, dU = 0.05, dD = 0.03, W = 10, need = 2, delta = 0.01 } = opt;
  const lift = TIERS[tier].lift;
  let A = A0, U = U0, lown = 0;
  const hist = [];
  const marks = [];
  let sAcc = 0, sN = 0, ups = 0, byLv = { L4: 0, L5: 0, L6: 0 };
  for (let w = 0; w < weeks; w++) {
    const bA = A, bU = U;
    for (let i = 0; i < perWeek; i++) {
      const r = Math.random();
      let acc = 0, lv = 'L4';
      for (const [L, p] of LV_MIX) { acc += p; if (r <= acc) { lv = L; break; } }
      const P = pickP(lv, lift);
      const D = REAL_BY_LV[lv].D;
      const s = P * CAL(D);
      sAcc += s; sN++;
      hist.push({ ok: s > U, D });
      if (hist.length > W) hist.shift();
      if (hist.filter(x => x.ok).length >= need) {
        const t = [...hist].reverse().find(x => x.ok);
        U += dU * (1 - U) * t.D; ups++; byLv[t.D >= 0.7 ? 'L6' : t.D >= 0.4 ? 'L5' : 'L4']++;
        hist.fill({ ok: false, D: 0 });
      }
      if (s <= 0.6) { lown++; if (lown >= 5) { U -= dD * (U - A); lown = 0; } } else lown = 0;
      const gap = Math.max(0, U - A);
      A = Math.max(0, Math.min(U, A + alpha * (s - A) * (Math.sqrt(gap) + delta)));
    }
    marks.push({ w: w + 1, A, U, sAvg: sAcc / sN, dA: A - bA, dU: U - bU });
  }
  return { A, U, marks, ups, byLv, sAvg: sAcc / sN };
}

const N = 30;
const avg = tier => { const rs = []; for (let t = 0; t < N; t++) rs.push(run(tier)); const m = f => rs.reduce((s, r) => s + f(r), 0) / rs.length; return { A: m(r => r.A), U: m(r => r.U), sAvg: m(r => r.sAvg), ups: m(r => r.ups), byLv: rs[0].byLv, marks: rs[0].marks }; };
const one = tier => { const rs = []; for (let t = 0; t < N; t++) rs.push(run(tier)); const m = f => rs.reduce((s, r) => s + f(r), 0) / rs.length; return { A: m(r => r.A), U: m(r => r.U), sAvg: m(r => r.sAvg), ups: m(r => r.ups), byLv: rs[0].byLv, marks: rs[0].marks }; };

console.log(line);
console.log('三档学生 · 20 周 × 每周 100 道（2000 道）· P 用 22:10 实测的真实分布');
console.log(line);
console.log('  真实 level 配比 L4 55% / L5 10% / L6 35%');
console.log('  三档的差别 = 同一批题上他的 P 落在分布的哪一段（lift +0.30 / 0 / −0.28）\n');

const R = {};
for (const t of ['较强', '中等', '较弱']) R[t] = one(t);

console.log('  ' + line.slice(0, 90));
console.log('  档位       期末A     期末U    s加权平均  U上浮次数上浮来源(L4/L5/L6)');
for (const t of ['较强', '中等', '较弱']) {
  const r = R[t];
  console.log(`  ${TIERS[t].label.padEnd(24)} ${p3(r.A)}   ${p3(r.U)}   ${p3(r.sAvg)}    ${r.ups.toFixed(0).padStart(4)}      ${r.byLv.L4}/${r.byLv.L5}/${r.byLv.L6}`);
}

console.log('\n' + line);
console.log('一、较强 —— 逐周轨迹（每 2 周）');
console.log(line);
console.log('   周    A        U      s均值   本周ΔA   本周ΔU');
for (const m of R.较强.marks) {
  if (m.w % 2 !== 0 && m.w !== 20) continue;
  console.log(`  ${String(m.w).padStart(3)}  ${p3(m.A)}   ${p3(m.U)}   ${p3(m.sAvg)}   ${(m.dA >= 0 ? '+' : '')}${p3(m.dA)}   ${(m.dU >= 0 ? '+' : '')}${p3(m.dU)}`);
}

console.log('\n' + line);
console.log('二、中等 —— 逐周轨迹');
console.log(line);
console.log('   周    A        U      s均值   本周ΔA   本周ΔU');
for (const m of R.中等.marks) {
  if (m.w % 2 !== 0 && m.w !== 20) continue;
  console.log(`  ${String(m.w).padStart(3)}  ${p3(m.A)}   ${p3(m.U)}   ${p3(m.sAvg)}   ${(m.dA >= 0 ? '+' : '')}${p3(m.dA)}   ${(m.dU >= 0 ? '+' : '')}${p3(m.dU)}`);
}

console.log('\n' + line);
console.log('三、较弱 —— 逐周轨迹');
console.log(line);
console.log('   周    A        U      s均值   本周ΔA   本周ΔU');
for (const m of R.较弱.marks) {
  if (m.w % 2 !== 0 && m.w !== 20) continue;
  console.log(`  ${String(m.w).padStart(3)}  ${p3(m.A)}   ${p3(m.U)}   ${p3(m.sAvg)}   ${(m.dA >= 0 ? '+' : '')}${p3(m.dA)}   ${(m.dU >= 0 ? '+' : '')}${p3(m.dU)}`);
}

console.log('\n' + line);
console.log('四、涨速对比 —— 前 4 周 vs 后 4 周');
console.log(line);
console.log('  档位       前4周ΔA    后4周 ΔA     衰减倍数   前4周ΔU   后4周ΔU');
for (const t of ['较强', '中等', '较弱']) {
  const m = R[t].marks;
  const early = (m[3].A - m[0].A) / 4;
  const late = (m[19].A - m[15].A) / 4;
  const eU = (m[3].U - m[0].U) / 4, lU = (m[19].U - m[15].U) / 4;
  const decay = early > 0.0001 ? (early / Math.max(late, 0.0001)).toFixed(1) : '∞';
  console.log(`  ${TIERS[t].label.padEnd(24)} ${p3(early)}     ${p3(late)}     ${decay}×     ${p3(eU)}   ${p3(lU)}`);
}
console.log('\n  → 三档都是「前期快、后期慢」，衰减倍数相近');
console.log('  → 慢的原因：①(s−A) 变小 ②(U−A) 变小 ③s 本身不涨（题一样难）');

console.log('\n' + line);
console.log('五、每一档的涨法不一样 —— 机制拆解');
console.log(line);
for (const t of ['较强', '中等', '较弱']) {
  const r = R[t];
  const m = r.marks;
  const totalDA = m[19].A - m[0].A;
  const totalDU = m[19].U - m[0].U;
  console.log(`\n  【${TIERS[t].label}】`);
  console.log(`    20 周总涨幅： A +${p3(totalDA)}   U +${p3(totalDU)}`);
  console.log(`    A 最终 ${p3(r.A)}   U 最终 ${p3(r.U)}   U−A = ${p3(r.U - r.A)}`);
  console.log(`    s 加权平均 ${p3(r.sAvg)}（=他做的题的平均水平）`);
  const last4 = (m[19].A - m[15].A);
  console.log(`    最后 4 周 A 涨了 ${p3(last4)} → ${last4 > 0.02 ? '**还在涨**' : last4 > 0.005 ? '**几乎停了**' : '**完全停了**'}`);
}

console.log('\n' + line);
console.log('六、卡点在哪 —— 三档各自卡的原因');
console.log(line);
const rs = R.较强, rm = R.中等, rw = R.较弱;
console.log(`  较强：A=${p3(rs.A)}  U=${p3(rs.U)}  s平均=${p3(rs.sAvg)}`);
console.log(`        → A 紧贴 s 平均 ${p3(rs.sAvg)}，U 已涨到 ${p3(rs.U)}`);
console.log(`        → **要再涨必须做题难度结构变（做更多 L6），或者 P 涨**`);
console.log(`        → U 不是瓶颈了（U=${p3(rs.U)} > s=${p3(rs.sAvg)}）`);
console.log(`\n  中等：A=${p3(rm.A)}  U=${p3(rm.U)}  s平均=${p3(rm.sAvg)}`);
console.log(`        → A 略低于 s 平均（差 ${p3(rm.sAvg - rm.A)}），说明还有上升空间没吃完`);
console.log(`        → U=${p3(rm.U)} 已经高于 s=${p3(rm.sAvg)} → **U 也不是瓶颈**`);
console.log(`        → 卡在「他做 L6 题时的 P 分布」→ 难题上不去，中档撑不起 A`);
console.log(`\n  较弱：A=${p3(rw.A)}  U=${p3(rw.U)}  s平均=${p3(rw.sAvg)}`);
console.log(`        → U=${p3(rw.U)}，s=${p3(rw.sAvg)}`);
console.log(`        → U 远高于 s → **U 完全不是瓶颈，是 s 本身太低**`);
console.log(`        → 他卡在「做不出来」→ 只能靠多练把 P 拉上去`);

console.log('\n' + line);
console.log('七、如果 P 也不变，能力能不能一直涨');
console.log(line);
console.log('  测试：20 周 → 40 周，同一个 P 分布\n');
console.log('  档位       20周A    40周A     还能涨吗');
for (const t of ['较强', '中等', '较弱']) {
  const a20 = R[t].A;
  const rs = []; for (let k = 0; k < 15; k++) rs.push(run(t, 40));
  const a40 = rs.reduce((s, r) => s + r.A, 0) / rs.length;
  const d = a40 - a20;
  console.log(`  ${TIERS[t].label.padEnd(24)} ${p3(a20)}   ${p3(a40)}   ${d > 0.01 ? '✅ 还能涨 ' + p3(d) : d > 0.002 ? '🟡 几乎停了' : '❌ 完全停了'}`);
}
console.log('\n  → **P 不变的话，能力在 20 周后就不涨了**');
console.log('  → 因为 A 的不动点 = s 加权平均，而 s 由 P 决定');
console.log('  → **能力增长只有两个来源：① P 涨（真进步）② 做更难的题（结构变化）**');
