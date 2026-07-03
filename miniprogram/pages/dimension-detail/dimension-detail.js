const app = getApp();

Page({
  data: {
    subject: '',
    dimId: 'K',
    dimName: '',
    kOverall: 0,
    layers: []
  },

  onLoad(options) {
    const subject = options.subject ? decodeURIComponent(options.subject) : '数学';
    const dimId = options.dim || 'K';
    const dimName = options.name ? decodeURIComponent(options.name) : '';
    this.setData({
      subject,
      dimId,
      dimName,
      kOverall: parseInt(options.value) || 0,
      layers: [
        {
          id: 'knowledge',
          icon: '📖',
          name: '知识层',
          desc: '概念定义·教材方法',
          mastery: 57,
          color: '#007aff',
          count: 8
        },
        {
          id: 'model',
          icon: '🧩',
          name: '模型层',
          desc: '题目模型·解题框架',
          mastery: 45,
          color: '#ff9500',
          count: 4
        },
        {
          id: 'method',
          icon: '✏️',
          name: '方法层',
          desc: '思维技巧·解题策略',
          mastery: 38,
          color: '#af52de',
          count: 3
        }
      ]
    });
  },

  goLayer(e) {
    const id = e.currentTarget.dataset.id;
    const pageMap = {
      'knowledge': '/pages/knowledge-tree/knowledge-tree',
      'model': '/pages/model-cards/model-cards',
      'method': '/pages/method-list/method-list'
    };
    const url = pageMap[id];
    if (url) {
      wx.navigateTo({ url: `${url}?subject=${encodeURIComponent(this.data.subject)}` });
    }
  },

  goBack() {
    wx.navigateBack();
  }
});
