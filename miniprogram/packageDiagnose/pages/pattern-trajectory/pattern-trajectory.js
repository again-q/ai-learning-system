// 这道题的过去和现在：同类题历史演化（reportService.questionEvolution）
// 认知科学定位：过程级反馈——「过去的你 vs 现在的你」同题对比，证据全部来自真实历史判定
Page({
  data: {
    loading: true,
    mode: '',
    current: null,
    evolution: null,
    history: [],
    message: '',
  },

  onLoad(options) {
    const o = options || {};
    this.batchId = decodeURIComponent(o.batch || '');
    this.questionText = decodeURIComponent(o.qt || '');
    this.questionType = decodeURIComponent(o.qtype || '');
    this.processScore = o.score || '';
    this.fetchEvolution();
  },

  fetchEvolution() {
    const that = this;
    wx.cloud.callFunction({
      name: 'reportService',
      data: {
        action: 'questionEvolution',
        batchId: this.batchId,
        questionText: this.questionText,
        questionType: this.questionType,
        processScore: this.processScore,
      },
      success(res) {
        const r = res.result || {};
        if (r.code !== 0) {
          that.setData({ loading: false, message: r.message || '加载失败' });
          return;
        }
        // WXSS 不支持非 ASCII 类名：结果 → ASCII 类，中文只留在显示文本
        const CLS = { '做对': 'ok', '收尾断': 'end', '中途断': 'mid', '起步即停': 'start', '空白未作答': 'start', '作答有误': 'wrong', '有过程未走通': 'mid', '无过程': 'none' };
        const d = r.data || {};
        const history = (d.past || []).map((a) => ({ ...a, cls: CLS[a.result] || 'none' }));
        const current = d.current ? { ...d.current, cls: CLS[d.current.result] || 'none' } : null;
        that.setData({
          loading: false,
          mode: d.mode || '',
          current,
          evolution: d.evolution || null,
          history,
          message: d.message || '',
        });
      },
      fail() {
        that.setData({ loading: false, message: '网络异常，请稍后再试' });
      },
    });
  },

  goBack() {
    wx.navigateBack();
  },
});
