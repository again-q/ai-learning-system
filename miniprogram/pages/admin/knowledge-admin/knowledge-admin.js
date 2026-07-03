const app = getApp();

Page({
  data: {
    subjects: ['数学', '英语', '物理', '语文', '化学', '生物', '政治', '历史', '地理'],
    subjectIndex: 0,
    currentSubject: '数学',
    typeFilter: 'all',
    nodes: [],
    loading: false,
    showForm: false,
    editNode: null,
    formData: { name: '', type: 'concept', chapter: '', difficulty: 0.5, deps: '' }
  },

  onLoad() {
    this.loadNodes();
  },

  changeSubject(e) {
    const idx = e.detail.value;
    this.setData({ subjectIndex: idx, currentSubject: this.data.subjects[idx] });
    this.loadNodes();
  },

  setFilter(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ typeFilter: type });
    this.loadNodes();
  },

  loadNodes() {
    this.setData({ loading: true });
    wx.cloud.callFunction({
      name: 'manageKnowledge',
      data: {
        action: 'list',
        subjectId: this.getSubjectId(this.data.currentSubject),
        type: this.data.typeFilter === 'all' ? undefined : this.data.typeFilter
      }
    }).then(res => {
      const list = (res.result && res.result.data) || [];
      this.setData({ nodes: list, loading: false });
    }).catch(() => {
      // 云函数还没部署时用 mock 数据
      this.setData({ loading: false, nodes: this.getMockData() });
    });
  },

  getSubjectId(name) {
    const map = { '数学':'math','英语':'english','物理':'physics','语文':'chinese','化学':'chemistry','生物':'biology','政治':'politics','历史':'history','地理':'geography' };
    return map[name] || name;
  },

  getMockData() {
    return [
      { _id: 'n1', name: '函数定义', type: 'concept', mastery: 95, chapter: '必修1-第二章', difficulty: 0.3 },
      { _id: 'n2', name: '一次函数', type: 'model', mastery: 92, chapter: '必修1-第二章', difficulty: 0.4 },
      { _id: 'n3', name: '二次函数基础', type: 'concept', mastery: 72, chapter: '必修1-第三章', difficulty: 0.5 },
      { _id: 'n4', name: '配方法', type: 'skill', mastery: 55, chapter: '必修1-第三章', difficulty: 0.5 },
      { _id: 'n5', name: '因式分解', type: 'skill', mastery: 88, chapter: '必修1-第二章', difficulty: 0.4 },
      { _id: 'n6', name: '二次函数顶点', type: 'concept', mastery: 23, chapter: '必修1-第三章', difficulty: 0.6 }
    ];
  },

  openAdd() {
    this.setData({
      showForm: true, editNode: null,
      formData: { name: '', type: 'concept', typeName: '概念', chapter: '', difficulty: 0.5, deps: '' }
    });
  },

  openEdit(e) {
    const node = e.currentTarget.dataset.node;
    if (!node) return;
    const t = node.type || 'concept';
    this.setData({
      showForm: true, editNode: node,
      formData: {
        name: node.name || '',
        type: t,
        typeName: { 'concept':'概念', 'model':'模型', 'skill':'技能' }[t] || t,
        chapter: node.chapter || '',
        difficulty: node.difficulty || 0.5,
        deps: (node.deps || []).join(', ')
      }
    });
  },

  closeForm() {
    this.setData({ showForm: false, editNode: null });
  },

  onTypeChange(e) {
    const idx = parseInt(e.detail.value);
    const types = ['concept', 'model', 'skill'];
    const names = ['概念', '模型', '技能'];
    this.setData({
      'formData.type': types[idx],
      'formData.typeName': names[idx]
    });
  },

  onFormInput(e) {
    const field = e.currentTarget.dataset.field;
    const val = e.detail.value;
    this.setData({ [`formData.${field}`]: val });
  },

  saveNode() {
    const fd = this.data.formData;
    if (!fd.name) { wx.showToast({ title: '名称不能为空', icon: 'none' }); return; }

    const data = {
      name: fd.name,
      type: fd.type,
      chapter: fd.chapter,
      difficulty: parseFloat(fd.difficulty) || 0.5,
      deps: fd.deps ? fd.deps.split(',').map(s => s.trim()).filter(Boolean) : []
    };

    const action = this.data.editNode ? 'update' : 'add';
    const params = { action, data };
    if (this.data.editNode) params.nodeId = this.data.editNode._id;
    else data.subjectId = this.getSubjectId(this.data.currentSubject);

    wx.cloud.callFunction({ name: 'manageKnowledge', data: params }).then(res => {
      if (res.result && res.result.code === 0) {
        wx.showToast({ title: '保存成功', icon: 'success' });
        this.closeForm();
        this.loadNodes();
      }
    }).catch(() => {
      wx.showToast({ title: '云函数未部署，模拟保存成功', icon: 'success' });
      this.closeForm();
    });
  },

  deleteNode(e) {
    const node = e.currentTarget.dataset.node;
    if (!node) return;
    wx.showModal({
      title: '确认删除',
      content: `删除「${node.name}」？`,
      success: (r) => {
        if (r.confirm) {
          wx.cloud.callFunction({ name: 'manageKnowledge', data: { action: 'delete', nodeId: node._id } })
            .then(() => this.loadNodes())
            .catch(() => {
              wx.showToast({ title: '模拟删除成功', icon: 'success' });
              this.loadNodes();
            });
        }
      }
    });
  },

  getTypeName(t) {
    return { 'concept': '概念', 'model': '模型', 'skill': '技能' }[t] || t;
  },

  goBack() {
    wx.navigateBack();
  },

  getColor(m) {
    if (m >= 75) return '#34c759';
    if (m >= 50) return '#ff9500';
    if (m > 0) return '#ff3b30';
    return '#c7c7cc';
  }
});
