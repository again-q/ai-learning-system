'use strict';
// 报告/检索侧口径纯函数单测（决策 052 / 063）
// 跑法：node --test cloudfunctions/shared/test/reportReadings.test.js
const test = require('node:test');
const assert = require('node:assert');
const { hitRateOf, evidenceOf, nodeHistoryOf, unitLevelOf, unitLevelsOf } = require('../reportReadings');

// ---- getNodeHistory 的口径修复（2026-10-06）----
test('hitRateOf：按 052 口径算，不读失效的 mastery 字段', () => {
  // 线上真实残留行：attempts=18 correct=6 却写着 mastery=0.57（052 口径应为 1/3）
  assert.strictEqual(hitRateOf({ attempts: 18, correctCount: 6, mastery: 0.57 }), 1 / 3);
  assert.strictEqual(hitRateOf({ attempts: 12, correctCount: 8, mastery: 0.71 }), 2 / 3);
});

test('hitRateOf：无 attempts → null（不是 0）', () => {
  assert.strictEqual(hitRateOf({ attempts: 0, correctCount: 0 }), null);
  assert.strictEqual(hitRateOf(null), null);
  assert.strictEqual(hitRateOf({}), null);
});

test('evidenceOf：样本 ≤1 或显式 insufficient → insufficient', () => {
  assert.strictEqual(evidenceOf({ attempts: 1, correctCount: 1 }), 'insufficient');
  assert.strictEqual(evidenceOf({ attempts: 0 }), 'insufficient');
  assert.strictEqual(evidenceOf({ attempts: 3, correctCount: 1 }), 'ok');
  assert.strictEqual(evidenceOf({ attempts: 3, evidence: 'insufficient' }), 'insufficient');
});

test('nodeHistoryOf：mastery 用 052 口径重算，样本不足时不给结论', () => {
  // 这个用例是本次修复的核心：旧实现会把 0.57 原样返回，导致「薄弱」判断偏乐观
  const n = nodeHistoryOf({ knowledgeNodeId: 'x', attempts: 18, correctCount: 6, mastery: 0.57 }, 'x');
  assert.strictEqual(n.mastery, 1 / 3, '必须按 correctCount/attempts 重算');
  assert.notStrictEqual(n.mastery, 0.57, '绝不能返回失效的 mastery 字段');
  assert.strictEqual(n.evidence, 'ok');
  assert.strictEqual(n.attempts, 18);
  assert.strictEqual(n.correctCount, 6);

  const few = nodeHistoryOf({ knowledgeNodeId: 'y', attempts: 1, correctCount: 1, mastery: 1 }, 'y');
  assert.strictEqual(few.mastery, null, '只考过 1 次不给结论');
  assert.strictEqual(few.evidence, 'insufficient');
});

test('nodeHistoryOf：空行 → null（不编造）', () => {
  assert.strictEqual(nodeHistoryOf(null, 'x'), null);
});

// ---- 单元级 A/U（决策 063）----
test('unitLevelOf：063 行 → 带 λ 衍生的档位与余量', () => {
  const u = unitLevelOf({
    unitName: '第一章 集合', aValue: 0.55, aUpper: 0.699,
    aLevel: 'L6 中档→中上', uLevel: 'L7 中上', aD: 0.705, uD: 0.816,
    lambdaA: 5.056, lambdaU: 6.427, n: 17, algorithm: 'au063_v1',
  });
  assert.strictEqual(u.unitName, '第一章 集合');
  assert.strictEqual(u.aLevel, 'L6 中档→中上');
  assert.ok(Math.abs(u.margin - 1.371) < 1e-6, '余量 = U − A（λ 单位）');
  assert.strictEqual(u.algorithm, 'au063_v1');
});

test('unitLevelOf：055 旧行（无 λ）→ 不报错，λ 衍生字段为 null', () => {
  const u = unitLevelOf({ unitName: '第一章 集合', aValue: 0.3, aUpper: 0.5, n: 7 });
  assert.strictEqual(u.aValue, 0.3);
  assert.strictEqual(u.margin, null, '旧行没有 λ，余量给 null');
  assert.strictEqual(u.aLevel, null);
  assert.strictEqual(u.n, 7);
});

test('unitLevelOf：无 unitName → null', () => {
  assert.strictEqual(unitLevelOf({ n: 5 }), null);
  assert.strictEqual(unitLevelOf(null), null);
});

test('unitLevelsOf：过滤掉 n=0 的空行，只留真实观测', () => {
  const rows = [
    { unitName: 'A', n: 3, lambdaA: 2, lambdaU: 4 },
    { unitName: 'B', n: 0 },
    { unitName: 'C', n: 1, aValue: 0.3, aUpper: 0.5 },
    null,
  ];
  const out = unitLevelsOf(rows);
  assert.deepStrictEqual(out.map((x) => x.unitName), ['A', 'C']);
});

test('unitLevelsOf：空输入 → 空数组（不抛）', () => {
  assert.deepStrictEqual(unitLevelsOf(null), []);
  assert.deepStrictEqual(unitLevelsOf([]), []);
});

// ---- 一致性：同一行数据，三处口径必须一致 ----
test('口径一致性：reportReadings 与 statService/kFormula 对同一行给同样的 K', () => {
  const { rowK } = require('../../statService/kFormula');
  const rows = [
    { attempts: 18, correctCount: 6, mastery: 0.57 },
    { attempts: 12, correctCount: 8, mastery: 0.71 },
    { attempts: 3, correctCount: 0, mastery: 0.8 },
  ];
  for (const r of rows) {
    assert.strictEqual(hitRateOf(r), rowK({ attempts: r.attempts, correctCount: r.correctCount }),
      '两个模块对同一行的 K 必须一致（否则同一份数据会出现两个读数）');
  }
});
