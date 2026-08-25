// latex-demo：验证 utils/latex 内核（输入 LaTeX / 混排 → rich-text）
const { renderLatex, renderMathText } = require('../../utils/latex');

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
    this.doRender();
  },

  onInput(e) {
    this.setData({ latex: e.detail.value, error: '' });
  },

  doRender() {
    const tex = (this.data.latex || '').trim();
    if (!tex) {
      this.setData({ nodes: [], error: '' });
      return;
    }
    this.setData({ loading: true });
    try {
      // 含 $ / $$ 时按混排；否则按纯公式（块级展示）
      const mixed = /\$|\\\(|\\\[/.test(tex);
      const nodes = mixed
        ? renderMathText(tex, { throwOnError: true })
        : renderLatex(tex, { throwOnError: true, displayMode: true });
      this.setData({ nodes, error: '' });
    } catch (e) {
      console.error('[latex-demo] parse error:', e);
      this.setData({
        nodes: [{ type: 'text', text: tex }],
        error: '公式解析失败：' + ((e && e.message) || String(e)),
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  // 保留旧按钮绑定名
  renderLatex() {
    this.doRender();
  },

  goBack() {
    wx.navigateBack();
  },
});
