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
      { role: 'system', content: '你是题目拆分助手。把视觉转录中的题目逐题拆出，保持每题的完整题干和选项。只输出 JSON。' },
      { role: 'user', content: `把以下转录拆成独立题目（一题一个对象，含完整题干+选项+题号）。输出：{"questions":[{"index":1,"text":"完整题目文本"}]}\n\n===== 转录 =====\n${report.slice(0, 6000)}` },
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
  const idx = content.indexOf('"questions"'); // 兼容 {\n  "questions" 与 ```json 包裹
  if (idx < 0) throw new Error('拆题输出无 questions');
  const start = content.lastIndexOf('{', idx);
  if (start < 0) throw new Error('拆题 JSON 起点定位失败');
  const parsed = JSON.parse(content.slice(start, content.lastIndexOf('}') + 1));
  return (parsed.questions || [])
    .map((q) => ({ text: q.text || '', type: guessType(q.text || '') }))
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

      let items = [];
      try {
        items = await aiSplitQuestions(vr.report);
      } catch (e) {
        console.warn('[diagnose] aiSplit failed:', e.message);
      }
      if (!items.length) {
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

    // ③ 拆分阶段完成（判定由 judgeOne 逐题做，前端 1/N 进度）
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
