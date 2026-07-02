const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  try {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    const { nickName, avatarUrl, grade } = event;

    // 查用户
    const userRes = await db.collection('users').where({
      _openid: openid
    }).get();

    if (userRes.data.length > 0) {
      // 已存在 → 更新信息
      const user = userRes.data[0];
      const updateData = {
        lastLogin: db.serverDate()
      };
      if (nickName) updateData.nickName = nickName;
      if (avatarUrl) updateData.avatarUrl = avatarUrl;
      if (grade) updateData.grade = grade;

      await db.collection('users').doc(user._id).update({
        data: updateData
      });

      return {
        code: 0,
        data: {
          ...user,
          nickName: nickName || user.nickName,
          avatarUrl: avatarUrl || user.avatarUrl,
          grade: grade || user.grade || ''
        }
      };
    } else {
      // 新用户 → 创建
      const now = db.serverDate();
      const newUser = {
        _openid: openid,
        nickName: nickName || '同学',
        avatarUrl: avatarUrl || '',
        grade: grade || 'junior_to_senior',
        subjects: ['数学', '英语'],
        createdAt: now,
        lastLogin: now,
        currentStreak: 1,
        longestStreak: 1,
        lastStudyDate: '',
        totalStudyMinutes: 0,
        kOverall: 0,
        aOverall: 0,
        tOverall: 0,
        sOverall: 0,
        qOverall: 0,
        subjectStats: {}
      };
      const res = await db.collection('users').add({ data: newUser });
      return {
        code: 0,
        data: { ...newUser, _id: res._id }
      };
    }
  } catch (err) {
    console.error('[userLogin] error:', err);
    return {
      code: -1,
      message: '登录失败，请重试'
    };
  }
};
