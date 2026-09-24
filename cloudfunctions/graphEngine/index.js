// ============ graphEngine 云函数薄入口 ============
// 原则：入口只做 action 路由 + 调图，不做业务逻辑。
// action：ping（探活）｜graphDemo（D1 空图）｜judgeQuestion（D4 单题判定图，8 节点串行）
// 说明：D4 阶段小程序还不调 judgeQuestion（线上仍是 judgeOne）；这里供影子对比（D5）与真实验证调用。
// ⚠️ 必须在 require 图之前：Node 18 没有全局 Web Crypto，而 @langchain/langgraph-checkpoint
// 的 emptyCheckpoint 会直接调 crypto.randomUUID() → 不补这个 shim，图一 invoke 就报 "crypto is not defined"
// （2026-09-19 D4 真机验证踩坑：本地 Node 24 有全局 crypto，云端 Nodejs18.15 没有）
if (!globalThis.crypto) globalThis.crypto = require('node:crypto').webcrypto;

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const { graph: demoGraph } = require('./src/graphs/demoGraph');
const { runJudge } = require('./src/graphs/judgeGraph');
const { createRagTools } = require('./src/lib/ragTools');
const { createPostJSON } = require('./src/lib/http');
const { createKnowledgeTools } = require('./src/lib/knowledgeMatch');

// ============ 配置（与 judgeOne/index.js:7-17 同源） ============
const QWEN_API_KEY = process.env.QWEN_API_KEY;
const DS_API_KEY = process.env.DEEPSEEK_API_KEY;
const QWEN_BASE_URL = process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const DS_BASE_URL = process.env.DS_BASE_URL || 'https://api.deepseek.com';
const DS_MODEL = process.env.DS_MODEL || 'deepseek-v4-flash';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-v4';

const success = (data = null) => ({ code: 0, data, message: 'ok' });
const fail = (code, msg) => ({ code, data: null, message: msg });

const postJSON = createPostJSON({ logger: console });

// 依赖装配（盒子内部不建连接 → 全部从这里注入）
function buildDeps() {
  const config = {
    qwenBaseUrl: QWEN_BASE_URL,
    dsBaseUrl: DS_BASE_URL,
    dsModel: DS_MODEL,
    dsApiKey: DS_API_KEY,
    qwenApiKey: QWEN_API_KEY,
    qwenVlModel: process.env.QWEN_VL_MODEL || 'qwen3.7-plus',
  };
  const embed = async (text) => {
    const data = await postJSON(QWEN_BASE_URL + '/embeddings', { model: EMBEDDING_MODEL, input: text }, QWEN_API_KEY);
    return data.data[0].embedding;
  };
  return {
    db,
    cloud,
    postJSON,
    config,
    embed,
    rag: createRagTools({ db, embed, logger: console }),
    kg: createKnowledgeTools({ db, _ }),
    logger: console,
  };
}

exports.main = async (event) => {
  const action = (event && event.action) || '';
  try {
    if (action === 'ping') {
      return success({ pong: true, engine: 'graphEngine', version: '0.6.0-beta', nodes: ['demo', 'judge(N0-N7)'], db: 'wired' });
    }
    if (action === 'graphDemo') {
      const out = await demoGraph.invoke({ count: 0 });
      return success(out);
    }
    if (action === 'judgeQuestion') {
      const wxContext = cloud.getWXContext();
      const openid = wxContext.OPENID || (event && event.userId) || null;
      if (!openid) return fail(401, '未登录');
      const out = await runJudge(buildDeps(), {
        questionId: event.questionId,
        openid,
        providedAnswer: event.providedAnswer,
        until: event.until,
      });
      if (event.debug === true && !out.ok) {
        return fail(out.response.code, out.response.message + '｜' + ((out.error && out.error.message) || '未知'));
      }
      // debug=true：把图内部状态一并回传（影子对比 D5 / 真实验证用；不影响前端契约）
      if (event.debug === true && out.ok && out.state) {
        const s = out.state;
        return success({
          ...out.response.data,
          debug: {
            clamped: s.clamped,
            derived: s.derived,
            issues: s.issues,
            ragContext: (s.ragContext || '').slice(0, 500),
            mastery: s.mastery,
            rawSummary: s.raw ? { questionType: s.raw.questionType, level: s.raw.level, D: s.raw.D, P: s.raw.P, eta: s.raw.eta, errorType: s.raw.errorType, errorLevel: s.raw.errorLevel, knowledgeNodeName: s.raw.knowledgeNodeName, pattern: s.raw.pattern, processAvailable: s.raw.processAvailable } : null,
            // D5 影子对比：回传【完整 raw】，供本机用同一份 raw 喂线上壳（derivePure）做同 raw 回放
            raw: event.includeRaw === true ? s.raw : undefined,
          },
        });
      }
      return out.response;
    }
    return fail(400, '未知 action: ' + action);
  } catch (e) {
    console.error('[graphEngine] error:', e);
    return fail(500, '引擎错误: ' + (e.message || '未知'));
  }
};
