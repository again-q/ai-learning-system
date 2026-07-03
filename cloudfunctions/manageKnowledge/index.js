const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event) => {
  const { action, subjectId, nodeId, type, data } = event;
  const wxContext = cloud.getWXContext();

  try {
    // 查询列表
    if (action === 'list') {
      const where = {};
      if (subjectId) where.subjectId = subjectId;
      if (type) where.type = type;

      const res = await db.collection('knowledge_nodes')
        .where(where)
        .orderBy('chapter', 'asc')
        .get();

      // 同时查询 node_progress 获取当前用户的掌握度
      const openid = wxContext.OPENID;
      let progressMap = {};
      if (openid && res.data.length > 0) {
        const nodeIds = res.data.map(n => n._id);
        const progRes = await db.collection('node_progress')
          .where({ openid, nodeId: _.in(nodeIds) })
          .get();
        progRes.data.forEach(p => { progressMap[p.nodeId] = p.mastery || 0; });
      }

      return {
        code: 0,
        data: res.data.map(n => ({
          ...n,
          mastery: progressMap[n._id] || 0
        }))
      };
    }

    // 新增
    if (action === 'add') {
      if (!data || !data.name || !data.subjectId) {
        return { code: -1, message: '缺少必填字段' };
      }
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
      return { code: 0, data: { _id: res._id, ...doc } };
    }

    // 更新
    if (action === 'update') {
      if (!nodeId) return { code: -1, message: '缺少 nodeId' };
      const updateData = {};
      if (data.name) updateData.name = data.name;
      if (data.type) updateData.type = data.type;
      if (data.difficulty) updateData.difficulty = data.difficulty;
      if (data.chapter !== undefined) updateData.chapter = data.chapter;
      if (data.deps) updateData.deps = data.deps;
      if (data.abilityMapping) updateData.abilityMapping = data.abilityMapping;

      await db.collection('knowledge_nodes').doc(nodeId).update({
        data: updateData
      });
      return { code: 0, message: '更新成功' };
    }

    // 删除
    if (action === 'delete') {
      if (!nodeId) return { code: -1, message: '缺少 nodeId' };
      await db.collection('knowledge_nodes').doc(nodeId).remove();
      return { code: 0, message: '删除成功' };
    }

    return { code: -1, message: '未知操作' };
  } catch (err) {
    console.error('[manageKnowledge] error:', err);
    return { code: -1, message: err.message };
  }
};
