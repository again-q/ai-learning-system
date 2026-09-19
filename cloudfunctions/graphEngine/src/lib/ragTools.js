'use strict';
// D4 原子工具：历史检索（RAG）
// 逐字搬迁自 cloudfunctions/judgeOne/index.js（embedText/cosine/searchHistory/buildRagContext/buildReportText）。
// 差异：embed 改注入（judgeOne 里 embedText 直接打 QWEN），db 改注入，阈值/条数保持一致。

const HISTORY_LIMIT = 200;
const TOP_K = 5;

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

function createRagTools({ db, embed, logger } = {}) {
  const log = (logger && logger.warn) ? logger.warn.bind(logger) : console.warn;
  if (!db) throw new Error('createRagTools: db 必填');
  if (typeof embed !== 'function') throw new Error('createRagTools: embed 必填');

  async function searchHistory(questionText, userId) {
    try {
      const queryEmbedding = await embed(questionText);
      const logs = await db.collection('mastery_logs')
        .where({ userId }).orderBy('createdAt', 'desc').limit(HISTORY_LIMIT).get();
      return logs.data
        .filter((item) => item.embedding && Array.isArray(item.embedding) && item.embedding.length > 0)
        .map((item) => ({
          score: cosine(queryEmbedding, item.embedding),
          reportText: item.reportText || '',
          isCorrect: item.report && item.report.isCorrect,
        }))
        .filter((h) => h.reportText)
        .sort((a, b) => b.score - a.score)
        .slice(0, TOP_K);
    } catch (e) {
      log('[graphEngine/rag] RAG search failed: ' + e.message);
      return [];
    }
  }

  function buildRagContext(hits) {
    if (!hits || !hits.length) return '';
    return hits.map((h, i) =>
      '[历史参考 ' + (i + 1) + '] 题目：' + h.reportText + '（当时判定：' + (h.isCorrect ? '对' : '错') + '，相似度 ' + h.score.toFixed(2) + '）'
    ).join('\n');
  }

  return { cosine, searchHistory, buildRagContext, buildReportText, HISTORY_LIMIT, TOP_K };
}

function buildReportText(report) {
  const parts = [
    '题目：' + (report.questionText || ''),
    '作答：' + (report.studentAnswer || ''),
    '判定：' + (report.isCorrect ? '对' : '错'),
    '题型：' + (report.questionCategory || ''),
    '难度：' + (report.difficultyLevel || ''),
    '知识点：' + (report.knowledgeNodeName || report.knowledgeNodeId || ''),
  ];
  if (report.errorDimension) parts.push('归因维度：' + report.errorDimension);
  if (report.errorAttribution) parts.push('归因：' + report.errorAttribution);
  if (report.breakpoint) parts.push('断点：第' + report.breakpoint.index + '段 ' + report.breakpoint.nature);
  if (Array.isArray(report.knowledgeUsage) && report.knowledgeUsage.length) {
    parts.push('知识点使用：' + report.knowledgeUsage.map((u) => u.name + '(P=' + u.P + ')').join('、'));
  }
  return parts.join(' | ');
}

module.exports = { createRagTools, cosine, buildReportText, HISTORY_LIMIT, TOP_K };
