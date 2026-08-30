#!/usr/bin/env node
/** 本地测试 imageCrop.js：真实照片 → EXIF 归一化 → 按 bbox 裁剪 → /tmp/croptest/ */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ic = require('../../cloudfunctions/diagnose/imageCrop.js');

const img = process.argv[2];
const boxes = (process.argv[3] || '').split(';').filter(Boolean).map(s => s.split(',').map(Number));
if (!img || !boxes.length) { console.error('用法: node test-image-crop.js <图片> "x1,y1,x2,y2;..."'); process.exit(1); }

const t0 = Date.now();
const { bmp, orientation, angle } = ic.decodeNormalized(fs.readFileSync(img));
console.log(`decode ${Date.now() - t0}ms，原始 EXIF orientation=${orientation} 旋转 ${angle}°，归一化 ${bmp.width}x${bmp.height}`);

const outDir = '/tmp/croptest';
fs.mkdirSync(outDir, { recursive: true });
const base = path.basename(img).replace(/\.[^.]+$/, '');
boxes.forEach((b, i) => {
  const [x1, y1, x2, y2] = b;
  const W = bmp.width, H = bmp.height;
  const x = Math.round(x1 / 1000 * W), y = Math.round(y1 / 1000 * H);
  const w = Math.round((x2 - x1) / 1000 * W), h = Math.round((y2 - y1) / 1000 * H);
  const t1 = Date.now();
  const crop = ic.cropBitmap(bmp, x, y, w, h);
  const out = path.join(outDir, `${base}_q${i + 1}.jpg`);
  fs.writeFileSync(out, ic.encodeJpeg(crop));
  console.log(`题${i + 1}: bbox[${b}] → (${x},${y} ${w}x${h}) crop+${Date.now() - t1}ms → ${out}`);
});
console.log('完成 → read_image 目检');
