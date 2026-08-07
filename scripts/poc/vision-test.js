#!/usr/bin/env node
/**
 * POC 视觉测试 — 图片 → qwen-vl-plus → 题目文本 + 做题痕迹描述
 *
 * 用法:
 *   node scripts/poc/vision-test.js <图片路径> [图片路径...]
 *   node scripts/poc/vision-test.js <图片目录>
 *
 * 依赖: .env 中 QWEN_API_KEY(从环境变量或 .env 读取)
 * 输出: 每张图的 Markdown 报告(题目 + 做题痕迹),打印到 stdout
 */

const fs = require('fs');
const path = require('path');

// ---- 读 .env ----
function loadEnv(file) {
  if (!fs.existsSync(file)) return {};
  const env = {};
  fs.readFileSync(file, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
  return env;
}
const env = loadEnv(path.join(__dirname, '../../.env'));
const API_KEY = process.env.QWEN_API_KEY || env.QWEN_API_KEY;
const MODEL = process.env.QWEN_VL_MODEL || env.QWEN_VL_MODEL || 'qwen3.7-plus';
const BASE_URL = process.env.QWEN_BASE_URL || env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';

if (!API_KEY) {
  console.error('❌ 未找到 QWEN_API_KEY。请在 .env 中配置。');
  process.exit(1);
}

// ---- 收集图片 ----
function collectImages(inputs) {
  const files = [];
  for (const input of inputs) {
    if (fs.statSync(input).isDirectory()) {
      fs.readdirSync(input)
        .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
        .forEach((f) => files.push(path.join(input, f)));
    } else {
      files.push(input);
    }
  }
  return files;
}

// ---- 视觉 prompt(整体把握图片 + 做题痕迹,Markdown 详细版)----
// 设计依据: 诊断引擎-六阶段流水线.md 第二阶段
//   · Qwen 只负责「图像理解」: 题目转录 + 做题痕迹观察(事实层)
//   · 不做认知判定(门禁1/难度/归因是 Flash 的职责)
//   · 参照《21项学习技术》第19章: 先还原现场事实,不提前判案
const VISION_PROMPT = `你是一个数学学习诊断助手,负责「图像理解」阶段。你的任务只有两个:准确转录题目、如实描述做题痕迹。**不要做任何诊断判断**(不判题型认知类型、不评难度、不归因、不推测学生想法)。

请用 Markdown 格式输出:

# 题目转录
## 1. 题目内容
完整转录题目文字(公式用 LaTeX 形式,如 $f(x)=x^2$;图表用文字描述其结构)

## 2. 题目形式
(仅描述形式,不做认知分类)
- 选择 / 填空 / 解答 / 其他

## 3. 题目涉及内容
(只写图上能看到的,如「函数」「不等式」「几何图形」,不上升到知识点判定)

# 做题痕迹观察(按学生解题顺序)
按学生实际书写的**先后顺序**,逐条列出观察到的痕迹事实。每条格式:

- **第 N 步**(位置描述): 观察到的痕迹(如「写了 $3x-2=2x+5$ 后划掉」「此处多次描画,笔迹犹豫」「空白处有草稿 $2x+4=10$」)

## 痕迹类型清单(有则写,没有就不写)
- 涂改/划掉: 哪些位置、改前是什么、改后是什么
- 草稿/演算: 草稿区写了什么步骤
- 停顿/犹豫: 笔迹反复描画、深浅不一、长时间停留的位置
- 跳步: 明显的步骤跳跃(如直接写答案无过程)
- 最终答案: 最后留下的答案是什么

# 输出要求
1. 题目转录力求准确,不确定的字词标注「(不确定)」
2. 痕迹描述只写「看到了什么」,不写「说明了什么」——如「第三步涂改两次」✓,「第三步说明他卡住了」✗
3. 想不起来/看不清的地方如实写「看不清」,不臆测补全`;

// ---- 调用百炼 ----
async function callVision(imagePath) {
  const imageBase64 = fs.readFileSync(imagePath).toString('base64');
  const url = `${BASE_URL}/chat/completions`;

  const body = {
    model: MODEL,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
          { type: 'text', text: VISION_PROMPT },
        ],
      },
    ],
    max_tokens: 2000,
    // 视觉任务是感知任务,不需要深度思考;关思考大幅提速(3-5x)
    enable_thinking: false,
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${err.slice(0, 500)}`);
  }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || '⚠️ 空响应';
}

// ---- main ----
(async () => {
  const inputs = process.argv.slice(2);
  if (inputs.length === 0) {
    console.error('用法: node scripts/poc/vision-test.js <图片路径|目录>');
    process.exit(1);
  }
  const images = collectImages(inputs);
  if (images.length === 0) {
    console.error('❌ 没有找到图片文件');
    process.exit(1);
  }

  console.log(`🔍 视觉测试: ${images.length} 张图, 模型=${MODEL}\n`);

  for (const img of images) {
    console.log(`════════════════════════════════════════`);
    console.log(`📷 图片: ${img}`);
    console.log(`════════════════════════════════════════`);
    try {
      const report = await callVision(img);
      console.log(report);
    } catch (e) {
      console.error(`❌ 失败: ${e.message}`);
    }
    console.log('');
  }
  console.log('✅ 视觉测试完成');
})();
