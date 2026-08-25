// Katex 字体加载：wx.loadFontFace 直接加载本地字体文件（官方 API，模拟器/真机都生效）
// 背景：readFileSync 读分包文件在开发者工具被拒(permission denied)；wxss @font-face 本地路径在模拟器 500；
//       改用 loadFontFace 的 url() 本地路径，由工具/真机自行加载字体文件。
// 用法：const loadFonts = require('../../utils/font-loader'); loadFonts.loadKatexFonts(cb);

const FONTS = [
  { family: 'KaTeX_AMS', file: 'KaTeX_AMS-Regular.woff2', weight: '400', style: 'normal' },
  { family: 'KaTeX_Main', file: 'KaTeX_Main-Bold.woff2', weight: '700', style: 'normal' },
  { family: 'KaTeX_Main', file: 'KaTeX_Main-Italic.woff2', weight: '400', style: 'italic' },
  { family: 'KaTeX_Main', file: 'KaTeX_Main-Regular.woff2', weight: '400', style: 'normal' },
  { family: 'KaTeX_Math', file: 'KaTeX_Math-Italic.woff2', weight: '400', style: 'italic' },
  { family: 'KaTeX_Size1', file: 'KaTeX_Size1-Regular.woff2', weight: '400', style: 'normal' },
  { family: 'KaTeX_Size2', file: 'KaTeX_Size2-Regular.woff2', weight: '400', style: 'normal' },
  { family: 'KaTeX_Size3', file: 'KaTeX_Size3-Regular.woff2', weight: '400', style: 'normal' },
  { family: 'KaTeX_Size4', file: 'KaTeX_Size4-Regular.woff2', weight: '400', style: 'normal' },
];

// 绝对路径（相对小程序根 miniprogramRoot）
const BASE = '/packageDiagnose/libs/katex/fonts/';

// 加载全部 KaTeX 字体，全部完成（成功或失败）后回调
function loadKatexFonts(onDone) {
  let pending = FONTS.length;
  let finished = 0;

  const finish = () => {
    finished += 1;
    if (finished >= pending && onDone) onDone();
  };

  FONTS.forEach((f) => {
    wx.loadFontFace({
      global: true,
      family: f.family,
      weight: f.weight,
      style: f.style,
      source: 'url("' + BASE + f.file + '")',
      success: () => finish(),
      fail: (e) => {
        console.error('[font-loader] loadFontFace fail:', f.family, e.errMsg || '');
        finish();
      },
    });
  });
}

module.exports = { loadKatexFonts };
