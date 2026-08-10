const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const success = (data = null) => ({ code: 0, data, message: 'ok' });
const fail = (code, msg) => ({ code, data: null, message: msg });

exports.main = async (event) => {
  try {
    const { action, parentId, nodeId, batchId } = event;

    // 全量节点（前端一次拉取，本地建图：结构导航 + 演化链都本地计算）
    if (action === 'getAll') {
      const res = await db.collection('knowledge_nodes')
        .where({ knowledgeId: _.exists(true) }).limit(1000).get();
      return success({ nodes: res.data });
    }

    // 图谱查询（公开可读；掌握度前端先用 mock，待诊断链路补上后接入）
    if (action === 'getGraph') {
      if (nodeId) {
        const res = await db.collection('knowledge_nodes').where({ knowledgeId: nodeId }).limit(1).get();
        if (!res.data.length) return fail(404, '节点不存在');
        return success({ currentNode: res.data[0] });
      }
      // 根节点 = parentId 为 null 且为新 schema 节点（过滤旧版无 knowledgeId 的数据）
      const query = parentId
        ? { parentId, knowledgeId: _.exists(true) }
        : { parentId: null, knowledgeId: _.exists(true) };
      const res = await db.collection('knowledge_nodes').where(query).limit(100).get();
      // 标注子节点数
      const nodes = await Promise.all(res.data.map(async (n) => {
        if (!n.knowledgeId) return { ...n, childCount: 0, hasChildren: false };
        const cnt = await db.collection('knowledge_nodes').where({ parentId: n.knowledgeId }).count();
        return { ...n, childCount: cnt.total, hasChildren: cnt.total > 0 };
      }));
      return success({ nodes });
    }

    // 获取诊断报告（需登录 + 归属校验）
    if (action === 'getReport') {
      const wxContext = cloud.getWXContext();
      const openid = wxContext.OPENID;
      if (!openid) return fail(401, '未登录');
      if (!batchId) return fail(400, '缺少批次ID');

      const batchRes = await db.collection('batches').doc(batchId).get().catch(() => null);
      if (!batchRes || !batchRes.data) return fail(404, '批次不存在');
      if (batchRes.data.userId !== openid) return fail(403, '无权查看');

      const qRes = await db.collection('questions').where({ batchId, userId: openid }).orderBy('createdAt', 'asc').get();
      const questions = qRes.data.map((q) => ({
        questionId: q._id,
        questionText: q.questionText,
        questionType: q.questionType,
        isCorrect: q.isCorrect,
        questionCategory: q.questionCategory,
        difficultyLevel: q.difficultyLevel,
        difficultyValue: q.difficultyValue,
        processScore: q.processScore,
        pathQuality: q.pathQuality,
        transferQuality: q.transferQuality,
        correctAnswer: q.correctAnswer,
        knowledgeNodeId: q.knowledgeNodeId,
        nodeStatus: q.nodeStatus,
        errorAttribution: q.errorAttribution,
        studentAnswer: q.studentAnswer,
      }));

      return success({
        batchId,
        status: batchRes.data.status,
        totalQuestions: batchRes.data.totalQuestions || 0,
        failedCount: batchRes.data.failedCount || 0,
        questions,
      });
    }

    return fail(400, '未知操作');
  } catch (e) {
    console.error('[graphService] error:', e);
    return fail(500, '服务异常');
  }
};
