const app = getApp();

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
    ],
    // 动画状态
    animationScale: 1,
    animationOffsetX: 0,
    animationOffsetY: 0,
    canvasSize: 0,
    // 节点位置（在全景模式下计算）
    nodesPos: [],
    centerPos: {}
  },

  onLoad() {
    const size = Math.min(600, wx.getSystemInfoSync().windowWidth);
    this.setData({ canvasSize: size });
  },

  onShow() {
    this.drawGraph();
  },

  changeSubject(e) {
    const idx = e.detail.value;
    this.setData({
      subjectIndex: idx,
      currentSubject: this.data.subjects[idx],
      isZoomed: false,
      zoomedDim: null,
      showDetailBtn: false,
      animationScale: 1,
      animationOffsetX: 0,
      animationOffsetY: 0
    });
    this.drawGraph();
  },

  getNodePositions(size) {
    const cx = size / 2, cy = size / 2;
    const orbitR = Math.min(size * 0.3, 140);
    const dims = this.data.dimensions;
    const n = dims.length;
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

  drawGraph(scale = 1, offsetX = 0, offsetY = 0) {
    const query = wx.createSelectorQuery();
    query.select('#graphCanvas').node((res) => {
      if (!res || !res.node) return;
      const canvas = res.node;
      const ctx = canvas.getContext('2d');
      const dpr = wx.getSystemInfoSync().pixelRatio;
      const size = this.data.canvasSize || Math.min(600, wx.getSystemInfoSync().windowWidth);
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      ctx.scale(dpr, dpr);

      // 清空
      ctx.clearRect(0, 0, size, size);

      // 应用变换
      ctx.save();
      const cx = size / 2, cy = size / 2;
      ctx.translate(cx + offsetX, cy + offsetY);
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);

      const { positions, orbitR } = this.getNodePositions(size);
      const dims = this.data.dimensions;
      const n = dims.length;

      // 画连接线（节点之间互相连接）
      ctx.lineWidth = 2 / scale;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          ctx.beginPath();
          ctx.moveTo(positions[i].x, positions[i].y);
          ctx.lineTo(positions[j].x, positions[j].y);
          ctx.strokeStyle = dims[i].color + '30';
          ctx.lineWidth = 1.5 / scale;
          ctx.stroke();
        }
      }

      // 画中心到各节点的线
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(positions[i].x, positions[i].y);
        ctx.strokeStyle = dims[i].color + '50';
        ctx.lineWidth = 2 / scale;
        ctx.setLineDash([6 / scale, 4 / scale]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 画中心节点（学科）
      const centerR = 56 / scale;
      const grad = ctx.createRadialGradient(cx - 8 / scale, cy - 8 / scale, 0, cx, cy, centerR);
      grad.addColorStop(0, '#4d9fff');
      grad.addColorStop(1, '#007aff');
      ctx.beginPath();
      ctx.arc(cx, cy, centerR, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.shadowColor = 'rgba(0, 122, 255, 0.25)';
      ctx.shadowBlur = 16 / scale;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#fff';
      const subjFontSize = Math.max(24, 28 / scale);
      ctx.font = `bold ${subjFontSize}rpx sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.data.currentSubject, cx, cy);

      // 保存中心节点位置
      this.data.centerPos = { x: cx, y: cy, r: centerR };

      // 画五个维度节点
      const nodeR = 46 / scale;
      const positions2 = [];
      for (let i = 0; i < n; i++) {
        const dim = dims[i];
        const pos = positions[i];

        // 节点阴影
        ctx.shadowColor = 'rgba(0,0,0,0.06)';
        ctx.shadowBlur = 10 / scale;

        // 节点背景
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, nodeR, 0, Math.PI * 2);
        ctx.fillStyle = dim.color + '18';
        ctx.fill();

        // 节点描边
        ctx.shadowBlur = 0;
        ctx.strokeStyle = dim.color;
        ctx.lineWidth = 2.5 / scale;
        ctx.stroke();

        // 节点内信息
        const iconSize = Math.max(28, 36 / scale);
        ctx.font = `${iconSize}rpx sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(dim.icon, pos.x, pos.y - 18 / scale);

        const valSize = Math.max(18, 22 / scale);
        ctx.font = `bold ${valSize}rpx sans-serif`;
        ctx.fillStyle = dim.color;
        ctx.fillText(dim.value + '%', pos.x, pos.y + 14 / scale);

        const nameSize = Math.max(16, 18 / scale);
        ctx.font = `${nameSize}rpx sans-serif`;
        ctx.fillStyle = '#666';
        ctx.fillText(dim.id, pos.x, pos.y + nodeR + 16 / scale);

        positions2.push({ x: pos.x, y: pos.y, r: nodeR, dim: dim });
      }

      this.data.nodesPos = positions2;

      ctx.restore();
    }).exec();
  },

  onCanvasTap(e) {
    const touch = e.detail;
    if (!touch || !touch.x) return;

    const query = wx.createSelectorQuery();
    query.select('#graphCanvas').boundingClientRect((rect) => {
      if (!rect) return;
      const dpr = wx.getSystemInfoSync().pixelRatio;
      const size = this.data.canvasSize;
      const cx = size / 2, cy = size / 2;

      // 转换触点到canvas坐标系
      const tx = touch.x - rect.left;
      const ty = touch.y - rect.top;

      const scale = this.data.animationScale;
      const offX = this.data.animationOffsetX;
      const offY = this.data.animationOffsetY;

      // 如果已缩放，检查是否点击了空白区域来退出
      if (this.data.isZoomed) {
        // 检查是否点击了"查看详情"按钮区域（在画布底部）
        const btnY = size - 120;
        if (ty > btnY && ty < btnY + 80 && tx > size * 0.2 && tx < size * 0.8) {
          // 点击了查看详情按钮
          this.goDetail();
          return;
        }
        // 检查是否点击到被聚焦的节点
        const zDim = this.data.zoomedDim;
        const idx = this.data.dimensions.findIndex(d => d.id === zDim.id);
        const { positions } = this.getNodePositions(size);
        // 在缩放状态下，节点的实际位置
        // 需要逆转换
        const canvasX = (tx - cx - offX) / scale + cx;
        const canvasY = (ty - cy - offY) / scale + cy;
        const nodeR = 46 / scale;
        const dist = Math.sqrt((canvasX - positions[idx].x) ** 2 + (canvasY - positions[idx].y) ** 2);
        if (dist <= nodeR + 10 / scale) {
          // 点击了已放大的节点，不做操作
          return;
        }
        // 点击其他区域 → 退出缩放
        this.zoomOut();
        return;
      }

      // 全景模式下，检查是否点击了某个节点
      const nodes = this.data.nodesPos;
      for (let i = 0; i < nodes.length; i++) {
        const dist = Math.sqrt((tx - nodes[i].x) ** 2 + (ty - nodes[i].y) ** 2);
        if (dist <= nodes[i].r + 5) {
          this.zoomToNode(nodes[i].dim, i);
          return;
        }
      }

      // 检查是否点击了中心节点
      const center = this.data.centerPos;
      if (center) {
        const dist = Math.sqrt((tx - center.x) ** 2 + (ty - center.y) ** 2);
        if (dist <= center.r) {
          wx.showToast({ title: this.data.currentSubject, icon: 'none' });
        }
      }
    }).exec();
  },

  zoomToNode(dim, index) {
    const size = this.data.canvasSize;
    const cx = size / 2, cy = size / 2;
    const { positions } = this.getNodePositions(size);
    const targetX = positions[index].x;
    const targetY = positions[index].y;

    // 计算偏移量：让目标节点移到屏幕中心
    const targetScale = 2.5;
    const targetOffX = (cx - targetX) * targetScale;
    const targetOffY = (cy - targetY) * targetScale;
    // 加上中心偏移修正
    const finalOffX = targetOffX;
    const finalOffY = targetOffY;

    this.setData({
      isZoomed: true,
      zoomedDim: dim
    });

    // 动画插值
    this.animateZoom(1, 0, 0, targetScale, finalOffX, finalOffY, () => {
      this.setData({ showDetailBtn: true });
    });
  },

  zoomOut() {
    this.setData({ showDetailBtn: false });
    const currentScale = this.data.animationScale;
    const currentOffX = this.data.animationOffsetX;
    const currentOffY = this.data.animationOffsetY;

    this.animateZoom(currentScale, currentOffX, currentOffY, 1, 0, 0, () => {
      this.setData({
        isZoomed: false,
        zoomedDim: null
      });
    });
  },

  animateZoom(fromScale, fromOffX, fromOffY, toScale, toOffX, toOffY, callback) {
    const duration = 300;
    const startTime = Date.now();

    const step = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out 缓动
      const ease = 1 - Math.pow(1 - progress, 3);

      const s = fromScale + (toScale - fromScale) * ease;
      const ox = fromOffX + (toOffX - fromOffX) * ease;
      const oy = fromOffY + (toOffY - fromOffY) * ease;

      this.setData({
        animationScale: s,
        animationOffsetX: ox,
        animationOffsetY: oy
      });

      this.drawGraph(s, ox, oy);

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        if (callback) callback();
      }
    };
    step();
  },

  goDetail() {
    const dim = this.data.zoomedDim;
    if (!dim) return;
    wx.navigateTo({
      url: `/pages/dimension-detail/dimension-detail?dim=${dim.id}&name=${dim.name}&icon=${dim.icon}&value=${dim.value}&color=${encodeURIComponent(dim.color)}&subject=${this.data.currentSubject}`
    });
  }
});
