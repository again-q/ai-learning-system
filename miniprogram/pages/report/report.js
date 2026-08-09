const app = getApp();

Page({
  data: {
    batchId: '',
    questions: [],
    failedCount: 0,
    loading: true,
    disputingId: null, // 正在重诊的题目 ID
  },

  onLoad(options) {
    const batchId = options.batchId || '';
    this.setData({ batchId });
    this.fetchReport(batchId);
  },

  async fetchReport(batchId) {
    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'graphService',
        data: { action: 'getReport', batchId },
      });
      const data = res.result;
      if (data.code !== 0) throw new Error(data.message);
      const questions = (data.data.questions || []).map((q) => ({
        ...q,
        statusText: q.isCorrect === true ? '正确' : q.isCorrect === false ? '错误' : '待确认',
      }));
      this.setData({
        questions,
        failedCount: data.data.failedCount || 0,
        loading: false,
      });
    } catch (e) {
      console.error('[report] fetch error:', e);
      wx.showToast({ title: e.message || '加载失败，请重试', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  // 打开异议弹层
  openDispute(e) {
    const idx = e.currentTarget.dataset.index;
    const q = this.data.questions[idx];
    if (this.data.disputingId) return;
    this.setData({
      disputingId: q.questionId,
      disputeIndex: idx,
      disputeAnswer: q.studentAnswer || '',
      disputeNote: '',
    });
  },

  closeDispute() {
    this.setData({ disputingId: null });
  },

  onDisputeAnswer(e) {
    this.setData({ disputeAnswer: e.detail.value });
  },

  onDisputeNote(e) {
    this.setData({ disputeNote: e.detail.value });
  },

  noop() {},

  // 提交异议修正 → 单题重诊
  async submitDispute() {
    const { disputingId, disputeIndex, disputeAnswer, disputeNote, batchId } = this.data;
    if (!disputingId) return;
    wx.showLoading({ title: '重新诊断中...', mask: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'dispute',
        data: {
          questionId: disputingId,
          corrections: { studentAnswer: disputeAnswer, note: disputeNote },
        },
      });
      const data = res.result;
      if (data.code !== 0) throw new Error(data.message);

      // 刷新该题（keptOriginal=判定失败保留原结果时，仅提示不覆盖判定）
      const questions = [...this.data.questions];
      const nd = data.data.newDiagnosis;
      if (data.data.keptOriginal) {
        wx.showToast({ title: '判定失败，已保留原结果', icon: 'none' });
        this.setData({ disputingId: null });
        wx.hideLoading();
        return;
      }
      questions[disputeIndex] = {
        ...questions[disputeIndex],
        isCorrect: nd.isCorrect,
        correctAnswer: nd.correctAnswer,
        difficultyLevel: nd.difficultyLevel,
        difficultyValue: nd.difficultyValue,
        processScore: nd.processScore,
        pathQuality: nd.pathQuality,
        studentAnswer: disputeAnswer,
        statusText: nd.isCorrect ? '正确' : '错误',
      };
      this.setData({ questions, disputingId: null });
      wx.hideLoading();
      wx.showToast({ title: '已重新诊断', icon: 'success' });
    } catch (e) {
      console.error('[report] dispute error:', e);
      wx.hideLoading();
      wx.showToast({ title: e.message || '修正失败，请重试', icon: 'none' });
    }
  },

  goBack() {
    wx.navigateBack();
  },

  // 重新上传失败照片（引导回拍照页）
  retryUpload() {
    wx.redirectTo({ url: '/pages/photo/photo' });
  },
});
