'use strict';
// N5 · 掌握度更新（judgeOne/index.js:686-692 搬迁；实现复用 lib/updateMastery.js）
//
// 决策 063（2026-10-06 用户定「先 J 再 L」）：
//   Jev 已在 **N1.5** 跑完并写进 state.jevPoints / state.jevUnits —— 本节点**不再调用 Jev**。
//   · 节点解析：用 makeNameResolver（**只做精确匹配，无字符相似度**）
//     —— 因为 N2 的 LLM 拿到的就是 jevPoints 这几个名字，本来就该写得一模一样
//   · A 的记账单元：直接用 state.jevUnits（Jev 判定），不再从 usage 名字反推
//   · Jev 不可用 / 无命中 → 退回原 matchKnowledgeNode 路径（= 接入前行为）
//
// 降级：updateMastery 内部已 catch，不抛。
const { updateMastery } = require('../lib/updateMastery');

function createUpdateMasteryNode({ db, kg }) {
  if (!db) throw new Error('N5: db 必填');
  const k = kg || {};
  return async function updateMasteryNode(state) {
    const jevPoints = Array.isArray(state.jevPoints) ? state.jevPoints.filter(Boolean) : null;
    // 决策 063：有 Jev 考点集合 → 精确解析器；否则 null → updateMastery 用 matchKnowledgeNode 兜底
    const resolveNode = (jevPoints && jevPoints.length && typeof k.makeNameResolver === 'function')
      ? k.makeNameResolver()
      : null;

    const mastery = await updateMastery({
      db,
      matchKnowledgeNode: k.matchKnowledgeNode,   // 兜底（无 Jev 时）
      resolveNode,                                // 决策 063：精确解析
      units: Array.isArray(state.jevUnits) ? state.jevUnits : null,   // A 的记账单元（Jev 判定）
      findNode: k.findNode,
      unitNameOf: k.unitNameOf,
      aggregateUp: k.aggregateUp,          // 决策 052：父节点聚合
      derived: state.derived,
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
