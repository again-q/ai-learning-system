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
const DS_MODEL = process.env.DS_MODEL || 'deepseek-v4-flash'; // 新模型名（chat/reasoner 已弃用）；拆题用 disabled 思考

const success = (data = null) => ({ code: 0, data, message: 'ok' });
const fail = (code, msg) => ({ code, data: null, message: msg });

// ============ 视觉转录 prompt（决策 017：整体把握散文，每题独立成块便于 AI 拆题） ============
const VISION_PROMPT = `你是数学学习诊断助手的图像理解阶段。任务：准确转录题目 + 如实描述做题痕迹。不要做诊断判断。

输出 Markdown：
# 题目转录（每题独立成块，以「题号.」开头，含完整题干、所有选项内容和题目形式；一题一段，块与块之间空行）
# 做题痕迹观察（按书写顺序逐条：第N步+位置+痕迹；涂改/草稿/最终答案）
# 输出要求：不确定处标(不确定)；看不清写(看不清)；最终答案逐字符精确（≥≤><=符号不能错）；不臆测`;

// ============ AI 拆题（自然判断，不用死正则） ============
async function aiSplitQuestions(report) {
  const body = {
    model: DS_MODEL,
    thinking: { type: 'disabled' }, // 拆题不思考，便宜快
    messages: [
      { role: 'system', content: '你是题目拆分助手。把视觉转录中的题目逐题拆出，同时从「做题痕迹观察」中摘出每道题对应的做题痕迹片段。只输出 JSON。' },
      { role: 'user', content: `把以下转录拆成独立题目（一题一个对象）。每题包含：index、text=完整题干+选项+题号、traceReport=该题对应的做题痕迹片段（从转录的做题痕迹观察中按题摘录，没有对应痕迹就填空字符串）。输出：{"questions":[{"index":1,"text":"完整题目文本","traceReport":"该题做题痕迹"}]}\n\n===== 转录 =====\n${report.slice(0, 6000)}` },
    ],
    max_tokens: 8000, // 8 题完整题干较长，4000 会截断 JSON
  };
  const resp = await fetch(`${DS_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DS_API_KEY}` },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error('拆题失败 HTTP ' + resp.status);
  const data = await resp.json();
  const content = data.choices[0].message.content || '';
  const parseErr = (m) => {
    const e = new Error(m + ' | content前150: ' + content.slice(0, 150).replace(/\n/g, ' '));
    console.error('[diagnose] aiSplit:', e.message);
    throw e;
  };
  let parsed = null;
  // ① 先试整体解析（模型可能直接输出纯 JSON）
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    parsed = null;
  }
  // ② 整体失败：从第一个 { 到最后一个 } 截取配平（跳过前置说明文本）
  if (!parsed) {
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start < 0 || end < 0 || end < start) parseErr('拆题 JSON 定位失败');
    try {
      parsed = JSON.parse(content.slice(start, end + 1));
    } catch (e) {
      parseErr('拆题 JSON 解析失败: ' + e.message);
    }
  }
  if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) parseErr('拆题输出无 questions');
  return parsed.questions
    .map((q) => ({
      text: q.text || '',
      traceReport: q.traceReport || '',
      type: guessType(q.text || ''),
    }))
    .filter((q) => q.text.length > 5);
}

function guessType(line) {
  if (/\(\s*\)/.test(line) && /^[A-D]/.test(line)) return '选择';
  if (/_{2,}|____/.test(line)) return '填空';
  if (/[。；；]$/.test(line)) return '填空';
  return '其他';
}

// ============ Qwen 视觉转录 ============
async function qwenVision(fileId) {
  const file = await cloud.getTempFileURL({ fileList: [fileId] });
  const url = file.fileList[0].tempFileURL;
  const imageResp = await fetch(url);
  const buffer = Buffer.from(await imageResp.arrayBuffer());
  const base64 = buffer.toString('base64');
  const ext = (fileId.split('.').pop() || 'jpg').toLowerCase();
  const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  const mime = mimeMap[ext] || 'image/jpeg';
  const resp = await fetch(`${QWEN_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${QWEN_API_KEY}` },
    body: JSON.stringify({
      model: QWEN_VL_MODEL,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
          { type: 'text', text: VISION_PROMPT },
        ],
      }],
      max_tokens: 3000,
      enable_thinking: false,
    }),
  });
  if (!resp.ok) throw new Error('vision HTTP ' + resp.status);
  const data = await resp.json();
  return data.choices[0].message.content;
}

// ============ 主入口：转录 + AI 拆题 + 建 pending 题（判定由 judgeOne 逐题做） ============
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

    // ② AI 拆题 → 建 pending 题记录
    for (const vr of visionResults) {
      if (!vr.success) {
        failedCount++;
        console.error('[diagnose] vision failed:', vr.fileId, vr.error);
        const qIns = await db.collection('questions').add({
          data: {
            _openid: openid, userId: openid, batchId, imageFileId: vr.fileId,
            questionText: '', questionType: '其他', isCorrect: null,
            nodeStatus: 'unmapped', source: 'photo', traceReport: null,
            failedReason: 'vision:' + (vr.error || '未知错误'),
            revisions: [], createdAt: db.serverDate(),
          },
        });
        questions.push({ questionId: qIns._id, status: 'failed', error: vr.error });
        continue;
      }

      let items = [];
      let splitError = null;
      try {
        items = await aiSplitQuestions(vr.report);
      } catch (e) {
        splitError = e.message;
        console.warn('[diagnose] aiSplit failed:', e.message);
      }
      if (!items.length) {
        failedCount++;
        const qIns = await db.collection('questions').add({
          data: {
            _openid: openid, userId: openid, batchId, imageFileId: vr.fileId,
            questionText: '', questionType: '其他', isCorrect: null,
            nodeStatus: 'unmapped', source: 'photo', traceReport: vr.report,
            failedReason: 'split:' + (splitError || '拆出0题'),
            revisions: [], createdAt: db.serverDate(),
          },
        });
        questions.push({ questionId: qIns._id, status: 'failed', error: splitError });
        continue;
      }

      for (const item of items) {
        totalQuestions++;
        const qIns = await db.collection('questions').add({
          data: {
            _openid: openid, userId: openid, batchId, imageFileId: vr.fileId,
            questionText: item.text, questionType: item.type || '其他',
            isCorrect: null, nodeStatus: 'unmapped', source: 'photo',
            traceReport: item.traceReport || vr.report, revisions: [], createdAt: db.serverDate(),
          },
        });
        questions.push({ questionId: qIns._id, status: 'pending' });
      }
    }

    // ③ 拆分阶段完成：status=analyzing（判定中），由 judgeOne 逐题判定、最后一题完成才置 completed
    await db.collection('batches').doc(batchId).update({
      data: { status: 'analyzing', totalQuestions, failedCount: failedCount + filteredCount, progress: { done: 0, total: totalQuestions } },
    });

    return success({
      batchId, status: 'analyzing', totalQuestions,
      failedCount: failedCount + filteredCount,
      questions: questions.map((q) => ({ questionId: q.questionId, status: q.status, error: q.error || null })),
    });
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
