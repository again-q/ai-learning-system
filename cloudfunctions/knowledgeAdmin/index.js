const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const https = require('https');

const success = (data = null) => ({ code: 0, data, message: 'ok' });
const fail = (code, msg) => ({ code, data: null, message: msg });

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function upsertAll(nodes) {
  let added = 0, updated = 0, failed = 0;
  for (let i = 0; i < nodes.length; i += 50) {
    const batch = nodes.slice(i, i + 50);
    await Promise.all(batch.map(async (n) => {
      if (!n.knowledgeId || !n.name) { failed++; return; }
      const exist = await db.collection('knowledge_nodes')
        .where({ knowledgeId: n.knowledgeId }).limit(1).get();
      if (exist.data.length) {
        await db.collection('knowledge_nodes').doc(exist.data[0]._id).update({ data: n });
        updated++;
      } else {
        await db.collection('knowledge_nodes').add({ data: n });
        added++;
      }
    }).map(p => p.catch(() => { failed++; })));
  }
  return success({ added, updated, failed, total: nodes.length });
}

/**
 * 知识图谱节点管理（新 schema：knowledgeId/name/type/parentId/path/concept/importance/relations）
 * action:
 *   importNodes  — 批量 upsert（按 knowledgeId 查重，存在则 update 不存在则 add）
 *   addNode      — 单节点新增
 *   updateNode   — 单节点更新（knowledgeId 定位）
 *   deleteNode   — 单节点删除
 *   stats        — 统计（总数 / type 分布 / path 完整性）
 */
exports.main = async (event) => {
  try {
    const { action } = event;

    if (action === 'importNodes') {
      const nodes = event.nodes;
      if (!Array.isArray(nodes) || !nodes.length) return fail(400, '缺少 nodes 数组');
      return upsertAll(nodes);
    }

    // 从云存储 URL 导入（批量 upsert，避免 invoke 传大数据）
    if (action === 'importFromStorage') {
      const url = event.url;
      if (!url) return fail(400, '缺少 url');
      const buf = await download(url);
      let nodes;
      try { nodes = JSON.parse(buf.toString('utf8')); }
      catch (e) { return fail(400, 'JSON 解析失败: ' + e.message); }
      if (!Array.isArray(nodes) || !nodes.length) return fail(400, '节点数组为空');
      return upsertAll(nodes);
    }

    if (action === 'addNode') {
      const n = event.node;
      if (!n || !n.knowledgeId || !n.name) return fail(400, '缺少 knowledgeId/name');
      const exist = await db.collection('knowledge_nodes')
        .where({ knowledgeId: n.knowledgeId }).limit(1).get();
      if (exist.data.length) return fail(409, '节点已存在，请用 updateNode');
      const res = await db.collection('knowledge_nodes').add({ data: n });
      return success({ _id: res._id });
    }

    if (action === 'updateNode') {
      const { knowledgeId, node } = event;
      if (!knowledgeId || !node) return fail(400, '缺少 knowledgeId/node');
      const exist = await db.collection('knowledge_nodes')
        .where({ knowledgeId }).limit(1).get();
      if (!exist.data.length) return fail(404, '节点不存在');
      await db.collection('knowledge_nodes').doc(exist.data[0]._id).update({ data: node });
      return success({ updated: true });
    }

    if (action === 'deleteNode') {
      const { knowledgeId } = event;
      if (!knowledgeId) return fail(400, '缺少 knowledgeId');
      const exist = await db.collection('knowledge_nodes')
        .where({ knowledgeId }).limit(1).get();
      if (!exist.data.length) return fail(404, '节点不存在');
      await db.collection('knowledge_nodes').doc(exist.data[0]._id).remove();
      return success({ deleted: true });
    }

    if (action === 'stats') {
      const total = await db.collection('knowledge_nodes').count();
      const byType = {};
      for (const t of ['definition', 'property', 'method', 'notation', 'example', 'reading']) {
        const c = await db.collection('knowledge_nodes').where({ type: t }).count();
        byType[t] = c.total;
      }
      const noPath = await db.collection('knowledge_nodes')
        .where({ path: db.command.size(0) }).count();
      return success({ total: total.total, byType, noPath: noPath.total });
    }

    return fail(400, '未知操作');
  } catch (e) {
    console.error('[knowledgeAdmin] error:', e);
    return fail(500, '服务异常');
  }
};
