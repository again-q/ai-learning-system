'use strict';
// A/U 核心算法单测（决策 063 §六 六项验证）
// 跑法：node --test test/au063.test.js
const test = require('node:test');
const assert = require('node:assert');
const {
  lambdaOfD, dOfLambda, expectedScore, updateAU, toProgressPatch, fromProgressRow, P,
} = require('../src/lib/au063');

// 决策 063 §2.4 的 λ 表（照抄文档，逐行核对）
test('λ 映射与决策 063 §2.4 的表一致', () => {
  const cases = [
    [0.30, 2.000], [0.50, 3.333], [0.60, 4.000], [0.70, 5.000],
    [0.79, 6.000], [0.85, 7.000], [0.90, 8.000], [0.94, 9.000],
  ];
  for (const [d, lam] of cases) {
    assert.ok(Math.abs(lambdaOfD(d) - lam) < 0.01, `D=${d} 应得 λ=${lam}，实得 ${lambdaOfD(d)}`);
  }
});

test('λ(D) 在档位上均匀：每档恰好占 1.0', () => {
  assert.ok(Math.abs(lambdaOfD(0.79) - lambdaOfD(0.70) - 1) < 1e-9, 'L6→L7 应恰好 1.0');
  assert.ok(Math.abs(lambdaOfD(0.90) - lambdaOfD(0.85) - 1) < 1e-9, 'L8→L9 应恰好 1.0');
});

test('λ↔D 往返一致', () => {
  for (const d of [0.30, 0.45, 0.62, 0.77, 0.88, 0.93]) {
    assert.ok(Math.abs(dOfLambda(lambdaOfD(d)) - d) < 1e-6, `D=${d} 往返不一致`);
  }
});

// 决策 063 §3.1：E(λ_D = λ_A) ≡ p_t（与区间宽度无关）
test('V-核心：E(λ_A) ≡ p_t，不随区间宽度漂移', () => {
  for (const gap of [0.5, 1.0, 2.0, 3.0, 5.0]) {
    const lA = 2.0, lU = lA + gap;
    const E = expectedScore(lA, lA, lU);
    assert.ok(Math.abs(E - P.p_t) < 1e-9, `gap=${gap} 时 E(λ_A)=${E}，应为 ${P.p_t}`);
  }
});

// 决策 063 §2.2：D 轴一步跨几档（证明为什么换 λ 轴）
test('D 轴在高档位跨档更狠（换 λ 轴的依据）', () => {
  const step = 0.1;                                  // ΔA = 0.1 × 惊讶度
  const crossL1 = (lambdaOfD(0.15) - lambdaOfD(0.05)) / step;
  const crossL9 = (lambdaOfD(0.94) - lambdaOfD(0.90)) / step;
  assert.ok(crossL9 > crossL1, 'L9 跨档应多于 L1（越高跳得越狠）');
});

// 决策 063 §3.5：只做简单题 → A 收敛且被 U 钳制
// 文档实测表（D=0.25, P=0.95）：1题→0.3048、20题→0.3228、50题→0.3232、2000题→0.3232
test('V2 ①区有界性：刷简单题 A 收敛且远低于 U（复现 §3.5 表）', () => {
  let st = { lambdaA: P.A0, lambdaU: P.U0, lowStreak: 0 };
  const readings = {};
  for (let i = 0; i < 2000; i++) {
    const r = updateAU({ D: 0.25, P: 0.95 }, st);
    st = { lambdaA: r.lambdaA, lambdaU: r.lambdaU, lowStreak: r.lowStreak };
    if ([0, 19, 49, 1999].includes(i)) readings[i + 1] = dOfLambda(st.lambdaA);
  }
  // 文档值（±0.002 容差）
  assert.ok(Math.abs(readings[1] - 0.3048) < 0.002, `1 题应 ≈0.3048，实得 ${readings[1].toFixed(4)}`);
  assert.ok(Math.abs(readings[20] - 0.3228) < 0.002, `20 题应 ≈0.3228，实得 ${readings[20].toFixed(4)}`);
  assert.ok(Math.abs(readings[50] - 0.3232) < 0.002, `50 题应 ≈0.3232，实得 ${readings[50].toFixed(4)}`);
  assert.ok(Math.abs(readings[2000] - 0.3232) < 0.002, `2000 题应 ≈0.3232，实得 ${readings[2000].toFixed(4)}`);
  // 收敛性：50 题之后不再移动
  assert.ok(Math.abs(readings[50] - readings[2000]) < 1e-3, '刷到 50 题应收敛，再刷 2000 题不动');
  // U 不被简单题抬高，A 被钳制在下方
  // U0 = 3.3333 是文档里的截断字面量，反算 D = 0.49999 → 容差取 1e-3
  assert.ok(Math.abs(dOfLambda(st.lambdaU) - 0.5) < 1e-3, 'U 不应被简单题抬高（D=0.25 < U，不满足 D > U）');
  assert.ok(dOfLambda(st.lambdaA) < dOfLambda(st.lambdaU), 'A 必须被 U 钳制在下方');
});

// 决策 063 §3.4：A 可动、U 不可动 —— ⑤区最关键
test('V3 ⑤区：D>U 且 P 低 → A 微涨、U 不动', () => {
  const st = { lambdaA: P.A0, lambdaU: P.U0, lowStreak: 0 };
  const r = updateAU({ D: 0.62, P: 0.30 }, st);
  assert.ok(r.zone === '④/⑤', `应落在 ④/⑤ 区，实得 ${r.zone}`);
  assert.ok(r.lambdaU === st.lambdaU, 'U 不得变动（他没做出来，不能抬高能力前沿）');
});

test('V3 ④区：D>U 且 P 高 → A 涨 + U 抬升', () => {
  const st = { lambdaA: P.A0, lambdaU: P.U0, lowStreak: 0 };
  const r = updateAU({ D: 0.82, P: 0.90 }, st);
  assert.ok(r.lambdaU > st.lambdaU, 'U 应抬升');
  assert.ok(r.lambdaA > st.lambdaA, 'A 应上涨');
});

test('V1 SFA 结构性：A ≤ U 恒成立（任何观测序列）', () => {
  const obs = [
    { D: 0.25, P: 0.60 }, { D: 0.52, P: 0.60 }, { D: 0.82, P: 0.60 },
    { D: 0.82, P: 0.85 }, { D: 0.62, P: 0.30 }, { D: 0.87, P: 0.90 },
    { D: 0.87, P: 0.85 }, { D: 0.52, P: 1.00 }, { D: 0.10, P: 1.00 },
    { D: 0.95, P: 0.20 }, { D: 0.40, P: 0.10 }, { D: 0.99, P: 1.00 },
  ];
  let st = { lambdaA: P.A0, lambdaU: P.U0, lowStreak: 0 };
  for (let round = 0; round < 5; round++) {
    for (const o of obs) {
      const r = updateAU(o, st);
      st = { lambdaA: r.lambdaA, lambdaU: r.lambdaU, lowStreak: r.lowStreak };
      assert.ok(st.lambdaA <= st.lambdaU + 1e-9,
        `A ≤ U 被破坏：A=${st.lambdaA} U=${st.lambdaU}（观测 D=${o.D} P=${o.P}）`);
      assert.ok(st.lambdaA >= 0, 'A 不得为负');
    }
  }
});

test('②区：连续 k_low 次简单题做错 → U 下调（事不过三）', () => {
  let st = { lambdaA: 4.0, lambdaU: 6.0, lowStreak: 0 };
  let dropped = false;
  for (let i = 0; i < P.k_low; i++) {
    const r = updateAU({ D: 0.20, P: 0.10 }, st);
    st = { lambdaA: r.lambdaA, lambdaU: r.lambdaU, lowStreak: r.lowStreak };
    if (r.actions.includes('U↓')) dropped = true;
  }
  assert.ok(dropped, `连续 ${P.k_low} 次应触发 U 下调`);
});

// 决策 063 §6.1 完整轨迹（作者本人 17 题的关键节点）
test('V5 真实轨迹：作者 17 题的关键节点复现', () => {
  const trace = [
    { D: 0.25, P: 0.60 }, { D: 0.52, P: 0.60 }, { D: 0.82, P: 0.60 },
    { D: 0.82, P: 0.85 }, { D: 0.62, P: 0.30 }, { D: 0.87, P: 0.90 },
    { D: 0.87, P: 0.85 }, { D: 0.52, P: 1.00 },
  ];
  let st = { lambdaA: P.A0, lambdaU: P.U0, lowStreak: 0 };
  for (const o of trace) {
    const r = updateAU(o, st);
    st = { lambdaA: r.lambdaA, lambdaU: r.lambdaU, lowStreak: r.lowStreak };
  }
  // 文档最终态：λ_A ≈ 5.06（A 的 D 值 ≈ 0.705），λ_U ≈ 6.43（U 的 D 值 ≈ 0.816）
  assert.ok(Math.abs(st.lambdaA - 5.06) < 0.6, `λ_A 应 ≈5.06，实得 ${st.lambdaA.toFixed(3)}`);
  assert.ok(Math.abs(st.lambdaU - 6.43) < 0.7, `λ_U 应 ≈6.43，实得 ${st.lambdaU.toFixed(3)}`);
  assert.ok(dOfLambda(st.lambdaU) > 0.79, 'U 应至少到 L7');
});

test('落库 patch 字段齐备且可往返', () => {
  const st = { lambdaA: 5.056, lambdaU: 6.427, lowStreak: 1 };
  const patch = toProgressPatch(st, { n: 17 });
  assert.strictEqual(patch.algorithm, 'au063_v1');
  assert.ok(patch.lambdaA > 0 && patch.lambdaU > patch.lambdaA);
  assert.ok(patch.aValue > 0 && patch.aValue < 1, 'aValue 归一化应在 0~1');
  assert.ok(typeof patch.aLevel === 'string' && patch.aLevel.length > 0);
  const back = fromProgressRow(patch);
  assert.ok(Math.abs(back.lambdaA - st.lambdaA) < 1e-3, 'lambdaA 往返应一致');
  assert.ok(Math.abs(back.lambdaU - st.lambdaU) < 1e-3, 'lambdaU 往返应一致');
});

test('兼容 055 旧行：只有 aValue/aUpper 也能恢复状态', () => {
  const back = fromProgressRow({ aValue: 0.3, aUpper: 0.5 });
  assert.ok(Number.isFinite(back.lambdaA) && Number.isFinite(back.lambdaU));
  assert.ok(back.lambdaA <= back.lambdaU, '旧行恢复后仍需满足 A ≤ U');
});

test('V6 留一法：去掉任意一题结论稳定（A 仍在 L5~L7）', () => {
  const trace = [
    { D: 0.25, P: 0.60 }, { D: 0.52, P: 0.60 }, { D: 0.82, P: 0.60 },
    { D: 0.82, P: 0.85 }, { D: 0.62, P: 0.30 }, { D: 0.87, P: 0.90 },
    { D: 0.87, P: 0.85 }, { D: 0.52, P: 1.00 },
  ];
  for (let drop = 0; drop < trace.length; drop++) {
    let st = { lambdaA: P.A0, lambdaU: P.U0, lowStreak: 0 };
    trace.filter((_, i) => i !== drop).forEach((o) => {
      const r = updateAU(o, st);
      st = { lambdaA: r.lambdaA, lambdaU: r.lambdaU, lowStreak: r.lowStreak };
    });
    const dA = dOfLambda(st.lambdaA);
    assert.ok(dA > 0.6 && dA < 0.85, `去掉第 ${drop + 1} 题后 A=${dA.toFixed(3)}，超出稳定区间`);
  }
});
