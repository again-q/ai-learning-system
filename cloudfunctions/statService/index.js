const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { computeK, isUsableRow, rowK } = require('./kFormula');   // K 口径（决策 052），纯函数可单测

const success = (data = null) => ({ code: 0, data, message: 'ok' });
const fail = (code, msg) => ({ code, data: null, message: msg });

// 单批次的答题统计（reviewed 且 processScore 有值；失败题自动排除）
async function batchStats(batchId, userId) {
  const qs = await db.collection('questions')
    .where({ batchId, userId }).limit(100).get();
  const reviewed = qs.data.filter((q) => q.reviewed && q.processScore != null);
  const total = reviewed.length;
  // 口径统一（决策 026：「P 不=1 都算错」）——与报告圆点、掌握度 pOk 保持一致
  const correct = reviewed.filter((q) => q.processScore >= 1).length;
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

// 知识点名列表（决策 053：主知识点已取消 → 用 knowledgeUsage 的每个 name；旧数据兜底 knowledgeNodeName）
function usageNamesOf(q) {
  const us = Array.isArray(q && q.knowledgeUsage) ? q.knowledgeUsage : [];
  const names = us.map((u) => String((u && u.name) || '').trim()).filter(Boolean);
  if (names.length) return Array.from(new Set(names));
  const legacy = String((q && q.knowledgeNodeName) || '').trim();
  return legacy ? [legacy] : ['未归类知识点'];
}

async function patternTrajectory(userId, nodeFilter) {
  const qs = await db.collection('questions')
    .where({ userId, reviewed: true }).limit(1000).get();
  const scored = qs.data.filter((q) => q.processScore != null);
  const groups = {};
  for (const q of scored) {
    // 按知识点聚合（决策 053：一题按其调用的**每个**知识点各记一条；pattern 未落库，见开发经验 §31）
    const correct = q.processScore >= 1;   // 口径统一（决策 026）：否则 P=0.6 会在题型轨迹上显示「做对」而报告里显示 ✗
    const nature = (q.breakpoint && q.breakpoint.nature) || null;
    const closeness = correct ? 3 : (CLOSINESS[nature] != null ? CLOSINESS[nature] : null);
    for (const key of usageNamesOf(q)) {
      if (nodeFilter && key !== nodeFilter) continue;
      if (!groups[key]) groups[key] = [];
      groups[key].push({
        batchId: q.batchId,
        date: fmtDate(q.createdAt),
        result: correct ? RESULT_LABEL[3] : (RESULT_LABEL[closeness] || '无过程'),
        closeness,
        _t: q.createdAt ? new Date(q.createdAt.$date || q.createdAt).getTime() : 0,
      });
    }
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

// ============ 掌握度总览（决策 052：K = 叶子「用对率」ΣcorrectCount/Σattempts） ============
// 口径必须与图谱页/报告同源。
// ⚠️ 2026-10-06 修：原实现按 `mastery` 字段排序取最弱 3 个，但决策 052 之后
//    **权威口径是 correctCount/attempts**，`mastery` 在 28 条旧行上是失效残留
//    （例：attempts=18 correct=6 却写着 mastery=0.57，052 口径应为 0.33）。
//    直接用 mastery 排序 → 「最弱知识点」排序错乱。改为统一走 rowK()。
// 排除：父节点聚合行（aggregated，同一证据记两遍）+ 证据不足行（只考过 1 次）
async function masteryOverview(userId) {
  const res = await db.collection('knowledge_progress')
    .where({ userId }).limit(1000).get();
  const rows = res.data || [];
  const usable = rows.filter(isUsableRow);
  const k = computeK(rows); // 0~1，无有效样本时 null
  // 最弱 3 个知识点（按 052 口径的行 K 升序；名称回 knowledge_nodes 补）
  const weak = usable
    .map((r) => ({ r, k: rowK(r) }))
    .filter((x) => x.k != null)
    .sort((a, b) => a.k - b.k)
    .slice(0, 3)
    .map((x) => x.r);
  const ids = weak.map((w) => w.knowledgeNodeId).filter(Boolean);
  let weakNodes = [];
  if (ids.length) {
    const nr = await db.collection('knowledge_nodes')
      .where({ _id: _.in(ids) }).limit(5).get();
    weakNodes = nr.data.map((n) => n.name).filter(Boolean);
  }
  return {
    masteryPercent: k == null ? null : Math.round(k * 100),
    nodeCount: rows.length,
    weakNodes,
  };
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

    // 掌握度总览：不依赖单批次
    if (event.action === 'overview') {
      return success(await masteryOverview(openid));
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
