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

    const { fileIds } = event;

    // 边界校验（BR-001：一批最多 9 张）
    if (!fileIds || fileIds.length === 0) return fail(40002, '请选择照片');
    if (fileIds.length > 9) return fail(40001, '最多9张照片');

    // 校验 fileID 格式 + 归属（P1-A：必须含本人路径前缀，防越权读取他人照片）
    for (const id of fileIds) {
      if (typeof id !== 'string' || !id.startsWith('cloud://')) {
        return fail(40004, `无效的文件标识: ${id}`);
      }
      if (!id.includes(`/photos/${openid}/`)) {
        return fail(40004, '文件标识不属于当前用户');
      }
    }

    // 登记批次（batches 集合）——fileIds 随批次存储，供 diagnose 读取
    const batch = {
      _openid: openid,
      userId: openid,
      imageCount: fileIds.length,
      fileIds,
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
