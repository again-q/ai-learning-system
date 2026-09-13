const app = getApp();
const log = require('../../utils/upload-log');
const imageQuality = require('../../utils/image-quality');

// L2 压缩规范：长边 ≤2000px（超出等比缩；失败回退原图，不阻塞上传）
const MAX_EDGE = 2000;
async function compressIfNeeded(filePath) {
  try {
    const info = await wx.getImageInfo({ src: filePath });
    const longEdge = Math.max(info.width, info.height);
    if (longEdge <= MAX_EDGE) return filePath;
    const scale = MAX_EDGE / longEdge;
    const res = await wx.compressImage({
      src: filePath,
      quality: 85,
      compressedWidth: Math.round(info.width * scale),
      compressedHeight: Math.round(info.height * scale),
    });
    return res.tempFilePath || filePath;
  } catch (e) {
    console.warn('[photo] compress failed, use original:', e && e.message);
    return filePath;
  }
}

// 诊断结果抢救：diagnose 的结果有 TTL，小程序在后台待久了会拿到
//   -404010 result expired / -501002 ESOCKETTIMEDOUT，但服务端通常已经跑完
// 并把题目写进了 questions 集合 —— 轮询即可把批次救回来，不用让用户白等一场重来。
const RECOVER_POLL_MS = 5000;
const RECOVER_MAX_MS = 180000;

// 只有"服务端可能已完成"的错误才值得抢救；上传被中断（uploadFile:fail）无法恢复
function isRecoverableDiagnoseError(e) {
  const msg = (e && e.message) || String(e || '');
  return /-404010|result expired|-501002|ESOCKETTIMEDOUT|timeout/i.test(msg);
}

// 把云能力的技术错误翻译成学生看得懂的话（详细设计 §7：报错文案面向学生，不面向开发者）
// 原始错误不丢：已由 log.append('submit_fail', { error }) 存进链路日志供排查
function humanizeSubmitError(e) {
  const msg = (e && e.message) || String(e || '');
  if (/uploadFile/i.test(msg)) {
    return '照片上传被中断了（可能小程序切到了后台）。照片还在，请保持小程序在前台，再点「重试」。';
  }
  if (/-404010|result expired/i.test(msg)) {
    return '分析结果过期了（离开小程序太久），没能从云端取回。请点「重试」。';
  }
  if (/-501002|ESOCKETTIMEDOUT/i.test(msg)) {
    return '分析超时了（题目较多或网络较慢）。请点「重试」。';
  }
  return '提交失败，请重试。';
}

// 轮询抢救：diagnose 是先把所有题目写进 questions、最后才更新 batches，
// 所以要求"连续两次轮询到相同的题目组成"才算收完，避免拿到写了一半的题目。
// 返回 {total, pending}；pending 按 status==='pending' 过滤，**与正常路径的 pendingQ 同口径**
// （识别失败的题也会入库且 status 为 'failed'；只看题目总数会把"全部识别失败"误判成可进复核页）
async function recoverDiagnoseBatch(batchId) {
  const deadline = Date.now() + RECOVER_MAX_MS;
  let lastKey = '';
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, RECOVER_POLL_MS));
    let total = 0;
    let pending = 0;
    try {
      const res = await wx.cloud.callFunction({
        name: 'judgeOne',
        data: { action: 'listQuestions', batchId },
      });
      const r = res.result;
      if (r && r.code === 0 && Array.isArray(r.data) && r.data.length > 0) {
        total = r.data.length;
        pending = r.data.filter((q) => q.status === 'pending').length;
      }
    } catch (err) {
      total = 0;   // 网络还没恢复 → 继续等
      pending = 0;
    }
    const key = total + ':' + pending;
    if (total > 0 && key === lastKey) return { total, pending };
    lastKey = total > 0 ? key : '';
  }
  return null;
}

Page({
  data: {
    images: [],
    submitting: false,
    analyzing: false,
    progressText: '',
    estimatedText: '',
    totalQuestions: 0,
    doneCount: 0,
    progressPercent: 0,
    pipelineError: '',   // 流水线失败：页内提示，避免与 progress-mask 叠系统 toast
  },

  onLoad() {},

  // 生命周期只留痕，绝不中止链路 —— 离开页面/小程序后上传与诊断要继续跑完（用户明确要求）
  onHide() { log.append('photo_hide', { submitting: this.data.submitting, analyzing: this.data.analyzing }); },
  onUnload() { log.append('photo_unload', { submitting: this.data.submitting, analyzing: this.data.analyzing }); },

  // 选图（相机或相册）
  async chooseImage() {
    if (this.data.submitting) return;
    const remaining = 9 - this.data.images.length;
    if (remaining <= 0) {
      wx.showToast({ title: '最多9张照片', icon: 'none' });
      return;
    }
    try {
      const res = await wx.chooseMedia({
        count: remaining,
        mediaType: ['image'],
        sourceType: ['camera', 'album'],
        sizeType: ['compressed'],
      });
      const picked = res.tempFiles.map((f) => f.tempFilePath);
      // 输入优化 A：拍摄质量实时检测（过暗/过曝 → 缩略图标 ❌，上传时弹窗拦截）
      const checks = await Promise.all(picked.map((p) => imageQuality.analyzeImage(p)));
      const newImages = picked.map((p, i) => ({
        path: p,
        qualityOk: checks[i] ? checks[i].ok : true,
        qualityIssues: checks[i] ? (checks[i].issues || []).join('、') : '',
      }));
      const bad = newImages.filter((im) => !im.qualityOk);
      if (bad.length) {
        const why = bad.map((b) => b.qualityIssues).join('；');
        const remove = await new Promise((resolve) => {
          wx.showModal({
            title: '照片质量不佳',
            content: why + '。建议重拍后再传，否则可能识别不准。',
            cancelText: '仍要使用',
            confirmText: '移除重拍',
            success: (r2) => resolve(!!r2.confirm),
            fail: () => resolve(false),
          });
        });
        if (remove) {
          const good = newImages.filter((im) => im.qualityOk);
          if (good.length === 0) {
            this.setData({ pipelineError: '刚才的照片' + why + '，已移除。请按拍摄建议重拍。' });
            return;
          }
          this.setData({ images: [...this.data.images, ...good].slice(0, 9), pipelineError: '' });
          log.append('quality_filtered', { removed: bad.length, kept: good.length });
          return;
        }
        // 仍要使用：全部保留（不过关的带 ❌ 标记，上传时再拦截）
      }
      this.setData({ images: [...this.data.images, ...newImages].slice(0, 9), pipelineError: '' });
    } catch (e) {
      // 用户取消选择，忽略
    }
  },

  // 删除单张
  removeImage(e) {
    const idx = e.currentTarget.dataset.index;
    const images = [...this.data.images];
    images.splice(idx, 1);
    this.setData({ images });
  },

  // 预览大图
  previewImage(e) {
    const idx = e.currentTarget.dataset.index;
    const urls = this.data.images.map((im) => im.path);
    wx.previewImage({ current: urls[idx], urls });
  },

  clearPipelineError() {
    this.setData({ pipelineError: '' });
  },

  // 提交分析
  async submit() {
    if (this.data.submitting) return;
    if (this.data.images.length === 0) {
      wx.showToast({ title: '请先选择照片', icon: 'none' });
      return;
    }

    // 登录守卫（CR-002 加固：未登录不允许上传，避免照片落入公共目录）
    const user = app.globalData.userInfo;
    if (!user || !user._openid) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      setTimeout(() => wx.navigateTo({ url: '/pages/login/login' }), 800);
      return;
    }

    const badQuality = this.data.images.filter((im) => im.qualityOk === false);
    if (badQuality.length) {
      const removeBad = await new Promise((resolve) => {
        wx.showModal({
          title: '有照片质量过低',
          content: badQuality.length + ' 张照片被标记为质量过低（❌）。继续上传可能识别不准——要移除它们，只上传其余照片吗？',
          cancelText: '取消',
          confirmText: '移除并继续',
          success: (r2) => resolve(!!r2.confirm),
          fail: () => resolve(false),
        });
      });
      if (!removeBad) {
        this.setData({ pipelineError: '已取消上传。建议删除 ❌ 标记的照片后重拍。' });
        return;
      }
      this.setData({ images: this.data.images.filter((im) => im.qualityOk !== false) });
      if (!this.data.images.length) {
        this.setData({ pipelineError: '移除后没有可上传的照片了，请先重拍' });
        return;
      }
    }
    this.setData({
      submitting: true,
      pipelineError: '',
      progressText: '上传中...',
      estimatedText: '预计 ' + Math.ceil(this.data.images.length * 3) + ' 秒',
      progressPercent: 2,
    });
    log.beginSession('photo_submit');
    log.append('upload_start', { imageCount: this.data.images.length });

    let batchId = '';
    try {
      // 1. 逐张上传到云存储（路径含 userId，实现照片隔离——CR-002 修复）
      const uid = user._openid;
      const fileIds = [];
      const tUpload = Date.now();
      for (const item of this.data.images) {
        const path = await compressIfNeeded(item.path);
        const ext = path.split('.').pop() || 'jpg';
        const cloudPath = `photos/${uid}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const up = await wx.cloud.uploadFile({ cloudPath, filePath: path });
        fileIds.push(up.fileID);
      }
      log.append('upload_done', { fileIds: fileIds.length, durationMs: Date.now() - tUpload });

      // 2. 登记批次（photoUpload 云函数——只登记 fileIds，不重复上传）
      const batchRes = await log.timed('photoUpload', { fileCount: fileIds.length }, () =>
        wx.cloud.callFunction({
          name: 'photoUpload',
          data: { fileIds },
        })
      );
      const batchData = batchRes.result;
      if (batchData.code !== 0) throw new Error(batchData.message);
      batchId = batchData.data.batchId;
      log.append('batch_created', { batchId });

      // 3. 拆分阶段：视觉转录 + 拆题 + 建题（不含判定，快）
      this.setData({
        analyzing: true,
        progressText: 'AI 识别题目中...',
        estimatedText: '预计 ' + Math.ceil(this.data.images.length * 25) + ' 秒',
        progressPercent: 5,
      });
      const diagRes = await log.timed('diagnose', { batchId: batchData.data.batchId }, () =>
        wx.cloud.callFunction({
          name: 'diagnose',
          data: { batchId: batchData.data.batchId },
          timeout: 120000,
        })
      );
      const diagData = diagRes.result;
      if (diagData.code !== 0) throw new Error(diagData.message);
      log.append('diagnose_summary', {
        totalQuestions: diagData.data.totalQuestions,
        failedCount: diagData.data.failedCount,
        questionIds: (diagData.data.questions || []).map(q => q.questionId),
        errors: (diagData.data.questions || []).filter(q => q.error).map(q => q.error),
      });

      const pendingQ = (diagData.data.questions || []).filter((q) => q.status === 'pending');
      const total = pendingQ.length;

      // 4. 跳转复核页（一次复核题目 → 二次复核参数，报告暂不输出）
      if (total === 0) {
        // 页内错误，勿 showToast——会与 progress-mask 叠层
        this.setData({
          analyzing: false,
          submitting: false,
          pipelineError: '未识别到题目，请换清晰照片后重试',
        });
        return;
      }
      this.setData({ analyzing: false });
      log.append('navigate_review', { batchId: batchData.data.batchId });
      wx.navigateTo({ url: '/packageDiagnose/pages/review/review?batchId=' + batchData.data.batchId });
      return;
      // 旧流程（judgeOne 批量 + 报告页）已迁移至复核页，以下保留参考
      this.setData({ totalQuestions: total, progressText: 'AI 判定题目中...', progressPercent: 10 });
      let done = 0, failed = 0;
      const queue = [...pendingQ];
      const worker = async () => {
        while (queue.length > 0) {
          const item = queue.shift();
          try {
            await wx.cloud.callFunction({
              name: 'judgeOne',
              data: { questionId: item.questionId },
              timeout: 120000,
            });
          } catch (e) {
            failed++;
            console.error('[photo] judgeOne failed:', item.questionId, e);
          }
          done++;
          const pct = 10 + Math.round((done / total) * 85);
          this.setData({
            doneCount: done,
            progressPercent: pct,
            progressText: done === total ? '生成报告中...' : 'AI 判定题目中...',
          });
        }
      };
      await Promise.all([worker(), worker()]);

      // 5. 跳转报告页
      this.setData({ analyzing: false, progressPercent: 100 });
      if (failed > 0) {
        this.setData({ pipelineError: `${failed} 题判定失败，可在报告中重试` });
      }
      setTimeout(() => {
        wx.navigateTo({ url: `/packageDiagnose/pages/report/report?batchId=${batchData.data.batchId}` });
      }, 300);
    } catch (e) {
      console.error('[photo] submit error:', e);
      log.append('submit_fail', { error: e.message || String(e), stack: (e.stack || '').slice(0, 500) });

      // 诊断阶段"结果取不回"：服务端通常已完成，轮询抢救，保住"离开小程序后继续跑"
      if (batchId && isRecoverableDiagnoseError(e)) {
        this.setData({
          analyzing: true,
          submitting: true,
          progressText: '正在从云端取回分析结果…',
          estimatedText: '最多等 3 分钟',
          progressPercent: 95,
        });
        const rec = await recoverDiagnoseBatch(batchId);
        log.append('diagnose_recover', { batchId, total: rec ? rec.total : 0, pending: rec ? rec.pending : 0 });
        if (rec && rec.pending > 0) {
          this.setData({ analyzing: false });
          wx.navigateTo({ url: '/packageDiagnose/pages/review/review?batchId=' + batchId });
          return;
        }
        if (rec && rec.total > 0) {
          // 题目都入库了却没有一个 pending = 全部识别失败：与正常路径同口径提示
          this.setData({ analyzing: false, submitting: false, pipelineError: '未识别到题目，请换清晰照片后重试' });
          return;
        }
      }

      // 页内错误，勿 showToast——会与 progress-mask 叠层
      this.setData({
        analyzing: false,
        submitting: false,
        pipelineError: humanizeSubmitError(e),
      });
    } finally {
      this.setData({ submitting: false });
    }
  },

  // 长按标题：复制上传链路日志（排查用）
  onCopyLogs() {
    const logs = log.getAll();
    if (!logs.length) {
      wx.showToast({ title: '暂无日志', icon: 'none' });
      return;
    }
    const text = logs.map(l => `[${l.t}] ${l.step} ${JSON.stringify(l.data || {})}`).join('\n');
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: '已复制 ' + logs.length + ' 条日志', icon: 'none' }),
    });
  },

  goBack() {
    wx.navigateBack();
  }
});