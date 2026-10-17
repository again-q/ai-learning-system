'use strict';
// ============ 编排结果落库（复盘用）============
//
// 用户原话（2026-10-17）：「直接接进生产，以及日志做好随时复盘」
//
// 复盘的两个主入口（用官方分当免费 ground truth）：
//   官方扣了分 + verdict='clean'  → 可能漏检（假阴性）
//   官方满分   + verdict='found'  → 可能冤枉（假阳性）
//
// 降级红线：写日志失败只 warn，不阻塞判定。
const COLLECTION = 'orchestrator_logs';

/**
 * @param {object} db  wx-server-sdk 的 db
 * @param {object} rec 记录
 */
async function writeOrchestratorLog(db, rec, logger) {
  const warn = (logger && logger.warn) ? logger.warn.bind(logger) : console.warn;
  if (!db) return null;
  try {
    const doc = {
      questionId: rec.questionId || null,
      batchId: rec.batchId || null,
      userId: rec.userId || null,
      questionType: rec.questionType || null,
      tier: rec.tier || 'standard',
      kind: rec.kind || null,                       // 'process' | 'choice'
      // —— 复盘核心：官方分（拍照链路为 null）——
      officialScore: rec.officialScore != null ? rec.officialScore : null,
      officialStandardScore: rec.officialStandardScore != null ? rec.officialStandardScore : null,
      officialStatus: rec.officialStatus || null,
      // —— 输入质量：转录是否残缺（题19 曾因截断导致测不出真错误）——
      transcriptLength: rec.transcriptLength != null ? rec.transcriptLength : null,
      transcriptTruncated: !!rec.transcriptTruncated,
      // —— 编排明细（AI 每步算出了什么，用于将来做机器验算时回放）——
      unitCount: Array.isArray(rec.units) ? rec.units.length : 0,
      findings: Array.isArray(rec.findings) ? rec.findings.slice(0, 20) : [],
      choiceAnalysis: rec.choiceAnalysis || null,
      // —— 结论 ——
      verdict: rec.verdict || 'unknown',            // found | clean | failed | skipped
      summary: rec.summary ? String(rec.summary).slice(0, 1000) : '',
      // —— 成本 ——
      elapsedMs: rec.elapsedMs || 0,
      calls: rec.calls || 0,
      model: rec.model || null,
      createdAt: db.serverDate(),
    };
    const r = await db.collection(COLLECTION).add({ data: doc });
    return r && r._id;
  } catch (e) {
    warn('[orchestratorLog] 写日志失败（不阻塞判定）: ' + (e && e.message));
    return null;
  }
}

module.exports = { writeOrchestratorLog, COLLECTION };
