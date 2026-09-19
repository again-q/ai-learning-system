'use strict';
const test = require('node:test');
const assert = require('node:assert');

const { createRagTools, cosine, buildReportText } = require('../src/lib/ragTools.js');

// 极简 fake db：只支持 collection().where().orderBy().limit().get()
function fakeDb(rows) {
  const seen = {};
  return {
    seen,
    collection(name) {
      seen.name = name;
      const q = { where: (w) => (seen.where = w, q), orderBy: (f, d) => (seen.orderBy = [f, d], q), limit: (n) => (seen.limit = n, q), get: async () => ({ data: rows }) };
      return q;
    },
  };
}

test('cosine: 同向量=1，正交=0', () => {
  assert.strictEqual(cosine([1, 2, 3], [1, 2, 3]).toFixed(4), '1.0000');
  assert.strictEqual(cosine([1, 0], [0, 1]).toFixed(4), '0.0000');
});

test('searchHistory: 排序 + topK + 过滤无 embedding/无 reportText', async () => {
  const rows = [
    { embedding: [1, 0, 0], reportText: 'A题', report: { isCorrect: true } },
    { embedding: [0.9, 0.1, 0], reportText: 'B题', report: { isCorrect: false } },
    { embedding: [0, 1, 0], reportText: 'C题', report: { isCorrect: true } },
    { embedding: [], reportText: 'D题' },
    { reportText: 'E题' },
    { embedding: [1, 1, 1], reportText: '' },
  ];
  const db = fakeDb(rows);
  const tools = createRagTools({ db, embed: async () => [1, 0, 0] });
  const hits = await tools.searchHistory('题干', 'u1');
  assert.strictEqual(db.seen.name, 'mastery_logs');
  assert.deepStrictEqual(db.seen.where, { userId: 'u1' });
  assert.deepStrictEqual(db.seen.orderBy, ['createdAt', 'desc']);
  assert.strictEqual(db.seen.limit, 200);
  assert.strictEqual(hits.length, 3);
  assert.deepStrictEqual(hits.map((h) => h.reportText), ['A题', 'B题', 'C题']);
  assert.strictEqual(hits[0].score.toFixed(4), '1.0000');
  assert.strictEqual(hits[1].isCorrect, false);
});

test('searchHistory: embed 抛错 → 返回 []，不阻断', async () => {
  const tools = createRagTools({ db: fakeDb([]), embed: async () => { throw new Error('网络炸了'); }, logger: { warn() {} } });
  assert.deepStrictEqual(await tools.searchHistory('x', 'u'), []);
  const t2 = createRagTools({ db: { collection() { throw new Error('db 炸了'); } }, embed: async () => [1], logger: { warn() {} } });
  assert.deepStrictEqual(await t2.searchHistory('x', 'u'), []);
});

test('buildRagContext: 空命中 → 空串；命中 → 线上同款文案', () => {
  const tools = createRagTools({ db: fakeDb([]), embed: async () => [1] });
  assert.strictEqual(tools.buildRagContext([]), '');
  const ctx = tools.buildRagContext([{ reportText: '题目X | 判定：错', isCorrect: false, score: 0.8231 }]);
  assert.strictEqual(ctx, '[历史参考 1] 题目：题目X | 判定：错（当时判定：错，相似度 0.82）');
});

test('buildReportText: 全字段与最小字段', () => {
  const full = buildReportText({
    questionText: '题干', studentAnswer: '答案', isCorrect: false, questionCategory: '函数',
    difficultyLevel: 'L5', knowledgeNodeName: '函数的单调性', errorDimension: 'K',
    errorAttribution: '分类讨论遗漏B={-2}', breakpoint: { index: 2, nature: '中途断' },
    knowledgeUsage: [{ name: '单调性', P: 0.5 }, { name: '定义域', P: 0 }],
  });
  assert.strictEqual(full, '题目：题干 | 作答：答案 | 判定：错 | 题型：函数 | 难度：L5 | 知识点：函数的单调性 | 归因维度：K | 归因：分类讨论遗漏B={-2} | 断点：第2段 中途断 | 知识点使用：单调性(P=0.5)、定义域(P=0)');
  const min = buildReportText({ questionText: '题干', isCorrect: true });
  assert.strictEqual(min, '题目：题干 | 作答： | 判定：对 | 题型： | 难度： | 知识点：');
});
