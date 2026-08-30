// LaTeX 渲染内核：基于 libs/katex-mini（vendored，不依赖「构建 npm」）
//
// 用法：
//   const { renderLatex, renderMathText } = require('../../utils/latex');
//   const nodes = renderLatex('\\frac{1}{2}');           // 纯公式 → rich-text nodes
//   const nodes = renderMathText('已知 $f(x)=x^2$，求…'); // 混排文本 → rich-text nodes
//
// 页面：
//   <rich-text nodes="{{nodes}}"></rich-text>

const katexMini = require('../libs/katex-mini/index.js');

const parseLatexFn = katexMini.parseLatex || katexMini.default;
const renderMathInTextFn = katexMini.renderMathInText;

// 项目约定：行内 $...$、块级 $$...$$；同时兼容 \(...\) / \[...\]
const DEFAULT_DELIMITERS = [
  { left: '$$', right: '$$', display: true },
  { left: '$', right: '$', display: false },
  { left: '\\(', right: '\\)', display: false },
  { left: '\\[', right: '\\]', display: true },
];

/**
 * 把 katex-mini 的返回值规范成 rich-text 可用的 nodes 数组
 * - 无公式纯文本时 renderMathInText 会返回 string
 * - 解析失败时回退为纯文本节点
 */
function toNodes(result, fallbackText) {
  if (Array.isArray(result)) return result;
  if (typeof result === 'string') {
    if (!result) return [];
    return [{ type: 'text', text: result }];
  }
  const text = fallbackText == null ? '' : String(fallbackText);
  if (!text) return [];
  return [{ type: 'text', text }];
}

/**
 * 渲染一条纯 LaTeX 公式
 * @param {string} tex
 * @param {{ displayMode?: boolean, throwOnError?: boolean }} [options]
 * @returns {Array} rich-text nodes
 */
function renderLatex(tex, options) {
  const raw = (tex == null ? '' : String(tex)).trim();
  if (!raw) return [];
  if (typeof parseLatexFn !== 'function') {
    console.error('[latex] parseLatex unavailable');
    return toNodes(null, raw);
  }
  const opts = options || {};
  const shouldThrow = opts.throwOnError === true;
  try {
    // katex-mini 认 throwError（不是上游 katex 的 throwOnError）
    const nodes = parseLatexFn(raw, {
      throwError: shouldThrow,
      displayMode: opts.displayMode === true,
    });
    return toNodes(nodes, raw);
  } catch (e) {
    console.error('[latex] renderLatex failed:', e && e.message);
    if (shouldThrow) throw e;
    return toNodes(null, raw);
  }
}

/**
 * 渲染「文字 + 公式」混排（题干 / 报告 / AI 输出）
 * 识别 $$...$$、$...$、\\[...\\]、\\(...\\)
 * @param {string} text
 * @param {{ throwOnError?: boolean, delimiters?: Array }} [options]
 * @returns {Array} rich-text nodes
 */
function renderMathText(text, options) {
  const raw = text == null ? '' : String(text);
  if (!raw) return [];
  if (typeof renderMathInTextFn !== 'function') {
    console.error('[latex] renderMathInText unavailable');
    return toNodes(null, raw);
  }
  const opts = options || {};
  const shouldThrow = opts.throwOnError === true;
  try {
    const result = renderMathInTextFn(raw, {
      throwError: shouldThrow,
      delimiters: opts.delimiters || DEFAULT_DELIMITERS,
    });
    return unescapeTextNodes(toNodes(result, raw));
  } catch (e) {
    console.error('[latex] renderMathText failed:', e && e.message);
    if (shouldThrow) throw e;
    return segmentFallback(raw);
  }
}

// 转义下划线还原（视觉转录 LLM 常输出 \\_ 形式的横线，正稿应显示为普通下划线）
const BS = String.fromCharCode(92); // 反斜杠字符，避免字面量转义歧义

function unescapeUnderscore(str) {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    if (str[i] === BS && str[i + 1] === '_') { out += '_'; i++; }
    else out += str[i];
  }
  return out;
}

// 递归还原 rich-text 树中 text 节点的转义下划线（公式渲染节点不动）
function unescapeTextNodes(nodes) {
  for (const n of nodes) {
    if (n.type === 'text' && typeof n.text === 'string') n.text = unescapeUnderscore(n.text);
    if (Array.isArray(n.children)) unescapeTextNodes(n.children);
  }
  return nodes;
}

// 段级降级：整体渲染失败时，公式段逐段尝试，文本段还原转义
function segmentFallback(raw) {
  const nodes = [];
  const re = /(\$\$[\s\S]*?\$\$|\$[^$]*?\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])/g;
  let last = 0, m;
  while ((m = re.exec(raw))) {
    if (m.index > last) nodes.push(...toNodes(null, unescapeUnderscore(raw.slice(last, m.index))));
    const formula = m[0];
    const isBlock = formula.indexOf('$$') === 0 || formula.indexOf('\\[') === 0;
    const inner = isBlock ? formula.slice(2, formula.length - 2) : formula.slice(1, formula.length - 1);
    try {
      nodes.push(...renderLatex(inner, { displayMode: isBlock }));
    } catch (_) {
      nodes.push(...toNodes(null, unescapeUnderscore(formula)));
    }
    last = m.index + formula.length;
  }
  if (last < raw.length) nodes.push(...toNodes(null, unescapeUnderscore(raw.slice(last))));
  if (!nodes.length) nodes.push(...toNodes(null, raw));
  return nodes;
}

module.exports = {
  renderLatex,
  renderMathText,
  DEFAULT_DELIMITERS,
};
