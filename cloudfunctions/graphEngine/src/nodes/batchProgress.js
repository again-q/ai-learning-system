'use strict';
// N7 · 批次进度（judgeOne/index.js:763-780 搬迁）
// 降级红线：失败只记 issues + warn；无 batchId 时直接跳过（线上是 doc(undefined).get() 抛错后被 catch，等价）
function createBatchProgressNode({ db, now, logger } = {}) {
  const log = (logger && logger.warn) ? logger.warn.bind(logger) : console.warn;
  if (!db) throw new Error('N7: db 必填');
  return async function batchProgressNode(state) {
    const issues = [];
    const batchId = (state.question || {}).batchId;
    if (!batchId) return { issues };
    try {
      const batchRes = await db.collection('batches').doc(batchId).get();
      if (batchRes.data) {
        const done = ((batchRes.data.progress && batchRes.data.progress.done) || 0) + 1;
        const total = batchRes.data.progress ? batchRes.data.progress.total : 0;
        await db.collection('batches').doc(batchId).update({ data: { progress: { done, total } } });
        if (total > 0 && done >= total) {
          await db.collection('batches').doc(batchId).update({
            data: { status: 'completed', completedAt: (typeof now === 'function') ? now() : db.serverDate() },
          });
        }
      }
    } catch (e) {
      log('[graphEngine/N7] batch progress update failed: ' + e.message);
      issues.push('N7: 批次进度更新失败（已降级）: ' + e.message);
    }
    return { issues };
  };
}

module.exports = { createBatchProgressNode };
