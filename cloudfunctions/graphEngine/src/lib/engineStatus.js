// ============ 诊断引擎服务状态（2026-10-06 用户定） ============
//
// 需求原话：
//   「JEV不可用的时候直接说目前服务不可用，先把这一批题目离线缓存了，等可以用的时候再做。
//     那到时候我们可以给程序里面加一个诊断引擎的服务状态」
//
// 本模块提供三件事：
//   ① 探测：主动问一次 Jev（极小请求），判断服务是否可用
//   ② 记录：把结果写进 engine_status（每个引擎一条）；
//      **只在状态变化时写**，避免每题都写库
//   ③ 读取：给前端/运维一个「现在引擎能不能用」的答案，以及一批等待重跑的批次
//
// 与 N1.5 的分工：
//   N1.5 在**真实判定失败**时调用 recordEngineResult(ok:false)（顺带记录，零额外请求）；
//   本模块的 probe 由**主动查询**（action）或**定时任务**触发，用于发现"已经恢复了"。
'use strict';

const { isServiceUnavailable } = require('./jevMatch');

const COLLECTION = 'engine_status';

/** 探测用的极小请求（一个 noul，成本可忽略） */
const PROBE_INSTRUCTION = '这是一个服务健康探测请求，请回答「是」。';

/**
 * 主动探测 Jev 是否可用。
 * @returns {Promise<{ok:boolean, latencyMs:number, error?:string, status?:number|null, serviceUnavailable?:boolean}>}
 */
async function probeJev(jev, opts) {
  const o = opts || {};
  if (!jev || typeof jev.ask !== 'function') {
    return { ok: false, latencyMs: 0, error: '未配置 Jev client', serviceUnavailable: true };
  }
  const t0 = Date.now();
  try {
    await jev.ask(o.state || '1+1=2', { p: { type: 'noul', instructions: o.instruction || PROBE_INSTRUCTION } });
    return { ok: true, latencyMs: Date.now() - t0 };
  } catch (e) {
    return {
      ok: false,
      latencyMs: Date.now() - t0,
      error: String((e && e.message) || e).slice(0, 300),
      status: Number(e && e.status) || null,
      serviceUnavailable: isServiceUnavailable(e),
    };
  }
}

/** 读某引擎的当前状态；没有记录返回 null */
async function readEngineStatus(db, engine) {
  if (!db) return null;
  try {
    const res = await db.collection(COLLECTION).where({ engine }).limit(1).get();
    return (res.data && res.data[0]) || null;
  } catch (e) {
    console.warn('[engineStatus] 读取失败:', e.message);
    return null;
  }
}

/**
 * 记录一次探测/判定结果（upsert）。
 * @param {object} r {ok, latencyMs?, error?, status?, serviceUnavailable?}
 * @returns {Promise<object|null>} 写入后的状态
 */
async function recordEngineResult(db, engine, r) {
  if (!db) return null;
  const now = db.serverDate ? db.serverDate() : new Date();
  const prev = await readEngineStatus(db, engine);
  const wasOk = prev ? prev.ok === true : null;
  const failCount = r.ok ? 0 : ((prev && Number(prev.consecutiveFailures)) || 0) + 1;
  const patch = {
    engine,
    ok: r.ok === true,
    checkedAt: now,
    consecutiveFailures: failCount,
    latencyMs: Number.isFinite(Number(r.latencyMs)) ? Number(r.latencyMs) : null,
  };
  if (r.ok) {
    patch.lastOkAt = now;
    patch.lastError = null;
    patch.lastErrorStatus = null;
  } else {
    patch.lastError = String(r.error || '').slice(0, 300);
    patch.lastErrorStatus = Number.isFinite(Number(r.status)) ? Number(r.status) : null;
    patch.serviceUnavailable = r.serviceUnavailable !== false;
  }
  // since：状态**发生变化**时才刷新（用于回答「这个状态持续多久了」）
  if (wasOk === null || wasOk !== (r.ok === true)) patch.since = now;
  else if (prev && prev.since) patch.since = prev.since;

  try {
    if (prev && prev._id) await db.collection(COLLECTION).doc(prev._id).update({ data: patch });
    else await db.collection(COLLECTION).add({ data: patch });
  } catch (e) {
    console.warn('[engineStatus] 写入失败:', e.message);
  }
  return Object.assign({}, prev, patch);
}

/**
 * 列出「因为引擎不可用而挂起」的批次（等恢复后重跑）。
 * 判据：有 serviceHold 字段且仍是 pending（pending 才允许 diagnose 重跑）
 */
async function listHeldBatches(db, limit) {
  if (!db) return [];
  try {
    const res = await db.collection('batches')
      .where({ status: 'pending', 'serviceHold.engine': 'jev' })
      .limit(Number(limit) || 50).get();
    return res.data || [];
  } catch (e) {
    // 复合条件查询不被支持时退化为「全查 + 内存过滤」，保证可用
    try {
      const all = await db.collection('batches').where({ status: 'pending' }).limit(Number(limit) || 50).get();
      return (all.data || []).filter((b) => b && b.serviceHold && b.serviceHold.engine);
    } catch (e2) {
      console.warn('[engineStatus] 挂起批次查询失败:', e2.message);
      return [];
    }
  }
}

/** 组装给前端/运维看的状态摘要 */
function summarize(status, engine) {
  if (!status) {
    return { engine, known: false, ok: null, text: '未知（尚无探测记录）' };
  }
  const ok = status.ok === true;
  return {
    engine,
    known: true,
    ok,
    since: status.since || null,
    checkedAt: status.checkedAt || null,
    latencyMs: status.latencyMs != null ? status.latencyMs : null,
    consecutiveFailures: status.consecutiveFailures || 0,
    lastOkAt: status.lastOkAt || null,
    lastError: status.lastError || null,
    lastErrorStatus: status.lastErrorStatus != null ? status.lastErrorStatus : null,
    text: ok
      ? '诊断引擎正常'
      : ('诊断引擎暂不可用' + (status.lastError ? '（' + String(status.lastError).slice(0, 80) + '）' : '')),
  };
}

module.exports = {
  COLLECTION, PROBE_INSTRUCTION,
  probeJev, readEngineStatus, recordEngineResult, listHeldBatches, summarize,
};
