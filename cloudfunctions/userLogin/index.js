const cloud = require('wx-server-sdk');
cloud.init();
const db = cloud.database();

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { nickName, avatarUrl } = event;

  // 查用户
  const userRes = await db.collection('users').where({
    _openid: openid
  }).get();

  if (userRes.data.length > 0) {
    // 已存在 → 更新信息
    const user = userRes.data[0];
    await db.collection('users').doc(user._id).update({
      data: {
        nickName: nickName || user.nickName,
        avatarUrl: avatarUrl || user.avatarUrl,
        lastLogin: db.serverDate()
      }
    });
    return {
      ...user,
      nickName: nickName || user.nickName,
      avatarUrl: avatarUrl || user.avatarUrl
    };
  } else {
    // 新用户 → 创建
    const newUser = {
      _openid: openid,
      nickName: nickName,
      avatarUrl: avatarUrl || '',
      subjects: ['数学', '英语'],
      createdAt: db.serverDate(),
      lastLogin: db.serverDate(),
      streak: 1,
      totalTime: 0
    };
    const res = await db.collection('users').add({ data: newUser });
    return { ...newUser, _id: res._id };
  }
};
