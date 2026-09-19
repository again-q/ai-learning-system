'use strict';
// N5 · 掌握度更新（judgeOne/index.js:686-692 搬迁；实现复用 lib/updateMastery.js，纯 DI 零改动）
// 降级：updateMastery 内部已 catch（失败返回 {mainNodeId:null,pOk:false}），不抛
const { updateMastery } = require('../lib/updateMastery');

function createUpdateMasteryNode({ db, kg }) {
  if (!db) throw new Error('N5: db 必填');
  const k = kg || {};
  return async function updateMasteryNode(state) {
    const mastery = await updateMastery({
      db,
      matchKnowledgeNode: k.matchKnowledgeNode,
      findNode: k.findNode,
      unitNameOf: k.unitNameOf,
      openid: state.openid,
      questionId: state.questionId,
      question: state.question,
      raw: state.raw,
      clamped: state.clamped,
    });
    return { mastery };
  };
}

module.exports = { createUpdateMasteryNode };
