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
    view: 'list',
    reportList: [],
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
    // AI 参考过程异议（过程有误 → 重生成）
    refDisputeVisible: false,
    refDisputeText: '',
    refRegenerating: false,
  },

  async onLoad(options) {
    const batchId = options.batchId || '';
    if (batchId) {
      this.setData({ batchId, view: 'report' });
      this.loadReport(batchId);
    } else {
      this.loadBatchList();
    }
  },

  // 无 batchId：显示该用户的批次列表（报告历史）
  async loadBatchList() {
    this.setData({ loading: true, emptyMsg: '', noReport: false });
    try {
      const res = await wx.cloud.callFunction({ name: 'reportService', data: { action: 'listByUser', userId: getOpenid() } });
      const d = res.result;
      if (d && d.code === 0 && d.data && d.data.reports && d.data.reports.length) {
        this.setData({ loading: false, view: 'list', reportList: d.data.reports });
      } else {
        this.setData({ loading: false, noReport: true });
      }
    } catch (e) {
      this.setData({ loading: false, noReport: true });
    }
  },

  openBatch(e) {
    // WXML 用连字符 data-batch-id（→ dataset.batchId）；注意 data-batchId 驼峰会被微信转成全小写 batchid 而取不到
    const dataset = (e.currentTarget && e.currentTarget.dataset) || {};
    const batchId = dataset.batchId;
    log.append('report_openBatch', { batchId: batchId || '', datasetKeys: Object.keys(dataset) });
    if (!batchId) {
      // 不再静默早退：真机上要看得见（dataset 取错/老记录缺 batchId 都走这里）
      console.warn('[report] openBatch 缺少 batchId', dataset);
      wx.showToast({ title: '打开失败，请重试', icon: 'none' });
      return;
    }
    // 列表 → 详情：同页面两种视图，压一个带 batchId 的自己，返回时弹回列表
    wx.navigateTo({
      url: '/packageDiagnose/pages/report/report?batchId=' + batchId,
      fail: (err) => {
        console.error('[report] openBatch 跳转失败', err);
        wx.showModal({ title: '打开失败', content: JSON.stringify(err), showCancel: false });
      },
    });
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

  // ============ 渲染（2026-10-17 重组：四段结构）============
  applyReport(report, extra) {
    const DOT = { 对: { t: '✓', c: 'ok' }, 半对: { t: '△', c: 'mid' }, 错: { t: '✗', c: 'bad' }, 待判: { t: '–', c: 'na' } };
    const TYPE_WORD = { 选择: '选择', 填空: '填空', 解答: '解答题', 其他: '其他', 未知: '其他' };
    // katex-mini 遇到残缺公式（括号未闭合等）不抛错，而是把 "KaTeX parse error: ..." 塞进节点树，
    // 直接渲染会出现满屏红字（2026-10-18 第4题实测）。这里统一兜底：一旦出现该字样，
    // 就把公式还原成纯文本（去掉 $ 定界符），宁可难看也不要把报错糊到学生脸上。
    const md = (t) => {
      const raw = unescapeUnderscore(String(t || ''));
      let nodes;
      try { nodes = renderMathText(raw); } catch (e) { nodes = null; }
      const bad = !nodes || /KaTeX parse error/i.test(JSON.stringify(nodes));
      if (!bad) return nodes;
      const plainText = raw.replace(/\$\$?/g, '');
      return [{ type: 'text', text: plainText }];
    };
    const plain = (t) => unescapeUnderscore(String(t || '')).replace(/\$[^$]*\$/g, '').replace(/\s+/g, ' ').trim();

    const rawQs = report.questions || [];
    // ---- 逐题：把「你写的 / 标准做法 / 你停下的那一步」整理成可直接渲染的结构 ----
    const questions = rawQs.map((q, i) => {
      const st = DOT[q.status] ? q.status : '待判';
      const segs = Array.isArray(q.segments) ? q.segments : [];
      const broken = segs.filter((s) => s.status === '断' || s.status === '空白');
      const ref = Array.isArray(q.referenceProcess) ? q.referenceProcess : [];
      const refSteps = ref.map((s, k) => ({
        idx: k + 1,
        title: plain(s && s.step) || ('第 ' + (k + 1) + ' 步'),
        nodes: md(s && s.content),
      })).filter((s) => s.nodes && s.nodes.length);
      const full = Number(q.officialStandardScore || 0);
      const got = Number(q.officialScore || 0);
      const rate = q.officialClassScoreRate;
      return {
        questionId: q.questionId,
        idx: i,
        no: String(q.questionNo || i + 1),
        typeText: TYPE_WORD[q.questionType] || '其他',
        scoreText: full > 0 ? (got + '/' + full + ' 分') : (DOT[st].t + ' ' + st),
        scoreCls: got >= full && full > 0 ? 'ok' : (got > 0 ? 'mid' : 'bad'),
        classRateText: (rate != null && rate > 0) ? ('全班 ' + Math.round(rate * 100) + '% 做对') : '',
        textNodes: md(q.questionText),
        hasProcess: segs.length > 0,
        // 2026-10-18 用户反馈「我自己的答案我也看不到了」：
        //   报告页原先只认 segments（判定分段），但选择题/填空题没有分段，作答在 traceReport 里。
        //   官方客观题作答在 studentAnswer。两者都要展示，否则学生看不到自己写了什么。
        yourWork: plain(q.studentAnswer || '') || plain(q.traceReport || ''),
        yourWorkNodes: md(q.studentAnswer || q.traceReport || ''),
        noProcessText: '这题只填了答案，没写过程。',
        brokenCount: broken.length,
        // 只展示第一处断点，其余折叠（认知负荷：一次只展开一个）
        brokenSegs: broken.slice(0, 1).map((s) => ({
          cls: s.status === '断' ? 'bad' : 'gray',
          mark: s.status === '断' ? '✗' : '○',
          nodes: md(s.evidence || s.step),
        })),
        restBroken: broken.slice(1).map((s) => ({
          cls: s.status === '断' ? 'bad' : 'gray',
          mark: s.status === '断' ? '✗' : '○',
          nodes: md(s.evidence || s.step),
        })),
        // 对照：与学生断掉那处对位的标准做法（按段序号对位，越界取最后一步）
        refStep: (broken.length && refSteps.length)
          ? refSteps[Math.min(segs.indexOf(broken[0]), refSteps.length - 1)]
          : null,
        inferenceNodes: md((q.diagnosis && q.diagnosis.inference) || q.errorAttribution || ''),
        refSteps,
        moreOpen: false,
        refOpen: false,
      };
    });

    const total = questions.length;
    const okQs = questions.filter((q) => q.scoreCls === 'ok').length;
    const halfQs = questions.filter((q) => q.scoreCls === 'mid').length;
    const withProc = questions.filter((q) => q.hasProcess).length;

    // ---- ① 概览三句（不写空话；每句都指回数据）----
    const overview = [];
    overview.push({ k: '得分', nodes: md('这次 ' + total + ' 道题，其中 ' + okQs + ' 道拿满' + (halfQs ? '，' + halfQs + ' 道半对' : '') + '。') });
    if (withProc) {
      const worst = questions.filter((q) => q.brokenCount > 0).sort((a, b) => b.brokenCount - a.brokenCount)[0];
      overview.push({
        k: '过程',
        nodes: md('有 ' + withProc + ' 道写了过程' + (worst ? '，其中第 ' + worst.no + ' 题断的地方最多（' + worst.brokenCount + ' 处）。' : '，都走到了最后。')),
      });
    }
    const weakest = questions.slice().sort((a, b) => (a.scoreCls === 'bad' ? -1 : 0) - (b.scoreCls === 'bad' ? -1 : 0))[0];
    if (weakest && weakest.scoreCls !== 'ok') {
      overview.push({ k: '先看这题', nodes: md('第 ' + weakest.no + ' 题，' + weakest.scoreText + '。') });
    }

    // ---- ③ 接下来做什么：从「断掉的那处」生成动作，每条挂依据 ----
    const actions = [];
    questions.forEach((q) => {
      if (!q.hasProcess || !q.brokenCount) return;
      actions.push({
        idx: actions.length + 1,
        textNodes: md('把第 ' + q.no + ' 题断掉的那一步重写一遍。'),
        why: '这题有 ' + q.brokenCount + ' 处没写完，先补上第一处',
      });
    });

    // ---- ④ 你的记录：按知识点统计「考了几次、拿满几次」----
    // ⚠️ knowledgeNames 在【原始 q】上，加工后的 question 已不带它 → 这里用 rawQs 对齐取
    const tallyMap = {};
    questions.forEach((q, i) => {
      const src = rawQs[i] || {};
      const names = Array.isArray(src.knowledgeNames) ? src.knowledgeNames : [];
      names.forEach((n) => {
        const key = String(n || '').trim();
        if (!key) return;
        const e = tallyMap[key] = tallyMap[key] || { name: key, n: 0, win: 0 };
        e.n += 1;
        if (q.scoreCls === 'ok') e.win += 1;
      });
    });
    const tally = Object.values(tallyMap).sort((a, b) => b.n - a.n).slice(0, 12);

    const noProcess = questions.filter((q) => !q.hasProcess).map((q) => q.no);

    this.setData(Object.assign({
      activeTab: 's1',
      scrollTo: '',
      overview,
      questions,
      actions,
      tally,
      noProcessNums: noProcess.join('、'),
      report: {
        summary: report.summary || '',
        questions,
        masteryChange: (report.masteryChange || []).map((m) => ({ ...m, beforePct: Math.round((m.before || 0) * 100), afterPct: Math.round((m.after || 0) * 100) })),
        pendingNodes: report.pendingNodes || [],
        repeatMisses: report.repeatMisses || [],
        unitChanges: (report.unitChanges || []).map((u) => Object.assign({}, u, {
          aBeforeText: u.aBefore != null ? Number(u.aBefore).toFixed(2) : '—',
          aAfterText: u.aAfter != null ? Number(u.aAfter).toFixed(2) : '—',
          uBeforeText: u.uBefore != null ? Number(u.uBefore).toFixed(2) : '—',
          uAfterText: u.uAfter != null ? Number(u.uAfter).toFixed(2) : '—',
        })),
      },
      scoreMain: okQs + (total ? ' / ' + total : ''),
      scoreSub: total ? ('共 ' + total + ' 道' + (halfQs ? ' · 半对 ' + halfQs + ' 道' : '')) : '',
      loading: false,
      reportProgressVisible: false,
      retryable: false,
    }, extra || {}));
  },

  // 四段导航：点击滚动到对应段（scroll-view 用 scroll-into-view）
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab) return;
    // 先置空再设值，保证重复点同一段也能触发滚动
    this.setData({ activeTab: tab, scrollTo: '' }, () => {
      this.setData({ scrollTo: tab });
    });
  },

  // 折叠：其余断处 / 完整参考过程
  toggleMore(e) {
    const qid = e.currentTarget.dataset.qid;
    const questions = this.data.questions.map((q) => (q.questionId === qid ? { ...q, moreOpen: !q.moreOpen } : q));
    this.setData({ questions });
  },
  toggleRef(e) {
    const qid = e.currentTarget.dataset.qid;
    const questions = this.data.questions.map((q) => (q.questionId === qid ? { ...q, refOpen: !q.refOpen } : q));
    this.setData({ questions });
  },

  // ============ 逐题内联展开 ============
  toggleQuestion(e) {
    const qid = e.currentTarget.dataset.qid;
    if (!qid) return;
    if (this.data.activeQid === qid) { this.setData({ activeQid: null, detail: null }); return; }
    this.setData({ activeQid: qid, detail: null, advResult: null, advInsufficient: false, refRegenerating: false, refDisputeVisible: false });
    this.loadDetail(qid);
  },

  collapseDetail() { this.setData({ activeQid: null, detail: null }); },

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
        dd.diagCommentNodes = renderMathText(dd.diagComment);
        dd.diagInferenceNodes = renderMathText(dd.diagInference);
        dd.diagHookNodes = renderMathText(dd.diagHook);
        dd.patternMid = midPattern(dd.pattern);
        // AI 参考解题过程（2026-09-04）：仅判错展示；每步 content 含 LaTeX → 富文本节点；note 为逻辑说明
        const rawRef = Array.isArray(dd.referenceProcess) ? dd.referenceProcess : [];
        const wrongQ = !(dd.processScore != null && dd.processScore >= 1);
        dd.showRefProcess = wrongQ && rawRef.length > 0;
        dd.refSteps = this.buildRefSteps(rawRef);
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

  // AI 参考过程 → 富文本节点（判错题展示用）
  buildRefSteps(raw) {
    return (Array.isArray(raw) ? raw : []).map((s, i) => {
      const step = (s && String(s.step || '').trim()) || ('第 ' + (i + 1) + ' 步');
      return {
        titleNodes: renderMathText(unescapeUnderscore(step)),
        contentNodes: renderMathText(s && s.content ? unescapeUnderscore(String(s.content)) : ''),
        noteNodes: renderMathText(s && s.note ? unescapeUnderscore(String(s.note)) : ''),
        hasNote: !!(s && String(s.note || '').trim()),
      };
    });
  },

  // ============ AI 参考过程异议（过程有误 → 重生成） ============
  openRefDispute() {
    if (this.data.refRegenerating) return;
    this.setData({ refDisputeVisible: true, refDisputeText: '' });
  },
  closeRefDispute() { this.setData({ refDisputeVisible: false }); },
  onRefDisputeInput(e) { this.setData({ refDisputeText: e.detail.value }); },
  async submitRefDispute() {
    const reason = (this.data.refDisputeText || '').trim();
    const questionId = this.data.detail && this.data.detail.questionId;
    if (!reason || !questionId) return;
    this.setData({ refDisputeVisible: false, refRegenerating: true });
    try {
      const res = await wx.cloud.callFunction({ name: 'reportService', data: { action: 'regenerateProcess', questionId, reason, userId: getOpenid() } });
      const d = res.result;
      if (d && d.code === 0 && d.data && Array.isArray(d.data.process)) {
        const dd = this.data.detail || {};
        dd.refSteps = this.buildRefSteps(d.data.process);
        dd.showRefProcess = true;
        this.setData({ detail: dd, refRegenerating: false });
        wx.showToast({ title: '已重新生成', icon: 'success' });
      } else {
        this.setData({ refRegenerating: false, refDisputeVisible: true });
        wx.showToast({ title: (d && d.message) || '重生成失败', icon: 'none' });
      }
    } catch (e) {
      this.setData({ refRegenerating: false, refDisputeVisible: true });
      wx.showToast({ title: '网络异常，请重试', icon: 'none' });
    }
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
