// cloudfunctions/cloudbase_auth/index.js
//
// 【环境共享 · 鉴权入口】—— 2026-09-27 新建
//
// 谁需要它：『我们班的生日墙』(wxff46c8329892715c) 借用了本环境（数学诊断的云开发），
//   走的是微信的「环境共享」。微信规定：使用方 c.init() 时会**先来资源方这边调这个函数**鉴权，
//   函数不存在 → 对方直接报「找不到 FunctionName」。
//   所以它必须建在**资源方（本项目/数学诊断）**里，而且名字一个字都不能改。
//
// 这个函数只干一件事：给来访的小程序发一张写明权限的通行证。
//   · 不在白名单 → 发空通行证（什么都不能干）
//   · 在白名单 → 只放开它真正需要的：两个集合（生日祝福 / 班级相册）
//
// 权限按最小给：只给 read/write，不给 delete。
// 注意：共享之后对方调用产生的开销算在资源方（本项目）头上 —— 所以白名单要收着写。
//
// 官方文档：
//   https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloud/guide/resource-sharing/introduce.html
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 允许哪些小程序来用这个环境（白名单）
const 允许的AppID = [
  'wxff46c8329892715c',   // 我们班的生日墙（资源使用方）
];

// 对方能碰的集合。只给读写，不给删 —— 想更严可以只给 read。
const 允许的集合 = [
  '生日祝福',
  '班级相册',
];

exports.main = async () => {
  const { APPID } = cloud.getWXContext();

  // 不在白名单 → 空通行证（这不是报错，是婉拒）
  if (允许的AppID.indexOf(APPID) < 0) {
    return { errcode: 0, errmsg: 'ok', auth: JSON.stringify({}) };
  }

  return {
    errcode: 0,
    errmsg: 'ok',
    auth: JSON.stringify({
      // 允许对方调的云函数：暂时一个都不给（对方不需要）
      function: [],
      // 允许对方操作的数据库集合
      db: 允许的集合.map(function (c) {
        return { collection: c, read: true, write: true };
      }),
    }),
  };
};
