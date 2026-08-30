const app = getApp();

Page({
  data: {
    pageReady: false,
    subjects: ['数学', '英语', '物理', '语文', '化学', '生物', '政治', '历史', '地理'],
    subjectIndex: 0,
    currentSubject: '数学',
    userName: '同学',
    mastery: 0,
    streak: 7,
    todayMinutes: 45,
    suggestion: '掌握度加载中...'
  },

  onLoad() {
    const user = app.globalData.userInfo;
    if (user) {
      this.setData({ 
        userName: user.nickName || '同学',
        streak: user.streak || 1
      });
    }
    this.drawRing(this.data.mastery);
  },

  // 首页掌握度接真数据（宪法加权得分法：statService.overview，K=ΣS/ΣD）
  loadMastery() {
    wx.cloud.callFunction({
      name: 'statService',
      data: { action: 'overview' },
    }).then((res) => {
      const d = res.result && res.result.code === 0 ? res.result.data : null;
      if (!d || d.masteryPercent == null) {
        this._overview = { masteryPercent: 0, suggestion: '暂无掌握度数据——去拍一张作业照片，让 AI 帮你建立知识画像。' };
      } else {
        const weakText = (d.weakNodes && d.weakNodes.length)
          ? '掌握度较低：' + d.weakNodes.join('、') + '，建议优先复习。'
          : '继续练习，掌握度会随每次诊断自动更新。';
        this._overview = {
          masteryPercent: d.masteryPercent,
          suggestion: '已积累 ' + d.nodeCount + ' 个知识点的掌握记录。' + weakText,
        };
      }
      if (this.data.currentSubject === '数学') {
        this.setData({ mastery: this._overview.masteryPercent, suggestion: this._overview.suggestion });
        this.drawRing(this._overview.masteryPercent);
      }
    }).catch(() => {
      this.setData({ suggestion: '掌握度加载失败，请稍后重试。' });
    });
  },

  onShow() {
    const user = app.globalData.userInfo;
    if (user && user.nickName) {
      this.setData({ userName: user.nickName });
    }
    // 触发页面淡入过渡
    this.setData({ pageReady: false });
    setTimeout(() => {
      this.setData({ pageReady: true });
      // Canvas 是原生组件不跟随 CSS 过渡，需在淡入后重绘避免残留
      this.drawRing(this.data.mastery);
    }, 16);
    // 每次回到首页刷新掌握度（诊断完成后返回即见最新）
    this.loadMastery();
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
    // 切换学科：真实掌握度目前仅数学有图谱数据，其余学科如实显示暂未接入
    const subject = this.data.subjects[this.data.subjectIndex];
    if (subject === '数学' && this._overview) {
      this.setData({ currentSubject: subject, mastery: this._overview.masteryPercent, suggestion: this._overview.suggestion });
      this.drawRing(this._overview.masteryPercent);
    } else if (subject === '数学') {
      this.setData({ currentSubject: subject, mastery: 0, suggestion: '掌握度加载中...' });
      this.drawRing(0);
      this.loadMastery();
    } else {
      this.setData({ currentSubject: subject, mastery: 0, suggestion: '「' + subject + '」暂未接入掌握度统计，当前知识图谱覆盖数学。' });
      this.drawRing(0);
    }
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
  },

  goPhoto() {
    wx.navigateTo({ url: '/pages/photo/photo' });
  },

  openAIAssistant() {
    wx.showToast({ title: 'AI 助手开发中，敬请期待', icon: 'none' });
  }
});