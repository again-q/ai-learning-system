const app = getApp();

Page({
  data: {
    pageReady: false, level: 0, currentLabel: '',
    currentNode: null, parentNode: null,
    children: [], showDetail: false, selectedNode: null,
    loading: false
  },

  _stack: [],
  _allNodes: [],

  getColor(m) {
    if (m >= 75) return '#34c759';
    if (m >= 50) return '#ff9500';
    if (m > 0) return '#ff3b30';
    return '#c7c7cc';
  },

  onLoad() {},

  onShow() {
    this.setData({ pageReady: false });
    setTimeout(() => this.setData({ pageReady: true }), 16);
    if (this._stack.length === 0 && this._allNodes.length === 0) this.loadFromDB();
    else this.renderCurrentLevel();
  },

  loadFromDB() {
    this.setData({ loading: true });
    wx.cloud.callFunction({
      name: 'manageKnowledge',
      data: { action: 'list', subjectId: 'math' }
    }).then(res => {
      const nodes = (res.result && res.result.data) || [];
      this._allNodes = nodes;
      this.buildRootLevel();
      this.setData({ loading: false });
    }).catch(() => {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败，请检查云函数', icon: 'none' });
    });
  },

  buildRootLevel() {
    // 按 chapter 的第一段（如"必修1"）分组作为根节点
    const units = new Map();
    for (const n of this._allNodes) {
      const ch = n.chapter || '未分类';
      const unitName = ch.split('-')[0] || ch;
      if (!units.has(unitName)) {
        units.set(unitName, { id: unitName, name: unitName, children: [] });
      }
      units.get(unitName).children.push(n);
    }
    // 计算每个单元的掌握度
    const children = [];
    for (const [name, unit] of units) {
      const avg = unit.children.length > 0
        ? Math.round(unit.children.reduce((s, c) => s + (c.mastery || 0), 0) / unit.children.length)
        : 0;
      children.push({
        id: unit.id, name: unit.name,
        mastery: avg, info: `${unit.children.length}个知识点`,
        color: this.getColor(avg), _type: 'unit'
      });
    }

    this._stack = [];
    this.setData({
      level: 0, currentLabel: '数学',
      currentNode: { name: '数学', mastery: Math.round(children.reduce((s,c)=>s+c.mastery,0)/children.length) || 0, info: '高中数学知识点' },
      parentNode: null,
      children: children,
      showDetail: false, selectedNode: null
    });
  },

  selectChild(e) {
    const id = e.currentTarget.dataset.id;
    const child = this.data.children.find(c => c.id === id);
    if (!child) return;

    // 如果点击的是 unit → 显示其下的章节
    if (child._type === 'unit') {
      const chapters = new Map();
      for (const n of this._allNodes) {
        if ((n.chapter || '').startsWith(child.id)) {
          const chKey = n.chapter;
          if (!chapters.has(chKey)) {
            chapters.set(chKey, { id: chKey, name: chKey, children: [] });
          }
          chapters.get(chKey).children.push(n);
        }
      }
      const nextChildren = [];
      for (const [name, ch] of chapters) {
        const avg = ch.children.length > 0
          ? Math.round(ch.children.reduce((s, c) => s + (c.mastery || 0), 0) / ch.children.length)
          : 0;
        nextChildren.push({
          id: ch.id, name: name,
          mastery: avg, info: `${ch.children.length}个知识点`,
          color: this.getColor(avg), _type: 'chapter'
        });
      }

      this._stack.push({
        level: this.data.level, currentNode: this.data.currentNode,
        parentNode: this.data.parentNode, children: this.data.children, label: this.data.currentLabel
      });
      this.setData({
        level: this.data.level + 1, currentLabel: child.name,
        currentNode: child, parentNode: this.data.currentNode,
        children: nextChildren, showDetail: false, selectedNode: null
      });
      return;
    }

    // 如果点击的是 chapter → 显示具体知识点
    if (child._type === 'chapter') {
      const nodes = this._allNodes.filter(n => n.chapter === child.id);
      const nextChildren = nodes.map(n => ({
        id: n._id, name: n.name, mastery: n.mastery || 0,
        info: n.type === 'concept' ? '概念' : n.type === 'model' ? '模型' : '技能',
        color: this.getColor(n.mastery || 0), _type: 'node'
      }));

      this._stack.push({
        level: this.data.level, currentNode: this.data.currentNode,
        parentNode: this.data.parentNode, children: this.data.children, label: this.data.currentLabel
      });
      this.setData({
        level: this.data.level + 1, currentLabel: child.name,
        currentNode: child, parentNode: this.data.currentNode,
        children: nextChildren, showDetail: false, selectedNode: null
      });
      return;
    }

    // 知识点点击 → 显示详情
    child.st = child.mastery >= 75 ? '已掌握' : child.mastery >= 50 ? '学习中' : child.mastery > 0 ? '薄弱' : '未学';
    this.setData({ selectedNode: child, showDetail: true });
  },

  renderCurrentLevel() {
    this.setData({ showDetail: false, selectedNode: null });
  },

  goBack() {
    if (this._stack.length === 0) { wx.navigateBack(); return; }
    const prev = this._stack.pop();
    this.setData({
      level: prev.level, currentLabel: prev.label,
      currentNode: prev.currentNode, parentNode: prev.parentNode,
      children: prev.children
    });
  },

  selectCurrentNode() {
    const n = this.data.currentNode;
    if (!n) return;
    n.st = n.mastery >= 75 ? '已掌握' : n.mastery >= 50 ? '学习中' : n.mastery > 0 ? '薄弱' : '未学';
    this.setData({ selectedNode: n, showDetail: true });
  },

  closeDetail() { this.setData({ showDetail: false, selectedNode: null }); },
  goStudy() { wx.switchTab({ url: '/pages/study/study' }); }
});
