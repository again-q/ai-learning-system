// ============ 逐步验证 ============
// 核查 AI 自己那份解答的每一步是否严格成立。
//
// 🔴 红线（决策 061 红线 3）：**判断权在代码，不在模型**。
//    模型只回「成立 / 部分成立 / 不成立」，代码把它裁决成 pass/partial/fail，
//    不允许 thinker 或调用方再解释一次。
//
// 反向测试记录（2026-10-18，output/probe-verifier-redteam.json）：
//    5 份错解（循环论证 / 条件用错 / 漏非零条件 / 跳步 / 学生真实错法）全部拦下；
//    2 份正解中 1 份判「部分成立」，经核实是该解真漏了 u=-1 情形 —— 验证器正确，非误杀。
'use strict';

const { extractJson } = require('./solver');

const VERIFY_SYS = `你是一名严格的证明审阅者。只审查给出的小问解答，逐行判断每一步在数学上是否严格成立。

规则：
1. 每步独立核对：依据是什么（题设条件？前面小问结论？本问前面步骤？），推理是否成立。
2. 不要因为结论对就放过中间步骤。
3. 特别注意：有没有把「要证的」当成「已证的」来用；有没有计算错误；有没有跳过性表述掩盖未完成的推理。
4. 引用前面小问结论时，核对那个结论本身是否已证。

输出纯 JSON：
{"overall":"成立/不成立/部分成立","problems":[{"step":第几步,"issue":"问题","severity":"致命/严重/轻微"}],"note":"整体评价"}`;

/**
 * 唯一裁决点：模型字符串 → 枚举。
 * 无法识别一律保守判 fail（宁可不出思路，也不出错的东西）。
 */
function decide(rawOverall) {
  const s = String(rawOverall == null ? '' : rawOverall).trim();
  if (s === '成立') return 'pass';
  if (s === '部分成立') return 'partial';
  if (s === '不成立') return 'fail';
  return 'fail';
}

/**
 * @returns {Promise<{overall:'pass'|'partial'|'fail', raw:string, problems:Array, note:string}>}
 */
async function verify({ call, questionText, subNo, ask, solution }) {
  const user = [
    '【整道题】',
    String(questionText || ''),
    '',
    '【本次审查的小问】' + subNo + ' ' + String(ask || ''),
    '',
    '【待审查的解答】',
    JSON.stringify({ answer: solution && solution.answer, steps: (solution && solution.steps) || [] }, null, 2),
    '',
    '输出 JSON。',
  ].join('\n');

  let out;
  try {
    out = await call({ system: VERIFY_SYS, user, maxTokens: 12000 });
  } catch (e) {
    // 验证调用失败 → 保守判 fail（不能因为没验就说通过）
    return { overall: 'fail', raw: '调用失败', problems: [], note: '验证调用失败：' + (e && e.message) };
  }

  const j = extractJson(out && out.text);
  if (!j) {
    return { overall: 'fail', raw: '解析失败', problems: [], note: '验证输出无法解析' };
  }

  const raw = String(j.overall || '').trim();
  const problems = Array.isArray(j.problems) ? j.problems.slice(0, 8).map((p) => ({
    step: p && p.step,
    issue: String((p && p.issue) || '').slice(0, 500),
    severity: String((p && p.severity) || '').slice(0, 10),
  })) : [];

  return {
    overall: decide(raw),          // ← 代码裁决，原样保留 raw 便于日志
    raw,
    problems,
    note: String(j.note || '').slice(0, 600),
  };
}

module.exports = { verify, decide, VERIFY_SYS };
