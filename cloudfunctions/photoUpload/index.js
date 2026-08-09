const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 统一响应格式（与 userLogin 一致）
const success = (data = null) => ({ code: 0, data, message: 'ok' });
const fail = (code, msg) => ({ code, data: null, message: msg });

exports.main = async (event) => {
  try {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    if (!openid) return fail(401, '未登录');

    const { files } = event;

    // 边界校验（BR-001：一批最多 9 张）
    if (!files || files.length === 0) return fail(40002, '请选择照片');
    if (files.length > 9) return fail(40001, '最多9张照片');

    // 逐张上传到云存储（文件名校验）
    const fileIds = [];
    for (const file of files) {
      const name = (file.name || '').toLowerCase();
      if (!/\.(jpg|jpeg|png|webp)$/i.test(name)) {
        return fail(40004, `不支持的文件格式: ${name || '未知'}`);
      }
      const cloudPath = `photos/${openid}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
      const upRes = await cloud.uploadFile({
        cloudPath,
        fileContent: file.content || file.fileContent || file,
      });
      fileIds.push(upRes.fileID);
    }

    // 登记批次（batches 集合）
    const batch = {
      _openid: openid,
      userId: openid,
      imageCount: fileIds.length,
      status: 'pending',
      createdAt: db.serverDate(),
    };
    const batchRes = await db.collection('batches').add({ data: batch });

    return success({
      batchId: batchRes._id,
      imageCount: fileIds.length,
      fileIds,
    });
  } catch (e) {
    console.error('[photoUpload] error:', e);
    return fail(500, '上传失败，请重试');
  }
};
