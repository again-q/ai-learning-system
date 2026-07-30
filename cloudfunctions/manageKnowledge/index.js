const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 统一响应格式
const success = (data = null) => ({ code: 0, data, message: 'ok' });
const fail = (msg) => ({ code: -1, data: null, message: msg });

exports.main = async (event) => {
  const { action, nodeId, data, subjectId, type } = event;
  const wxContext = cloud.getWXContext();

  try {
    // list — 查询列表
    if (action === 'list') {
      const where = {};
      if (subjectId) where.subjectId = subjectId;
      if (type) where.type = type;

      const res = await db.collection('knowledge_nodes')
        .where(where).orderBy('chapter', 'asc').get();

      // 获取当前用户的掌握度
      const openid = wxContext.OPENID;
      let progressMap = {};
      if (openid && res.data.length > 0) {
        const nodeIds = res.data.map(n => n._id);
        const progRes = await db.collection('node_progress')
          .where({ openid, nodeId: _.in(nodeIds) }).get();
        progRes.data.forEach(p => { progressMap[p.nodeId] = p.mastery || 0; });
      }

      return success(res.data.map(n => ({
        ...n,
        mastery: progressMap[n._id] || 0
      })));
    }

    // add — 新增
    if (action === 'add') {
      if (!data || !data.name || !data.subjectId) return fail('缺少必要参数');
      const doc = {
        _id: data.id || `${data.subjectId}_${Date.now()}`,
        subjectId: data.subjectId,
        type: data.type || 'concept',
        name: data.name,
        deps: data.deps || [],
        difficulty: data.difficulty || 0.5,
        chapter: data.chapter || '',
        abilityMapping: data.abilityMapping || []
      };
      const res = await db.collection('knowledge_nodes').add({ data: doc });
      return success({ _id: res._id, ...doc });
    }

    // update — 更新
    if (action === 'update') {
      if (!nodeId) return fail('缺少 nodeId');
      if (!data) return fail('缺少更新数据');

      const updateData = {};
      if (data.name) updateData.name = data.name;
      if (data.type) updateData.type = data.type;
      if (data.difficulty) updateData.difficulty = data.difficulty;
      if (data.chapter !== undefined) updateData.chapter = data.chapter;
      if (data.deps) updateData.deps = data.deps;
      if (data.abilityMapping) updateData.abilityMapping = data.abilityMapping;

      if (Object.keys(updateData).length === 0) return fail('没有需要更新的字段');

      await db.collection('knowledge_nodes').doc(nodeId).update({ data: updateData });
      return success(null);
    }

    // delete — 删除
    if (action === 'delete') {
      if (!nodeId) return fail('缺少 nodeId');
      await db.collection('knowledge_nodes').doc(nodeId).remove();
      return success(null);
    }

    return fail('未知操作');
  } catch (err) {
    console.error('[manageKnowledge] error:', err);
    return fail(err.message);
  }
};
