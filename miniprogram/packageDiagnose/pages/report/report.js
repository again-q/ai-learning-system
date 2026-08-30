const log = require('../../../utils/upload-log');
const { renderMathText, unescapeUnderscore } = require('../../utils/latex');
const app = getApp();

const GEN_STAGES = [
  { text: '整理答题数据…' },
  { text: '生成批次总结…' },
  { text: '生成题目详情…' },
  { text: '保存报告…' },
];
const REPORT_POLL_MS = 4000;

function getOpenid() {
  const fromKey = wx.getStorageSync('openid');
  if (fromKey) return fromKey;
  const user = wx.getStorageSync('userInfo') || (app.globalData && app.globalData.userInfo) || {};
  return user._openid || '';
}

function isTimeoutError(msg) {
  return /timeout|timed out|TIME_LIMIT|ESOCKETTIMEDOUT|-501002/i.test(msg || '');
}

// 题型三层：领域/模式/变体（domain / pattern / variant），只取中间粒度（去掉最宽最细两端）
function midPattern(p) {
  if (!p) return '';
  const parts = String(p).split('/').map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 1) return parts[0] || '';
  if (parts.length === 2) return parts[1];
  return parts[Math.floor((parts.length - 1) / 2)] || parts[0] || '';
}

Page({
  data: {
    loading: true,
    emptyMsg: '',
    noReport: false,
    retryable: false,
    report: null,
    reportId: null,
    batchId: null,
    reportProgressVisible: false,
    reportProgressText: '',
    reportElapsedSec: 0,
    reportStageIndex: 0,
    genStages: GEN_STAGES,
    // 逐题内联详情
    activeQid: null,
    detail: null,
    // 进阶分析（直接分析当前题）
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

  async onLoad(options) {
    let batchId = options.batchId;
    if (!batchId) {
      batchId = await this.findLatestBatchId();
      if (!batchId) { this.setData({ loading: false, noReport: true }); return; }
    }
    this.setData({ batchId });
    this.loadReport(batchId);
  },

  // 没有指定批次时，自动取该用户最近一批
  async findLatestBatchId() {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('batches')
        .where({ _openid: getOpenid(), userId: getOpenid() })
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();
      return (res.data && res.data[0] && res.data[0]._id) || '';
    } catch (e) { return ''; }
  },

  onUnload() { this.stopProgressTicker(); },

  // ============ 读取/生成报告 ============
  async loadReport(batchId) {
    const t0 = Date.now();
    try {
      const res = await wx.cloud.callFunction({ name: 'reportService', data: { action: 'getByBatch', batchId, userId: getOpenid() } });
      const d = res.result;
      if (d && d.code === 0 && d.data && d.data.report) {
        this.applyReport(d.data.report, { reportId: d.data.reportId });
        return;
      }
    } catch (e) {}
    this.generate(batchId);
  },

  async generate(batchId) {
    this._pollAborted = false;
    this.setData({ loading: true, emptyMsg: '', reportProgressVisible: true, reportProgressText: GEN_STAGES[0].text, reportStageIndex: 0, reportElapsedSec: 0, retryable: false });
    this.startProgressTicker(batchId);
    log.beginSession('report_generate_v2');
    try {
      let res;
      try {
        res = await log.timed('reportService', { batchId }, () =>
          wx.cloud.callFunction({ name: 'reportService', data: { batchId, userId: getOpenid() }, timeout: 600000 })
        );
      } catch (callErr) {
        const msg = callErr.message || String(callErr);
        if (isTimeoutError(msg)) {
          await this.pollReportUntilReady(batchId);
          return;
        }
        throw callErr;
      }
      this.stopProgressTicker();
      const d = res.result;
      if (d && d.code === 0) {
        if (d.data && d.data.report) {
          this.applyReport(d.data.report, { reportId: d.data.reportId });
        } else {
          this.setData({ loading: false, reportProgressVisible: false, emptyMsg: (d.data && d.data.message) || '本批暂无报告内容', retryable: false });
        }
      } else {
        this.setData({ loading: false, reportProgressVisible: false, emptyMsg: (d && d.message) || '报告生成失败，请重试', retryable: true });
      }
    } catch (e) {
      this.stopProgressTicker();
      const msg = e.message || '未知错误';
      if (isTimeoutError(msg) && !this._pollAborted) {
        await this.pollReportUntilReady(batchId);
        return;
      }
      this.setData({ loading: false, reportProgressVisible: false, emptyMsg: '报告生成失败：' + msg, retryable: true });
    }
  },

  async pollReportUntilReady(batchId) {
    const t0 = Date.now();
    while (!this._pollAborted) {
      await new Promise((r) => setTimeout(r, REPORT_POLL_MS));
      if (this._pollAborted) return;
      try {
        const res = await wx.cloud.callFunction({ name: 'reportService', data: { action: 'getByBatch', batchId, userId: getOpenid() } });
        const d = res.result;
        if (d && d.code === 0 && d.data && d.data.report) {
          this.stopProgressTicker();
          this.applyReport(d.data.report, { reportId: d.data.reportId });
          return;
        }
      } catch (e) {}
    }
  },

  // ============ 真实进度（watch 优先，降级轮询） ============
  stopProgressTicker() {
    if (this._progressTimer) { clearInterval(this._progressTimer); this._progressTimer = null; }
    if (this._elapsedTimer) { clearInterval(this._elapsedTimer); this._elapsedTimer = null; }
    if (this._watcher) { try { this._watcher.close(); } catch (_) {} this._watcher = null; }
  },

  startProgressTicker(batchId) {
    this.stopProgressTicker();
    const started = Date.now();
    const applyProgress = (p) => {
      if (!p || typeof p.stageIndex !== 'number') return;
      const stage = GEN_STAGES[Math.min(p.stageIndex, GEN_STAGES.length - 1)] || {};
      this.setData({ reportProgressText: p.detail || stage.text || '生成中…', reportStageIndex: Math.min(p.stageIndex, GEN_STAGES.length - 1) });
    };
    try {
      const db = wx.cloud.database();
      this._watcher = db.collection('batches').doc(batchId).watch({
        onChange: (snap) => { const doc = snap && snap.docs && snap.docs[0]; if (doc) applyProgress(doc.reportProgress); },
        onError: (err) => { console.warn('[report] watch 不可用，回退轮询:', (err && err.message) || err); this._watcher = null; this._startProgressPoll(batchId, applyProgress); },
      });
    } catch (e) { this._startProgressPoll(batchId, applyProgress); }
    this._elapsedTimer = setInterval(() => { this.setData({ reportElapsedSec: Math.floor((Date.now() - started) / 1000) }); }, 1000);
  },

  _startProgressPoll(batchId, applyProgress) {
    if (this._progressTimer) return;
    const tick = async () => {
      if (this._progressBusy) return;
      this._progressBusy = true;
      try {
        const res = await wx.cloud.callFunction({ name: 'reportService', data: { action: 'getProgress', batchId, userId: getOpenid() } });
        const d = res.result;
        const p = d && d.code === 0 && d.data ? d.data.progress : null;
        if (p) applyProgress(p);
      } catch (e) {}
      finally { this._progressBusy = false; }
    };
    tick();
    this._progressTimer = setInterval(tick, 2500);
  },

  // ============ 渲染 ============
  applyReport(report, extra) {
    const qs = (report.questions || []).map((q, i) => ({
      ...q,
      idx: i,
      text: unescapeUnderscore(String(q.questionText || '').replace(/\$[^$]*\$/g, '…')).slice(0, 42),
      patternMid: midPattern(q.pattern),
      ok: q.status !== '错',
    }));
    const correct = qs.filter((q) => q.ok).length;
    this.setData(Object.assign({
      report: {
        summary: report.summary || '',
        questions: qs,
        masteryChange: (report.masteryChange || []).map((m) => ({ ...m, beforePct: Math.round((m.before || 0) * 100), afterPct: Math.round((m.after || 0) * 100) })),
        pendingNodes: report.pendingNodes || [],
      },
      scoreMain: correct + (qs.length ? ' / ' + qs.length : ''),
      scoreSub: qs.length ? '共 ' + qs.length + ' 道' : '',
      loading: false,
      reportProgressVisible: false,
      retryable: false,
    }, extra || {}));
  },

  // ============ 逐题内联展开 ============
  toggleQuestion(e) {
    const qid = e.currentTarget.dataset.qid;
    if (!qid) return;
    if (this.data.activeQid === qid) { this.setData({ activeQid: null, detail: null }); return; }
    this.setData({ activeQid: qid, detail: null, advResult: null, advInsufficient: false });
    this.loadDetail(qid);
  },

  async loadDetail(qid) {
    try {
      const res = await wx.cloud.callFunction({ name: 'reportService', data: { action: 'questionDetail', questionId: qid, userId: getOpenid() } });
      const d = res.result;
      if (this.data.activeQid !== qid) return; // 已切换/收起
      if (d && d.code === 0 && d.data) {
        const dd = d.data;
        dd.questionNodes = renderMathText(unescapeUnderscore(dd.questionText || ''));
        const diag = dd.diagnosis || {};
        dd.diagComment = diag.comment || '';
        dd.diagInference = diag.inference || '';
        dd.diagHook = diag.hook || '';
        dd.patternMid = midPattern(dd.pattern);
        this.setData({ detail: dd });
      } else {
        this.setData({ activeQid: null });
        wx.showToast({ title: '题目读取失败', icon: 'none' });
      }
    } catch (e) {
      if (this.data.activeQid === qid) { this.setData({ activeQid: null }); }
      wx.showToast({ title: '题目读取失败', icon: 'none' });
    }
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
          if (d.data.accepted) { this.setData({ 'detail.patternMid': midPattern(proposal) }); }
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

  retry() {
    if (this.data.batchId) { this.loadReport(this.data.batchId); }
  },

  goBack() { wx.navigateBack(); },

  goDiagnose() { wx.navigateTo({ url: '/pages/photo/photo' }); },
});
