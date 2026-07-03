const app = getApp();
const sys = wx.getSystemInfoSync();

// rpx → px 统一转换
const rpx = (v) => sys.windowWidth / 750 * v;

// 单一主色体系：iOS 蓝
const INK = {
  primary:    '#1d1d1f',
  secondary:  '#6e6e73',
  tertiary:   '#a1a1a6',
  accent:     '#007aff',
  accentDeep: '#004ecb',
  accentMid:  '#4a9eff',
  accentSoft: '#aad4ff',
  accentBg:   'rgba(0,122,255,0.06)',
  track:      '#e5e5ea',
  white:      '#ffffff'
};

Page({
  data: {
    subjects: ['数学', '英语', '物理', '语文', '化学', '生物', '政治', '历史', '地理'],
    subjectIndex: 0,
    currentSubject: '数学',
    isZoomed: false,
    zoomedTarget: null,
    showInfo: false,
    showDetailBtn: false,
    zoomedData: null,
    pageReady: false,
    canvasStyle: '',
    dimensions: [
      { id: 'K', name: '知识掌握', value: 57, color: '#007aff', desc: '概念·模型·技能的掌握程度' },
      { id: 'A', name: '能力水平', value: 72, color: '#34c759', desc: '学科综合能力指数' },
      { id: 'T', name: '迁移能力', value: 45, color: '#ff9500', desc: '陌生场景调用知识的能力' },
      { id: 'Q', name: '思维品质', value: 55, color: '#af52de', desc: '反思习惯与策略意识' },
      { id: 'S', name: '执行稳定', value: 68, color: '#ff3b30', desc: '发挥一致性与计算准确率' }
    ],
    centerDesc: '五维能力综合评估'
  },

  _canvas: null,
  _ctx: null,
  _dpr: 1,
  _size: 0,
  _scale: 1,
  _offX: 0,
  _offY: 0,
  _animTimer: null,
  _revealProgress: 0,
  _nodePositions: [],
  _centerPos: null,
  _cachedLayout: null,
  _inited: false,

  onLoad() {
    this._dpr = sys.pixelRatio;
  },

  onShow() {
    this.setData({ pageReady: false });
    setTimeout(() => this.setData({ pageReady: true }), 16);
    // 从详情页返回时，立即重置并重绘，不留停留
    if (this.data.isZoomed) {
      this.cancelAnim();
      this._scale = 1;
      this._offX = 0;
      this._offY = 0;
      this._revealProgress = 1;  // 跳过入场动画
      this._exitProgress = -1;
      this.setData({
        isZoomed: false,
        zoomedTarget: null,
        showInfo: false,
        showDetailBtn: false,
        zoomedData: null
      });
      // 立即重绘，不等 320ms
      if (this._inited && this._canvas) {
        this.drawGraph();
      } else {
        this.initCanvas();
      }
      return;
    }
    // Canvas 在页面淡入完成后初始化
    setTimeout(() => this.initCanvas(), 320);
  },

  onUnload() {
    this.cancelAnim();
  },

  onHide() {
    this.cancelAnim();
  },

  cancelAnim() {
    if (this._animTimer) {
      if (this._canvas && this._canvas.cancelAnimationFrame) {
        try { this._canvas.cancelAnimationFrame(this._animTimer); } catch (e) {}
      }
      clearTimeout(this._animTimer);
      this._animTimer = null;
    }
  },

  initCanvas() {
    if (this._inited && this._canvas) {
      // 已初始化，只重绘
      this.playReveal();
      return;
    }
    const query = wx.createSelectorQuery();
    query.select('.canvas-stage').boundingClientRect();
    query.select('#graphCanvas').node();
    query.exec((res) => {
      if (!res || !res[0] || !res[1] || !res[1].node) return;
      const rect = res[0];
      const size = Math.min(rect.width, rect.height);
      if (size <= 0) return;
      this._size = size;
      this.setData({ canvasStyle: `width:${size}px;height:${size}px;` });
      console.log('[graph] init canvas:', { stageRect: rect, size, dpr: this._dpr });
      this._canvas = res[1].node;
      this._ctx = this._canvas.getContext('2d');
      this._canvas.width = size * this._dpr;
      this._canvas.height = size * this._dpr;
      this._ctx.scale(this._dpr, this._dpr);
      this._cachedLayout = this.getNodePositions();
      this.updateHitTargets();
      console.log('[graph] nodePositions:', JSON.stringify(this._nodePositions.map(p => ({x:p.x, y:p.y, r:p.r}))));
      this._inited = true;
      this.playReveal();
    });
  },

  playReveal() {
    this.cancelAnim();
    this._revealProgress = 0;
    this._scale = 1;
    this._offX = 0;
    this._offY = 0;
    const start = Date.now();
    const duration = 800;
    const step = () => {
      const elapsed = Date.now() - start;
      const p = Math.min(elapsed / duration, 1);
      this._revealProgress = 1 - Math.pow(1 - p, 3);
      this.drawGraph();
      if (p < 1) {
        this._animTimer = this._canvas.requestAnimationFrame(step);
      } else {
        this._animTimer = null;
      }
    };
    this._animTimer = this._canvas.requestAnimationFrame(step);
  },

  changeSubject(e) {
    const idx = e.detail.value;
    this.setData({
      subjectIndex: idx,
      currentSubject: this.data.subjects[idx],
      isZoomed: false,
      zoomedTarget: null,
      showInfo: false,
      showDetailBtn: false,
      zoomedData: null
    });
    this.playReveal();
  },

  getNodePositions() {
    const s = this._size;
    const cx = s / 2, cy = s / 2;
    const orbitR = s * 0.37;
    const n = this.data.dimensions.length;
    const positions = [];
    for (let i = 0; i < n; i++) {
      const angle = (i * 2 * Math.PI / n) - Math.PI / 2;
      positions.push({
        x: cx + orbitR * Math.cos(angle),
        y: cy + orbitR * Math.sin(angle),
        angle
      });
    }
    return { cx, cy, positions, orbitR };
  },

  drawGraph() {
    const ctx = this._ctx;
    if (!ctx || !this._cachedLayout) return;

    const size = this._size;
    const scale = this._scale;
    const offX = this._offX;
    const offY = this._offY;
    const zoomedTarget = this.data.zoomedTarget;
    const isZoomed = this.data.isZoomed;
    const reveal = this._revealProgress;

    // 清空（在 dpr scale 坐标系下）
    ctx.clearRect(0, 0, size, size);

    // 镜头变换
    ctx.save();
    const cx = size / 2, cy = size / 2;
    ctx.translate(cx + offX, cy + offY);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);

    const positions = this._cachedLayout.positions;
    const dims = this.data.dimensions;
    const n = dims.length;

    const dimAlpha = (idx) => {
      if (!isZoomed) return 1;
      // 退出过程中：其他节点 alpha 随 exitProgress 恢复
      if (this._exitProgress >= 0) {
        const t = this._exitProgress;
        if (zoomedTarget === 'center') return idx === -1 ? 1 : 0.15 + 0.85 * t;
        if (zoomedTarget === idx) return 1;
        return 0.15 + 0.85 * t;
      }
      if (zoomedTarget === 'center') return idx === -1 ? 1 : 0.15;
      if (zoomedTarget === idx) return 1;
      return 0.15;
    };
    // 初始化 _exitProgress（-1 表示非退出状态）
    if (this._exitProgress === undefined) this._exitProgress = -1;

    // zoomT: 选中节点的尺寸插值因子（0=放大态, 1=默认态）
    // 退出时从 0→1 平滑过渡，避免尺寸突变
    const selZoomT = this._exitProgress >= 0 ? this._exitProgress : 0;

    // 1. 连线
    for (let i = 0; i < n; i++) {
      const a = dimAlpha(i);
      if (a < 0.02) continue;
      const target = positions[i];
      const lineRevealStart = i * 0.1;
      const lineP = Math.max(0, Math.min(1, (reveal - lineRevealStart) / 0.4));
      if (lineP < 0.01) continue;

      const dx = target.x - cx;
      const dy = target.y - cy;
      const dist = Math.hypot(dx, dy);
      const nodeR = rpx(84);
      const centerR = rpx(110);
      // 单位方向向量
      const ux = dx / dist;
      const uy = dy / dist;
      // 线起点：中心节点边缘（紧贴）
      const startX = cx + ux * centerR;
      const startY = cy + uy * centerR;
      // 线终点：维度节点边缘（紧贴）
      const endXFull = cx + ux * (dist - nodeR);
      const endYFull = cy + uy * (dist - nodeR);
      // 入场动画：从起点向终点绘制
      const endX = startX + (endXFull - startX) * lineP;
      const endY = startY + (endYFull - startY) * lineP;

      ctx.globalAlpha = a * lineP;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.strokeStyle = INK.accent;
      ctx.lineWidth = (zoomedTarget === i ? 2 : 1) / scale;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // 2. 中心节点
    const centerReveal = Math.max(0, Math.min(1, (reveal - 0.05) / 0.3));
    if (centerReveal > 0.01) {
      const centerZoomT = zoomedTarget === 'center' ? selZoomT : 1;
      this.drawCenterNode(ctx, cx, cy, scale, dimAlpha(-1) * centerReveal, centerZoomT);
    }

    // 3. 维度节点
    for (let i = 0; i < n; i++) {
      const nodeReveal = Math.max(0, Math.min(1, (reveal - 0.3 - i * 0.1) / 0.3));
      if (nodeReveal < 0.01) continue;
      const dim = dims[i];
      const pos = positions[i];
      const dimZoomT = zoomedTarget === i ? selZoomT : 1;
      this.drawDimNode(ctx, pos.x, pos.y, scale, dimAlpha(i) * nodeReveal, dim, dimZoomT, nodeReveal);
    }

    ctx.restore();
  },

  drawCenterNode(ctx, cx, cy, scale, alpha, zoomT) {
    // zoomT: 0=放大态(124rpx), 1=默认态(110rpx)
    const R = (rpx(110) + (rpx(124) - rpx(110)) * (1 - zoomT)) / scale;
    ctx.globalAlpha = alpha;

    // 外圈细环
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = INK.accentBg;
    ctx.lineWidth = rpx(2) / scale;
    ctx.stroke();

    // 实心圆 + 渐变
    ctx.beginPath();
    ctx.arc(cx, cy, R - rpx(8) / scale, 0, Math.PI * 2);
    const grad = ctx.createLinearGradient(cx, cy - R, cx, cy + R);
    grad.addColorStop(0, INK.accentMid);
    grad.addColorStop(1, INK.accentDeep);
    ctx.fillStyle = grad;
    ctx.fill();

    // 学科名（白字，垂直居中）
    ctx.fillStyle = INK.white;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const subjSize = (rpx(36) + (rpx(44) - rpx(36)) * (1 - zoomT)) / scale;
    ctx.font = `600 ${subjSize}px -apple-system, "PingFang SC", sans-serif`;
    ctx.fillText(this.data.currentSubject, cx, cy);

    ctx.globalAlpha = 1;
  },

  drawDimNode(ctx, x, y, scale, alpha, dim, zoomT, reveal) {
    // zoomT: 0=放大态, 1=默认态。所有尺寸平滑插值
    const lerp = (a, b, t) => a + (b - a) * t;
    const R = lerp(rpx(128), rpx(84), zoomT) / scale;
    const ringW = lerp(rpx(8), rpx(6), zoomT) / scale;
    const color = dim.color

    // 入场缩放（只用 scale 变换，不嵌套 save）
    const entryScale = 0.6 + 0.4 * reveal;

    ctx.globalAlpha = alpha;

    // 进度环底 — 直接用 x,y 坐标
    ctx.beginPath();
    ctx.arc(x, y, R * entryScale, 0, Math.PI * 2);
    ctx.strokeStyle = INK.track;
    ctx.lineWidth = ringW * entryScale;
    ctx.stroke();

    // 进度环
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + (dim.value / 100) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(x, y, R * entryScale, startAngle, endAngle);
    ctx.strokeStyle = color;
    ctx.lineWidth = ringW * entryScale;
    ctx.lineCap = 'round';
    ctx.stroke();

    // 中心白圆
    ctx.beginPath();
    ctx.arc(x, y, R * entryScale - ringW * entryScale - rpx(2) / scale, 0, Math.PI * 2);
    ctx.fillStyle = INK.white;
    ctx.fill();

    // 文字
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 数字（上半部分）
    const numSize = lerp(rpx(64), rpx(40), zoomT) / scale * entryScale;
    ctx.font = `700 ${numSize}px -apple-system, "PingFang SC", sans-serif`;
    ctx.fillStyle = color;
    const numOffsetY = lerp(-rpx(18), -rpx(10), zoomT) / scale * entryScale;
    ctx.fillText(dim.value, x, y + numOffsetY);

    // 字母（下半部分）
    const letterSize = lerp(rpx(28), rpx(22), zoomT) / scale * entryScale;
    ctx.font = `600 ${letterSize}px -apple-system, sans-serif`;
    ctx.fillStyle = INK.secondary;
    const letterOffsetY = lerp(rpx(32), rpx(20), zoomT) / scale * entryScale;
    ctx.fillText(dim.id, x, y + letterOffsetY);

    // 中文名（圆圈下方，zoomT>0.5 时淡入显示）
    if (zoomT > 0.5) {
      ctx.globalAlpha = alpha * (zoomT - 0.5) / 0.5;
      ctx.fillStyle = INK.secondary;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const labelSize = rpx(24) / scale;
      ctx.font = `400 ${labelSize}px -apple-system, "PingFang SC", sans-serif`;
      ctx.fillText(dim.name, x, y + R + rpx(28) / scale);
    }

    ctx.globalAlpha = 1;
  },

  onCanvasTap(e) {
    if (this.data.isZoomed) return;
    const touch = e.touches[0] || e.changedTouches[0];
    if (!touch) return;

    // 页面级触摸坐标 — 使用 pageX/pageY（微信 Touch 标准属性）
    const tx = touch.pageX;
    const ty = touch.pageY;

    // 获取画布位置，转成画布局部坐标
    const query = wx.createSelectorQuery();
    query.select('#graphCanvas').boundingClientRect((rect) => {
      if (!rect) return;
      const canvasX = tx - rect.left;
      const canvasY = ty - rect.top;

      console.log('[graph] tap:', { tx, ty, rectL: rect.left, rectT: rect.top, canvasX, canvasY, nodes: this._nodePositions.length });

      let nodes = this._nodePositions;
      for (let i = 0; i < nodes.length; i++) {
        const dist = Math.hypot(canvasX - nodes[i].x, canvasY - nodes[i].y);
        if (dist <= nodes[i].r + rpx(16)) {
          this.zoomToNode(i);
          return;
        }
      }

      if (this._centerPos) {
        const dist = Math.hypot(canvasX - this._centerPos.x, canvasY - this._centerPos.y);
        if (dist <= this._centerPos.r) {
          this.zoomToCenter();
        }
      }
    }).exec();
  },

  updateHitTargets() {
    const layout = this._cachedLayout || this.getNodePositions();
    this._cachedLayout = layout;
    this._nodePositions = layout.positions.map((pos, i) => ({
      x: pos.x,
      y: pos.y,
      r: rpx(84),
      dimIdx: i
    }));
    this._centerPos = { x: layout.cx, y: layout.cy, r: rpx(110) };
  },

  zoomToNode(dimIdx) {
    const size = this._size;
    const cx = size / 2, cy = size / 2;
    const target = this._cachedLayout.positions[dimIdx];
    const dim = this.data.dimensions[dimIdx];

    // scale 保持 1.0，避免 canvas 像素拉伸虚化；只用 offX/offY 移镜头到节点
    // 节点放大由 zoomT=0（放大态）处理，尺寸已插值放大
    const targetScale = 1.0;
    const targetOffX = (cx - target.x);
    const targetOffY = (cy - target.y) - size * 0.12;

    this.setData({
      isZoomed: true,
      zoomedTarget: dimIdx,
      showInfo: false,
      showDetailBtn: false,
      zoomedData: {
        type: 'dim',
        id: dim.id,
        name: dim.name,
        value: dim.value,
        desc: dim.desc
      }
    });

    this.animateZoom(1, 0, 0, targetScale, targetOffX, targetOffY, () => {
      this.setData({ showInfo: true });
      setTimeout(() => this.setData({ showDetailBtn: true }), 120);
    });
  },

  zoomToCenter() {
    this.setData({
      isZoomed: true,
      zoomedTarget: 'center',
      showInfo: false,
      showDetailBtn: false,
      zoomedData: {
        type: 'center',
        name: this.data.currentSubject,
        desc: this.data.centerDesc
      }
    });

    this.animateZoom(1, 0, 0, 1.0, 0, 0, () => {
      this.setData({ showInfo: true });
    });
  },

  zoomOut() {
    this.cancelAnim();
    // 不立即隐藏信息卡 — 等动画完成后才隐藏

    // 用 setTimeout 驱动退出动画（不依赖 canvas RAF，实机更可靠）
    const fromS = this._scale, fromX = this._offX, fromY = this._offY;
    const start = Date.now();
    const duration = 350;

    const step = () => {
      const elapsed = Date.now() - start;
      const p = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);

      this._scale = fromS + (1 - fromS) * ease;
      this._offX = fromX + (0 - fromX) * ease;
      this._offY = fromY + (0 - fromY) * ease;

      // 退出过程中所有节点 alpha 随 p 恢复
      this._exitProgress = p;
      this.drawGraph();

      if (p < 1) {
        this._animTimer = setTimeout(step, 16);
      } else {
        this._animTimer = null;
        this._exitProgress = -1;
        this.setData({
          isZoomed: false,
          zoomedTarget: null,
          zoomedData: null,
          showInfo: false,
          showDetailBtn: false
        });
        this.drawGraph();
      }
    };
    step();
  },

  animateZoom(fromS, fromX, fromY, toS, toX, toY, callback, duration) {
    this.cancelAnim();
    duration = duration || 400;
    const start = Date.now();
    const step = () => {
      const elapsed = Date.now() - start;
      const p = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);

      this._scale = fromS + (toS - fromS) * ease;
      this._offX = fromX + (toX - fromX) * ease;
      this._offY = fromY + (toY - fromY) * ease;

      this.drawGraph();

      if (p < 1) {
        this._animTimer = this._canvas.requestAnimationFrame(step);
      } else {
        this._animTimer = null;
        if (callback) callback();
      }
    };
    // 立即执行第一帧，避免 requestAnimationFrame 首帧延迟造成的"停留感"
    step();
  },

  goDetail() {
    const z = this.data.zoomedTarget;
    if (z === null || z === 'center') return;
    const dim = this.data.dimensions[z];
    wx.navigateTo({
      url: `/pages/dimension-detail/dimension-detail?dim=${dim.id}&name=${encodeURIComponent(dim.name)}&value=${dim.value}&subject=${encodeURIComponent(this.data.currentSubject)}`
    });
  }
});
