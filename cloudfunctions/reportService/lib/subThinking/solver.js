// ============ 独立求解 ============
// 只解指定的那一小问，**不看学生作答**（决策 061 §5：看着学生过程会被带偏）。
//
// ⚠️ 2026-10-18 实测踩坑（必须保留注释）：
//    thinking=enabled 时，max_tokens 是【思考 + 正文】共享预算。
//    首次给 6000，思考吃光后 content 长度 = 0（模型什么都没输出，不是它不会讲）。
//    → 必须给 16000。
'use strict';

function extractJson(s) {
  const m = /```(?:json)?\s*([\s\S]*?)```/.exec(String(s || ''));
  const body = m ? m[1] : String(s || '');
  const i = body.indexOf('{');
  const j = body.lastIndexOf('}');
  if (i < 0 || j < 0) return null;
  try { return JSON.parse(body.slice(i, j + 1)); } catch (_) { return null; }
}

const SOLVE_SYS = `你是一名严谨的数学竞赛教练。请只针对指定的那一小问，给出完整、严格的解答。

要求：
1. 不允许出现「借助已有运算」「最终可得」「易证」「显然」这类跳过性表述，每一步写完整推导。
2. 若该小问依赖前面小问已证的结论，可以直接引用并写明引用的是哪一问。
3. 如果某步不确定，明确写「此处不确定」。
4. 最后判断这一小问是否成立。

输出纯 JSON：
{"answer":"这一小问的结论",
 "steps":[{"step":"这步在做什么","math":"完整数学推导","selfCheck":"成立/不成立/不确定"}],
 "confidence":"高/中/低"}`;

/**
 * @param {object} args
 * @param {function} args.call  模型调用 ({system,user,maxTokens}) => {text}
 * @param {string} args.questionText 整题题面
 * @param {string} args.subNo   小问编号
 * @param {string} args.ask     该小问的设问
 * @param {Array}  [args.previousIssues] 上一轮验证发现的问题（重试时用）
 * @returns {Promise<{answer:string, steps:Array, confidence:string}|null>}
 */
async function solve({ call, questionText, subNo, ask, previousIssues }) {
  const parts = [
    '【整道题】',
    String(questionText || ''),
    '',
    '【本次只解这一小问】' + subNo + ' ' + String(ask || ''),
  ];
  if (Array.isArray(previousIssues) && previousIssues.length) {
    parts.push('', '【上一版解答被指出的问题，请逐条修正】');
    previousIssues.slice(0, 5).forEach((p, i) => {
      parts.push(`${i + 1}. 第${p.step || '?'}步：${p.issue || ''}`);
    });
    parts.push('（重新完整作答，不要只回答差异）');
  }
  parts.push('', '输出 JSON。');

  let out;
  try {
    out = await call({ system: SOLVE_SYS, user: parts.join('\n'), maxTokens: 16000 });
  } catch (e) {
    return null;
  }
  const j = extractJson(out && out.text);
  if (!j || !Array.isArray(j.steps) || !j.steps.length) return null;

  return {
    answer: String(j.answer || '').slice(0, 1000),
    steps: j.steps.slice(0, 20).map((s) => ({
      step: String((s && s.step) || '').slice(0, 200),
      math: String((s && s.math) || '').slice(0, 2000),
      selfCheck: String((s && s.selfCheck) || '').slice(0, 100),
    })),
    confidence: String(j.confidence || '').slice(0, 10),
  };
}

module.exports = { solve, SOLVE_SYS, extractJson };
