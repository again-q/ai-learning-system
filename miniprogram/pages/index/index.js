const app = getApp();

Page({
  data: {
    subjects: ['数学', '英语', '物理', '语文', '化学'],
    subjectIndex: 0,
    currentSubject: '数学',
    userName: '同学',
    mastery: 78,
    streak: 7,
    suggestion: '今天建议先复习二次函数的顶点公式和判别式，这两个知识点目前的掌握度偏低，但它们是后续学习的基础。完成后可以尝试做3道练习题巩固。'
  },

  onLoad() {
    const user = app.globalData.userInfo;
    if (user) {
      this.setData({ 
        userName: user.nickName || '同学',
        streak: user.streak || 1
      });
    }
    this.drawRing(78);
  },

  onShow() {
    const user = app.globalData.userInfo;
    if (user && user.nickName) {
      this.setData({ userName: user.nickName });
    }
  },

  drawRing(pct) {
    const query = wx.createSelectorQuery();
    query.select('.ring-canvas').node((res) => {
      const canvas = res.node;
      const ctx = canvas.getContext('2d');
      const dpr = wx.getSystemInfoSync().pixelRatio;
      canvas.width = 320 * dpr;
      canvas.height = 320 * dpr;
      ctx.scale(dpr, dpr);

      const cx = 160, cy = 160, r = 120, lineW = 24;

      // 背景圆
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = '#f0f0f5';
      ctx.lineWidth = lineW;
      ctx.stroke();

      // 进度圆
      const endAngle = (pct / 100) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, endAngle);
      ctx.strokeStyle = '#007aff';
      ctx.lineWidth = lineW;
      ctx.lineCap = 'round';
      ctx.stroke();
    }).exec();
  },

  onSubjectChange() {
    // 切换学科时更新数据和环形图
    const subject = this.data.subjects[this.data.subjectIndex];
    const mockMastery = {
      '数学': 78,
      '英语': 65,
      '物理': 45,
      '语文': 82,
      '化学': 33
    };
    const mockSuggest = {
      '数学': '今天建议先复习二次函数的顶点公式和判别式，这两个知识点目前的掌握度偏低。',
      '英语': '建议重点复习现在完成时和过去完成时的区别，这是你最近练习中容易混淆的。',
      '物理': '牛顿第二定律的应用题错误率较高，建议先回顾 F=ma 的基本概念再做题。',
      '语文': '文言文实词掌握度不错，今天可以开始练习句子翻译，建议从《论语》选段开始。',
      '化学': '化学方程式配平是目前的薄弱环节，建议先掌握最小公倍数法再练习。'
    };
    this.setData({
      currentSubject: subject,
      mastery: mockMastery[subject],
      suggestion: mockSuggest[subject]
    });
    this.drawRing(mockMastery[subject]);
  },

  prevSubject() {
    let idx = this.data.subjectIndex;
    idx = (idx - 1 + this.data.subjects.length) % this.data.subjects.length;
    this.setData({ subjectIndex: idx });
    this.onSubjectChange();
  },

  nextSubject() {
    let idx = this.data.subjectIndex;
    idx = (idx + 1) % this.data.subjects.length;
    this.setData({ subjectIndex: idx });
    this.onSubjectChange();
  },

  goStudy() {
    wx.switchTab({ url: '/pages/study/study' });
  }
});
