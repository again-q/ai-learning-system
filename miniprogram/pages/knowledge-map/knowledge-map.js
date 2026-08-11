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
// 按 type 分组（结构节点统筹）
function groupKids(kids) {
  const TYPE_ORDER = ['definition', 'property', 'method', 'notation', 'example', 'reading'];
  const groups = [];
  for (const t of TYPE_ORDER) {
    const items = (kids || []).filter(k => k.type === t);
    if (items.length) groups.push({ type: t, label: TYPE_LABEL[t] || t, count: items.length, items });
  }
  return groups;
}

/* ========== 镜头移动常量（视口布局，390 基准，px） ========== */
const PER_ROW = 4, KID_Y1 = 330, KID_Y2 = 430, CENTER_Y = 128;
const KID_R = 31, CENTER_R = 62, ANC_R = 24;   // 半径（px，rpx 换算近似）
const MOVE_MS = 700, REVEAL_MS = 750, FADE_MS = 350;

Page({
  data: {
    loading: true,
    isTab: false,
    infoExpanded: false,
    mode: 'radial',        // radial | evo
    nodes: [],
    lines: [],
    worldTransform: 'translate(0px, 0px)',
    crumb: [],
    info: null,
    showUp: false,
    showEvoReturn: false,
    stageSize: { w: 375, h: 600 },
    ringIndex: 0,
    ringCount: 0,
    showRingNext: false,
  },

  _nodes: [], _byId: {}, _units: {}, _unitList: [],
  _stack: [], _evoStack: [], _evoReturn: null,
  _current: null, _currentKids: [],
  _busy: false,

  onLoad() {
    this.setData({ isTab: getCurrentPages().length === 1 });
  },

  onReady() {
    const query = wx.createSelectorQuery().in(this);
    query.select('#graphStage').boundingClientRect((rect) => {
      if (!rect || !rect.width) return;
      this.setData({ stageSize: { w: rect.width, h: rect.height } });
      if (this._nodes.length) this.renderStatic();
    }).exec();
  },

  onShow() {
    if (this._nodes.length === 0) this.loadAll();
    else if (!this._busy) this.renderStatic();
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

  /* ---------- 世界坐标制 ---------- */
  cx() { return this.data.stageSize.w / 2; },

  // 当前中心节点的世界坐标
  centerWorld() {
    return (this._current && this._current.wx != null)
      ? { x: this._current.wx, y: this._current.wy }
      : { x: this.cx(), y: CENTER_Y };
  },

  // 视口布局坐标 → 世界坐标
  worldPos(vx, vy) {
    const cw = this.centerWorld();
    return { x: vx + (cw.x - this.cx()), y: vy + (cw.y - CENTER_Y) };
  },

  // 世界 transform（让世界坐标 (wx,wy) 对准视口中心）
  worldTransformOf(wx, wy) {
    return `translate(${Math.round(this.cx() - wx)}px, ${Math.round(CENTER_Y - wy)}px)`;
  },

  /* ---------- 布局 ---------- */
  layoutOf(count) {
    const w = this.data.stageSize.w, cx = this.cx();
    const margin = rpx(70);
    const spread = Math.max(0, w - 2 * margin);
    const rowGap = PER_ROW > 1 ? spread / (PER_ROW - 1) : 0;
    const pos = [];
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / PER_ROW);
      const col = i % PER_ROW;
      const rowCount = Math.min(PER_ROW, count - row * PER_ROW);
      pos.push({
        x: rowCount === 1 ? cx : margin + col * rowGap,
        y: row === 0 ? KID_Y1 : KID_Y2
      });
    }
    return pos;
  },

  /* ---------- 渲染（静态：无动画重建当前层） ---------- */
  renderStatic() {
    if (this._mode === 'evo') { this.renderEvoStatic(); return; }
    const cw = this.centerWorld();
    const kids = this._currentKids || [];
    let showKids = kids, showGroups = null;

    // 分组/分圈
    if (this._current && this._current.grpType && kids.length > 8) {
      const ringIndex = this.data.ringIndex;
      const ringCount = Math.ceil(kids.length / 8);
      showKids = kids.slice(ringIndex * 8, (ringIndex + 1) * 8);
      this.setData({ ringCount, showRingNext: ringCount > 1 });
    } else {
      this.setData({ showRingNext: false });
      if (kids.length > 8) { showGroups = groupKids(kids); showKids = []; }
    }

    const nodes = [this.nodeView('center', this._current, cw.x, cw.y, true)];
    const pos = this.layoutOf(showKids.length);
    showKids.forEach((k, i) => {
      const wp = this.worldPos(pos[i].x, pos[i].y);
      nodes.push(this.nodeView('kid', k, wp.x, wp.y, false, true)); // reveal 浮现
    });
    if (showGroups) {
      const gpos = this.layoutOf(showGroups.length);
      showGroups.forEach((g, i) => {
        const wp = this.worldPos(gpos[i].x, gpos[i].y);
        nodes.push(this.groupView(g, wp.x, wp.y, true));
      });
    }

    const lines = this.buildLines(showKids, showGroups, cw);
    this.setData({
      nodes, lines,
      worldTransform: this.worldTransformOf(cw.x, cw.y),
      showEvoReturn: false
    });
    // 子节点浮现：30ms 后 settle（setTimeout，防 rAF 失焦卡住）
    setTimeout(() => {
      this.setData({ nodes: this.data.nodes.map(n => ({ ...n, origin: false })) });
    }, 40);
    this.renderInfo();
  },

  renderEvoStatic() {
    const cw = this.centerWorld();
    const pres = this.preReqsOf(this._current);
    const w = this.data.stageSize.w, cx = this.cx();
    const centerY = this.data.stageSize.h - 120;
    const nodes = [this.nodeView('center', this._current, cw.x, cw.y, true)];
    const lines = [];
    const per = pres.length > 1 ? Math.min(rpx(160), (w - 80) / pres.length) : rpx(160);
    const x0 = cx - ((pres.length - 1) * per) / 2;
    pres.forEach((p, i) => {
      const x = x0 + i * per;
      const wp = this.worldPos(x, 130);
      nodes.push(this.nodeView('anc', p, wp.x, wp.y, false, true));
      lines.push({ x1: wp.x, y1: 130 + ANC_R, w: 2, h: centerY - 130 - CENTER_R - ANC_R, rot: 0 });
    });
    this.setData({
      nodes, lines,
      worldTransform: this.worldTransformOf(cw.x, cw.y),
      showEvoReturn: this._evoReturn && this._evoReturn.node !== this._current
    });
    setTimeout(() => {
      this.setData({ nodes: this.data.nodes.map(n => ({ ...n, origin: false })) });
    }, 40);
    this.renderInfo();
  },

  /* ---------- 镜头移动进入 ---------- */
  enterInto(node, twx, twy) {
    if (this._busy) return;
    this._busy = true;

    const kids = this.kidsForEnter(node);
    let shown = kids;
    if (kids.length > 8) {
      const groups = groupKids(kids);
      shown = groups;
      this._pendingGroups = groups;
    } else {
      this._pendingGroups = null;
    }
    const targetId = node.id || ('grp-' + node.type);

    // ① 世界整体平移（目标节点 → 视口中心）
    this.setData({ worldTransform: this.worldTransformOf(twx, twy) });

    // ② 被点节点：聚焦变蓝放大；③ 旧层其他节点淡出
    const nodes = this.data.nodes.map((n) => {
      if (n.id === targetId) {
        return { ...n, focusing: true, isCenter: true, role: 'center' };
      }
      return { ...n, oldfade: true };
    });
    // ④ 新子节点：世界坐标渲染 + reveal origin（移动中慢慢浮现）
    const pos = this.layoutOf(shown.length);
    shown.forEach((k, i) => {
      const wp = this.worldPos(pos[i].x, pos[i].y);
      if (k.type && !k.synthetic) nodes.push(this.nodeView('kid', k, wp.x, wp.y, true));
      else nodes.push(this.groupView(k, wp.x, wp.y, true));
    });
    this.setData({ nodes });
    // 子节点 40ms 后浮现
    setTimeout(() => {
      this.setData({ nodes: this.data.nodes.map(n => ({ ...n, origin: false })) });
    }, 40);

    // 移动完成：结算
    setTimeout(() => {
      this._stack.push({ node: this._current, kids: this._currentKids });
      const grpType = node.type && node.items ? node.type : null;
      this._current = { ...node, wx: twx, wy: twy, grpType: grpType };
      this._currentKids = this._pendingGroups || kids;
      this.setData({ crumb: this.crumbFor(this._current), showUp: true });
      this.renderStatic();
      this._busy = false;
    }, MOVE_MS + 40);

    // 兜底：异常也释放
    setTimeout(() => { this._busy = false; }, MOVE_MS + 700);
  },

  // 统一获取下一级节点（单元 → 小节 → 知识点 / 分组 → 组内）
  kidsForEnter(node) {
    if (node.items) return node.items.map((n) => ({ ...n, mastery: mockMastery(n.name) }));
    if (node.unitName && !node.secName) {
      const secs = Object.keys(this._units[node.unitName].secs).sort();
      return secs.map((s, i) => ({
        id: 'sec-' + i, name: s, type: 'section', synthetic: true,
        mastery: null, secName: s, unitName: node.unitName
      }));
    }
    if (node.secName) {
      const roots = (this._units[node.unitName] && this._units[node.unitName].secs[node.secName]) || [];
      return roots.map((n) => ({ ...n, mastery: mockMastery(n.name) }));
    }
    return this._childrenOf(node);
  },

  /* ---------- 返回（世界移回目标层中心） ---------- */
  goToCrumb(idx) {
    // idx = 面包屑序号（0=数学，k=第 k 层），back = stack[idx]
    if (this._busy || idx < 0 || idx >= this._stack.length) return;
    this._busy = true;
    this.setData({ nodes: this.data.nodes.map(n => ({ ...n, oldfade: true })) });
    const back = this._stack[idx];
    if (back) {
      const bx = back.node.wx != null ? back.node.wx : this.cx();
      const by = back.node.wy != null ? back.node.wy : CENTER_Y;
      this.setData({ worldTransform: this.worldTransformOf(bx, by) });
    }
    setTimeout(() => {
      this._stack = this._stack.slice(0, idx);
      this._current = back.node;
      this._currentKids = back.kids;
      this.setData({ crumb: this.crumbFor(this._current), showUp: this._current.name !== '数学' });
      this.renderStatic();
      this._busy = false;
    }, MOVE_MS);
    setTimeout(() => { this._busy = false; }, MOVE_MS + 700);
  },

  /* ---------- 导航状态 ---------- */
  enterSubject() {
    this._stack = [];
    this._mode = 'radial';
    this._current = { name: '数学', type: 'unit', synthetic: true, mastery: null };
    this._currentKids = this._unitList.map((u, i) => ({
      id: 'unit-' + i, name: u, type: 'unit', synthetic: true,
      mastery: null, unitName: u
    }));
    this.setData({ crumb: [{ name: '数学', idx: 0 }], showUp: false, showEvoReturn: false });
    this.renderStatic();
  },

  enterUnit(unitName) {
    this._stack.push({ node: this._current, kids: this._currentKids });
    const secs = Object.keys(this._units[unitName].secs).sort();
    const node = { name: unitName, type: 'unit', synthetic: true, mastery: null, unitName };
    this._current = node;
    this._currentKids = secs.map((s, i) => ({
      id: 'sec-' + i, name: s, type: 'section', synthetic: true,
      mastery: null, secName: s, unitName
    }));
    this.setData({ crumb: this.crumbFor(this._current), showUp: true });
    this.renderStatic();
  },

  enterSection(secName, unitName) {
    this._stack.push({ node: this._current, kids: this._currentKids });
    const roots = this._units[unitName].secs[secName] || [];
    const node = { name: secName, type: 'section', synthetic: true, mastery: null, secName, unitName };
    this._current = node;
    this._currentKids = roots.map((n) => ({ ...n, mastery: mockMastery(n.name) }));
    this.setData({ crumb: this.crumbFor(this._current), showUp: true });
    this.renderStatic();
  },

  enterGroup(g) {
    this._stack.push({ node: this._current, kids: this._currentKids });
    const node = { name: g.label + ' ×' + g.count, type: 'section', synthetic: true, mastery: null, grpType: g.type };
    this._current = node;
    this._currentKids = g.items.map((n) => ({ ...n, mastery: mockMastery(n.name) }));
    this.setData({ crumb: this.crumbFor(this._current), showUp: true });
    this.renderStatic();
  },

  enterNode(node) {
    this._stack.push({ node: this._current, kids: this._currentKids });
    this._current = node;
    this._currentKids = this._childrenOf(node);
    this.setData({ crumb: this.crumbFor(this._current), showUp: true });
    this.renderStatic();
  },

  _childrenOf(node) {
    if (!node || node.synthetic) return [];
    return this._nodes.filter((n) => n.parentId === node.knowledgeId)
      .map((n) => ({ ...n, mastery: mockMastery(n.name) }));
  },

  crumbFor(n) {
    const c = [{ name: '数学', idx: 0 }];
    if (n.unitName) c.push({ name: n.unitName, idx: 1 });
    if (n.secName) c.push({ name: n.secName, idx: 2 });
    if (n.name && !n.synthetic) c.push({ name: n.name, idx: 3 });
    return c;
  },

  /* ---------- 演化模式 ---------- */
  enterEvo() {
    if (this._mode === 'evo') return;
    this._evoReturn = { node: this._current, stack: this._stack.slice() };
    this._evoStack = [];
    this._mode = 'evo';
    this.setData({ mode: 'evo' });
    this.renderEvoStatic();
  },

  exitEvo() {
    this._mode = 'radial';
    this._evoStack = [];
    this._evoReturn = null;
    this.setData({ mode: 'radial' });
    this.renderStatic();
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
    this.renderStatic();
    wx.showToast({ title: '已回到「' + this._current.name + '」', icon: 'none' });
  },

  preReqsOf(node) {
    if (!node || !node.relations || !node.relations.reference) return [];
    return node.relations.reference
      .map((id) => this._byId[id])
      .filter(Boolean)
      .map((n) => ({ ...n, mastery: mockMastery(n.name) }));
  },

  /* ---------- 节点/线 view 生成 ---------- */
  nodeView(role, node, x, y, isCenter, reveal) {
    const m = node.mastery != null ? node.mastery : 0;
    const longName = node.name && node.name.length > 5;
    return {
      id: node.knowledgeId || node.secName || node.unitName || node.name,
      role,
      name: node.name || '',
      isCenter: !!isCenter,
      focusing: false,
      reveal: !!reveal,
      origin: !!reveal,
      oldfade: false,
      synthetic: !!node.synthetic,
      hasMastery: node.mastery != null && !node.synthetic,
      showNameIn: !isCenter && !longName && !node.synthetic,
      label: (!isCenter && (longName || node.synthetic)) ? node.name : '',
      typeLabel: node.synthetic ? '' : (TYPE_LABEL[node.type] || ''),
      masteryText: (node.mastery != null && !node.synthetic) ? m + '%' : '',
      borderColor: node.synthetic ? '#d8d8dc' : mColor(m),
      left: Math.round(x), top: Math.round(y)
    };
  },

  groupView(g, x, y, reveal) {
    return {
      id: 'grp-' + g.type, role: 'kid', name: g.label + ' ×' + g.count,
      isCenter: false, focusing: false, reveal: !!reveal, origin: !!reveal,
      oldfade: false, synthetic: true, hasMastery: false, showNameIn: false,
      label: g.label + ' ×' + g.count, typeLabel: '', masteryText: '',
      borderColor: '#d8d8dc', left: Math.round(x), top: Math.round(y)
    };
  },

  // 连接线：view 细条（垂直段 + 斜线段），世界坐标
  buildLines(kids, groups, cw) {
    const lines = [];
    const cx = cw.x, cy = cw.y;
    const pushEdge = (x1, y1, x2, y2) => {
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1) return;
      const rot = Math.atan2(dy, dx) * 180 / Math.PI;
      lines.push({ x1: Math.round(x1), y1: Math.round(y1), w: Math.round(len), h: 2, rot: Math.round(rot * 10) / 10 });
    };
    const items = (groups || []).length ? groups : (kids || []);
    const pos = this.layoutOf(items.length);
    items.forEach((k, i) => {
      const wp = this.worldPos(pos[i].x, pos[i].y);
      const midY = (cy + CENTER_R + wp.y - KID_R) / 2;
      // 垂直段：中心底部 → 弯点
      lines.push({ x1: Math.round(cx), y1: Math.round(cy + CENTER_R), w: 2, h: Math.round(midY - cy - CENTER_R), rot: 0 });
      // 斜线段：弯点 → 子节点顶部
      pushEdge(cx, midY, wp.x, wp.y - KID_R);
    });
    return lines;
  },

  /* ---------- 信息卡 ---------- */
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
      this.renderEvoStatic();
      return;
    }
    // 分组节点
    if (id && id.indexOf('grp-') === 0) {
      const gtype = id.slice(4);
      const groups = groupKids(this._currentKids || []);
      const g = groups.find(x => x.type === gtype);
      if (!g) return;
      const el = this.data.nodes.find(n => n.id === id);
      this.enterInto(g, el.left, el.top);
      return;
    }
    const kid = (this._currentKids || []).find((k) => (k.knowledgeId || k.secName || k.unitName) === id);
    if (!kid) return;
    const el = this.data.nodes.find(n => n.id === id);
    if (!el) return;
    this.enterInto(kid, el.left, el.top);
  },

  onModeTap() {
    if (this._mode === 'radial') this.enterEvo();
    else this.exitEvo();
  },

  onUpTap() {
    if (this._mode === 'evo') {
      if (this._evoStack.length) {
        this._current = this._evoStack.pop();
        this.renderEvoStatic();
      } else {
        this.exitEvo();
        wx.showToast({ title: '已退出演化模式', icon: 'none' });
      }
      return;
    }
    if (this._stack.length === 0) { wx.navigateBack(); return; }
    this.goToCrumb(this._stack.length - 1);
  },

  onEvoReturnTap() { this.evoReturn(); },

  onRingNext() {
    const rc = this.data.ringCount || 1;
    this.setData({ ringIndex: (this.data.ringIndex + 1) % rc });
    this.renderStatic();
  },

  onCrumbTap(e) {
    const idx = e.currentTarget.dataset.idx;
    if (this._mode === 'evo') {
      if (idx >= this._evoStack.length) return;
      this._current = this._evoStack[idx];
      this._evoStack = this._evoStack.slice(0, idx);
      this.renderEvoStatic();
      return;
    }
    this.goToCrumb(idx);
  },

  onBackTap() {
    if (getCurrentPages().length <= 1) return;
    wx.navigateBack();
  }
});
