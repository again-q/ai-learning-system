'use strict';
// N4 · 写库 questions（judgeOne/index.js:660-684 搬迁，19 字段由 lib/normalize.buildQuestionPatch 组装）
function createPersistQuestionNode({ db }) {
  if (!db) throw new Error('N4: db 必填');
  return async function persistQuestionNode(state) {
    const { buildQuestionPatch } = require('../lib/normalize');
    const patch = buildQuestionPatch(state.raw || {}, state.question || {}, state.clamped, state.derived);
    await db.collection('questions').doc(state.questionId).update({ data: patch });
    return { questionPatch: patch };
  };
}

module.exports = { createPersistQuestionNode };
