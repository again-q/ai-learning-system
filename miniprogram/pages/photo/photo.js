const app = getApp();

Page({
  data: {
    images: [],
    submitting: false,
    progressText: '',
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

    this.setData({ submitting: true, progressText: '上传中...' });
    wx.showLoading({ title: '上传中...', mask: true });

    try {
      // 1. 逐张上传到云存储
      const fileIds = [];
      for (const file of this.data.images) {
        const ext = file.split('.').pop() || 'jpg';
        const cloudPath = `photos/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
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

      // 3. 触发诊断
      this.setData({ progressText: 'AI 分析中（预计 30-60s）...' });
      wx.showLoading({ title: 'AI 分析中...', mask: true });
      const diagRes = await wx.cloud.callFunction({
        name: 'diagnose',
        data: { batchId: batchData.data.batchId },
      });
      const diagData = diagRes.result;
      if (diagData.code !== 0) throw new Error(diagData.message);

      // 4. 跳转报告页
      wx.hideLoading();
      wx.navigateTo({ url: `/pages/report/report?batchId=${batchData.data.batchId}` });
    } catch (e) {
      console.error('[photo] submit error:', e);
      wx.hideLoading();
      wx.showToast({ title: e.message || '提交失败，请重试', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
