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

// ============ 诊断 rubric（决策 020/021 + D难度标尺-L11分层.md 完整版） ============
const RUBRIC = `
【诊断判定标准（决策 020/021 + D 难度标尺完整版 L1~L11）】

■ D 难度判定流程：第1步用「边界判定速查卡」判 Lx 档（分类）；第2步在档内自由打 D 值；代码钳制回区间。

■ 边界判定速查卡：
| 判定依据 | 归入层级 | D 值区间 |
| 读题即写答案，0步推导 | L1 | 0.01–0.15 |
| 套1个公式，1-2步计算 | L2 | 0.15–0.30 |
| 套1-2个公式，2-3步推导，无变形 | L3 | 0.30–0.45 |
| 3-5步标准流程，单一板块内串联 | L4 | 0.45–0.60 |
| 5-10步流程，轻度分类讨论（2-3类） | L5 | 0.60–0.70 |
| 10步以上，复杂分类讨论（3-5类），或需二级结论 | L6 | 0.70–0.79 |
| 需二级结论或高观点工具，或非线性构造 | L7 | 0.79–0.85 |
| 需高等数学背景初等化理解（泰勒/拉格朗日/帕德） | L8 | 0.85–0.90 |
| 需多个高观点叠加，或复杂构造性证明 | L9 | 0.90–0.94 |
| 需课外科板块知识（数论/组合/平几四大定理） | L10 | 0.94–0.98 |
| 解法纯原创，无模板可套，全球个位数能解 | L11 | 0.98–0.999 |

■ 例子锚（判档参照）：
L1: A={1,2,3},B={2,3,4} 求 A∩B（读题即写答案）
L2: f(x)=√(x-1) 求定义域（套1公式1-2步）
L3: 比较 log₂3 与 log₃4 大小（套1-2公式2-3步无变形）
L4: △ABC a=5,b=7,C=60° 求 c（3-5步标准流程，课本套路，含参分类讨论属常规训练也算 L4）
L5: 裂项求和 Σ1/(a_k·a_{k+1})（5-10步，轻度分类讨论）
L6: e^x−ax² 两零点求 a 范围（复杂含参讨论3-5类）
L7: 过椭圆外点作切线，切点连线过定点（二级结论/高观点）
L8: 极值点偏移证明 x₁+x₂>2（高数背景初等化）
L9: 多高观点叠加（强基/高联一试）
L10: 竞赛板块（数论/组合/平几四大定理）
L11: IMO P3/P6（纯原创）

■ 每层 5 维分值锁定表：
| 层级 | 知识复杂度 | 思维深度 | 陷阱密度 | 计算强度 | 陌生度 |
| L1 | 1 | 1 | 1 | 1 | 1 |
| L2 | 1–2 | 1 | 1 | 2 | 1 |
| L3 | 2 | 1 | 1 | 2 | 2 |
| L4 | 2 | 2 | 1 | 3 | 2 |
| L5 | 2 | 2 | 2 | 3 | 2 |
| L6 | 3 | 3 | 2 | 3 | 2 |
| L7 | 3 | 3 | 3 | 4 | 3 |
| L8 | 4 | 4 | 3 | 4 | 3 |
| L9 | 4 | 4 | 4 | 4 | 4 |
| L10 | 5 | 5 | 4 | 5 | 5 |
| L11 | 5 | 5 | 5 | 5 | 5 |

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
  // P0 修复：字段名对齐 DeepSeek 输出（level/D/P/eta），此前读 difficultyLevel/difficultyValue 恒 undefined
  const [lo, hi] = LR[raw.level] || [0.01, 0.999];
  const D = Math.min(hi, Math.max(lo, Number(raw.D) || lo));
  const isOpen = questionType === '解答';
  const eta = isOpen ? (raw.eta === undefined ? null : raw.eta) : null;
  const r = null;
  let P = Number(raw.P);
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
  // P2-A：按文件后缀取 MIME（png/webp 不再硬编码 jpeg）
  const ext = (fileId.split('.').pop() || 'jpg').toLowerCase();
  const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  const mime = mimeMap[ext] || 'image/jpeg';
  const data = await postJSON(`${QWEN_BASE_URL}/chat/completions`, {
    model: QWEN_VL_MODEL,
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
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
      { role: 'system', content: '你是严谨的数学诊断推理引擎。严格按 rubric 判定。最后必须输出纯 JSON。' },
      { role: 'user', content: userMsg + '\n\n===== rubric =====\n' + RUBRIC + ragSection + '\n\n===== vision 转录 =====\n' + visionReport },
    ],
    max_tokens: 16000, // 批量场景推理吃 token，给足预算
  }, DS_API_KEY);
  const msg = data.choices[0].message;
  // max 思考档：content 可能为空（推理吃光 token），回退 reasoning_content；JSON 用 {"questions" 定位（不能用 lastIndexOf {，会命中数学括号）
  const content = msg.content || msg.reasoning_content || '';
  const qIdx = content.indexOf('{"questions"');
  if (qIdx < 0) {
    throw new Error('判定输出无 questions JSON');
  }
  return content.slice(qIdx);
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
      .filter((log) => log.embedding && Array.isArray(log.embedding) && log.embedding.length > 0) // P1-⑧：空向量会导致 cosine NaN
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

// ============ 主入口 ============

// ============ 拆题（从 vision Markdown 转录拆出每题） ============
function splitQuestions(report) {
  // 只取「题目转录」段（做题痕迹段不参与拆题）
  const transcript = (report.split('# 做题痕迹观察')[0] || report);
  const lines = transcript.split('\n');
  const items = [];
  let cur = null;
  for (const line of lines) {
    const m = line.match(/^\s*(\d+)[.、]\s*(.*)$/);
    if (m && m[2] && m[2].length > 2) {
      if (cur) items.push(cur);
      cur = { text: line.trim(), type: guessType(line) };
    } else if (cur && line.trim()) {
      cur.text += '\n' + line.trim();
    }
  }
  if (cur) items.push(cur);
  return items;
}

function guessType(line) {
  if (/^[A-D][.、]/.test(line) || /\(\s*\)/.test(line) && /^[A-D]/.test(line)) return '选择';
  if (/[。；；]$/.test(line)) return '填空';
  return '其他';
}

exports.main = async (event) => {
  try {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    if (!openid) return fail(401, '未登录');

    const { batchId } = event;

    // 幂等检查 + 归属校验
    const batchRes = await db.collection('batches').doc(batchId).get().catch(() => null);
    if (!batchRes || !batchRes.data) return fail(40003, '批次不存在');
    if (batchRes.data.userId !== openid) return fail(403, '无权操作他人批次');
    if (batchRes.data.status !== 'pending') return fail(40003, '批次已诊断，请勿重复提交');

    await db.collection('batches').doc(batchId).update({ data: { status: 'analyzing' } });

    // 清理旧数据（失败重试残留）
    try {
      const oldQs = await db.collection('questions').where({ batchId, userId: openid }).limit(1000).get();
      const oldQIds = oldQs.data.map((q) => q._id);
      if (oldQIds.length > 0) {
        let d2 = 1;
        while (d2 > 0) {
          const r2 = await db.collection('mastery_logs').where({ questionId: _.in(oldQIds) }).remove();
          d2 = r2.stats ? r2.stats.removed : 0;
          if (d2 === 0) break;
        }
      }
      let deleted = 1;
      while (deleted > 0) {
        const b2 = await db.collection('questions').where({ batchId, userId: openid }).remove();
        deleted = b2.stats ? b2.stats.removed : 0;
        if (deleted === 0) break;
      }
    } catch (e) {
      console.warn('[diagnose] cleanup old batch data failed:', e.message);
    }

    // 读取批次照片（归属二次校验）
    const allFileIds = (batchRes.data.fileIds || []).slice(0, 9);
    const photoFileIds = allFileIds
      .filter((id) => typeof id === 'string' && id.includes(`/photos/${openid}/`));
    const filteredCount = allFileIds.length - photoFileIds.length;

    let totalQuestions = 0, failedCount = 0;
    const questions = [];

    // ① 并行视觉转录
    const visionTasks = photoFileIds.map(async (fileId) => {
      try {
        const report = await qwenVision(fileId);
        return { success: true, fileId, report };
      } catch (e) {
        return { success: false, fileId, error: e.message };
      }
    });
    const visionResults = await Promise.all(visionTasks);

    // ② 逐张拆题 → 建 pending 题记录（判定字段 null，由 judgeOne 逐题补）
    for (const vr of visionResults) {
      if (!vr.success) {
        failedCount++;
        const qIns = await db.collection('questions').add({
          data: {
            _openid: openid, userId: openid, batchId, imageFileId: vr.fileId,
            questionText: '', questionType: '其他', isCorrect: null,
            nodeStatus: 'unmapped', source: 'photo', traceReport: null,
            revisions: [], createdAt: db.serverDate(),
          },
        });
        questions.push({ questionId: qIns._id, status: 'failed' });
        continue;
      }

      const items = splitQuestions(vr.report);
      if (!items.length) {
        // 转录了但拆不出题 → 失败占位
        failedCount++;
        const qIns = await db.collection('questions').add({
          data: {
            _openid: openid, userId: openid, batchId, imageFileId: vr.fileId,
            questionText: '', questionType: '其他', isCorrect: null,
            nodeStatus: 'unmapped', source: 'photo', traceReport: vr.report,
            revisions: [], createdAt: db.serverDate(),
          },
        });
        questions.push({ questionId: qIns._id, status: 'failed' });
        continue;
      }

      for (const item of items) {
        totalQuestions++;
        const qIns = await db.collection('questions').add({
          data: {
            _openid: openid, userId: openid, batchId, imageFileId: vr.fileId,
            questionText: item.text, questionType: item.type || '其他',
            isCorrect: null, nodeStatus: 'unmapped', source: 'photo',
            traceReport: vr.report, revisions: [], createdAt: db.serverDate(),
          },
        });
        questions.push({ questionId: qIns._id, status: 'pending' });
      }
    }

    // ③ 完成拆分阶段（判定由 judgeOne 逐题做）
    await db.collection('batches').doc(batchId).update({
      data: { status: 'completed', totalQuestions, failedCount: failedCount + filteredCount, completedAt: db.serverDate() },
    });

    return success({ batchId, status: 'ready', totalQuestions, failedCount: failedCount + filteredCount, questions });
  } catch (e) {
    console.error('[diagnose] error:', e);
    try {
      if (event && event.batchId) {
        await db.collection('batches').doc(event.batchId).update({ data: { status: 'pending' } }).catch(() => {});
      }
    } catch (_) {}
    return fail(500, '分析失败，请重试');
  }
};
