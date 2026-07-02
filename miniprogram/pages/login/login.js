const app = getApp();

Page({
  data: {
    canLogin: true,
    avatarUrl: '/images/avatar.png',
    nickName: '',
    avatarChanged: false,   // 头像是否刚被更换（触发弹跳动画）
    isLoading: false         // 登录中状态（按钮变 spinner）
  },

  onLoad() {
    // 登录页始终显示，让用户手动确认
  },

  onChooseAvatar(e) {
    console.log('[login] chooseAvatar fired, url:', e.detail.avatarUrl);
    this.setData({
      avatarUrl: e.detail.avatarUrl,
      avatarChanged: false
    }, () => {
      // 下一帧触发动画（避免 setData 合并导致动画不执行）
      setTimeout(() => this.setData({ avatarChanged: true }), 16);
      // 动画结束后重置标记
      setTimeout(() => this.setData({ avatarChanged: false }), 600);
    });
  },

  onNicknameInput(e) {
    console.log('[login] nickname input fired, value:', e.detail.value);
    this.setData({ nickName: e.detail.value });
  },

  onLogin() {
    if (!this.data.canLogin || this.data.isLoading) return;

    // 验证：必须填昵称和选头像
    if (!this.data.nickName || this.data.avatarUrl === '/images/avatar.png') {
      wx.showToast({
        title: !this.data.nickName ? '请先填写昵称' : '请先选择头像',
        icon: 'none',
        duration: 2000
      });
      return;
    }

    this.setData({ canLogin: false, isLoading: true });
    wx.showLoading({ title: '登录中', mask: true });

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
              const res = cr.result;
              if (res.code === 0) {
                app.globalData.userInfo = res.data;
                wx.setStorageSync('userInfo', res.data);
                wx.hideLoading();
                this.setData({ isLoading: false });
                wx.switchTab({ url: '/pages/index/index' });
              } else {
                this.loginFail(res.message || '登录失败');
              }
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
    const ext = url.match(/\.(\w+)(\?|$)/)?.[1] || 'png';
    const cloudPath = `avatars/${Date.now()}.${Math.random().toString(36).slice(2)}.${ext}`;
    wx.cloud.uploadFile({
      cloudPath,
      filePath: url,
      success: (res) => callback(res.fileID),
      fail: () => callback(url)
    });
  },

  loginFail(msg) {
    wx.hideLoading();
    this.setData({ canLogin: true, isLoading: false });
    if (msg) wx.showToast({ title: msg, icon: 'none' });
  }
});
