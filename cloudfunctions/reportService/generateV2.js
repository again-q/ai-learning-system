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

// 进阶分析：召回 hits → 时间线演变 + 重要结论
async function advancedAnalysis(pattern, hits) {
  const user = JSON.stringify({
    pattern: pattern || '',
    hits: (hits || []).map((h) => ({
      date: h.createdAt || null,
      isCorrect: h.isCorrect,
      breakpoint: h.breakpoint || null,
      errorAttribution: h.errorAttribution || null,
      knowledgeNodeName: h.knowledgeNodeName || null,
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

module.exports = { batchSummary, progressNarrative, diffAnalysis, advancedAnalysis, disputePattern, parseSections };