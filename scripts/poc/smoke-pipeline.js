// 冒烟测试：judgeOne→掌握度更新(K/A) + 报告诊断生成（新 prompt+errorLevel）
const updateMastery = require('/Users/apple/Desktop/ai-learning-system/cloudfunctions/judgeOne/updateMastery.js').updateMastery;
const g = require('/Users/apple/Desktop/ai-learning-system/cloudfunctions/reportService/generateV2.js');

// ---- 内存 mock cloud db ----
const store = {}; // { collectionName: Map(id->doc) } ; 简单起见 where 只按 userId+knowledgeNodeId 匹配
function col(name) { if (!store[name]) store[name] = {}; return store[name]; }
const db = {
  collection: (name) => ({
    where: (q) => ({
      limit: () => ({
        get: async () => {
          const rows = Object.values(col(name)).filter((d) => Object.entries(q).every(([k, v]) => (d[k] === v)));
          return { data: rows };
        },
      }),
    }),
    doc: (id) => ({
      get: async () => ({ data: col(name)[id] || null }),
      update: async ({ data }) => { col(name)[id] = { ...col(name)[id], ...data }; },
    }),
    add: async ({ data }) => { const id = 'auto_' + Math.random().toString(36).slice(2, 8); col(name)[id] = { _id: id, ...data }; return { _id: id }; },
  }),
  serverDate: () => new Date(),
};

const nodeOf = (name) => 'node:' + name;
const matchKnowledgeNode = async (name, openid) => (name ? nodeOf(name) : null);
const findNode = async (name) => (name ? { id: nodeOf(name), name } : null);
const unitNameOf = (node) => (node ? '指数函数单元' : null);

const openid = 'user1', questionId = 'q1';
const raw = {
  knowledgeNodeName: '指数函数过定点',
  knowledgeUsage: [
    { name: '指数函数', D: 0.6, P: 1 },
    { name: '特殊值/边界值', D: 0.4, P: 0.5 },
  ],
  errorDimension: 'S', errorAttribution: '漏了特殊值a=b=0', isOutOfSyllabus: false,
};
const clamped = { D: 0.6, P: 0.6, eta: 0.7 };

(async () => {
  console.log('====== ① 掌握度更新（K 知识点 + A 单元） ======');
  const m = await updateMastery({
    db, matchKnowledgeNode, findNode, unitNameOf, openid, questionId,
    question: { questionText: '已知a,b满足2026^a=2027^b,可能成立的有(多选)', traceReport: '划掉C和D,写AB' },
    raw, clamped,
  });
  console.log('pOk=' + m.pOk, 'mainNodeId=' + m.mainNodeId);
  console.log('knowledge_progress:');
  for (const [id, d] of Object.entries(store['knowledge_progress'] || {})) {
    console.log('  ' + id + ' -> sValue=' + d.sValue + ' dValue=' + d.dValue + ' mastery=' + d.mastery + ' attempts=' + d.attempts + ' correct=' + d.correctCount);
  }
  console.log('unit_progress:');
  for (const [id, d] of Object.entries(store['unit_progress'] || {})) console.log('  ' + id + ' -> aValue=' + d.aValue + ' aUpper=' + d.aUpper + ' n=' + d.n);
  console.log('mastery_logs 条数=' + Object.keys(store['mastery_logs'] || {}).length);

  console.log('\n====== ② 报告诊断生成（新 prompt + errorLevel） ======');
  const s = await g.batchSummary({ totalQuestions: 8, correctCount: 5 }, [{ topic: '指数函数过定点', errorCategory: 'concept' }]);
  console.log('首页一句话: ' + s);
  const d = await g.diagnosis({
    questionText: raw.questionText,
    traceReport: '划掉C和D,右下角写AB',
    segments: [{ step: '判断a,b关系', status: '断', evidence: '写AB' }],
    breakpoint: { index: 1, nature: '收尾断' },
    errorType: '结果错', errorLevel: 'concept', processScore: 0.6, correctAnswer: 'A、B、D',
  });
  console.log('过程点评: ' + d.comment);
  console.log('问题在哪儿: ' + d.inference);
  console.log('下一步: ' + d.hook);
})().catch((e) => { console.error('SMOKE FAIL', e); process.exit(1); });
