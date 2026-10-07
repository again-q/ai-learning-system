// ============ 原子工具：知识点匹配（D4 · 从 judgeOne 拆出） ============
// ⚠️ 来源：cloudfunctions/judgeOne/index.js:92-224（逐行照抄；仅把全局 db/缓存改成「按实例注入」以便单测）
// 设计：工厂函数 createKnowledgeTools({ db, _ }) → 返回一组原子工具；**不含业务步骤**，供 N2/N5 等节点调用
// 2026-10-06（决策 063「先 J 再 L」）：
//   N1.5 用 Jev 做知识点分类（matchByJevNodes）→ 写进 state.jevPoints/jevUnits；
//   N2 只把这一小撮考点喂给 LLM（LLM 给 D/P）；
//   N5 用 makeNameResolver **精确**解析（无字符相似度）。
//   matchKnowledgeNode（含 simName 字符相似度）**仅作「Jev 不可用」时的降级**，不在主路径上。
'use strict';

const { groupByChapter, matchByJev, isServiceUnavailable } = require('./jevMatch');

/**
 * 纯函数：从全部节点里挑出「该进清单的叶子」（2026-09-25 决策 052）
 *   ① 方法类（partition='method'）不进清单 —— 决策 028 的 WWH：方法不是知识节点
 *   ② **只给叶子** —— 父/聚合节点不进清单：父节点的值由子节点聚合，不能让模型直接挑
 * 注意：两者都**仍留在库里**供 findNode 匹配（否则历史引用会掉进 custom_nodes 兜底 → 同一内容分裂）
 * 放在模块作用域（而非工厂内）以便直接单测。
 */
function pickLeafNodes(nodes) {
  const all = Array.isArray(nodes) ? nodes : [];
  const knowledgeOnly = all.filter((n) => n && String(n.partition || '') !== 'method');
  const parentIds = new Set(all.map((n) => n && n.parentId).filter(Boolean));
  return knowledgeOnly.filter((n) => !parentIds.has(n.knowledgeId || n._id));
}

/**
 * 纯函数：构建喂给模型的「两段式清单」文本（2026-09-25 决策 054）
 *   第一段【知识本体清单】= pickLeafNodes（记 K）；第二段【方法清单】= partition==='method'（记 A）
 * 放在模块作用域：**线上 buildNodeNames 与 eval harness 共用同一实现**，避免清单文本两边漂移。
 */
function buildNodeListText(nodes) {
  const sortNames = (arr) => Array.from(new Set(arr.map((n) => String((n && n.name) || '').trim()).filter(Boolean)))
    .sort((a, b) => a.length - b.length || a.localeCompare(b, 'zh'));
  const bodyNames = sortNames(pickLeafNodes(nodes));
  const methodNames = sortNames((nodes || []).filter((n) => n && String(n.partition || '') === 'method'));
  return '【知识本体清单】' + bodyNames.join('、') + '\n\n【方法清单（解题路径，记 A）】' + methodNames.join('、');
}

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
    try { return buildNodeListText(await loadNodes()); } catch (e) { return ''; }
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

  /**
   * 知识点名 → 图谱节点 id。
   * 2026-09-25（决策 053）：匹配失败**不再自动建节点**（旧行为是 custom_nodes 兜底，积了 39 条自造），
   * 改为写「待建队列」node_requests 供图谱治理审核，并返回 null（宁缺勿假）。
   */
  /**
   * 写入「待建队列」node_requests（供图谱治理审核）。
   * 2026-09-25（决策 053）：**不再自动新建节点** —— 匹配不上就登记，
   *   理由：库内 39 条自造节点就是这么来的（自动建 = 质量失控）；宁缺勿假，账宁可不记。
   * 抽成独立函数的原因（2026-10-06）：makeNameResolver 解析失败时
   *   也必须登记 —— 否则「Jev 集合里没有」的名字会被**静默丢弃**，图谱缺口浮不出来。
   */
  async function enqueueNodeRequest(kName, userId, extra) {
    const nm = String(kName || '').trim();
    if (!nm) return;
    try {
      const qRes = await db.collection('node_requests').where({ name: nm }).limit(1).get();
      if (qRes.data.length) {
        const row = qRes.data[0];
        await db.collection('node_requests').doc(row._id).update({
          data: { count: (row.count || 1) + 1, lastSeen: db.serverDate ? db.serverDate() : new Date() },
        });
      } else {
        await db.collection('node_requests').add({
          data: Object.assign({
            name: nm, userId: userId || null, count: 1, status: 'pending',
            firstSeen: db.serverDate ? db.serverDate() : new Date(),
            lastSeen: db.serverDate ? db.serverDate() : new Date(),
          }, extra || {}),
        });
      }
    } catch (e) {
      console.warn('[knowledgeMatch] 待建队列写入失败:', e.message);
    }
  }

  async function matchKnowledgeNode(kName, userId) {
    const n = await findNode(kName);
    if (n) return n.knowledgeId || n._id;
    await enqueueNodeRequest(kName, userId);
    return null;
  }

  /**
   * 父节点聚合（决策 052 / 宪法 §4.5）：父节点的 K **只能**由子节点聚合得到，判定端不再直记父节点。
   * 权重 w 图谱未就位前**等权**；只聚合「有账的子节点」；结果继续向上传（最多 3 层）。
   * 返回本次被重算的父节点 id 列表。
   */
  async function aggregateUp(leafId, openid) {
    const nodes = await loadNodes();
    const byId = {};
    nodes.forEach((n) => { const id = n && (n.knowledgeId || n._id); if (id) byId[id] = n; });
    const kidsOf = {};
    nodes.forEach((n) => { if (n && n.parentId) (kidsOf[n.parentId] = kidsOf[n.parentId] || []).push(n.knowledgeId || n._id); });
    const touched = [];
    let cur = byId[leafId];
    for (let depth = 0; depth < 3 && cur && cur.parentId; depth++) {
      const pid = cur.parentId;
      const pNode = byId[pid];
      if (!pNode) break;
      const kids = kidsOf[pid] || [];
      const pRes = await db.collection('knowledge_progress').where({ userId: openid }).limit(1000).get().catch(() => ({ data: [] }));
      const map = {};
      (pRes.data || []).forEach((r) => { map[r.knowledgeNodeId] = r; });
      const vals = kids.map((k) => map[k]).filter((r) => r && typeof r.mastery === "number");
      if (vals.length) {
        const agg = vals.reduce((s, r) => s + r.mastery, 0) / vals.length;
        const mastery = Math.round(agg * 100) / 100;
        const old = map[pid] || {};
        const patch = {
          mastery, attempts: vals.length, aggregated: true,
          evidence: vals.length <= 1 ? 'insufficient' : 'ok',
          algorithm: 'parent_avg_v1', lastUpdated: db.serverDate ? db.serverDate() : new Date(),
        };
        if (old._id) await db.collection('knowledge_progress').doc(old._id).update({ data: patch });
        else await db.collection('knowledge_progress').add({ data: { userId: openid, knowledgeNodeId: pid, ...patch } });
        touched.push(pid);
      }
      cur = pNode;
    }
    return touched;
  }

  /** 知识点所属单元名（宪法 §5.3：A 为单元级）——节点 path[2] */
  function unitNameOf(node) {
    if (!node || !Array.isArray(node.path) || node.path.length < 3) return null;
    return node.path[2];
  }

  /**
   * 掌握度迁移（复核页把某题的知识点从 oldName 改成 newName 时用）
   * 2026-09-26 修订（决策 052/053/041），修掉三处与新口径冲突的旧行为：
   *   ① K 的唯一来源是 attempts/correctCount（用对率）→ 迁移必须搬这两个字段并**重算 mastery**；
   *      旧实现只搬 sValue/dValue、mastery 用 ΣS/ΣD，等于「改一次知识点，账不跟着走」。
   *   ② 旧实现对**新口径写出来的行**（没有 dValue）会算出 Dsum=0 → **直接 remove() 整行**，
   *      把该学生在这个知识点上的全部账删掉；现改为只扣本题这一笔。
   *   ③ 与 updateMastery 同口径：P=1 才算「用对」（旧的 p>=0.5 已废，决策 026）。
   *   另：sValue/dValue 是旧口径遗留 → **只在原行本来就有时**一起搬走，绝不新造；
   *       新名字匹配不到节点（已进待建队列）→ **不扣旧账**（宁缺勿假，决策 041/053）。
   */
  async function migrateProgress(openid, oldName, newName, D, P) {
    if (!oldName || !newName || oldName === newName) return;
    const oldId = await matchKnowledgeNode(oldName);
    const newId = await matchKnowledgeNode(newName);
    if (!oldId || !newId || oldId === newId) {
      if (oldId && !newId) console.warn('[knowledgeMatch] 迁移目标不在图谱（已进待建队列）→ 本次不搬账: ' + newName);
      return;
    }
    const d = Number(D) || 0;
    const p = Number(P) || 0;
    const hit = p >= 1 ? 1 : 0;                      // 与 updateMastery 一致（决策 026/052）
    const r4 = (x) => Math.round(x * 10000) / 10000;
    const now = db.serverDate ? db.serverDate() : new Date();

    // 旧节点：扣掉这道题这一笔
    let legacyFromOld = false;                      // 旧节点行是否带旧口径字段（决定这一笔要不要继续维护 sValue/dValue）
    const oldRes = await db.collection('knowledge_progress').where({ userId: openid, knowledgeNodeId: oldId }).limit(1).get();
    if (oldRes.data.length) {
      const doc = oldRes.data[0];
      legacyFromOld = doc.dValue != null;
      const attempts = Math.max(0, (Number(doc.attempts) || 0) - 1);
      const correctCount = Math.max(0, (Number(doc.correctCount) || 0) - hit);
      const hasLegacy = legacyFromOld;                // 旧口径字段只在历史行里存在
      const S = Math.max(0, (Number(doc.sValue) || 0) - d * p);
      const Dsum = Math.max(0, (Number(doc.dValue) || 0) - d);
      if (attempts === 0 && Dsum <= 0.0001) {
        await db.collection('knowledge_progress').doc(doc._id).remove();
      } else {
        const patch = {
          attempts, correctCount,
          mastery: attempts > 0 ? Math.round((correctCount / attempts) * 100) / 100 : null,
          evidence: attempts <= 1 ? 'insufficient' : 'ok',
          algorithm: 'hit_rate_v1',
          lastUpdated: now,
        };
        if (hasLegacy) { patch.sValue = r4(S); patch.dValue = r4(Dsum); }
        await db.collection('knowledge_progress').doc(doc._id).update({ data: patch });
      }
    }

    // 新节点：记上这道题这一笔
    const newRes = await db.collection('knowledge_progress').where({ userId: openid, knowledgeNodeId: newId }).limit(1).get();
    const doc = newRes.data[0] || {};
    const attempts = (Number(doc.attempts) || 0) + 1;
    const correctCount = (Number(doc.correctCount) || 0) + hit;
    const patch = {
      attempts, correctCount,
      mastery: Math.round((correctCount / attempts) * 100) / 100,
      evidence: attempts <= 1 ? 'insufficient' : 'ok',
      algorithm: 'hit_rate_v1',
      lastUpdated: now,
    };
    // 旧口径字段守恒：只要「这道题原来记在旧行上」，就把这笔搬到新节点（否则旧字段会丢一笔）；
    // 两边都没有旧字段（纯粹新口径数据）→ 绝不新造
    if (legacyFromOld || doc.dValue != null) {
      patch.sValue = r4((Number(doc.sValue) || 0) + d * p);
      patch.dValue = r4((Number(doc.dValue) || 0) + d);
    }
    if (newRes.data.length) {
      await db.collection('knowledge_progress').doc(doc._id).update({ data: patch });
    } else {
      await db.collection('knowledge_progress').add({ data: Object.assign({ userId: openid, knowledgeNodeId: newId }, patch) });
    }
  }

  /**
   * 构造「知识点名 → 节点 id」的解析器，**限定在 Jev 确认的考点集合内**。
   *
   * 为什么需要这一步（实测 data）：
   *   DeepSeek 输出的 knowledgeUsage[].name 与 Jev 确认的考点集合对照（10 题 39 个名字）：
   *     精确匹配 56% ｜ Jev 集合内近似 15% ｜ Jev 集合里没有 28%
   *   而 **DeepSeek 的每点 P 是 K 的唯一来源**（决策 052：K 看「过程里这条知识点被用对还是用错」），
   *   Jev 只看题面、拿不到学生的过程，**取代不了 DeepSeek 的 P**。
   *   所以 Jev 的职责是**定身份（是哪个节点）**，不是**定名单**。
   *
   * 解析顺序（从严到宽，每一步都不会拽到父节点/方法类）：
   *   ① name 精确等于 Jev 确认的某个考点 → 用它的节点
   *   ② name 精确等于图谱里某个节点名 → 用它（精确，无歧义）
   *   ③ 在 **Jev 集合内**取字符相似度最高的（sim ≥ 0.5）
   *      —— 这是唯一的模糊步骤，但**搜索范围被限定在 Jev 确认的合法叶子内**，
   *         所以结构上不可能塌到「集合」这种父节点（那正是旧实现 39% 错账的成因）
   *   ④ 都失败 → 返回 null（调用方写入 node_requests 待建队列，宁缺勿假）
   */
  /**
   * 知识点名 → 节点 id 的解析器（**只做精确匹配，无字符相似度**）。
   *
   * 决策 063（2026-10-06 用户定「先 J 再 L」）后的职责：
   *   Jev（N1.5）先跑，把考点缩小到几个并写进 `jevPoints`；
   *   N2 的 LLM 拿到的就是这几个（不是全量 159），所以它写出来的名字
   *   **本来就应该精确等于清单里的某个名字** —— 不需要相似度去猜。
   *
   * ⚠️ 2026-10-06 修订：**删掉了原第③步「Jev 集合内相似度兜底」**。
   *   用户明确「不是去掉字符匹配了吗」—— 那一步是我自己加回去的，
   *   它存在的唯一理由是「LLM 自由写名字」，而先 J 再 L 之后这个前提没了。
   *
   * 仍然保留的两条约束（都是合法性检查，不是相似度）：
   *   ① 必须精确命中图谱里的**合法记账节点**（pickLeafNodes：排除父节点 + 方法类）
   *      —— 否则 LLM 若原样写出「集合」这种父节点名，会绕过决策 052
   *   ② 解析不到 → 进 node_requests 待建队列（宁缺勿假，决策 053）
   */
  function makeNameResolver() {
    return async function resolveName(name, userId) {
      const nm = String(name || '').trim();
      if (!nm) return null;
      const nodes = await loadNodes();
      const legal = pickLeafNodes(nodes);
      const hit = legal.find((n) => String(n.name || '').trim() === nm);
      if (hit) return hit.knowledgeId || hit._id;
      await enqueueNodeRequest(nm, userId, { source: 'unresolved' });
      return null;
    };
  }

  /**
   * 【决策 063 · noul 形式】题目文本 → 命中的知识点节点 + 记账单元。
   *
   * 为什么不再用字符相似度：
   *   · 字符匹配的唯一效果是把自由文本拽到一个**可能不对**的节点上
   *     （「集合的并集」→ 父节点「集合」）。实测真实 55 题：
   *     字符命中 51 题里有 20 题落在明令禁止记账的节点（父节点 11 + 方法类 9）。
   *   · 而 noul 返回的是**清单内选项的概率**，命中的必然是合法候选，
   *     不存在「名字 → 节点」这一步，也就不存在错配。
   *
   * ⚠️ 2026-10-06 修订：**取消对字符匹配的回退**。
   *   旧实现把「Jev 说没有匹配」也回退给字符匹配 → 等于把 Jev 的判断丢掉，
   *   又绕回错配那条路。现在只有「Jev 不可用/报错」才返回空。
   *   宁可空（进 node_requests 待建队列），也不硬塞错节点（决策 053 宁缺勿假）。
   *
   * @returns {Promise<{nodeIds:string[], units:string[], points:string[],
   *                    chapterProbs:Object, pointProbs:Object,
   *                    ok:boolean, reason?:string}>}
   */
  async function matchByJevNodes(jevClient, questionText) {
    const empty = (reason) => ({ nodeIds: [], units: [], points: [], chapterProbs: {}, pointProbs: {}, ok: false, reason });
    if (!jevClient || typeof jevClient.ask !== 'function') return empty('未提供 jevClient');
    if (!questionText) return empty('无题目文本');
    try {
      const nodes = await loadNodes();
      const groups = groupByChapter(nodes);
      const r = await matchByJev(jevClient, questionText, groups);
      if (!r.points.length) return Object.assign(empty(r.reason || '未命中'), { chapterProbs: r.chapterProbs, pointProbs: r.pointProbs, units: r.units });
      // 名字 → 节点 id（精确查表：noul 命中的必然是清单里的规范名）
      const byName = {};
      nodes.forEach((n) => { const nm = String(n.name || '').trim(); if (nm && !byName[nm]) byName[nm] = n; });
      const nodeIds = r.points.map((nm) => { const n = byName[nm]; return n ? (n.knowledgeId || n._id) : null; }).filter(Boolean);
      return {
        nodeIds, units: r.units, points: r.points,
        chapterProbs: r.chapterProbs, pointProbs: r.pointProbs,
        ok: nodeIds.length > 0,
        reason: nodeIds.length ? undefined : '命中的名字在图谱里查不到 id',
      };
    } catch (e) {
      console.warn('[knowledgeMatch] Jev 匹配失败:', e.message);
      // 决策 063：区分「服务不可用」与「其他失败」——
      //   服务不可用 → 调用方（N1.5）报 503 并把批次挂起，**不降级**
      return Object.assign(empty('Jev 调用失败: ' + e.message), {
        serviceError: isServiceUnavailable(e),
        errorStatus: Number(e && e.status) || null,
      });
    }
  }

  return { loadNodes, buildNodeNames, simName, findNode, matchKnowledgeNode, matchByJevNodes, makeNameResolver, unitNameOf, migrateProgress, aggregateUp };
}
module.exports = { createKnowledgeTools, pickLeafNodes, buildNodeListText };
