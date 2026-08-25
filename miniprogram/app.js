const towxml = require('/towxml/index.js'); // towxml 3.x：Markdown + LaTeX 公式渲染（复核页用）

App({
  // 转换函数：app.towxml(markdownText, 'markdown') → 渲染数据
  towxml: (str, type) => towxml(str, type),

  globalData: {
    userInfo: null,
    env: 'cloud1-d8g0ty39wd73f430a'
  },

  onLaunch() {
    // 从本地缓存恢复登录状态（openid + 昵称齐全才算已登录）
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
