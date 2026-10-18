// ============ 思路生成 ============
// 把「AI 自己做出来的解答」转成「学生能看懂的、一步步自然想到的走法」。
//
// 三条硬规则的来源：
//   · 不讲通法 —— 用户原话：「我不想教学生一种通法，而是告诉学生这个地方是怎么一步步自然想到的」
//   · 每步四要素（手上/还缺/为什么/做法）—— 2026-10-18 实跑验证有效的形态
//   · 数学思维只留名字 —— 用户：「不要全部照抄，保留思想名字即可」
'use strict';

const { extractJson } = require('./solver');
const { namesForPrompt, sanitizeCards } = require('./cards');

const MIN_STEPS = 2;   // 极简小问可能只有 2 步（实测第(1)问 3 步）
const MAX_STEPS = 8;   // 超过就说明在灌水

function thinkSystemPrompt() {
  return `你在给一名高一学生讲**某一个具体小问**的解题思路。不是讲通法，不是讲套路，而是呈现这一小问是怎么一步步被想出来的。

对每一步，必须回答四件事：
1. 此刻手上有什么（题目给了什么条件、前面已经推出了什么）
2. 还缺什么（离目标差在哪）
3. 为什么下一步自然会往这里走（是什么让人想到要这么做）
4. **这一步用到了什么数学思维**——必须从下面这份名字里选，再用一句人话说清怎么用的：
   ${namesForPrompt()}
   规则：
   - 只写【名字】，不要写花色、牌号、编号。
   - 优先选最贴合的那一个；一个说不清可以选两个（最多两个）。
   - 不允许自造名单外的名词。
   - 简单步骤（如直接代入条件）没有真思维含量时，cards 给空数组，say 写「直接套用条件」。

硬性要求：
- 每一步都要能明确推出下一步，逻辑闭合，中间不能跳跃。
- 不允许出现没有动机的步骤。
- 不允许用「通法」「这类题一般」「套路」这类说法。
- 只讲指定的这一小问，**不要讲其他小问**。
- 篇幅克制：一般 3~6 步即可，不要为了详细而拉长。

输出纯 JSON：
{"goal":"这一小问要证明/求出什么（一句话）",
 "steps":[{"n":1,"have":"手上有什么","lack":"还缺什么","why":"为什么走这步","thinking":{"cards":["转化策略"],"say":"一句人话解释"},"do":"这一步具体做了什么"}],
 "ending":"这一小问的思路是怎么闭环的"}`;
}

/** 校验并规整思路（不通过返回 null） */
function validateThinking(t) {
  if (!t || typeof t !== 'object') return null;
  const rawSteps = Array.isArray(t.steps) ? t.steps : [];
  if (rawSteps.length < MIN_STEPS || rawSteps.length > MAX_STEPS) return null;

  const steps = [];
  for (let i = 0; i < rawSteps.length; i++) {
    const s = rawSteps[i] || {};
    const have = String(s.have || '').trim();
    const lack = String(s.lack || '').trim();
    const why = String(s.why || '').trim();
    const doIt = String(s.do || '').trim();
    // 四要素缺一不可 —— 缺了说明模型在敷衍，整条思路作废
    if (!have || !lack || !why || !doIt) return null;

    const tk = s.thinking || {};
    steps.push({
      n: i + 1,
      have: have.slice(0, 500),
      lack: lack.slice(0, 500),
      why: why.slice(0, 600),
      do: doIt.slice(0, 800),
      thinking: {
        cards: sanitizeCards(tk.cards),
        say: String(tk.say || '').slice(0, 400),
      },
    });
  }

  return {
    goal: String(t.goal || '').slice(0, 300),
    steps,
    ending: String(t.ending || '').slice(0, 600),
  };
}

/**
 * @returns {Promise<null | {goal, steps, ending}>}
 */
async function think({ call, questionText, subNo, ask, solution }) {
  const user = [
    '【整道题】',
    String(questionText || ''),
    '',
    '【本次只讲这一小问】' + subNo + ' ' + String(ask || ''),
    '',
    '【这一小问的正确解答】',
    JSON.stringify({ answer: solution && solution.answer, steps: (solution && solution.steps) || [] }, null, 2),
    '',
    '请输出 JSON。',
  ].join('\n');

  let out;
  try {
    out = await call({ system: thinkSystemPrompt(), user, maxTokens: 16000 });
  } catch (e) {
    return null;
  }
  return validateThinking(extractJson(out && out.text));
}

module.exports = { think, thinkSystemPrompt, validateThinking, MIN_STEPS, MAX_STEPS };
