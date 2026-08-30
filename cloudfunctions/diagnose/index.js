const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const ic = require('./imageCrop');

// ============ 配置 ============
const QWEN_API_KEY = process.env.QWEN_API_KEY;
const DS_API_KEY = process.env.DEEPSEEK_API_KEY;
const QWEN_BASE_URL = process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const QWEN_VL_MODEL = process.env.QWEN_VL_MODEL || 'qwen3.7-plus';
const DS_BASE_URL = process.env.DS_BASE_URL || 'https://api.deepseek.com';
const DS_MODEL = process.env.DS_MODEL || 'deepseek-v4-flash'; // 新模型名（chat/reasoner 已弃用）；拆题用 disabled 思考

const success = (data = null) => ({ code: 0, data, message: 'ok' });
const fail = (code, msg) => ({ code, data: null, message: msg });

// ============ 视觉转录 prompt（切题 v1：bbox 自定位 + 每题转录/痕迹，决策 017 整体把握散文原则保留） ============
const VISION_PROMPT = `你是数学学习诊断助手的图像理解阶段。任务：定位每题区域 + 准确转录题目 + 如实描述做题痕迹。不要做诊断判断。

输出 Markdown，每题一个块，格式严格如下：
### bbox: [x1,y1,x2,y2]
（该题在整个图片中的矩形框，坐标为 0-1000 归一化值，x1y1=左上，x2y2=右下，覆盖题干+作答区域，宁大勿小）

# 第N题转录
（完整题干、所有选项内容和题目形式；公式尽量用 $...$ / $$...$$）

# 第N题做题痕迹
（按书写顺序：步骤/位置/痕迹（涂改、草稿、最终答案）；无痕迹写「无可见痕迹」）

# 输出要求
有几题写几块；不确定处标(不确定)；看不清写(看不清)；最终答案逐字符精确（≥≤><=符号不能错）；不臆测；被截断看不全的题也要给 bbox 并在转录里标注(截断)`;

// ============ 痕迹按题切开（禁止把整份视觉报告塞进每道题） ============
function looksLikeFullVisionReport(trace, fullReport) {
  const t = (trace || '').trim();
  if (!t) return false;
  if (/#\s*题目转录/.test(t) && /#\s*做题痕迹/.test(t)) return true;
  const full = (fullReport || '').trim();
  if (full && t.length >= Math.floor(full.length * 0.75)) return true;
  return false;
}

/** 从整份转录里按「## 第N题」摘出该题痕迹；失败返回 '' */
function extractTraceByIndex(fullReport, index1Based) {
  const full = fullReport || '';
  if (!full || !index1Based) return '';
  // 优先在「做题痕迹」章节内找
  const sectionMatch = full.match(/#\s*做题痕迹[\s\S]*?(?=\n#\s+[^\n#]|$)/);
  const section = sectionMatch ? sectionMatch[0] : full;
  const re = new RegExp(
    `(?:^|\\n)##\\s*第\\s*${index1Based}\\s*题\\s*\\n([\\s\\S]*?)(?=\\n##\\s*第\\s*\\d+\\s*题|\\n#\\s+|$)`
  );
  const m = section.match(re);
  if (m && m[1] && m[1].trim()) return m[1].trim();
  return '';
}

/**
 * 选定某题的 traceReport：
 * 1) 拆题 AI 给出的片段（且不是整份报告）
 * 2) 否则从全文按题号摘录
 * 3) 再不行给空串——绝不回退整份 vr.report
 */
function pickTraceReport(itemTrace, fullReport, index1Based) {
  const raw = (itemTrace || '').trim();
  if (raw && !looksLikeFullVisionReport(raw, fullReport)) return raw;
  return extractTraceByIndex(fullReport, index1Based) || '';
}

// ============ AI 拆题（自然判断，不用死正则） ============
async function aiSplitQuestions(report) {
  const body = {
    model: DS_MODEL,
    thinking: { type: 'disabled' }, // 拆题不思考，便宜快
    messages: [
      {
        role: 'system',
        content:
          '你是题目拆分助手。把视觉转录中的题目逐题拆出，并从「做题痕迹观察」中按题号摘出对应痕迹。' +
          'traceReport 只能是该题自己的痕迹，禁止复制整份转录或把其他题的痕迹塞进来；没有就返回空字符串。只输出 JSON。',
      },
      {
        role: 'user',
        content:
          '把以下转录拆成独立题目（一题一个对象）。每题字段：\n' +
          '- index：题号（从 1 起）\n' +
          '- text：完整题干+选项+题号\n' +
          '- traceReport：仅该题的做题痕迹（对应「## 第N题」小节；无则 ""）\n' +
          '输出：{"questions":[{"index":1,"text":"完整题目文本","traceReport":"该题做题痕迹"}]}\n\n' +
          '===== 转录 =====\n' +
          report.slice(0, 6000),
      },
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
    .map((q, i) => ({
      index: Number(q.index) > 0 ? Number(q.index) : i + 1,
      text: q.text || '',
      traceReport: typeof q.traceReport === 'string' ? q.traceReport : '',
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

// ============ 归一化下载 + Qwen 视觉转录（切题 v1：EXIF 转正 → bbox 坐标系与裁剪一致） ============
async function downloadAndNormalize(fileId) {
  const file = await cloud.getTempFileURL({ fileList: [fileId] });
  const url = file.fileList[0] && file.fileList[0].tempFileURL;
  if (!url) throw new Error('tempURL 为空');
  const imageResp = await fetch(url);
  const buffer = Buffer.from(await imageResp.arrayBuffer());
  return ic.decodeNormalized(buffer);
}

function bmpToDataUrl(bmp, quality = 88) {
  const jpg = ic.encodeJpeg(bmp, quality);
  return `data:image/jpeg;base64,${jpg.toString('base64')}`;
}

async function qwenVisionDataUrl(dataUrl) {
  const resp = await fetch(`${QWEN_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${QWEN_API_KEY}` },
    body: JSON.stringify({
      model: QWEN_VL_MODEL,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: dataUrl } },
          { type: 'text', text: VISION_PROMPT },
        ],
      }],
      max_tokens: 6000,
      enable_thinking: false,
    }),
  });
  if (!resp.ok) throw new Error('vision HTTP ' + resp.status);
  const data = await resp.json();
  return data.choices[0].message.content;
}

// 解析 bbox 结构化输出：### bbox 行 + # 第N题转录 + # 第N题做题痕迹
function parseStructuredQuestions(report) {
  const items = [];
  const re = /###\s*bbox:\s*\[\s*(\d{1,4})\s*,\s*(\d{1,4})\s*,\s*(\d{1,4})\s*,\s*(\d{1,4})\s*\]/g;
  const marks = [];
  let m;
  while ((m = re.exec(report))) marks.push({ start: m.index, bbox: [+m[1], +m[2], +m[3], +m[4]] });
  for (let k = 0; k < marks.length; k++) {
    const seg = report.slice(marks[k].start, k + 1 < marks.length ? marks[k + 1].start : report.length);
    const pick = (label, stopLabel) => {
      const r = new RegExp(`#\\s*第\\s*\\d+\\s*题${label}([\\s\\S]*?)(?=#\\s*第\\s*\\d+\\s*题${stopLabel}|$)`);
      const mm = seg.match(r);
      return mm ? mm[1].trim() : '';
    };
    const text = pick('转录', '做题痕迹');
    const trace = pick('做题痕迹', '转录');
    if (text && text.length > 5) {
      const idxM = seg.match(/#\s*第\s*(\d+)\s*题/);
      items.push({ index: idxM ? +idxM[1] : k + 1, text, traceReport: trace, bbox: marks[k].bbox, type: guessType(text) });
    }
  }
  return items;
}

// 按 bbox（0-1000 归一化）裁剪归一化位图并上传云存储
async function cropAndUpload(bmp, bbox, uid, batchId, photoIdx, qIndex) {
  const W = bmp.width, H = bmp.height;
  const x = Math.max(0, Math.round(bbox[0] / 1000 * W));
  const y = Math.max(0, Math.round(bbox[1] / 1000 * H));
  const w = Math.max(1, Math.min(Math.round((bbox[2] - bbox[0]) / 1000 * W), W - x));
  const h = Math.max(1, Math.min(Math.round((bbox[3] - bbox[1]) / 1000 * H), H - y));
  const crop = ic.cropBitmap(bmp, x, y, w, h);
  const buf = ic.encodeJpeg(crop, 85);
  const up = await cloud.uploadFile({
    cloudPath: `photos/${uid}/crops/${batchId}_p${photoIdx}_q${qIndex}.jpg`,
    fileContent: buf,
  });
  return up.fileID;
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

    // ① 并行：归一化下载 + 视觉转录（bbox 自切题，一次调用完成转录+痕迹+定位）
    const visionTasks = photoFileIds.map(async (fileId, photoIdx) => {
      try {
        const { bmp, orientation, angle } = await downloadAndNormalize(fileId);
        if (angle) console.log(`[diagnose] ${fileId} EXIF orientation=${orientation}，预旋转 ${angle}°`);
        const report = await qwenVisionDataUrl(bmpToDataUrl(bmp));
        let items = parseStructuredQuestions(report);
        if (items.length === 0) {
          // 回退：无 bbox 结构 → 旧 DS 拆题路径（无裁剪图，痕迹从整页文本按题摘取）
          const plain = report.replace(/^###\s*bbox:.*$/gm, '');
          const splitItems = await aiSplitQuestions(plain); // 抛错则走下方 catch
          items = splitItems.map((it) => ({ ...it, bbox: null }));
        }
        return { success: true, fileId, bmp, report, items, photoIdx };
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

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const index1 = item.index || i + 1;
        let traceReport = item.traceReport || pickTraceReport(item.traceReport, vr.report, index1) || '';
        // 切题 v1：按 bbox 裁剪单题图（judgeOne 精读痕迹用）；失败不阻断建题
        let cropFileID = null;
        if (item.bbox) {
          try {
            cropFileID = await cropAndUpload(vr.bmp, item.bbox, openid, batchId, vr.photoIdx, index1);
          } catch (e) {
            console.warn('[diagnose] 裁剪上传失败（继续无裁剪建题）:', e.message);
          }
        }
        totalQuestions++;
        const qIns = await db.collection('questions').add({
          data: {
            _openid: openid, userId: openid, batchId, imageFileId: vr.fileId,
            questionText: item.text, questionType: item.type || '其他',
            isCorrect: null, nodeStatus: 'unmapped', source: 'photo',
            traceReport, cropFileID, revisions: [], createdAt: db.serverDate(),
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
