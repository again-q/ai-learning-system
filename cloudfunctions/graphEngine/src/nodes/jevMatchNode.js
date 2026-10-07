'use strict';
// N1.5 · Jev 知识点分类（决策 063，2026-10-06 用户定：**先 J 再 L**）
//
// 职责边界（用户原话）：
//   「决策模型本来就只做知识点匹配，参数什么的是 LLM 给的」
//   「P 不是过程跟学生有关的关系吗？JEV 只是做知识点分类」
//
// 所以本节点只做一件事：**题目文本 → 这题考哪些知识点**（分类）。
//   · 不判对错、不看学生过程、不产出 D/P —— 那些是 N2 的 LLM 干的
//   · 输出 `jevPoints`（考点名，全是图谱合法叶子）与 `jevUnits`（记账单元）
//
// 放在 N2 **之前**的理由：
//   ① N2 的 LLM 拿到 Jev 缩小后的清单（几个点），不再从 159 个里挑
//   ② N5 直接用 jevPoints / jevUnits，**不需要「名字 → 节点」的解析**
//
// ============ 服务不可用时的行为（2026-10-06 用户定） ============
//   「JEV不可用的时候直接说目前服务不可用，先把这一批题目离线缓存了，等可以用的时候再做。」
//
//   → **不降级**（不退回字符匹配）：抛 503 让整题判定中止，图不会继续跑 N2~N5，
//     也就不会写出一份「知识点缺失」的半成品账。
//   → 同时把批次标记为 `awaiting_service`（离线缓存），供服务恢复后重跑。
//   → 「服务不可用」的判据见 jevMatch.isServiceUnavailable（网络失败 / 5xx / 429 / 401 / 403）。
//      其他错误（如 400 参数错）**不算**服务不可用 —— 那是我们的 bug，要暴露。
const { recordEngineResult } = require('../lib/engineStatus');

function createJevMatchNode({ kg, jev, db, logger } = {}) {
  const log = (logger && logger.warn) ? logger.warn.bind(logger) : console.warn;
  const k = kg || {};

  /**
   * 标记批次「等待诊断引擎恢复」，供之后重跑。
   *
   * ⚠️ 为什么 status 要设回 `pending`、而不是自造一个 `awaiting_service`：
   *   `diagnose/index.js:258` 的幂等门是 `if (status !== 'pending') return fail('批次已诊断，请勿重复提交')`，
   *   而 diagnose 在调判定**之前**就把 status 改成了 'analyzing'。
   *   所以若把 status 设成任何新值（含 awaiting_service），**这批题就永远重跑不了了** ——
   *   与「等可以用的时候再做」正好相反。
   *   → 保持 `pending`（仍然「待诊断」＝本来就是要重跑的状态），
   *     另用 `serviceHold` 字段记录「为什么停在这里」，供前端展示与后续自动重试识别。
   *   （diagnose 重跑时会清理旧 questions/mastery_logs 再全量重做，所以不需要保进度）
   */
  async function markBatchAwaitingService(batchId, reason) {
    if (!batchId || !db) return false;
    try {
      await db.collection('batches').doc(batchId).update({
        data: {
          status: 'pending',                       // ← 必须保持 pending，否则重跑被幂等门挡住
          serviceHold: {
            engine: 'jev',
            reason: String(reason || '').slice(0, 300),
            since: (db.serverDate ? db.serverDate() : new Date()),
          },
        },
      });
      return true;
    } catch (e) {
      log('[N1.5] 批次挂起标记失败（不阻塞 503 返回）: ' + e.message);
      return false;
    }
  }

  return async function jevMatchNode(state) {
    const questionText = (state.question && state.question.questionText) || '';
    const empty = { jevPoints: null, jevUnits: null, jevInfo: { ok: false, reason: '未启用' } };
    if (!jev || typeof k.matchByJevNodes !== 'function') return empty;

    if (!questionText) {
      return { jevPoints: null, jevUnits: null, jevInfo: { ok: false, reason: '无题目文本' } };
    }

    const r = await k.matchByJevNodes(jev, questionText);

    // ---- 服务不可用：不降级，报 503 + 批次挂起 ----
    if (r.serviceError) {
      const batchId = (state.question || {}).batchId;
      // 顺带把引擎健康状态记下来（零额外请求）——供「诊断引擎服务状态」查询与后续自动重试
      await recordEngineResult(db, 'jev', {
        ok: false, error: r.reason, status: r.errorStatus, serviceUnavailable: true,
      });
      await markBatchAwaitingService(batchId, r.reason);
      const err = new Error('诊断引擎暂不可用（知识点分类服务不可用）。本批题目已缓存，服务恢复后可重新判定。');
      err.code = 503;
      err.serviceUnavailable = true;
      err.engine = 'jev';
      err.detail = r.reason;
      throw err;
    }

    // ---- 其他失败（非服务问题）：也不降级，但按「无命中」处理（进待建队列） ----
    return {
      jevPoints: r.ok ? r.points : null,
      jevUnits: r.ok ? r.units : null,
      jevInfo: { ok: r.ok, points: r.points, units: r.units, reason: r.reason, pool: r.poolChapters },
    };
  };
}

module.exports = { createJevMatchNode };
