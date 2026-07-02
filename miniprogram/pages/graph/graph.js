const app = getApp();

Page({
  data: {
    subjects: ['数学', '英语', '物理', '语文', '化学', '生物', '政治', '历史', '地理'],
    subjectIndex: 0,
    currentSubject: '数学',
    selectedDim: null,
    showDetail: false,
    dimensions: [
      { id: 'K', name: '知识掌握', icon: '📖', color: '#007aff', value: 57, desc: '概念、模型、技能的掌握程度' },
      { id: 'A', name: '能力水平', icon: '📊', color: '#34c759', value: 72, desc: '学科综合能力指数 θ' },
      { id: 'T', name: '迁移能力', icon: '🔄', color: '#ff9500', value: 45, desc: '陌生场景调用已有知识的能力' },
      { id: 'S', name: '执行稳定', icon: '🎯', color: '#ff3b30', value: 68, desc: '考试发挥一致性与计算准确率' },
      { id: 'Q', name: '思维品质', icon: '🧠', color: '#af52de', value: 55, desc: '反思习惯、策略意识、学习自主性' }
    ],
    detailNodes: []
  },

  onLoad() {
    this.drawGraph();
  },

  onShow() {
    this.drawGraph();
  },

  changeSubject(e) {
    const idx = e.detail.value;
    this.setData({
      subjectIndex: idx,
      currentSubject: this.data.subjects[idx],
      selectedDim: null,
      showDetail: false
    });
    this.drawGraph();
  },

  drawGraph() {
    const query = wx.createSelectorQuery();
    query.select('#graphCanvas').node((res) => {
      if (!res || !res.node) return;
      const canvas = res.node;
      const ctx = canvas.getContext('2d');
      const dpr = wx.getSystemInfoSync().pixelRatio;
      const size = Math.min(600, wx.getSystemInfoSync().windowWidth);
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      ctx.scale(dpr, dpr);

      const cx = size / 2, cy = size / 2;
      const centerR = 56;
      const nodeR = 44;
      const orbitR = Math.min(size * 0.32, 150);

      // 画连接线（中心→五维）
      const dims = this.data.dimensions;
      const n = dims.length;
      for (let i = 0; i < n; i++) {
        const angle = (i * 2 * Math.PI / n) - Math.PI / 2;
        const nx = cx + orbitR * Math.cos(angle);
        const ny = cy + orbitR * Math.sin(angle);

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(nx, ny);
        ctx.strokeStyle = '#d1d1d6';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 画中心节点（学科）
      const grad = ctx.createRadialGradient(cx - 10, cy - 10, 0, cx, cy, centerR);
      grad.addColorStop(0, '#4d9fff');
      grad.addColorStop(1, '#007aff');
      ctx.beginPath();
      ctx.arc(cx, cy, centerR, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.shadowColor = 'rgba(0, 122, 255, 0.3)';
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 28rpx sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.data.currentSubject, cx, cy);

      // 画五个维度节点
      for (let i = 0; i < n; i++) {
        const angle = (i * 2 * Math.PI / n) - Math.PI / 2;
        const nx = cx + orbitR * Math.cos(angle);
        const ny = cy + orbitR * Math.sin(angle);
        const dim = dims[i];

        // 节点圆
        ctx.beginPath();
        ctx.arc(nx, ny, nodeR, 0, Math.PI * 2);
        ctx.fillStyle = dim.color + '20';
        ctx.fill();
        ctx.strokeStyle = dim.color;
        ctx.lineWidth = 2;
        ctx.stroke();

        // 维度图标
        ctx.font = '32rpx sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(dim.icon, nx, ny - 8);

        // 维度名称
        ctx.font = '18rpx sans-serif';
        ctx.fillStyle = '#333';
        ctx.fillText(dim.id, nx, ny + 22);

        // 数值
        ctx.font = 'bold 20rpx sans-serif';
        ctx.fillStyle = dim.color;
        ctx.fillText(dim.value + '%', nx, ny + nodeR + 26);
      }

      // 底部提示
      ctx.font = '22rpx sans-serif';
      ctx.fillStyle = '#8e8e93';
      ctx.textAlign = 'center';
      ctx.fillText('点击维度节点查看详情', cx, size - 30);
    }).exec();
  },

  onCanvasTap(e) {
    const touch = e.detail;
    if (!touch || !touch.x) return;

    const query = wx.createSelectorQuery();
    query.select('#graphCanvas').boundingClientRect((rect) => {
      if (!rect) return;
      const canvasLeft = rect.left;
      const canvasTop = rect.top;
      const dpr = wx.getSystemInfoSync().pixelRatio;
      const size = Math.min(600, wx.getSystemInfoSync().windowWidth);
      const cx = size / 2, cy = size / 2;
      const orbitR = Math.min(size * 0.32, 150);
      const nodeR = 44;

      // 将触摸点转换到canvas坐标系
      const tx = (touch.x - canvasLeft) * dpr;
      const ty = (touch.y - canvasTop) * dpr;

      // 检查是否点到中心节点
      const distToCenter = Math.sqrt((tx/dpr - cx) ** 2 + (ty/dpr - cy) ** 2);
      if (distToCenter <= 56) {
        wx.showToast({ title: this.data.currentSubject, icon: 'none' });
        return;
      }

      // 检查是否点到某个维度节点
      const dims = this.data.dimensions;
      for (let i = 0; i < dims.length; i++) {
        const angle = (i * 2 * Math.PI / dims.length) - Math.PI / 2;
        const nx = cx + orbitR * Math.cos(angle);
        const ny = cy + orbitR * Math.sin(angle);
        const dist = Math.sqrt((tx/dpr - nx) ** 2 + (ty/dpr - ny) ** 2);
        if (dist <= nodeR) {
          this.openDimDetail(dims[i]);
          return;
        }
      }
    }).exec();
  },

  openDimDetail(dim) {
    // 加载该维度的详情数据
    const mockNodes = {
      'K': [
        { name: '一次函数', status: 'mastered', mastery: 92 },
        { name: '二次函数基础', status: 'mastered', mastery: 85 },
        { name: '二次函数顶点坐标', status: 'weak', mastery: 23 },
        { name: '配方法', status: 'learning', mastery: 55 },
        { name: '因式分解', status: 'mastered', mastery: 90 },
        { name: '换元法', status: 'weak', mastery: 10 },
        { name: '一元二次方程', status: 'learning', mastery: 45 },
        { name: '三角函数模型', status: 'untouched', mastery: 0 }
      ],
      'A': [
        { name: '计算力', status: 'learning', mastery: 72 },
        { name: '建模力', status: 'learning', mastery: 58 },
        { name: '联系力', status: 'weak', mastery: 40 },
        { name: '迁移力', status: 'weak', mastery: 35 },
        { name: '技巧储备', status: 'learning', mastery: 65 }
      ],
      'T': [
        { name: '综合题正确率', status: 'weak', mastery: 45 },
        { name: '解法多样性', status: 'learning', mastery: 3 },
        { name: '跨章节调用', status: 'weak', mastery: 30 }
      ],
      'S': [
        { name: '计算失误率', status: 'learning', mastery: 20 },
        { name: '发挥一致性', status: 'learning', mastery: 68 },
        { name: '时间管理', status: 'mastered', mastery: 75 }
      ],
      'Q': [
        { name: '反思习惯', status: 'learning', mastery: 55 },
        { name: '策略意识', status: 'weak', mastery: 40 },
        { name: '学习自主性', status: 'learning', mastery: 60 }
      ]
    };

    this.setData({
      selectedDim: dim,
      detailNodes: mockNodes[dim.id] || [],
      showDetail: true
    });
  },

  closeDetail() {
    this.setData({
      showDetail: false,
      selectedDim: null
    });
  },

  goStudy(e) {
    const node = e.currentTarget.dataset.node;
    wx.switchTab({ url: '/pages/study/study' });
  }
});
