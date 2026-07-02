Page({
  data: {
    currentSubject: '数学',
    subjectIndex: 0,
    subjects: ['数学', '英语', '物理', '语文', '化学'],
    streak: 7,
    messages: [{
      id: 0,
      content: '你好！我是 AI 学习助手，今天想学什么？',
      isUser: false,
      animation: false
    }],
    inputValue: '',
    isLoading: false,
    canSend: false,
    scrollToId: 'bottom'
  },

  changeSubject(e) {
    const idx = e.detail.value;
    this.setData({
      subjectIndex: idx,
      currentSubject: this.data.subjects[idx],
      messages: [{
        id: 0,
        content: `切换到${this.data.subjects[idx]}，有什么想学的吗？`,
        isUser: false,
        animation: false
      }]
    });
  },

  onInput(e) {
    const val = e.detail.value;
    this.setData({ inputValue: val, canSend: val.trim().length > 0 });
  },

  sendMessage() {
    if (this.data.isLoading || !this.data.canSend) return;
    const content = this.data.inputValue.trim();
    if (!content) return;

    this.addMsg(content, true);
    this.setData({ inputValue: '', canSend: false });

    this.setData({ isLoading: true });
    setTimeout(() => {
      this.addMsg(this.getReply(content), false);
      this.setData({ isLoading: false });
    }, 800 + Math.random() * 600);
  },

  addMsg(content, isUser) {
    const msgs = this.data.messages;
    msgs.push({ id: msgs.length, content, isUser, animation: true });
    this.setData({ messages: msgs, scrollToId: 'bottom' });
  },

  getReply(q) {
    const replies = {
      '二次函数顶点公式': '二次函数 y = ax² + bx + c 的顶点坐标：\n\n(-b/2a, (4ac-b²)/4a)\n\n对称轴：x = -b/2a\n\na > 0 开口向上，a < 0 开口向下。',
      '英语时态': '常用时态：\n• 一般现在时：主语 + do/does\n• 现在进行时：am/is/are + doing\n• 现在完成时：have/has + done\n• 一般过去时：主语 + did',
      '牛顿定律': 'F = ma\n\n力 = 质量 × 加速度\n\n1N = 1kg·m/s²'
    };
    return replies[q] || `关于「${q}」\n\n核心要点：\n\n1. 先理解基本概念\n2. 掌握关键公式/规则\n3. 通过练习巩固\n\n需要我详细讲讲吗？`;
  }
});
