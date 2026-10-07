// ============ A / U 核心算法（决策 063 定稿 · 纯函数，无 IO） ============
//
// 理论定位（SFA 随机前沿分析）：
//   U = 能力前沿（真实能力 / 最大表现）  ← SFA 里的 f(x)
//   A = 实际发挥（典型表现）              ← SFA 里的实际产出 y
//   A ≤ U 结构性成立（发挥总有损失，单边误差 u ≥ 0）
//
// 为什么在 λ 轴（档位坐标）而不是 D 轴：
//   D 轴步长是【绝对值】(ΔA = 0.1 × 惊讶度) → 换算到档位后，L1 跨 0.71 档、L9 跨 2.50 档
//   → 越高档位跳得越狠，与「越高越难」相反。
//   λ 轴步长是【相对值】(Δλ = α_λ × 惊讶度) → 任何档位一步都是 0.9 档（均匀）
//   → 换算成 D 值后高档位进步自动变小，与「越高越难」一致。
//
// 来源：doc/architecture/决策063-A与U的重新设计.md（2026-10-06 定稿）
// 本模块只做数学，不碰 db；由 lib/updateMastery.js 调用。
'use strict';

// ---------- L 表（照抄 lib/normalize.js 的 LR，决策 020 D 难度标尺） ----------
const LR = {
  L1: [0.01, 0.15], L2: [0.15, 0.30], L3: [0.30, 0.45],
  L4: [0.45, 0.60], L5: [0.60, 0.70], L6: [0.70, 0.79],
  L7: [0.79, 0.85], L8: [0.85, 0.90], L9: [0.90, 0.94],
  L10: [0.94, 0.98], L11: [0.98, 0.999],
};

// ---------- λ 轴参数（决策 063 §四 锁定） ----------
const P = {
  k: 3,          // 期望曲线陡峭度
  s0: 0.35,      // λ 轴状态噪声下限（≈1/3 个档位）
  p_t: 0.80,     // A 处的期望过程分（"有一定把握"）
  alpha: 0.9,    // A 更新步长（λ 单位）
  delta_d: 0.03, // U 下调幅度
  k_low: 3,      // ②区累计触发次数（事不过三）
  P_c: 0.6,      // U 抬升的过程分门槛（相变临界）
  a_u: 0.75,     // U 抬升时的压缩系数
  norm: 9.2,     // 归一化分母 → 课内极限 = 0.978
  A0: 2.00,      // A 起点 = λ(0.30)
  U0: 3.3333,    // U 起点 = λ(0.50)
};

const L_ORDER = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10', 'L11'];

// ---------- 档位名（显示层「乙」，决策 063 §五） ----------
const LEVEL_NAME = {
  L1: 'L1 入门', L2: 'L2 基础', L3: 'L3 简单', L4: 'L4 中下',
  L5: 'L5 中档', L6: 'L6 中档→中上', L7: 'L7 中上', L8: 'L8 较难',
  L9: 'L9 较难→极难', L10: 'L10 课外', L11: 'L11 竞赛',
};

/**
 * λ(D)：按 L 表分段线性。L1 起点 = 0，每档恰好占 1.0。
 * @param {number} D 难度值 0~1
 * @returns {number} 档位坐标 λ
 */
function lambdaOfD(D) {
  const d = Number(D);
  if (!Number.isFinite(d)) return P.A0;
  for (let i = 0; i < L_ORDER.length; i++) {
    const [lo, hi] = LR[L_ORDER[i]];
    if (d <= hi || i === L_ORDER.length - 1) {
      if (d <= lo) return i;                       // 落在档位下沿之前 → 该档起点
      return i + (d - lo) / (hi - lo);             // 档内线性插值
    }
  }
  return P.A0;
}

/**
 * λ → D（lambdaOfD 的逆）。用于显示层「甲」（A 的 D 值）。
 */
function dOfLambda(lam) {
  const l = Math.max(0, Math.min(L_ORDER.length, Number(lam) || 0));
  const i = Math.min(L_ORDER.length - 1, Math.floor(l));
  const [lo, hi] = LR[L_ORDER[i]];
  return lo + (l - i) * (hi - lo);
}

/** λ → 档位名（显示层「乙」） */
function levelNameOfLambda(lam) {
  const l = Math.max(0, Math.min(L_ORDER.length, Number(lam) || 0));
  const i = Math.min(L_ORDER.length - 1, Math.floor(l === L_ORDER.length ? l - 1 : l));
  const frac = l - Math.floor(l);
  const base = LEVEL_NAME[L_ORDER[i]] || L_ORDER[i];
  return frac > 0.05 ? `${base}（档内 ${Math.round(frac * 100)}%）` : base;
}

/** λ → 归一化显示值（0~1，课内极限 = 0.978） */
function normOfLambda(lam) {
  return Math.max(0, Math.min(1, (Number(lam) || 0) / P.norm));
}

/** 档内进度（0~1），用于报告展示 */
function levelOfLambda(lam) {
  const l = Math.max(0, Number(lam) || 0);
  const i = Math.min(L_ORDER.length - 1, Math.floor(l));
  return { level: L_ORDER[i], within: l - i };
}

const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const logit = (p) => Math.log(p / (1 - p));

/**
 * 期望过程分 E(P | λ_D)。
 *
 *   s = (λ_U − λ_A)/2 + s₀λ          半宽（含状态噪声下限）
 *   m = λ_A + (s/k)·logit(p_t)       中点（由 p_t 反解）
 *   E = 1 − σ( k(λ_D − m)/s )        期望过程分
 *
 * 为什么 m 要反解而不是直接取中点：若 m = (λ_A+λ_U)/2，E(λ_A) 会随区间宽度漂移
 * （gap 小时掉到 0.65），A 的语义变成"一半一半"不稳定。反解后 E(λ_A) ≡ p_t 恒定。
 *
 * ⚠️ 与决策 063 §3.1 原文的三处差异（2026-10-06 落地时实测发现并修正）：
 *   §3.1 原文写的是 `E = 1 / (1 + e^{k(λ_D − m)/s})`，`m = λ_A − (s/k)·logit(1 − p_t)`
 *   ① `logit(1 − p_t)`：按字面实现会让 E(λ_A) ≡ 1 − p_t = 0.20（曲线方向整体翻转）
 *   ② 外层缺 `1 −`：单独看「E(λ_A) ≡ p_t」这条不变量两种写法都成立，所以文档自测没暴露；
 *      但只有加上 `1 −`，§6.1 的 E 列才能被复现（实测：7 行中 6 行精确吻合）
 *   §6.1 表里 E 的含义是「这个难度的题，他做出过程分的期望」——
 *      题比 A 简单 → E 高（如 row1 D=0.25 时 E=0.915）；题远难于 A → E→0（如 row5,13）
 *   本实现 = 这三处修正后的形式。已在交接文档标注，待用户确认后回填决策 063。
 */
function expectedScore(lambdaD, lambdaA, lambdaU, params) {
  const q = params || P;
  const s = Math.max(1e-6, (lambdaU - lambdaA) / 2 + q.s0);
  const m = lambdaA + (s / q.k) * logit(q.p_t);
  return 1 - sigmoid(q.k * (lambdaD - m) / s);
}

/**
 * 单次观测 → A / U 的新值（决策 063 §三）。
 *
 * 五情况（§六实测）：
 *   ① D < A, P 高   → A 几乎不动
 *   ② D < A, P 低   → A 降；累计 k_low 次 → U 降
 *   ③ A ≤ D ≤ U     → A 按惊讶度涨/微降
 *   ④ D > U, P ≥ P_c → A 涨 + U 抬升
 *   ⑤ D > U, P < P_c → A 微涨、U 不动（关键区分：A 可动、U 不可动）
 *
 * @param {{D:number,P:number}} obs
 * @param {{lambdaA:number,lambdaU:number,lowStreak?:number}} state
 * @param {object} [params]
 * @returns {{lambdaA:number,lambdaU:number,lowStreak:number,E:number,surprise:number,zone:string,actions:string[]}}
 */
function updateAU(obs, state, params) {
  const q = Object.assign({}, P, params || {});
  const D = Math.min(1, Math.max(0, Number(obs && obs.D) || 0));
  const p = Math.min(1, Math.max(0, Number(obs && obs.P) || 0));
  let lA = Number(state && state.lambdaA);
  let lU = Number(state && state.lambdaU);
  if (!Number.isFinite(lA)) lA = q.A0;
  if (!Number.isFinite(lU)) lU = q.U0;
  let lowStreak = Number((state && state.lowStreak) || 0);

  const lambdaD = lambdaOfD(D);
  const E = expectedScore(lambdaD, lA, lU, q);
  const surprise = p - E;
  const actions = [];

  // 判定分区
  const D_A = dOfLambda(lA), D_U = dOfLambda(lU);
  let zone;
  if (D < D_A) zone = '①/②'; else if (D <= D_U) zone = '③'; else zone = '④/⑤';

  // ---------- A 的更新：对任何观测都更新（含 ⑤ 区微涨） ----------
  lA = lA + q.alpha * surprise;

  // ---------- U 的更新 ----------
  if (D > D_U && p >= q.P_c) {
    // 【抬升】④区：只有【确证做到】才能抬高能力前沿
    const g = q.a_u + (1 - q.a_u) * ((p - q.P_c) / (1 - q.P_c));
    const admitted = lambdaOfD(Math.min(0.94, D * g));
    if (admitted > lU) { lU = admitted; actions.push('U↑'); }
  } else if (D < D_A && p < q.P_c) {
    // 【下调】②区累计 k_low 次（事不过三）
    lowStreak += 1;
    if (lowStreak >= q.k_low) {
      lU = lU - q.delta_d * (lU - lA);
      lowStreak = 0;
      actions.push('U↓');
    }
  } else {
    lowStreak = 0;
  }

  // 约束：0 ≤ λ_A ≤ λ_U（A ≤ U 结构性成立）
  lA = Math.max(0, Math.min(lU, lA));
  lU = Math.max(lA, lU);

  return {
    lambdaA: lA, lambdaU: lU, lowStreak,
    E, surprise, zone, lambdaD, actions,
    A_D: dOfLambda(lA), U_D: dOfLambda(lU),
  };
}

/**
 * 把内部状态转成落库 patch（字段名与 unit_progress 现有结构对齐）。
 * 兼容旧字段：aValue/aUpper 继续存【归一化值】，新增 lambdaA/lambdaU 存真值。
 */
function toProgressPatch(state, extra) {
  const lA = Number(state.lambdaA) || 0;
  const lU = Number(state.lambdaU) || 0;
  return Object.assign({
    lambdaA: Math.round(lA * 10000) / 10000,
    lambdaU: Math.round(lU * 10000) / 10000,
    aValue: Math.round(normOfLambda(lA) * 1000) / 1000,
    aUpper: Math.round(normOfLambda(lU) * 1000) / 1000,
    aLevel: levelNameOfLambda(lA),
    uLevel: levelNameOfLambda(lU),
    aD: Math.round(dOfLambda(lA) * 1000) / 1000,
    uD: Math.round(dOfLambda(lU) * 1000) / 1000,
    lowEtaStreak: Number(state.lowStreak) || 0,
    algorithm: 'au063_v1',
  }, extra || {});
}

/** 从库里的行恢复内部状态（兼容 055 旧行：只有 aValue/aUpper 时按 λ 近似还原） */
function fromProgressRow(row) {
  const r = row || {};
  if (Number.isFinite(Number(r.lambdaA)) && Number.isFinite(Number(r.lambdaU))) {
    return { lambdaA: Number(r.lambdaA), lambdaU: Number(r.lambdaU), lowStreak: Number(r.lowEtaStreak) || 0 };
  }
  // 旧行：aValue 是 055 口径的 0~1 值 → 先按 D 反查 λ 再作为起点（保守，只当冷启动）
  const legacyA = Number(r.aValue), legacyU = Number(r.aUpper);
  const lambdaA = Number.isFinite(legacyA) && legacyA > 0 ? lambdaOfD(legacyA) : P.A0;
  const lambdaU = Number.isFinite(legacyU) && legacyU > 0 ? Math.max(lambdaA, lambdaOfD(legacyU)) : P.U0;
  return { lambdaA, lambdaU, lowStreak: Number(r.lowEtaStreak) || 0 };
}

module.exports = {
  LR, P, L_ORDER, LEVEL_NAME,
  lambdaOfD, dOfLambda, levelNameOfLambda, normOfLambda, levelOfLambda,
  expectedScore, updateAU, toProgressPatch, fromProgressRow,
};
