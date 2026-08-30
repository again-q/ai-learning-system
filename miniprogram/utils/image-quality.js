/**
 * image-quality.js — 拍摄质量实时检测（输入优化 A）
 * 算法与 POC（scripts/poc/image-quality.js）同源，阈值经 60+ 真实照片校准：
 *  - 过暗：brightness < 60 且 暗像素(<40)占比 > 50%（整张图都黑）
 *  - 过曝：P5 亮度 > 200（5% 分位都接近纯白 = 文字笔画消失；白纸文档天然亮，不看全图均值）
 * 检测失败/环境不支持时返回 ok=true（不拦截，宁放过勿误拦）
 */
'use strict';

// 纯计算（可脱离 wx 单测）：RGBA → {brightness, darkPct, p5}
function computeMetrics(data, w, h) {
  const hist = new Array(256).fill(0);
  let n = 0, sum = 0, dark = 0;
  const step = Math.max(1, Math.round(Math.sqrt((w * h) / 250000)));
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      const v = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      hist[v]++; sum += v; n++;
      if (v < 40) dark++;
    }
  }
  const brightness = sum / n;
  const darkPct = (dark / n) * 100;
  let acc = 0, p5 = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.05) { p5 = v; break; } }
  return {
    brightness: Math.round(brightness),
    darkPct: Math.round(darkPct * 10) / 10,
    p5,
  };
}

function judgeIssues(m) {
  const issues = [];
  if (m.brightness < 60 && m.darkPct > 50) issues.push('照片过暗');
  if (m.p5 > 200) issues.push('过曝，文字可能看不清');
  return issues;
}

// 小程序端：对一张临时图片跑检测（offscreen canvas，长边缩到 600 提速）
function analyzeImage(filePath) {
  return new Promise((resolve) => {
    try {
      const canvas = wx.createOffscreenCanvas({ type: '2d', width: 300, height: 300 });
      const ctx = canvas.getContext('2d');
      const img = canvas.createImage();
      img.onload = () => {
        try {
          const scale = Math.min(1, 600 / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(img, 0, 0, w, h);
          const imageData = ctx.getImageData(0, 0, w, h);
          const m = computeMetrics(imageData.data, w, h);
          resolve({ ok: judgeIssues(m).length === 0, issues: judgeIssues(m), metrics: m });
        } catch (e) {
          resolve({ ok: true, issues: [], skipped: true }); // 检测失败不拦截
        }
      };
      img.onerror = () => resolve({ ok: true, issues: [], skipped: true });
      img.src = filePath;
    } catch (e) {
      resolve({ ok: true, issues: [], skipped: true });
    }
  });
}

module.exports = { computeMetrics, judgeIssues, analyzeImage };
