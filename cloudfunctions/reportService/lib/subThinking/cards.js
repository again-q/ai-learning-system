// ============ 54 项思维清单（名字白名单） ============
// 来源：doc/external-references/数学思维就是5种智慧.md
// 抽取：output/golden/thinking-cards-54.json（2026-10-18）
//
// ⚠️ 用户 2026-10-18 明确要求：「不要全部照抄，保留思想名字即可」
//    → prompt 里只注入名字，不注入花色/牌号；输出也只回名字。
'use strict';

const CARDS = require('./cards.json');

const JOKERS = CARDS.jokers.map((j) => j.name);
const SUIT_NAMES = CARDS.suits.flatMap((s) => s.cards.map((c) => c.name));

/** 全部思维名字（去重，不含花色牌号） */
function allNames() {
  return [...new Set([...JOKERS, ...SUIT_NAMES])];
}

/** 注入 prompt 的名字串 */
function namesForPrompt() {
  return allNames().join('、');
}

/**
 * 清洗模型返回的 cards：
 *   1. 剥掉可能残留的花色/牌号前缀（如「♠10 转化策略」→「转化策略」）
 *   2. 不在白名单里的名字静默剔除（不报错——避免一个怪名让整条思路作废）
 *   3. 去重、最多两个
 */
function sanitizeCards(input) {
  const list = Array.isArray(input) ? input : (input ? [input] : []);
  const white = new Set(allNames());
  const out = [];
  for (const raw of list) {
    const name = String(raw || '')
      .replace(/^[♠♥♦♣]\s*(A|K|Q|J|10|[2-9])?[\s:：]*/, '')
      .trim();
    if (name && white.has(name) && !out.includes(name)) out.push(name);
  }
  return out.slice(0, 2);
}

module.exports = { CARDS, allNames, namesForPrompt, sanitizeCards };
