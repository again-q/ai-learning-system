'use strict';
// N4 · 写库 questions（judgeOne/index.js:660-684 搬迁，19 字段由 lib/normalize.buildQuestionPatch 组装）
//
// 2026-10-17 追加：同时落一份编排日志（orchestrator_logs），供随时复盘。
//   用户原话：「直接接进生产，以及日志做好随时复盘」
//   复盘的两个查询入口（用官方分当免费 ground truth）：
//     官方扣了分 + verdict='clean'  → 可能漏检（假阴性）
//     官方满分   + verdict='found'  → 可能冤枉（假阳性）
//   红线：写日志失败只 warn，不阻塞判定与写库。
const { writeOrchestratorLog } = require('../lib/orchestratorLog');

function createPersistQuestionNode({ db, config, logger } = {}) {
  if (!db) throw new Error('N4: db 必填');
  const warn = (logger && logger.warn) ? logger.warn.bind(logger) : console.warn;
  return async function persistQuestionNode(state) {
    const { buildQuestionPatch } = require('../lib/normalize');
    const patch = buildQuestionPatch(state.raw || {}, state.question || {}, state.clamped, state.derived);
    await db.collection('questions').doc(state.questionId).update({ data: patch });

    // —— 编排日志（失败不阻塞）——
    const q = state.question || {};
    const orch = (state.raw && state.raw.orchestrator) || null;
    if (orch) {
      try {
        const transcript = String(q.traceReport || '');
        // 转录残缺检测：以省略号结尾 / 极短 / 空 —— 题19 曾因截断导致测不出真错误
        const truncated = /……\s*$|\.\.\.\s*$/.test(transcript) || transcript.trim().length < 20;
        const verdict = (orch.findings && orch.findings.length)
          ? 'found'
          : (orch.needsTier3 ? 'unstable' : 'clean');
        await writeOrchestratorLog(db, {
          questionId: state.questionId,
          batchId: q.batchId || null,
          userId: q.userId || q._openid || null,
          questionType: q.questionType || null,
          tier: orch.tier,
          kind: orch.kind,
          // 官方分（拍照链路为 null）
          officialScore: q.officialScore,
          officialStandardScore: q.officialStandardScore,
          officialStatus: q.officialStatus,
          // 输入质量
          transcriptLength: transcript.length,
          transcriptTruncated: truncated,
          // 编排明细
          units: orch.units,
          findings: orch.findings,
          choiceAnalysis: orch.choiceAnalysis || null,
          verdict,
          summary: orch.escalateReason
            ? (orch.escalateReason + ' | ' + (orch.summary || ''))
            : (orch.summary || ''),
          elapsedMs: orch.elapsedMs,
          calls: orch.calls,
          model: (config && config.dsModel) || null,
        }, logger);
      } catch (e) {
        warn('[graphEngine/N4] 编排日志写入异常（不阻塞）: ' + (e && e.message));
      }
    }

    return { questionPatch: patch };
  };
}

module.exports = { createPersistQuestionNode };
