const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const SYSTEM_V3 = require('./systemV3');
const { assemble } = require('./assemble');
const { runWithTools } = require('./toolLoop');
const { sanitizeReport, sanitizeWeakpoint, isPoisonSentence } = require('./sanitize');

const DS_API_KEY = process.env.DEEPSEEK_API_KEY;
const DS_BASE_URL = process.env.DS_BASE_URL || 'https://api.deepseek.com';
const DS_MODEL = process.env.DS_MODEL || 'deepseek-v4-flash';

const success = (data = null) => ({ code: 0, data, message: 'ok' });
const fail = (code, msg) => ({ code, data: null, message: msg });

// 调试日志（写 debug_logs 集合，MCP/控制台可查——排查链路用）
async function logDebug(step, userId, batchId, info) {
  try {
    await db.collection('debug_logs').add({
      data: { step, userId, batchId, info, createdAt: db.serverDate() },
    });
  } catch (e) {
    console.warn('[reportService] debug_logs 写入失败:', e.message);
  }
  console.log(`[reportService:${step}]`, JSON.stringify(info).slice(0, 500));
}

async function postJSON(url, body, key) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error('HTTP ' + resp.status + ': ' + (await resp.text()).slice(0, 300));
  return resp.json();
}

// 格式化时间：兼容服务端 Date / ISO 字符串 / 时间戳
function formatDate(v) {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 从 Flash 输出中提取 JSON（可能带 ```json 围栏或前置说明）
function extractJson(content) {
  const c = content.trim();
  // 去 ```json ... ``` 围栏
  const fenced = c.match(/```(?:json)?\s*([\s\S]*?)```/);
  const target = fenced ? fenced[1] : c;
  const start = target.indexOf('{');
  const end = target.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('报告输出无 JSON');
  return JSON.parse(target.slice(start, end + 1));
}

// 报告模块异议：重新生成该模块 + 连带更新数据（fix 字段修正 questions 判定）
async function disputeModule(event, openid) {
  const { reportId, batchId, moduleKey, index, reason } = event;
  if (!reportId || !moduleKey || index == null) return fail(400, '缺少参数');
  if (!reason || !reason.trim()) return fail(400, '缺少异议原因');

  // 1. 读原报告（归属校验）
  const r = await db.collection('reports').doc(reportId).get().catch(() => null);
  if (!r || !r.data) return fail(404, '报告不存在');
  if (r.data.userId !== openid) return fail(403, '无权操作他人报告');
  const report = r.data.report || {};
  const wp = (report.weakpoints || [])[index];
  if (!wp || !wp[moduleKey]) return fail(404, '模块不存在');
  const oldModule = wp[moduleKey];

  // 2. 读判定输入（错题明细）
  const input = await assemble(batchId || r.data.batchId, openid);

  // 3. Flash 重生成整个薄弱点（四段式一次输出，保证断点→根因→钩子→检验依赖一致）
  const MODULE_NAMES = { breakpoint: '断点', rootcause: '根因', hook: '钩子', check: '检验' };
  const moduleName = MODULE_NAMES[moduleKey] || moduleKey;
  const system = `你是学习诊断报告修正器。用户对报告的「${moduleName}」模块提出异议。报告模块有依赖链：断点 → 根因 → 钩子 → 检验（根因基于断点、钩子基于根因）。请重新生成【整个薄弱点】的四段式（breakpoint/rootcause/hook/check/mindPoint），保证模块间一致。
规则：
- 用户异议的模块重点修正；其余模块参照原内容，只改因依赖链受影响的字段，未受影响的保持原样
- 尊重用户异议中的事实修正（如学生澄清过程/归因），但基于判定输入的证据，不盲目迎合
- 不直接给答案、不评判学生缺失、证据硬规则、预览 2-3 行
- 若异议修正了判定相关事实（断点/归因），可在对象顶层附带 fix 字段：{"questionId":"...","patch":{"errorAttribution":"...","segments":[...],"breakpoint":...}}（可选，用于连带更新 questions）
只输出 JSON（对象含 breakpoint/rootcause/hook/check，mindPoint 和 fix 可选）。`;
  const user = `【用户异议模块】${moduleName}\n【异议原因】\n${reason}\n\n【原薄弱点四段式】\n${JSON.stringify(wp, null, 1)}\n\n【相关判定输入（错题）】\n${JSON.stringify(input.wrongQuestions, null, 1)}\n\n请重新生成该薄弱点的完整四段式 JSON（受异议影响的模块重点改，其他参照原文保持）。`;

  const body = {
    model: DS_MODEL,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    max_tokens: 4000,
    temperature: 0.5,
    thinking: { type: 'enabled' },
  };
  let data;
  try {
    data = await postJSON(`${DS_BASE_URL}/chat/completions`, body, DS_API_KEY);
  } catch (e) {
    body.thinking = { type: 'disabled' };
    data = await postJSON(`${DS_BASE_URL}/chat/completions`, body, DS_API_KEY);
  }
  // 异议重生走同一清洗层，防止毒点经异议通道回流
  const newModule = sanitizeWeakpoint(extractJson(data.choices[0].message.content || ''));

  // 4. 更新 reports：整个薄弱点替换（剥离 fix——连带数据用，不存进报告）+ revisions 异议历史
  const { fix, ...newWp } = newModule || {};
  await db.collection('reports').doc(reportId).update({
    data: {
      [`weakpoints.${index}`]: newWp,
      revisions: _.push([{ moduleKey, index, reason, createdAt: db.serverDate() }]),
    },
  });

  // 5. 连带更新数据：新薄弱点带 fix → 修正 questions 判定字段（掌握度重算暂缓，数据积累后）
  if (fix && fix.questionId && fix.patch) {
    try {
      await db.collection('questions').doc(fix.questionId).update({ data: fix.patch });
      console.log('[reportService] dispute 修正 questions:', fix.questionId);
    } catch (e) {
      console.warn('[reportService] dispute fix questions 失败:', e.message);
    }
  }

  // 6. 返回更新后的报告
  const r2 = await db.collection('reports').doc(reportId).get();
  return success({ reportId, report: r2.data.report });
}

// ============ 单题历史演化：同类题以往分析 + 本次判定 → 时间演化叙述 ============
// 认知科学定位：过程级/自我调节级反馈（Hattie & Timperley）——「过去的你 vs 现在的你」同题对比。
// 硬约束：①只引用给定事实；②历史 <3 条禁止趋势话术（脚本分流保证）；③平实语气，无标语式表达。

// 把一道判定题整理成「可观察事实」条目（供 LLM 引用，也供无 LLM 兜底直接展示）
function toAttempt(q) {
  const correct = q.processScore >= 0.5;
  const nature = (q.breakpoint && q.breakpoint.nature) || null;
  const wroteSteps = (Array.isArray(q.segments) ? q.segments : []).some((s) => s && s.status && s.status !== '空白');
  const result = correct ? '做对'
    : (nature === '起步即停' || (!nature && !wroteSteps) ? '空白未作答'
    : (nature === '中途断' ? '中途断' : (nature === '收尾断' ? '收尾断' : (q.questionType === '选择' || q.questionType === '填空' ? '作答有误' : '有过程未走通'))));
  // 归因只保留可观察事实：命中毒点句式的（旧数据）不投喂
  let attribution = String(q.errorAttribution || '').trim();
  if (!attribution || isPoisonSentence(attribution)) attribution = '';
  // 学生真实写的最后一步（segments 的原文引用），空白题自然为空
  const segs = Array.isArray(q.segments) ? q.segments.filter((s) => s && s.status !== '空白' && s.evidence) : [];
  const lastStep = segs.length ? String(segs[segs.length - 1].evidence).slice(0, 60) : '';
  const d = q.createdAt ? new Date(q.createdAt.$date || q.createdAt) : null;
  const date = d && !isNaN(d.getTime()) ? (d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')) : '';
  return { date, result, attribution, lastStep };
}

// 单题历史演化（报告页每题入口）
async function questionEvolution(event, openid) {
  const { batchId, questionText, questionType, processScore } = event;
  if (!batchId || !questionText) return fail(400, '缺少参数');

  // 归属校验
  const batchRes = await db.collection('batches').doc(batchId).get().catch(() => null);
  if (!batchRes || !batchRes.data) return fail(404, '批次不存在');
  if (batchRes.data.userId !== openid) return fail(403, '无权操作他人批次');

  // 定位当前题：题干归一化匹配（AI 转写题干通常保留原文），失败退化为 题型+得分 唯一匹配
  const norm = (s) => String(s || '').replace(/[\s\\{}$]/g, '');
  const qs = await db.collection('questions')
    .where({ batchId, userId: openid, reviewed: true }).limit(200).get();
  const scored = qs.data.filter((q) => q.processScore != null);
  const scoreNum = Number(processScore);
  let current = scored.find((q) => norm(q.questionText) === norm(questionText))
    || scored.find((q) => norm(q.questionText).includes(norm(questionText).slice(0, 24)) || norm(questionText).includes(norm(q.questionText).slice(0, 24)))
    || (scored.filter((q) => q.questionType === questionType && Math.abs(q.processScore - scoreNum) < 0.01).length === 1
      ? scored.find((q) => q.questionType === questionType && Math.abs(q.processScore - scoreNum) < 0.01) : null);
  if (!current) return fail(404, '未能定位该题的判定记录');

  // 同知识点历史（不含本题），时间升序
  const node = current.knowledgeNodeName || '';
  const past = scored
    .filter((q) => q._id !== current._id && (q.knowledgeNodeName || '') === node)
    .sort((a, b) => (a.createdAt?.$date || 0) - (b.createdAt?.$date || 0))
    .map(toAttempt);

  const currentInfo = toAttempt(current);
  const currentBrief = {
    questionText: String(current.questionText || '').slice(0, 120),
    questionType: current.questionType || '',
    result: currentInfo.result,
    attribution: currentInfo.attribution,
    lastStep: currentInfo.lastStep,
  };

  // 首次出现：无历史可比，不调 LLM
  if (past.length === 0) {
    return success({
      mode: 'first',
      current: currentBrief,
      message: '这类知识点是你第一次拍进来，还没有历史可以对比。先把这次的断点消化掉，下一次它就会出现在这里。',
    });
  }

  // 历史 >=3 条才允许趋势话术（用户规则，脚本强制）
  const allowTrend = past.length >= 3;

  const system = [
    '你是学习诊断的「时间演化分析器」。输入是同一名学生、同一知识点的历次判定事实（含本次）。',
    '规则：',
    '1. 只引用给定事实（日期/结果/归因/最后书写步骤），禁止编造任何题目内容、日期或结论；',
    allowTrend ? '2. 历史已达 3 次，可以描述规律；' : '2. 历史不足 3 次，禁止使用「一直/趋势/越来越/总是」等词，只能「上次/这次」；',
    '3. 平实、平视、具体，面向高中生；禁止标签式口号（如「空白不等于不会」），禁止评判人格；',
    '4. 断点性质是 AI 判断，引用时必须挂上当时的书写原文；',
    '5. 只输出 JSON：{"past":"以前的你…","now":"这次…","insight":"前后对比说明什么…","attention":"接下来要注意什么（具体可操作）"}，每段 1-3 句。',
  ].join('\n');

  const user = [
    '【本次（' + currentBrief.date + '）】' + JSON.stringify(currentBrief),
    '【历史记录（旧→新）】',
    JSON.stringify(past.map(({ date, result, attribution, lastStep }) => ({ date, result, attribution, lastStep })), null, 1),
    '请生成时间演化分析 JSON。',
  ].join('\n\n');

  const body = {
    model: DS_MODEL,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    max_tokens: 1500,
    temperature: 0.4,
    // 短文本综合不启用 thinking：思考会挤占窗口导致 MCP 客户端超时丢结果
    thinking: { type: 'disabled' },
  };
  const data = await postJSON(DS_BASE_URL + '/chat/completions', body, DS_API_KEY);

  let evolution;
  try {
    evolution = extractJson(data.choices[0].message.content || '');
    if (!evolution.past || !evolution.now) throw new Error('字段缺失');
  } catch (e) {
    // 兜底：LLM 失败时用真实事实直接拼（不编造）
    const lastPast = past[past.length - 1];
    evolution = {
      past: lastPast.date + ' 的同类题，你' + (lastPast.result === '做对' ? '完整做对了' : '卡在「' + lastPast.result + '」') + (lastPast.attribution ? '——' + lastPast.attribution : '') + '。',
      now: '这次' + (currentInfo.result === '做对' ? '完整做对了' : '卡在「' + currentInfo.result + '」') + (currentBrief.attribution ? '——' + currentBrief.attribution : '') + '。',
      insight: allowTrend ? '把几次放在一起看，卡点位置的移动方向说明了现在的状态。' : '两次放在一起对照，比单看一次更能说明问题。',
      attention: '下次同类题落笔前，先把这次断掉的那一步单独写出来，写出来再往下走。',
    };
    return success({ mode: 'basic', current: currentBrief, past, evolution });
  }
  return success({ mode: 'llm', current: currentBrief, past, evolution });
}

exports.main = async (event) => {
  try {
    // 健康检查（调试用）：验证模块加载 + 入口正常，秒回
    if (event && event.action === 'ping') return success({ pong: true, modules: 'ok' });

    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID || (event && event.userId) || null;
    if (!openid) return fail(401, '未登录');

    // 读该批次最新报告（前端报告页 onLoad）
    if (event && event.action === 'getByBatch') {
      const { batchId } = event;
      if (!batchId) return fail(400, '缺少 batchId');
      const res = await db.collection('reports')
        .where({ userId: openid, batchId }).orderBy('createdAt', 'desc').limit(1).get();
      if (res.data.length) return success({ reportId: res.data[0]._id, report: res.data[0].report });
      return success({ reportId: null, report: null });
    }

    // 往期所有历史报告（按时间倒序）
    if (event && event.action === 'listByUser') {
      const res = await db.collection('reports')
        .where({ userId: openid })
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get();
      const reports = (res.data || []).map((r) => {
        const report = r.report || {};
        const overview = report.overview || {};
        return {
          reportId: r._id,
          batchId: r.batchId || '',
          createdAt: formatDate(r.createdAt),
          weakpointCount: (report.weakpoints || []).length,
          summary: {
            dataAnchor: overview.dataAnchor || '',
            moodText: overview.moodText || '',
            coreHint: overview.coreHint || '',
          },
        };
      });
      return success({ reports });
    }

    // 按 reportId 读取单份历史报告
    if (event && event.action === 'getById') {
      const { reportId } = event;
      if (!reportId) return fail(400, '缺少 reportId');
      const r = await db.collection('reports').doc(reportId).get().catch(() => null);
      if (!r || !r.data) return fail(404, '报告不存在');
      if (r.data.userId !== openid) return fail(403, '无权操作他人报告');
      return success({ reportId, report: r.data.report });
    }

    // 报告模块异议：重新生成该模块 + 连带更新数据
    if (event && event.action === 'disputeModule') {
      return await disputeModule(event, openid);
    }

    // 单题历史演化：同类题以往分析 + 本次判定 → 时间演化叙述
    if (event && event.action === 'questionEvolution') {
      return await questionEvolution(event, openid);
    }

    const { batchId } = event;
    if (!batchId) return fail(400, '缺少 batchId');

    // 归属校验
    const batchRes = await db.collection('batches').doc(batchId).get().catch(() => null);
    if (!batchRes || !batchRes.data) return fail(404, '批次不存在');
    if (batchRes.data.userId !== openid) return fail(403, '无权操作他人批次');

    // ① 数据装配（确定事实，代码注入）——报告呈现所有题目情况；错题用于薄弱点分析（无错题也生成全对版）
    const input = await assemble(batchId, openid);
    await logDebug('reportService.assemble', openid, batchId, {
      total: input.stats.totalQuestions, correct: input.stats.correctCount,
      wrongCount: input.wrongCount, wrongScores: input.wrongQuestions.map((q) => q.processScore),
    });

    // ② 取 ragService 工具 schema
    const schemaRes = await cloud.callFunction({ name: 'ragService', data: { action: 'getSchemas' } });
    const tools = (schemaRes.result && schemaRes.result.data) || [];

    // ③ 构造 Prompt：system（V3 规则）+ 注入的确定数据（所有题 + 统计）
    const userMsg = `【本次答题统计】\n${JSON.stringify(input.stats, null, 1)}\n\n【所有题目情况（共 ${input.stats.totalQuestions} 道，报告中呈现每题状态；错题用于薄弱点分析）】\n${JSON.stringify(input.allQuestions, null, 1)}\n\n${input.wrongCount > 0 ? `【错题明细（${input.wrongCount} 道，薄弱点分析对象）】\n${JSON.stringify(input.wrongQuestions, null, 1)}\n\n` : '【本批无错题】报告呈现题目情况 + 肯定鼓励，薄弱点列表为空。\n\n'}请调用工具获取历史检索数据（vectorSearch 查历史同类题、getErrorPattern 查错误模式、getTrend/getNodeHistory 查趋势与节点状态），然后生成诊断报告 JSON。`;

    const messages = [
      { role: 'system', content: SYSTEM_V3 },
      { role: 'user', content: userMsg },
    ];

    // ④ Function Calling 循环
    const { content, loops } = await runWithTools(postJSON, `${DS_BASE_URL}/chat/completions`, DS_API_KEY, DS_MODEL, messages, tools, { userId: openid });
    await logDebug('reportService.generate', openid, batchId, { toolLoops: loops, contentLen: (content || '').length });

    // ⑤ 解析 JSON 报告 + 确定性清洗（交接包 2026-08-27：prompt 禁令之上的代码兜底）
    const report = sanitizeReport(extractJson(content));

    // ⑥ 持久化
    const ins = await db.collection('reports').add({
      data: {
        userId: openid,
        batchId,
        report,
        createdAt: db.serverDate(),
      },
    });
    await logDebug('reportService.saved', openid, batchId, { reportId: ins._id, weakpoints: (report.weakpoints || []).length, hasQuestions: Array.isArray(report.questions) ? report.questions.length : 0 });

    return success({ reportId: ins._id, report });
  } catch (e) {
    console.error('[reportService] error:', e);
    try {
      await logDebug('reportService.error', event && event.userId, event && event.batchId, { message: e.message });
    } catch (_) {}
    return fail(500, '报告生成失败: ' + (e.message || '未知错误'));
  }
};
