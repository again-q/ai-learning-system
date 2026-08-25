// latex-demo：本地 katex-mini（分包内），勿 require npm 以免打进主包
let parseLatex = null;
try {
  const mod = require('../../libs/katex-mini/index.js');
  parseLatex = (mod && (mod.default || mod.parseLatex || mod)) || null;
} catch (e) {
  console.error('[latex-demo] katex-mini load failed:', e);
}

// 官方 README 示例公式（拉马努金恒等式）
const DEFAULT_LATEX =
  '\\displaystyle \\frac{1}{\\Bigl(\\sqrt{\\phi \\sqrt{5}}-\\phi\\Bigr) e^{\\frac25 \\pi}} = 1+\\frac{e^{-2\\pi}} {1+\\frac{e^{-4\\pi}} {1+\\frac{e^{-6\\pi}} {1+\\frac{e^{-8\\pi}} {1+\\cdots} } } }';

Page({
  data: {
    latex: DEFAULT_LATEX,
    nodes: [],
    error: '',
    loading: false,
  },

  onLoad() {
    this.renderLatex();
  },

  onInput(e) {
    this.setData({ latex: e.detail.value, error: '' });
  },

  renderLatex() {
    const latex = (this.data.latex || '').trim();
    if (!latex) {
      this.setData({ nodes: [], error: '' });
      return;
    }
    if (!parseLatex) {
      this.setData({
        nodes: [],
        error: 'katex-mini 未加载',
      });
      return;
    }
    this.setData({ loading: true, error: '' });
    try {
      const nodes = parseLatex(latex, {
        throwError: true,
      });
      this.setData({ nodes, loading: false, error: '' });
    } catch (e) {
      this.setData({
        nodes: [],
        loading: false,
        error: (e && e.message) || String(e),
      });
    }
  },

  onRenderTap() {
    this.renderLatex();
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  },
});
