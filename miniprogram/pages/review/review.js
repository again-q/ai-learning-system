// 复核页：一次复核（题目转录确认）→ 二次复核（参数确认）→ 完成
const app = getApp();
const log = require('../../utils/upload-log');

Page({
  data: {
    batchId: '',
    stage: 'transcribe',   // transcribe | params | done
    items: [],
    loading: true,
    analyzing: false,
    progressText: '',
    finishing: false,
    editMode: '',          // '' | question | params
    editIndex: -1,
    editValue: '',
    editTrace: '',
    editD: '',
    editK: '',
  },

  onLoad(options) {
    const batchId = options.batchId || '';
    this.setData({ batchId });
    if (batchId) this.loadQuestions();
    else {
      this.setData({ loading: false });
      wx.showToast({ title: '缺少批次', icon: 'none' });
    }
  },

  // towxml 渲染兜底：失败回退纯文本
  renderMd(text) {
    if (!text) return {};
    try {
      const d = app.towxml(text, 'markdown');
      return d && d.child ? d : {};
    } catch (e) {
      console.error('[review] towxml render failed:', e.message);
      return {};
    }
  },

  loadQuestions() {
    wx.cloud.callFunction({
      name: 'judgeOne',
      data: { action: 'listQuestions', batchId: this.data.batchId },
    }).then((res) => {
      const r = res.result;
      if (r.code !== 0) throw new Error(r.message);
      const items = (r.data || []).map((q) => ({
        ...q,
        traceText: q.traceReport || '',
        traceOpen: false,
        article: this.renderMd(q.questionText),
        traceArticle: this.renderMd(q.traceReport),
      }));
      this.setData({ items, loading: false });
      log.append('review_load', { count: items.length, batchId: this.data.batchId });
    }).catch((e) => {
      console.error('[review] load failed:', e);
      log.append('review_load_fail', { error: e.message || String(e), batchId: this.data.batchId });
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败：' + (e.message || '网络错误'), icon: 'none' });
    });
  },

  /* ---------- 一次复核 ---------- */
  onEditQuestion(e) {
    const idx = e.currentTarget.dataset.index;
    this.setData({
      editMode: 'question', editIndex: idx,
      editValue: this.data.items[idx].questionText || '',
      editTrace: this.data.items[idx].traceReport || '',
    });
  },

  onEditInput(e) {
    this.setData({ editValue: e.detail.value });
  },

  onEditTraceInput(e) {
    this.setData({ editTrace: e.detail.value });
  },

  onSaveQuestion() {
    const idx = this.data.editIndex;
    const text = (this.data.editValue || '').trim();
    const trace = (this.data.editTrace || '').trim();
    if (!text) { wx.showToast({ title: '题目不能为空', icon: 'none' }); return; }
    const item = this.data.items[idx];
    wx.cloud.callFunction({
      name: 'judgeOne',
      data: {
        action: 'updateTranscription',
        questionId: item.questionId,
        questionText: text,
        traceReport: trace,
      },
    }).then((res) => {
      if (res.result.code !== 0) throw new Error(res.result.message);
      const items = this.data.items.slice();
      items[idx] = {
        ...items[idx],
        questionText: text,
        traceReport: trace,
        traceText: trace,
        transcriptionReviewed: true,
        article: app.towxml(text, 'markdown'),
        traceArticle: this.renderMd(trace),
      };
      this.setData({ items, editMode: '' });
      log.append('transcription_saved', { questionId: item.questionId, len: text.length, traceLen: trace.length });
      wx.showToast({ title: '已保存', icon: 'success' });
    }).catch((e) => {
      wx.showToast({ title: '保存失败：' + (e.message || '网络错误'), icon: 'none' });
    });
  },

  onStartAnalyze() {
    if (this.data.analyzing) return;
    const pending = this.data.items;
    if (!pending.length) return;
    this.setData({ analyzing: true, progressText: '0/' + pending.length });
    log.append('analyze_start', { total: pending.length, questionIds: pending.map(q => q.questionId) });
    // 逐题判定（judgeOne judge），并发 2
    const queue = pending.slice();
    let done = 0, failed = 0;
    const worker = async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        try {
          await wx.cloud.callFunction({
            name: 'judgeOne',
            data: { questionId: item.questionId },
            timeout: 120000,
          });
        } catch (e) {
          failed++;
          console.error('[review] judgeOne failed:', item.questionId, e);
          log.append('judge_fail', { questionId: item.questionId, error: e.message || String(e) });
        }
        log.append('judge_done', { questionId: item.questionId });
        done++;
        this.setData({ progressText: done + '/' + pending.length });
      }
    };
    Promise.all([worker(), worker()]).then(() => {
      log.append('analyze_done', { total: pending.length, failed });
      if (failed > 0) {
        wx.showToast({ title: failed + ' 题分析失败', icon: 'none' });
      }
      // 进入二次复核：重新拉取参数
      return this.loadQuestionsForParams();
    });
  },

  loadQuestionsForParams() {
    return wx.cloud.callFunction({
      name: 'judgeOne',
      data: { action: 'listQuestions', batchId: this.data.batchId },
    }).then((res) => {
      const r = res.result;
      if (r.code !== 0) throw new Error(r.message);
      const items = (r.data || []).map((q) => ({
        ...q,
        article: this.renderMd(q.questionText),
      }));
      this.setData({ items, stage: 'params', analyzing: false });
      log.append('params_loaded', { count: items.length });
    }).catch((e) => {
      console.error('[review] load params failed:', e);
      log.append('params_load_fail', { error: e.message || String(e) });
      this.setData({ analyzing: false });
      wx.showToast({ title: '参数加载失败', icon: 'none' });
    });
  },

  /* ---------- 二次复核 ---------- */
  onEditParams(e) {
    const idx = e.currentTarget.dataset.index;
    const item = this.data.items[idx];
    this.setData({
      editMode: 'params', editIndex: idx,
      editD: item.difficultyValue != null ? (item.difficultyLevel || '') + ' ' + item.difficultyValue : '',
      editK: item.knowledgeNodeName || '',
    });
  },

  onEditDInput(e) { this.setData({ editD: e.detail.value }); },
  onEditKInput(e) { this.setData({ editK: e.detail.value }); },

  onSaveParams() {
    const idx = this.data.editIndex;
    const item = this.data.items[idx];
    const params = {};
    const d = (this.data.editD || '').trim();
    if (d) {
      const m = d.match(/^L(\d{1,2})\s+([0-9]*\.?[0-9]+)$/);
      if (m) {
        params.difficultyLevel = 'L' + m[1];
        const v = parseFloat(m[2]);
        if (!isNaN(v) && v > 0 && v < 1) params.difficultyValue = v;
      } else {
        wx.showToast({ title: '难度格式：Lx D值（如 L7 0.82）', icon: 'none' });
        return;
      }
    }
    const k = (this.data.editK || '').trim();
    if (k) params.knowledgeNodeName = k;
    if (!Object.keys(params).length) { wx.showToast({ title: '没有修改内容', icon: 'none' }); return; }

    wx.cloud.callFunction({
      name: 'judgeOne',
      data: { action: 'updateParams', questionId: item.questionId, params },
    }).then((res) => {
      if (res.result.code !== 0) throw new Error(res.result.message);
      const items = this.data.items.slice();
      items[idx] = { ...items[idx], ...params, paramsReviewed: true };
      this.setData({ items, editMode: '' });
      log.append('params_saved', { questionId: item.questionId, params });
      wx.showToast({ title: '已保存', icon: 'success' });
    }).catch((e) => {
      wx.showToast({ title: '保存失败：' + (e.message || '网络错误'), icon: 'none' });
    });
  },

  onFinish() {
    if (this.data.finishing) return;
    log.append('review_finish', { count: this.data.items.length });
    this.setData({ finishing: true });
    setTimeout(() => {
      this.setData({ finishing: false, stage: 'done' });
    }, 400);
  },

  onToggleTrace(e) {
    const idx = e.currentTarget.dataset.index;
    const items = this.data.items.slice();
    items[idx] = { ...items[idx], traceOpen: !items[idx].traceOpen };
    this.setData({ items });
  },

  /* ---------- 通用 ---------- */
  onBackTap() {
    if (this.data.analyzing) {
      wx.showToast({ title: '分析中，请稍候', icon: 'none' });
      return;
    }
    wx.navigateBack();
  },

  onBackHome() {
    wx.switchTab({ url: '/pages/index/index' }).catch(() => {
      wx.reLaunch({ url: '/pages/index/index' });
    });
  },

  onViewReport() {
    if (!this.data.batchId) {
      wx.showToast({ title: '缺少批次信息', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/report/report?batchId=' + this.data.batchId });
  },

  closeEdit() { this.setData({ editMode: '' }); },
  noop() {},
});
