// 设置：运行日志入口 + 底部版本号（调试时确认当前跑的是哪一版）
const { buildVersion } = require('../../../version');

// 正式版的版本号可从 wx.getAccountInfoSync 拿到；开发版/体验版官方拿不到（version 为空），
// 所以开发版靠 CI 上传前写入的 buildVersion（见 miniprogram/version.js）
function getVersionText() {
  let online = '';
  let env = '';
  try {
    const mp = (wx.getAccountInfoSync() || {}).miniProgram || {};
    const envMap = { develop: '开发版', trial: '体验版', release: '正式版' };
    online = mp.version || '';
    env = envMap[mp.envVersion] || '';
  } catch (e) {}
  const ver = online || buildVersion || '';
  const verText = /^\d/.test(ver) ? 'v' + ver : ver;
  return [verText, env].filter(Boolean).join(' · ') || '版本未知';
}

Page({
  data: {
    versionText: '',
  },

  onLoad() {
    this.setData({ versionText: getVersionText() });
  },

  goLogs() {
    wx.navigateTo({ url: '/packageExtra/pages/logs/logs' });
  },

  goBack() { wx.navigateBack(); },
});
