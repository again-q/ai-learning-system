// ============ 环节判定节点（D3 · K 第二节点） ============
// 规格：doc/architecture/判定节点设计-环节判定节点.md
// 冒烟：scripts/smoke-judge-points.mjs（3 轮 × 5 类题，逐点一致率 20/20；判据见决策 043）
// 原则：代码先行（空白短路 / 名称归一 / 三档钳制 / 漏点与编造校验），模型只干「看痕迹打 P_kp」；llm 由外注入。
//      本节点只判不记：不写库、不更新档案（记账属下游节点职责）。

'use strict';

var pkp = require('../lib/pkp');

// ---------- 提示词：三问判据（决策 043 原文口径） ----------
function buildJudgeSystem(points, opts) {
  var o = opts || {};
  var list = (points || []).map(function (p, i) {
    return (i + 1) + '. ' + p.name + (p.chapter ? '（' + p.chapter + '）' : '');
  }).join('\n');
  var lines = [
    '你是环节判定器。任务：对着【考点清单】逐点核对【学生痕迹】，判断每个考点「用上没有、用对没有」。',
    '判定流程（对每个点【依次】问三个问题，不许跳步）：',
    '  ① 这一步在痕迹里出现了吗？—— 没出现 → state=noEvidence，P_kp=null（禁止脑补「他应该会」）；',
    '  ② 出现了：这一步【本身】做对了吗？—— 做错（法则用错 / 计算错 / 结论与法则不符）→ state=judged，P_kp=0；',
    '  ③ 本身做对：做【完整】了吗？—— 漏情况 / 漏条件 / 漏端点 / 只写一半 → P_kp=0.5；又对又完整 → P_kp=1。',
    '★ 判 0 还是 0.5 只看「这一步本身对不对」，不看最终答案对不对：答案错也可能是 0.5（只漏了一种情况）；答案对但步骤错也照判 0。',
    '每个 judged 点都要给 basis（引用学生原话片段）；noEvidence 也要给一句为什么没有证据。',
    '只判清单里的点，不得新增点、不得漏点。',
    '另外给出整题路径质量 eta（0~1：越接近本质解法越高；暴力枚举/硬算偏低）与一句 note。',
    '【考点清单】',
    list,
    '只输出 JSON：{"points":[{"name":"","state":"judged|noEvidence","P_kp":null,"basis":""}],"eta":0.0,"note":""}',
  ];
  if (o.traceBlurry) {
    lines.splice(lines.length - 1, 0, '注意：本题痕迹字迹模糊/涂改严重 —— 看不清的点一律 noEvidence，禁止猜测。');
  }
  return lines.join('\n');
}

function buildJudgeUser(question, trace) {
  var t = trace && String(trace).trim() ? String(trace) : '（空白，没有任何书写内容）';
  return '【题目】\n' + question + '\n\n【学生痕迹】\n' + t;
}

// ---------- 代码校验与归一（纯函数，可单测） ----------
function verifyAndNormalize(rawPoints, points) {
  var issues = [];
  var byName = {};
  (points || []).forEach(function (p) { byName[p.name] = p; });
  var aligned = pkp.alignNames(rawPoints, points);
  var out = [];
  aligned.forEach(function (it) {
    if (it.unknown) { issues.push('编造/越界点: ' + it.name); return; }
    var st = it.state;
    if (st !== 'judged' && st !== 'noEvidence') { issues.push('非法 state(' + st + '): ' + it.name); st = 'noEvidence'; }
    var p = byName[it.name] || {};
    var rec = {
      name: it.name,
      chapter: p.chapter || '',
      dkp: p.dkp !== null && p.dkp !== undefined ? p.dkp : null,
      basis: String(it.basis || '').slice(0, 200),
    };
    if (it.alignedFrom) rec.alignedFrom = it.alignedFrom;
    if (st === 'judged') {
      var c = pkp.clampPkp(it.P_kp);
      if (c === null) { issues.push('judged 点缺 P_kp: ' + it.name); c = 0; }
      if (!rec.basis.trim()) issues.push('judged 点缺 basis: ' + it.name);
      rec.state = 'judged';
      rec.P_kp = c;
    } else {
      if (it.P_kp !== null && it.P_kp !== undefined) issues.push('noEvidence 点带分: ' + it.name);
      rec.state = 'noEvidence';
      rec.P_kp = null;
    }
    out.push(rec);
  });
  var missing = (points || []).filter(function (p) {
    return !out.some(function (o) { return o.name === p.name; });
  }).map(function (p) { return p.name; });
  if (missing.length) issues.push('漏点(未出现在输出): ' + missing.join('/'));
  return { points: out, issues: issues, missing: missing };
}

// ---------- 主节点（可当 LangGraph 节点，也可直接单跑） ----------
/**
 * @param {{question:string, points:Array, trace:{answer,segments,breakpoint}|string,
 *          derived:{blank?,learnedChapters?,traceBlurry?}, llm:({system,user})=>Promise<object>}} args
 *   llm：注入的模型调用（返回已解析 JSON）；测试传假 llm
 *   derived.learnedChapters：决策 040 —— 影子期传 null（= 全已学，isAhead 恒 false）
 */
async function judgePointsNode(args) {
  var a = args || {};
  var question = String(a.question || '').trim();
  var points = a.points || [];
  if (!question) throw new Error('缺少题面');
  if (!points.length) throw new Error('缺少考点清单（points）');
  var derived = a.derived || {};
  var traceText = typeof a.trace === 'string' ? a.trace : String((a.trace && a.trace.answer) || '');
  // 空白判定：trace 可能是对象（{answer,segments,breakpoint}）或纯文本（字符串）——字符串非空即视为有痕迹
  var blank = derived.blank !== undefined
    ? !!derived.blank
    : (typeof a.trace === 'string' ? !a.trace.trim() : pkp.deriveBlank(a.trace || {}));
  var learned = derived.learnedChapters !== undefined ? derived.learnedChapters : null;

  // 代码先行：整题空白 → 短路，不调模型（防脑补 + 省钱）
  if (blank) {
    var blankPoints = points.map(function (p) {
      return {
        name: p.name, chapter: p.chapter || '',
        dkp: p.dkp !== null && p.dkp !== undefined ? p.dkp : null,
        state: 'blank', P_kp: 0, auto: true, basis: '整题空白（代码短路）',
        isAhead: pkp.deriveAhead(p.chapter || '', learned),
      };
    });
    return { ok: true, blank: true, points: blankPoints, eta: null, note: '整题空白，未调用模型', llmCalls: 0, issues: [] };
  }

  if (typeof a.llm !== 'function') throw new Error('缺少 llm（依赖注入）');
  var sys = buildJudgeSystem(points, { traceBlurry: !!derived.traceBlurry });
  var raw = await a.llm({ system: sys, user: buildJudgeUser(question, traceText) });
  var norm = verifyAndNormalize((raw && raw.points) || [], points);
  var outPoints = norm.points.map(function (r) {
    return Object.assign({}, r, { isAhead: pkp.deriveAhead(r.chapter, learned) });
  });
  var eta = raw && raw.eta !== undefined && raw.eta !== null && isFinite(Number(raw.eta)) ? Number(raw.eta) : null;
  return {
    ok: norm.issues.length === 0,
    blank: false,
    points: outPoints,
    eta: eta,
    note: (raw && raw.note) || '',
    llmCalls: 1,
    issues: norm.issues,
  };
}

module.exports = {
  judgePointsNode: judgePointsNode,
  buildJudgeSystem: buildJudgeSystem,
  buildJudgeUser: buildJudgeUser,
  verifyAndNormalize: verifyAndNormalize,
};