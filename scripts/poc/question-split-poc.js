#!/usr/bin/env node
/**
 * question-split-poc.js — 腾讯云「试卷切题」POC（成本已确认 0.24 元/次 + 首开 1000 次免费）
 *
 * 用途：验证手写作业页的切题质量（检出题数 / 整题 Coord 多边形 / 分类元素）
 * 凭证：.env 或环境变量 TENCENT_SECRET_ID / TENCENT_SECRET_KEY（TC3 签名，值永不打印）
 * 用法：node scripts/poc/question-split-poc.js <图片路径> [更多图片...]
 *
 * 计费提醒：每张图调用一次 QuestionOCR（检测+识别，0.24 元/次）。
 * 只想拿坐标可把 MODE=detect 环境变量置 1（EnableOnlyDetectBorder=true）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HOST = 'ocr.tencentcloudapi.com';
const ACTION = 'QuestionSplitOCR';       // 检测+识别（UseNewModel=true 多模态推理）
const VERSION = '2018-11-19';

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

function sha256hex(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function hmac(key, buf) { return crypto.createHmac('sha256', key).update(buf).digest(); }

async function callQuestionOCR({ secretId, secretKey, payload }) {
  const ts = Math.floor(Date.now() / 1000);
  const date = new Date(ts * 1000).toISOString().slice(0, 10);
  const body = JSON.stringify(payload);
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${HOST}\nx-tc-action:${ACTION.toLowerCase()}\n`;
  const signedHeaders = 'content-type;host;x-tc-action';
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${sha256hex(body)}`;
  const stringToSign = `TC3-HMAC-SHA256\n${ts}\n${date}/ocr/tc3_request\n${sha256hex(canonicalRequest)}`;
  const kDate = hmac('TC3' + secretKey, date);
  const kService = hmac(kDate, 'ocr');
  const kSigning = hmac(kService, 'tc3_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  const auth = `TC3-HMAC-SHA256 Credential=${secretId}/${date}/ocr/tc3_request, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const resp = await fetch(`https://${HOST}/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Host: HOST,
      'X-TC-Action': ACTION,
      'X-TC-Version': VERSION,
      'X-TC-Timestamp': String(ts),
      Authorization: auth,
    },
    body,
  });
  const data = await resp.json();
  return { status: resp.status, data };
}

(async () => {
  const env = loadEnv();
  const secretId = env.TENCENT_SECRET_ID, secretKey = env.TENCENT_SECRET_KEY;
  if (!secretId || !secretKey) {
    console.error('缺凭证：请在 .env 加一行 TENCENT_SECRET_ID=... 和 TENCENT_SECRET_KEY=...（值不打印）');
    process.exit(1);
  }
  const images = process.argv.slice(2);
  if (!images.length) { console.error('用法: node scripts/poc/question-split-poc.js <图片> [图片...]'); process.exit(1); }
  const detectOnly = !!env.MODE_DETECT;

  for (const img of images) {
    console.log(`\n========== ${path.basename(img)} ==========`);
    const b64 = fs.readFileSync(img).toString('base64');
    const payload = {
      ImageBase64: b64,
      UseNewModel: true,                     // 多模态推理模型：题目框选/手写答案定位更优
      EnableImageCrop: true,                 // 切边增强+弯曲矫正
      EnableOnlyDetectBorder: detectOnly,    // detect 模式只要框
    };
    const t0 = Date.now();
    try {
      const { status, data } = await callQuestionOCR({ secretId, secretKey, payload });
      const ms = Date.now() - t0;
      const r = data.Response;
      if (r.Error) { console.log(`失败(${ms}ms) [${status}] ${r.Error.Code}: ${r.Error.Message}`); continue; }
      const infos = r.QuestionInfos || r.QuestionList || [];
      console.log(`${(ms / 1000).toFixed(1)}s，检出题目数：${infos.length}，计费按次（0.24 元）`);
      infos.forEach((q, i) => {
        const coord = q.Coord && q.Coord[0] && q.Coord[0].X != null ? q.Coord.map((p) => `(${p.X},${p.Y})`).join(' ') : '(无坐标)';
        const rl = q.ResultList || {};
        const cats = ['Question', 'Option', 'Answer', 'Parse', 'Figure', 'Table'].map((k) => `${k}:${(rl[k] || []).length}`).join(' ');
        console.log(`  题${i + 1} 坐标[${coord}] ${cats}`);
      });
      console.log('  Response 顶层字段:', Object.keys(r).join(', '));
    } catch (e) {
      console.log('异常:', String(e.message || e).slice(0, 300));
    }
  }
})();
