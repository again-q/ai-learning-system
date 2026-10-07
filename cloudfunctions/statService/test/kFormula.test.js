'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { computeK, isUsableRow } = require('../kFormula');

// 2026-09-26 决策 052：K 总览 = 叶子用对率；父节点聚合行与证据不足行都不进总览
test('computeK：基本用对率（对 6 / 考 8 = 0.75）', () => {
  assert.strictEqual(computeK([{ attempts: 4, correctCount: 3 }, { attempts: 4, correctCount: 3 }]), 0.75);
});

test('computeK：排除父节点聚合行（aggregated）——同一证据不能记两遍', () => {
  const rows = [{ attempts: 2, correctCount: 0 }, { attempts: 2, correctCount: 2, aggregated: true, mastery: 1 }];
  assert.strictEqual(computeK(rows), 0, '父节点聚合行被排除');
});

test('computeK：排除「证据不足」行（只考过 1 次不给结论）', () => {
  const rows = [{ attempts: 1, correctCount: 1, evidence: 'insufficient' }, { attempts: 3, correctCount: 0, evidence: 'ok' }];
  assert.strictEqual(computeK(rows), 0);
});

test('computeK：无有效样本 → null（不是 0，前端才能区分「没学」与「没数据」）', () => {
  assert.strictEqual(computeK([]), null);
  assert.strictEqual(computeK(null), null);
  assert.strictEqual(computeK([{ attempts: 0, correctCount: 0 }]), null);
  assert.strictEqual(computeK([{ attempts: 1, correctCount: 1, evidence: 'insufficient' }]), null);
});

test('computeK：真实快照（14 行线上旧数据，attempts/correctCount 齐全）', () => {
  // 取自 2026-09-25 线上 knowledge_progress 备份（孤儿行备份），验证旧数据同口径可算
  const rows = [
    { attempts: 7, correctCount: 7 }, { attempts: 3, correctCount: 2 }, { attempts: 1, correctCount: 0 },
    { attempts: 1, correctCount: 1, evidence: 'insufficient' }, { attempts: 2, correctCount: 2, aggregated: true },
  ];
  assert.strictEqual(computeK(rows), (7 + 2 + 0) / (7 + 3 + 1));
});

test('isUsableRow：边界（null / 老数据无 evidence 字段视为可用）', () => {
  assert.strictEqual(isUsableRow(null), false);
  assert.strictEqual(isUsableRow({ attempts: 2, correctCount: 1 }), true, '老数据没有 evidence/aggregated 字段 → 可用');
  assert.strictEqual(isUsableRow({ aggregated: true }), false);
  assert.strictEqual(isUsableRow({ evidence: 'insufficient' }), false);
});
// 2026-10-06 新增：rowK —— 单行 K，供「最弱知识点」排序用
// 背景：masteryOverview 原来按 `mastery` 字段排序，但 052 之后权威口径是
//       correctCount/attempts，mastery 在 28 条旧行上是失效残留 → 排序错乱。
test('rowK：按 052 口径算单行 K，不读失效的 mastery 字段', () => {
  const { rowK } = require('../kFormula');
  // 线上真实残留行：attempts=18 correct=6 但 mastery=0.57（052 口径应为 0.33）
  assert.strictEqual(rowK({ attempts: 18, correctCount: 6, mastery: 0.57 }), 1 / 3);
  assert.strictEqual(rowK({ attempts: 12, correctCount: 8, mastery: 0.71 }), 2 / 3);
});

test('rowK：与 computeK 同源（单行 K 必须能加权还原总 K）', () => {
  const { rowK, computeK } = require('../kFormula');
  const rows = [{ attempts: 3, correctCount: 1 }, { attempts: 5, correctCount: 4 }];
  const total = computeK(rows);
  let num = 0, den = 0;
  rows.forEach((r) => { const k = rowK(r); num += k * r.attempts; den += r.attempts; });
  assert.ok(Math.abs(num / den - total) < 1e-12, '按 attempts 加权的单行 K 应等于总 K');
});

test('rowK：父节点聚合行与证据不足行返回 null（与 isUsableRow 一致）', () => {
  const { rowK } = require('../kFormula');
  assert.strictEqual(rowK({ attempts: 5, correctCount: 5, aggregated: true }), null);
  assert.strictEqual(rowK({ attempts: 1, correctCount: 1, evidence: 'insufficient' }), null);
  assert.strictEqual(rowK({ attempts: 0, correctCount: 0 }), null);
  assert.strictEqual(rowK(null), null);
});
