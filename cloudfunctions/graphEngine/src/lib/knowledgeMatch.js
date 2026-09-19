// ============ 原子工具：知识点匹配（D4 · 从 judgeOne 拆出） ============
// ⚠️ 来源：cloudfunctions/judgeOne/index.js:92-224（逐行照抄；仅把全局 db/缓存改成「按实例注入」以便单测）
// 设计：工厂函数 createKnowledgeTools({ db, _ }) → 返回一组原子工具；**不含业务步骤**，供 N2/N5 等节点调用
'use strict';

function createKnowledgeTools(deps) {
  const db = deps && deps.db;
  const _ = deps && deps._;            // 云 SDK 的 db.command（可选：不传则不加 exists 过滤）
  const ttl = (deps && deps.cacheTtlMs) || 5 * 60 * 1000;
  let cache = null;
  let cacheAt = 0;

  async function loadNodes() {
    const now = Date.now();
    if (!cache || now - cacheAt > ttl) {
      let q = db.collection('knowledge_nodes');
      if (_ && typeof _.exists === 'function') q = q.where({ knowledgeId: _.exists(true) });
      const res = await q.limit(1000).get();
      cache = res.data;
      cacheAt = now;
    }
    return cache;
  }

  /** 构建「知识点节点清单」文本（喂给模型，让它从规范名里挑，而不是自由造名） */
  async function buildNodeNames() {
    try {
      const nodes = await loadNodes();
      const names = Array.from(new Set((nodes || []).map((n) => String(n.name || '').trim()).filter(Boolean)))
        .sort((a, b) => a.length - b.length || a.localeCompare(b, 'zh'));
      return '【知识点节点清单】' + names.join('、');
    } catch (e) { return ''; }
  }

  /** 名称相似度（纯函数，照抄 judgeOne:119-130） */
  function simName(a, b) {
    a = String(a || '').trim(); b = String(b || '').trim();
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) {
      const short = Math.min(a.length, b.length), long = Math.max(a.length, b.length);
      return Math.min(1, 0.6 + 0.4 * (short / long));
    }
    const sa = new Set(a), sb = new Set(b);
    let inter = 0;
    for (const c of sa) if (sb.has(c)) inter++;
    return (2 * inter) / (sa.size + sb.size);
  }

  /** 相似度 ≥0.8 才认（照抄 judgeOne:132-143） */
  async function findNode(kName) {
    const nodes = await loadNodes();
    let best = null, bestScore = 0;
    for (const n of nodes || []) {
      const nm = n.name || '';
      if (!nm) continue;
      const s = simName(kName, nm);
      if (s > bestScore) { bestScore = s; best = n; }
    }
    return bestScore >= 0.8 ? best : null;
  }

  /** 图谱匹配失败 → custom_nodes 兜底（决策 2026-08-17 方案 A；照抄 judgeOne:148-163） */
  async function matchKnowledgeNode(kName, userId) {
    const n = await findNode(kName);
    if (n) return n.knowledgeId || n._id;
    try {
      const cRes = await db.collection('custom_nodes').where({ name: kName }).limit(1).get();
      if (cRes.data.length) return cRes.data[0]._id;
      const cIns = await db.collection('custom_nodes').add({
        data: { name: kName, userId: userId || null, createdAt: db.serverDate ? db.serverDate() : new Date() },
      });
      return cIns._id;
    } catch (e) {
      console.warn('[knowledgeMatch] custom_nodes 兜底失败:', e.message);
      return null;
    }
  }

  /** 知识点所属单元名（宪法 §5.3：A 为单元级）——节点 path[2] */
  function unitNameOf(node) {
    if (!node || !Array.isArray(node.path) || node.path.length < 3) return null;
    return node.path[2];
  }

  /** 掌握度迁移（照抄 judgeOne:173-224；复核页改知识点名时用） */
  async function migrateProgress(openid, oldName, newName, D, P) {
    if (!oldName || !newName || oldName === newName) return;
    const d = Number(D) || 0;
    const p = Number(P) || 0;
    if (d <= 0) return;
    const oldId = await matchKnowledgeNode(oldName);
    const newId = await matchKnowledgeNode(newName);
    if (oldId === newId) return;
    const now = db.serverDate ? db.serverDate() : new Date();
    if (oldId) {
      const pRes = await db.collection('knowledge_progress').where({ userId: openid, knowledgeNodeId: oldId }).limit(1).get();
      if (pRes.data.length) {
        const doc = pRes.data[0];
        const S = Math.max(0, (doc.sValue || 0) - d * p);
        const Dsum = Math.max(0, (doc.dValue || 0) - d);
        if (Dsum <= 0.0001) {
          await db.collection('knowledge_progress').doc(doc._id).remove();
        } else {
          await db.collection('knowledge_progress').doc(doc._id).update({ data: {
            sValue: Math.round(S * 10000) / 10000,
            dValue: Math.round(Dsum * 10000) / 10000,
            mastery: Math.round((S / Dsum) * 100) / 100,
            lastUpdated: now,
          } });
        }
      }
    }
    if (newId) {
      const pRes = await db.collection('knowledge_progress').where({ userId: openid, knowledgeNodeId: newId }).limit(1).get();
      const doc = pRes.data[0] || {};
      const S = (doc.sValue || 0) + d * p;
      const Dsum = (doc.dValue || 0) + d;
      const patch = {
        sValue: Math.round(S * 10000) / 10000,
        dValue: Math.round(Dsum * 10000) / 10000,
        mastery: Math.round((S / Dsum) * 100) / 100,
        attempts: (doc.attempts || 0) + 1,
        correctCount: (doc.correctCount || 0) + (p >= 0.5 ? 1 : 0),
        lastUpdated: now,
      };
      if (pRes.data.length) {
        await db.collection('knowledge_progress').doc(pRes.data[0]._id).update({ data: patch });
      } else {
        await db.collection('knowledge_progress').add({ data: Object.assign({ userId: openid, knowledgeNodeId: newId }, patch) });
      }
    }
  }

  return { loadNodes, buildNodeNames, simName, findNode, matchKnowledgeNode, unitNameOf, migrateProgress };
}

module.exports = { createKnowledgeTools };
