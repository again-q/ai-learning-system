// ============ 数据装配：把确定事实装好注入 Prompt（AI 只负责检索与生成） ============
const cloud = require('wx-server-sdk');
const db = cloud.database();

// 读取该批次的判定结果，整理成报告输入
async function assemble(batchId, userId) {
  const qs = await db.collection('questions')
    .where({ batchId, userId }).limit(100).get();
  const reviewed = qs.data.filter((q) => q.reviewed && q.processScore != null);

  // 本次统计（与 statService 逻辑一致；函数内联避免跨函数调用延迟）
  const total = reviewed.length;
  const correct = reviewed.filter((q) => q.processScore >= 0.5).length;
  const rate = total > 0 ? Math.round((correct / total) * 10000) / 10000 : null;

  // 上次统计（排除当前批次）
  let lastRate = null;
  try {
    const batches = await db.collection('batches')
      .where({ userId, status: 'completed' })
      .orderBy('completedAt', 'desc').limit(20).get();
    for (const b of batches.data) {
      if (b._id === batchId) continue;
      const lq = await db.collection('questions')
        .where({ batchId: b._id, userId }).limit(100).get();
      const lr = lq.data.filter((x) => x.reviewed && x.processScore != null);
      if (lr.length) { lastRate = lr.filter((x) => x.processScore >= 0.5).length / lr.length; break; }
    }
  } catch (e) { console.warn('[reportService] 上次统计失败:', e.message); }

  let trend = 'none';
  if (rate != null && lastRate != null) {
    if (rate - lastRate > 0.1) trend = 'up';
    else if (lastRate - rate > 0.1) trend = 'down';
    else trend = 'flat';
  }

  // 所有已判定题（报告呈现全部题目情况；错题用于薄弱点分析）
  const allQuestions = reviewed.map((q) => ({
    questionText: q.questionText || '',
    traceReport: (q.traceReport || '').slice(0, 2000),
    segments: q.segments || [],
    breakpoint: q.breakpoint || null,
    processAvailable: !!q.processAvailable,
    knowledgeUsage: q.knowledgeUsage || [],
    pattern: q.pattern || null,
    errorAttribution: q.errorAttribution || null,
    errorDimension: q.errorDimension || null,
    processScore: q.processScore,
    questionType: q.questionType || '其他',
    status: q.processScore >= 0.5 ? '对' : '错',   // P 编码对错（决策 025）：P≥0.5 基本答对
  }));
  const wrongQuestions = allQuestions.filter((q) => q.processScore < 0.5);

  return {
    stats: { totalQuestions: total, correctCount: correct, correctRate: rate, trend, lastCorrectRate: lastRate },
    allQuestions,
    wrongQuestions,
    wrongCount: wrongQuestions.length,
  };
}

module.exports = { assemble };
