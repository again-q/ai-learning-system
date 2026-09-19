'use strict';
// ============ D4 · 单题判定图（8 节点串行） ============
// 拓扑：N0 取题 → N1 翻旧账 → N2 AI 判定 → N3 纯程序整理 → N4 写题 → N5 掌握度 → N6 RAG 记录 → N7 批次进度
// 设计：doc/architecture/判定节点设计-单题判定图（D4）.md
// 红线：不 require judgeOne 任何文件；不改 prompt/阈值；N6/N7 失败降级不阻塞
const { StateGraph, START, END, Annotation } = require('@langchain/langgraph');

const { createLoadQuestionNode } = require('../nodes/loadQuestion');
const { createRagLookupNode } = require('../nodes/ragLookup');
const { createJudgeAINode } = require('../nodes/judgeAI');
const { createNormalizeQuestionNode } = require('../nodes/normalizeQuestion');
const { createPersistQuestionNode } = require('../nodes/persistQuestion');
const { createUpdateMasteryNode } = require('../nodes/updateMastery');
const { createRagLogNode } = require('../nodes/ragLog');
const { createBatchProgressNode } = require('../nodes/batchProgress');

const NODES = {
  n0: 'N0_loadQuestion',
  n1: 'N1_ragLookup',
  n2: 'N2_judgeAI',
  n3: 'N3_normalize',
  n4: 'N4_persistQuestion',
  n5: 'N5_updateMastery',
  n6: 'N6_ragLog',
  n7: 'N7_batchProgress',
};

const keep = (fallback) => Annotation({ reducer: (a, b) => (b === undefined ? a : b), default: () => fallback });

const JudgeState = Annotation.Root({
  questionId: keep(null),
  openid: keep(null),
  providedAnswer: keep(null),
  question: keep(null),
  ragContext: keep(''),
  raw: keep(null),
  clamped: keep(null),
  derived: keep(null),
  mastery: keep(null),
  questionPatch: keep(null),
  // 非致命问题（降级/回退都进来，不静默；影子对比 D5 也要看这个）
  issues: Annotation({ reducer: (a, b) => (a || []).concat(b || []), default: () => [] }),
});

// 图出口：前端读的字段（judgeOne/index.js:782-799 同款）
function buildNewDiagnosis(raw, clamped, question) {
  const r = raw || {};
  const c = clamped || {};
  return {
    correctAnswer: r.correctAnswer || '',
    referenceProcess: Array.isArray(r.referenceProcess) ? r.referenceProcess : [],
    questionCategory: r.questionCategory || '无法归类',
    difficultyLevel: r.level || 'L4',
    difficultyValue: c.D,
    processScore: c.P,
    pathQuality: c.eta,
    knowledgeNodeName: r.knowledgeNodeName || '',
    fiveDim: r.fiveDim || null,
    segments: Array.isArray(r.segments) ? r.segments : [],
    breakpoint: r.breakpoint || null,
    processAvailable: r.processAvailable === true,
  };
}

// until：截断拓扑（D5 影子对比用，只跑到某节点，后续写库节点不执行）
function createJudgeGraph(deps, { until } = {}) {
  const d = deps || {};
  const rag = d.rag;
  // 截断时只注册用到的节点：LangGraph 会校验「不可达节点」并编译失败
  const defs = [
    [NODES.n0, () => createLoadQuestionNode({ db: d.db })],
    [NODES.n1, () => createRagLookupNode({ rag })],
    [NODES.n2, () => createJudgeAINode({ cloud: d.cloud, postJSON: d.postJSON, config: d.config, kg: d.kg, logger: d.logger })],
    [NODES.n3, () => createNormalizeQuestionNode()],
    [NODES.n4, () => createPersistQuestionNode({ db: d.db })],
    [NODES.n5, () => createUpdateMasteryNode({ db: d.db, kg: d.kg })],
    [NODES.n6, () => createRagLogNode({ db: d.db, rag, embed: d.embed, now: d.now, logger: d.logger })],
    [NODES.n7, () => createBatchProgressNode({ db: d.db, now: d.now, logger: d.logger })],
  ];
  const last = until ? defs.findIndex(([name]) => name === until) : defs.length - 1;
  if (last < 0) throw new Error('createJudgeGraph: 未知 until=' + until);
  const use = defs.slice(0, last + 1);
  const graph = new StateGraph(JudgeState);
  for (const [name, make] of use) graph.addNode(name, make());
  graph.addEdge(START, use[0][0]);
  for (let i = 0; i < use.length - 1; i++) graph.addEdge(use[i][0], use[i + 1][0]);
  graph.addEdge(use[use.length - 1][0], END);
  return graph.compile();
}

// 跑一张图 = 一次单题判定；返回 judgeOne 同款响应壳 {code,data,message} + 内部 state（D5 影子对比用）
async function runJudge(deps, input) {
  try {
    const graph = createJudgeGraph(deps, { until: (input || {}).until });
    const out = await graph.invoke({
      questionId: (input || {}).questionId,
      openid: (input || {}).openid,
      providedAnswer: (input || {}).providedAnswer || null,
    });
    return {
      ok: true,
      response: { code: 0, message: 'ok', data: { questionId: out.questionId, newDiagnosis: buildNewDiagnosis(out.raw, out.clamped, out.question) } },
      state: out,
    };
  } catch (e) {
    // 失败必须留痕：云函数日志里要能看到真实原因（否则只剩 500「判定失败」无法排查）
    console.error('[judgeGraph] 判定失败:', (e && e.stack) || e);
    const code = e && e.code ? e.code : 500;
    return { ok: false, response: { code, message: code === 500 ? '判定失败，请重试' : (e.message || '判定失败'), data: null }, error: e };
  }
}

module.exports = { createJudgeGraph, runJudge, buildNewDiagnosis, JudgeState, NODES };
