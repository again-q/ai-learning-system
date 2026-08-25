const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const success = (data = null) => ({ code: 0, data, message: 'ok' });
const fail = (code, msg) => ({ code, data: null, message: msg });

// 单批次的答题统计（reviewed 且 processScore 有值；失败题自动排除）
async function batchStats(batchId, userId) {
  const qs = await db.collection('questions')
    .where({ batchId, userId }).limit(100).get();
  const reviewed = qs.data.filter((q) => q.reviewed && q.processScore != null);
  const total = reviewed.length;
  const correct = reviewed.filter((q) => q.processScore >= 0.5).length;
  const rate = total > 0 ? Math.round((correct / total) * 10000) / 10000 : null;
  return { total, correct, rate };
}

// 找该用户上一次有判定的批次（排除当前），返回其正确率
async function lastRate(userId, excludeBatchId) {
  const batches = await db.collection('batches')
    .where({ userId, status: 'completed' })
    .orderBy('completedAt', 'desc').limit(20).get();
  for (const b of batches.data) {
    if (b._id === excludeBatchId) continue;
    const st = await batchStats(b._id, userId);
    if (st.total > 0) return st.rate;
  }
  return null;
}

exports.main = async (event) => {
  try {
    // 身份：小程序调用 OPENID 必有；云函数互调/测试场景用调用方显式传入的 userId
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID || (event && event.userId) || null;
    if (!openid) return fail(401, '未登录');

    const { batchId } = event;
    if (!batchId) return fail(400, '缺少 batchId');

    // 归属校验
    const batchRes = await db.collection('batches').doc(batchId).get().catch(() => null);
    if (!batchRes || !batchRes.data) return fail(404, '批次不存在');
    if (batchRes.data.userId !== openid) return fail(403, '无权操作他人批次');

    const cur = await batchStats(batchId, openid);
    const last = await lastRate(openid, batchId);

    // trend：与上次相比（差 >0.1 上升 / <−0.1 下降 / 否则持平；无上次 none）
    let trend = 'none';
    if (cur.rate != null && last != null) {
      if (cur.rate - last > 0.1) trend = 'up';
      else if (last - cur.rate > 0.1) trend = 'down';
      else trend = 'flat';
    }

    return success({
      totalQuestions: cur.total,
      correctCount: cur.correct,
      correctRate: cur.rate,
      trend,
      lastCorrectRate: last,
    });
  } catch (e) {
    console.error('[statService] error:', e);
    return fail(500, '统计失败: ' + (e.message || '未知错误'));
  }
};
