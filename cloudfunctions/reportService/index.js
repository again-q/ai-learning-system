const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const SYSTEM_V3 = require('./systemV3');
const { assemble } = require('./assemble');
const { runWithTools } = require('./toolLoop');

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
  const newModule = extractJson(data.choices[0].message.content || '');

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

    // ⑤ 解析 JSON 报告
    const report = extractJson(content);

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
