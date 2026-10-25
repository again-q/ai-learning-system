'use strict';
// 2026-10-25（DES-20261025-001 §2.3/§2.5）：报告层两个纯逻辑单测
//   · parseApproach：AI 做法解析 + 三道代码护栏（与 graphEngine 那份实现同规则，两处必须一致）
//   · correctNote：做对题的模板句（零 AI）
//   · verifyQuotes：推测必须引用学生原文（防编造）
const test = require('node:test');
const assert = require('node:assert');

const { parseApproach } = require('./generateV2.js');
const { verifyQuotes } = require('./lib/subThinking/guesser.js');

const steps2 = [
  { step: '第一步', content: 'x=1', note: '' },
  { step: '第二步', content: 'y=2', note: '' },
];

test('parseApproach：正常更优 → 保留', () => {
  const r = parseApproach(JSON.stringify({ steps: steps2, moreEfficient: true, betterAt: 2, whyBetter: '步数少一步' }), 3);
  assert.equal(r.moreEfficient, true);
  assert.equal(r.betterAt, 2);
});

test('parseApproach：betterAt 超出学生步数 → 不提示更优', () => {
  const r = parseApproach(JSON.stringify({ steps: steps2, moreEfficient: true, betterAt: 9, whyBetter: '步数少一步' }), 3);
  assert.equal(r.moreEfficient, false);
  assert.equal(r.betterAt, null);
  assert.equal(r.whyBetter, null);
});

test('parseApproach：含新方法 → 不提示更优', () => {
  const r = parseApproach(JSON.stringify({ steps: steps2, moreEfficient: true, betterAt: 1, whyBetter: '用了新方法' }), 3);
  assert.equal(r.moreEfficient, false);
});

test('parseApproach：理由不在「步骤/分类/计算」→ 不提示更优', () => {
  const r = parseApproach(JSON.stringify({ steps: steps2, moreEfficient: true, betterAt: 1, whyBetter: '更优雅' }), 3);
  assert.equal(r.moreEfficient, false);
});

test('parseApproach：学生没有可比步骤 → 不提示更优', () => {
  const r = parseApproach(JSON.stringify({ steps: steps2, moreEfficient: true, betterAt: 1, whyBetter: '计算量更小' }), 0);
  assert.equal(r.moreEfficient, false);
});

test('parseApproach：步骤不足 → null；非 JSON → null', () => {
  assert.equal(parseApproach(JSON.stringify({ steps: [steps2[0]], moreEfficient: false }), 3), null);
  assert.equal(parseApproach('不是 JSON', 3), null);
});

test('verifyQuotes：改写可接受，编造一律丢弃', () => {
  const work = '由 x>0 得 a≥1，所以 a 的范围是 [1,+∞)';
  const kept = verifyQuotes([
    { quote: 'x 大于 0', why: 'w1', guess: 'g1' },      // 符号写法不同，应接受
    { quote: '学生没写这句', why: 'w2', guess: 'g2' },   // 编造，应丢弃
    { quote: 'a 的范围是 [1,+∞)', why: 'w3', guess: 'g3' },
  ], work);
  assert.equal(kept.length, 2);
  assert.deepEqual(kept.map((g) => g.why), ['w1', 'w3']);
});

test('verifyQuotes：学生完全没写东西 → 不猜', () => {
  assert.equal(verifyQuotes([{ quote: '随便', why: 'w', guess: 'g' }], '').length, 0);
});
