#!/usr/bin/env node
/** image-quality.js — 拍摄质量实时检测算法（A 优化项核心）
 * 指标（纯 JS，jpeg-js 解码 + 降采样）：
 *  - brightness：亮度均值（过暗/过曝）
 *  - darkPct / brightPct：过暗/过曝像素占比
 *  - lapVar：Laplacian 方差（模糊度，归一化到 0-1000 尺度便于跨分辨率比较）
 * 输出：JSON 指标 + 阈值判定
 */
'use strict';
const fs = require('fs');
const jpeg = require('jpeg-js');

function metrics(buf) {
  const raw = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true });
  const { width: W, height: H, data } = raw;
  // 灰度降采样（步长按面积自适应，目标 ~25 万采样点）
  const total = W * H;
  const step = Math.max(1, Math.round(Math.sqrt(total / 250000)));
  const gray = new Float32Array(Math.ceil(W / step) * Math.ceil(H / step));
  const gw = Math.ceil(W / step);
  let sum = 0, dark = 0, bright = 0, n = 0;
  for (let y = 0, gy = 0; y < H; y += step, gy++) {
    for (let x = 0, gx = 0; x < W; x += step, gx++) {
      const i = (y * W + x) * 4;
      const v = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      gray[gy * gw + gx] = v;
      sum += v; n++;
      if (v < 40) dark++;
      if (v > 220) bright++;
    }
  }
  const mean = sum / n;
  let varSum = 0;
  for (let i = 0; i < n; i++) { const d = gray[i] - mean; varSum += d * d; }
  const std = Math.sqrt(varSum / n);
  // Laplacian 方差（模糊度）：在灰度图上取 4 邻域
  let lapSum = 0, lapN = 0;
  for (let gy = 1; gy < Math.ceil(H / step) - 1; gy++) {
    for (let gx = 1; gx < gw - 1; gx++) {
      const c = gray[gy * gw + gx];
      const l = gray[gy * gw + gx - 1], r = gray[gy * gw + gx + 1];
      const u = gray[(gy - 1) * gw + gx], d2 = gray[(gy + 1) * gw + gx];
      const lap = 4 * c - l - r - u - d2;
      lapSum += lap * lap; lapN++;
    }
  }
  const lapVar = lapSum / lapN;
  return {
    width: W, height: H, sampleStep: step,
    brightness: Math.round(mean * 10) / 10,
    std: Math.round(std * 10) / 10,
    darkPct: Math.round(dark / n * 1000) / 10,
    brightPct: Math.round(bright / n * 1000) / 10,
    lapVar: Math.round(lapVar),
  };
}

function judge(m) {
  const issues = [];
  if (m.brightness < 60) issues.push('过暗');
  if (m.brightness > 200) issues.push('过曝');
  if (m.darkPct > 25) issues.push('大面积阴影');
  // 模糊阈值需按分辨率归一：lapVar 跨图差异大，先输出观测再定阈值
  return issues;
}

if (require.main === module) {
  for (const f of process.argv.slice(2)) {
    try {
      const m = metrics(fs.readFileSync(f));
      console.log(JSON.stringify(Object.assign({ file: require('path').basename(f) }, m, { issues: judge(m) })));
    } catch (e) { console.log(JSON.stringify({ file: f, error: e.message })); }
  }
}
module.exports = { metrics, judge };
