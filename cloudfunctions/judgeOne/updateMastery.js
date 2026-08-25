// ============ 掌握度更新（抽独立函数：K 知识点粒度 + A 单元级 + mastery_logs） ============
// 决策 026（2026-08-17）：K 知识点粒度（knowledgeUsage 剥离版为主 + 整题 fallback）；
// A 单元级（宪法 §5.3/§5.5：unit_progress）。
// 返回 { mainNodeId, pOk } 供调用方 RAG 记录使用；失败不抛（降级不阻塞主流程）。
async function updateMastery({ db, matchKnowledgeNode, findNode, unitNameOf, openid, questionId, question, raw, clamped }) {
  const USE_KNOWLEDGE_USAGE = true;   // 决策 026：K 知识点粒度启用，剥离版为主路径，整题版降为 fallback
  let mainNodeId = null;
  let pOk = false;
  try {
    pOk = clamped.P >= 0.5;   // P 编码对错：P≥0.5 视为基本答对（isCorrect 已删除 2026-08-14）
    const isOut = raw.isOutOfSyllabus === true;
    const eta = clamped.eta;   // 仅解答题 0.4~1.0，选择/填空 null

    // 主知识点定位（matchKnowledgeNode：精确 → 子串最长 → custom_nodes 兜底）
    mainNodeId = await matchKnowledgeNode((raw.knowledgeNodeName || '').trim(), openid);
    const upsertProgress = async (nodeId, patch) => {
      const pRes = await db.collection('knowledge_progress')
        .where({ userId: openid, knowledgeNodeId: nodeId }).limit(1).get();
      if (pRes.data.length) {
        await db.collection('knowledge_progress').doc(pRes.data[0]._id).update({ data: patch });
      } else {
        await db.collection('knowledge_progress').add({ data: { userId: openid, knowledgeNodeId: nodeId, ...patch } });
      }
    };

    // ---- K 维度（§4.4 加权得分法：S_k = Σ(D_kp×P_kp)，D_k = ΣD_kp，mastery = S_k/D_k）----
    // 整题版：仅当 USE_KNOWLEDGE_USAGE=false 时作为 fallback
    if (!USE_KNOWLEDGE_USAGE && mainNodeId && !(isOut && !pOk)) {
      const D = Number(clamped.D) || 0;
      const P = Number(clamped.P) || 0;
      const pRes = await db.collection('knowledge_progress')
        .where({ userId: openid, knowledgeNodeId: mainNodeId }).limit(1).get();
      const old = pRes.data[0] || {};
      const S = (old.sValue || 0) + D * P;
      const Dsum = (old.dValue || 0) + D;
      const newMastery = Dsum > 0 ? Math.round((S / Dsum) * 100) / 100 : 0;
      await upsertProgress(mainNodeId, {
        sValue: Math.round(S * 10000) / 10000,
        dValue: Math.round(Dsum * 10000) / 10000,
        mastery: newMastery,
        attempts: (old.attempts || 0) + 1,
        correctCount: (old.correctCount || 0) + (pOk ? 1 : 0),
        lastUpdated: db.serverDate(),
      });
      // mastery_logs 追加写：每次 K 更新记一笔，支持趋势/重算
      try {
        await db.collection('mastery_logs').add({
          data: {
            userId: openid,
            knowledgeNodeId: mainNodeId,
            triggerQuestionId: questionId,
            oldMastery: old.mastery != null ? old.mastery : null,
            newMastery,
            algorithm: 'weighted_score_v1',
            createdAt: db.serverDate(),
          },
        });
      } catch (e) {
        console.warn('[updateMastery] mastery_logs 写入失败:', e.message);
      }
    }

    // ---- K 剥离版（决策 026 主路径：知识点粒度 D_kp×P_kp）----
    if (USE_KNOWLEDGE_USAGE && !(isOut && !pOk)) {
      const usage = Array.isArray(raw.knowledgeUsage) ? raw.knowledgeUsage : [];
      for (const u of usage) {
        const uName = (u.name || '').trim();
        if (!uName) continue;
        const nodeId = await matchKnowledgeNode(uName, openid);
        if (!nodeId) continue;
        const Dkp = Math.min(1, Math.max(0, Number(u.D) || 0));
        // P_kp 三档（决策 026）：1 用对 / 0.5 漏边界不完整 / 0 缺失全错
        const rawPkp = Number(u.P);
        const Pkp = rawPkp >= 1 ? 1 : rawPkp > 0 ? 0.5 : 0;
        const pRes = await db.collection('knowledge_progress')
          .where({ userId: openid, knowledgeNodeId: nodeId }).limit(1).get();
        const old = pRes.data[0] || {};
        const S = (old.sValue || 0) + Dkp * Pkp;
        const Dsum = (old.dValue || 0) + Dkp;
        const newMastery = Dsum > 0 ? Math.round((S / Dsum) * 100) / 100 : 0;
        await upsertProgress(nodeId, {
          sValue: Math.round(S * 10000) / 10000,
          dValue: Math.round(Dsum * 10000) / 10000,
          mastery: newMastery,
          attempts: (old.attempts || 0) + 1,
          correctCount: (old.correctCount || 0) + (Pkp === 1 ? 1 : 0),   // 完全用对才算 1 次，0.5 不计
          lastUpdated: db.serverDate(),
        });
        // mastery_logs K 变更记录（趋势/重算依赖）：每知识点一笔
        try {
          await db.collection('mastery_logs').add({
            data: {
              userId: openid,
              knowledgeNodeId: nodeId,
              triggerQuestionId: questionId,
              oldMastery: old.mastery != null ? old.mastery : null,
              newMastery,
              algorithm: 'weighted_score_v1',
              createdAt: db.serverDate(),
            },
          });
        } catch (e) {
          console.warn('[updateMastery] mastery_logs K 记录写入失败:', e.message);
        }
      }
    }

    // ---- A 维度（宪法 §5.3/§5.5：单元级 A/U/N，独立集合 unit_progress）----
    // E = D×η×(2P−1)（P 编码方向）；归因分流：错题归因 K/S → E=0
    if (eta != null && eta >= 0.4 && mainNodeId) {
      const mainNode = await findNode((raw.knowledgeNodeName || '').trim());
      const unitName = unitNameOf(mainNode);
      if (unitName) {
        const D = Number(clamped.D) || 0;
        let eff = D * eta * (2 * Number(clamped.P) - 1);
        if (USE_KNOWLEDGE_USAGE) {
          const dim = raw.errorDimension;
          const isKS = !pOk && (dim === 'K' || dim === 'S'
            || (!dim && /概念|定义|公式|记错|遗忘|知识/.test(raw.errorAttribution || '')));
          if (isKS) eff = 0;
        }
        const uRes = await db.collection('unit_progress')
          .where({ userId: openid, unitName }).limit(1).get();
        const old = uRes.data[0] || {};
        let A = old.aValue != null ? old.aValue : 0.3;
        let U = old.aUpper != null ? old.aUpper : 0.5;
        let streak = old.lowEtaStreak || 0;
        if (eff !== 0) {
          // U 上浮：本质解法（η≥0.7）+ 鉴别力足够（E≥0.5）
          if (eff >= 0.5 && eta >= 0.7) U += 0.05 * (1 - U);
          // U 下浮：连续 5 题低路径质量（暴力计算挤压虚假上限）
          if (eta <= 0.6) {
            streak += 1;
            if (streak >= 5) { U -= 0.03 * (U - A); streak = 0; }
          } else streak = 0;
          const dA = 0.25 * Math.abs(eff) * (U - A);
          A = eff > 0 ? Math.min(A + dA, U) : Math.max(A - dA, 0);
        }
        const patch = {
          aValue: Math.round(A * 100) / 100,
          aUpper: Math.round(U * 100) / 100,
          n: (old.n || 0) + 1,
          lowEtaStreak: streak,
          lastUpdated: db.serverDate(),
        };
        if (uRes.data.length) {
          await db.collection('unit_progress').doc(uRes.data[0]._id).update({ data: patch });
        } else {
          await db.collection('unit_progress').add({ data: { userId: openid, unitName, ...patch } });
        }
      }
    }

    return { mainNodeId, pOk };
  } catch (e) {
    console.error('[updateMastery] 掌握度更新失败:', e);
    return { mainNodeId, pOk };   // 降级：不阻塞主流程，RAG 记录照写
  }
}

module.exports = { updateMastery };
