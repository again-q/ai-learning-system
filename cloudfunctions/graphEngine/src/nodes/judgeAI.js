'use strict';
// N2 · AI 判定（judgeOne/index.js:381-399 + 401-451 搬迁）
// 红线：与线上同一 prompt、同一模型参数（thinking disabled / temperature 0.2 / max_tokens 8000），
//      变化只来自「壳」，不来自「芯」；prompt 文本在 src/lib/prompts.js（逐字抽取）。
const { RUBRIC_V2, TRACE_CROP_PROMPT, userMsg } = require('../lib/prompts');

const SYSTEM_MSG = '你是严谨的数学诊断推理引擎。先学生视角感受难度，再对照 L1-L11 标尺判档，最后判定作答。输出纯 JSON。';

function createJudgeAINode({ cloud, postJSON, config, kg, logger } = {}) {
  const log = (logger && logger.warn) ? logger.warn.bind(logger) : console.warn;
  const cfg = config || {};
  if (typeof postJSON !== 'function') throw new Error('N2: postJSON 必填');

  // 切题 v1：单题裁剪图 → 精读痕迹（失败回退整页文本痕迹，不阻断判定）
  async function traceFromCrop(fileId) {
    const file = await cloud.getTempFileURL({ fileList: [fileId] });
    const url = file.fileList[0] && file.fileList[0].tempFileURL;
    if (!url) throw new Error('crop tempURL 为空');
    const imageResp = await fetch(url);
    const buffer = Buffer.from(await imageResp.arrayBuffer());
    const ext = (String(fileId).split('.').pop() || 'jpg').toLowerCase();
    const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' }[ext] || 'image/jpeg';
    const data = await postJSON(cfg.qwenBaseUrl + '/chat/completions', {
      model: cfg.qwenVlModel || 'qwen3.7-plus',
      messages: [{ role: 'user', content: [
        { type: 'image_url', image_url: { url: 'data:' + mime + ';base64,' + buffer.toString('base64') } },
        { type: 'text', text: TRACE_CROP_PROMPT },
      ] }],
      max_tokens: 1500,
      enable_thinking: false,
    }, cfg.qwenApiKey);
    return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  }

  async function judgeQuestion(question, ragContext) {
    const issues = [];
    const ragSection = ragContext ? '\n\n【历史参考（仅供参考不强制）】\n' + ragContext : '';
    // 切题 v1：有单题裁剪图 → 精读痕迹替代整页文本痕迹
    let traceInput = (question.traceReport || '').slice(0, 1500);
    if (question.cropFileID) {
      try {
        const cropTrace = await traceFromCrop(question.cropFileID);
        if (cropTrace && cropTrace.trim()) traceInput = cropTrace.trim().slice(0, 1500);
      } catch (e) {
        log('[graphEngine/N2] 裁剪图痕迹精读失败，回退整页痕迹: ' + e.message);
        issues.push('N2: 裁剪图痕迹精读失败，已回退整页痕迹（' + e.message + '）');
      }
    }
    const nodeList = (kg && typeof kg.buildNodeNames === 'function') ? await kg.buildNodeNames() : '';
    const data = await postJSON(cfg.dsBaseUrl + '/chat/completions', {
      model: cfg.dsModel,
      thinking: { type: 'disabled' },       // 决策 023：thinking 开 + 难题 = content 空死锁
      temperature: 0.2,                      // 决策 023：低温稳定档位
      messages: [
        { role: 'system', content: SYSTEM_MSG },
        { role: 'user', content: userMsg + '\n\n' + (nodeList || '') + '\n\n===== L1-L11 标尺 =====\n' + RUBRIC_V2 + ragSection + '\n\n===== 本题上下文 =====\n题目：' + question.questionText + '\n\n【学生作答痕迹（仅用于判定对错/P/η/归因，严禁用于评估难度——难度是题目固有属性，与作答过程无关）】\n' + traceInput },
      ],
      max_tokens: 8000,
    }, cfg.dsApiKey);
    const msg = data.choices[0].message;
    const content = msg.content || msg.reasoning_content || '';
    // 括号配平：从末尾 } 配平到真实 JSON 起点（跳过 prompt 示例/reasoning 复述）
    const end = content.lastIndexOf('}');
    if (end < 0) throw new Error('判定输出无 JSON');
    let depth = 0, start = -1;
    for (let i = end; i >= 0; i--) {
      const ch = content[i];
      if (ch === '}') depth++;
      else if (ch === '{') { depth--; if (depth === 0) { start = i; break; } }
    }
    if (start < 0) throw new Error('判定 JSON 起点定位失败');
    return { raw: JSON.parse(content.slice(start, end + 1)), issues };
  }

  return async function judgeAINode(state) {
    const out = await judgeQuestion(state.question || {}, state.ragContext);
    const raw = out.raw;
    // 预留接口：外部按「图片题号」提供的标准答案 > LLM 自算的 correctAnswer（judgeOne:619）
    if (state.providedAnswer) raw.correctAnswer = state.providedAnswer;
    return { raw, issues: out.issues };
  };
}

module.exports = { createJudgeAINode, SYSTEM_MSG };
