#!/usr/bin/env node
// 小程序报告页 · 「这一问怎么想的」渲染预览
//
// 用**真实数据**（golden 第 19 题 + e2e 实跑产出的思路）按 report.wxml 的结构渲染成 HTML，
// 样式取自 report.wxss（rpx 换算成 px），用于肉眼验证：
//   ① 小问入口的位置与层级
//   ② 思路面板的排版
//   ③ 追问与更正卡片的形态
//
// 用法：node scripts/preview-report-subq.mjs [--open]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const OPEN = process.argv.includes('--open');

// 复用小程序公式渲染
const { renderMathText, unescapeUnderscore } = require(
  path.join(ROOT, 'miniprogram/packageDiagnose/utils/latex.js')
);
const { splitForDisplay } = require(
  path.join(ROOT, 'miniprogram/packageDiagnose/pages/report/subq.js')
);

const golden = JSON.parse(fs.readFileSync(path.join(ROOT, 'output/golden/cases-过程审阅.json'), 'utf8'));
const c19 = golden.cases.find((c) => c.id === 'ZX-19-CLOSURE');
const e2e = JSON.parse(fs.readFileSync(path.join(ROOT, 'output/e2e-subthinking.json'), 'utf8'));
const thinking = e2e.first.thinking;

const sw = c19.studentActualWork;
const clean = (x) => String(x || '').replace(/\s*←.*$/, '').trim();   // 剥掉 golden 的注释「← ❌ 这里学生算错了」
const studentWork = [sw.part1, sw.part2, sw.part3_additive, ...sw.part3_multiplicative].filter(Boolean).map(clean).join('\n');

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function md(text) {
  const raw = unescapeUnderscore(String(text == null ? '' : text));
  if (!raw.trim()) return '';
  let nodes;
  try { nodes = renderMathText(raw); } catch (e) { nodes = null; }
  if (!nodes || /KaTeX parse error/i.test(JSON.stringify(nodes))) return esc(raw.replace(/\$\$?/g, ''));
  const walk = (n) => {
    if (n == null) return '';
    if (typeof n === 'string') return n;
    if (Array.isArray(n)) return n.map(walk).join('');
    if (typeof n !== 'object') return String(n);
    if (n.type === 'text') return String(n.text == null ? '' : n.text);
    const tag = n.name || 'span';
    const a = Object.entries(n.attrs || {}).filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
    return `<${tag}${a}>${walk(n.children)}</${tag}>`;
  };
  return walk(nodes);
}

// ---- 前端切分（与 report.js buildSubList 同源）----
const subs = splitForDisplay({ rawQuestionText: c19.questionText, yourWork: studentWork, brokenCount: 2 });
const sub3 = subs.find((s) => s.subNo === '(3)') || subs[subs.length - 1];

const katexCss = fs.readFileSync(
  path.join(ROOT, 'miniprogram/packageDiagnose/libs/katex-mini/index.wxss'), 'utf8'
);
// 报告页样式（rpx → px：按 750rpx = 375px 的一半换算）
const wxss = fs.readFileSync(
  path.join(ROOT, 'miniprogram/packageDiagnose/pages/report/report.wxss'), 'utf8'
);
const px = wxss.replace(/(\d*\.?\d+)rpx/g, (_, n) => (Number(n) / 2) + 'px');

const H = [];
const push = (...s) => H.push(...s);

push('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">');
push('<meta name="viewport" content="width=device-width,initial-scale=1">');
push('<title>报告页 · 这一问怎么想的</title>');
push('<style>' + katexCss + px + `
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;padding:0;background:#e9ebee;color:#1a1a1a;
  font:15px/1.7 -apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue",sans-serif;-webkit-font-smoothing:antialiased}
.desk{max-width:1120px;margin:0 auto;padding:22px 16px 60px}
.desk h1{font-size:20px;margin:0 0 6px}
.desk .lead{font-size:13px;color:#5b6069;line-height:1.7;margin:0 0 18px}
.cols{display:grid;grid-template-columns:400px 1fr;gap:20px;align-items:start}
@media(max-width:960px){.cols{grid-template-columns:1fr}}
.phone{background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 22px rgba(16,24,40,.10)}
.phone-h{background:#f7f8f9;border-bottom:1px solid #e6e8eb;padding:9px 15px;font-size:12px;color:#8a8f99;display:flex;justify-content:space-between}
.page-bg{background:#f4f5f7;padding:0 0 18px}
.rp-sec-t{font-size:16px;font-weight:600;padding:16px 16px 2px}
.rp-sec-sub{font-size:12.5px;color:#8a8f99;padding:0 16px 10px}
.rp-card{background:#fff;border-radius:14px;padding:13px 15px;margin:0 11px 10px;box-shadow:0 1px 2px rgba(16,24,40,.04)}
.rp-q-head{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:9px}
.rp-q-no{font-weight:600;font-size:15px}
.rp-chip{font-size:11px;padding:1px 7px;border-radius:999px;border:1px solid #e6e8eb;color:#8a8f99}
.rp-chip.mid{color:#b45309;background:#fffbeb;border-color:#fde3ae}
.rp-q-text{font-size:14px;line-height:1.85;color:#111;margin-bottom:8px}
.notes{background:#fff;border-radius:14px;padding:18px 20px;box-shadow:0 2px 12px rgba(16,24,40,.06)}
.notes h2{font-size:15px;margin:0 0 10px}
.notes h3{font-size:13.5px;margin:15px 0 5px}
.notes p,.notes li{font-size:13px;line-height:1.75;color:#344054;margin:0 0 6px}
.notes ul{padding-left:18px;margin:0 0 6px}
.notes .kbd{background:#f2f4f7;border-radius:4px;padding:1px 5px;font-size:12px;color:#475467}
.notes .real{color:#0f766e;font-weight:600}
/* 小程序 view/text 标签在浏览器里的等价样式（否则布局全塌） */
view{display:block}
text{display:inline}
.tcard,.tg{display:inline-block}
/* 学生原文里 golden 带了一句注释，去掉 */

` + '</style></head><body>');

push('<div class="desk">');
push('<h1>报告页 ·「这一问怎么想的」</h1>');
push('<p class="lead">左边是报告页实际的样子（用 <span class="kbd">report.wxss</span> 的真实样式、<span class="kbd">report.wxml</span> 的真实结构渲染）。'
  + '题目与作答来自 golden 集，<b>思路来自今天 e2e 实跑的生产代码产出</b>。</p>');

push('<div class="cols">');
push('<div class="phone"><div class="phone-h"><span>错在哪 · 第 19 题</span><span>报告页</span></div><div class="page-bg">');

push('<div class="rp-sec-t">错在哪</div>');
push('<div class="rp-sec-sub">题目、你写的、标准做法摆在一起，差在哪自己看</div>');

push('<div class="rp-card">');
push('<div class="rp-q-head"><span class="rp-q-no">第 19 题</span><span class="rp-chip">解答题</span>'
  + '<span class="rp-chip mid">' + c19.official.score + '/' + c19.official.standardScore + ' 分</span></div>');
push('<div class="rp-q-text">' + md(c19.questionText) + '</div>');

// 三个小问
subs.forEach((s) => {
  const isTarget = s.subNo === sub3.subNo;
  push('<view class="subq" style="display:block">');
  push('<div class="subq-h"><text class="subq-no">' + esc(s.subNo) + '</text>'
    + '<text class="subq-tag ' + (s.wrong ? 'bad' : 'ok') + '">' + (s.wrong ? '要注意' : '✓') + '</text></div>');

  // 只有第(3)问有作答切片（学生原文没带小问标记，按设计全归第一问）
  if (s.subNo === '(1)' && s.studentWork) {
    push('<div class="rp-yourwork" style="white-space:pre-line;font-size:13px;line-height:1.7">' + esc(s.studentWork) + '</div>');
  }

  if (isTarget && OPEN) {
    // 展开态：思路面板
    push('<div class="think-panel">');
    push('<div class="think-head"><text class="think-t">这一问是怎么想到的</text><text class="think-s">一种走法</text></div>');
    push('<div class="think-goal">' + esc(thinking.goal) + '</div>');
    thinking.steps.forEach((st) => {
      push('<div class="tstep"><text class="tstep-n">' + st.n + '</text><div class="tstep-b">');
      push('<div class="trow"><text class="tk">手上</text><text class="tv tv-have">' + esc(st.have) + '</text></div>');
      push('<div class="trow"><text class="tk">还缺</text><text class="tv tv-lack">' + esc(st.lack) + '</text></div>');
      push('<div class="trow"><text class="tk">为什么</text><text class="tv tv-why">' + esc(st.why) + '</text></div>');
      push('<div class="trow"><text class="tk">做法</text><text class="tv tv-do">' + esc(st.do) + '</text></div>');
      if ((st.thinking.cards || []).length || st.thinking.say) {
        push('<div class="tthink">');
        if ((st.thinking.cards || []).length) {
          push('<div class="tcards">' + st.thinking.cards.map((c) => '<text class="tcard">' + esc(c) + '</text>').join('') + '</div>');
        }
        if (st.thinking.say) push('<text class="tsay">' + esc(st.thinking.say) + '</text>');
        push('</div>');
      }
      push('</div></div>');
    });
    push('<div class="think-end">' + esc(thinking.ending) + '</div>');

    // 追问示例（说明用）
    push('<div class="ask-box">');
    push('<div class="ask-row"><div class="ask-input" style="color:#b0b5bd">追问：哪里没看懂，或你觉得哪里不对…</div>'
      + '<view class="ask-btn">追问</view></div>');
    push('<div class="ask-dialog">');
    push('<div class="msg me"><text class="msg-who">你</text><text class="msg-txt">我那样算为什么不行？</text></div>');
    push('<div class="msg ai"><text class="msg-who">AI</text><text class="msg-txt">'
      + '你写的是：由(I)取 x=(y−x)/xy，y=(x−y)/xy，得到 1/(xy)∈M。<br><br>'
      + '但这两项相加其实 = (y−x)/xy + (x−y)/xy = 0，不是 1/(xy)。0 推不出 xy，所以这一步不成立。<br><br>'
      + '不过你的想法是对的——你是想找一个能互相抵消的东西，方向没错，是加法算错了。'
      + '</text></div>');
    push('</div>');
    // 更正卡片
    push('<div class="fix-card">');
    push('<text class="fix-h">发现原诊断有误，可以更正</text>');
    push('<div class="fix-diff">');
    push('<text class="fix-old">乘法封闭性写到「由③取 x=1/(1/xy)」就停住了，没走完。</text>');
    push('<text class="fix-new">这一步不是「没写完」，而是两个分式相加算错了：(y−x)/xy + (x−y)/xy = 0，不是 1/(xy)。</text>');
    push('</div>');
    push('<text class="fix-ev">依据：原诊断说「停住了/没走完」，但学生原文这里有「证毕」，说明他不是没写完。</text>');
    push('<div class="fix-btns"><view class="fix-ok">按这次更正</view><view class="fix-no">保持原样</view></div>');
    push('</div>');
    push('</div>');
    push('</div>');
  } else {
    // 折叠态：入口
    push('<div class="mini-entry"><text class="mini-l">这一问怎么想的</text><text class="mini-r">按需生成</text><text class="mini-a">›</text></div>');
  }
  push('</view>');
});

push('</div>'); // card
push('</div></div>'); // phone

// 说明
push('<div class="notes">');
push('<h2>怎么看这张图</h2>');
push('<h3><span class="real">真实</span>入口长什么样</h3>');
push('<p>每个小问下面一行虚线框「这一问怎么想的 · 按需生成 ›」。默认<b>不占内容、不发请求</b>——它只是三个字加一个箭头。</p>');
push('<p>为什么放在小问下面而不是题目开头：学生是带着「看我哪里错了」的预期进来的，方法讲解放最后，看完错因还有余力才点。</p>');

push('<h3><span class="real">真实</span>展开后的思路</h3>');
push('<p>这一步的产出是今天 <span class="kbd">e2e-subthinking.mjs</span> 实跑生产代码得到的，4 步、72.7 秒、验证通过。每步四行：手上 / 还缺 / 为什么 / 做法，下面是紫色块里的<b>数学思维名字</b>（转化策略、构造法、分而治之）。</p>');

push('<h3>追问与更正（示例）</h3>');
push('<p>追问区在思路末尾。当追问暴露出原诊断说错了，会弹更正卡片：划掉的旧文案 → 新文案 + 依据 + 两个按钮。</p>');
push('<p>注意更正卡片改的是<b>诊断文案</b>（原来那句「停住了，没走完」），不是判定字段——判定（对错/分值/断点）仍是只读的。</p>');

push('<h3>还没验证的三件事</h3>');
push('<ul>'
  + '<li><b>真机渲染</b>：这张图是浏览器的近似（rpx 已换算），真机可能有细微差异</li>'
  + '<li><b>小问作答对齐</b>：学生原文没带 (1)(2) 标记时，作答全归第一问 —— 第 19 题就是这种情况，需要真机确认可读性</li>'
  + '<li><b>追问的 token 上限</b>：用户要求不截断，长对话是否会超限没测过</li>'
  + '</ul>');
push('</div>');

push('</div></div></body>');

const OUT = path.join(ROOT, 'output', OPEN ? 'report-subq-open.html' : 'report-subq.html');
fs.writeFileSync(OUT, H.join('\n'), 'utf8');
console.log('已生成：' + OUT);
