// 运行日志：查看本机拍照/诊断/报告链路日志（排查用）
const log = require('../../../utils/upload-log');

Page({
  data: {
    logs: [],
    empty: false,
  },

  onShow() {
    this.load();
  },

  load() {
    const logs = log.getAll().slice().reverse();
    this.setData({
      logs: logs.map((item, i) => ({
        id: logs.length - i,
        time: formatTime(item.t),
        step: item.step,
        dataText: formatData(item.data),
      })),
      empty: logs.length === 0,
    });
  },

  copyLogs() {
    const logs = log.getAll();
    if (!logs.length) {
      wx.showToast({ title: '暂无日志', icon: 'none' });
      return;
    }
    const text = logs.map(l => `[${l.t}] ${l.step} ${JSON.stringify(l.data || {})}`).join('\n');
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: '已复制 ' + logs.length + ' 条日志', icon: 'none' }),
    });
  },

  clearLogs() {
    if (!this.data.logs.length) return;
    wx.showModal({
      title: '清空日志',
      content: '确定清空本机运行日志吗？',
      confirmColor: '#ff3b30',
      success: (res) => {
        if (res.confirm) {
          log.clear();
          this.setData({ logs: [], empty: true });
          wx.showToast({ title: '已清空', icon: 'success' });
        }
      },
    });
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  },
});

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatData(data) {
  if (!data) return '';
  try {
    const s = JSON.stringify(data);
    return s && s.length > 200 ? s.slice(0, 200) + '…' : s;
  } catch (e) {
    return String(data);
  }
}
