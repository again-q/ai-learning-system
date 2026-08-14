const app = getApp();

// 类型标签（知识节点用；结构节点/单元/小节不显示类型标签）
const TYPE_LABEL = {
  definition: '概念', property: '性质', method: '方法',
  notation: '记号', example: '例子', reading: '阅读'
};
const TYPE_ORDER = ['definition', 'property', 'method', 'notation', 'example', 'reading'];

// 掌握度颜色/状态（真实数据来自 knowledge_progress，无记录 = 未学 0）
function mColor(m) { return m >= 75 ? '#34c759' : m >= 50 ? '#ff9500' : m > 0 ? '#ff3b30' : '#c7c7cc'; }
function mStatus(m) { return m >= 75 ? '已掌握' : m >= 50 ? '学习中' : m > 0 ? '薄弱' : '未学'; }
function mStCls(m) { return m >= 75 ? 'st-high' : m >= 50 ? 'st-mid' : m > 0 ? 'st-low' : 'st-zero'; }

// 演化模式画布坐标系：直接用设计稿 rpx 数值（750 设计宽 - 左右各 32rpx padding = 686），
// 不依赖运行时测量（避免与 canvas 方案一样的坐标同步问题）
const EVO_W = 686, EVO_H = 460, EVO_CENTER_Y = EVO_H - 130, EVO_PRE_Y = 120;
const EVO_CENTER_R = 76, EVO_PRE_R = 48;

function lineBetween(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  return { left: x1, top: y1, width: len, angle };
}

Page({
  data: {
    loading: true,
    isTab: true,         // app.json tabBar「图谱」页：恒为 tab，不可 navigateTo
    mode: 'tree',        // 'tree' | 'evo'
    crumb: [],
    showUp: false,
    isStructural: true,
    focus: null,
    rows: [],
    groups: [],
    sheet: null,
    evoEmpty: true,
    evoLines: [],
    evoPres: [],
    evoCenter: null,
    evoShowBack: false,
    evoStageH: EVO_H
  },

  _nodes: [], _byId: {}, _units: {}, _unitList: [],
  _stack: [], _current: null, _currentKids: [],
  _selectedLeaf: null,
  _evoFocus: null, _evoStack: [],

  onLoad() {
    this.loadAll();
  },

  onShow() {
    // tab 切换回来时：已有数据就重渲；首次/清空后重新拉
    if (this._nodes.length) this.render();
    else if (!this.data.loading) this.loadAll();
  },

  loadAll() {
    this.setData({ loading: true });
    wx.cloud.callFunction({ name: 'graphService', data: { action: 'getAll' } })
      .then((res) => {
        const data = (res.result && res.result.data) || {};
        const nodes = data.nodes || [];
        const progressMap = data.progressMap || {};
        // 掌握度真实值：knowledge_progress 无记录 = 未学（0）
        this._nodes = nodes.map((n) => ({ ...n, mastery: progressMap[n.knowledgeId] != null ? progressMap[n.knowledgeId] : 0 }));
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

  _childCount(knowledgeId) {
    return this._nodes.filter((n) => n.parentId === knowledgeId).length;
  },
  _hasKids(node) {
    return !node.synthetic && this._childCount(node.knowledgeId) > 0;
  },
  _childrenOf(node) {
    if (!node || node.synthetic) return [];
    return this._nodes.filter((n) => n.parentId === node.knowledgeId)
      .map((n) => ({ ...n, mastery: n.mastery != null ? n.mastery : 0 }));
  },
  _refsOf(node) {
    if (!node || !node.relations || !node.relations.reference) return [];
    return node.relations.reference
      .map((id) => this._byId[id])
      .filter(Boolean)
      .map((n) => ({ ...n, mastery: n.mastery != null ? n.mastery : 0 }));
  },

  /* ---------- 目录导航（数学 → 单元 → 小节 → 知识点树） ---------- */
  enterSubject() {
    this._stack = [];
    this._current = { name: '数学', type: 'unit', synthetic: true, mastery: null };
    this._currentKids = this._unitList.map((u, i) => ({
      id: 'unit-' + i, name: u, type: 'unit', synthetic: true, unitName: u
    }));
    this._selectedLeaf = null;
    this.closeSheet();
    this.render();
  },

  enterUnit(unitName) {
    this._stack.push({ node: this._current, kids: this._currentKids });
    const secs = Object.keys(this._units[unitName].secs).sort();
    this._current = { name: unitName, type: 'unit', synthetic: true, unitName };
    this._currentKids = secs.map((s, i) => ({
      id: 'sec-' + i, name: s, type: 'section', synthetic: true, secName: s, unitName
    }));
    this._selectedLeaf = null;
    this.closeSheet();
    this.render();
  },

  enterSection(secName, unitName) {
    this._stack.push({ node: this._current, kids: this._currentKids });
    const roots = this._units[unitName].secs[secName] || [];
    this._current = { name: secName, type: 'section', synthetic: true, secName, unitName };
    this._currentKids = roots.map((n) => ({ ...n, mastery: n.mastery != null ? n.mastery : 0 }));
    this._selectedLeaf = null;
    this.closeSheet();
    this.render();
  },

  enterNode(node) {
    this._stack.push({ node: this._current, kids: this._currentKids });
    this._current = node;
    this._currentKids = this._childrenOf(node);
    this._selectedLeaf = null;
    this.closeSheet();
    this.render();
  },

  goUpTree() {
    if (!this._stack.length) {
      // tab 根层没有「上一页」可退；非 tab 才 navigateBack
      if (!this.data.isTab) wx.navigateBack();
      return;
    }
    const prev = this._stack.pop();
    this._current = prev.node;
    this._currentKids = prev.kids;
    this._selectedLeaf = null;
    this.closeSheet();
    this.render();
  },

  jumpTree(idx) {
    if (idx >= this._stack.length) return; // 点到的是当前项本身
    const target = this._stack[idx];
    this._current = target.node;
    this._currentKids = target.kids;
    this._stack = this._stack.slice(0, idx);
    this._selectedLeaf = null;
    this.closeSheet();
    this.render();
  },

  /* ---------- 演化模式（前置依赖链，relations.reference） ---------- */
  viewEvo(node) {
    if (!node || node.synthetic) return;
    this._evoFocus = node;
    this._evoStack = [];
    this.setData({ mode: 'evo' });
    this.render();
  },

  viewEvoFromSheet() {
    if (!this._selectedLeaf) return;
    const node = this._selectedLeaf;
    this.closeSheet();
    this.viewEvo(node);
  },

  stepEvo(id) {
    const node = this._byId[id];
    if (!node) return;
    this._evoStack.push(this._evoFocus);
    this._evoFocus = node;
    this.render();
  },

  stepBackEvo() {
    if (!this._evoStack.length) return;
    this._evoFocus = this._evoStack.pop();
    this.render();
  },

  /* ---------- 渲染 ---------- */
  render() {
    if (this.data.mode === 'evo') this.renderEvo();
    else this.renderTree();
    this.renderCrumb();
  },

  renderTree() {
    const kids = this._currentKids || [];
    const isStructural = kids.length > 0 && !!kids[0].synthetic;
    this.setData({
      showUp: this._stack.length > 0,
      isStructural,
      focus: this.buildFocus(kids, isStructural),
      rows: isStructural ? this.buildRows(kids) : [],
      groups: isStructural ? [] : this.buildGroups(kids)
    });
  },

  buildFocus(kids, isStructural) {
    const cur = this._current;
    if (isStructural || cur.synthetic) {
      return {
        name: cur.name,
        showMastery: false,
        metaText: kids.length ? kids.length + ' 项' : '暂无内容',
        showEvoBtn: false
      };
    }
    const m = cur.mastery != null ? cur.mastery : 0;
    return {
      name: cur.name,
      showMastery: true,
      masteryPct: m,
      masteryColor: mColor(m),
      statusText: mStatus(m),
      metaText: kids.length ? kids.length + ' 个相关知识点' : '最细知识点',
      showEvoBtn: true
    };
  },

  buildRows(kids) {
    return kids.map((k) => {
      let sub = '';
      if (k.unitName && !k.secName) {
        const secCount = Object.keys(this._units[k.unitName].secs).length;
        sub = secCount + ' 节';
      } else if (k.secName) {
        const rootCount = (this._units[k.unitName].secs[k.secName] || []).length;
        sub = rootCount + ' 个知识点';
      }
      return { id: k.id, name: k.name, sub };
    });
  },

  buildGroups(kids) {
    const buckets = {};
    kids.forEach((k) => { (buckets[k.type] = buckets[k.type] || []).push(k); });
    const selectedId = this._selectedLeaf ? this._selectedLeaf.knowledgeId : null;
    return TYPE_ORDER.filter((t) => buckets[t]).map((t) => ({
      type: t,
      label: TYPE_LABEL[t],
      count: buckets[t].length,
      items: buckets[t].map((k) => {
        const m = k.mastery != null ? k.mastery : 0;
        const childCount = this._childCount(k.knowledgeId);
        return {
          id: k.knowledgeId,
          name: k.name,
          mastery: m,
          masteryColor: mColor(m),
          hasMore: childCount > 0,
          moreCount: childCount,
          selected: k.knowledgeId === selectedId
        };
      })
    }));
  },

  renderEvo() {
    const focus = this._evoFocus;
    if (!focus) {
      this.setData({ evoEmpty: true, evoLines: [], evoPres: [], evoCenter: null, evoShowBack: false });
      return;
    }
    const pres = this._refsOf(focus);
    const n = pres.length;
    const cx = EVO_W / 2, cy = EVO_CENTER_Y;
    const per = n > 0 ? Math.max(96, Math.min(160, (EVO_W - 80) / n)) : 160;
    const x0 = cx - ((n - 1) * per) / 2;

    const evoPres = [];
    const evoLines = [];
    pres.forEach((p, i) => {
      const x = x0 + i * per;
      const y = EVO_PRE_Y;
      const m = p.mastery != null ? p.mastery : 0;
      evoPres.push({ id: p.knowledgeId, name: p.name, mastery: m, masteryColor: mColor(m), left: x, top: y });

      // 连线两端各按自身圆半径收缩，避免线头扎进圆心
      const dx = cx - x, dy = cy - y, dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist, uy = dy / dist;
      const line = lineBetween(x + ux * EVO_PRE_R, y + uy * EVO_PRE_R, cx - ux * EVO_CENTER_R, cy - uy * EVO_CENTER_R);
      line.idx = i;
      evoLines.push(line);
    });

    this.setData({
      evoEmpty: false,
      evoLines,
      evoPres,
      evoCenter: { name: focus.name, left: cx, top: cy },
      evoShowBack: this._evoStack.length > 0,
      evoStageH: EVO_H
    });
  },

  renderCrumb() {
    let names;
    if (this.data.mode === 'evo') {
      names = this._evoStack.map((n) => n.name);
      if (this._evoFocus) names.push(this._evoFocus.name);
    } else {
      names = this._stack.map((s) => s.node.name).concat([this._current ? this._current.name : '']);
    }
    const crumb = names.map((name, idx) => ({ name, idx, isLast: idx === names.length - 1 }));
    this.setData({ crumb });
  },

  /* ---------- 详情面板（叶子知识点） ---------- */
  openSheet(node) {
    const m = node.mastery != null ? node.mastery : 0;
    const src = (node.concept && node.concept.source_text) || '';
    const imp = node.importance || {};
    const path = (node.path || []).concat([node.name]).join(' / ');
    this.setData({
      sheet: {
        name: node.name,
        path,
        masteryPct: m,
        masteryColor: mColor(m),
        statusText: mStatus(m) + ' · ' + m + '%',
        statusClass: mStCls(m),
        desc: src || '暂无教材原文。',
        typeLabel: TYPE_LABEL[node.type] || '知识点',
        hot: imp.exam_frequency >= 4,
        key: imp.curriculum_weight >= 4
      }
    });
  },

  closeSheet() {
    this.setData({ sheet: null });
  },

  /* ---------- 事件 ---------- */
  onModeTap(e) {
    const next = e.currentTarget.dataset.mode;
    if (next === this.data.mode) return;
    this.setData({ mode: next });
    this.render();
  },

  onRowTap(e) {
    const id = e.currentTarget.dataset.id;
    const kid = (this._currentKids || []).find((k) => k.id === id);
    if (!kid) return;
    if (kid.unitName && !kid.secName) this.enterUnit(kid.unitName);
    else if (kid.secName) this.enterSection(kid.secName, kid.unitName);
  },

  onCardTap(e) {
    const id = e.currentTarget.dataset.id;
    const kid = (this._currentKids || []).find((k) => k.knowledgeId === id);
    if (!kid) return;
    if (this._hasKids(kid)) {
      this.enterNode(this._byId[kid.knowledgeId]);
      return;
    }
    this._selectedLeaf = kid;
    this.render();
    this.openSheet(kid);
  },

  onEvoBtnTap() { this.viewEvo(this._current); },
  onSheetEvoTap() { this.viewEvoFromSheet(); },
  onSheetCloseTap() { this.closeSheet(); },
  onOverlayTap() { this.closeSheet(); },

  onUpTap() { this.goUpTree(); },

  onEvoPreTap(e) { this.stepEvo(e.currentTarget.dataset.id); },
  onEvoBackTap() { this.stepBackEvo(); },
  onEvoEmptyGoTree() { this.setData({ mode: 'tree' }); this.render(); },

  onCrumbTap(e) {
    const idx = e.currentTarget.dataset.idx;
    if (this.data.mode === 'evo') {
      if (idx >= this._evoStack.length) return;
      this._evoFocus = this._evoStack[idx];
      this._evoStack = this._evoStack.slice(0, idx);
      this.render();
      return;
    }
    this.jumpTree(idx);
  },

  onBackTap() {
    if (this.data.isTab) return;
    wx.navigateBack();
  }
});
