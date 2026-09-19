// ============ N3 整理归一（D4 · 纯程序节点） ============
// ⚠️ 来源：cloudfunctions/judgeOne/index.js（判据/阈值逐行照抄，文件头标注来源以备 D5 对拍）
//   - LR 等级区间表：judgeOne:84-89
//   - clampParams：judgeOne:226-235
//   - 推导块（空白防毒 / errorType / errorLevel / pattern）：judgeOne:626-657
// 原则：纯函数、无 IO；**不改任何阈值与回退规则**（D4 红线：行为与线上一致，只换壳）

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
  const src = raw || {};
  const [lo, hi] = LR[src.level] || [0.01, 0.999];
  const D = Math.min(hi, Math.max(lo, Number(src.D) || lo));
  const isOpen = questionType === '解答';
  const eta = isOpen ? (src.eta === undefined ? null : src.eta) : null;
  // P：连续 0~1（过程距答案的距离），四舍五入到两位
  let P = Math.min(1, Math.max(0, Number(src.P) || 0));
  P = Math.round(P * 100) / 100;
  return { D, eta, P };
}

/**
 * 推导块（照抄 judgeOne:626-657）：空白防毒 → errorType → errorLevel → pattern
 * @param {object} raw 模型原始输出
 * @param {object} question 题目文档（用 studentAnswer 判空白）
 * @param {object} clamped clampParams 的结果
 * @returns {{isBlank:boolean, errorAttribution:string|null, errorType:string, errorLevel:string|null, patternText:string, patternFull:string, segList:Array}}
 */
function deriveAll(raw, question, clamped) {
  const r = raw || {};
  const q = question || {};
  const c = clamped || {};
  const segList = Array.isArray(r.segments) ? r.segments : [];
  const hasAnswerText = !!(q.studentAnswer && String(q.studentAnswer).trim());
  const isBlank = (r.breakpoint && r.breakpoint.nature === '起步即停') || (!hasAnswerText && segList.length === 0);

  const errorAttribution = isBlank
    ? '整题空白未下笔'
    : ((c.P >= 0.5 || !r.errorAttribution) ? null : String(r.errorAttribution).trim() || null);

  const rawET = String(r.errorType || '').trim();
  let errorType = (rawET === '结果错' || rawET === '过程风险') ? rawET
    : (c.P < 0.5 ? '结果错' : (c.P < 1 ? '过程风险' : '无'));
  // 选填题没有过程可扣：不允许「过程风险」
  const isNoProcess = r.processAvailable !== true;
  if (isNoProcess && errorType === '过程风险') errorType = c.P < 0.5 ? '结果错' : '无';

  const rawEL = String(r.errorLevel || '').trim();
  const errorLevel = (errorType === '无') ? null
    : (rawEL === 'skill' || rawEL === 'rule' || rawEL === 'concept') ? rawEL
    : (r.errorDimension === 'K' ? 'concept' : r.errorDimension === 'A' ? 'rule' : r.errorDimension === 'T' ? 'rule' : r.errorDimension === 'S' ? 'skill' : 'skill');

  const rawPattern = (r.pattern && typeof r.pattern === 'object') ? r.pattern : {};
  const patternText = ((String(rawPattern.pattern || '').trim()) || '').slice(0, 80);
  const patternFull = [rawPattern.domain, rawPattern.pattern, rawPattern.variant]
    .filter((s) => s && typeof s === 'string' && s.trim())
    .map((s) => s.trim()).join(' / ').slice(0, 120);

  return { isBlank, errorAttribution, errorType, errorLevel, patternText, patternFull, segList };
}

/** 组装写库字段（照抄 judgeOne:660-684 的字段清单，缺一不可） */
function buildQuestionPatch(raw, question, clamped, derived) {
  const r = raw || {};
  const c = clamped || {};
  const d = derived || {};
  return {
    questionType: r.questionType || question.questionType || '其他',
    correctAnswer: r.correctAnswer || '',
    referenceProcess: Array.isArray(r.referenceProcess) ? r.referenceProcess : [],
    questionCategory: r.questionCategory || '无法归类',
    difficultyLevel: r.level || 'L4',
    difficultyValue: c.D,
    processScore: c.P,
    pathQuality: c.eta,
    errorType: d.errorType,
    errorLevel: d.errorLevel,
    errorAttribution: d.errorAttribution,
    pattern: d.patternFull || null,
    knowledgeNodeName: r.knowledgeNodeName || '',
    knowledgeUsage: Array.isArray(r.knowledgeUsage) ? r.knowledgeUsage : [],
    fiveDim: r.fiveDim || null,
    segments: Array.isArray(r.segments) ? r.segments : [],
    breakpoint: r.breakpoint || null,
    processAvailable: r.processAvailable === true,
    reviewed: true,
  };
}

module.exports = { LR, clampParams, deriveAll, buildQuestionPatch };