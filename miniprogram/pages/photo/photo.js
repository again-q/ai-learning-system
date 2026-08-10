const app = getApp();

Page({
  data: {
    images: [],
    submitting: false,
    analyzing: false,
    progressText: '',
    totalQuestions: 0,
    doneCount: 0,
    progressPercent: 0,
  },

  onLoad() {},

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
      const newImages = res.tempFiles.map((f) => f.tempFilePath);
      this.setData({ images: [...this.data.images, ...newImages].slice(0, 9) });
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
    wx.previewImage({ current: this.data.images[idx], urls: this.data.images });
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

    this.setData({ submitting: true, progressText: '上传中...' });
    wx.showLoading({ title: '上传中...', mask: true });

    try {
      // 1. 逐张上传到云存储（路径含 userId，实现照片隔离——CR-002 修复）
      const uid = user._openid;
      const fileIds = [];
      for (const file of this.data.images) {
        const ext = file.split('.').pop() || 'jpg';
        const cloudPath = `photos/${uid}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const up = await wx.cloud.uploadFile({ cloudPath, filePath: file });
        fileIds.push(up.fileID);
      }

      // 2. 登记批次（photoUpload 云函数——只登记 fileIds，不重复上传）
      const batchRes = await wx.cloud.callFunction({
        name: 'photoUpload',
        data: { fileIds },
      });
      const batchData = batchRes.result;
      if (batchData.code !== 0) throw new Error(batchData.message);

      // 3. 拆分阶段：视觉转录 + 拆题 + 建题（不含判定，快）
      this.setData({ analyzing: true, progressText: 'AI 识别题目中...', progressPercent: 5 });
      wx.showLoading({ title: '识别题目中...', mask: true });
      const diagRes = await wx.cloud.callFunction({
        name: 'diagnose',
        data: { batchId: batchData.data.batchId },
        timeout: 120000,
      });
      const diagData = diagRes.result;
      if (diagData.code !== 0) throw new Error(diagData.message);

      const pendingQ = (diagData.data.questions || []).filter((q) => q.status === 'pending');
      const total = pendingQ.length;
      wx.hideLoading();

      // 4. 逐题判定（judgeOne，进度条 1/N…N/N）
      if (total === 0) {
        wx.showToast({ title: '未识别到题目，请重试', icon: 'none' });
        this.setData({ analyzing: false });
        return;
      }
      this.setData({ totalQuestions: total, progressText: 'AI 判定题目中...', progressPercent: 10 });
      let done = 0, failed = 0;
      // 并发 2 个，high 档每题 ~60s，9 题约 4-5 分钟
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
      if (failed > 0) wx.showToast({ title: `${failed} 题判定失败，可在报告中重试`, icon: 'none' });
      setTimeout(() => {
        wx.navigateTo({ url: `/pages/report/report?batchId=${batchData.data.batchId}` });
      }, 300);
    } catch (e) {
      console.error('[photo] submit error:', e);
      wx.hideLoading();
      this.setData({ analyzing: false });
      wx.showToast({ title: e.message || '提交失败，请重试', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
