'use strict';
// K（知识掌握）总览口径 —— 决策 052 定稿：叶子「用对率」= ΣcorrectCount / Σattempts
//   · 只用**叶子**行：父节点的 mastery 由子节点聚合而来（aggregated:true），算进总数等于同一证据记两遍
//   · 排除「证据不足」行：只考过 1 次不给结论（决策 052）→ 前端应显示「样本不足」而不是 0%/100%
//   · 旧数据（053 之前）也有 attempts/correctCount → 同口径可算；不再读 sValue/dValue（新口径已停写，读它会算出 null）
// 纯函数、不碰 db：放独立文件是为了可单测（require index.js 会触发 cloud.init）
function isUsableRow(r) {
  return !!r && r.aggregated !== true && r.evidence !== 'insufficient';
}

function computeK(rows) {
  let attempts = 0, correct = 0;
  for (const r of (Array.isArray(rows) ? rows : [])) {
    if (!isUsableRow(r)) continue;
    attempts += Number(r.attempts) || 0;
    correct += Number(r.correctCount) || 0;
  }
  return attempts > 0 ? correct / attempts : null;
}

/** 单行的 K（用对率），与 computeK 同一口径；无有效样本返回 null */
function rowK(r) {
  if (!isUsableRow(r)) return null;
  const a = Number(r.attempts) || 0;
  if (a <= 0) return null;
  return (Number(r.correctCount) || 0) / a;
}

module.exports = { computeK, isUsableRow, rowK };