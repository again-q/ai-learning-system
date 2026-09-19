// ============ 数据装配：把确定事实装好注入 Prompt（AI 只负责检索与生成） ============
const cloud = require('wx-server-sdk');
const db = cloud.database();

// 读取该批次的判定结果，整理成报告输入
async function assemble(batchId, userId) {
  const qs = await db.collection('questions')
    .where({ batchId, userId }).limit(100).get();
  const reviewed = qs.data.filter((q) => q.reviewed && q.processScore != null);

  // 官方口径优先（智学网 plan b 批次带 officialTally）：plan b 只导入未满分的题，
  // 若拿题目行数当分母，会得出「5 道题对 0 道」这种错话；官方数据在手就以官方为准。
  let tally = null;
  try {
    const b = await db.collection('batches').doc(batchId).get();
    const bd = b && (b.data || (Array.isArray(b) ? b[0] : null));
    if (bd && bd.officialTally) tally = bd.officialTally;
  } catch (e) { /* 没有批次文档（或旧批次）时退回 AI 口径 */ }
  const officialTotal = tally ? ['对', '半对', '错', '未判'].reduce((n, k) => n + (Number(tally[k]) || 0), 0) : 0;

  // 本次统计（与 statService 逻辑一致；函数内联避免跨函数调用延迟）
  const total = officialTotal > 0 ? officialTotal : reviewed.length;
  // 口径统一（决策 026：「P 不=1 都算错」）：原为 >=0.5，与报告圆点（>=1）打架——
  // 11 个批次里 6 个出现「摘要说对 N 道、圆点只有 N-1 个 ✓」。半对单独计数，不再冒充「对」。
  const correct = officialTotal > 0 ? (Number(tally['对']) || 0) : reviewed.filter((q) => q.processScore >= 1).length;
  const half = officialTotal > 0 ? (Number(tally['半对']) || 0) : (reviewed.filter((q) => q.processScore > 0 && q.processScore < 1).length);
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
      if (lr.length) { lastRate = lr.filter((x) => x.processScore >= 1).length / lr.length; break; }
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
    questionId: q._id,
    questionText: q.questionText || '',
    traceReport: (q.traceReport || '').slice(0, 2000),
    segments: q.segments || [],
    breakpoint: q.breakpoint || null,
    processAvailable: !!q.processAvailable,
    knowledgeUsage: q.knowledgeUsage || [],
    pattern: q.pattern || null,
    errorType: q.errorType || null,
    errorLevel: q.errorLevel || null,
    correctAnswer: q.correctAnswer || '',
    cropFileID: q.cropFileID || null,
    errorAttribution: q.errorAttribution || null,
    errorDimension: q.errorDimension || null,
    processScore: q.processScore,
    questionType: q.questionType || '其他',
    // 三态：官方有判定就用官方（零抖动），否则用 AI 过程分 P 推
    status: ['对', '半对', '错'].includes(q.officialStatus) ? q.officialStatus : (q.processScore >= 1 ? '对' : (q.processScore > 0 ? '半对' : '错')),
    officialStatus: q.officialStatus || null,
    officialScore: q.officialScore != null ? q.officialScore : null,
    officialStandardScore: q.officialStandardScore != null ? q.officialStandardScore : null,
    officialClassScoreRate: q.officialClassScoreRate != null ? q.officialClassScoreRate : null,
    officialKnowledge: Array.isArray(q.officialKnowledge) ? q.officialKnowledge : [],
  }));
  const wrongQuestions = allQuestions.filter((q) => q.processScore < 1);

  return {
    stats: { totalQuestions: total, correctCount: correct, halfCount: half, correctRate: rate, trend, lastCorrectRate: lastRate, scoreSource: officialTotal > 0 ? 'official' : 'ai' },
    allQuestions,
    wrongQuestions,
    wrongCount: wrongQuestions.length,
  };
}

module.exports = { assemble };