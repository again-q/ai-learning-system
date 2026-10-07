'use strict';
// updateMastery 的记账行为单测（决策 052 / 063）
// 跑法：node --test test/updateMastery.test.js
const test = require('node:test');
const assert = require('node:assert');
const { updateMastery } = require('../src/lib/updateMastery');

/** 最小假 db：记录 node_requests 与 knowledge_progress / unit_progress 的写入 */
function fakeDb() {
  const log = { requests: [], kp: [], up: [], unitLogs: [] };
  const db = {
    serverDate: () => new Date(),
    collection: (c) => ({
      where: () => ({ limit: () => ({ get: async () => ({ data: [] }) }) }),
      add: async ({ data }) => {
        if (c === 'node_requests') log.requests.push(data.name);
        if (c === 'knowledge_progress') log.kp.push(data);
        if (c === 'unit_progress') log.up.push(data);
        if (c === 'unit_logs') log.unitLogs.push(data);
      },
      doc: () => ({ update: async () => {}, remove: async () => {} }),
    }),
  };
  return { db, log };
}

function deps(over) {
  return Object.assign({
    matchKnowledgeNode: async () => null,
    findNode: async () => null,
    unitNameOf: () => null,
    derived: {},
    openid: 'u1',
    questionId: 'q1',
    question: {},
    raw: {},
    clamped: { P: 0.5, D: 0.5 },
  }, over || {});
}

// 回归：知识点匹配方案 §6.1 —— rule/skill 类错误涉及的新知识点也必须进待建队列
test('图谱缺口：rule 类错误 + 未匹配知识点 → 仍登记 node_requests（旧实现漏掉）', async () => {
  const { db, log } = fakeDb();
  await updateMastery(deps({
    db,
    matchKnowledgeNode: async (n) => { log.requests.push('MATCH:' + n); return null; },
    raw: { errorLevel: 'rule', knowledgeUsage: [{ name: '图谱里没有的点', P: 0.5, D: 0.8 }] },
    clamped: { P: 0.5, D: 0.8 },
  }));
  assert.deepStrictEqual(log.requests, ['MATCH:图谱里没有的点'],
    'rule 错也要走匹配（否则图谱缺口被系统性漏掉）');
});

test('图谱缺口：skill 类错误同样要走匹配', async () => {
  const { db, log } = fakeDb();
  await updateMastery(deps({
    db,
    matchKnowledgeNode: async (n) => { log.requests.push('MATCH:' + n); return null; },
    raw: { errorLevel: 'skill', knowledgeUsage: [{ name: '计算点', P: 0, D: 0.3 }] },
    clamped: { P: 0, D: 0.3 },
  }));
  assert.deepStrictEqual(log.requests, ['MATCH:计算点']);
});

// K 记账：只有 P=1 或 concept 错才进 K，rule/skill 不进
test('K 记账：P=1 → 记 attempts+1 且 correctCount+1', async () => {
  const { db, log } = fakeDb();
  await updateMastery(deps({
    db,
    matchKnowledgeNode: async () => 'node1',
    raw: { errorLevel: null, knowledgeUsage: [{ name: '交集', P: 1, D: 0.3 }] },
    clamped: { P: 1, D: 0.3 },
  }));
  assert.strictEqual(log.kp.length, 1);
  assert.strictEqual(log.kp[0].attempts, 1);
  assert.strictEqual(log.kp[0].correctCount, 1);
  assert.strictEqual(log.kp[0].algorithm, 'hit_rate_v1');
});

test('K 记账：concept 错 → 进 K 但 correctCount 不加', async () => {
  const { db, log } = fakeDb();
  await updateMastery(deps({
    db,
    matchKnowledgeNode: async () => 'node1',
    raw: { errorLevel: 'concept', knowledgeUsage: [{ name: '空集', P: 0, D: 0.4 }] },
    clamped: { P: 0, D: 0.4 },
  }));
  assert.strictEqual(log.kp.length, 1);
  assert.strictEqual(log.kp[0].attempts, 1);
  assert.strictEqual(log.kp[0].correctCount, 0, 'concept 错算失败（分母+1，分子不加）');
});

test('K 记账：rule 错 → 不进 K（分母分子都不动）', async () => {
  const { db, log } = fakeDb();
  await updateMastery(deps({
    db,
    matchKnowledgeNode: async () => 'node1',
    raw: { errorLevel: 'rule', knowledgeUsage: [{ name: '分类', P: 0.5, D: 0.4 }] },
    clamped: { P: 0.5, D: 0.4 },
  }));
  assert.strictEqual(log.kp.length, 0, 'rule 错归 A，不进 K');
});

// A 记账（决策 063）：多个单元全部记账
test('A 记账：一道题涉及多个单元 → 每个单元都记账（旧实现只记第一个）', async () => {
  const { db, log } = fakeDb();
  await updateMastery(deps({
    db,
    matchKnowledgeNode: async () => null,
    findNode: async (n) => ({ name: n }),
    unitNameOf: (node) => (node && node.name === '交集' ? '第一章 集合' : '第二章 不等式'),
    raw: { errorLevel: 'rule', knowledgeUsage: [{ name: '交集', P: 0.5, D: 0.6 }, { name: '不等式', P: 0.5, D: 0.6 }] },
    clamped: { P: 0.5, D: 0.6 },
  }));
  const units = log.up.map((x) => x.unitName).sort();
  assert.deepStrictEqual(units, ['第一章 集合', '第二章 不等式'], '两个单元都要记账');
});

test('A 记账：落库走 063 口径（algorithm=au063_v1 + λ 字段）', async () => {
  const { db, log } = fakeDb();
  await updateMastery(deps({
    db,
    findNode: async () => ({ name: '交集' }),
    unitNameOf: () => '第一章 集合',
    raw: { errorLevel: null, knowledgeUsage: [{ name: '交集', P: 1, D: 0.82 }] },
    clamped: { P: 1, D: 0.82 },
  }));
  assert.strictEqual(log.up.length, 1);
  const p = log.up[0];
  assert.strictEqual(p.algorithm, 'au063_v1');
  assert.ok(p.lambdaA > 0 && p.lambdaU > p.lambdaA, 'λ 字段应写入且满足 A ≤ U');
  assert.ok(p.aLevel && p.uLevel, '档位显示字段应写入');
});

test('A 记账：skill 错不更新 A（宪法 §8.1：skill 归 S）', async () => {
  const { db, log } = fakeDb();
  await updateMastery(deps({
    db,
    findNode: async () => ({ name: '交集' }),
    unitNameOf: () => '第一章 集合',
    raw: { errorLevel: 'skill', knowledgeUsage: [{ name: '交集', P: 0, D: 0.5 }] },
    clamped: { P: 0, D: 0.5 },
  }));
  assert.strictEqual(log.up.length, 0, 'skill 不进 A');
});

// 2026-10-07：A 的变更日志（报告页要显示「这次做题 A 变了多少」，没有 before 就算不出）
test('A 变更日志：每次 A 更新都要记 before → after（含档位名）', async () => {
  const { db, log } = fakeDb();
  await updateMastery(deps({
    db,
    findNode: async () => ({ name: '交集' }),
    unitNameOf: () => '第一章 集合',
    raw: { errorLevel: null, knowledgeUsage: [{ name: '交集', P: 1, D: 0.82 }] },
    clamped: { P: 1, D: 0.82 },
  }));
  assert.strictEqual(log.unitLogs.length, 1, '每个单元记一条 A 变更');
  const l = log.unitLogs[0];
  assert.strictEqual(l.unitName, '第一章 集合');
  assert.strictEqual(l.triggerQuestionId, 'q1', '要能按题号回溯（报告按本批题号聚合）');
  assert.ok(l.oldLambdaA != null && l.newLambdaA != null, 'before/after 的 A 都要有');
  assert.ok(l.oldLambdaU != null && l.newLambdaU != null, 'before/after 的 U 都要有');
  // 档位名在写入时算好 —— reportService 跨云函数拿不到 levelNameOfLambda
  assert.ok(l.oldALevel && l.newALevel, 'A 档位名要落库');
  assert.ok(l.oldULevel && l.newULevel, 'U 档位名要落库');
});

test('A 变更日志：skill 错不写日志（与不更新 A 一致）', async () => {
  const { db, log } = fakeDb();
  await updateMastery(deps({
    db,
    findNode: async () => ({ name: '交集' }),
    unitNameOf: () => '第一章 集合',
    raw: { errorLevel: 'skill', knowledgeUsage: [{ name: '交集', P: 0, D: 0.5 }] },
    clamped: { P: 0, D: 0.5 },
  }));
  assert.strictEqual(log.unitLogs.length, 0, 'skill 既不更新 A 也不写 A 日志');
});

test('降级：内部抛错不冒泡（失败不阻塞主流程）', async () => {
  const bad = {
    collection: () => { throw new Error('db 挂了'); },
    serverDate: () => new Date(),
  };
  const r = await updateMastery(deps({ db: bad }));
  assert.ok(r && typeof r === 'object', '应返回对象而不是抛错');
});
