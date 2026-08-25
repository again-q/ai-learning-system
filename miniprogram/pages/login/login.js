const app = getApp();

function hasCachedUser(user) {
  return !!(user && user._openid && user.nickName);
}

Page({
  data: {
    canLogin: true,
    avatarUrl: '/images/avatar.png',
    nickName: '',
    avatarChanged: false,
    isLoading: false,
  },

  onLoad() {
    // 本地已有 openid 缓存 → 直接进首页（CloudBase 身份靠 openid，不必每次走完整登录）
    const cached = app.globalData.userInfo || wx.getStorageSync('userInfo') || null;
    if (hasCachedUser(cached)) {
      app.globalData.userInfo = cached;
      wx.switchTab({ url: '/pages/index/index' });
      this.silentTouch(cached); // 后台刷新 lastLogin，不挡跳转
      return;
    }
  },

  onChooseAvatar(e) {
    this.setData({
      avatarUrl: e.detail.avatarUrl,
      avatarChanged: false,
    }, () => {
      setTimeout(() => this.setData({ avatarChanged: true }), 16);
      setTimeout(() => this.setData({ avatarChanged: false }), 600);
    });
  },

  onNicknameInput(e) {
    this.setData({ nickName: e.detail.value });
  },

  onLogin() {
    if (!this.data.canLogin || this.data.isLoading) return;

    if (!this.data.nickName || this.data.avatarUrl === '/images/avatar.png') {
      wx.showToast({
        title: !this.data.nickName ? '请先填写昵称' : '请先选择头像',
        icon: 'none',
        duration: 2000,
      });
      return;
    }

    this.setData({ canLogin: false, isLoading: true });

    // CloudBase 云函数上下文自带 OPENID，无需 wx.login 换 code
    // 先登录进首页，头像上传放到后台，避免上传堵死登录
    this.callUserLogin(this.data.avatarUrl)
      .then((user) => {
        app.globalData.userInfo = user;
        wx.setStorageSync('userInfo', user);
        this.setData({ isLoading: false });
        wx.switchTab({ url: '/pages/index/index' });
        // 本地临时头像再异步上传并回写
        this.uploadAvatarInBackground(user);
      })
      .catch((err) => {
        this.loginFail((err && err.message) || '登录失败');
      });
  },

  callUserLogin(avatarUrl) {
    return wx.cloud.callFunction({
      name: 'userLogin',
      data: {
        nickName: this.data.nickName || '同学',
        avatarUrl: avatarUrl || '',
      },
    }).then((cr) => {
      const res = cr.result;
      if (!res || res.code !== 0) {
        throw new Error((res && res.message) || '登录失败');
      }
      return res.data;
    });
  },

  // 已缓存用户：静默碰一下 lastLogin，失败忽略
  silentTouch(cached) {
    if (!wx.cloud) return;
    wx.cloud.callFunction({
      name: 'userLogin',
      data: {
        nickName: cached.nickName,
        avatarUrl: cached.avatarUrl || '',
      },
    }).then((cr) => {
      const res = cr.result;
      if (res && res.code === 0 && res.data) {
        app.globalData.userInfo = res.data;
        wx.setStorageSync('userInfo', res.data);
      }
    }).catch(() => {});
  },

  uploadAvatarInBackground(user) {
    const url = this.data.avatarUrl;
    if (!url || url === '/images/avatar.png' || url.startsWith('cloud://') || url.startsWith('http')) {
      return;
    }
    const ext = (url.match(/\.(\w+)(\?|$)/) || [])[1] || 'png';
    const cloudPath = `avatars/${Date.now()}.${Math.random().toString(36).slice(2)}.${ext}`;
    wx.cloud.uploadFile({
      cloudPath,
      filePath: url,
      success: (up) => {
        const fileId = up.fileID;
        wx.cloud.callFunction({
          name: 'userLogin',
          data: { nickName: user.nickName, avatarUrl: fileId },
        }).then((cr) => {
          const res = cr.result;
          if (res && res.code === 0 && res.data) {
            app.globalData.userInfo = res.data;
            wx.setStorageSync('userInfo', res.data);
          }
        }).catch(() => {});
      },
    });
  },

  loginFail(msg) {
    this.setData({ canLogin: true, isLoading: false });
    if (msg) wx.showToast({ title: msg, icon: 'none' });
  },
});
