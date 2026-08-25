const towxml = require('/towxml/index.js'); // towxml 3.x：Markdown + LaTeX 公式渲染（复核页用）
const { getCachedUser } = require('./utils/user-cache');

App({
  // 转换函数：app.towxml(markdownText, 'markdown') → 渲染数据
  towxml: (str, type) => towxml(str, type),

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
  }
});
