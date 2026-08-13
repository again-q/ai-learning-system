const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// ============ 配置 ============
const QWEN_API_KEY = process.env.QWEN_API_KEY;
const DS_API_KEY = process.env.DEEPSEEK_API_KEY;
const QWEN_BASE_URL = process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const DS_BASE_URL = process.env.DS_BASE_URL || 'https://api.deepseek.com';
const DS_MODEL = process.env.DS_MODEL || 'deepseek-v4-flash'; // 新模型名（chat/reasoner 已弃用）
const DS_THINKING = process.env.DS_THINKING || 'enabled';
const DS_EFFORT = process.env.DS_EFFORT || 'high'; // reasoning_effort：low 会误判，max 烧钱，high 是准确底线
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
{"index":1,"questionText":"","questionType":"选择|填空|解答|其他","questionCategory":"","level":"L1~L11","D":0~1,"isCorrect":true|false,"correctAnswer":"","P":0|0.3|0.5|1.0,"eta":0.4~1.0|null,"r":null,"errorAttribution":null|"","knowledgeNodeName":"题目考察的核心知识点名称（教材术语，如'函数的单调性'）","fiveDim":{"K":0,"A":0,"T":0,"Q":0,"S":0}}
约束：D 落在 level 区间；knowledgeNodeName 必须用教材术语原词；fiveDim 各维度 1~5 整数（K知识储备/A分析推理/T技巧熟练/Q思维品质/S学习状态，对标尺5维锁定表）；最后输出纯 JSON`;
  const data = await postJSON(`${DS_BASE_URL}/chat/completions`, {
    model: DS_MODEL,
    thinking: { type: DS_THINKING },
    reasoning_effort: DS_EFFORT,
    messages: [
      { role: 'system', content: '你是严谨的数学诊断推理引擎。严格按完整版标尺判定单题。最后输出纯 JSON。' },
      { role: 'user', content: userMsg + '\n\n===== 完整版标尺 =====\n' + RUBRIC + ragSection + '\n\n===== 本题上下文 =====\n题目：' + question.questionText + '\n整图痕迹：' + (question.traceReport || '').slice(0, 1500) },
    ],
    max_tokens: 8000,
  }, DS_API_KEY);
  const msg = data.choices[0].message;
  const content = msg.content || msg.reasoning_content || '';
  // 括号配平：从末尾 } 配平到真实 JSON 起点（跳过 prompt 示例/reasoning 复述）
  const end = content.lastIndexOf('}');
  if (end < 0) throw new Error('判定输出无 JSON');
  let depth = 0, start = -1;
  for (let i = end; i >= 0; i--) {
    const ch = content[i];
    if (ch === '}') depth++;
    else if (ch === '{') { depth--; if (depth === 0) { start = i; break; } }
  }
  if (start < 0) throw new Error('判定 JSON 起点定位失败');
  return JSON.parse(content.slice(start, end + 1));
}

// ============ 主入口 ============
exports.main = async (event) => {
  try {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    if (!openid) return fail(401, '未登录');

    const { action } = event;
    // ===== 复核接口（一次复核/二次复核共用） =====
    if (action === 'listQuestions') {
      const { batchId } = event;
      if (!batchId) return fail(400, '缺少批次ID');
      const batchRes = await db.collection('batches').doc(batchId).get().catch(() => null);
      if (!batchRes || !batchRes.data || batchRes.data.userId !== openid) return fail(403, '无权操作他人批次');
      const qs = await db.collection('questions').where({ batchId, userId: openid }).limit(30).get();
      return success(qs.data.map((q) => ({
        questionId: q._id, questionText: q.questionText || '', studentAnswer: q.studentAnswer || '',
        traceReport: q.traceReport || '', status: q.status || 'pending',
        reviewed: !!q.reviewed,
        // 二次复核参数（judge 后）
        questionType: q.questionType || '', questionCategory: q.questionCategory || '',
        difficultyLevel: q.difficultyLevel || '', difficultyValue: q.difficultyValue != null ? q.difficultyValue : null,
        isCorrect: q.isCorrect === undefined ? null : q.isCorrect, P: q.processScore != null ? q.processScore : null,
        eta: q.pathQuality != null ? q.pathQuality : null, errorAttribution: q.errorAttribution || null,
        knowledgeNodeName: q.knowledgeNodeName || '', fiveDim: q.fiveDim || null,
      })));
    }
    if (action === 'updateTranscription') {
      const { questionId, questionText, studentAnswer } = event;
      if (!questionId) return fail(400, '缺少题目ID');
      const qRes = await db.collection('questions').doc(questionId).get().catch(() => null);
      if (!qRes || !qRes.data || qRes.data.userId !== openid) return fail(403, '无权操作他人题目');
      const patch = {};
      if (typeof questionText === 'string' && questionText.trim()) patch.questionText = questionText.trim();
      if (typeof studentAnswer === 'string') patch.studentAnswer = studentAnswer.trim();
      patch.transcriptionReviewed = true;
      await db.collection('questions').doc(questionId).update({ data: patch });
      return success({ questionId });
    }
    if (action === 'updateParams') {
      const { questionId, params } = event;
      if (!questionId || !params) return fail(400, '缺少参数');
      const qRes = await db.collection('questions').doc(questionId).get().catch(() => null);
      if (!qRes || !qRes.data || qRes.data.userId !== openid) return fail(403, '无权操作他人题目');
      const patch = {};
      if (params.difficultyLevel) patch.difficultyLevel = params.difficultyLevel;
      if (params.difficultyValue != null) patch.difficultyValue = params.difficultyValue;
      if (params.knowledgeNodeName) patch.knowledgeNodeName = params.knowledgeNodeName;
      if (params.fiveDim) patch.fiveDim = params.fiveDim;
      if (params.isCorrect !== undefined) patch.isCorrect = params.isCorrect;
      patch.paramsReviewed = true;
      await db.collection('questions').doc(questionId).update({ data: patch });
      return success({ questionId });
    }

    // ===== 默认：单题判定 =====
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
        knowledgeNodeName: raw.knowledgeNodeName || '',
        fiveDim: raw.fiveDim || null,
        reviewed: true,
      },
    });

    // 报告 + embedding 入库（RAG 自增强）——本阶段「报告先不输出」，后续报告功能恢复时再打开
    // const report = {...}; const reportText = buildReportText(report); mastery_logs.add(...)

    // 更新批次进度；最后一题判完 → completed
    try {
      const batchRes = await db.collection('batches').doc(question.batchId).get();
      if (batchRes.data) {
        const done = (batchRes.data.progress && batchRes.data.progress.done || 0) + 1;
        const total = batchRes.data.progress ? batchRes.data.progress.total : 0;
        await db.collection('batches').doc(question.batchId).update({
          data: { progress: { done, total } },
        });
        if (total > 0 && done >= total) {
          await db.collection('batches').doc(question.batchId).update({
            data: { status: 'completed', completedAt: db.serverDate() },
          });
        }
      }
    } catch (e) {
      console.warn('[judgeOne] batch progress update failed:', e.message);
    }

    return success({
      questionId,
      newDiagnosis: {
        isCorrect: raw.isCorrect === undefined ? null : raw.isCorrect,
        correctAnswer: raw.correctAnswer || '',
        questionCategory: raw.questionCategory || '无法归类',
        difficultyLevel: raw.level || 'L4',
        difficultyValue: clamped.D,
        processScore: clamped.P,
        pathQuality: clamped.eta,
        knowledgeNodeName: raw.knowledgeNodeName || '',
        fiveDim: raw.fiveDim || null,
      },
    });
  } catch (e) {
    console.error('[judgeOne] error:', e);
    return fail(500, '判定失败，请重试');
  }
};
