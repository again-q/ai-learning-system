'use strict';
// N6 · 写 mastery_logs（旧题库/检索源，含 embedding）（judgeOne/index.js:695-761 搬迁）
// 降级红线：失败只记 issues + warn，不阻塞主流程；embedding 失败时记录仍写（检索自动跳过无向量记录）
function createRagLogNode({ db, rag, embed, now, logger } = {}) {
  const log = (logger && logger.warn) ? logger.warn.bind(logger) : console.warn;
  if (!db) throw new Error('N6: db 必填');
  if (!rag || typeof rag.buildReportText !== 'function') throw new Error('N6: rag.buildReportText 必填');
  if (typeof embed !== 'function') throw new Error('N6: embed 必填');

  return async function ragLogNode(state) {
    const issues = [];
    try {
      const raw = state.raw || {};
      const derived = state.derived || {};
      const clamped = state.clamped || {};
      const question = state.question || {};
      const mainNodeId = (state.mastery && state.mastery.mainNodeId) || null;
      const pOk = !!(state.mastery && state.mastery.pOk);
      const patternFull = derived.patternFull || '';
      const ragReportText = rag.buildReportText({
        questionText: question.questionText || '',
        studentAnswer: (question.traceReport || '').slice(0, 300),
        isCorrect: pOk,
        questionCategory: derived.patternText || raw.questionCategory || question.questionType || '',
        difficultyLevel: raw.level || 'L4',
        knowledgeNodeId: mainNodeId || '',
        knowledgeNodeName: (raw.knowledgeNodeName || '').trim(),
        errorAttribution: derived.errorAttribution,
        errorDimension: raw.errorDimension || null,
        breakpoint: raw.breakpoint || null,
        knowledgeUsage: Array.isArray(raw.knowledgeUsage) ? raw.knowledgeUsage : [],
      });
      let embedding = null;
      let patternEmbedding = null;
      try {
        embedding = await embed(ragReportText);
        if (patternFull) patternEmbedding = await embed(patternFull);
      } catch (e) {
        log('[graphEngine/N6] RAG embed failed: ' + e.message);
        issues.push('N6: RAG embed 失败（记录仍写，检索跳过）: ' + e.message);
      }
      await db.collection('mastery_logs').add({
        data: {
          _openid: state.openid,
          userId: state.openid,
          questionId: state.questionId,
          knowledgeNodeId: mainNodeId,
          knowledgeNodeName: (raw.knowledgeNodeName || '').trim() || null,
          algorithm: 'diagnose_v1',
          isCorrect: pOk,
          processScore: Number(clamped.P) || 0,
          difficultyValue: Number(clamped.D) || 0,
          errorType: derived.errorType,
          errorLevel: derived.errorLevel,
          errorAttribution: derived.errorAttribution,
          errorDimension: raw.errorDimension || null,
          segments: Array.isArray(raw.segments) ? raw.segments : [],
          breakpoint: raw.breakpoint || null,
          knowledgeUsage: Array.isArray(raw.knowledgeUsage) ? raw.knowledgeUsage : [],
          processAvailable: raw.processAvailable === true,
          pattern: patternFull || null,
          report: {
            questionText: question.questionText || '',
            isCorrect: pOk,
            knowledgeNodeName: (raw.knowledgeNodeName || '').trim() || null,
            errorType: derived.errorType,
            errorLevel: derived.errorLevel,
            errorAttribution: derived.errorAttribution,
            errorDimension: raw.errorDimension || null,
            segments: Array.isArray(raw.segments) ? raw.segments : [],
            breakpoint: raw.breakpoint || null,
            knowledgeUsage: Array.isArray(raw.knowledgeUsage) ? raw.knowledgeUsage : [],
            processAvailable: raw.processAvailable === true,
          },
          reportText: ragReportText,
          embedding,
          patternEmbedding,
          createdAt: (typeof now === 'function') ? now() : db.serverDate(),
        },
      });
    } catch (e) {
      log('[graphEngine/N6] mastery_logs RAG 记录写入失败（判定已更新，降级）: ' + e.message);
      issues.push('N6: mastery_logs 写入失败（已降级）: ' + e.message);
    }
    return { issues };
  };
}

module.exports = { createRagLogNode };
