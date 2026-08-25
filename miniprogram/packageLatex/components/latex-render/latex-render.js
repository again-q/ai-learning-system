// LaTeX 渲染组件：基于 @rojer/katex-mini 生成 rich-text nodes
let katexMini = null;
try {
  katexMini = require('../../libs/katex-mini/index.js');
} catch (e) {
  console.error('[latex-render] katex-mini load failed:', e);
}

const parseLatex = katexMini ? (katexMini.default || katexMini.parseLatex || katexMini) : null;

Component({
  properties: {
    latex: { type: String, value: '' },
    fontSize: { type: Number, value: 24 },
    color: { type: String, value: '#1a1a1a' },
  },

  data: {
    nodes: [],
    error: false,
    rootStyle: '',
  },

  observers: {
    'latex, fontSize, color': function () {
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
      if (!tex) {
        this.setData({ nodes: [], error: false });
        return;
      }
      try {
        if (!parseLatex) throw new Error('katex-mini not available');
        const nodes = parseLatex(tex, {
          throwOnError: false,
          displayMode: false,
        });
        const baseSize = this.data.fontSize || 28;
        this.setData({
          nodes,
          error: false,
          rootStyle: `font-size:${baseSize}rpx;color:${this.data.color || '#1a1a1a'};`,
        });
      } catch (e) {
        console.error('[latex-render] render failed:', e);
        this.setData({
          nodes: [{ type: 'text', text: tex, style: '' }],
          error: true,
          rootStyle: `font-size:${this.data.fontSize || 28}rpx;color:${this.data.color || '#1a1a1a'};`,
        });
      }
    },
  },
});
