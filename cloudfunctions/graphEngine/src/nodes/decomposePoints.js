// ============ 拆考点节点（K·题侧第一环） ============
// 规格：doc/architecture/判定节点设计-拆考点节点.md（"实现等 LangGraph 环境就绪" —— D1 就绪后落地）
// 参考：scripts/smoke-decompose-points.mjs（已验证的三步冒烟逻辑）
// 原则：纯题侧（不含学生）；编号输出掐断错字；候选是参考不是天花板（other 通道必报）；llm/kg 全部注入。

// ---------- 步① prompt：识别涉及的章（宁宽勿漏） ----------
function buildStep1System(chapters) {
  return (
    '你是高中数学题目分析器。判断题目涉及必修第一册的哪些章。\n' +
    '可选的章（只能从这些里选，可多选，宁多勿漏；拿不准的章也列上）：\n' +
    chapters.join('\n') +
    '\n只输出 JSON：{"chapters":["章名",...]}'
  );
}

// ---------- 步③ prompt：单单元勾选（编号输出 + other 通道 + 禁止硬勾掩盖） ----------
function buildStep3System(list) {
  const numbered = list.map((n, i) => `  ${i + 1}. ${n}`).join('\n');
  const sys =
    '任务：拆出本题【标准考察】的完整考点——即按出题意图和常规解法，要解这道题必须用到的知识点。拆解独立于任何学生（不因学生水平改变）。\n' +
    `下面只给出【一个单元】的知识点候选清单（编号 1~${list.length}）：\n` +
    numbered +
    '\n· 候选中的点：本题标准考察用得到 → 勾编号并给 dkp（0~1 考察难度，纯难度无比重）；\n' +
    '· 候选里没有、但本题标准考察确实需要的点（如超出本图谱的知识）→ 必须填 other：每个 other 必须给 name（满足五要素命名：定义/表示/性质/操作/关系）+ elementType + reason（它是什么知识、为什么本题标准解法需要它、为何不在候选里）。缺一不可；\n' +
    '· 禁止为了凑数勾选与本题核心考察无关的候选点；也禁止用候选点掩盖候选外的核心考察。\n' +
    '只输出 JSON：{"pointIds":[编号...],"dkps":{"编号":0~1},"other":[{"name":"","elementType":"定义|表示|性质|操作|关系","reason":""}],"outOfSyllabus":false}';
  return { numbered, sys };
}

// ---------- 还原与校验（纯代码，见 smoke verify） ----------
/**
 * 把模型勾选的编号还原为名字并校验
 * @param {Array} picks 每个单元：{ ch, numbered, step3:{pointIds,dkps,other,outOfSyllabus} }
 * @returns {{ got:Array, issues:string[], otherOk:boolean, outOfSyllabus:boolean }}
 */
function resolvePicks(picks) {
  const issues = [];
  const got = [];
  let otherOk = true;
  let outOfSyllabus = false;
  for (const p of picks || []) {
    const names = (p.numbered || '').split('\n').map((l) => l.replace(/^\s*\d+\.\s*/, '').trim()).filter(Boolean);
    const s3 = p.step3 || {};
    if (s3.outOfSyllabus === true) outOfSyllabus = true;
    const map = {};
    names.forEach((n, i) => { map[i + 1] = n; });
    for (const id of s3.pointIds || []) {
      if (!map[id]) { issues.push(`[${p.ch}] pointId ${id} 越界`); continue; }
      const nm = map[id];
      const dkp = s3.dkps ? s3.dkps[String(id)] : undefined;
      got.push({ name: nm, chapter: p.ch, dkp: dkp != null ? Number(dkp) : null });
    }
    for (const o of s3.other || []) {
      const fiveOk = ['定义', '表示', '性质', '操作', '关系'].includes(o.elementType);
      if (!o.name || !fiveOk || !(o.reason || '').trim()) {
        otherOk = false;
        issues.push(`[${p.ch}] other 双门槛不满足`);
      } else {
        got.push({ name: o.name, chapter: p.ch, dkp: null, isOther: true });
      }
    }
  }
  return { got, issues, otherOk, outOfSyllabus };
}

// ---------- 主节点函数（可当 LangGraph 节点，也可直接单跑） ----------
/**
 * @param {{ question:string, llm:({system,user})=>Promise<object>, kg:{chapters,getPointsByChapter} }} args
 *    llm：注入的模型调用（返回已解析 JSON）。测试传假 llm；生产传真实渠道 adapter。
 * @returns 考点拆解产物
 */
async function decomposePointsNode(args) {
  const { question, llm, kg } = args;
  if (!question || !String(question).trim()) throw new Error('缺少题面');
  if (typeof llm !== 'function') throw new Error('缺少 llm（依赖注入）');
  if (!kg || !kg.chapters || !kg.getPointsByChapter) throw new Error('缺少 kg（知识图谱候选索引）');

  const questionText = String(question).trim();

  // 步① 模型：识别涉及的章
  const step1 = await llm({ system: buildStep1System(kg.chapters), user: `题目：${questionText}` });
  const chapters = (step1 && Array.isArray(step1.chapters) ? step1.chapters : [])
    .map((c) => String(c).trim())
    .filter((c) => kg.chapters.includes(c));
  if (!chapters.length) {
    return { ok: false, error: '步①未识别出有效章', chapters: [], pointList: [], other: [], outOfSyllabus: false, issues: ['步①未识别出有效章'] };
  }

  // 步② 代码：逐单元取候选（确定性检索）
  const cands = chapters.map((ch) => ({ ch, list: kg.getPointsByChapter(ch) })).filter((c) => c.list.length > 0);

  // 步③ 模型：逐单元勾选（一次只呈现当前单元）
  const picks = [];
  for (const { ch, list } of cands) {
    const { numbered, sys } = buildStep3System(list);
    const step3 = await llm({ system: sys, user: `题目：${questionText}\n\n【当前单元：${ch}】\n${numbered}` });
    picks.push({ ch, numbered, step3: step3 || {} });
  }

  // 代码：还原名字 + 校验
  const resolved = resolvePicks(picks);
  return {
    ok: resolved.issues.length === 0 && resolved.otherOk,
    chapters,
    pointList: resolved.got.filter((g) => !g.isOther),
    other: resolved.got.filter((g) => g.isOther).map((o) => ({ name: o.name, chapter: o.chapter })),
    outOfSyllabus: resolved.outOfSyllabus,
    issues: resolved.issues,
  };
}

module.exports = { decomposePointsNode, buildStep1System, buildStep3System, resolvePicks };
