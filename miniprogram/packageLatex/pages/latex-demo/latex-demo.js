// latex-demo：与原先正常版一致（displayMode + throwError）
// 库放在 packageLatex 分包，样式用原 base64 自包含版（小程序本地字体路径易失效导致叠字）
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
    const tex = (this.data.latex || '').trim();
    if (!tex) {
      this.setData({ nodes: [], error: '' });
      return;
    }
    if (!parseLatex) {
      this.setData({
        nodes: [{ type: 'text', text: tex }],
        error: 'katex-mini 未加载',
      });
      return;
    }
    this.setData({ loading: true });
    try {
      const nodes = parseLatex(tex, {
        throwError: true, // katex-mini 选项：解析失败抛出错误，由下方 catch 展示错误信息
        displayMode: true, // 块级展示（大公式居中）
      });
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

  onRenderTap() {
    this.renderLatex();
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  },
});
