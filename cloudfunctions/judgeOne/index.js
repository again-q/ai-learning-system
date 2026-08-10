const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// ============ 配置 ============
const QWEN_API_KEY = process.env.QWEN_API_KEY;
const DS_API_KEY = process.env.DEEPSEEK_API_KEY;
const QWEN_BASE_URL = process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const DS_BASE_URL = process.env.DS_BASE_URL || 'https://api.deepseek.com';
const DS_MODEL = process.env.DS_MODEL || 'deepseek-reasoner'; // max 思考档（技术选型定）
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-v4';
const TOP_K = 5;
const HISTORY_LIMIT = 200;

const success = (data = null) => ({ code: 0, data, message: 'ok' });
const fail = (code, msg) => ({ code, data: null, message: msg });

// ============ 完整版标尺（决策 020/021 + D难度标尺-L11分层.md） ============
const RUBRIC = `
【诊断判定标准（决策 020/021 + D 难度标尺完整版 L1~L11）】
■ D 难度：第1步边界判定速查卡判 Lx 档；第2步档内自由打 D 值；代码钳制回区间。
| 判定依据 | 层级 | D 区间 |
| 读题即写答案，0步推导 | L1 | 0.01–0.15 |
| 套1个公式，1-2步计算 | L2 | 0.15–0.30 |
| 套1-2个公式，2-3步推导，无变形 | L3 | 0.30–0.45 |
| 3-5步标准流程，单一板块内串联 | L4 | 0.45–0.60 |
| 5-10步流程，轻度分类讨论（2-3类） | L5 | 0.60–0.70 |
| 10步以上，复杂分类讨论（3-5类） | L6 | 0.70–0.79 |
| 二级结论/高观点 | L7 | 0.79–0.85 |
| 高数背景初等化 | L8 | 0.85–0.90 |
| 多高观点叠加 | L9 | 0.90–0.94 |
| 竞赛板块 | L10 | 0.94–0.98 |
| 纯原创 | L11 | 0.98–0.999 |
■ 例子锚：L1:A∩B求值 L2:√(x-1)定义域 L3:比log大小 L4:△ABC求c(含参分类讨论也算L4) L5:裂项求和 L6:e^x-ax²两零点 L7:极点极线 L8:极值点偏移 L9:多高观点 L10:竞赛 L11:IMO
■ 5维锁定：L1(1,1,1,1,1) L2(1-2,1,1,2,1) L3(2,1,1,2,2) L4(2,2,1,3,2) L5(2,2,2,3,2) L6(3,3,2,3,2) L7(3,3,3,4,3) L8(4,4,3,4,3) L9(4,4,4,4,4) L10(5,5,4,5,5) L11(5,5,5,5,5)
■ 题型：回忆类=直接套公式；单元内=本单元变形推理分类讨论；跨单元=结合≥2单元
■ P（§4.4）：1.0清晰/0.5模糊/0.3思路对/0空白
■ η：只对解答题0.4~1.0；填空选择null
■ r：一律null
■ isCorrect：严格数学判定（vision的≥可能被读成>，按数学逻辑核验；答案转录可能带OCR前缀误差）
■ 归因：做错才给；做对null；不编造
`;

// ============ 钳制 ============
const LR = {
  L1: [0.01, 0.15], L2: [0.15, 0.30], L3: [0.30, 0.45],
  L4: [0.45, 0.60], L5: [0.60, 0.70], L6: [0.70, 0.79],
  L7: [0.79, 0.85], L8: [0.85, 0.90], L9: [0.90, 0.94],
  L10: [0.94, 0.98], L11: [0.98, 0.999],
};
const P_BINS = [0, 0.3, 0.5, 1.0];

function clampParams(raw, questionType) {
  const [lo, hi] = LR[raw.level] || [0.01, 0.999];
  const D = Math.min(hi, Math.max(lo, Number(raw.D) || lo));
  const isOpen = questionType === '解答';
  const eta = isOpen ? (raw.eta === undefined ? null : raw.eta) : null;
  let P = Number(raw.P);
  if (!P_BINS.includes(P)) {
    P = P_BINS.reduce((prev, curr) => (Math.abs(curr - P) < Math.abs(prev - P) ? curr : prev));
  }
  return { D, eta, P };
}

// ============ 网络 ============
async function postJSON(url, body, key) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  return resp.json();
}

// ============ RAG ============
async function embedText(text) {
  const data = await postJSON(`${QWEN_BASE_URL}/embeddings`, { model: EMBEDDING_MODEL, input: text }, QWEN_API_KEY);
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

async function searchHistory(questionText, userId) {
  try {
    const queryEmbedding = await embedText(questionText);
    const logs = await db.collection('mastery_logs')
      .where({ userId }).orderBy('createdAt', 'desc').limit(HISTORY_LIMIT).get();
    return logs.data
      .filter((log) => log.embedding && Array.isArray(log.embedding) && log.embedding.length > 0)
      .map((log) => ({
        score: cosine(queryEmbedding, log.embedding),
        reportText: log.reportText || '',
        isCorrect: log.report && log.report.isCorrect,
      }))
      .filter((h) => h.reportText)
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_K);
  } catch (e) {
    console.warn('[judgeOne] RAG search failed:', e.message);
    return [];
  }
}

function buildRagContext(hits) {
  if (!hits.length) return '';
  return hits.map((h, i) =>
    `[历史参考 ${i + 1}] 题目：${h.reportText}（当时判定：${h.isCorrect ? '对' : '错'}，相似度 ${h.score.toFixed(2)}）`
  ).join('\n');
}

function buildReportText(report) {
  return `题目：${report.questionText || ''} | 作答：${report.studentAnswer || ''} | 判定：${report.isCorrect ? '对' : '错'} | 题型：${report.questionCategory || ''} | 难度：${report.difficultyLevel || ''} | 知识点：${report.knowledgeNodeId || ''}`;
}

// ============ 单题判定 ============
async function judgeQuestion(question, ragContext) {
  const ragSection = ragContext ? `\n\n【历史参考（仅供参考不强制）】\n${ragContext}` : '';
  const userMsg = `输入是一道题的视觉转录上下文（题目文本 + 整图痕迹，可能含转录误差）。只判定这一题，按完整版标尺输出：
{"index":1,"questionText":"","questionType":"选择|填空|解答|其他","questionCategory":"","level":"L1~L11","D":0~1,"isCorrect":true|false,"correctAnswer":"","P":0|0.3|0.5|1.0,"eta":0.4~1.0|null,"r":null,"errorAttribution":null|""}
约束：D 落在 level 区间；最后输出纯 JSON`;
  const data = await postJSON(`${DS_BASE_URL}/chat/completions`, {
    model: DS_MODEL,
    messages: [
      { role: 'system', content: '你是严谨的数学诊断推理引擎。严格按完整版标尺判定单题。最后输出纯 JSON。' },
      { role: 'user', content: userMsg + '\n\n===== 完整版标尺 =====\n' + RUBRIC + ragSection + '\n\n===== 本题上下文 =====\n题目：' + question.questionText + '\n整图痕迹：' + (question.traceReport || '').slice(0, 1500) },
    ],
    max_tokens: 8000,
  }, DS_API_KEY);
  const msg = data.choices[0].message;
  const content = msg.content || msg.reasoning_content || '';
  const qIdx = content.indexOf('"index"');
  if (qIdx < 0) throw new Error('判定输出格式异常');
  const start = content.lastIndexOf('{', qIdx);
  const end = content.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('判定 JSON 提取失败');
  return JSON.parse(content.slice(start, end + 1));
}

// ============ 主入口 ============
exports.main = async (event) => {
  try {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    if (!openid) return fail(401, '未登录');

    const { questionId } = event;
    if (!questionId) return fail(400, '缺少题目ID');

    // 归属校验
    const qRes = await db.collection('questions').doc(questionId).get().catch(() => null);
    if (!qRes || !qRes.data) return fail(404, '题目不存在');
    if (qRes.data.userId !== openid) return fail(403, '无权操作他人题目');
    const question = qRes.data;

    // 判定（含 RAG 历史注入）
    const historyHits = await searchHistory(question.questionText, openid);
    const ragContext = buildRagContext(historyHits);
    const raw = await judgeQuestion(question, ragContext);

    const questionType = raw.questionType || question.questionType || '其他';
    const clamped = clampParams(raw, questionType);

    // 更新题目
    await db.collection('questions').doc(questionId).update({
      data: {
        questionType,
        isCorrect: raw.isCorrect === undefined ? null : raw.isCorrect,
        correctAnswer: raw.correctAnswer || '',
        questionCategory: raw.questionCategory || '无法归类',
        difficultyLevel: raw.level || 'L4',
        difficultyValue: clamped.D,
        processScore: clamped.P,
        pathQuality: clamped.eta,
        errorAttribution: raw.errorAttribution || null,
      },
    });

    // 完整报告 + embedding 入库（RAG 自增强）
    const report = {
      questionText: question.questionText || '',
      questionType,
      studentAnswer: raw.studentAnswer || '',
      correctAnswer: raw.correctAnswer || '',
      isCorrect: raw.isCorrect === undefined ? null : raw.isCorrect,
      questionCategory: raw.questionCategory || '无法归类',
      difficultyLevel: raw.level || 'L4',
      difficultyValue: clamped.D,
      processScore: clamped.P,
      pathQuality: clamped.eta,
      transferQuality: null,
      knowledgeNodeId: null,
      nodeStatus: 'unmapped',
      errorAttribution: raw.errorAttribution || null,
      evidence: [], actionAdvice: null,
    };
    const reportText = buildReportText(report);
    let embedding = [];
    try {
      embedding = await embedText(reportText);
    } catch (e) {
      console.warn('[judgeOne] embed failed:', e.message);
    }
    try {
      await db.collection('mastery_logs').add({
        data: {
          _openid: openid, userId: openid, questionId,
          knowledgeNodeId: null, algorithm: 'score_poc',
          report, reportText, embedding, createdAt: db.serverDate(),
        },
      });
    } catch (e) {
      console.warn('[judgeOne] mastery_logs add failed:', e.message);
    }

    return success({
      questionId,
      newDiagnosis: {
        isCorrect: report.isCorrect,
        correctAnswer: report.correctAnswer,
        questionCategory: report.questionCategory,
        difficultyLevel: report.difficultyLevel,
        difficultyValue: clamped.D,
        processScore: clamped.P,
        pathQuality: clamped.eta,
      },
    });
  } catch (e) {
    console.error('[judgeOne] error:', e);
    return fail(500, '判定失败，请重试');
  }
};
