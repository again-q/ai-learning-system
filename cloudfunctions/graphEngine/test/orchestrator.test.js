'use strict';
// 2026-10-25（DES-20261025-001 §1.1）：两判收敛 + 步骤表
// 为什么单测它们：这两处决定「报告里要不要告诉学生『你这一步错了』」——
//   unknown 一旦被当成 broken 展示，就会冤枉学生。
const test = require('node:test');
const assert = require('node:assert');

const { settleStep, buildSteps, parseAnswerPath } = require('../src/lib/orchestrator.js');

test('settleStep：两遍都判 broken → 定案 broken', () => {
  const r = settleStep({ cmp: { status: 'broken', claim: 'A', correct: 'B' }, recheck: { status: 'broken' } });
  assert.equal(r.status, 'broken');
});

test('settleStep：首判 broken + 重核 ok → unknown（不下结论）', () => {
  const r = settleStep({ cmp: { status: 'broken', claim: 'A', correct: 'B' }, recheck: { status: 'ok' } });
  assert.equal(r.status, 'unknown');
  assert.equal(r.note, '两次判断不一致');
});

test('settleStep：首判 broken + 未复核 → 采信首判 broken', () => {
  assert.equal(settleStep({ cmp: { status: 'broken' } }).status, 'broken');
});

test('settleStep：首判非 broken → 原样透传', () => {
  assert.equal(settleStep({ cmp: { status: 'ok' } }).status, 'ok');
  assert.equal(settleStep({ cmp: { status: 'no-computation' } }).status, 'no-computation');
  assert.equal(settleStep({}).status, 'unknown', '缺数据时不假装有结论');
});

test('buildSteps：unknown 不带 claim/correct（不能被读成「你写 X 应为 Y」）', () => {
  const steps = buildSteps([
    { unit: { i: 1, raw: '由条件得 a>0' }, cmp: { status: 'ok' }, settled: { status: 'ok' } },
    { unit: { i: 2, raw: 'g(x)=2x^3-x^2' }, cmp: { status: 'broken', claim: '2x^3-x^2', correct: 'x^3', reason: '算错' }, recheck: { status: 'ok' }, settled: { status: 'unknown', note: '两次判断不一致' } },
  ]);
  assert.equal(steps.length, 2);
  assert.equal(steps[1].status, 'unknown');
  assert.equal(steps[1].claim, null);
  assert.equal(steps[1].correct, null);
  assert.equal(steps[1].reason, '两次判断不一致', 'unknown 要给出「为什么没结论」');
});

test('buildSteps：broken 带 claim/correct/reason；空原文单元被过滤', () => {
  const steps = buildSteps([
    { unit: { i: 2, raw: 'g(x)=2x^3' }, cmp: { status: 'broken', claim: '2x^3', correct: 'x^3', reason: '漏了负半段' }, settled: { status: 'broken' } },
    { unit: { i: 3, raw: '' }, cmp: { status: 'ok' }, settled: { status: 'ok' } },
  ]);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].claim, '2x^3');
  assert.equal(steps[0].correct, 'x^3');
  assert.equal(steps[0].reason, '漏了负半段');
});

test('buildSteps：超长原文截断到 300 字', () => {
  const long = 'x'.repeat(500);
  const steps = buildSteps([{ unit: { i: 1, raw: long }, cmp: { status: 'ok' }, settled: { status: 'ok' } }]);
  assert.equal(steps[0].raw.length, 300);
});

// ============ 2026-10-25：AI 做法的三道代码护栏（ADR-5）============
const okSteps = JSON.stringify([
  { step: '第一步', content: 'x=1', note: '' },
  { step: '第二步', content: 'y=2', note: '' },
]);

test('parseAnswerPath：正常更优 → 原样保留', () => {
  const r = parseAnswerPath(JSON.stringify({ steps: JSON.parse(okSteps), moreEfficient: true, betterAt: 2, whyBetter: '步数少两步' }), 3);
  assert.equal(r.moreEfficient, true);
  assert.equal(r.betterAt, 2);
  assert.equal(r.whyBetter, '步数少两步');
});

test('parseAnswerPath：守卫② betterAt 超出学生步骤数 → 不给更优', () => {
  const r = parseAnswerPath(JSON.stringify({ steps: JSON.parse(okSteps), moreEfficient: true, betterAt: 5, whyBetter: '步数少两步' }), 3);
  assert.equal(r.moreEfficient, false);
  assert.equal(r.betterAt, null);
  assert.equal(r.whyBetter, null);
});

test('parseAnswerPath：守卫② 学生没有可比步骤（0）→ 不给更优', () => {
  const r = parseAnswerPath(JSON.stringify({ steps: JSON.parse(okSteps), moreEfficient: true, betterAt: 1, whyBetter: '计算量更小' }), 0);
  assert.equal(r.moreEfficient, false);
});

test('parseAnswerPath：守卫③ 理由里出现「新方法」→ 不给更优', () => {
  const r = parseAnswerPath(JSON.stringify({ steps: JSON.parse(okSteps), moreEfficient: true, betterAt: 1, whyBetter: '用了新方法' }), 3);
  assert.equal(r.moreEfficient, false);
});

test('parseAnswerPath：守卫① 理由没落在「步骤/分类/计算」→ 不给更优', () => {
  const r = parseAnswerPath(JSON.stringify({ steps: JSON.parse(okSteps), moreEfficient: true, betterAt: 1, whyBetter: '更优雅' }), 3);
  assert.equal(r.moreEfficient, false);
});

test('parseAnswerPath：步骤不足 2 步 → 整条作废（null）', () => {
  assert.equal(parseAnswerPath(JSON.stringify({ steps: [{ step: 'a', content: 'b' }], moreEfficient: false }), 3), null);
});

test('parseAnswerPath：非 JSON → null', () => {
  assert.equal(parseAnswerPath('模型说了些话', 3), null);
});
