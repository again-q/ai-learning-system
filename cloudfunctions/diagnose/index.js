const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// ============ 配置 ============
const QWEN_API_KEY = process.env.QWEN_API_KEY;
const DS_API_KEY = process.env.DEEPSEEK_API_KEY;
const QWEN_BASE_URL = process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const QWEN_VL_MODEL = process.env.QWEN_VL_MODEL || 'qwen3.7-plus';
const DS_BASE_URL = process.env.DS_BASE_URL || 'https://api.deepseek.com';
const DS_MODEL = process.env.DS_MODEL || 'deepseek-chat';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-v4';
const TOP_K = 5;
const HISTORY_LIMIT = 200;

// ============ 统一响应 ============
const success = (data = null) => ({ code: 0, data, message: 'ok' });
const fail = (code, msg) => ({ code, data: null, message: msg });

// ============ 视觉转录 prompt（决策 017：整体把握散文） ============
const VISION_PROMPT = `你是数学学习诊断助手的图像理解阶段。任务：准确转录题目 + 如实描述做题痕迹。不要做诊断判断。

输出 Markdown：
# 题目转录（每题：题号/完整题干含所有条件和选项内容/题目形式）
# 做题痕迹观察（按书写顺序逐条：第N步+位置+痕迹；涂改/草稿/最终答案）
# 输出要求：不确定处标(不确定)；看不清写(看不清)；最终答案逐字符精确（≥≤><=符号不能错）；不臆测`;

// ============ 诊断 rubric（决策 020/021 定稿） ============
const RUBRIC = `
【诊断判定标准（决策 020/021 定稿）】
■ D 难度：L1~L11 档位钳制+档内自由。第1步判 Lx 档（例子锚：L1求A∩B/L2求√定义域/L3比log大小/L4△ABC求c(课本套路含分类讨论也算)/L5裂项/L6含参两零点/L7极点极线/L8极值点偏移/L9多高观点/L10竞赛板块/L11IMO）；第2步档内自由打 D 值（勿都取上沿）；代码钳制回区间
■ 题型分类（门禁1）：回忆类=直接套公式；单元内=本单元变形推理分类讨论；跨单元=结合≥2单元
■ P（理论§4.4）：1.0清晰正确/0.5部分正确模糊/0.3错误有思路/0空白
■ η：只对解答题判0.4~1.0（本质解法0.9+）；填空/选择无过程→null
■ r：一律 null（无追问）
■ isCorrect：严格数学判定。注意 vision 转录的 ≥ 可能被读成 >（转录不确定时按数学逻辑核验）
■ 归因：做错才给；做对 null；不编造
`;

// ============ L 档区间 + 钳制 ============
const LR = {
  L1: [0.01, 0.15], L2: [0.15, 0.30], L3: [0.30, 0.45],
  L4: [0.45, 0.60], L5: [0.60, 0.70], L6: [0.70, 0.79],
  L7: [0.79, 0.85], L8: [0.85, 0.90], L9: [0.90, 0.94],
  L10: [0.94, 0.98], L11: [0.98, 0.999],
};
const P_BINS = [0, 0.3, 0.5, 1.0];

function clampParams(raw, questionType) {
  const [lo, hi] = LR[raw.difficultyLevel] || [0.01, 0.999];
  const D = Math.min(hi, Math.max(lo, Number(raw.difficultyValue) || lo));
  const isOpen = questionType === '解答';
  const eta = isOpen ? raw.pathQuality : null;
  const r = null;
  let P = Number(raw.processScore);
  if (!P_BINS.includes(P)) {
    P = P_BINS.reduce((prev, curr) => (Math.abs(curr - P) < Math.abs(prev - P) ? curr : prev));
  }
  return { D, eta, r, P };
}

// ============ 网络调用 ============
async function postJSON(url, body, key, headers = {}) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, ...headers },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  return resp.json();
}

async function qwenVision(fileId) {
  const file = await cloud.getTempFileURL({ fileList: [fileId] });
  const url = file.fileList[0].tempFileURL;
  const imageResp = await fetch(url);
  const buffer = Buffer.from(await imageResp.arrayBuffer());
  const base64 = buffer.toString('base64');
  const data = await postJSON(`${QWEN_BASE_URL}/chat/completions`, {
    model: QWEN_VL_MODEL,
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
        { type: 'text', text: VISION_PROMPT },
      ],
    }],
    max_tokens: 2500,
    enable_thinking: false,
  }, QWEN_API_KEY);
  return data.choices[0].message.content;
}

async function deepseekJudge(visionReport, ragContext) {
  const ragSection = ragContext ? `\n\n【历史参考（相似题以往判定，仅供参考不强制）】\n${ragContext}` : '';
  const userMsg = `输入是视觉转录（可能含转录误差）。按 rubric 对每题输出：
{"questions":[{"index":1,"questionText":"题目文本","questionType":"选择|填空|解答|其他","questionCategory":"回忆类|单元内应用|跨单元应用|无法归类","level":"L1~L11","D":0~1,"isCorrect":true|false,"correctAnswer":"","P":0|0.3|0.5|1.0,"eta":0.4~1.0|null,"r":null,"errorAttribution":null|"","knowledgePoints":[""]}]}
约束：questionText 完整转录题干（含选项内容）；D 落在 level 区间内；eta 只在解答题；isCorrect 严格数学核验（发现转录可疑处按数学逻辑判定并注明）；只输出 JSON`;
  const data = await postJSON(`${DS_BASE_URL}/chat/completions`, {
    model: DS_MODEL,
    temperature: 0.2,
    messages: [
      { role: 'system', content: '你是严谨的数学诊断推理引擎。严格按 rubric 判定。只输出 JSON。' },
      { role: 'user', content: userMsg + '\n\n===== rubric =====\n' + RUBRIC + ragSection + '\n\n===== vision 转录 =====\n' + visionReport },
    ],
    max_tokens: 3000,
  }, DS_API_KEY);
  return data.choices[0].message.content;
}

// ============ RAG（决策 E3：轻量自建） ============
async function embedText(text) {
  const data = await postJSON(`${QWEN_BASE_URL}/embeddings`, {
    model: EMBEDDING_MODEL,
    input: text,
  }, QWEN_API_KEY);
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
      .where({ userId })
      .orderBy('createdAt', 'desc')
      .limit(HISTORY_LIMIT)
      .get();
    const scored = logs.data
      .filter((log) => log.embedding && Array.isArray(log.embedding))
      .map((log) => ({
        score: cosine(queryEmbedding, log.embedding),
        reportText: log.reportText || '',
        isCorrect: log.report && log.report.isCorrect,
        difficultyLevel: log.report && log.report.difficultyLevel,
        knowledgeNodeId: log.report && log.report.knowledgeNodeId,
      }))
      .filter((h) => h.reportText)
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_K);
    return scored;
  } catch (e) {
    console.warn('[RAG] searchHistory failed:', e.message);
    return []; // RAG 失败不阻塞诊断
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

// ============ 视觉转录 → 题目拆分 ============
// 简单启发式：以 "# 题目转录" 之后的 Markdown 行按序号切分；实际以 DeepSeek 输出 JSON 为主
function parseQuestionsFromVision(visionReport, rawDiagnosisJson) {
  // 优先用 DeepSeek 返回的 JSON（index 对齐）
  let judged = [];
  try {
    const start = rawDiagnosisJson.indexOf('{');
    judged = JSON.parse(rawDiagnosisJson.slice(start, rawDiagnosisJson.lastIndexOf('}') + 1)).questions || [];
  } catch (e) {
    console.warn('[diagnose] judge JSON 解析失败，退回单题模式:', e.message);
  }
  if (judged.length === 0) {
    judged = [{ index: 1 }];
  }
  return judged.map((j, i) => ({
    index: j.index || i + 1,
    questionText: j.questionText || '',
    questionType: j.questionType || '',
    rawDiagnosis: j,
  }));
}

// ============ 主入口 ============
exports.main = async (event) => {
  try {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    if (!openid) return fail(401, '未登录');

    const { batchId } = event;

    // 幂等检查（DI-REG-01：仅 pending 可诊断）+ 归属校验
    const batchRes = await db.collection('batches').doc(batchId).get().catch(() => null);
    if (!batchRes || !batchRes.data) return fail(40003, '批次不存在');
    if (batchRes.data.userId !== openid) return fail(403, '无权操作他人批次');
    if (batchRes.data.status !== 'pending') return fail(40003, '批次已诊断，请勿重复提交');

    await db.collection('batches').doc(batchId).update({ data: { status: 'analyzing' } });

    // 读取批次照片（fileIds 存于批次记录）
    const imageFileIds = (batchRes.data.fileIds || []).slice(0, 9);

    let totalQuestions = 0, failedCount = 0;
    const results = [];

    const visionTasks = imageFileIds.map(async (fileId) => {
      try {
        const report = await qwenVision(fileId);
        return { success: true, fileId, report };
      } catch (e) {
        return { success: false, fileId, error: e.message };
      }
    });
    const visionResults = await Promise.all(visionTasks);

    for (const vr of visionResults) {
      if (!vr.success) {
        // 单张失败：写 questions 占位（C2：标记失败 + 前端展示原图引导重传）
        failedCount++;
        const qIns = await db.collection('questions').add({
          data: {
            _openid: openid,
            userId: openid,
            batchId,
            imageFileId: vr.fileId,
            isCorrect: null,
            questionText: '',
            nodeStatus: 'unmapped',
            source: 'photo',
            traceReport: null,
            revisions: [],
            createdAt: db.serverDate(),
          },
        });
        results.push({ questionId: qIns._id, fileId: vr.fileId, status: 'failed', error: vr.error });
        continue;
      }

      // 先 RAG 检索历史，再一次性判定（避免双重调用）
      const historyHits = await searchHistory(vr.report.slice(0, 500), openid);
      const ragContext = buildRagContext(historyHits);
      const finalDiagnosis = await deepseekJudge(vr.report, ragContext);

      const items = parseQuestionsFromVision(vr.report, finalDiagnosis);
      for (const item of items) {
        totalQuestions++;
        const raw = item.rawDiagnosis || {};
        const questionType = item.questionType || '解答';
        const clamped = clampParams(raw, questionType);

        const questionData = {
          _openid: openid,
          userId: openid,
          batchId,
          imageFileId: vr.fileId,
          questionText: item.questionText || raw.questionText || '',
          questionType,
          isCorrect: raw.isCorrect === undefined ? null : raw.isCorrect,
          correctAnswer: raw.correctAnswer || '',
          questionCategory: raw.questionCategory || '无法归类',
          difficultyLevel: raw.level || 'L4',
          difficultyValue: clamped.D,
          processScore: clamped.P,
          pathQuality: clamped.eta,
          transferQuality: clamped.r,
          knowledgeNodeId: null,
          nodeStatus: 'unmapped',
          errorAttribution: raw.errorAttribution || null,
          traceReport: vr.report,
          source: 'photo',
          revisions: [],
          createdAt: db.serverDate(),
        };
        const qIns = await db.collection('questions').add({ data: questionData });

        // 完整报告 + embedding 入库（RAG 自增强闭环）
        const report = {
          questionText: questionData.questionText,
          questionType,
          studentAnswer: raw.studentAnswer || '',
          correctAnswer: questionData.correctAnswer,
          isCorrect: questionData.isCorrect,
          questionCategory: questionData.questionCategory,
          difficultyLevel: questionData.difficultyLevel,
          difficultyValue: clamped.D,
          processScore: clamped.P,
          pathQuality: clamped.eta,
          transferQuality: clamped.r,
          knowledgeNodeId: null,
          nodeStatus: 'unmapped',
          errorAttribution: questionData.errorAttribution,
          evidence: [],
          actionAdvice: null,
        };
        const reportText = buildReportText(report);
        let embedding = [];
        try {
          embedding = await embedText(reportText);
        } catch (e) {
          console.warn('[RAG] embed failed:', e.message);
        }
        await db.collection('mastery_logs').add({
          data: {
            _openid: openid,
            userId: openid,
            questionId: qIns._id,
            knowledgeNodeId: null,
            algorithm: 'score_poc',
            report,
            reportText,
            embedding,
            createdAt: db.serverDate(),
          },
        });

        results.push({
          questionId: qIns._id,
          status: 'completed',
          isCorrect: questionData.isCorrect,
          difficultyLevel: questionData.difficultyLevel,
          difficultyValue: clamped.D,
          processScore: clamped.P,
          pathQuality: clamped.eta,
        });
      }
    }

    await db.collection('batches').doc(batchId).update({
      data: { status: 'completed', totalQuestions, failedCount, completedAt: db.serverDate() },
    });

    return success({ batchId, status: 'completed', totalQuestions, failedCount, questions: results });
  } catch (e) {
    console.error('[diagnose] error:', e);
    // 失败时回滚批次状态为 pending（可重试，避免僵尸批次）
    try {
      if (event && event.batchId) {
        await db.collection('batches').doc(event.batchId).update({
          data: { status: 'pending' },
        }).catch(() => {});
      }
    } catch (_) { /* 回滚失败不阻塞响应 */ }
    return fail(500, '诊断失败，请重试');
  }
};
