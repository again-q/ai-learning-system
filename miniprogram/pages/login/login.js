const app = getApp();
const { getCachedUser, setCachedUser, isValidUser } = require('../../utils/user-cache');

Page({
  data: {
    canLogin: true,
    avatarUrl: '/images/avatar.png',
    nickName: '',
    avatarChanged: false,
    isLoading: false,
  },

  onLoad() {
    // 本地已有未过期的 openid 缓存 → 直接进首页
    const cached = app.globalData.userInfo || getCachedUser();
    if (isValidUser(cached)) {
      app.globalData.userInfo = cached;
      wx.switchTab({ url: '/pages/index/index' });
      this.silentTouch(cached); // 后台刷新 lastLogin，并续期 1 周缓存
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
    this.callUserLogin(this.data.avatarUrl)
      .then((user) => {
        app.globalData.userInfo = user;
        setCachedUser(user); // 写入并开始 1 周 TTL
        this.setData({ isLoading: false });
        wx.switchTab({ url: '/pages/index/index' });
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

  // 已缓存用户：静默碰 lastLogin，成功则续期缓存
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
        setCachedUser(res.data); // 续期 1 周
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
            setCachedUser(res.data);
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
