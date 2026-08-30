#!/usr/bin/env node
/**
 * qwen-bbox-poc.js — VLM 自切题 POC：让 Qwen3.7-plus 在转录的同时输出每题 bbox（0-1000 归一化）
 *
 * 流程：Qwen 视觉调用（转录+bbox 一次完成）→ 解析 bbox → macOS sips 裁剪单题图到 /tmp/qbbox/<图名>/
 * 验证：裁剪出的单题图用 read_image 目检（bbox 精度人工确认）
 *
 * 用法：node scripts/poc/qwen-bbox-poc.js <图片> [图片...]
 * 成本：每张一次 Qwen 调用（~0.01-0.03 元），无新增供应商
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// 与 diagnose VISION_PROMPT 基础一致 + 追加 grounding 要求
const VISION_PROMPT = `你是数学学习诊断助手的图像理解阶段。任务：准确转录题目 + 如实描述做题痕迹 + 定位每题区域。不要做诊断判断。

输出 Markdown，每题一个块，格式严格如下：
### bbox: [x1,y1,x2,y2]
（该题在整个图片中的矩形框，坐标为 0-1000 归一化值，x1y1=左上，x2y2=右下，覆盖题干+作答区域）

# 第N题转录
（完整题干、所有选项内容和题目形式；公式尽量用 $...$ / $$...$$）

# 第N题做题痕迹
（按书写顺序：步骤/位置/痕迹（涂改、草稿、最终答案）；无痕迹写「无可见痕迹」）

# 输出要求
不确定处标(不确定)；看不清写(看不清)；最终答案逐字符精确（≥≤><=符号不能错）；不臆测；bbox 框要贴住该题实际区域，宁大勿小`;

function loadEnv() {
  const p = path.join(__dirname, '..', '..', '.env');
  const out = {};
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    }
  }
  return { ...out, ...process.env };
}

async function callQwen(env, imagePath) {
  const b64 = fs.readFileSync(imagePath).toString('base64');
  const ext = (imagePath.split('.').pop() || 'jpg').toLowerCase();
  const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
  const resp = await fetch(`${env.QWEN_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.QWEN_API_KEY}` },
    body: JSON.stringify({
      model: env.QWEN_VL_MODEL || 'qwen3.7-plus',
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } },
          { type: 'text', text: VISION_PROMPT },
        ],
      }],
      max_tokens: 4000,
      enable_thinking: false,
    }),
  });
  if (!resp.ok) throw new Error('HTTP ' + resp.status + ': ' + (await resp.text()).slice(0, 200));
  const data = await resp.json();
  return data.choices[0].message.content || '';
}

// 纯 JS 解析 JPEG EXIF orientation（1=正常 3=180 6=需顺90 8=需逆90；无标签=1）
function getExifOrientation(buf) {
  if (buf[0] !== 0xFF || buf[1] !== 0xD8) return 1;
  let off = 2;
  while (off + 4 < buf.length) {
    if (buf[off] !== 0xFF) { off++; continue; }
    const marker = buf[off + 1];
    if (marker === 0xD8 || (marker >= 0xD0 && marker <= 0xD7) || marker === 0x01) { off += 2; continue; }
    const len = buf.readUInt16BE(off + 2);
    if (marker === 0xE1 && buf.toString('ascii', off + 4, off + 10) === 'Exif\u0000\u0000') {
      const tiff = off + 10;
      const little = buf[tiff] === 0x49;
      const readU16 = (o) => little ? buf.readUInt16LE(o) : buf.readUInt16BE(o);
      const readU32 = (o) => little ? buf.readUInt32LE(o) : buf.readUInt32BE(o);
      const ifd = tiff + readU32(tiff + 4);
      if (ifd < 0 || ifd + 2 + 12 * 64 > buf.length) return 1; // 越界防御：当作无方向标签
      const cnt = readU16(ifd);
      for (let i = 0; i < cnt; i++) {
        const e = ifd + 2 + i * 12;
        if (readU16(e) === 0x0112) return readU16(e + 8) || 1;
      }
      return 1;
    }
    off += 2 + len;
  }
  return 1;
}

// 归一化到正立方向（sips 旋转为顺时针角度）：6→90°，3→180°，8→270°
function normalizeImage(srcPath, outPath) {
  const orientation = getExifOrientation(fs.readFileSync(srcPath));
  const rot = { 3: 180, 6: 90, 8: 270 }[orientation] || 0;
  fs.copyFileSync(srcPath, outPath);
  if (rot) execFileSync('sips', ['-r', String(rot), outPath], { stdio: 'pipe' });
  return { orientation, rot };
}

function parseBboxes(content) {
  // 解析 "### bbox: [x1,y1,x2,y2]" 行（容忍空格变体）
  const re = /bbox\s*:\s*\[\s*(\d{1,4})\s*,\s*(\d{1,4})\s*,\s*(\d{1,4})\s*,\s*(\d{1,4})\s*\]/g;
  const boxes = [];
  let m;
  while ((m = re.exec(content))) {
    boxes.push({ x1: +m[1], y1: +m[2], x2: +m[3], y2: +m[4] });
  }
  return boxes;
}

function cropWithSips(img, box, outPath) {
  // 0-1000 归一化 → 像素
  const W = +execFileSync('sips', ['-g', 'pixelWidth', img]).toString().match(/pixelWidth:\s*(\d+)/)[1];
  const H = +execFileSync('sips', ['-g', 'pixelHeight', img]).toString().match(/pixelHeight:\s*(\d+)/)[1];
  const x = Math.max(0, Math.round(box.x1 / 1000 * W));
  const y = Math.max(0, Math.round(box.y1 / 1000 * H));
  const w = Math.min(W - x, Math.round((box.x2 - box.x1) / 1000 * W));
  const h = Math.min(H - y, Math.round((box.y2 - box.y1) / 1000 * H));
  if (w < 10 || h < 10) throw new Error(`裁剪尺寸异常 ${w}x${h}`);
  fs.copyFileSync(img, outPath);
  execFileSync('sips', ['-c', String(h), String(w), '--cropOffset', String(y), String(x), outPath], { stdio: 'pipe' });
  return { x, y, w, h, W, H };
}

(async () => {
  const env = loadEnv();
  if (!env.QWEN_API_KEY) { console.error('缺 QWEN_API_KEY'); process.exit(1); }
  const images = process.argv.slice(2);
  if (!images.length) { console.error('用法: node scripts/poc/qwen-bbox-poc.js <图片> [图片...]'); process.exit(1); }
  const outDir = '/tmp/qbbox';
  fs.mkdirSync(outDir, { recursive: true });

  for (const img of images) {
    const base = path.basename(img).replace(/\.[^.]+$/, '');
    console.log(`\n========== ${path.basename(img)} ==========`);
    const norm = path.join(outDir, base + '_norm.jpg');
    const { orientation, rot } = normalizeImage(img, norm);
    if (rot) console.log(`EXIF orientation=${orientation} → 预旋转 ${rot}° 归一化`);
    const t0 = Date.now();
    let content;
    try { content = await callQwen(env, norm); } catch (e) { console.log('调用失败:', e.message); continue; }
    const ms = Date.now() - t0;
    const boxes = parseBboxes(content);
    console.log(`${(ms / 1000).toFixed(1)}s，${content.length} 字，解析出 ${boxes.length} 个 bbox`);
    boxes.forEach((b, i) => {
      const out = path.join(outDir, `${base}_q${i + 1}.jpg`);
      try {
        const px = cropWithSips(norm, b, out);
        console.log(`  题${i + 1} bbox[${b.x1},${b.y1},${b.x2},${b.y2}] → 像素(${px.x},${px.y} ${px.w}x${px.h}) → ${out}`);
      } catch (e) { console.log(`  题${i + 1} 裁剪失败: ${e.message}`); }
    });
    if (boxes.length === 0) {
      console.log('  —— 未解析到 bbox，输出前 300 字 ——');
      console.log('  ' + content.slice(0, 300).split('\n').join('\n  '));
    }
    fs.writeFileSync(path.join(outDir, `${base}_transcript.md`), content);
  }
  console.log(`\n转录全文与裁剪图已存 ${outDir}/（用 read_image 目检裁剪质量）`);
})();