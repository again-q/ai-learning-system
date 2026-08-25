// LaTeX 渲染组件：封装 utils/latex，页面用 <latex-render latex="..." />
const { renderLatex } = require('../../utils/latex');

Component({
  properties: {
    latex: { type: String, value: '' },
    fontSize: { type: Number, value: 24 },
    color: { type: String, value: '#1a1a1a' },
    displayMode: { type: Boolean, value: false },
  },

  data: {
    nodes: [],
    error: false,
    rootStyle: '',
  },

  observers: {
    'latex, fontSize, color, displayMode': function () {
      this.render();
    },
  },

  lifetimes: {
    attached() {
      this.render();
    },
  },

  methods: {
    render() {
      const tex = (this.data.latex || '').trim();
      const baseSize = this.data.fontSize || 28;
      const rootStyle = `font-size:${baseSize}rpx;color:${this.data.color || '#1a1a1a'};`;
      if (!tex) {
        this.setData({ nodes: [], error: false, rootStyle });
        return;
      }
      try {
        const nodes = renderLatex(tex, {
          throwOnError: false,
          displayMode: !!this.data.displayMode,
        });
        this.setData({ nodes, error: false, rootStyle });
      } catch (e) {
        console.error('[latex-render] render failed:', e);
        this.setData({
          nodes: [{ type: 'text', text: tex }],
          error: true,
          rootStyle,
        });
      }
    },
  },
});
