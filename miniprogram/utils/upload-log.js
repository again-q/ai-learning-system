// 拍照上传链路日志（排查用）
// 用法：const log = require('../../utils/upload-log');
//      log.append('步骤名', {关键数据});
// 日志存本地 Storage（上限 200 条）+ 同步输出 console，开发者工具控制台可直接看
const KEY = 'upload_logs';
const MAX = 200;

function append(step, data) {
  const entry = { t: new Date().toISOString(), step, data: data || null };
  let logs = [];
  try {
    logs = wx.getStorageSync(KEY) || [];
  } catch (e) { logs = []; }
  logs.push(entry);
  while (logs.length > MAX) logs.shift();
  try { wx.setStorageSync(KEY, logs); } catch (e) {}
  console.log('[upload-log]', entry.t, step, JSON.stringify(data || {}));
  return entry;
}

function getAll() {
  try { return wx.getStorageSync(KEY) || []; } catch (e) { return []; }
}

function clear() {
  try { wx.removeStorageSync(KEY); } catch (e) {}
}

module.exports = { append, getAll, clear };
