// latex-demo：@rojer/katex-mini 官方示范页（输入 LaTeX → 渲染 rich-text）
// 文档：https://github.com/rojer/katex-mini（npm install @rojer/katex-mini + katex → 构建 npm → app.wxss 引入样式）
let parseLatex = null;
try {
  const mod = require('@rojer/katex-mini');
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
        error: 'katex-mini 未加载：请确认已构建 npm（工具 → 构建 npm）',
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

  goBack() {
    wx.navigateBack();
  },
});
