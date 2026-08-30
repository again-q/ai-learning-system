const app = getApp();

// 每日一句：真实名言（按日期轮换）
const QUOTES = [
  { text: '数学是科学的皇后，数论是数学的皇后。', by: '高斯' },
  { text: '我唯一知道的就是我一无所知。', by: '苏格拉底' },
  { text: '天才就是百分之一的灵感加上百分之九十九的汗水。', by: '爱迪生' },
  { text: '学而不思则罔，思而不学则殆。', by: '孔子' },
  { text: '不积跬步，无以至千里；不积小流，无以成江海。', by: '荀子' },
  { text: '书山有路勤为径，学海无涯苦作舟。', by: '韩愈' },
  { text: '给我一个支点，我可以撬动整个地球。', by: '阿基米德' },
  { text: '我思故我在。', by: '笛卡尔' },
  { text: '知识就是力量。', by: '培根' },
  { text: '路漫漫其修远兮，吾将上下而求索。', by: '屈原' },
  { text: '失败是成功之母。', by: '谚语' },
  { text: '科学没有国界，但科学家有祖国。', by: '巴斯德' },
];
function pickDailyQuote() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const day = Math.floor((now - start) / 86400000);
  return QUOTES[day % QUOTES.length];
}

Page({
  data: {
    pageReady: false,
    subjects: ['数学', '英语', '物理', '语文', '化学', '生物', '政治', '历史', '地理'],
    subjectIndex: 0,
    currentSubject: '数学',
    userName: '同学',
    quoteText: '',
    quoteBy: '',
  },

  onLoad() {
    const user = app.globalData.userInfo;
    if (user) {
      this.setData({ userName: user.nickName || '同学' });
    }
    const q = pickDailyQuote();
    this.setData({ quoteText: q.text, quoteBy: q.by });
  },

  onShow() {
    const user = app.globalData.userInfo;
    if (user && user.nickName) {
      this.setData({ userName: user.nickName });
    }
    // 触发页面淡入过渡
    this.setData({ pageReady: false });
    setTimeout(() => { this.setData({ pageReady: true }); }, 16);
  },

  onSubjectChange() {
    const subject = this.data.subjects[this.data.subjectIndex];
    this.setData({ currentSubject: subject });
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
