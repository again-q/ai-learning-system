#!/usr/bin/env node
/**
 * vision-backup-poc.js — 视觉备胎 POC：deepseek-v4-flash-vision-exp vs Qwen3.7-plus
 *
 * 与 diagnose/index.js 使用完全相同的 VISION_PROMPT，公平对比转录质量。
 * 密钥解析（永不打印）：
 *   QWEN_API_KEY   ← 项目 .env
 *   DEEPSEEK_API_KEY ← 环境变量 或 ~/.dsh/.credentials.yaml（refs 平铺 map）
 *
 * 用法：node scripts/poc/vision-backup-poc.js <图片路径> [更多图片...]
 */
'use strict';
const fs = require('fs');
const path = require('path');

// 与 cloudfunctions/diagnose/index.js 保持一致（决策 017：整体把握散文）
const VISION_PROMPT = `你是数学学习诊断助手的图像理解阶段。任务：准确转录题目 + 如实描述做题痕迹。不要做诊断判断。

输出 Markdown：
# 题目转录
（每题独立成块，以「1.」「2.」等题号开头，含完整题干、所有选项内容和题目形式；一题一段，块与块之间空行）

# 做题痕迹观察
（必须按题号分组，禁止把所有题的痕迹混成一段）
## 第1题
- 按书写顺序：步骤/位置/痕迹（涂改、草稿、最终答案）
## 第2题
- …
（有几题写几节；某题完全无痕迹则写「无可见痕迹」）

# 输出要求
不确定处标(不确定)；看不清写(看不清)；最终答案逐字符精确（≥≤><=符号不能错）；不臆测；公式尽量用 $...$ / $$...$$`;

function loadProjectEnv() {
  const p = path.join(__dirname, '..', '..', '.env');
  const out = {};
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    }
  }
  return out;
}

function loadDeepSeekKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  const cred = path.join(process.env.HOME || '', '.dsh', '.credentials.yaml');
  if (fs.existsSync(cred)) {
    const m = fs.readFileSync(cred, 'utf8').match(/DEEPSEEK_API_KEY:\s*(\S+)/);
    if (m) return m[1];
  }
  return null;
}

async function callVision(leg, imagePath) {
  const b64 = fs.readFileSync(imagePath).toString('base64');
  const ext = (imagePath.split('.').pop() || 'jpg').toLowerCase();
  const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
  const body = {
    model: leg.model,
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } },
        { type: 'text', text: VISION_PROMPT },
      ],
    }],
    max_tokens: 3000,
    ...leg.extraBody,
  };
  const t0 = Date.now();
  const resp = await fetch(`${leg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${leg.apiKey}` },
    body: JSON.stringify(body),
  });
  const ms = Date.now() - t0;
  if (!resp.ok) {
    const errText = await resp.text();
    return { ok: false, ms, error: `HTTP ${resp.status}: ${errText.slice(0, 300)}` };
  }
  const data = await resp.json();
  const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  return {
    ok: true, ms, content,
    chars: content.length,
    hasTranscribe: /#\s*题目转录/.test(content),
    hasTrace: /#\s*做题痕迹/.test(content),
    usage: data.usage || null,
  };
}

(async () => {
  const images = process.argv.slice(2);
  if (!images.length) {
    console.error('用法: node scripts/poc/vision-backup-poc.js <图片路径> [更多图片...]');
    process.exit(1);
  }
  const env = loadProjectEnv();
  const dsKey = loadDeepSeekKey();
  const legs = [
    { name: 'Qwen 主力', baseUrl: env.QWEN_BASE_URL, apiKey: env.QWEN_API_KEY, model: env.QWEN_VL_MODEL || 'qwen3.7-plus', extraBody: { enable_thinking: false } },
    { name: 'DS 备选', baseUrl: 'https://api.deepseek.com', apiKey: dsKey, model: 'deepseek-v4-flash-vision-exp', extraBody: {} },
  ];
  for (const img of images) {
    console.log(`\n========== ${path.basename(img)} ==========`);
    for (const leg of legs) {
      if (!leg.apiKey) { console.log(`[${leg.name}] 跳过：无密钥`); continue; }
      process.stdout.write(`[${leg.name}] (${leg.model}) 调用中...`);
      try {
        const r = await callVision(leg, img);
        if (!r.ok) { console.log(` 失败(${r.ms}ms)\n  ${r.error}`); continue; }
        console.log(` ${(r.ms / 1000).toFixed(1)}s, ${r.chars} 字, 转录节:${r.hasTranscribe ? '有' : '无'}, 痕迹节:${r.hasTrace ? '有' : '无'}${r.usage ? `, tokens ${r.usage.prompt_tokens}/${r.usage.completion_tokens}` : ''}`);
        const outDir = '/tmp/qbbox/comparison';
        fs.mkdirSync(outDir, { recursive: true });
        const tag = leg.name.includes('Qwen') ? 'qwen' : 'ds';
        const outFile = path.join(outDir, `${path.basename(img).replace(/\\.[^.]+$/, '')}_${tag}.md`);
        fs.writeFileSync(outFile, `模型: ${leg.model}\n耗时: ${r.ms}ms\nusage: ${JSON.stringify(r.usage)}\n\n${r.content}`);
        console.log('  全文→ ' + outFile);
        console.log('  ——输出前 400 字——');
        console.log(r.content.slice(0, 400).split('\n').map((l) => '  ' + l).join('\n'));
      } catch (e) {
        console.log(` 异常: ${String(e.message || e).slice(0, 300)}`);
      }
    }
  }
})();