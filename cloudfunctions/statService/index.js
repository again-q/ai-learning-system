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

// ============ 题型轨迹（patternTrajectory）：同类题历史判定聚合 ============
// 认知科学依据：掌握经验（mastery experience）是自我效能最强来源；
// 轨迹展示「断点位置在移动」（起步即停→中途断→收尾断→做对=在接近答案），不做错误黑账。
const CLOSINESS = { '起步即停': 0, '中途断': 1, '收尾断': 2 };
const RESULT_LABEL = { 0: '起步即停', 1: '中途断', 2: '收尾断', 3: '做对' };

function fmtDate(v) {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v.$date || v);
  if (isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

async function patternTrajectory(userId, nodeFilter) {
  const qs = await db.collection('questions')
    .where({ userId, reviewed: true }).limit(1000).get();
  const scored = qs.data.filter((q) => q.processScore != null);
  const groups = {};
  for (const q of scored) {
    // 按知识点聚合（knowledgeNodeName 每题落库；pattern 未落库，见开发经验 §31）
    const key = q.knowledgeNodeName || '未归类知识点';
    if (nodeFilter && key !== nodeFilter) continue;
    if (!groups[key]) groups[key] = [];
    const correct = q.processScore >= 0.5;
    const nature = (q.breakpoint && q.breakpoint.nature) || null;
    const closeness = correct ? 3 : (CLOSINESS[nature] != null ? CLOSINESS[nature] : null);
    groups[key].push({
      batchId: q.batchId,
      date: fmtDate(q.createdAt),
      result: correct ? RESULT_LABEL[3] : (RESULT_LABEL[closeness] || '无过程'),
      closeness,
      _t: q.createdAt ? new Date(q.createdAt.$date || q.createdAt).getTime() : 0,
    });
  }
  const patterns = Object.keys(groups).map((key) => {
    const attempts = groups[key].sort((a, b) => a._t - b._t)
      .map(({ batchId, date, result, closeness }) => ({ batchId, date, result, closeness }));
    const known = attempts.filter((a) => a.closeness != null);
    const latest = attempts[attempts.length - 1];
    let trendLabel = '数据不足';
    if (attempts.length >= 2 && known.length >= 1) {
      const firstKnown = known[0], lastKnown = known[known.length - 1];
      if (latest.result === '做对' && attempts.some((a) => a.result !== '做对')) trendLabel = '已突破';
      else if (known.length >= 2 && lastKnown.closeness > firstKnown.closeness) trendLabel = '在接近答案';
      else if (known.length >= 2 && lastKnown.closeness === firstKnown.closeness) trendLabel = '卡在同一位置';
    }
    return { pattern: key, count: attempts.length, attempts, latestResult: latest.result, trendLabel };
  }).sort((a, b) => b.count - a.count);
  return { patterns };
}

exports.main = async (event) => {
  try {
    // 身份：小程序调用 OPENID 必有；云函数互调/测试场景用调用方显式传入的 userId
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID || (event && event.userId) || null;
    if (!openid) return fail(401, '未登录');

    // 题型轨迹：不依赖单批次，先分流
    if (event.action === 'patternTrajectory') {
      return success(await patternTrajectory(openid, event.pattern || null));
    }

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
