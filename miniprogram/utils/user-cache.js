// 本地登录缓存：openid 用户信息，默认 7 天过期
const STORAGE_KEY = 'userInfo';
const CACHE_AT_KEY = 'userInfoCachedAt';
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 1 周

function isValidUser(user) {
  return !!(user && user._openid && user.nickName);
}

function clearCachedUser() {
  try {
    wx.removeStorageSync(STORAGE_KEY);
    wx.removeStorageSync(CACHE_AT_KEY);
  } catch (e) {}
}

function getCachedUser() {
  let user = null;
  let cachedAt = 0;
  try {
    user = wx.getStorageSync(STORAGE_KEY) || null;
    cachedAt = Number(wx.getStorageSync(CACHE_AT_KEY) || 0);
  } catch (e) {
    return null;
  }
  if (!isValidUser(user)) {
    clearCachedUser();
    return null;
  }
  // 无时间戳的旧缓存：视为过期，强制重登一次以写入 TTL
  if (!cachedAt || Date.now() - cachedAt > TTL_MS) {
    clearCachedUser();
    return null;
  }
  return user;
}

function setCachedUser(user) {
  if (!isValidUser(user)) return;
  try {
    wx.setStorageSync(STORAGE_KEY, user);
    wx.setStorageSync(CACHE_AT_KEY, Date.now());
  } catch (e) {}
}

module.exports = {
  TTL_MS,
  isValidUser,
  getCachedUser,
  setCachedUser,
  clearCachedUser,
};
