const { getCachedUser } = require('./utils/user-cache');
const log = require('./utils/upload-log');

App({
  globalData: {
    userInfo: null,
    env: 'cloud1-d8g0ty39wd73f430a'
  },

  onLaunch() {
    // 本地 openid 缓存（超过 1 周自动清除）
    const cached = getCachedUser();
    if (cached) {
      this.globalData.userInfo = cached;
    }

    if (!wx.cloud) {
      console.error('请使用 2.2.3 以上基础库');
    } else {
      wx.cloud.init({
        env: this.globalData.env,
        traceUser: true
      });
    }
  },

  // 链路日志留痕：区分"离开的是页面"还是"整个小程序切后台"（排查云能力中断的关键依据）
  onHide() { log.append('app_hide', {}); },
  onShow() { log.append('app_show', {}); }
});
