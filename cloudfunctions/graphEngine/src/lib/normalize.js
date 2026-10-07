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
  // 与线上同序：先做「选填题无过程」归一，再用【归一后】的过程字段推导（对应 judgeOne:639-663 的顺序）
  // ⚠️ 2026-09-19 D5 对拍发现：直接用 raw 的 segments/breakpoint/processAvailable 会让选填题被判「过程风险」、
  //    让「无答案但有模型过程」的填空题漏判空白 —— 与线上不一致，属壳 bug，已按闸门修掉（非有意修正）
  const questionType = r.questionType || q.questionType || '其他';
  const proc = normalizeProcessFields(r, questionType);
  const segList = proc.segments;
  const hasAnswerText = !!(q.studentAnswer && String(q.studentAnswer).trim());
  const isBlank = (proc.breakpoint && proc.breakpoint.nature === '起步即停') || (!hasAnswerText && segList.length === 0);

  const errorAttribution = isBlank
    ? '整题空白未下笔'
    : ((c.P >= 0.5 || !r.errorAttribution) ? null : String(r.errorAttribution).trim() || null);

  const rawET = String(r.errorType || '').trim();
  let errorType = (rawET === '结果错' || rawET === '过程风险') ? rawET
    : (c.P < 0.5 ? '结果错' : (c.P < 1 ? '过程风险' : '无'));
  // 选填题没有过程可扣：不允许「过程风险」
  const isNoProcess = proc.processAvailable !== true;
  if (isNoProcess && errorType === '过程风险') errorType = c.P < 0.5 ? '结果错' : '无';

  const rawEL = String(r.errorLevel || '').trim();
  // 2026-09-25 清理（决策 051）：取消「errorDimension → errorLevel」的互相推导。
  //   dimension（K/A/T/S）= 归因维度；level（skill/rule/concept）= 错误层级 —— 两件事，不再用前者推后者。
  //   模型没给 level 就是 null（对齐审计 P5 口径：宁缺勿假，不编一个 skill 出来）。
  const errorLevel = (errorType === '无') ? null
    : (rawEL === 'skill' || rawEL === 'rule' || rawEL === 'concept') ? rawEL
    : null;

  const rawPattern = (r.pattern && typeof r.pattern === 'object') ? r.pattern : {};
  const patternText = ((String(rawPattern.pattern || '').trim()) || '').slice(0, 80);
  const patternFull = [rawPattern.domain, rawPattern.pattern, rawPattern.variant]
    .filter((s) => s && typeof s === 'string' && s.trim())
    .map((s) => s.trim()).join(' / ').slice(0, 120);

  return { isBlank, errorAttribution, errorType, errorLevel, patternText, patternFull, segList };
}

/**
 * 选填题无过程（设计红线）：选择/填空一律 segments=[]、breakpoint=null、processAvailable=false。
 * 生产数据里出现过 2/28 道选填题带着 segments 落库（模型给了过程），学生会在填空题上看到「断点」。
 */
function normalizeProcessFields(raw, questionType) {
  const r = raw || {};
  // 只有「明确是选择/填空」才算无过程；题型未知（如智学网官方导入）时按「可能有过程」处理，
  // 否则会把解答题的过程分段整段清掉。
  const isNoProcess = questionType === '选择' || questionType === '填空';
  return {
    isNoProcess,
    segments: isNoProcess ? [] : (Array.isArray(r.segments) ? r.segments : []),
    breakpoint: isNoProcess ? null : (r.breakpoint || null),
    processAvailable: isNoProcess ? false : r.processAvailable === true,
  };
}

/**
 * 题目类型守卫（2026-09-25 清理，决策 051）：只认宪法 §二 的三种枚举 ——
 * 回忆类 / 单元内应用 / 跨单元应用；模型给了别的值一律记「未分类」。
 * 为什么必须守：该字段被三处消费（图谱页返回、翻旧账上下文「题型：…」、RAG 日志兜底），
 * 放任自由文本（如"由集合相等求参数值"）会让统计和检索都失准。
 */
const QUESTION_CATEGORIES = ['回忆类', '单元内应用', '跨单元应用'];
function normalizeQuestionCategory(v) {
  const s = String(v || '').trim();
  return QUESTION_CATEGORIES.includes(s) ? s : '未分类';
}

/**
 * 组装写库字段（照抄 judgeOne:660-684 的字段清单，缺一不可）
 *
 * ⚠️ 命名对照（判定端 → 落库）——**物理改名不做**，避免动判定核心（决策 050）：
 *   level → difficultyLevel ｜ D → difficultyValue ｜ P → processScore ｜ eta → pathQuality
 *   knowledgeUsage[].D / .P 不改名（环节级与整题级本就不同层）。
 * 新增字段一律**以判定端命名为准**（isOutOfSyllabus / errorDimension）。
 * 2026-09-25 清理（决策 051）：删除 isRecallQuestion —— K 不再靠「是不是回忆题」当门，
 *   直接看过程里该知识点用对没用对（用错即负证据），见《参数对齐审计》§9。
 */
function buildQuestionPatch(raw, question, clamped, derived) {
  const r = raw || {};
  const c = clamped || {};
  const d = derived || {};
  const questionType = r.questionType || question.questionType || '其他';
  const proc = normalizeProcessFields(r, questionType);
  return {
    questionType,
    correctAnswer: r.correctAnswer || '',
    referenceProcess: Array.isArray(r.referenceProcess) ? r.referenceProcess : [],
    questionCategory: normalizeQuestionCategory(r.questionCategory),
    difficultyLevel: r.level || 'L4',
    difficultyValue: c.D,
    processScore: c.P,
    pathQuality: c.eta,
    errorType: d.errorType,
    errorLevel: d.errorLevel,
    errorAttribution: d.errorAttribution,
    pattern: d.patternFull || null,
    // 2026-09-25（决策 053）：不再写「主知识点」——一题只留 knowledgeUsage
    knowledgeUsage: Array.isArray(r.knowledgeUsage) ? r.knowledgeUsage : [],
    segments: proc.segments,
    breakpoint: proc.breakpoint,
    processAvailable: proc.processAvailable,
    // 2026-09-25 参数对齐（决策 050）：补齐三个「判定端有输出、此前落库丢掉」的字段
    isOutOfSyllabus: r.isOutOfSyllabus === true,
    errorDimension: r.errorDimension || null,
    reviewed: true,
  };
}

module.exports = { LR, clampParams, deriveAll, buildQuestionPatch, normalizeProcessFields, normalizeQuestionCategory, QUESTION_CATEGORIES };