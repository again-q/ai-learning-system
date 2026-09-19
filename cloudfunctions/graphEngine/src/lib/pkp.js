// ============ P_kp 三档与判定辅助纯函数（D3 · 与线上 updateMastery.clamp 同款） ============
// 规格：doc/architecture/判定节点设计-环节判定节点.md §7；决策 043（判据：本身错=0 / 做漏=0.5 / 又对又全=1）
// 原则：全部纯函数、无 IO，供 judgePoints 节点与未来记账节点共用（避免两处漂移）。

'use strict';

/** P_kp 三档钳制：≥1→1；0<v<1→0.5；≤0→0；无法解析→null */
function clampPkp(v) {
  if (v === null || v === undefined || v === '') return null;
  var n = Number(v);
  if (!isFinite(n)) return null;
  if (n >= 1) return 1;
  if (n > 0) return 0.5;
  return 0;
}

/** 名称归一：剥掉尾部「（…）」（实测 F1：模型会把点清单里展示的章节后缀抄回来） */
function normName(s) {
  return String(s || '').replace(/[（(][^）)]*[）)]\s*$/, '').trim();
}

/** 对齐模型输出的点 → canonical 点；真未知名标 unknown（= 编造/越界） */
function alignNames(list, points) {
  var canon = {};
  (points || []).forEach(function (p) { canon[normName(p.name)] = p.name; });
  return (list || []).map(function (it) {
    var key = normName(it && it.name);
    var hit = canon[key];
    var out = Object.assign({}, it || {});
    if (hit) {
      if (out.name !== hit) out.alignedFrom = out.name;
      out.name = hit;
    } else {
      out.unknown = true;
    }
    return out;
  });
}

/** 空白判定（与 judgeOne index.js 629-631 同款：起步即停，或 无答案且分段为空） */
function deriveBlank(q) {
  var src = q || {};
  var bp = src.breakpoint || '';
  var noAns = !String(src.answer || '').trim();
  var noSeg = !(src.segments || []).length;
  return bp === '起步即停' || (noAns && noSeg);
}

/** 超前点判定（决策 040：影子期 learnedChapters=null 视为「全已学」→ 恒 false） */
function deriveAhead(chapter, learnedChapters) {
  if (!learnedChapters || !learnedChapters.length) return false;
  return learnedChapters.indexOf(chapter) < 0;
}

module.exports = { clampPkp: clampPkp, normName: normName, alignNames: alignNames, deriveBlank: deriveBlank, deriveAhead: deriveAhead };