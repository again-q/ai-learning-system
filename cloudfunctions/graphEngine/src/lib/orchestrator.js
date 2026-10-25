'use strict';
const { ANSWER_PATH_SYS } = require('./prompts');
// ============ 过程编排 Agent（2026-10-17 用户拍板，脚本原型已验证）============
//
// 解决的问题（实测依据见 doc/standards/开发经验.md §6.29）：
//   旧链路把「读学生过程 + 判对错 + 找错因」塞进一次调用（N2 judgeAI），
//   模型在任务一多时会跳过计算、凭形式判断 —— 实测把「(y-x)/xy + (x-y)/xy」
//   算成 2(y-x)/xy，并据此给出错误结论。
//
// 本模块把这件事拆成三步（用户原话：「要单独有一个Agent去编排这些」）：
//   ① 拆解：把学生过程切成【最小可核查单元】，每个单元带 basis（依据）
//   ② 逐单元核查：每个单元一个**独立子对话**，只问一个封闭问题
//   ③ 代码汇总：只认「含运算 且 与学生的声称不一致」为确定性错误
//
// ============ 三条红线（都是实测踩坑换来的）============
//   1) **不注入「前一步已断裂」**：首版把断点写进后续单元的上下文，
//      结果模型停止计算自己的运算，computed 恒为空，6 个单元全判错、
//      真错误被淹没（级联假阳性）。
//   2) **拆解必须保留 basis + defs**：不告诉核查者「由(I)」指什么，
//      模型会自己猜运算方式（该加却减）。
//   3) **判断权在代码**：是否算「找到错误」由本文件的 compare 决定，不由模型。
//
// 选填题不走逐单元核查（没有过程），走「选项分析」——见 analyzeChoice。

/** 从模型输出里抠 JSON（容忍前后废话） */
function extractJson(s) {
  const m = /\{[\s\S]*\}/.exec(String(s || ''));
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch (e) { return null; }
}

/** 字面归一化：用于「模型算出的结果」与「学生声称的结果」比对 */
function norm(s) {
  return String(s == null ? '' : s)
    .replace(/\\[a-zA-Z]+/g, '')   // 去 LaTeX 命令（\frac 等）
    .replace(/[\s${}]/g, '')
    .replace(/[−–—]/g, '-')
    .replace(/[·×]/g, '*')
    .toLowerCase();
}

// ---------- ① 拆解 ----------
const DECOMPOSE_SYS = `把学生的解题过程拆成【最小可核查单元】。

规则：
- 一个单元 = 一个可单独判断"成立/不成立"的最小动作，不要合并多个动作。
- 保持学生的原始书写顺序，不要改写他的内容。
- 每个单元必须单独抽出 basis 字段：这一步"由"什么得到？
  （原样引用，如「条件③」「(I)」「(1)」；没有显式依据写「无」）
- 若过程中出现编号定义（如 (I) 表示加法封闭性），写进 defs。

只输出 JSON：
{"defs":[{"label":"(I)","means":"..."}],"units":[{"i":1,"raw":"原文片段","basis":"依据"}]}`;

async function decompose({ call, questionText, work, logger }) {
  const out = await call({
    system: DECOMPOSE_SYS,
    user: '【题目】\n' + String(questionText || '') + '\n\n【学生过程】\n' + String(work || '') + '\n\n输出 JSON。',
    maxTokens: 3000,
  });
  const j = extractJson(out.text);
  if (!j || !Array.isArray(j.units)) {
    logger && logger.warn && logger.warn('[orchestrator] 拆解失败，返回空单元');
    return { defs: [], units: [] };
  }
  const units = j.units
    .map((u, k) => ({ i: Number(u && u.i) || k + 1, raw: String((u && u.raw) || '').trim(), basis: String((u && u.basis) || '无').trim() }))
    .filter((u) => u.raw);
  return { defs: Array.isArray(j.defs) ? j.defs : [], units };
}

// ---------- ② 逐单元核查 ----------
const CHECK_SYS = `你在核查一份数学证明里的**一个**步骤。只针对这一步，不要评论其他步骤。

1. 先看 basis（本步依据）。**严格按依据的字面含义决定怎么算**：
   - 加法封闭性 / 由(I) / x+y∈M  → 这是**相加**
   - 减法封闭性 / 由条件② / x-y∈M → 这是**相减**
   **绝对不要自己挑选运算方式**；依据写的是哪个就用哪个。
2. 若本步含运算（代入、合并、化简、求值），**必须亲自把它算一遍**，
   把结果的完整表达式写进 computed。不要因为前面步骤可能有问题就不算——**照算**。
3. 判断：学生写的结论，与你自己算出的结果**一致吗**？

只输出 JSON：
{"hasComputation":true|false,
 "computed":"你算出的结果（含运算时必填）",
 "studentClaim":"这一步学生声称得到的结果",
 "consistent":true|false|null,
 "reason":"一句话"}`;

async function checkUnit({ call, questionText, prior, unit, defs, logger }) {
  const priorTxt = prior.length ? prior.map((u) => u.i + '. ' + u.raw).join('\n') : '（无）';
  const defsTxt = (defs || []).length ? defs.map((d) => (d && d.label) + ' = ' + (d && d.means)).join('\n') : '（无）';
  try {
    const out = await call({
      system: CHECK_SYS,
      user: '【题目条件】\n' + String(questionText || '')
        + '\n\n【编号含义】\n' + defsTxt
        + '\n\n【前面写过的步骤（背景，不保证成立）】\n' + priorTxt
        + '\n\n【待核查的这一步】\n' + unit.raw
        + '\n这一步的依据是：' + (unit.basis || '无')
        + '\n\n输出 JSON。',
      maxTokens: 1500,
    });
    return extractJson(out.text) || {};
  } catch (e) {
    logger && logger.warn && logger.warn('[orchestrator] 单元' + unit.i + '核查失败: ' + e.message);
    return {};
  }
}

// ---------- ③ 代码汇总（判断权在这里）----------
// 只把「含运算 且 consistent===false」计为确定性错误。
// 非运算步骤（引用条件/假设/结论）不做对错判定 —— 避免模型对语义步骤瞎判。
function compare(unit, chk) {
  if (!chk || chk.hasComputation === false) return { status: 'no-computation' };
  if (chk.consistent === false) {
    return {
      status: 'broken',
      unit: unit.i,
      claim: String(chk.studentClaim || '').slice(0, 300),
      correct: String(chk.computed || '').slice(0, 300),
      reason: String(chk.reason || '').slice(0, 300),
      mismatch: norm(chk.computed) !== norm(chk.studentClaim),
    };
  }
  if (chk.consistent === true) return { status: 'ok', unit: unit.i };
  return { status: 'unknown', unit: unit.i };
}

/** 单字段截断（落库用：students 原话保留前 300 字，够展示也控体积） */
function cut(s, n) {
  const t = String(s == null ? '' : s);
  return t.length > n ? t.slice(0, n) : t;
}

/**
 * 把逐单元核查结果整理成给前端用的「你的过程」步骤表（2026-10-25，DES-20261025-001 §1.1）。
 * 只做映射与收敛，不做任何新的判断（判断权仍在 compare）。
 * @param {Array} results reviewProcess 的 results（含 settled）
 * @returns {Array<{i,raw,status,claim,correct,reason,unstable}>}
 */
function buildSteps(results) {
  return (Array.isArray(results) ? results : []).map((r, k) => {
    const u = r.unit || {};
    const first = r.cmp || {};
    const st = (r.settled && r.settled.status) || first.status || 'unknown';
    const broken = st === 'broken';
    return {
      i: Number(u.i) || (k + 1),
      raw: cut(u.raw, 300),
      status: st,
      // 只有定案为 broken 的两处结果才展示 —— unknown 不下结论，不给学生一个会翻案的「你错在哪」
      claim: broken ? cut(first.claim, 200) : null,
      correct: broken ? cut(first.correct, 200) : null,
      reason: broken ? cut(first.reason, 200) : (r.settled && r.settled.note ? cut(r.settled.note, 200) : null),
      unstable: r.unstable === true,
    };
  // 空原文的单元不给前端（没有可展示的「你的原话」），也防 i 缺失时错位
  }).filter((s) => s.raw && s.i > 0);
}

/**
 * 两判收敛（2026-10-25）：只有两遍都判 broken 才定案。
 *   · 首判 broken + 重核 broken → broken（定案）
 *   · 首判 broken + 重核非 broken → unknown（两次打架，**不下结论**，宁可少说也不冤枉）
 *   · 首判 broken + 未复核 → broken（成本保护下没复核，采信首判）
 *   · 首判非 broken → 原样
 * @param {{cmp?:object, recheck?:object}} r
 * @returns {{status:string, note?:string}}
 */
function settleStep(r) {
  const first = (r && r.cmp) || {};
  if (first.status !== 'broken') return { status: first.status || 'unknown' };
  const second = (r && r.recheck) || null;
  if (!second) return { status: 'broken' };
  if (second.status === 'broken') return { status: 'broken' };
  return { status: 'unknown', note: '两次判断不一致' };
}

/**
 * 解答题：逐步核查学生过程。
 *
 * ============ 稳定性与进档 3（2026-10-17 用户拍板）============
 * 实测发现：同一输入跑两次，findings 不一致（一次找到「相加=0」，一次只找到符号错）。
 * 用户定：「编排不稳定不是进3吗」——即 **不稳定本身就是升级信号**。
 *
 * 做法：
 *   · 对「含运算」的单元做**复核**（第 2 次独立核查，同一 problem 再问一遍）
 *   · 两次结论一致 → 采信；不一致 → 标 unstable，并触发升级
 *   · 升级判据（任一满足）：
 *       ① 存在 unstable 单元（模型自己前后不一）
 *       ② findings ≥ 2（错得较多，值得 AI 自己做一遍）
 *   · 升级只**标记**（needsTier3），真正跑 AI 自己做在重量档脚本里（异步，不阻塞当下）
 *
 * @returns {{tier, kind, units, results, findings, unstable, needsTier3, ...}}
 */
async function reviewProcess({ call, questionText, work, logger, maxUnits }) {
  const t0 = Date.now();
  let calls = 1;
  const dec = await decompose({ call, questionText, work, logger });
  // 成本安全阀：单元过多时截断（超长过程本身已超出「最小可核查」的意图）
  const units = typeof maxUnits === 'number' && maxUnits > 0 ? dec.units.slice(0, maxUnits) : dec.units;
  const prior = [];
  const results = [];
  // 第一遍：全部单元各核查一次
  for (const u of units) {
    const chk = await checkUnit({ call, questionText, prior, unit: u, defs: dec.defs, logger });
    calls++;
    results.push({ unit: u, chk, cmp: compare(u, chk), unstable: false });
    // 红线 1：只累积【原文】作背景，绝不注入「前面已断」
    prior.push(u);
  }
  // 第二遍（**按需**，2026-10-17 成本优化）：只复核被判为 broken 的单元。
  //   理由：ok 的单元复核不改变结论（且实测 ok 极少翻转），broken 才值得确认。
  //   这一个复核正是「不稳定 = 能力不足 = 进档3」的判据来源，不能省。
  for (let k = 0; k < results.length; k++) {
    const r = results[k];
    if (r.cmp.status !== 'broken') continue;
    const priorU = units.slice(0, k);
    const chk2 = await checkUnit({ call, questionText, prior: priorU, unit: r.unit, defs: dec.defs, logger });
    calls++;
    const cmp2 = compare(r.unit, chk2);
    if (cmp2.status !== r.cmp.status) r.unstable = true;
    r.recheck = cmp2;
  }
  // 2026-10-25（DES-20261025-001 §1.1）：把重核结论**收敛成每单元一个最终状态**，供下游落库展示。
  //   原实现只把 cmp2 用来算 unstable 就扔掉 →「第二次核出来这步没问题」这条信息没人看得到。
  //   红线：不改 compare/checkUnit/复核触发条件（决策 061 红线 3），只是把已有结果带出来 + 收敛。
  results.forEach((r) => { r.settled = settleStep(r); });
  const findings = results.filter((r) => r.cmp.status === 'broken').map((r) => r.cmp);
  const unstable = results.filter((r) => r.unstable).map((r) => r.unit.i);
  const needsTier3 = unstable.length > 0 || findings.length >= 2;
  return {
    tier: needsTier3 ? 'standard+escalate' : 'standard',
    kind: 'process',
    units,
    results,
    steps: buildSteps(results),
    findings,
    unstable,
    needsTier3,
    escalateReason: needsTier3
      ? (unstable.length ? `核查结果前后不一致（单元 ${unstable.join('、')}）` : `发现 ${findings.length} 处错误，值得深度复核`)
      : null,
    summary: findings.length
      ? `${findings.length} 处运算与声称不一致：` + findings.map((f) => `第${f.unit}步应为「${f.correct}」`).join('；')
      : '未发现运算层面的不一致',
    elapsedMs: Date.now() - t0,
    calls,
  };
}

// ---------- 选填题：选项分析 ----------
// ⚠️ 边界（2026-10-17 实测踩到）：智学网对很多题不给标准答案（answerHtml 常是「略」），
//    此时不能让它分析"为什么 454 这个数字错"——那是学生填的值，不是选项。
//    有 options 且答案未知时，让它先自行算正确答案，再分析学生选的那个选项。
const CHOICE_SYS = `学生在做一道选择题/填空题，只选了答案，没有写过程。
你的任务不是审过程，而是**分析这道题**。

⚠️ 硬性要求：**必须先把计算/推理过程写出来，再给结论**。
   · 计数题要写出计数对象和算式；结论不要凭空抛出。
   · 若【正确答案】已给出，先核对它，再分析学生答案。

⚠️ 禁止在提示词层面举任何具体数学例子或给参考数值 —— 实测证明会影响推理
   （2026-10-17：曾在此处写"如 有序对 243+243-32=454 → 211"，模型被数字带偏，
    同一道题连算三轮都是 243；删掉例子后 3 轮全部正确得出 211）。
   要求归要求，不要举例子。

输出：
1. 正确答案是什么（写出推导/算式，不要只给结论）。
2. 学生的答案**为什么不对**——针对这个答案本身做客观分析，不猜学生心理。
3. 给出这个答案的人，通常缺漏在哪（按题型做合理推断；禁止"你粗心""你没认真"这类话）。

只输出 JSON：
{"derivation":"推导/算式过程（必须写）",
 "correctAnswer":"你的结论",
 "wrongOption":"学生给出的答案",
 "whyWrong":"为什么不对",
 "likelyGap":"通常缺漏什么"}`;

async function analyzeChoice({ call, questionText, studentAnswer, correctAnswer, officialStatus, rerun, logger }) {
  const t0 = Date.now();
  const ans = String(correctAnswer == null ? '' : correctAnswer).trim();
  const ansKnown = ans && ans !== '略' && ans !== '（未知）';

  async function once() {
    const out = await call({
      system: CHOICE_SYS,
      user: '【题目】\n' + String(questionText || '')
        + '\n\n【学生给出的答案】' + String(studentAnswer || '（未记录）')
        + '\n【正确答案】' + (ansKnown ? ans : '（官方未提供，请你自己算）')
        + (officialStatus ? '\n【官方判定】' + officialStatus : '')
        + '\n\n输出 JSON。',
      maxTokens: 1500,
    });
    return extractJson(out.text) || {};
  }

  try {
    const j = await once();
    let calls = 1;
    let unstable = false;
    let j2 = null;

    // ===== 稳定性检查（2026-10-17 用户定：不稳定=能力不足=进档3）=====
    // 仅当【官方没给答案、需要 AI 自己算】时才跑第二次 —— 有官方答案时直接用它，
    // 不必花钱复核（选择题的正确答案就在选项里）。
    if (!ansKnown && rerun !== false) {
      try {
        j2 = await once();
        calls++;
        const a1 = norm(j.correctAnswer);
        const a2 = norm(j2.correctAnswer);
        if (a1 && a2 && a1 !== a2) unstable = true;
      } catch (e) {
        logger && logger.warn && logger.warn('[orchestrator] 选填题复核失败: ' + e.message);
      }
    }

    const needsTier3 = unstable;
    return {
      tier: needsTier3 ? 'standard+escalate' : 'standard',
      kind: 'choice',
      findings: [],
      unstable: unstable ? ['answer'] : [],
      needsTier3,
      escalateReason: needsTier3
        ? `AI 自己算的答案两次不一致（${String(j.correctAnswer || '')} vs ${String((j2 && j2.correctAnswer) || '')}），说明此题超出其能力`
        : null,
      choiceAnalysis: {
        derivation: String(j.derivation || '').slice(0, 800),
        correctAnswer: String(j.correctAnswer || '').slice(0, 100),
        correctHow: String(j.derivation || j.correctHow || '').slice(0, 600),
        wrongOption: String(j.wrongOption || studentAnswer || '').slice(0, 50),
        whyWrong: String(j.whyWrong || '').slice(0, 600),
        likelyGap: String(j.likelyGap || '').slice(0, 300),
        // 不稳定时不把它的答案当权威（用户：不稳定=能力不足）
        answerTrusted: !unstable && !!String(j.correctAnswer || '').trim(),
        secondAnswer: unstable ? String((j2 && j2.correctAnswer) || '').slice(0, 100) : null,
      },
      summary: String(j.whyWrong || '').slice(0, 300),
      elapsedMs: Date.now() - t0,
      calls,
    };
  } catch (e) {
    logger && logger.warn && logger.warn('[orchestrator] 选项分析失败: ' + e.message);
    return { tier: 'standard', kind: 'choice', findings: [], summary: '选项分析失败', elapsedMs: Date.now() - t0, calls: 1 };
  }
}

// ---------- ④ AI 的做法 + 更优判定（2026-10-25，DES-20261025-001 §1.2） ----------
// 目的：做对的题也要有「AI 自己做一遍」；AI 真更省时才提示。
// 红线（ADR-5）：更优与否由**代码**守，不靠模型自律 —— 否则满分题会被说「其实可以更省」。
const STEP_MIN = 2;
const STEP_MAX = 10;

/**
 * 解析 + 守卫 AI 做法。模型输出不可信的部分一律降级。
 * @param {string} text  模型原始输出
 * @param {number} workStepCount 学生过程段数（0 = 无可比较步骤 → 一律不给更优）
 * @returns {null|{steps:Array, moreEfficient:boolean, betterAt:number|null, whyBetter:string|null}}
 */
function parseAnswerPath(text, workStepCount) {
  const j = extractJson(text);
  if (!j) return null;
  const steps = (Array.isArray(j.steps) ? j.steps : [])
    .map((x) => ({
      step: String((x && x.step) || '').slice(0, 80),
      content: String((x && x.content) || '').slice(0, 800),
      note: String((x && x.note) || '').slice(0, 300),
    }))
    .filter((x) => x.step && x.content);
  if (steps.length < STEP_MIN || steps.length > STEP_MAX) return null;

  let moreEfficient = j.moreEfficient === true;
  let betterAt = Number.isInteger(j.betterAt) ? j.betterAt : null;
  const whyBetter = String(j.whyBetter || '').trim().slice(0, 60) || null;

  // 守卫①：理由必须落在「步数/步骤、分类、计算」之一，否则不认
  if (!whyBetter || !/步骤|步数|分类|计算/.test(whyBetter)) moreEfficient = false;
  // 守卫②：比较对象必须真实存在 —— 学生没有可比的步骤时，不许说更优
  if (!betterAt || betterAt < 1 || !(workStepCount > 0) || betterAt > workStepCount) moreEfficient = false;
  // 守卫③：不许靠引入新方法取胜
  if (/新方法|新定理|换个思路|通法|套路/.test(whyBetter)) moreEfficient = false;

  if (!moreEfficient) return { steps, moreEfficient: false, betterAt: null, whyBetter: null };
  return { steps, moreEfficient: true, betterAt, whyBetter };
}

/**
 * AI 自己做一遍这道题（对/错都跑）。失败返回 null，调用方不得阻塞判定。
 * @returns {Promise<null|object>}
 */
async function answerPath({ call, questionText, work, correctAnswer, studentStatus, workStepCount, logger }) {
  const t0 = Date.now();
  const user = [
    '【题干】',
    String(questionText || ''),
    '',
    '【学生写的过程】' + (String(work || '').trim() ? '' : '（没有读到过程）'),
    String(work || '').slice(0, 2500),
    '',
    '【已知正确答案】' + (String(correctAnswer || '').trim() || '（未知）'),
    '【学生答案正确与否】' + (String(studentStatus || '').trim() || '未知'),
    '',
    '输出 JSON。',
  ].join('\n');
  try {
    const out = await call({ system: ANSWER_PATH_SYS, user, maxTokens: 3000 });
    const parsed = parseAnswerPath(out && out.text, Number(workStepCount) || 0);
    if (!parsed) return null;
    return { ...parsed, elapsedMs: Date.now() - t0, calls: 1 };
  } catch (e) {
    logger && logger.warn && logger.warn('[orchestrator] AI 做法生成失败: ' + (e && e.message));
    return null;
  }
}

/**
 * 统一入口：按题型分流（用户 2026-10-17 拍板「全部走档2」）。
 *   解答题 → 逐步核查
 *   选填题 → 选项分析
 * @returns 找不到可分析材料时返回 null（调用方回退原判定）
 */
async function analyze({ call, question, logger }) {
  const q = question || {};
  const type = String(q.questionType || '');
  const work = String(q.traceReport || '').trim();
  const hasSegments = Array.isArray(q.segments) && q.segments.length > 0;

  // 解答题且有过程 → 逐步核查
  if (type === '解答' && (work || hasSegments)) {
    const text = work || (q.segments || []).map((s) => s.evidence || s.step || '').filter(Boolean).join('\n');
    if (text.trim()) return await reviewProcess({ call, questionText: q.questionText, work: text, logger });
  }
  // 选填题 → 选项分析
  if (type === '选择' || type === '填空') {
    return await analyzeChoice({
      call, questionText: q.questionText,
      studentAnswer: q.studentAnswer, correctAnswer: q.correctAnswer,
      officialStatus: q.officialStatus, logger,
    });
  }
  // 其他/未知题型：有过程就审，否则不分析
  if (work) return await reviewProcess({ call, questionText: q.questionText, work, logger });
  return null;
}

module.exports = { analyze, reviewProcess, analyzeChoice, answerPath, parseAnswerPath, decompose, checkUnit, compare, settleStep, buildSteps, norm, extractJson };
