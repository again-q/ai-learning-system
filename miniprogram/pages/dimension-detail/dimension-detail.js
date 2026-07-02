const app = getApp();

Page({
  data: {
    dim: '',
    name: '',
    icon: '',
    value: 0,
    color: '#007aff',
    subject: ''
  },

  onLoad(options) {
    this.setData({
      dim: options.dim || 'K',
      name: options.name || '知识掌握',
      icon: options.icon || '📖',
      value: parseInt(options.value) || 0,
      color: decodeURIComponent(options.color || '#007aff'),
      subject: options.subject || '数学'
    });
  },

  goBack() {
    wx.navigateBack();
  }
});
