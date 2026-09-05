// ============ graphEngine 云函数薄入口（D1 雏形） ============
// 原则：入口只做 action 路由 + 调图，不做业务逻辑。
// D1 阶段只验证工具链：ping（探活）+ graphDemo（跑空图，不碰数据库/不调 AI）。
const { graph: demoGraph } = require('./src/graphs/demoGraph');

const success = (data = null) => ({ code: 0, data, message: 'ok' });
const fail = (code, msg) => ({ code, data: null, message: msg });

exports.main = async (event) => {
  const action = (event && event.action) || '';
  try {
    if (action === 'ping') {
      return success({ pong: true, engine: 'graphEngine', version: '0.6.0-beta', nodes: ['demo'], db: 'not-wired' });
    }
    if (action === 'graphDemo') {
      // 跑空图（不联网、不连库）
      const out = await demoGraph.invoke({ count: 0 });
      return success(out);
    }
    return fail(400, '未知 action: ' + action);
  } catch (e) {
    console.error('[graphEngine] error:', e);
    return fail(500, '引擎错误: ' + (e.message || '未知'));
  }
};
