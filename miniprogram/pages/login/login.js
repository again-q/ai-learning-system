const app = getApp();

Page({
  data: {
    canLogin: true,
    avatarUrl: '/images/avatar.png',
    nickName: ''
  },

  onLoad() {
    // 登录页始终显示，让用户手动确认
  },

  onChooseAvatar(e) {
    console.log('[login] chooseAvatar fired, url:', e.detail.avatarUrl);
    this.setData({ avatarUrl: e.detail.avatarUrl });
  },

  onNicknameInput(e) {
    console.log('[login] nickname input fired, value:', e.detail.value);
    this.setData({ nickName: e.detail.value });
  },

  onLogin() {
    if (!this.data.canLogin) return;

    // 验证：必须填昵称和选头像
    if (!this.data.nickName || this.data.avatarUrl === '/images/avatar.png') {
      wx.showToast({
        title: !this.data.nickName ? '请先填写昵称' : '请先选择头像',
        icon: 'none',
        duration: 2000
      });
      return;
    }

    this.setData({ canLogin: false });

    wx.showLoading({ title: '登录中...' });

    wx.login({
      success: (res) => {
        if (!res.code) {
          this.loginFail('登录失败');
          return;
        }
        console.log('[login] SENDING to cloud - nickName:', this.data.nickName, 'avatarUrl:', this.data.avatarUrl);
        this.uploadAvatar((fileId) => {
          console.log('[login] uploadAvatar callback, fileId:', fileId);
          wx.cloud.callFunction({
            name: 'userLogin',
            data: {
              nickName: this.data.nickName || '同学',
              avatarUrl: fileId || this.data.avatarUrl
            },
            success: (cr) => {
              console.log('[login] cloud function result:', cr.result);
              app.globalData.userInfo = cr.result;
              wx.setStorageSync('userInfo', cr.result);  // 持久化
              wx.hideLoading();
              wx.switchTab({ url: '/pages/index/index' });
            },
            fail: () => this.loginFail('网络连接失败')
          });
        });
      },
      fail: () => this.loginFail('微信登录失败')
    });
  },

  uploadAvatar(callback) {
    const url = this.data.avatarUrl;
    if (!url || url === '/images/avatar.png' || url.startsWith('cloud://')) {
      callback(url);
      return;
    }
    const ext = '.png';
    const cloudPath = `avatars/${Date.now()}.${Math.random().toString(36).slice(2)}${ext}`;
    wx.cloud.uploadFile({
      cloudPath,
      filePath: url,
      success: (res) => callback(res.fileID),
      fail: () => callback(url)
    });
  },

  loginFail(msg) {
    this.setData({ canLogin: true });
    wx.hideLoading();
    if (msg) wx.showToast({ title: msg, icon: 'none' });
  }
});
