const { renderMathText, unescapeUnderscore } = require('../../utils/latex');
const app = getApp();

function getOpenid() {
  const fromKey = wx.getStorageSync('openid');
  if (fromKey) return fromKey;
  const user = wx.getStorageSync('userInfo') || (app.globalData && app.globalData.userInfo) || {};
  return user._openid || '';
}

Page({
  data: {
    loading: true,
    errorMsg: '',
    detail: null,
    // 进阶分析（直接分析本题）
    advLoading: false,
    advResult: null,
    advInsufficient: false,
    advCount: 0,
    // 题型异议
    disputeVisible: false,
    disputeText: '',
    disputeLoading: false,
    disputeResult: null,
    disputeAccepted: false,
  },

  onLoad(options) {
    const questionId = (options && options.questionId) || '';
    if (!questionId) { this.setData({ loading: false, errorMsg: '缺少题目' }); return; }
    this.loadDetail(questionId);
  },

  loadDetail(questionId) {
    this.setData({ loading: true, errorMsg: '' });
    wx.cloud.callFunction({ name: 'reportService', data: { action: 'questionDetail', questionId, userId: getOpenid() } })
      .then((res) => {
        const d = res.result;
        if (d && d.code === 0 && d.data) {
          const dd = d.data;
          dd.questionNodes = renderMathText(unescapeUnderscore(dd.questionText || ''));
          dd.progressNodes = renderMathText(dd.progressNarrative || '');
          const da = dd.diffAnalysis || {};
          dd.diffFact = da.fact || '';
          dd.diffInference = da.inference || '';
          dd.diffHook = da.hook || '';
          this.setData({ detail: dd, loading: false });
        } else {
          this.setData({ loading: false, errorMsg: (d && d.message) || '题目读取失败' });
        }
      })
      .catch(() => this.setData({ loading: false, errorMsg: '题目读取失败' }));
  },

  // ============ 题型异议 ============
  openPatternDispute() { this.setData({ disputeVisible: true, disputeText: '', disputeResult: null }); },
  closeDispute() { this.setData({ disputeVisible: false }); },
  onDisputeInput(e) { this.setData({ disputeText: e.detail.value }); },

  submitPatternDispute() {
    const proposal = (this.data.disputeText || '').trim();
    const questionId = this.data.detail && this.data.detail.questionId;
    if (!proposal || !questionId) return;
    this.setData({ disputeLoading: true, disputeResult: null });
    wx.cloud.callFunction({ name: 'reportService', data: { action: 'disputePattern', questionId, proposal, userId: getOpenid() } })
      .then((res) => {
        const d = res.result;
        if (d && d.code === 0) {
          this.setData({ disputeLoading: false, disputeAccepted: !!d.data.accepted, disputeResult: d.data.comment || (d.data.accepted ? '已接受' : '未接受') });
          if (d.data.accepted) this.setData({ 'detail.pattern': proposal.slice(0, 120) });
        } else {
          this.setData({ disputeLoading: false, disputeResult: (d && d.message) || '判定失败，请重试' });
        }
      })
      .catch(() => this.setData({ disputeLoading: false, disputeResult: '网络异常，请重试' }));
  },

  // ============ 进阶分析（唯一入口：直接分析本题） ============
  runCurrentAdvanced() {
    const questionId = this.data.detail && this.data.detail.questionId;
    if (!questionId) return;
    this.setData({ advLoading: true, advResult: null, advInsufficient: false });
    wx.cloud.callFunction({ name: 'reportService', data: { action: 'advancedAnalysis', questionId, userId: getOpenid() } }).then((res) => {
      const d = res.result;
      if (d && d.code === 0) {
        this.setData({ advLoading: false, advResult: d.data.insufficient ? null : d.data.analysis, advInsufficient: !!d.data.insufficient, advCount: d.data.count || 0 });
      } else {
        this.setData({ advLoading: false, advResult: null, advInsufficient: true, advCount: 0 });
      }
    }).catch(() => this.setData({ advLoading: false, advInsufficient: true, advCount: 0 }));
  },

  noop() {},
});
