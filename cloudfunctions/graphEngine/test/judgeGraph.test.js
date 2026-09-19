'use strict';
const test = require('node:test');
const assert = require('node:assert');

const { runJudge } = require('../src/graphs/judgeGraph.js');

// ============ 假依赖：内存 db（记录所有读/写）+ 固定 raw 的假 llm ============
function createFakeDb({ seed = {}, failOn = null } = {}) {
  const writes = [];
  const reads = [];
  const table = (name) => (seed[name] = seed[name] || []);
  return {
    writes, reads,
    serverDate: () => 'SERVER_DATE',
    collection(name) {
      return {
        _where: null, _limit: null,
        where(w) { this._where = w; return this; },
        orderBy() { return this; },
        limit(n) { this._limit = n; return this; },
        async get() {
          reads.push({ name, where: this._where, limit: this._limit });
          const rows = table(name);
          const w = this._where;
          return { data: w ? rows.filter((r) => Object.keys(w).every((k) => r[k] === w[k])) : rows };
        },
        doc(id) {
          return {
            async get() { reads.push({ name, id }); return { data: table(name).find((r) => r._id === id) || null }; },
            async update({ data }) {
              if (failOn === name + '.update') throw new Error('fake ' + name + ' update 炸了');
              writes.push({ name, id, data });
            },
            async remove() { writes.push({ name, id, remove: true }); },
          };
        },
        async add({ data }) {
          if (failOn === name + '.add') throw new Error('fake ' + name + ' add 炸了');
          writes.push({ name, data });
          return { _id: 'new_' + writes.length };
        },
      };
    },
  };
}

const RAW = {
  index: 1, questionType: '解答', level: 'L5', D: 0.6, P: 0.5, eta: 0.7,
  errorType: '过程风险', errorLevel: 'rule', errorAttribution: '分类讨论遗漏B={-2}',
  knowledgeNodeName: '函数的单调性', knowledgeUsage: [{ name: '函数的单调性', P: 0.5, D: 0.5 }],
  fiveDim: { K: 0.5, A: 0.5, T: 0.5, Q: 0.5, S: 0.5 },
  pattern: { domain: '函数', pattern: '含参不等式恒成立', variant: '分离参数' },
  segments: [{ step: '第一步：化简', status: '通', evidence: 'x>1' }],
  breakpoint: { index: 1, nature: '中途断' }, processAvailable: true,
  correctAnswer: 'a>1', referenceProcess: [{ step: '第一步：化简', content: 'x>1', note: '去分母' }],
  questionCategory: '函数与导数',
};

function seedQuestion(over = {}) {
  return {
    questions: [{ _id: 'q1', userId: 'u1', batchId: 'b1', questionType: '解答', studentAnswer: 'x>1', questionText: '题干原文', traceReport: '痕迹原文', ...over }],
    batches: [{ _id: 'b1', progress: { done: 0, total: 2 } }],
  };
}

function makeDeps({ raw = RAW, db, postJSON, failOn } = {}) {
  return {
    db: db || createFakeDb({ seed: seedQuestion(), failOn }),
    rag: {
      searchHistory: async () => [{ reportText: '历史题报告', isCorrect: true, score: 0.9 }],
      buildRagContext: (hits) => (hits.length ? '[历史参考 1] ' + hits[0].reportText : ''),
      buildReportText: (r) => 'RT:' + r.questionText,
    },
    postJSON: postJSON || (async () => ({ choices: [{ message: { content: JSON.stringify(raw) } }] })),
    config: { dsBaseUrl: 'http://ds', dsModel: 'm', dsApiKey: 'k', qwenBaseUrl: 'http://q', qwenApiKey: 'k', qwenVlModel: 'vl' },
    kg: { buildNodeNames: async () => '【知识点节点清单】', matchKnowledgeNode: async () => 'kn1', findNode: async () => null, unitNameOf: () => null },
    embed: async () => [0.1, 0.2],
    now: () => 'NOW',
  };
}

const INPUT = { questionId: 'q1', openid: 'u1' };

test('N4 写库：19 个字段齐全且值正确；出口 newDiagnosis 字段齐全', async () => {
  const deps = makeDeps();
  const out = await runJudge(deps, INPUT);
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.response.code, 0);
  const qWrites = out.state;
  const upd = deps.db.writes.find((w) => w.name === 'questions');
  const p = upd.data;
  assert.strictEqual(Object.keys(p).length, 19);
  assert.deepStrictEqual(Object.keys(p).sort(), ['breakpoint','correctAnswer','difficultyLevel','difficultyValue','errorAttribution','errorLevel','errorType','fiveDim','knowledgeNodeName','knowledgeUsage','pathQuality','pattern','processAvailable','processScore','questionCategory','questionType','referenceProcess','reviewed','segments']);
  assert.strictEqual(p.questionType, '解答');
  assert.strictEqual(p.correctAnswer, 'a>1');
  assert.deepStrictEqual(p.referenceProcess, RAW.referenceProcess);
  assert.strictEqual(p.questionCategory, '函数与导数');
  assert.strictEqual(p.difficultyLevel, 'L5');
  assert.strictEqual(p.difficultyValue, 0.6);
  assert.strictEqual(p.processScore, 0.5);
  assert.strictEqual(p.pathQuality, 0.7);
  assert.strictEqual(p.errorType, '过程风险');
  assert.strictEqual(p.errorLevel, 'rule');
  // P>=0.5 时不给归因（judgeOne:632-634 同款规则：有分就不解释原因）
  assert.strictEqual(p.errorAttribution, null);
  assert.strictEqual(p.pattern, '函数 / 含参不等式恒成立 / 分离参数');
  assert.strictEqual(p.knowledgeNodeName, '函数的单调性');
  assert.strictEqual(p.knowledgeUsage.length, 1);
  assert.deepStrictEqual(p.fiveDim, RAW.fiveDim);
  assert.deepStrictEqual(p.segments, RAW.segments);
  assert.deepStrictEqual(p.breakpoint, RAW.breakpoint);
  assert.strictEqual(p.processAvailable, true);
  assert.strictEqual(p.reviewed, true);
  // 出口
  const nd = out.response.data.newDiagnosis;
  assert.deepStrictEqual(Object.keys(nd).sort(), ['breakpoint','correctAnswer','difficultyLevel','difficultyValue','fiveDim','knowledgeNodeName','pathQuality','processAvailable','processScore','questionCategory','referenceProcess','segments']);
  assert.strictEqual(nd.processScore, 0.5);
  assert.strictEqual(nd.pathQuality, 0.7);
  // 全链路无降级
  assert.deepStrictEqual(out.state.issues, []);
  // RAG 上下文进了 prompt（N1 有产出）
  assert.strictEqual(out.state.ragContext, '[历史参考 1] 历史题报告');
  // N6 写了 mastery_logs，N7 推进批次
  // 注：updateMastery（N5）也会往 mastery_logs 写 K 记录，这里按 algorithm 取 N6 的那条
  const log = deps.db.writes.filter((w) => w.name === 'mastery_logs').find((w) => w.data.algorithm === 'diagnose_v1');
  assert.strictEqual(log.data.reportText, 'RT:题干原文');
  assert.strictEqual(log.data.algorithm, 'diagnose_v1');
  assert.deepStrictEqual(log.data.embedding, [0.1, 0.2]);
  assert.strictEqual(log.data.createdAt, 'NOW');
  const batch = deps.db.writes.filter((w) => w.name === 'batches');
  assert.deepStrictEqual(batch[0].data.progress, { done: 1, total: 2 });
  // P<0.5 时归因照常落库
  const low = makeDeps({ raw: { ...RAW, P: 0.3, errorType: '结果错' } });
  await runJudge(low, INPUT);
  assert.strictEqual(low.db.writes.find((w) => w.name === 'questions').data.errorAttribution, '分类讨论遗漏B={-2}');
});

test('空白题：归因由代码推导为「整题空白未下笔」，不采信模型解释', async () => {
  const raw = { ...RAW, P: 0.2, errorType: '结果错', errorAttribution: '未理解函数的单调性', breakpoint: { index: 1, nature: '起步即停' }, segments: [] };
  const deps = makeDeps({ raw, db: createFakeDb({ seed: seedQuestion({ studentAnswer: '' }) }) });
  const out = await runJudge(deps, INPUT);
  const p = deps.db.writes.find((w) => w.name === 'questions').data;
  assert.strictEqual(p.errorAttribution, '整题空白未下笔');
  assert.strictEqual(out.response.code, 0);
});

test('选填题：模型给「过程风险」也不允许（线上 judgeOne:638 const 重赋值会抛 TypeError，新图修正）', async () => {
  const raw = { ...RAW, questionType: '选择', processAvailable: false, errorType: '过程风险', P: 1, segments: [], breakpoint: null };
  const deps = makeDeps({ raw });
  const out = await runJudge(deps, INPUT);
  assert.strictEqual(out.response.code, 0);
  const p = deps.db.writes.find((w) => w.name === 'questions').data;
  assert.strictEqual(p.errorType, '无');
  const raw2 = { ...raw, P: 0.3 };
  const out2 = await runJudge(makeDeps({ raw: raw2 }), INPUT);
  assert.strictEqual(out2.response.code, 0);
  assert.strictEqual(out2.state.derived.errorType, '结果错');
});

test('N6 写 mastery_logs 失败 → 主流程仍成功且 issues 有记录', async () => {
  const deps = makeDeps({ failOn: 'mastery_logs.add' });
  const out = await runJudge(deps, INPUT);
  assert.strictEqual(out.response.code, 0);
  assert.ok(out.state.issues.some((s) => s.startsWith('N6:')), 'issues 应记录 N6 降级: ' + JSON.stringify(out.state.issues));
  // 判定与批次进度不受影响
  assert.ok(deps.db.writes.find((w) => w.name === 'questions'));
  assert.ok(deps.db.writes.find((w) => w.name === 'batches'));
});

test('N7 批次更新失败 / 批次不存在 → 主流程仍成功且降级', async () => {
  const deps = makeDeps({ failOn: 'batches.update' });
  const out = await runJudge(deps, INPUT);
  assert.strictEqual(out.response.code, 0);
  assert.ok(out.state.issues.some((s) => s.startsWith('N7:')), JSON.stringify(out.state.issues));
  const noBatch = makeDeps({ db: createFakeDb({ seed: { questions: seedQuestion().questions } }) });
  const out2 = await runJudge(noBatch, INPUT);
  assert.strictEqual(out2.response.code, 0);
  assert.deepStrictEqual(out2.state.issues, []);
});

test('N0 归属校验：他人题目 → code 403', async () => {
  const deps = makeDeps({ db: createFakeDb({ seed: seedQuestion({ userId: 'u2' }) }) });
  const out = await runJudge(deps, INPUT);
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.response.code, 403);
  assert.strictEqual(out.response.message, '无权操作他人题目');
  assert.strictEqual(out.response.data, null);
  assert.deepStrictEqual(deps.db.writes, []);
  const out2 = await runJudge(makeDeps(), { questionId: '', openid: 'u1' });
  assert.strictEqual(out2.response.code, 400);
  const out3 = await runJudge(makeDeps({ db: createFakeDb({ seed: {} }) }), INPUT);
  assert.strictEqual(out3.response.code, 404);
});

test('until：截断到 N3（影子对比模式）→ 一个库都不写', async () => {
  const deps = makeDeps();
  const out = await runJudge(deps, { ...INPUT, until: 'N3_normalize' });
  assert.strictEqual(out.response.code, 0);
  assert.deepStrictEqual(deps.db.writes, []);
  assert.deepStrictEqual(deps.db.reads.map((r) => r.name), ['questions']);
  assert.strictEqual(out.state.clamped.P, 0.5);
  assert.strictEqual(out.state.derived.errorType, '过程风险');
  assert.strictEqual(out.response.data.newDiagnosis.processScore, 0.5);
});

test('N2 解析：模型答案带前后文时靠括号配平取 JSON', async () => {
  const postJSON = async () => ({ choices: [{ message: { content: '先想一下…\n' + JSON.stringify(RAW) + '\n以上。' } }] });
  const deps = makeDeps({ postJSON });
  const out = await runJudge(deps, INPUT);
  assert.strictEqual(out.response.code, 0);
  assert.strictEqual(out.state.raw.level, 'L5');
});
