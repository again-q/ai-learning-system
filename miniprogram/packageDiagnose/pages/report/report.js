const towxml = require('../../towxml/index.js');
const log = require('../../../utils/upload-log');
const { renderMathText } = require('../../utils/latex');
const app = getApp();

// 长请求无真实流式进度：按耗时推进阶段文案（不做百分比假进度条）
// 网关 ~60s 会掐 callFunction，但前端不因超时失败：一直轮询直到拿到报告或离开页面
const GEN_STAGES = [
  { afterSec: 0, text: '整理本次答题数据…' },
  { afterSec: 6, text: '检索历史同类题与错误模式…' },
  { afterSec: 16, text: '定位薄弱点与断点…' },
  { afterSec: 28, text: '撰写诊断报告…' },
  { afterSec: 45, text: '润色与校验…' },
  { afterSec: 70, text: '仍在生成，请再稍候…' },
  { afterSec: 100, text: '云端还在跑，继续等待…' },
  { afterSec: 180, text: '生成时间较长，请勿退出…' },
  { afterSec: 300, text: '仍在等待云端写完报告…' },
];

const REPORT_POLL_MS = 4000;

function parseScore(anchor) {
  const s = String(anchor || '');
  const m = s.match(/(\d+)\s*道.*?(\d+)\s*道.*?([\d.]+)\s*%/);
  if (m) {
    const last = s.match(/上次\s*([\d.]+)\s*%/);
    return {
      scoreMain: `${m[2]}/${m[1]}`,
      scoreSub: last ? `${m[3]}% · 上次 ${last[1]}%` : `${m[3]}%`,
    };
  }
  const m2 = s.match(/正确率\s*([\d.]+)\s*%/);
  return { scoreMain: m2 ? `${m2[1]}%` : (s.slice(0, 12) || '本次'), scoreSub: '' };
}

/** 旧报告清洗：空白禁「未理解」；钩子最多 2 问；极长正文才截 */
function clipText(s, max) {
  const t = String(s || '').trim();
  if (!t) return { text: '', clipped: false, full: '' };
  if (t.length <= max) return { text: t, clipped: false, full: t };
  return { text: t.slice(0, max) + '…', clipped: true, full: t };
}

function sanitizeReport(report) {
  if (!report) return report;
  const r = report;
  (r.weakpoints || []).forEach((wp) => {
    if (wp.hook && Array.isArray(wp.hook.questions) && wp.hook.questions.length > 2) {
      wp.hook.questions = wp.hook.questions.slice(0, 2);
    }
    const bp = wp.breakpoint || {};
    const noProcess = bp.processAvailable === false || !((bp.segments || []).length);
    const rc = wp.rootcause;
    if (rc && rc.directCause && /未理解|没理解/.test(rc.directCause)) {
      if (noProcess) {
        rc.directCause =
          '整题未见下笔（起步即停）。同卷若有同类题做过，更可能是「这一次没启动」，原因待你对照——不宜直接当成「不会」。';
      } else {
        rc.directCause = String(rc.directCause).replace(/未理解[^。；\n]*/g, '该步未完成（原因待确认）');
      }
    }
    // 卡点/根因：保留较完整正文（仅极长才截）
    if (bp.confirmed) {
      const c = clipText(bp.confirmed, 220);
      bp.confirmedShort = c.text;
      bp.confirmedClipped = c.clipped;
    }
    if (bp.contradiction) {
      const c = clipText(bp.contradiction, 280);
      bp.contradictionShort = c.text;
      bp.contradictionClipped = c.clipped;
    }
    if (bp.closing) {
      bp.closingShort = clipText(bp.closing, 120).text;
    }
    if (rc) {
      if (rc.directCause) {
        const c = clipText(rc.directCause, 200);
        rc.directCauseShort = c.text;
        rc.directCauseClipped = c.clipped;
      }
      if (rc.phenomenon) rc.phenomenonShort = clipText(rc.phenomenon, 160).text;
      if (rc.closing) rc.closingShort = clipText(rc.closing, 120).text;
      if (Array.isArray(rc.sources)) {
        rc.sourcesShort = rc.sources.slice(0, 3).map((s) => clipText(s, 140).text);
      }
    }
  });
  return r;
}

function getOpenid() {
  const fromKey = wx.getStorageSync('openid');
  if (fromKey) return fromKey;
  const user = wx.getStorageSync('userInfo') || (getApp().globalData && getApp().globalData.userInfo) || {};
  return user._openid || '';
}

function isTimeoutError(msg) {
  return /timeout|timed out|TIME_LIMIT|ESOCKETTIMEDOUT|-501002/i.test(msg || '');
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
    qlistExpanded: false,
    deepVisible: false,
    bpMore: false,
    scoreMain: '',
    scoreSub: '',
    wrongBriefs: [],
    mainPatternName: '',
  },

  applyReport(raw, extra) {
    const report = sanitizeReport(this.renderFormulas(raw));
    const score = parseScore((report.overview && report.overview.dataAnchor) || '');
    const patterns = (report.overview && report.overview.patterns) || [];
    const main = patterns.find((p) => p && p.isMain) || patterns[0];
    const wrongBriefs = (report.questions || [])
      .map((q, idx) => ({
        idx,
        status: q.status,
        pattern: q.pattern || '',
        text: String(q.questionText || '').replace(/\$[^$]*\$/g, '…').slice(0, 40),
      }))
      .filter((q) => q.status === '错');
    const base = {
      report,
      loading: false,
      reportProgressVisible: false,
      activeStep: 1,
      activeWpIndex: 0,
      qlistExpanded: false,
      deepVisible: false,
      bpMore: false,
      scoreMain: score.scoreMain,
      scoreSub: score.scoreSub,
      wrongBriefs,
      mainPatternName: (main && main.name) || ((report.weakpoints || [])[0] && (report.weakpoints || [])[0].name) || '',
    };
    const merged = Object.assign(base, extra || {});
    const wps = report.weakpoints || [];
    const wi = Math.min(Math.max(0, Number(merged.activeWpIndex) || 0), Math.max(0, wps.length - 1));
    merged.activeWpIndex = wi;
    merged.currentWp = wps[wi] || null;
    this.setData(merged);
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
    this._pollAborted = true;
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
        this.applyReport(d.data.report, { reportId: d.data.reportId });
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
    this._pollAborted = false;
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
      let res;
      try {
        res = await log.timed('reportService', { batchId }, () =>
          wx.cloud.callFunction({
            name: 'reportService',
            data: { batchId, userId: openid },
            timeout: 600000,
          })
        );
      } catch (callErr) {
        const msg = callErr.message || String(callErr);
        // 网关超时：不失败，进度条不中断，一直轮询到拿到报告（或离开页面）
        if (isTimeoutError(msg)) {
          log.append('report_generate_wait', { batchId, error: msg });
          const polled = await this.pollReportUntilReady(batchId, openid);
          if (polled || this._pollAborted) return;
          // 只有页面已离开才会走到这；不当失败展示
          return;
        }
        throw callErr;
      }
      this.stopProgressTicker();
      const d = res.result;
      if (d && d.code === 0) {
        if (d.data && d.data.report) {
          this.applyReport(d.data.report, { reportId: d.data.reportId });
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
      // 超时类错误不应落到这里；若仍落到，也转去轮询而不是报失败
      if (isTimeoutError(msg) && !this._pollAborted) {
        log.append('report_generate_wait_fallback', { batchId, error: msg });
        const polled = await this.pollReportUntilReady(batchId, getOpenid());
        if (polled || this._pollAborted) return;
        return;
      }
      this.setData({
        loading: false,
        reportProgressVisible: false,
        emptyMsg: '报告生成失败：' + msg,
        retryable: true,
      });
      log.append('report_generate_error', { batchId, error: msg });
    }
  },

  // 一直轮询到拿到报告；仅离开页面时停止（不设超时上限）
  async pollReportUntilReady(batchId, openid) {
    const t0 = Date.now();
    while (!this._pollAborted) {
      await new Promise((r) => setTimeout(r, REPORT_POLL_MS));
      if (this._pollAborted) return false;
      try {
        const res = await wx.cloud.callFunction({
          name: 'reportService',
          data: { action: 'getByBatch', batchId, userId: openid },
        });
        const d = res.result;
        if (d && d.code === 0 && d.data && d.data.report) {
          this.stopProgressTicker();
          this.applyReport(d.data.report, { reportId: d.data.reportId });
          log.append('report_generate_ok_poll', {
            batchId,
            reportId: d.data.reportId,
            waitedMs: Date.now() - t0,
          });
          return true;
        }
        log.append('report_generate_poll_miss', { batchId, waitedMs: Date.now() - t0 });
      } catch (e) {
        log.append('report_generate_poll_err', {
          batchId,
          waitedMs: Date.now() - t0,
          error: e.message || String(e),
        });
      }
    }
    return false;
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
        this.applyReport(d.data.report, {
          reportId: d.data.reportId,
          batchId: batch || '',
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
    if (this.data.activeStep >= 3) return;
    this.setData({ activeStep: this.data.activeStep + 1, bpMore: false });
  },

  unlockPrev() {
    if (this.data.activeStep <= 1) return;
    this.setData({ activeStep: this.data.activeStep - 1, bpMore: false });
  },

  collapseDeep() {
    this.setData({ deepVisible: false, bpMore: false });
    wx.pageScrollTo({ scrollTop: 0, duration: 240 });
  },

  toggleQlist() {
    this.setData({ qlistExpanded: !this.data.qlistExpanded });
  },

  toggleBpMore() {
    this.setData({ bpMore: !this.data.bpMore });
  },

  onStartDeep() {
    if (!this.data.deepVisible) {
      this.setData({ deepVisible: true, activeStep: 1, bpMore: false });
    }
    setTimeout(() => {
      wx.pageScrollTo({ selector: '#report-deep', duration: 280 });
    }, 50);
  },

  switchWp(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const wp = (this.data.report && this.data.report.weakpoints) || [];
    if (idx < 0 || idx >= wp.length) return;
    this.setData({
      activeWpIndex: idx,
      currentWp: wp[idx],
      activeStep: 1,
      bpMore: false,
      deepVisible: true,
    });
  },

  // ===== 异议 =====
  onDisputeTap(e) {
    const { module, index } = e.currentTarget.dataset;
    this.setData({
      disputeVisible: true,
      disputeTarget: { moduleKey: module, index: Number(index) },
    });
  },
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
        this.applyReport(d.data.report, {
          reportId: this.data.reportId,
          regenerating: false,
          deepVisible: this.data.deepVisible,
          activeStep: this.data.activeStep,
          activeWpIndex: this.data.activeWpIndex,
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

  goQuestionEvolution(e) {
    const d = e.currentTarget.dataset || {};
    const batch = this.data.batchId || '';
    const url = '/packageDiagnose/pages/pattern-trajectory/pattern-trajectory?batch=' + encodeURIComponent(batch)
      + '&qt=' + encodeURIComponent(d.qt || '')
      + '&qtype=' + encodeURIComponent(d.type || '')
      + '&score=' + encodeURIComponent(d.score == null ? '' : String(d.score));
    wx.navigateTo({ url });
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
      return renderMathText(text) || [];
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
