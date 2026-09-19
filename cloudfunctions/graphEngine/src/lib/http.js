'use strict';
// D4 原子工具：模型 HTTP 调用（judgeOne/index.js:238-251 搬迁，含 token 用量日志）
function createPostJSON({ logger } = {}) {
  const log = (logger && logger.log) ? logger.log.bind(logger) : console.log;
  return async function postJSON(url, body, key) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status + ': ' + (await resp.text()).slice(0, 300));
    const data = await resp.json();
    const u = (data && data.usage) || {};
    if (u.prompt_tokens != null || u.completion_tokens != null) {
      log('[graph-cost] ' + String(url).replace(/^https?:\/\//, '').slice(0, 24) + ' prompt=' + (u.prompt_tokens || 0) + ' completion=' + (u.completion_tokens || 0));
    }
    return data;
  };
}

module.exports = { createPostJSON };
