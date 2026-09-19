'use strict';
// N1 · 翻旧账（RAG）（judgeOne/index.js:613-615 搬迁）
// 输入：state{question, openid}；输出：{ragContext}
// 降级：searchHistory 内部已 catch（失败返回 []）→ ragContext=''，不阻断判定
function createRagLookupNode({ rag }) {
  if (!rag || typeof rag.searchHistory !== 'function') throw new Error('N1: rag.searchHistory 必填');
  return async function ragLookupNode(state) {
    const question = state.question || {};
    const hits = await rag.searchHistory(question.questionText || '', state.openid);
    return { ragContext: rag.buildRagContext(hits), historyHits: hits };
  };
}

module.exports = { createRagLookupNode };
