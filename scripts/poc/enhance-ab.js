#!/usr/bin/env node
/** enhance-ab.js — 光照归一化 A/B：原图 vs 增强版 Qwen 转录对比（C 优化项验证）
 * 增强：灰度直方图 2%-98% 分位线性拉伸（保守，不做激进二值化）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const jpeg = require('jpeg-js');

const DS_KEY = process.env.DEEPSEEK_API_KEY || (() => {
  const cred = path.join(process.env.HOME || '', '.dsh', '.credentials.yaml');
  if (fs.existsSync(cred)) {
    const m = fs.readFileSync(cred, 'utf8').match(/DEEPSEEK_API_KEY:\s*(\S+)/);
    if (m) return m[1];
  }
  return '';
})();
const QWEN_KEY = process.env.QWEN_API_KEY || (() => {
  const p = path.join(__dirname, '..', '..', '.env');
  if (fs.existsSync(p)) {
    const m = fs.readFileSync(p, 'utf8').match(/QWEN_API_KEY=(.*)/);
    if (m) return m[1].trim();
  }
  return '';
})();
const QWEN_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

const PROMPT = '转录这张数学题照片的全部文字内容（题目+选项+学生手写的答案和过程）。不确定处标(不确定)。只输出转录，不要分析。';

function enhance(buf) {
  const img = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true });
  const { width: W, height: H, data } = img;
  // 灰度直方图
  const hist = new Array(256).fill(0);
  const n = W * H;
  for (let i = 0; i < n; i++) {
    const v = Math.round(0.299 * data[i*4] + 0.587 * data[i*4+1] + 0.114 * data[i*4+2]);
    hist[v]++;
  }
  // 2% / 98% 分位
  const loN = n * 0.02, hiN = n * 0.98;
  let acc = 0, lo = 0, hi = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= loN) { lo = v; break; } }
  acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= hiN) { hi = v; break; } }
  if (hi - lo < 30) return { buf, lo, hi, changed: false };
  // 线性拉伸
  const scale = 255 / (hi - lo);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) {
      let v = data[i*4 + c];
      v = Math.max(0, Math.min(255, Math.round((v - lo) * scale)));
      data[i*4 + c] = v;
    }
  }
  return { buf: jpeg.encode(img, 88).data, lo, hi, changed: true };
}

async function qwen(buf, key) {
  const b64 = buf.toString('base64');
  const resp = await fetch(QWEN_URL + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({
      model: 'qwen3.7-plus',
      messages: [{ role: 'user', content: [
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + b64 } },
        { type: 'text', text: PROMPT },
      ] }],
      max_tokens: 2500,
      enable_thinking: false,
    }),
  });
  if (!resp.ok) throw new Error('HTTP ' + resp.status + ': ' + (await resp.text()).slice(0, 150));
  const data = await resp.json();
  const msg = data.choices[0].message.content || '';
  return { text: msg, chars: msg.length, ms: 0, usage: data.usage ? data.usage.total_tokens : 0 };
}

(async () => {
  const QWEN = QWEN_KEY;
  if (!QWEN) { console.error('缺 QWEN_API_KEY'); process.exit(1); }
  const photos = process.argv.slice(2);
  for (const f of photos) {
    console.log('\n===== ' + path.basename(f) + ' =====');
    const orig = fs.readFileSync(f);
    const { buf: enhanced, lo, hi, changed } = enhance(orig);
    console.log(`增强: lo=${lo} hi=${hi} ${changed ? '已拉伸' : '无需拉伸'}`);
    for (const [label, buf] of [['原图', orig], ['增强版', enhanced]]) {
      const t0 = Date.now();
      try {
        const r = await qwen(buf, QWEN);
        const ms = Date.now() - t0;
        console.log(`[${label}] ${(ms/1000).toFixed(1)}s, ${r.chars} 字, tokens=${r.usage}`);
        console.log('  ' + r.text.slice(0, 260).split('\n').join('\n  '));
      } catch (e) {
        console.log(`[${label}] 失败: ${String(e.message).slice(0, 200)}`);
      }
    }
  }
})();