// ============ 报告/检索侧的口径纯函数（决策 052 / 063） ============
//
// 为什么单独放一个文件：
//   reportService 与 ragService 都 `require('wx-server-sdk')`，本地无法直接单测
//   （云函数依赖只在云端安装）。所以把**纯计算**抽出来，两边共用、可单测。
//
// 覆盖两个 2026-10-06 修的坑：
//   ① getNodeHistory 原来直接返回 `mastery` 字段，但 052 之后权威口径是
//      correctCount/attempts；28/52 条旧行的 mastery 是失效残留
//      （例：attempts=18 correct=6 却写着 0.57，应为 0.33）。
//      报告规则第 10 条禁止输出数值，但**内部判断「是否薄弱」用的就是这个值** ——
//      偏高会把真正薄弱的知识点判成「还行」。
//   ② 报告需要「单元级 A/U」做难度是否合适的内部判断（决策 063），此前完全没有入口。
'use strict';

/** K 的用对率（决策 052 口径）：correctCount / attempts；样本不足返回 null
 *  ⚠️ 与 statService/kFormula.rowK 保持**逐位一致**（不额外四舍五入）——
 *     同一份数据在两处给出不同精度会造成「同一指标两个读数」，
 *     test/reportReadings.test.js 里有一致性用例守着这条。 */
function hitRateOf(row) {
  const a = Number(row && row.attempts) || 0;
  if (a <= 0) return null;
  return (Number(row.correctCount) || 0) / a;
}

/** 证据是否足够下结论（与 statService/kFormula.isUsableRow 同口径） */
function evidenceOf(row) {
  const a = Number(row && row.attempts) || 0;
  if (a <= 1) return 'insufficient';
  if (row && row.evidence === 'insufficient') return 'insufficient';
  return 'ok';
}

/**
 * knowledge_progress 行 → getNodeHistory 的 node 结构。
 * mastery 一律按 052 口径重算，**不读失效字段**。
 */
function nodeHistoryOf(row, nodeId) {
  if (!row) return null;
  const attempts = Number(row.attempts) || 0;
  const ev = evidenceOf(row);
  return {
    knowledgeNodeId: nodeId || row.knowledgeNodeId || null,
    knowledgeNodeName: row.knowledgeNodeName || null,
    // 样本 ≤1 不给结论（宁缺勿假；与 kFormula / updateMastery 同口径）
    mastery: ev === 'ok' ? hitRateOf(row) : null,
    attempts,
    correctCount: Number(row.correctCount) || 0,
    evidence: ev,
    lastUpdated: row.lastUpdated || null,
  };
}

/**
 * unit_progress 行 → 单元级 A/U 结构（决策 063）。
 * 兼容 055 旧行（无 lambdaA/lambdaU）：λ 相关字段给 null，不报错。
 */
function unitLevelOf(row) {
  if (!row || !row.unitName) return null;
  const lA = Number(row.lambdaA), lU = Number(row.lambdaU);
  const hasLambda = Number.isFinite(lA) && Number.isFinite(lU);
  return {
    unitName: row.unitName,
    aValue: row.aValue != null ? row.aValue : null,
    aUpper: row.aUpper != null ? row.aUpper : null,
    aLevel: row.aLevel || null,
    uLevel: row.uLevel || null,
    aD: row.aD != null ? row.aD : null,
    uD: row.uD != null ? row.uD : null,
    // 余量 = U − A：越大越不稳（A ≤ U 结构性成立）
    margin: hasLambda ? Math.round((lU - lA) * 1000) / 1000 : null,
    n: Number(row.n) || 0,
    algorithm: row.algorithm || null,
  };
}

/** unit_progress 行集合 → 单元级 A/U 列表（只保留有观测记录的） */
function unitLevelsOf(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map(unitLevelOf)
    .filter((x) => x && x.n > 0);
}

module.exports = { hitRateOf, evidenceOf, nodeHistoryOf, unitLevelOf, unitLevelsOf };
