// ============ 判定整理段（纯函数 · 无 IO） ============
// ⚠️ 来源：judgeOne/index.js **逐行搬移**（行为零变化）。搬移目的 = D5 影子对比：
//   让「线上壳」成为能在本机直接喂 raw 调用的纯模块，与 graphEngine 的 N3 整理段同输入对比。
//   - LR 等级区间表：原 judgeOne:84-89
//   - clampParams / clampFiveDim：原 judgeOne:226-247
//   - 推导块（空白防毒 / errorType / errorLevel / pattern / 选填题无过程）：原 judgeOne:634-678
// 原则：本文件被线上 judgeOne require；**不改任何阈值与回退规则**。
'use strict';

// ---------- D 等级区间（照抄 judgeOne:84-89） ----------
const LR = {
  L1: [0.01, 0.15], L2: [0.15, 0.30], L3: [0.30, 0.45],
  L4: [0.45, 0.60], L5: [0.60, 0.70], L6: [0.70, 0.79],
  L7: [0.79, 0.85], L8: [0.85, 0.90], L9: [0.90, 0.94],
  L10: [0.94, 0.98], L11: [0.98, 0.999],
};

/** 钳制 D/P/eta（照抄 judgeOne:226-235） */
function clampParams(raw, questionType) {
  const [lo, hi] = LR[raw.level] || [0.01, 0.999];
  const D = Math.min(hi, Math.max(lo, Number(raw.D) || lo));
  const isOpen = questionType === '解答';
  const eta = isOpen ? (raw.eta === undefined ? null : raw.eta) : null;
  // P：连续 0~1（决策 2026-08-14 用户：P=过程距答案的距离，不再收敛四档）
  let P = Math.min(1, Math.max(0, Number(raw.P) || 0));
  P = Math.round(P * 100) / 100;
  return { D, eta, P };
}

// 五维校验 0~1：fiveDim 是模型自由生成的、此前零校验（生产库里出现过 K=3 / Q=4 / S=3 这种越界值，
// 说明模型有时按 0~5 给）。处理原则：**越界或缺失即整组作废（null），绝不钳成 1**——钳制等于编数据。
function clampFiveDim(fd) {
  if (!fd || typeof fd !== 'object') return null;
  const out = {};
  for (const k of ['K', 'A', 'T', 'Q', 'S']) {
    const v = Number(fd[k]);
    if (!Number.isFinite(v) || v < 0 || v > 1) return null;
    out[k] = v;
  }
  return out;
}

/**
 * 把模型原始输出整理成落库/展示要用的字段（纯函数：不写库、不调 AI）
 * @param {object} question 题目文档（用 studentAnswer 判空白）
 * @param {object} raw 模型原始输出
 * @returns {{questionType:string, clamped:object, fiveDim:object|null, segOut:Array, bpOut:object|null,
 *   paOut:boolean, isBlank:boolean, derivedErrorType:string, derivedErrorLevel:string|null,
 *   derivedErrorAttribution:string|null, patternText:string, patternFull:string}}
 */
function deriveAll(question, raw) {
  const questionType = raw.questionType || question.questionType || '其他';
  // 选填题无过程（设计红线）：选择/填空一律 segments=[] / breakpoint=null / processAvailable=false。
  // 生产库审计发现 2/28 道选填题带着 segments 落库 → 学生会在填空题上看到「断点」。
  // 只有「明确是选择/填空」才算无过程；题型未知时按「可能有过程」处理（智学网官方导入的题不带题型）
  const qIsNoProcess = questionType === '选择' || questionType === '填空';
  const segOut = qIsNoProcess ? [] : (Array.isArray(raw.segments) ? raw.segments : []);
  const bpOut = qIsNoProcess ? null : (raw.breakpoint || null);
  const paOut = qIsNoProcess ? false : raw.processAvailable === true;
  const clamped = clampParams(raw, questionType);

  // P 由 AI 直接输出（连续 0~1），对错语义由 P 编码，无需独立钳制

  // ===== 源头防毒（2026-08-28）：空白题归因由代码推导，不采信 LLM 自由解释 =====
  // 空白只有「没有行为」这一个事实；从「没写」到「未理解」是模型先验的推测链。
  // 空白判定：断点=起步即停，或（无学生答案且无过程分段）。
  const segList = segOut;
  const hasAnswerText = !!(question.studentAnswer && String(question.studentAnswer).trim());
  const isBlank = (bpOut && bpOut.nature === '起步即停') || (!hasAnswerText && segList.length === 0);
  const derivedErrorAttribution = isBlank
    ? '整题空白未下笔'
    : ((clamped.P >= 0.5 || !raw.errorAttribution) ? null : String(raw.errorAttribution).trim() || null);

  // ===== errorType（结果错/过程风险/无）：LLM 按实际过程判定，缺失/非法时按 P 防御回退 =====
  const rawET = String(raw.errorType || '').trim();
  // 注：这里必须是 let —— 原来写成 const，选填题遇到模型给「过程风险」时下一行重新赋值会抛 TypeError，整题判定失败（2026-09-19 审计发现）
  let derivedErrorType = (rawET === '结果错' || rawET === '过程风险') ? rawET
    : (clamped.P < 0.5 ? '结果错' : (clamped.P < 1 ? '过程风险' : '无'));

  // ===== 选填题无过程（选择/填空）：不允许"过程风险"（没有过程可扣分），按答案判 结果错/无 =====
  const isNoProcess = paOut !== true;
  if (isNoProcess && derivedErrorType === '过程风险') {
    derivedErrorType = clamped.P < 0.5 ? '结果错' : '无';
  }
  // ===== 错误层级（skill/rule/concept）：优先 LLM，缺失按 errorDimension 映射防御回退 =====
  const rawEL = String(raw.errorLevel || '').trim();
  const derivedErrorLevel = (derivedErrorType === '无') ? null
    : (rawEL === 'skill' || rawEL === 'rule' || rawEL === 'concept') ? rawEL
    : (raw.errorDimension === 'K' ? 'concept' : raw.errorDimension === 'A' ? 'rule' : raw.errorDimension === 'T' ? 'rule' : raw.errorDimension === 'S' ? 'skill' : 'skill');

  // ===== 题型三层（D-18）提前计算：questions 落库与 RAG 记录共用 =====
  const rawPattern = (raw.pattern && typeof raw.pattern === 'object') ? raw.pattern : {};
  const patternText = ((rawPattern.pattern || '').trim() || '').slice(0, 80);
  const patternFull = [rawPattern.domain, rawPattern.pattern, rawPattern.variant]
    .filter((s) => s && typeof s === 'string' && s.trim())
    .map((s) => s.trim()).join(' / ').slice(0, 120);

  return {
    questionType, clamped, fiveDim: clampFiveDim(raw.fiveDim),
    segOut, bpOut, paOut, isBlank,
    derivedErrorType, derivedErrorLevel, derivedErrorAttribution,
    patternText, patternFull,
  };
}

module.exports = { LR, clampParams, clampFiveDim, deriveAll };
