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
    methods: []
  },

  onLoad(options) {
    this.setData({ subject: options.subject || '数学' });
    this.loadMethods();
  },

  loadMethods() {
    wx.cloud.callFunction({
      name: 'manageKnowledge',
      data: { action: 'list', subjectId: 'math', type: 'skill' }
    }).then(res => {
      const list = (res.result && res.result.data) || [];
      this.setData({ methods: list.map(m => ({
        id: m._id, name: m.name, mastery: m.mastery || 0,
        status: (m.mastery || 0) >= 75 ? 'mastered' : (m.mastery || 0) >= 50 ? 'learning' : (m.mastery || 0) > 0 ? 'weak' : 'untouched',
        desc: m.chapter || '',
        color: getColor(m.mastery || 0)
      })) });
    }).catch(() => {
      this.setData({ methods: this.getMock() });
    });
  },

  getMock() {
    return [
      { id:'mt1', name:'换元法', mastery:45, status:'learning', desc:'变量替换', color:'#ff9500' },
      { id:'mt2', name:'数形结合', mastery:30, status:'weak', desc:'几何转化', color:'#ff3b30' }
    ];
  },

  goStudy(e) {
    wx.switchTab({ url: '/pages/study/study' });
  },

  goBack() {
    wx.navigateBack();
  }
});
