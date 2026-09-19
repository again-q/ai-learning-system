'use strict';
// N3 · 纯程序整理（judgeOne/index.js:621-657 搬迁；纯函数节点，无 IO）
// 输入：state{raw, question}；输出：{clamped, derived, questionType}
// 照抄红线：clamp 阈值、空白防毒、errorType/errorLevel 回退、选填题禁「过程风险」、pattern 三层
// 注：线上 judgeOne:638 用 const 声明后又在 644 重新赋值（选填题+「过程风险」时会抛 TypeError）；
//     本节点直接用 lib/normalize.deriveAll（内部用 let），属修正，不留同款 bug。
const { clampParams, deriveAll } = require('../lib/normalize');

function createNormalizeQuestionNode() {
  return async function normalizeQuestionNode(state) {
    const raw = state.raw || {};
    const question = state.question || {};
    const questionType = raw.questionType || question.questionType || '其他';
    const clamped = clampParams(raw, questionType);
    const derived = deriveAll(raw, question, clamped);
    return { clamped, derived, questionType };
  };
}

module.exports = { createNormalizeQuestionNode };
