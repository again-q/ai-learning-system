const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// ============ 配置 ============
const QWEN_API_KEY = process.env.QWEN_API_KEY;
const QWEN_BASE_URL = process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-v4';
const SEARCH_SCAN_LIMIT = 500; // 单用户检索扫描上限（数据量小，全量扫描够用）

const success = (data = null) => ({ code: 0, data, message: 'ok' });
const fail = (code, msg) => ({ code, data: null, message: msg });

// ============ embedding ============
async function embedText(text) {
  const resp = await fetch(`${QWEN_BASE_URL}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${QWEN_API_KEY}` },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });
  if (!resp.ok) throw new Error('embed HTTP ' + resp.status);
  const data = await resp.json();
  return data.data[0].embedding;
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

// ============ 公共工具 ============
const dayCut = (days) => new Date(Date.now() - (days || 30) * 86400000);

const dateOf = (d) => {
  if (!d) return null;
  const t = new Date(d);
  return isNaN(t.getTime()) ? null : t.toISOString().slice(0, 10);
};

// 统一读取该用户时间窗内的 mastery_logs（升序）
async function fetchLogs(userId, days) {
  const res = await db.collection('mastery_logs')
    .where({ userId, createdAt: _.gte(dayCut(days)) })
    .orderBy('createdAt', 'asc').limit(SEARCH_SCAN_LIMIT).get();
  return res.data || [];
}

// 兼容两种记录格式的 isCorrect 读取（顶层字段 / report 对象内）
function logIsCorrect(l) {
  if (l.isCorrect != null) return l.isCorrect;
  return l.report && l.report.isCorrect != null ? l.report.isCorrect : null;
}

// ============ 工具 ① vectorSearch — 历史同类题诊断报告检索（题型主键，D-19） ============
// 检索逻辑：query = AI 生成的题型描述 → 与记录 patternEmbedding 近邻（阈值 0.70 切出同类题型）
//   → 同题型内按整题 embedding 排序；无 pattern 的旧记录回退按整题 embedding 排序（冷启动兼容）
async function vectorSearch(args) {
  const userId = args.userId;
  const query = (args.query || '').trim();
  if (!query) return fail(400, '缺少 query（AI 生成的题型描述）');
  const topK = Math.min(10, Math.max(1, Number(args.topK) || 5));
  const days = Number(args.days) || 30;

  const queryEmbedding = await embedText(query);
  const logs = await fetchLogs(userId, days);
  const scored = logs
    .filter((l) => Array.isArray(l.embedding) && l.embedding.length > 0)
    .map((l) => {
      const patternScore = Array.isArray(l.patternEmbedding) && l.patternEmbedding.length > 0
        ? cosine(queryEmbedding, l.patternEmbedding) : null;
      return {
        score: cosine(queryEmbedding, l.embedding),
        patternScore,
        pattern: l.pattern || null,
        log: l,
      };
    });
  // 分组：命中题型（patternScore >= 0.70）优先；其余（旧记录/未命中题型）次之——组内都按整题 score 排
  const inPattern = scored.filter((x) => x.patternScore != null && x.patternScore >= 0.70)
    .sort((a, b) => b.score - a.score);
  const others = scored.filter((x) => !(x.patternScore != null && x.patternScore >= 0.70))
    .sort((a, b) => b.score - a.score);
  const hits = [...inPattern, ...others].slice(0, topK).map(({ score, patternScore, pattern, log }) => ({
    score: Math.round(score * 10000) / 10000,
    patternScore: patternScore != null ? Math.round(patternScore * 10000) / 10000 : null,
    pattern: pattern || null,
    questionText: (log.report && log.report.questionText) || (log.reportText || '').slice(0, 200),
    isCorrect: logIsCorrect(log),
    knowledgeNodeId: log.knowledgeNodeId || null,
    knowledgeNodeName: log.knowledgeNodeName || (log.report ? log.report.knowledgeNodeName : null) || null,
    errorAttribution: log.errorAttribution || (log.report ? log.report.errorAttribution : null) || null,
    errorDimension: log.errorDimension || (log.report ? log.report.errorDimension : null) || null,
    segments: log.segments || (log.report ? log.report.segments : null) || [],
    breakpoint: log.breakpoint || (log.report ? log.report.breakpoint : null) || null,
    knowledgeUsage: log.knowledgeUsage || (log.report ? log.report.knowledgeUsage : null) || [],
    processAvailable: log.processAvailable != null ? log.processAvailable : (log.report ? log.report.processAvailable : null) || false,
    createdAt: log.createdAt || null,
  }));

  return success({ hits });
}

// ============ 工具 ② getErrorPattern — 错误模式聚合（按知识点） ============
async function getErrorPattern(args) {
  const userId = args.userId;
  const days = Number(args.days) || 30;

  // 内存过滤 isCorrect=false：兼容顶层字段与 report 对象内两种格式
  const logs = (await fetchLogs(userId, days)).filter((l) => logIsCorrect(l) === false);
  const groups = new Map();
  for (const l of logs) {
    const key = l.knowledgeNodeId || '__unknown__';
    if (!groups.has(key)) {
      groups.set(key, {
        knowledgeNodeId: l.knowledgeNodeId || null,
        knowledgeNodeName: l.knowledgeNodeName || null,
        count: 0,
        lastTs: 0,
        lastErrorAttribution: null,
        sampleQuestion: null,
        timeline: [],
      });
    }
    const g = groups.get(key);
    g.count++;
    const ts = new Date(l.createdAt || 0).getTime();
    if (ts > g.lastTs) {
      g.lastTs = ts;
      g.lastErrorAttribution = l.errorAttribution || (l.report ? l.report.errorAttribution : null) || null;
      g.sampleQuestion = (l.report && l.report.questionText) || (l.reportText || '').slice(0, 120) || null;
    }
    const d = dateOf(l.createdAt);
    if (d) g.timeline.push(d);
  }

  const patterns = [...groups.values()]
    .sort((a, b) => b.count - a.count)
    .map((g) => ({
      knowledgeNodeId: g.knowledgeNodeId,
      knowledgeNodeName: g.knowledgeNodeName,
      count: g.count,
      recentDays: g.lastTs ? Math.max(0, Math.round((Date.now() - g.lastTs) / 86400000)) : null,
      lastErrorAttribution: g.lastErrorAttribution,
      sampleQuestion: g.sampleQuestion,
      timeline: g.timeline,
    }));

  return success({ totalWrong: logs.length, patterns });
}

// ============ 工具 ③ getTrend — 历史趋势 ============
async function getTrend(args) {
  const userId = args.userId;
  const days = Number(args.days) || 30;

  const where = { userId, createdAt: _.gte(dayCut(days)) };
  if (args.knowledgeNodeId) where.knowledgeNodeId = args.knowledgeNodeId;
  const res = await db.collection('mastery_logs')
    .where(where).orderBy('createdAt', 'asc').limit(SEARCH_SCAN_LIMIT).get();
  const logs = res.data || [];

  const points = logs.map((l) => ({
    date: dateOf(l.createdAt),
    mastery: l.newMastery != null ? l.newMastery : null,
    isCorrect: logIsCorrect(l),
  }));

  // 趋势方向：正确率 前后半对比（有 isCorrect 的记录）；无则用 mastery 对比
  const judged = points.filter((p) => p.isCorrect != null);
  const half = Math.floor(judged.length / 2);
  let trend = 'none';
  let lastRate = null, prevRate = null;
  if (judged.length >= 2) {
    const first = judged.slice(0, half);
    const second = judged.slice(half);
    const rate = (arr) => arr.filter((p) => p.isCorrect).length / arr.length;
    prevRate = Math.round(rate(first) * 100) / 100;
    lastRate = Math.round(rate(second) * 100) / 100;
    if (lastRate - prevRate > 0.1) trend = 'up';
    else if (prevRate - lastRate > 0.1) trend = 'down';
    else trend = 'flat';
  } else if (judged.length === 1) {
    lastRate = judged[0].isCorrect ? 1 : 0;
    trend = 'none';
  }

  return success({ trend, lastRate, prevRate, total: logs.length, points });
}

// ============ 工具 ④ getNodeHistory — 知识点历史状态 ============
async function getNodeHistory(args) {
  const userId = args.userId;
  const nodeId = (args.knowledgeNodeId || '').trim();
  if (!nodeId) return fail(400, '缺少 knowledgeNodeId');
  const days = Number(args.days) || 90;

  let node = null;
  try {
    const pRes = await db.collection('knowledge_progress')
      .where({ userId, knowledgeNodeId: nodeId }).limit(1).get();
    if (pRes.data.length) {
      const p = pRes.data[0];
      node = {
        knowledgeNodeId: nodeId,
        knowledgeNodeName: p.knowledgeNodeName || null,
        mastery: p.mastery != null ? p.mastery : null,
        attempts: p.attempts || 0,
        correctCount: p.correctCount || 0,
        lastUpdated: p.lastUpdated || null,
      };
    }
  } catch (e) {
    console.warn('[ragService] knowledge_progress 读取失败:', e.message);
  }

  const logs = await fetchLogs(userId, days, { knowledgeNodeId: nodeId });
  const history = logs
    .filter((l) => l.newMastery != null)
    .map((l) => ({
      date: dateOf(l.createdAt),
      oldMastery: l.oldMastery != null ? l.oldMastery : null,
      newMastery: l.newMastery,
    }));

  return success({ node, logs: history });
}

// ============ DeepSeek Function Calling schema ============
const TOOLS_SCHEMA = [
  {
    type: 'function',
    function: {
      name: 'vectorSearch',
      description: '语义检索该用户近30天历史同类题诊断报告（按题型匹配）。用于报告「历史记录参考」。query 必须是 AI 生成的题型描述（如：含参不等式恒成立求参数范围），可附当前题目文本。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'AI 生成的题型描述（同类题共用），可附当前题目文本' },
          topK: { type: 'integer', description: '返回条数，默认5，上限10' },
          days: { type: 'integer', description: '时间窗口天数，默认30' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getErrorPattern',
      description: '获取该用户近30天错误模式聚合（按知识点统计错题次数、最近出现时间）。用于报告总览的模式列表。',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'integer', description: '时间窗口天数，默认30' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getTrend',
      description: '获取该用户历史正确率/掌握度趋势方向。用于报告总览的趋势判断。',
      parameters: {
        type: 'object',
        properties: {
          knowledgeNodeId: { type: 'string', description: '可选，指定知识点；不传则全局' },
          days: { type: 'integer', description: '时间窗口天数，默认30' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getNodeHistory',
      description: '获取指定知识点的当前掌握度与历史变化记录。用于报告根因模块。',
      parameters: {
        type: 'object',
        properties: {
          knowledgeNodeId: { type: 'string', description: '知识点ID，必填' },
          days: { type: 'integer', description: '时间窗口天数，默认90' },
        },
        required: ['knowledgeNodeId'],
      },
    },
  },
];

// ============ 入口 ============
exports.main = async (event) => {
  try {
    const { action } = event || {};
    if (action === 'getSchemas') return success(TOOLS_SCHEMA);

    // 身份：优先当前调用者 OPENID；云函数互调场景 OPENID 可能为空，信任调用方显式传入的 userId
    const wxContext = cloud.getWXContext();
    const userId = wxContext.OPENID || (event && event.userId) || null;
    if (!userId) return fail(401, '未登录');

    const args = Object.assign({}, event, { userId });
    let result;
    switch (action) {
      case 'vectorSearch':
        result = await vectorSearch(args);
        break;
      case 'getErrorPattern':
        result = await getErrorPattern(args);
        break;
      case 'getTrend':
        result = await getTrend(args);
        break;
      case 'getNodeHistory':
        result = await getNodeHistory(args);
        break;
      default:
        return fail(40004, '未知 action: ' + action);
    }
    return result;
  } catch (e) {
    console.error('[ragService] error:', e);
    return fail(500, 'RAG 查询失败: ' + (e.message || '未知错误'));
  }
};
