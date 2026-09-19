'use strict';
// N0 · 取题 + 归属校验（judgeOne/index.js:605-611 搬迁）
// 输入：state{questionId, openid}；输出：{question}
// 差异：业务错误带 code（400/403/404），由 graph 出口映射成 judgeOne 同款 fail(code, msg)
function createLoadQuestionNode({ db }) {
  if (!db) throw new Error('N0: db 必填');
  return async function loadQuestionNode(state) {
    const { questionId, openid } = state;
    if (!questionId) throw bizError(400, '缺少题目ID');
    const qRes = await db.collection('questions').doc(questionId).get().catch(() => null);
    if (!qRes || !qRes.data) throw bizError(404, '题目不存在');
    if (qRes.data.userId !== openid) throw bizError(403, '无权操作他人题目');
    return { question: qRes.data };
  };
}

function bizError(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

module.exports = { createLoadQuestionNode, bizError };
