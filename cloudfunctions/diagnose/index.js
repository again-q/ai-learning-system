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

async function qwenVisionDataUrl(dataUrl, prompt = VISION_PROMPT) {
  const resp = await fetch(`${QWEN_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${QWEN_API_KEY}` },
    body: JSON.stringify({
      model: QWEN_VL_MODEL,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: dataUrl } },
          { type: 'text', text: prompt },
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

// bbox 是本链路的硬依赖（单题裁切 / 单题精读都要它）；模型偶尔不输出，故备一个"只输出 bbox"的廉价补调用
const BBOX_PROMPT = `这是一页数学作业或试卷照片。只做一件事：逐题给出该题在整张图中的矩形框。

输出格式（每题一行，严格照抄，不要输出任何其它内容）：
第1题: [x1,y1,x2,y2]
第2题: [x1,y1,x2,y2]

坐标系：整图左上角为 (0,0)、右下角为 (1000,1000) 的归一化坐标，取整数；矩形要覆盖该题的题干 + 作答区域（宁大勿小）。有几题就写几行。`;

/** 解析 bbox：兼容「第N题: [x,y,x,y]」与「### bbox: [x,y,x,y]」两种写法 → { 题号: bbox } */
function parseBboxList(text) {
  const map = {};
  const re = /(?:第\s*(\d+)\s*题[^\[]*|###\s*bbox[^\[]*)\[\s*(\d{1,4})\s*,\s*(\d{1,4})\s*,\s*(\d{1,4})\s*,\s*(\d{1,4})\s*\]/g;
  let m, seq = 0;
  while ((m = re.exec(text || ''))) {
    const idx = m[1] ? +m[1] : ++seq;
    map[idx] = [+m[2], +m[3], +m[4], +m[5]];
  }
  return map;
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
  // ============ 补读图拆题（2026-10-17 新增，用户拍板方案 C）============
  // 背景：智学网同步（zhixueSync）负责「拿数据」——建批次、建题、按官方坐标裁图，
  //   但当初有意跳过了「读图拆题」这一步（见 packageSync/pages/zhixue/zhixue.js
  //   「不再调 diagnose 拆题（官方逐题已建好题、裁好图）」），于是题目没有题干、没有学生作答文本，
  //   复核页学生没东西可核。
  // 本入口让 zhixueSync 把整页图交回来，由【本链路自己的读图能力】补齐——
  //   读图拆题逻辑复用 VISION_PROMPT + parseStructuredQuestions，不另写一套。
  // 红线：只写 questionText / traceReport，一个 official* 字段都不碰。
  if (event && event.action === 'retranscribe') return retranscribe(event);
  try {
    const wxContext = cloud.getWXContext();
    // 身份：小程序调用 OPENID 必有；管理/测试场景（CLI invoke、云函数互调）OPENID 为空，用调用方显式传入的 userId
    const openid = wxContext.OPENID || (event && event.userId) || null;
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
        // bbox 缺失（模型偶尔不输出）→ 补一次"只输出 bbox"的廉价调用；裁切与单题精读都依赖它
        if (!items.length || items.some((it) => !it.bbox)) {
          let bboxMap = {};
          let cropNote = 'main:no-bbox';
          try {
            const bboxText = await qwenVisionDataUrl(bmpToDataUrl(bmp), BBOX_PROMPT);
            bboxMap = parseBboxList(bboxText);
            cropNote = 'main-nobbox+retry:' + Object.keys(bboxMap).length + '|raw=' + String(bboxText || '').replace(/\s+/g, ' ').slice(0, 140);
            console.log('[diagnose] bbox 补调用得到', Object.keys(bboxMap).length, '个框');
          } catch (e) {
            cropNote = 'main-nobbox+retry-error:' + String((e && e.message) || e).slice(0, 140);
            console.warn('[diagnose] bbox 补调用失败:', e.message);
          }
          items = items.map((it) => ({ ...it, _cropNote: cropNote }));
          if (items.length) {
            items = items.map((it, i) => ({ ...it, bbox: it.bbox || bboxMap[it.index] || bboxMap[i + 1] || null }));
          } else {
            // 完全没解析出结构化块 → 旧 DS 拆题路径，但尽量把补到的 bbox 挂上
            const plain = report.replace(/^###\s*bbox:.*$/gm, '');
            const splitItems = await aiSplitQuestions(plain); // 抛错则走下方 catch
            items = splitItems.map((it) => ({ ...it, bbox: bboxMap[it.index] || null, _cropNote: cropNote }));
          }
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
            questionText: '', questionType: '其他',
            nodeStatus: 'unmapped', source: 'photo', traceReport: null,
            failedReason: 'vision:' + (vr.error || '未知错误'),
            revisions: [], createdAt: db.serverDate(),
          },
        });
        questions.push({ questionId: qIns._id, status: 'failed', error: vr.error });
        continue;
      }

      // 优先用视觉阶段已经解析好的 items（带 bbox，裁切依赖它）；只有它为空才回退去重新拆题
      let items = Array.isArray(vr.items) ? vr.items : [];
      let splitError = null;
      try {
        if (!items.length) items = await aiSplitQuestions(vr.report);
      } catch (e) {
        splitError = e.message;
        console.warn('[diagnose] aiSplit failed:', e.message);
      }
      if (!items.length) {
        failedCount++;
        const qIns = await db.collection('questions').add({
          data: {
            _openid: openid, userId: openid, batchId, imageFileId: vr.fileId,
            questionText: '', questionType: '其他',
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
        let cropError = null;
        if (item.bbox) {
          try {
            cropFileID = await cropAndUpload(vr.bmp, item.bbox, openid, batchId, vr.photoIdx, index1);
          } catch (e) {
            cropError = String((e && e.message) || e).slice(0, 300);
            console.warn('[diagnose] 裁剪上传失败（继续无裁剪建题）:', cropError);
          }
        } else {
          cropError = item._cropNote || 'no-bbox';
        }
        totalQuestions++;
        const qIns = await db.collection('questions').add({
          data: {
            _openid: openid, userId: openid, batchId, imageFileId: vr.fileId,
            questionText: item.text, questionType: item.type || '其他',
            nodeStatus: 'unmapped', source: 'photo',
            traceReport, cropFileID, cropError, cropBbox: item.bbox || null, revisions: [], createdAt: db.serverDate(),
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

// ============ retranscribe：给已有批次补「题干 + 学生作答文本」 ============
//
// 调用方：zhixueSync.importDetail（智学网导入结束后）
// 输入：{ action:'retranscribe', batchId, imageUrls:[签名URL...], userId }
// 输出：{ code:0, data:{ matched, updated, unmatched:[题号], failed:[{题号,原因}] } }
//
// 与主流程的区别：主流程会**新建**批次和题目；这里批次和题目都已存在（官方建的），
//   所以按【官方题号】把读出来的题对上去，只回填文本。
async function retranscribe(event) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID || event.userId || null;
  if (!openid) return fail(401, '未登录');
  const batchId = event.batchId;
  const imageUrls = Array.isArray(event.imageUrls) ? event.imageUrls.filter(Boolean).slice(0, 8) : [];
  if (!batchId) return fail(400, '缺少批次ID');
  if (!imageUrls.length && !event.compress) return fail(400, '缺少整页图地址');

  const batchRes = await db.collection('batches').doc(batchId).get().catch(() => null);
  if (!batchRes || !batchRes.data) return fail(40003, '批次不存在');
  if (batchRes.data.userId !== openid) return fail(403, '无权操作他人批次');

  const qRes = await db.collection('questions').where({ batchId, userId: openid }).limit(200).get();
  const questions = qRes.data || [];
  if (!questions.length) return fail(40003, '该批次没有题目');

  // compress 模式（2026-10-18）：不读图，只把库里已有的作答文本过一遍 compactWork。
  // 用途：模型早先把作答写成"题干末尾括号内手写填入答案 B"这类描述句，要批量改成答案本身；
  //      以及将来描述风格变了可以一键重刷，不必重新读图（省 25~50 秒和一次视觉调用）。
  if (event.compress) {
    let n = 0;
    const changed = [];
    for (const q of questions) {
      const before = String(q.traceReport || '').trim();
      if (!before) continue;
      const after = compactWork(before);
      if (after === before) continue;
      try {
        await db.collection('questions').doc(q._id).update({ data: { traceReport: after } });
        n++; changed.push({ no: String(q.questionNo), after });
      } catch (e) { /* 单条失败不影响其余 */ }
    }
    console.log('[diagnose/retranscribe] compress 批次 ' + batchId + '：更新 ' + n + ' 题');
    return success({ compress: true, updated: n, changed });
  }

  // 题号 → 题目记录（questionNo 是 string，读出来的是 number，统一按字符串比）
  const byNo = {};
  questions.forEach((q) => {
    const no = String(q.questionNo == null ? '' : q.questionNo).trim();
    if (no) byNo[no] = q;
  });

  const failed = [];
  const matched = [];      // 本次读图成功对上的题号
  const updatedNos = [];

  for (const url of imageUrls) {
    let items = [];
    try {
      const dataUrl = await urlToDataUrl(url);
      const report = await qwenVisionDataUrl(dataUrl);
      items = parseStructuredQuestions(report);
    } catch (e) {
      console.warn('[diagnose/retranscribe] 读图失败: ' + (e && e.message));
      failed.push({ url: 'page', reason: (e && e.message) || 'unknown' });
      continue;
    }
    if (!items.length) {
      // 结构化解析失败时退一步：用拆题模型（aiSplitQuestions 只吃文本，喂原文即可）
      try {
        const dataUrl = await urlToDataUrl(url);
        const raw = await qwenVisionDataUrl(dataUrl);
        items = await aiSplitQuestions(raw);
      } catch (e) {
        failed.push({ url: 'page', reason: '拆题失败:' + ((e && e.message) || '') });
        continue;
      }
    }

    for (const it of items) {
      const no = String(it.index == null ? '' : it.index).trim();
      const q = byNo[no];
      if (!q) { failed.push({ no: no || '?', reason: '官方无此题号，跳过' }); continue; }
      matched.push(no);
      const text = String(it.text || '').trim();
      const trace = String(it.traceReport || '').trim();
      const patch = {};
      // 只补空字段：官方题干（错题有）不被识图覆盖；已确认过的转录不覆盖
      if (text && !(q.questionText || '').trim()) patch.questionText = text.slice(0, 6000);
      if (trace && !(q.traceReport || '').trim() && !q.transcriptionReviewed) {
        patch.traceReport = looksLikeFullVisionReport(trace, '') ? '' : compactWork(trace).slice(0, 4000);
      }
      if (!Object.keys(patch).length) continue;
      try {
        await db.collection('questions').doc(q._id).update({ data: patch });
        updatedNos.push(no);
      } catch (e) {
        failed.push({ no, reason: '写库失败:' + ((e && e.message) || '') });
      }
    }
  }

  console.log('[diagnose/retranscribe] 批次 ' + batchId + '：对上 ' + matched.length + ' 题，更新 ' + updatedNos.length + ' 题，失败 ' + failed.length);
  return success({
    matched: matched.length,
    updated: updatedNos.length,
    updatedNos,
    unmatched: questions.map((q) => String(q.questionNo)).filter((no) => !matched.includes(no)),
    failed,
  });
}

/** 远程图片 → dataURL（读图接口要 base64） */
async function urlToDataUrl(url) {
  const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!resp.ok) throw new Error('下载图片 HTTP ' + resp.status);
  const buf = Buffer.from(await resp.arrayBuffer());
  return 'data:image/jpeg;base64,' + buf.toString('base64');
}

/**
 * 作答文本精简（2026-10-18 用户反馈）：模型常写成
 *   「题干末尾括号内手写填入答案 "B"。」「填空横线上手写填入答案 "$[2,+\\infty)$"。右侧有一个空方框。」
 * 复核页要的是**学生写了什么**，位置描述是噪音。规则：
 *   · 能从中抽出「答案 "X"」→ 只留 X
 *   · 抽不到（解答题的过程）→ 原样返回，一个字不改
 */
function compactWork(s) {
  const t = String(s || '').trim();
  if (!t) return '';
  // 只在「整段就是一句位置描述」时才精简；过程类文本不动
  const isDescr = /^(题干|填空|横线|括号|选项|题号).{0,20}(手写|书写|填入|答案)/.test(t) || /手写填入答案/.test(t);
  if (!isDescr) return t;
  const m = /(?:答案|填入)[^"]*"([^"]+)"/.exec(t) || /"([^"]+)"/.exec(t);
  if (!m) return t;
  const got = String(m[1]).trim();
  if (!got) return t;
  // 保留「涂改/被划掉」这类会影响判断的信息
  // 备注合并成一个括号，避免「（有涂改）（A 项被标记）」这种叠括号
  const marks = [];
  if (/涂改|潦草|划掉|划去/.test(t)) marks.push('有涂改');
  if (/打叉|画圈|被划/.test(t)) {
    const opt = /选项\s*"?([A-D])"?/.exec(t);
    marks.push(opt ? opt[1] + ' 项被标记' : '有标记');
  }
  return marks.length ? got + '（' + marks.join('，') + '）' : got;
}
