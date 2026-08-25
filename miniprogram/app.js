App({
  globalData: {
    userInfo: null,
    env: 'cloud1-d8g0ty39wd73f430a'
  },

  onLaunch() {
    // 从本地缓存恢复登录状态（必须有完整的用户数据才恢复）
    const cached = wx.getStorageSync('userInfo');
    if (cached && cached._openid && cached.nickName) {
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
  }
});
