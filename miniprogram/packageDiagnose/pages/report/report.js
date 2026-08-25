const towxml = require('../../towxml/index.js');
const log = require('../../../utils/upload-log');
const app = getApp();

// 长请求无真实流式进度：按耗时推进阶段文案（不做百分比假进度条）
const GEN_STAGES = [
  { afterSec: 0, text: '整理本次答题数据…' },
  { afterSec: 6, text: '检索历史同类题与错误模式…' },
  { afterSec: 16, text: '定位薄弱点与断点…' },
  { afterSec: 28, text: '撰写诊断报告…' },
  { afterSec: 45, text: '润色与校验…' },
  { afterSec: 70, text: '仍在生成，请再稍候…' },
];

function getOpenid() {
  const fromKey = wx.getStorageSync('openid');
  if (fromKey) return fromKey;
  const user = wx.getStorageSync('userInfo') || (getApp().globalData && getApp().globalData.userInfo) || {};
  return user._openid || '';
}

Page({
  data: {
    loading: true,
    emptyMsg: '',
    report: null,
    reportId: null,
    batchId: null,
    disputeVisible: false,
    disputeTarget: null,   // { moduleKey, index }
    historyVisible: false,
    historyList: [],
    historyLoading: false,
    reportProgressVisible: false,
    reportProgressText: '',
    reportElapsedSec: 0,
    reportStageIndex: 0,
    genStages: GEN_STAGES,
    regenerating: false,   // 异议重生成：页内提示，避免与系统 Loading 叠层
    retryable: false,
    // 报告渐进展示：先断点 → 根因 → 钩子 → 检验，避免一口气展示全部
    activeStep: 1,
    activeWpIndex: 0,
    currentWp: null,
  },

  onLoad(options) {
    const batchId = options.batchId || (app.globalData && app.globalData.currentBatchId) || '';
    this.setData({ batchId });
    if (!batchId) {
      this.setData({ historyVisible: true });
      this.loadHistory();
      return;
    }
    this.loadReport(batchId);
  },

  onUnload() {
    this.stopProgressTicker();
  },

  stopProgressTicker() {
    if (this._progressTimer) {
      clearInterval(this._progressTimer);
      this._progressTimer = null;
    }
  },

  startProgressTicker() {
    this.stopProgressTicker();
    const started = Date.now();
    const tick = () => {
      const sec = Math.floor((Date.now() - started) / 1000);
      let stage = GEN_STAGES[0];
      let stageIndex = 0;
      for (let i = 0; i < GEN_STAGES.length; i++) {
        if (sec >= GEN_STAGES[i].afterSec) {
          stage = GEN_STAGES[i];
          stageIndex = i;
        }
      }
      this.setData({
        reportElapsedSec: sec,
        reportProgressText: stage.text,
        reportStageIndex: stageIndex,
      });
    };
    tick();
    this._progressTimer = setInterval(tick, 1000);
  },

  // 读该批次最新报告；无则触发生成
  async loadReport(batchId) {
    this.setData({
      loading: true,
      emptyMsg: '',
      reportProgressVisible: false,
      reportProgressText: '读取报告…',
      retryable: false,
    });
    const openid = getOpenid();
    const t0 = Date.now();
    log.append('report_load_start', { batchId });
    try {
      const res = await wx.cloud.callFunction({
        name: 'reportService',
        data: { action: 'getByBatch', batchId, userId: openid },
      });
      const d = res.result;
      if (d && d.code === 0 && d.data && d.data.report) {
        const report = this.renderFormulas(d.data.report);
        this.setData({
          report,
          reportId: d.data.reportId,
          loading: false,
          activeStep: 1,
          activeWpIndex: 0,
          currentWp: (report.weakpoints || [])[0] || null,
        });
        log.append('report_load_hit', { batchId, reportId: d.data.reportId, durationMs: Date.now() - t0 });
      } else {
        log.append('report_load_miss', { batchId, durationMs: Date.now() - t0 });
        this.generate(batchId);
      }
    } catch (e) {
      log.append('report_load_fail', { batchId, durationMs: Date.now() - t0, error: e.message || String(e) });
      this.setData({
        loading: false,
        emptyMsg: '报告读取失败：' + (e.message || '未知错误'),
        retryable: true,
      });
    }
  },

  async generate(batchId) {
    this.setData({
      loading: true,
      emptyMsg: '',
      reportProgressVisible: true,
      reportProgressText: GEN_STAGES[0].text,
      reportElapsedSec: 0,
      reportStageIndex: 0,
      retryable: false,
    });
    this.startProgressTicker();
    log.beginSession('report_generate');
    log.append('report_generate_start', { batchId });
    try {
      const openid = getOpenid();
      const res = await log.timed('reportService', { batchId }, () =>
        wx.cloud.callFunction({
          name: 'reportService',
          data: { batchId, userId: openid },
          timeout: 180000,
        })
      );
      this.stopProgressTicker();
      const d = res.result;
      if (d && d.code === 0) {
        if (d.data && d.data.report) {
          const report = this.renderFormulas(d.data.report);
          this.setData({
            report,
            reportId: d.data.reportId,
            loading: false,
            reportProgressVisible: false,
            activeStep: 1,
            activeWpIndex: 0,
            currentWp: (report.weakpoints || [])[0] || null,
          });
          log.append('report_generate_ok', { batchId, reportId: d.data.reportId });
        } else {
          this.setData({
            loading: false,
            reportProgressVisible: false,
            emptyMsg: (d.data && d.data.message) || '本批暂无需要生成的报告内容',
            retryable: false,
          });
          log.append('report_generate_empty', { batchId, message: (d.data && d.data.message) || '' });
        }
      } else {
        this.setData({
          loading: false,
          reportProgressVisible: false,
          emptyMsg: (d && d.message) || '报告生成失败，请重试',
          retryable: true,
        });
        log.append('report_generate_fail', { batchId, message: (d && d.message) || '' });
      }
    } catch (e) {
      this.stopProgressTicker();
      const msg = e.message || '未知错误';
      const tip = /timeout|timed out|TIME_LIMIT/i.test(msg)
        ? '生成超时了。网络或模型较慢时可能发生，点下方重试即可。'
        : ('报告生成失败：' + msg);
      this.setData({
        loading: false,
        reportProgressVisible: false,
        emptyMsg: tip,
        retryable: true,
      });
      log.append('report_generate_error', { batchId, error: msg });
    }
  },

  onRetry() {
    if (this.data.batchId) this.generate(this.data.batchId);
  },

  // ===== 历史报告 =====
  showHistory() {
    this.setData({ historyVisible: true });
    if (!this.data.historyList.length) this.loadHistory();
  },

  hideHistory() {
    this.setData({ historyVisible: false });
  },

  async loadHistory() {
    this.setData({ historyLoading: true, emptyMsg: '' });
    try {
      const openid = getOpenid();
      const res = await wx.cloud.callFunction({
        name: 'reportService',
        data: { action: 'listByUser', userId: openid },
      });
      const d = res.result;
      if (d && d.code === 0) {
        this.setData({
          historyList: (d.data && d.data.reports) || [],
          historyLoading: false,
          loading: false,
        });
        if (!this.data.historyList.length) {
          this.setData({ emptyMsg: '暂无历史报告' });
        }
      } else {
        this.setData({ historyLoading: false, emptyMsg: (d && d.message) || '历史报告加载失败' });
      }
    } catch (e) {
      this.setData({ historyLoading: false, emptyMsg: '历史报告加载失败：' + (e.message || '未知错误') });
    }
  },

  async openHistory(e) {
    const { id, batch } = e.currentTarget.dataset;
    if (!id) return;
    this.setData({ loading: true, historyVisible: false, emptyMsg: '' });
    try {
      const openid = getOpenid();
      const res = await wx.cloud.callFunction({
        name: 'reportService',
        data: { action: 'getById', reportId: id, userId: openid },
      });
      const d = res.result;
      if (d && d.code === 0 && d.data && d.data.report) {
        const report = this.renderFormulas(d.data.report);
        this.setData({
          report,
          reportId: d.data.reportId,
          batchId: batch || '',
          loading: false,
          activeStep: 1,
          activeWpIndex: 0,
          currentWp: (report.weakpoints || [])[0] || null,
        });
        log.append('history_report_opened', { reportId: d.data.reportId, batchId: batch || '' });
      } else {
        this.setData({ loading: false, emptyMsg: (d && d.message) || '报告读取失败' });
      }
    } catch (e) {
      this.setData({ loading: false, emptyMsg: '报告读取失败：' + (e.message || '未知错误') });
    }
  },

  // ===== 报告渐进展示 =====
  unlockNext() {
    if (this.data.activeStep >= 4) return;
    this.setData({ activeStep: this.data.activeStep + 1 });
  },

  switchWp(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const wp = (this.data.report && this.data.report.weakpoints) || [];
    if (idx < 0 || idx >= wp.length) return;
    this.setData({ activeWpIndex: idx, currentWp: wp[idx], activeStep: 1 });
  },

  // ===== 异议 =====
  onDispute(e) {
    this.setData({ disputeVisible: true, disputeTarget: e.detail });
  },
  onDisputeCancel() {
    this.setData({ disputeVisible: false, disputeTarget: null });
  },
  async onDisputeSubmit(e) {
    const { reason } = e.detail;
    const target = this.data.disputeTarget;
    if (!target || !this.data.reportId) return;
    this.setData({ disputeVisible: false, regenerating: true });
    try {
      const openid = getOpenid();
      const res = await wx.cloud.callFunction({
        name: 'reportService',
        data: {
          action: 'disputeModule',
          reportId: this.data.reportId,
          batchId: this.data.batchId,
          moduleKey: target.moduleKey,
          index: target.index,
          reason,
          userId: openid,
        },
        timeout: 120000,
      });
      const d = res.result;
      if (d && d.code === 0 && d.data && d.data.report) {
        const report = this.renderFormulas(d.data.report);
        const wp = (report.weakpoints || []);
        this.setData({
          report,
          currentWp: wp[this.data.activeWpIndex] || wp[0] || null,
          regenerating: false,
        });
        wx.showToast({ title: '已重新生成', icon: 'success' });
      } else {
        this.setData({ regenerating: false });
        wx.showToast({ title: (d && d.message) || '重新生成失败', icon: 'none' });
      }
    } catch (err) {
      this.setData({ regenerating: false });
      wx.showToast({ title: '重新生成失败', icon: 'none' });
    }
  },

  // 检验完成按钮 → 记录（MVP：toast 提示，回访记录后续接）
  onCheckDone(e) {
    const btn = e.currentTarget.dataset.btn;
    wx.showToast({ title: '已记录：「' + btn + '」', icon: 'none' });
  },

  goBack() {
    // 从某份报告进入历史列表后，返回键先回到当前报告，而不是直接离开页面
    if (this.data.historyVisible && this.data.batchId && this.data.report) {
      this.hideHistory();
      return;
    }
    wx.navigateBack({ delta: 1 });
  },

  // 公式混排：utils/latex → rich-text nodes（失败回退纯文本节点）
  renderMd(text) {
    if (!text) return [];
    try {
      return app.renderMathText(text) || [];
    } catch (e) {
      console.error('[report] renderMathText failed:', e.message);
      return [{ type: 'text', text: String(text) }];
    }
  },

  // 报告里含公式的字段转 nodes（题目情况/过程证据/断点矛盾；其余文案先纯文本）
  renderFormulas(report) {
    const r = report;
    if (!r) return r;
    (r.questions || []).forEach((q) => {
      q.questionNodes = this.renderMd(q.questionText);
    });
    (r.weakpoints || []).forEach((wp) => {
      ((wp.breakpoint && wp.breakpoint.segments) || []).forEach((seg) => {
        seg.evidenceNodes = this.renderMd(seg.evidence);
      });
      if (wp.breakpoint && wp.breakpoint.contradiction) {
        wp.breakpoint.contradictionNodes = this.renderMd(wp.breakpoint.contradiction);
      }
    });
    return r;
  },
});
