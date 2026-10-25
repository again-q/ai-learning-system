// ============ 思路推测（2026-10-25，DES-20261025-001 §2.5）============
// 用户原话：「这一问怎么想 AI 的推测，就比如说我看到你的这一步，这一步是这么走的，
//   我就觉得你当时应该是在想这个东西，就是说明是AI推测」。
//
// 与 thinker.js 的分工：
//   · guesser：**猜学生当时的想法**，必须引用学生原文（可核验）
//   · thinker：AI 自己做一遍（现保留为「另一种走法」，默认折叠）
//
// 红线（第一性原理：无证据的心理断言不可核验）：
//   ① 每条猜测必须逐字引用学生原文；引用不上 → 整条丢弃
//   ② 学生没写任何东西 → 不猜（返回空，不许凭空编）
'use strict';

const { extractJson } = require('./solver');

const MAX_GUESSES = 2;

const GUESS_SYS = `你在猜一名高一学生在某一小问的某一步**当时是怎么想的**。
注意：这是猜测，不是结论。学生会看到并可以选择不同意。

硬性要求：
- 只输出 1~2 条**互相排斥**的可能（不能两条讲同一件事）。
- 每条都必须引用学生原文中的一段，**逐字复制，不得改写、不得概括**。
  引用不到就不要写这条。
- why 说「凭什么这么猜」，只能依据学生写出来的东西；不许写"你粗心""你没想到""你以为""你大概是没认真"。
- guess 写「如果是这样，说明当时是怎么走的」。
- 不许给正确答案，不许讲通法。

输出纯 JSON：
{"guesses":[{"quote":"学生原文片段","why":"凭什么这么猜","guess":"如果是这样，说明当时是这么走的"}]}`;

/**
 * 归一化：去空白、标点、数学符号写法差异，用于「引用是否真出现在原文里」的比对。
 * ⚠️ 为什么放宽：第一版只去空白和标点，实测把「x 大于 0」与原文「x>0」判成不匹配 →
 *    两条猜测全被丢弃，功能直接失效。防编造的目标是「不许凭空造一段话」，
 *    不是「必须逐字一模一样」——所以符号、大小于、括号都归一。
 */
const OPERATOR_ALIAS = { '>': '大于', '<': '小于', '>=': '大于等于', '<=': '小于等于', '=': '等于' };
function normForQuote(s) {
  let t = String(s == null ? '' : s);
  t = t.replace(/\s+/g, '')
    .replace(/[，。；：、,.;:!?！？"'“”‘’`\\$]/g, '')
    .replace(/（/g, '(').replace(/）/g, ')')
    .replace(/≤/g, '<=').replace(/≥/g, '>=')
    .replace(/[−–—]/g, '-');
  t = t.replace(/(>=|<=|>|<|=)/g, (m) => OPERATOR_ALIAS[m] || m);
  return t;
}

/** 引用是否可接受：任一侧包含另一侧（允许模型多抄或少抄一点） */
function quoteMatches(quote, studentWork) {
  const q = normForQuote(quote);
  const w = normForQuote(studentWork);
  if (!q || !w) return false;
  if (w.includes(q)) return true;
  return q.includes(w) && w.length >= 4;   // 模型把整段抄进来也算
}

/**
 * 校验模型给的原话引用是否真的在学生原文里。
 * 编造的引用整条丢弃 —— 否则「引用学生的原话」会变成一句空话。
 * @param {Array} guesses
 * @param {string} studentWork
 */
function verifyQuotes(guesses, studentWork) {
  if (!normForQuote(studentWork)) return [];
  return (Array.isArray(guesses) ? guesses : [])
    .map((g) => ({
      quote: String((g && g.quote) || '').trim(),
      why: String((g && g.why) || '').trim(),
      guess: String((g && g.guess) || '').trim(),
    }))
    .filter((g) => g.quote && g.why && g.guess && quoteMatches(g.quote, studentWork));
}

/**
 * @returns {Promise<{guesses:Array<{quote,why,guess}>}>}
 */
async function guess({ call, questionText, subNo, ask, studentWork }) {
  const work = String(studentWork || '').trim();
  // 没有任何学生原文 → 不猜（红线②）
  if (!work) return { guesses: [] };
  const user = [
    '【整道题】',
    String(questionText || ''),
    '',
    '【本次只看这一小问】' + String(subNo || '') + ' ' + String(ask || ''),
    '',
    '【学生在这一小问写的内容（原文）】',
    work.slice(0, 2000),
    '',
    '请输出 JSON。',
  ].join('\n');
  let out;
  try {
    out = await call({ system: GUESS_SYS, user, maxTokens: 1200 });
  } catch (e) {
    return { guesses: [], error: 'guess_call_failed' };
  }
  const j = extractJson(out && out.text) || {};
  const guesses = verifyQuotes(j.guesses, work).slice(0, MAX_GUESSES);
  return { guesses };
}

module.exports = { guess, verifyQuotes, normForQuote, quoteMatches, GUESS_SYS, MAX_GUESSES };
