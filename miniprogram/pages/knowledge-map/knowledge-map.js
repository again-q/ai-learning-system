const app = getApp();
let sys = wx.getSystemInfoSync();

// rpx → px
const rpx = (v) => (sys.windowWidth / 750) * v;

// 类型标签
const TYPE_LABEL = {
  definition: '概念', property: '性质', method: '方法',
  notation: '记号', example: '例子', reading: '阅读', section: '小节', unit: '单元'
};

// 掌握度 mock（待诊断链路接入 knowledge_progress 后移除）
const MOCK_MASTERY = {
  '集合': 82, '元素': 90, '确定性': 76, '互异性': 88, '集合相等': 64,
  '字母表示': 55, '属于与不属于': 70, '常用数集': 92, '列举法': 45,
  '描述法': 38, '无序性': 80, '子集': 75, '真子集': 58, '空集': 71,
  '命题': 61, '充分条件': 42, '必要条件': 40, '充要条件': 35,
  '量词': 53, '命题的否定': 39, '并集的概念与定义': 60, '交集的概念与定义': 58
};
function mockMastery(name) {
  if (MOCK_MASTERY[name] != null) return MOCK_MASTERY[name];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 997;
  return 20 + (h % 60);
}
function mColor(m) { return m >= 75 ? '#34c759' : m >= 50 ? '#ff9500' : m > 0 ? '#ff3b30' : '#c7c7cc'; }
function mStatus(m) { return m >= 75 ? '已掌握' : m >= 50 ? '学习中' : m > 0 ? '薄弱' : '未学'; }

Page({
  data: {
    loading: true,
    mode: 'radial',        // radial | evo
    nodes: [],
    crumb: [],
    info: null,
    infoExpanded: false,   // 详情展开/收起
    showUp: false,
    showEvoReturn: false,
    stageSize: { w: 375, h: 600 }
  },

  _nodes: [], _byId: {}, _units: {}, _unitList: [],
  _stack: [], _evoStack: [], _evoReturn: null,
  _current: null, _currentKids: [],
  _canvas: null, _ctx: null, _dpr: 1,

  onLoad() {
    this._dpr = sys.pixelRatio || 2;
  },

  onReady() {
    // 实测舞台尺寸，canvas 与节点共用同一坐标系（修正线位置偏移）
    const query = wx.createSelectorQuery().in(this);
    query.select('#graphStage').boundingClientRect((rect) => {
      if (!rect || !rect.width) return;
      this.setData({ stageSize: { w: rect.width, h: rect.height } });
      this.initCanvas(() => { if (this._nodes.length) this.render(); });
    }).exec();
  },

  onShow() {
    if (this._nodes.length === 0) this.loadAll();
    else this.render();
  },

  loadAll() {
    this.setData({ loading: true });
    wx.cloud.callFunction({ name: 'graphService', data: { action: 'getAll' } })
      .then((res) => {
        const nodes = (res.result && res.result.data && res.result.data.nodes) || [];
        this._nodes = nodes;
        this.buildIndex();
        this.enterSubject();
      })
      .catch(() => {
        wx.showToast({ title: '加载失败，请检查云函数', icon: 'none' });
      })
      .finally(() => this.setData({ loading: false }));
  },

  // 单元 → 小节 → 根知识点 三级索引
  buildIndex() {
    this._byId = {};
    this._units = {};
    this._unitList = [];
    for (const n of this._nodes) {
      this._byId[n.knowledgeId] = n;
      const p = n.path || [];
      if (p.length < 4) continue;
      const unit = p[2];
      const sec = p[3];
      if (!this._units[unit]) this._units[unit] = { name: unit, secs: {} };
      if (!this._units[unit].secs[sec]) this._units[unit].secs[sec] = [];
      if (!n.parentId) this._units[unit].secs[sec].push(n);
    }
    this._unitList = Object.keys(this._units).sort();
  },

  /* ---------- 结构模式导航（数学 → 单元 → 小节 → 知识点） ---------- */
  enterSubject() {
    this._stack = [];
    this._mode = 'radial';
    const center = { name: '数学', type: 'unit', synthetic: true, mastery: null };
    const kids = this._unitList.map((u, i) => ({
      id: 'unit-' + i, name: u, type: 'unit', synthetic: true,
      mastery: null, unitName: u
    }));
    this._current = center;
    this._currentKids = kids;
    this.setData({ crumb: [{ name: '数学', idx: 0 }], showUp: false, showEvoReturn: false });
    this.render();
  },

  enterUnit(unitName) {
    this._stack.push({ node: this._current, kids: this._currentKids });
    const secs = Object.keys(this._units[unitName].secs).sort();
    this._current = { name: unitName, type: 'unit', synthetic: true, mastery: null, unitName };
    this._currentKids = secs.map((s, i) => ({
      id: 'sec-' + i, name: s, type: 'section', synthetic: true,
      mastery: null, secName: s, unitName
    }));
    this.setData({
      crumb: [{ name: '数学', idx: 0 }, { name: unitName, idx: 1 }],
      showUp: true
    });
    this.render();
  },

  enterSection(secName, unitName) {
    this._stack.push({ node: this._current, kids: this._currentKids });
    const roots = this._units[unitName].secs[secName] || [];
    this._current = { name: secName, type: 'section', synthetic: true, mastery: null, secName, unitName };
    this._currentKids = roots.map((n) => ({ ...n, mastery: mockMastery(n.name) }));
    this.setData({
      crumb: [
        { name: '数学', idx: 0 },
        { name: unitName, idx: 1 },
        { name: secName, idx: 2 }
      ],
      showUp: true
    });
    this.render();
  },

  enterNode(node) {
    this._stack.push({ node: this._current, kids: this._currentKids });
    this._current = node;
    this._currentKids = this._childrenOf(node);
    const p = node.path || [];
    const crumb = [{ name: '数学', idx: 0 }];
    if (p[2]) crumb.push({ name: p[2], idx: 1 });
    if (p[3]) crumb.push({ name: p[3], idx: 2 });
    crumb.push({ name: node.name, idx: 3 });
    this.setData({ crumb, showUp: true });
    this.render();
  },

  _childrenOf(node) {
    if (!node || node.synthetic) return [];
    return this._nodes.filter((n) => n.parentId === node.knowledgeId)
      .map((n) => ({ ...n, mastery: mockMastery(n.name) }));
  },

  /* ---------- 演化模式 ---------- */
  enterEvo() {
    if (this._mode === 'evo') return;
    this._evoReturn = { node: this._current, stack: this._stack.slice() };
    this._evoStack = [];
    this._mode = 'evo';
    this.setData({ mode: 'evo' });
    this.render();
  },

  exitEvo() {
    this._mode = 'radial';
    this._evoStack = [];
    this._evoReturn = null;
    this.setData({ mode: 'radial' });
    this.render();
  },

  evoReturn() {
    if (!this._evoReturn) return;
    this._stack = this._evoReturn.stack.slice();
    this._current = this._evoReturn.node;
    this._currentKids = this._childrenOf(this._current);
    this._mode = 'radial';
    this._evoStack = [];
    this._evoReturn = null;
    this.setData({ mode: 'radial' });
    this.render();
    wx.showToast({ title: '已回到「' + this._current.name + '」', icon: 'none' });
  },

  preReqsOf(node) {
    if (!node || !node.relations || !node.relations.reference) return [];
    return node.relations.reference
      .map((id) => this._byId[id])
      .filter(Boolean)
      .map((n) => ({ ...n, mastery: mockMastery(n.name) }));
  },

  /* ---------- 渲染 ---------- */
  render() {
    nodesCount = 0;
    const { w, h } = this.data.stageSize;
    const cx = w / 2, cy = h / 2 - 6;

    let nodes = [];
    let edges = [];

    if (this._mode === 'evo') {
      const pres = this.preReqsOf(this._current);
      const centerY = h - 120;
      const preY = 130;
      const per = pres.length > 0 ? Math.min(rpx(160), (w - 80) / pres.length) : rpx(160);
      const x0 = cx - ((pres.length - 1) * per) / 2;
      pres.forEach((p, i) => {
        const x = x0 + i * per;
        nodes.push(this.nodeView('anc', p, x, preY, rpx(90)));
        edges.push({ x1: x, y1: preY + rpx(24), x2: cx, y2: centerY - rpx(52) });
      });
      nodes.push(this.nodeView('center', this._current, cx, centerY, rpx(200), true));
    } else {
      const kids = this._currentKids || [];
      const n = kids.length;
      const R = Math.min(w * 0.36, rpx(280));
      const cR = rpx(60), kR = rpx(30);
      kids.forEach((k, i) => {
        const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
        const x = cx + R * Math.cos(ang);
        const y = cy + R * Math.sin(ang);
        nodes.push(this.nodeView('kid', k, x, y, rpx(108)));
        const dx = x - cx, dy = y - cy, dist = Math.hypot(dx, dy);
        const ux = dx / dist, uy = dy / dist;
        edges.push({
          x1: cx + ux * cR, y1: cy + uy * cR,
          x2: x - ux * kR, y2: y - uy * kR
        });
      });
      nodes.push(this.nodeView('center', this._current, cx, cy, rpx(150), true));
    }

    this.setData({
      nodes,
      showEvoReturn: this._mode === 'evo' && this._evoReturn && this._evoReturn.node !== this._current,
    });

    this.drawEdges(edges);
    this.renderInfo();
  },

  nodeView(role, node, x, y, size, isCenter) {
    const m = node.mastery != null ? node.mastery : 0;
    const longName = node.name && node.name.length > 5;
    return {
      id: node.knowledgeId || node.secName || node.unitName || node.name,
      role,
      name: node.name || '',
      isCenter: !!isCenter,
      synthetic: !!node.synthetic,
      hasMastery: node.mastery != null,
      showNameIn: !isCenter && !longName && !node.synthetic,
      label: (!isCenter && longName && !node.synthetic) ? node.name : '',
      typeLabel: node.synthetic ? TYPE_LABEL[node.type] || '' : TYPE_LABEL[node.type] || '',
      mastery: node.mastery != null ? m : null,
      left: x, top: y, size,
      borderColor: node.synthetic ? '#d8d8dc' : mColor(m),
      masteryText: node.mastery != null ? m + '%' : '',
      animDelay: nodesCount++ * 40
    };
  },

  drawEdges(edges) {
    if (!this._ctx || !this._canvas) {
      this.initCanvas(() => this.drawEdges(edges));
      return;
    }
    const { w, h } = this.data.stageSize;
    const ctx = this._ctx;
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(0,122,255,0.22)';
    ctx.beginPath();
    for (const e of edges) {
      ctx.moveTo(e.x1, e.y1);
      ctx.lineTo(e.x2, e.y2);
    }
    ctx.stroke();
  },

  initCanvas(cb) {
    wx.createSelectorQuery().in(this)
      .select('#graphCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) return;
        const canvas = res[0].node;
        const { w, h } = this.data.stageSize;
        const dpr = this._dpr;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        this._canvas = canvas;
        this._ctx = ctx;
        if (cb) cb();
      });
  },

  renderInfo() {
    const n = this._current;
    if (!n) return;
    const m = n.mastery != null ? n.mastery : (n.synthetic ? null : mockMastery(n.name));
    const src = n.concept && n.concept.source_text;
    const imp = n.importance || {};
    const info = {
      name: n.name,
      path: (n.path || []).join(' / ') || (n.synthetic ? '数学 · 知识图谱' : ''),
      mastery: m,
      masteryText: m != null ? String(m) : '—',
      masteryBg: m != null ? `conic-gradient(${mColor(m)} ${m}%, #e5e5ea 0)` : '#e5e5ea',
      masteryColor: m != null ? mColor(m) : '#c7c7cc',
      status: m != null ? mStatus(m) : '',
      statusClass: m != null ? (m >= 75 ? 'st-high' : m >= 50 ? 'st-mid' : m > 0 ? 'st-low' : 'st-zero') : 'st-zero',
      desc: src || '',
      typeLabel: TYPE_LABEL[n.type] || '知识点',
      count: this._currentKids ? this._currentKids.length : 0,
      hot: imp.exam_frequency >= 4,
      key: imp.curriculum_weight >= 4
    };
    this.setData({ info });
  },

  /* ---------- 事件 ---------- */
  toggleDesc() {
    this.setData({ infoExpanded: !this.data.infoExpanded });
  },

  onNodeTap(e) {
    const id = e.currentTarget.dataset.id;
    if (this.data.mode === 'evo') {
      const node = this._byId[id];
      if (!node) return;
      this._evoStack.push(this._current);
      this._current = node;
      this.render();
      return;
    }
    const kid = (this._currentKids || []).find((k) => (k.knowledgeId || k.secName || k.unitName) === id);
    if (!kid) return;
    if (kid.unitName && !kid.secName) {
      this.enterUnit(kid.unitName);
    } else if (kid.secName && !kid.knowledgeId) {
      this.enterSection(kid.secName, kid.unitName);
    } else if (kid.knowledgeId) {
      this.enterNode(this._byId[kid.knowledgeId]);
    }
  },

  onModeTap() {
    if (this._mode === 'radial') this.enterEvo();
    else this.exitEvo();
  },

  onUpTap() {
    if (this._mode === 'evo') {
      if (this._evoStack.length) {
        this._current = this._evoStack.pop();
        this.render();
      } else {
        this.exitEvo();
        wx.showToast({ title: '已退出演化模式', icon: 'none' });
      }
      return;
    }
    if (this._stack.length === 0) { wx.navigateBack(); return; }
    const prev = this._stack.pop();
    this._current = prev.node;
    this._currentKids = prev.kids;
    this.setData({ crumb: this.crumbFor(this._current), showUp: this._current.name !== '数学' });
    this.render();
  },

  crumbFor(n) {
    const c = [{ name: '数学', idx: 0 }];
    if (n.unitName) c.push({ name: n.unitName, idx: 1 });
    if (n.secName) c.push({ name: n.secName, idx: 2 });
    if (n.name && !n.synthetic) c.push({ name: n.name, idx: 3 });
    return c;
  },

  onEvoReturnTap() { this.evoReturn(); },

  onCrumbTap(e) {
    const idx = e.currentTarget.dataset.idx;
    if (this._mode === 'evo') {
      if (idx >= this._evoStack.length) return;
      this._current = this._evoStack[idx];
      this._evoStack = this._evoStack.slice(0, idx);
      this.render();
      return;
    }
    const popCount = this._stack.length - (idx - 1);
    let prev = null;
    for (let i = 0; i < popCount; i++) prev = this._stack.pop();
    if (idx === 0 || !prev) { this.enterSubject(); return; }
    this._current = prev.node;
    this._currentKids = prev.kids;
    this.setData({ crumb: this.crumbFor(this._current), showUp: this._current.name !== '数学' });
    this.render();
  },

  onBackTap() { wx.navigateBack(); }
});

let nodesCount = 0;
