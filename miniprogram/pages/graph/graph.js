const app = getApp();
const systemInfo = wx.getSystemInfoSync();
const pxRatio = systemInfo.windowWidth / 750; // rpx 转 px

Page({
  data: {
    subjects: ['数学', '英语', '物理', '语文', '化学', '生物', '政治', '历史', '地理'],
    subjectIndex: 0,
    currentSubject: '数学',
    isZoomed: false,
    zoomedDim: null,
    showDetailBtn: false,
    dimensions: [
      { id: 'K', name: '知识掌握', icon: '📖', color: '#007aff', value: 57, desc: '概念·模型·技能的掌握程度' },
      { id: 'A', name: '能力水平', icon: '📊', color: '#34c759', value: 72, desc: '学科综合能力指数' },
      { id: 'T', name: '迁移能力', icon: '🔄', color: '#ff9500', value: 45, desc: '陌生场景调用知识的能力' },
      { id: 'S', name: '执行稳定', icon: '🎯', color: '#ff3b30', value: 68, desc: '发挥一致性与计算准确率' },
      { id: 'Q', name: '思维品质', icon: '🧠', color: '#af52de', value: 55, desc: '反思习惯与策略意识' }
    ]
  },

  // 内部状态（不用 setData，避免性能浪费）
  _canvas: null,
  _ctx: null,
  _dpr: 1,
  _size: 0,
  _scale: 1,
  _offX: 0,
  _offY: 0,
  _animTimer: null,
  _nodePositions: [],
  _centerPos: null,

  onLoad() {
    this._size = Math.min(600, systemInfo.windowWidth);
    this._dpr = systemInfo.pixelRatio;
  },

  onShow() {
    this.initCanvas();
  },

  onUnload() {
    if (this._animTimer) {
      clearTimeout(this._animTimer);
      this._animTimer = null;
    }
  },

  initCanvas() {
    const query = wx.createSelectorQuery();
    query.select('#graphCanvas').node((res) => {
      if (!res || !res.node) return;
      this._canvas = res.node;
      this._ctx = this._canvas.getContext('2d');
      this.drawGraph();
    }).exec();
  },

  changeSubject(e) {
    const idx = e.detail.value;
    this.setData({
      subjectIndex: idx,
      currentSubject: this.data.subjects[idx],
      isZoomed: false,
      zoomedDim: null,
      showDetailBtn: false
    });
    this._scale = 1;
    this._offX = 0;
    this._offY = 0;
    this.drawGraph();
  },

  // 计算五个维度的位置（相对于canvas逻辑坐标系）
  getNodePositions() {
    const s = this._size;
    const cx = s / 2, cy = s / 2;
    const orbitR = Math.min(s * 0.3, 140);
    const n = this.data.dimensions.length;
    const positions = [];
    for (let i = 0; i < n; i++) {
      const angle = (i * 2 * Math.PI / n) - Math.PI / 2;
      positions.push({
        x: cx + orbitR * Math.cos(angle),
        y: cy + orbitR * Math.sin(angle)
      });
    }
    return { cx, cy, positions, orbitR };
  },

  drawGraph() {
    const canvas = this._canvas;
    const ctx = this._ctx;
    if (!canvas || !ctx) return;

    const dpr = this._dpr;
    const size = this._size;
    const scale = this._scale;
    const offX = this._offX;
    const offY = this._offY;

    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    // 应用镜头变换
    ctx.save();
    const cx = size / 2, cy = size / 2;
    ctx.translate(cx + offX, cy + offY);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);

    const { positions, orbitR } = this.getNodePositions();
    const dims = this.data.dimensions;
    const n = dims.length;

    // 画节点间连接线（五边形）
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        ctx.beginPath();
        ctx.moveTo(positions[i].x, positions[i].y);
        ctx.lineTo(positions[j].x, positions[j].y);
        ctx.strokeStyle = '#e8e8ed';
        ctx.lineWidth = 1.5 / scale;
        ctx.stroke();
      }
    }

    // 画中心到各节点的虚线
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(positions[i].x, positions[i].y);
      ctx.strokeStyle = dims[i].color + '40';
      ctx.lineWidth = 2 / scale;
      ctx.setLineDash([4 / scale, 3 / scale]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 画中心节点（学科）
    const centerR = 56 / scale;
    ctx.shadowColor = 'rgba(0, 122, 255, 0.2)';
    ctx.shadowBlur = 20 / scale;
    ctx.beginPath();
    ctx.arc(cx, cy, centerR, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(cx - 10 / scale, cy - 10 / scale, 0, cx, cy, centerR);
    grad.addColorStop(0, '#4d9fff');
    grad.addColorStop(1, '#007aff');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const subjSize = Math.max(12, Math.round(28 / scale));
    ctx.font = `bold ${subjSize}px -apple-system, sans-serif`;
    ctx.fillText(this.data.currentSubject, cx, cy);

    this._centerPos = { x: cx, y: cy, r: centerR };

    // 画五个维度节点
    const nodeR = 46 / scale;
    const nodePositions = [];
    for (let i = 0; i < n; i++) {
      const dim = dims[i];
      const pos = positions[i];

      ctx.shadowColor = 'rgba(0,0,0,0.05)';
      ctx.shadowBlur = 8 / scale;

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, nodeR, 0, Math.PI * 2);
      ctx.fillStyle = dim.color + '15';
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.strokeStyle = dim.color;
      ctx.lineWidth = 2.5 / scale;
      ctx.stroke();

      // 图标
      const iconSize = Math.max(14, Math.round(32 / scale));
      ctx.font = `${iconSize}px -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(dim.icon, pos.x, pos.y - 12 / scale);

      // 数值
      const valSize = Math.max(10, Math.round(20 / scale));
      ctx.font = `bold ${valSize}px -apple-system, sans-serif`;
      ctx.fillStyle = dim.color;
      ctx.fillText(dim.value + '%', pos.x, pos.y + 14 / scale);

      // 标签
      const labelSize = Math.max(8, Math.round(16 / scale));
      ctx.font = `${labelSize}px -apple-system, sans-serif`;
      ctx.fillStyle = '#8e8e93';
      ctx.fillText(dim.id, pos.x, pos.y + nodeR + 14 / scale);

      nodePositions.push({ x: pos.x, y: pos.y, r: nodeR, dimIdx: i });
    }

    this._nodePositions = nodePositions;
    ctx.restore();
  },

  onCanvasTap(e) {
    const touch = e.touches[0];
    if (!touch) return;
    // 放大状态下，遮罩层会截获点击，不会走到这里
    if (this.data.isZoomed) return;

    const query = wx.createSelectorQuery();
    query.select('#graphCanvas').boundingClientRect((rect) => {
      if (!rect) return;
      const tx = touch.x - rect.left;
      const ty = touch.y - rect.top;
      const size = this._size;

      // 检查节点点击
      const nodes = this._nodePositions;
      for (let i = 0; i < nodes.length; i++) {
        const dist = Math.sqrt((tx - nodes[i].x) ** 2 + (ty - nodes[i].y) ** 2);
        if (dist <= nodes[i].r + 8) {
          this.zoomToNode(nodes[i].dimIdx);
          return;
        }
      }

      // 中心节点
      if (this._centerPos) {
        const dist = Math.sqrt((tx - this._centerPos.x) ** 2 + (ty - this._centerPos.y) ** 2);
        if (dist <= this._centerPos.r) {
          wx.showToast({ title: this.data.currentSubject, icon: 'none' });
        }
      }
    }).exec();
  },

  zoomToNode(dimIdx) {
    const size = this._size;
    const cx = size / 2, cy = size / 2;
    const { positions } = this.getNodePositions();
    const target = positions[dimIdx];
    const dim = this.data.dimensions[dimIdx];

    const targetScale = 2.5;
    const targetOffX = (cx - target.x) * targetScale;
    const targetOffY = (cy - target.y) * targetScale;

    this.setData({
      isZoomed: true,
      zoomedDim: dim,
      showDetailBtn: false
    });

    this.animateZoom(1, 0, 0, targetScale, targetOffX, targetOffY, () => {
      this.setData({ showDetailBtn: true });
    });
  },

  zoomOut() {
    this.setData({ showDetailBtn: false });
    const cs = this._scale, cox = this._offX, coy = this._offY;
    this.animateZoom(cs, cox, coy, 1, 0, 0, () => {
      this.setData({ isZoomed: false, zoomedDim: null });
    });
  },

  animateZoom(fromS, fromX, fromY, toS, toX, toY, callback) {
    const duration = 300;
    const start = Date.now();

    const step = () => {
      const elapsed = Date.now() - start;
      const p = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const ease = 1 - Math.pow(1 - p, 3);

      this._scale = fromS + (toS - fromS) * ease;
      this._offX = fromX + (toX - fromX) * ease;
      this._offY = fromY + (toY - fromY) * ease;

      this.drawGraph();

      if (p < 1) {
        this._animTimer = setTimeout(step, 16);
      } else {
        this._scale = toS;
        this._offX = toX;
        this._offY = toY;
        this.drawGraph();
        if (callback) callback();
      }
    };
    step();
  },

  goDetail() {
    const dim = this.data.zoomedDim;
    if (!dim) return;
    wx.navigateTo({
      url: `/pages/dimension-detail/dimension-detail?dim=${dim.id}&name=${encodeURIComponent(dim.name)}&icon=${dim.icon}&value=${dim.value}&color=${encodeURIComponent(dim.color)}&subject=${encodeURIComponent(this.data.currentSubject)}`
    });
  }
});
