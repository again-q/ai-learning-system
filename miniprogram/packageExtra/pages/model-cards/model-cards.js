function getColor(m) {
  if (m >= 75) return '#34c759';
  if (m >= 50) return '#ff9500';
  if (m > 0) return '#ff3b30';
  return '#c7c7cc';
}

const app = getApp();

Page({
  data: {
    subject: '数学',
    models: []
  },

  onLoad(options) {
    this.setData({ subject: options.subject || '数学' });
    this.loadModels();
  },

  loadModels() {
    wx.cloud.callFunction({
      name: 'manageKnowledge',
      data: { action: 'list', subjectId: 'math', type: 'model' }
    }).then(res => {
      const list = (res.result && res.result.data) || [];
      this.setData({ models: list.map(m => ({
        id: m._id, name: m.name, mastery: m.mastery || 0,
        status: (m.mastery || 0) >= 75 ? 'mastered' : (m.mastery || 0) >= 50 ? 'learning' : (m.mastery || 0) > 0 ? 'weak' : 'untouched',
        desc: m.chapter || '',
        color: getColor(m.mastery || 0),
        statusText: (m.mastery || 0) >= 75 ? '已掌握' : (m.mastery || 0) >= 50 ? '学习中' : (m.mastery || 0) > 0 ? '薄弱' : '未学习'
      })) });
    }).catch(() => {
      // fallback mock
      this.setData({ models: this.getMock() });
    });
  },

  getMock() {
    return [
      { id:'m1', name:'二次函数模型', mastery:23, status:'weak', desc:'抛物线最值', color:'#ff3b30', statusText:'薄弱' },
      { id:'m2', name:'一次函数模型', mastery:92, status:'mastered', desc:'线性关系', color:'#34c759', statusText:'已掌握' }
    ];
  },

  goStudy(e) {
    wx.switchTab({ url: '/pages/study/study' });
  },

  goBack() {
    wx.navigateBack();
  }
});
