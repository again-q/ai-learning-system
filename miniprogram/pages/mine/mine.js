const app = getApp();

Page({
  data: {
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
    wx.showToast({ title: '开发中', icon: 'none' });
  },

  goReport() {
    if (!this.data.isLoggedIn) { this.goLogin(); return; }
    wx.showToast({ title: '开发中', icon: 'none' });
  },

  goAchievement() {
    if (!this.data.isLoggedIn) { this.goLogin(); return; }
    wx.showToast({ title: '开发中', icon: 'none' });
  }
});
