/**
 * imageCrop.js — 纯 JS 图像归一化 + 按题裁剪（零原生依赖，jpeg-js 实现）
 *
 * 流水线：原始照片 buffer → EXIF 方向归一化（像素转正）→ 送 VLM（bbox 坐标系=归一化像素系）
 *        → 按 bbox 裁剪单题 → encode JPEG 上传云存储
 * 客户端 L2 压缩保证长边 ≤2000px，decode 内存峰值 ≤ 2000*2000*4 ≈ 16MB
 */
'use strict';
const jpeg = require('jpeg-js');

// —— EXIF orientation（JPEG APP1 / TIFF IFD0 tag 0x0112）——
function getExifOrientation(buf) {
  if (buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return 1;
  let off = 2;
  while (off + 4 < buf.length) {
    if (buf[off] !== 0xFF) { off++; continue; }
    const marker = buf[off + 1];
    if (marker === 0xD8 || (marker >= 0xD0 && marker <= 0xD7) || marker === 0x01) { off += 2; continue; }
    if (marker === 0xDA) break; // SOS：后面是图像数据
    const len = buf.readUInt16BE(off + 2);
    if (marker === 0xE1 && len > 8 && buf.toString('ascii', off + 4, off + 10) === 'Exif\u0000\u0000') {
      const tiff = off + 10;
      if (tiff + 8 > buf.length) return 1;
      const little = buf[tiff] === 0x49;
      const readU16 = (o) => (little ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
      const readU32 = (o) => (little ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
      const ifd = tiff + readU32(tiff + 4);
      if (ifd < 0 || ifd + 2 > buf.length) return 1;
      const cnt = readU16(ifd);
      for (let i = 0; i < cnt; i++) {
        const e = ifd + 2 + i * 12;
        if (e + 12 > buf.length) return 1;
        if (readU16(e) === 0x0112) return readU16(e + 8) || 1;
      }
      return 1;
    }
    off += 2 + len;
  }
  return 1;
}

// 旋转 RGBA 位图（angleDeg 为顺时针角度；输出新 buffer）
function rotateBitmap(bmp, angleDeg) {
  const { width: W, height: H, data } = bmp;
  if (angleDeg === 0) return bmp;
  const out = { width: angleDeg === 180 ? W : H, height: angleDeg === 180 ? H : W, data: Buffer.alloc(W * H * 4) };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const si = (y * W + x) * 4;
      let ux, uy;
      if (angleDeg === 90) { ux = H - 1 - y; uy = x; }        // raw(x,y) → upright(H-1-y, x)
      else if (angleDeg === 180) { ux = W - 1 - x; uy = H - 1 - y; }
      else if (angleDeg === 270) { ux = y; uy = W - 1 - x; }
      else throw new Error('unsupported angle ' + angleDeg);
      const di = (uy * out.width + ux) * 4;
      out.data[di] = data[si]; out.data[di + 1] = data[si + 1]; out.data[di + 2] = data[si + 2]; out.data[di + 3] = data[si + 3];
    }
  }
  return out;
}

// EXIF orientation → 需要的顺时针旋转角
function orientationToAngle(o) { return { 3: 180, 6: 90, 8: 270 }[o] || 0; }

// 原始 JPEG buffer → 归一化 RGBA 位图（EXIF 转正）
function decodeNormalized(buf) {
  const raw = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true });
  const orientation = getExifOrientation(buf);
  const angle = orientationToAngle(orientation);
  const bmp = angle ? rotateBitmap(raw, angle) : raw;
  return { bmp, orientation, angle };
}

// 从 RGBA 位图裁剪矩形（0≤x,y 且 x+w≤W, y+h≤H）
function cropBitmap(bmp, x, y, w, h) {
  x = Math.max(0, Math.min(x, bmp.width - 1));
  y = Math.max(0, Math.min(y, bmp.height - 1));
  w = Math.max(1, Math.min(w, bmp.width - x));
  h = Math.max(1, Math.min(h, bmp.height - y));
  const out = { width: w, height: h, data: Buffer.alloc(w * h * 4) };
  for (let row = 0; row < h; row++) {
    const si = ((y + row) * bmp.width + x) * 4;
    bmp.data.copy(out.data, row * w * 4, si, si + w * 4);
  }
  return out;
}

function encodeJpeg(bmp, quality = 85) {
  return jpeg.encode(bmp, quality).data;
}

module.exports = { getExifOrientation, orientationToAngle, rotateBitmap, decodeNormalized, cropBitmap, encodeJpeg };
