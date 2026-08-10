const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 与 diagnose 共用配置
const DS_API_KEY = process.env.DEEPSEEK_API_KEY;
const DS_BASE_URL = process.env.DS_BASE_URL || 'https://api.deepseek.com';
const DS_MODEL = process.env.DS_MODEL || 'deepseek-chat';

const success = (data = null) => ({ code: 0, data, message: 'ok' });
const fail = (code, msg) => ({ code, data: null, message: msg });

const RUBRIC = `
【诊断判定标准（决策 020/021 定稿）】
■ D 难度：L1~L11 档位钳制+档内自由。第1步判 Lx 档（例子锚：L1求A∩B/L2求√定义域/L3比log大小/L4△ABC求c/L5裂项/L6含参两零点/L7极点极线/L8极值点偏移/L9多高观点/L10竞赛板块/L11IMO）；第2步档内自由打 D 值；代码钳制回区间
■ 题型分类：回忆类=直接套公式；单元内=本单元变形推理；跨单元=结合≥2单元
■ P（§4.4）：1.0清晰正确/0.5部分正确模糊/0.3错误有思路/0空白
■ η：只对解答题判0.4~1.0；填空/选择无过程→null
■ r：一律 null
■ isCorrect：严格数学判定（学生已修正关键信息，以修正后为准）
■ 归因：做错才给；做对 null；不编造
`;

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
  let P = Number(raw.processScore);
  if (!P_BINS.includes(P)) {
    P = P_BINS.reduce((prev, curr) => (Math.abs(curr - P) < Math.abs(prev - P) ? curr : prev));
  }
  return { D, eta, P };
}

async function postJSON(url, body, key) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  return resp.json();
}

// 单题重诊：以修正后的关键信息为准
async function judgeQuestion(question, corrections) {
  const studentAnswer = corrections.studentAnswer || question.studentAnswer || '';
  const userMsg = `输入是一道题的上下文（含学生修正后的作答）。按 rubric 判定并输出 JSON：
{"questions":[{"index":1,"questionCategory":"回忆类|单元内应用|跨单元应用","level":"L1~L11","D":0~1,"isCorrect":true|false,"correctAnswer":"","P":0|0.3|0.5|1.0,"eta":0.4~1.0|null,"r":null,"errorAttribution":null|""}]}
约束：D 落在 level 区间；eta 仅在解答题；以学生修正后的作答为准严格判定；只输出 JSON`;
  const context = `题目：${question.questionText || ''}\n题型：${question.questionType || ''}\n学生作答（已修正）：${studentAnswer}\n修正说明：${corrections.note || ''}`;
  const data = await postJSON(`${DS_BASE_URL}/chat/completions`, {
    model: DS_MODEL,
    temperature: 0.2,
    messages: [
      { role: 'system', content: '你是严谨的数学诊断推理引擎。只输出 JSON。' },
      { role: 'user', content: userMsg + '\n\n===== rubric =====\n' + RUBRIC + '\n\n===== 题目上下文 =====\n' + context },
    ],
    max_tokens: 1500,
  }, DS_API_KEY);
  const raw = data.choices[0].message.content;
  const start = raw.indexOf('{');
  if (start < 0) throw new Error('判定输出格式异常');
  const parsed = JSON.parse(raw.slice(start, raw.lastIndexOf('}') + 1));
  if (!parsed.questions || !parsed.questions.length) throw new Error('判定输出为空'); // P2-C：空数组走 keptOriginal，不丢修正
  return parsed.questions[0];
}

exports.main = async (event) => {
  try {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    if (!openid) return fail(401, '未登录');

    const { questionId, corrections } = event;
    if (!questionId || !corrections) return fail(400, '参数不完整');

    // 归属校验（仅本人题目可修正）
    const qRes = await db.collection('questions').doc(questionId).get().catch(() => null);
    if (!qRes || !qRes.data) return fail(404, '题目不存在');
    if (qRes.data.userId !== openid) return fail(403, '无权操作他人题目');

    const question = qRes.data;

    // 1. 追加修正记录（决策 016：只追加不删改史）
    const revision = {
      field: 'studentAnswer',
      originalValue: question.studentAnswer || '',
      revisedValue: corrections.studentAnswer || question.studentAnswer || '',
      source: 'student_revision',
      note: corrections.note || '',
      createdAt: db.serverDate(),
    };

    // 2. 单题重诊（判定失败则保留原判定，但仍落库修正内容——CR-003 容错对称）
    let raw;
    let keptOriginal = false;
    try {
      raw = await judgeQuestion(question, corrections);
    } catch (e) {
      console.warn('[dispute] re-judge failed, keep original:', e.message);
      keptOriginal = true;
      // 判定失败：仍把学生的修正内容落库（revision），只不更新判定字段
      await db.collection('questions').doc(questionId).update({
        data: {
          studentAnswer: corrections.studentAnswer || question.studentAnswer || '',
          revisions: _.push([{
            field: 'studentAnswer',
            originalValue: question.studentAnswer || '',
            revisedValue: corrections.studentAnswer || question.studentAnswer || '',
            source: 'student_revision',
            note: corrections.note || '',
            createdAt: db.serverDate(),
          }]),
        },
      });
      return success({
        questionId,
        keptOriginal,
        newDiagnosis: {
          isCorrect: question.isCorrect,
          correctAnswer: question.correctAnswer || '',
          difficultyLevel: question.difficultyLevel || 'L4',
          difficultyValue: question.difficultyValue || 0.5,
          processScore: question.processScore || 0.5,
          pathQuality: question.pathQuality || null,
        },
      });
    }
    const clamped = clampParams(raw, question.questionType || '解答');

    // 3. 更新 questions 当前值 + revisions
    await db.collection('questions').doc(questionId).update({
      data: {
        studentAnswer: corrections.studentAnswer || question.studentAnswer || '',
        isCorrect: raw.isCorrect === undefined ? null : raw.isCorrect, // SF-2：undefined 兜底
        correctAnswer: raw.correctAnswer || question.correctAnswer || '',
        questionCategory: raw.questionCategory || question.questionCategory || '无法归类',
        difficultyLevel: raw.level || question.difficultyLevel || 'L4',
        difficultyValue: clamped.D,
        processScore: clamped.P,
        pathQuality: clamped.eta,
        errorAttribution: raw.errorAttribution || null,
        revisions: _.push([revision]),
      },
    });

    // 4. 组装完整报告 + RAG 闭环（reportText + embedding）
    const report = {
      questionText: question.questionText || '',
      questionType: question.questionType || '',
      studentAnswer: corrections.studentAnswer || question.studentAnswer || '',
      correctAnswer: raw.correctAnswer || question.correctAnswer || '', // P2-B：与 questions 更新一致的缺省链
      isCorrect: raw.isCorrect === undefined ? null : raw.isCorrect, // SF-2
      questionCategory: raw.questionCategory || question.questionCategory || '无法归类',
      difficultyLevel: raw.level || question.difficultyLevel || 'L4',
      difficultyValue: clamped.D,
      processScore: clamped.P,
      pathQuality: clamped.eta,
      transferQuality: null,
      knowledgeNodeId: question.knowledgeNodeId || null,
      nodeStatus: question.nodeStatus || 'unmapped',
      errorAttribution: raw.errorAttribution || null, // SF-3：与 questions 更新处一致
      evidence: [],
      actionAdvice: null,
    };
    const reportText = `题目：${report.questionText} | 作答：${report.studentAnswer} | 判定：${report.isCorrect ? '对' : '错'} | 题型：${report.questionCategory} | 难度：${report.difficultyLevel} | 知识点：${report.knowledgeNodeId || ''}`;
    let embedding = [];
    try {
      const QWEN_API_KEY = process.env.QWEN_API_KEY;
      const QWEN_BASE_URL = process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
      const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-v4';
      const resp = await fetch(`${QWEN_BASE_URL}/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${QWEN_API_KEY}` },
        body: JSON.stringify({ model: EMBEDDING_MODEL, input: reportText }),
      });
      if (resp.ok) {
        const d = await resp.json();
        embedding = d.data[0].embedding;
      }
    } catch (e) {
      console.warn('[dispute] embed failed:', e.message);
    }
    // 5. 追加 mastery_logs（add 失败降级，不报 500——P0-③：判定已更新，记录失败不回滚）
    try {
      await db.collection('mastery_logs').add({
        data: {
          _openid: openid,
          userId: openid,
          questionId,
          knowledgeNodeId: question.knowledgeNodeId || null,
          algorithm: 'score_poc',
          report,
          reportText,
          embedding,
          createdAt: db.serverDate(),
        },
      });
    } catch (e) {
      console.warn('[dispute] mastery_logs add failed (判定已更新，记录降级):', e.message);
    }

    return success({
      questionId,
      keptOriginal,
      newDiagnosis: {
        isCorrect: raw.isCorrect === undefined ? null : raw.isCorrect, // SF-2
        correctAnswer: raw.correctAnswer || '',
        difficultyLevel: raw.level || 'L4',
        difficultyValue: clamped.D,
        processScore: clamped.P,
        pathQuality: clamped.eta,
      },
    });
  } catch (e) {
    console.error('[dispute] error:', e);
    return fail(500, '修正失败，请重试');
  }
};
