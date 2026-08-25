// 拍照上传 / 诊断 / 报告链路日志（排查速度用）
// 用法：
//   const log = require('../../utils/upload-log');
//   log.beginSession('photo_submit');
//   log.append('步骤名', { 关键数据 });
//   await log.timed('diagnose', { batchId }, () => wx.cloud.callFunction(...));
//
// 每条含：t（ISO 时间戳）、ts（epoch ms）、deltaMs（距上一条）、elapsedMs（距会话起点）
const KEY = 'upload_logs';
const MAX = 200;

let _sessionName = '';
let _sessionStart = 0;
let _lastTs = 0;

function append(step, data) {
  const now = Date.now();
  if (!_sessionStart) {
    _sessionStart = now;
    _lastTs = now;
  }
  const entry = {
    t: new Date(now).toISOString(),
    ts: now,
    deltaMs: Math.max(0, now - _lastTs),
    elapsedMs: Math.max(0, now - _sessionStart),
    session: _sessionName || null,
    step,
    data: data || null,
  };
  _lastTs = now;

  let logs = [];
  try {
    logs = wx.getStorageSync(KEY) || [];
  } catch (e) { logs = []; }
  logs.push(entry);
  while (logs.length > MAX) logs.shift();
  try { wx.setStorageSync(KEY, logs); } catch (e) {}

  const timing = `+${entry.deltaMs}ms / Σ${entry.elapsedMs}ms`;
  console.log('[upload-log]', entry.t, timing, step, JSON.stringify(data || {}));
  return entry;
}

/** 开启一段耗时会话（拍照提交 / 逐题判定 / 报告生成），重置 elapsed */
function beginSession(name) {
  const now = Date.now();
  _sessionName = name || '';
  _sessionStart = now;
  _lastTs = now;
  return append('session_begin', { name: _sessionName });
}

/** 包一层异步调用：自动记下 durationMs（本步墙钟耗时） */
async function timed(step, data, fn) {
  const t0 = Date.now();
  append(step + '_start', data || null);
  try {
    const result = await fn();
    append(step + '_ok', Object.assign({}, data || {}, { durationMs: Date.now() - t0 }));
    return result;
  } catch (e) {
    append(step + '_fail', Object.assign({}, data || {}, {
      durationMs: Date.now() - t0,
      error: (e && e.message) || String(e),
    }));
    throw e;
  }
}

function getAll() {
  try { return wx.getStorageSync(KEY) || []; } catch (e) { return []; }
}

function clear() {
  try { wx.removeStorageSync(KEY); } catch (e) {}
  _sessionName = '';
  _sessionStart = 0;
  _lastTs = 0;
}

module.exports = { append, beginSession, timed, getAll, clear };
