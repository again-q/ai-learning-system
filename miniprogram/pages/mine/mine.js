const app = getApp();

Page({
  data: {
    pageReady: false,
    isLoggedIn: false,
    nickName: '',
    avatarUrl: '',
    streak: 0,
    todayMinutes: 0,
    learnedNodes: 0,
    totalMastery: 0,
    subjects: []
  },

  onLoad() {
    this.loadUserData();
  },

  onShow() {
    this.loadUserData();
    // 触发页面淡入过渡
    this.setData({ pageReady: false });
    setTimeout(() => this.setData({ pageReady: true }), 16);
  },

  loadUserData() {
    const user = app.globalData.userInfo;
    console.log('[mine] user from globalData:', user);
    if (user && user._openid) {
      const avatar = user.avatarUrl || '';
      // 如果头像不是 cloud:// 的有效路径，用默认图
      const validAvatar = (avatar && (avatar.startsWith('cloud://') || avatar.startsWith('http'))) 
        ? avatar : '/images/avatar.png';
      this.setData({
        isLoggedIn: true,
        nickName: user.nickName || '同学',
        avatarUrl: validAvatar,
        streak: user.streak || 1,
        todayMinutes: 0,
        learnedNodes: 0,
        totalMastery: 0,
        subjects: (user.subjects || []).map(s => ({
          name: s,
          mastery: 0
        }))
      });
    } else {
      this.setData({
        isLoggedIn: false,
        nickName: '',
        avatarUrl: '',
        streak: 0,
        subjects: []
      });
    }
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  goSetting() {
    if (!this.data.isLoggedIn) { this.goLogin(); return; }
    wx.navigateTo({ url: '/packageExtra/pages/admin/knowledge-admin/knowledge-admin' });
  },

  goReport() {
    if (!this.data.isLoggedIn) { this.goLogin(); return; }
    wx.navigateTo({ url: '/packageDiagnose/pages/report/report' });
  },

  goZhixue() {
    if (!this.data.isLoggedIn) { this.goLogin(); return; }
    // 智学网页面（packageSync 分包）按决策 042/060 不进 public 仓库：
    // 本机有该目录时正常跳转；别处 clone 的仓库里没有这个分包，跳转失败时给提示，避免白屏。
    wx.navigateTo({
      url: '/packageSync/pages/zhixue/zhixue',
      fail: () => wx.showToast({ title: '该功能未随本版本发布', icon: 'none' }),
    });
  },

  goAchievement() {
    if (!this.data.isLoggedIn) { this.goLogin(); return; }
    wx.showToast({ title: '开发中', icon: 'none' });
  },

  goSettings() {
    wx.navigateTo({ url: '/packageExtra/pages/settings/settings' });
  }
});
