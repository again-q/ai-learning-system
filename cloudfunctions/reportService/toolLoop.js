// ============ Function Calling 循环：Flash 自主调 ragService 工具，直到生成报告 ============
const cloud = require('wx-server-sdk');

const MAX_ROUNDS = 8;   // 工具循环上限，防死循环
const MAX_TOOL_RESULT_CHARS = 4000;   // 工具结果裁剪上限，防撑爆上下文

// 执行工具调用：调 ragService 云函数（结果裁剪后回传模型）
async function execTool(toolCall, userId) {
  const fn = toolCall.function || {};
  const name = fn.name || '';
  let args = {};
  try { args = JSON.parse(fn.arguments || '{}'); } catch (e) { args = {}; }
  const res = await cloud.callFunction({
    name: 'ragService',
    data: Object.assign({ action: name, userId }, args),
  });
  let resultStr = JSON.stringify(res.result || { code: -1, message: '工具调用失败' });
  if (resultStr.length > MAX_TOOL_RESULT_CHARS) {
    resultStr = resultStr.slice(0, MAX_TOOL_RESULT_CHARS) + '...【结果已截断】';
  }
  return resultStr;
}

// 带 tools 的多轮对话：模型请求工具 → 执行 → 回传 → 直到无 tool_calls
async function runWithTools(postJSON, url, apiKey, model, messages, tools, opts) {
  const loop = [];
  for (let i = 0; i < MAX_ROUNDS; i++) {
    const body = {
      model,
      messages,
      tools,
      max_tokens: 8000,
      temperature: 0.7,
      thinking: { type: 'enabled' },   // 报告=分析与生成，需推理深度
    };
    let data;
    try {
      data = await postJSON(url, body, apiKey);
    } catch (e) {
      // thinking 可能 content 空死锁（旧案）：降级 disabled 重试一次
      console.warn('[reportService] thinking 调用失败，降级 disabled 重试:', e.message);
      body.thinking = { type: 'disabled' };
      data = await postJSON(url, body, apiKey);
    }
    const msg = data.choices[0].message || {};
    const content = msg.content || '';

    if (msg.tool_calls && msg.tool_calls.length) {
      messages.push(msg);
      for (const tc of msg.tool_calls) {
        loop.push(tc.function.name);
        const result = await execTool(tc, opts.userId);
        messages.push({ role: 'tool', tool_call_id: tc.id, content: result });   // execTool 已返回字符串
      }
      continue;
    }
    return { content, loops: loop };
  }
  throw new Error('工具循环超限（>8 轮）');
}

module.exports = { runWithTools, execTool };
