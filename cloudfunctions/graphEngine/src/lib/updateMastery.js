// D4 原子工具：掌握度更新（K = 叶子用对率 + 父节点聚合并 + A 单元级）
// 决策 052–055（2026-09-25）：
//   · K：叶子「用对率」= correctCount / attempts（**复用现有字段，零新增**）；难度不进 K
//   · 父节点：**只能**由子节点聚合（aggregateUp 注入；宪法 §4.5）
//   · 分流：concept → K；rule → A；**skill（算错/抄错）→ S，不进 A**（宪法 §8.1）
// 决策 063（2026-10-06）：A/U 换成 λ 轴 + 五情况，实现搬到 lib/au063.js（纯函数、可单测）。
//   · 旧 055 算子（s = P×(0.6+0.4D)×q、ΔA = 0.25(s−A)(U−A)）**已停用**
//   · q（段数系数）随 segments 一并停用（决策 060 §八：无手续判据）
//   · 兼容：unit_progress 旧行只有 aValue/aUpper 时，由 au063.fromProgressRow 冷启动还原
// 契约：updateMastery({ db, matchKnowledgeNode, findNode, unitNameOf, aggregateUp, derived, openid, questionId, question, raw, clamped })
// 失败不抛（降级不阻塞主流程）。
'use strict';
// 决策 063：A/U 的 λ 轴算法（纯函数）
const { updateAU, toProgressPatch, fromProgressRow, levelNameOfLambda } = require('./au063');

async function updateMastery(deps) {
  const { db, matchKnowledgeNode, resolveNode, units, findNode, unitNameOf, aggregateUp, derived, openid, questionId, raw, clamped } = deps || {};
  // 节点解析：优先用 Jev 限定解析器（决策 063），没有则退回原 matchKnowledgeNode
  const resolve = typeof resolveNode === 'function' ? resolveNode : matchKnowledgeNode;
  let pOk = false;
  try {
    pOk = Number(clamped && clamped.P) >= 1;      // P 编码对错：P==1 才算对
    const isOut = raw && raw.isOutOfSyllabus === true;
    const usage = Array.isArray(raw && raw.knowledgeUsage) ? raw.knowledgeUsage : [];
    const lvl = raw && raw.errorLevel;            // skill / rule / concept / null
    const now = () => (db.serverDate ? db.serverDate() : new Date());

    const upsertProgress = async (nodeId, patch) => {
      const pRes = await db.collection('knowledge_progress')
        .where({ userId: openid, knowledgeNodeId: nodeId }).limit(1).get();
      if (pRes.data.length) await db.collection('knowledge_progress').doc(pRes.data[0]._id).update({ data: patch });
      else await db.collection('knowledge_progress').add({ data: Object.assign({ userId: openid, knowledgeNodeId: nodeId }, patch) });
    };
    const logMastery = async (nodeId, oldMastery, newMastery, algorithm) => {
      try {
        await db.collection('mastery_logs').add({ data: { userId: openid, knowledgeNodeId: nodeId, triggerQuestionId: questionId, oldMastery: oldMastery != null ? oldMastery : null, newMastery, algorithm, createdAt: now() } });
      } catch (e) { console.warn('[updateMastery] mastery_logs 写入失败:', e.message); }
    };
    // A 的变更日志（2026-10-07 新增，与 K 的 mastery_logs 对称）。
    // 为什么需要：A 只覆盖 unit_progress 的当前值，**没有历史** →
    //   报告页要显示「这次做题 A 变了多少」时算不出 before。
    // 为什么单独一个集合：mastery_logs 已经装了两种行形状（RAG 记录 / K 变更），
    //   再加第三种会让「按字段有无区分行类型」更脆（见全链路审计 §4.2）。
    // 为什么把档位名一起存：levelNameOfLambda 在 graphEngine 里，
    //   reportService 跨云函数拿不到 → 写入时算好，避免两处口径漂移。
    const logUnit = async (unitName, before, after, zone) => {
      try {
        await db.collection('unit_logs').add({
          data: {
            userId: openid, unitName, triggerQuestionId: questionId,
            oldLambdaA: before.lambdaA, newLambdaA: after.lambdaA,
            oldALevel: levelNameOfLambda(before.lambdaA), newALevel: levelNameOfLambda(after.lambdaA),
            oldLambdaU: before.lambdaU, newLambdaU: after.lambdaU,
            oldULevel: levelNameOfLambda(before.lambdaU), newULevel: levelNameOfLambda(after.lambdaU),
            zone: zone || null, algorithm: 'au063', createdAt: now(),
          },
        });
      } catch (e) { console.warn('[updateMastery] unit_logs 写入失败:', e.message); }
    };

    // ---------- K（决策 052：叶子用对率）----------
    // ⚠️ 2026-10-06 修「图谱缺口被系统性漏掉」（见 doc/architecture/知识点匹配方案-Jev决策模型.md §6.1）：
    //    原实现在 matchKnowledgeNode **之前**就用 countsForK 过滤，导致只做对了才走匹配
    //    → rule/skill 类错误涉及的新知识点永远进不了 node_requests 待建队列。
    //    改为：**每条 usage 都先匹配**（匹配不上 → 进待建队列），**再**决定要不要记 K 分。
    const touchedLeaves = [];
    if (!(isOut && !pOk)) {
      for (const u of usage) {
        const uName = String((u && u.name) || '').trim();
        if (!uName) continue;
        const rawP = Number(u && u.P);
        const Pkp = rawP >= 1 ? 1 : (rawP > 0 ? 0.5 : 0);
        // 先解析节点：匹配不上会自动写入 node_requests（宁缺勿假，决策 053）
        // 决策 063：resolve 由 Jev 限定解析器提供时，模糊搜索只发生在 Jev 确认的考点集合内，
        //           结构上不会塌到父节点/方法类（旧实现 39% 错账的成因）
        const nodeId = await resolve(uName, openid);
        // 分母 = 被考察到（用对 或 概念性错）；分子 = 用对
        // rule（步骤/方法错）与 skill（算错/抄错）都**不进 K**（分别归 A 与 S）
        const countsForK = (Pkp === 1) || (lvl === 'concept');
        if (!countsForK) continue;                 // 不记 K 分，但缺口已在上面登记
        if (!nodeId) continue;                     // 匹配不上 → 已进待建队列，不记账
        const pRes = await db.collection('knowledge_progress')
          .where({ userId: openid, knowledgeNodeId: nodeId }).limit(1).get();
        const old = pRes.data[0] || {};
        const attempts = (old.attempts || 0) + 1;
        const correctCount = (old.correctCount || 0) + (Pkp === 1 ? 1 : 0);
        const mastery = Math.round((correctCount / attempts) * 100) / 100;
        await upsertProgress(nodeId, {
          attempts, correctCount, mastery,
          evidence: attempts <= 1 ? 'insufficient' : 'ok',   // 证据不足档（样本 ≤1 不给结论）
          algorithm: 'hit_rate_v1', lastUpdated: now(),
        });
        await logMastery(nodeId, old.mastery, mastery, 'hit_rate_v1');
        touchedLeaves.push(nodeId);
      }
    }

    // ---------- 父节点聚合（宪法 §4.5：父节点的 K 只能由子节点聚合）----------
    if (typeof aggregateUp === 'function') {
      for (const leafId of Array.from(new Set(touchedLeaves))) {
        try { await aggregateUp(leafId, openid); } catch (e) { console.warn('[updateMastery] 父节点聚合失败:', e.message); }
      }
    }

    // ---------- A / U（决策 063：λ 轴 + 五情况）----------
    // 与 055 的差异：① 内部状态是 λ（档位坐标）而非归一值 ② U 可下调（②区累计）
    //   ③ ⑤区「A 微涨、U 不动」④ U 抬升要过 P_c 门槛
    if (lvl !== 'skill') {
      // 决策 063（先 J 再 L）：A 的记账单元直接用 Jev 判定的 units。
      //   旧实现是「从 usage 名字反推单元」（findNode → unitNameOf），
      //   那条路要重新解析名字、且会漏掉「Jev 命中但该章没有命中知识点」的单元。
      //   没有 Jev 结果时才退回旧路径。
      const unitNames = [];
      if (Array.isArray(units) && units.length) {
        units.forEach((un) => { const s = String(un || '').trim(); if (s && !unitNames.includes(s)) unitNames.push(s); });
      } else {
        for (const u of usage) {                   // 兜底（无 Jev 时）：按条目定单元
          const nm = String((u && u.name) || '').trim();
          if (!nm) continue;
          const node = await findNode(nm);
          const un = unitNameOf(node);
          if (un && !unitNames.includes(un)) unitNames.push(un);
        }
      }
      const D = Math.min(1, Math.max(0, Number(clamped && clamped.D) || 0));
      const Pp = Math.min(1, Math.max(0, Number(clamped && clamped.P) || 0));
      for (const unitName of unitNames) {
        const uRes = await db.collection('unit_progress')
          .where({ userId: openid, unitName }).limit(1).get();
        const old = uRes.data[0] || {};
        const st = fromProgressRow(old);
        const r = updateAU({ D, P: Pp }, st);
        const patch = toProgressPatch(
          { lambdaA: r.lambdaA, lambdaU: r.lambdaU, lowStreak: r.lowStreak },
          {
            n: (old.n || 0) + 1,
            lastD: Math.round(D * 1000) / 1000,
            lastP: Math.round(Pp * 1000) / 1000,
            lastE: Math.round(r.E * 1000) / 1000,
            lastZone: r.zone,
            lastUpdated: now(),
          },
        );
        if (uRes.data.length) await db.collection('unit_progress').doc(uRes.data[0]._id).update({ data: patch });
        else await db.collection('unit_progress').add({ data: Object.assign({ userId: openid, unitName }, patch) });
        // 记 A 的 before → after（日志写入失败不回滚：账已更新，记录降级，与 K 的 mastery_logs 同策略）
        await logUnit(unitName, { lambdaA: st.lambdaA, lambdaU: st.lambdaU }, { lambdaA: r.lambdaA, lambdaU: r.lambdaU }, r.zone);
      }
    }

    return { pOk };
  } catch (e) {
    console.error('[updateMastery] 掌握度更新失败:', e);
    return { pOk };
  }
}

module.exports = { updateMastery };
