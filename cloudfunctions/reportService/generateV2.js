/**
 * generateV2.js — 报告 v2 生成模块
 * 四个生成器：batchSummary(首页一句话) / progressNarrative(进度叙事) / diffAnalysis(差异分析 v9) / advancedAnalysis(进阶-时间线)
 * 全部调用 DeepSeek（判题同模型），thinking 关闭，低温度稳定输出
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DS_API_KEY = process.env.DEEPSEEK_API_KEY;
const DS_BASE_URL = process.env.DS_BASE_URL || 'https://api.deepseek.com';
const DS_MODEL = process.env.DS_MODEL || 'deepseek-v4-flash';

const readPrompt = (name) => fs.readFileSync(path.join(__dirname, 'prompts', name), 'utf8');

let LLM_COST = { prompt: 0, completion: 0, calls: 0 };
function getCost() { return { prompt: LLM_COST.prompt, completion: LLM_COST.completion, calls: LLM_COST.calls }; }
async function callLLM(systemPrompt, userMsg, maxTokens = 1500) {
  const resp = await fetch(`${DS_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DS_API_KEY}` },
    body: JSON.stringify({
      model: DS_MODEL,
      thinking: { type: 'disabled' },
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMsg },
      ],
      max_tokens: maxTokens,
    }),
  });
  if (!resp.ok) throw new Error('LLM HTTP ' + resp.status + ': ' + (await resp.text()).slice(0, 200));
  const data = await resp.json();
  const u = (data && data.usage) || {};
  const pt = u.prompt_tokens || 0, ct = u.completion_tokens || 0;
  LLM_COST.prompt += pt; LLM_COST.completion += ct; LLM_COST.calls++;
  console.log('[llm-cost] prompt=' + pt + ' completion=' + ct + ' | cum_prompt=' + LLM_COST.prompt + ' cum_completion=' + LLM_COST.completion + ' calls=' + LLM_COST.calls);
  return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
}

// 首页一句话：stats + 本批错题知识点聚合
async function batchSummary(stats, wrongTopics) {
  const user = JSON.stringify({ totalQuestions: stats.totalQuestions, correctCount: stats.correctCount, wrongTopics: wrongTopics || [] });
  const out = await callLLM(readPrompt('batch-summary.txt'), user, 400);
  return out.trim() || `${stats.totalQuestions} 道题对了 ${stats.correctCount} 道。`;
}

// 进度叙事：P + 断点 → 一段流畅文字
async function progressNarrative(q) {
  const user = JSON.stringify({
    P: q.processScore,
    breakpointNature: (q.breakpoint && q.breakpoint.nature) || null,
    questionType: q.questionType || '其他',
  });
  const out = await callLLM(readPrompt('progress-narrative.txt'), user, 300);
  return out.trim();
}

// 差异分析 v9：事实/最小推论/钩子 三段（按 errorType 切矛盾式/提醒式由 prompt 处理）
async function diffAnalysis(q) {
  const user = [
    '输入：',
    '• 题面：' + (q.questionText || '').slice(0, 500),
    '• 学生笔迹/过程：' + (q.traceReport || '').slice(0, 500),
    '• 标准答案/正确路径：' + (q.correctAnswer || '无'),
    '• 错误位置：' + (q.breakpoint ? '第 ' + q.breakpoint.index + ' 步，' + q.breakpoint.nature : '最后一步'),
    '• 错误类型：' + (q.errorType || '结果错'),
  ].join('\n');
  const out = await callLLM(readPrompt('diff-analysis.txt'), user, 600);
  return parseSections(out);
}

function parseSections(text) {
  const fact = (text.match(/【事实】([\s\S]*?)(?=【最小推论】|$)/) || [])[1];
  const infer = (text.match(/【最小推论】([\s\S]*?)(?=【钩子】|$)/) || [])[1];
  const hook = (text.match(/【钩子】([\s\S]*?)$/) || [])[1];
  return {
    fact: (fact || '').trim(),
    inference: (infer || '').trim(),
    hook: (hook || '').trim(),
  };
}

// AI 的做法（2026-10-25，DES-20261025-001 §2.3）：判定层没给参考过程时补一份。
// 为什么要它：用户「做对的题，提供 AI 做法；如果 AI 检测到它的做法更优的话，就提示一下」。
// 护栏：与 graphEngine/lib/orchestrator.parseAnswerPath 同一套三门槛（这里独立实现一份，
//       因为两个云函数各自打包，跨函数 require 不通；改规则必须两处同步）。
const AP_STEP_MIN = 2;
const AP_STEP_MAX = 10;
function parseApproach(text, workStepCount) {
  let j = null;
  try { j = JSON.parse(String(text || '').slice(String(text || '').indexOf('{'), String(text || '').lastIndexOf('}') + 1)); } catch (_) { j = null; }
  if (!j) return null;
  const steps = (Array.isArray(j.steps) ? j.steps : [])
    .map((x) => ({
      step: String((x && x.step) || '').slice(0, 80),
      content: String((x && x.content) || '').slice(0, 800),
      note: String((x && x.note) || '').slice(0, 300),
    }))
    .filter((x) => x.step && x.content);
  if (steps.length < AP_STEP_MIN || steps.length > AP_STEP_MAX) return null;
  let moreEfficient = j.moreEfficient === true;
  let betterAt = Number.isInteger(j.betterAt) ? j.betterAt : null;
  const whyBetter = String(j.whyBetter || '').trim().slice(0, 60) || null;
  if (!whyBetter || !/步骤|步数|分类|计算/.test(whyBetter)) moreEfficient = false;
  if (!betterAt || betterAt < 1 || !(workStepCount > 0) || betterAt > workStepCount) moreEfficient = false;
  if (/新方法|新定理|换个思路|通法|套路/.test(whyBetter)) moreEfficient = false;
  if (!moreEfficient) return { steps, moreEfficient: false, betterAt: null, whyBetter: null };
  return { steps, moreEfficient: true, betterAt, whyBetter };
}

/**
 * 只在「解答题 + 判定层没给参考过程」时补一份 AI 做法。
 * @param {object} q 来自 assemble 的题目
 * @param {function} [workerStepCount] 计算学生过程步数的函数（默认用 segments 长度）
 * @returns {Promise<null|{steps,moreEfficient,betterAt,whyBetter}>}
 */
async function aiApproach(q, workStepCount) {
  const src = q || {};
  if (String(src.questionType || '') !== '解答') return null;
  if (Array.isArray(src.referenceProcess) && src.referenceProcess.length) return null;
  // 上次生成过就直接复用（2026-10-25 评审修）：原来只认 referenceProcess，
  //   而报告层的 aiApproach 是写进 questions.aiApproach 的 → 同一批重开报告会重复调模型。
  if (src.aiApproach && Array.isArray(src.aiApproach.steps) && src.aiApproach.steps.length) return src.aiApproach;
  const work = String(src.traceReport || '')
    || (Array.isArray(src.segments) ? src.segments.map((s) => (s && (s.evidence || s.step)) || '').filter(Boolean).join('\n') : '');
  const user = JSON.stringify({
    questionText: String(src.questionText || '').slice(0, 800),
    studentWork: work.slice(0, 1500),
    correctAnswer: String(src.correctAnswer || '').slice(0, 300),
    studentStatus: src.status || '未知',
  });
  const out = await callLLM(readPrompt('ai-approach.txt'), user, 2000);
  return parseApproach(out, Number(workStepCount) || 0);
}

// 诊断（v10）：过程点评/问题在哪儿/下一步 —— 每段由诊断引擎按场景生成
async function diagnosis(q) {
  const user = [
    '输入：',
    '• 题面：' + (q.questionText || '').slice(0, 500),
    '• 学生过程痕迹：' + (q.traceReport || '').slice(0, 500),
    '• 分段：' + JSON.stringify((Array.isArray(q.segments) ? q.segments : []).slice(0, 8)),
    '• 断点：' + (q.breakpoint ? '第 ' + q.breakpoint.index + ' 步，' + q.breakpoint.nature : '无'),
    '• 错误类型：' + (q.errorType || '无'),
    '• 错误层级 errorLevel：' + (q.errorLevel || '无'),
    '• 过程分 P：' + (q.processScore != null ? q.processScore : ''),
    '• 是否整题空白：' + (((q.segments && !q.segments.length) && !(q.traceReport || '').trim() && q.processScore < 0.5) ? '是' : '否'),
    '• 是否有过程（选填题无过程）：' + (q.processAvailable === false ? '无过程' : '有过程'),
    '• 正确路径：' + (q.correctAnswer || '无'),
  ].join('\n');
  const out = await callLLM(readPrompt('diagnosis.txt'), user, 600);
  return parseDiag(out);
}

function parseDiag(text) {
  const comment = (text.match(/【过程点评】([\s\S]*?)(?=【问题在哪儿】|$)/) || [])[1];
  const prob = (text.match(/【问题在哪儿】([\s\S]*?)(?=【下一步】|$)/) || [])[1];
  const hook = (text.match(/【下一步】([\s\S]*?)$/) || [])[1];
  return {
    comment: (comment || '').trim(),
    inference: (prob || '').trim(),
    hook: (hook || '').trim(),
  };
}

// 进阶分析：召回 hits → 时间线演变 + 重要结论
async function advancedAnalysis(pattern, hits) {
  const user = JSON.stringify({
    pattern: pattern || '',
    hits: (hits || []).map((h) => ({
      date: h.createdAt || null,
      isCorrect: h.isCorrect,
      breakpoint: h.breakpoint || null,
      breakpointNature: (h.breakpoint && h.breakpoint.nature) || null,
      errorCategory: h.errorLevel || h.errorCategory || null,
      processScore: h.processScore != null ? h.processScore : null,
      errorAttribution: h.errorAttribution || null,
      // 决策 053：hits 已无主知识点 → 用 knowledgeUsage 名拼接（键名沿用 prompt 里已有的 knowledgeNodeName，
      // 不改 LLM 合约；旧 hits 仍有该字段时兜底）
      knowledgeNodeName: (Array.isArray(h.knowledgeUsage) && h.knowledgeUsage.length
        ? h.knowledgeUsage.map((u) => String((u && u.name) || '').trim()).filter(Boolean).join('、')
        : (h.knowledgeNodeName || null)),
    })),
  });
  const out = await callLLM(readPrompt('advanced-analysis.txt'), user, 800);
  return out.trim();
}

// 题型异议判定：接受/拒绝学生的题型更改提议 + 简短看法
async function disputePattern(originalPattern, studentProposal) {
  const user = JSON.stringify({ originalPattern: originalPattern || '', studentProposal: studentProposal || '' });
  const out = await callLLM(readPrompt('pattern-dispute.txt'), user, 300);
  try {
    const j = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));
    return { accepted: j.accepted === true, comment: String(j.comment || '').trim() };
  } catch (_) {
    return { accepted: false, comment: '抱歉，这次判定没看明白，请稍后再试。' };
  }
}

module.exports = { batchSummary, progressNarrative, diffAnalysis, diagnosis, parseDiag, aiApproach, parseApproach, advancedAnalysis, disputePattern, parseSections, getCost };