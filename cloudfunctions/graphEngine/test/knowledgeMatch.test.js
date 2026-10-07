'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { pickLeafNodes, buildNodeListText } = require('../src/lib/knowledgeMatch');

// 2026-09-25 决策 052：清单只给叶子（方法类 + 父/聚合节点都不进）
const NODES = [
  { _id: 'a', knowledgeId: 'topic', name: '集合' },
  { _id: 'b', knowledgeId: 'leaf1', name: '交集', parentId: 'topic' },
  { _id: 'c', knowledgeId: 'leaf2', name: '并集', parentId: 'topic' },
  { _id: 'd', knowledgeId: 'm1', name: '求并集交集的方法', partition: 'method' },
  { _id: 'e', knowledgeId: 'm2', name: '列举子集的方法', parentId: 'topic', partition: 'method' },
];

test('pickLeafNodes：只留「知识区的叶子」', () => {
  const picked = pickLeafNodes(NODES).map((n) => n.name).sort();
  assert.deepStrictEqual(picked, ['交集', '并集']);
  assert.ok(!picked.includes('集合'), '父/聚合节点不能进清单');
  assert.ok(!picked.includes('求并集交集的方法'), '方法类不能进清单（决策 028）');
});

test('pickLeafNodes：边界（null / 空 / 无父子信息）', () => {
  assert.deepStrictEqual(pickLeafNodes(null), []);
  assert.deepStrictEqual(pickLeafNodes([]), []);
  assert.deepStrictEqual(pickLeafNodes([{ name: 'x' }]).map((n) => n.name), ['x'], '没有父子信息时全部视为叶子');
});

// 2026-09-26 决策 054：清单文本「两段式」——知识本体（记 K）在前，方法/解题路径（记 A）在后
test('buildNodeListText：两段式（本体只给叶子；方法单独一段，含同时是父节点的方法）', () => {
  const text = buildNodeListText(NODES);
  assert.ok(text.startsWith('【知识本体清单】'), '第一段必须是知识本体清单');
  assert.ok(text.includes('【方法清单（解题路径，记 A）】'), '第二段必须是方法清单');
  const [body, methods] = text.split('\n\n');
  assert.ok(body.includes('交集') && body.includes('并集'), '本体段含叶子');
  assert.ok(!body.includes('集合'), '本体段不含父/聚合节点');
  assert.ok(!body.includes('求并集交集的方法'), '本体段不含方法');
  assert.ok(methods.includes('求并集交集的方法') && methods.includes('列举子集的方法'), '方法段含全部方法节点');
  assert.ok(!methods.split('、').includes('交集'), '方法段不含知识本体（按「、」切分比对，避免子串误命中）');
});

test('buildNodeListText：重名去重；空输入只留两段标题（harness 与线上共用，文本必须稳定）', () => {
  const dup = NODES.concat([{ _id: 'x', knowledgeId: 'leaf1b', name: '交集', parentId: 'topic' }]);
  assert.strictEqual(buildNodeListText(dup), buildNodeListText(NODES), '重名去重后文本不变');
  assert.deepStrictEqual(buildNodeListText([]), '【知识本体清单】\n\n【方法清单（解题路径，记 A）】');
});
// ============ migrateProgress（2026-09-26 决策 052 修订：K 账要跟着走） ============
const { createKnowledgeTools } = require('../src/lib/knowledgeMatch');

function fakeDb(state) {
  const rows = (n) => (state[n] = state[n] || []);
  return {
    serverDate: () => 'NOW',
    collection(name) {
      const api = {
        _q: {},
        where(q) { api._q = q || {}; return api; },
        limit() { return api; },
        async get() {
          const q = api._q || {};
          return { data: rows(name).filter((r) => Object.keys(q).every((k) => r[k] === q[k])) };
        },
        doc(id) {
          return {
            async update({ data }) { Object.assign(rows(name).find((r) => r._id === id), data); },
            async remove() { state[name] = rows(name).filter((r) => r._id !== id); },
          };
        },
        async add({ data }) { rows(name).push(Object.assign({ _id: 'g' + (rows(name).length + 1) }, data)); return { _id: 'g' }; },
      };
      return api;
    },
  };
}

function setup(progress) {
  const state = {
    knowledge_nodes: [
      { knowledgeId: 'n_old', name: '交集' },
      { knowledgeId: 'n_new', name: '并集' },
    ],
    knowledge_progress: progress,
  };
  return { state, tools: createKnowledgeTools({ db: fakeDb(state) }) };
}

test('migrateProgress：用对率的账跟着走（旧实现只搬 sValue/dValue，账不搬）', async () => {
  const { state, tools } = setup([{ _id: 'p1', userId: 'u', knowledgeNodeId: 'n_old', attempts: 3, correctCount: 2, mastery: 0.67, evidence: 'ok' }]);
  await tools.migrateProgress('u', '交集', '并集', 0.5, 1);
  const old = state.knowledge_progress.find((r) => r.knowledgeNodeId === 'n_old');
  const neu = state.knowledge_progress.find((r) => r.knowledgeNodeId === 'n_new');
  assert.strictEqual(old.attempts, 2, '旧节点扣 1 次');
  assert.strictEqual(old.correctCount, 1, '旧节点扣 1 次对');
  assert.strictEqual(old.mastery, 0.5, '旧节点重算用对率 1/2');
  assert.strictEqual(neu.attempts, 1);
  assert.strictEqual(neu.correctCount, 1);
  assert.strictEqual(neu.mastery, 1, '新节点重算用对率 1/1');
  assert.strictEqual(neu.evidence, 'insufficient', '只 1 次观测 → 证据不足档');
  assert.strictEqual(neu.sValue, undefined, '新口径行不新造旧字段 sValue');
});

test('migrateProgress：新口径写出的行（无 dValue）被迁移时**不能整行删掉**（旧实现会 remove）', async () => {
  const { state, tools } = setup([{ _id: 'p1', userId: 'u', knowledgeNodeId: 'n_old', attempts: 3, correctCount: 2, mastery: 0.67, evidence: 'ok' }]);
  await tools.migrateProgress('u', '交集', '并集', 0.5, 1);
  assert.strictEqual(state.knowledge_progress.filter((r) => r.knowledgeNodeId === 'n_old').length, 1, '旧行仍在（只扣一笔，不删行）');
});

test('migrateProgress：P=0.5 不算「用对」（旧实现写的是 p>=0.5 记对，已废）', async () => {
  const { state, tools } = setup([]);
  await tools.migrateProgress('u', '交集', '并集', 0.6, 0.5);
  const neu = state.knowledge_progress.find((r) => r.knowledgeNodeId === 'n_new');
  assert.strictEqual(neu.attempts, 1);
  assert.strictEqual(neu.correctCount, 0, 'P=0.5 记入分母但不记对（决策 026 口径）');
  assert.strictEqual(neu.mastery, 0);
});

test('migrateProgress：扣完归零 → 删行（不留空壳）', async () => {
  const { state, tools } = setup([{ _id: 'p1', userId: 'u', knowledgeNodeId: 'n_old', attempts: 1, correctCount: 0, mastery: 0 }]);
  await tools.migrateProgress('u', '交集', '并集', 0.5, 0);
  assert.strictEqual(state.knowledge_progress.filter((r) => r.knowledgeNodeId === 'n_old').length, 0, '扣完就删');
  assert.strictEqual(state.knowledge_progress.find((r) => r.knowledgeNodeId === 'n_new').attempts, 1, '账搬到了新节点');
});

test('migrateProgress：目标不在图谱（已进待建队列）→ 不扣旧账（宁缺勿假）', async () => {
  const { state, tools } = setup([{ _id: 'p1', userId: 'u', knowledgeNodeId: 'n_old', attempts: 3, correctCount: 2, mastery: 0.67 }]);
  await tools.migrateProgress('u', '交集', '这个词谱里没有', 0.5, 1);
  assert.strictEqual(state.knowledge_progress.find((r) => r.knowledgeNodeId === 'n_old').attempts, 3, '旧账没被扣掉');
  assert.ok((state.node_requests || []).some((r) => r.name === '这个词谱里没有'), '写进待建队列');
});

test('migrateProgress：旧行有 sValue/dValue → 一并搬走（不新造）', async () => {
  const { state, tools } = setup([{ _id: 'p1', userId: 'u', knowledgeNodeId: 'n_old', attempts: 2, correctCount: 2, mastery: 1, sValue: 1.2, dValue: 1.6 }]);
  await tools.migrateProgress('u', '交集', '并集', 0.4, 1);
  const old = state.knowledge_progress.find((r) => r.knowledgeNodeId === 'n_old');
  const neu = state.knowledge_progress.find((r) => r.knowledgeNodeId === 'n_new');
  assert.strictEqual(old.sValue, 0.8);
  assert.strictEqual(old.dValue, 1.2);
  assert.strictEqual(neu.sValue, 0.4, '旧行的 sValue 搬到新节点（历史字段继续维护）');
  assert.strictEqual(neu.dValue, 0.4);
});
// ============ aggregateUp（2026-09-26 决策 052/§4.5：父节点的 K 只能由子节点聚合） ============
const NODES_TREE = [
  { knowledgeId: 'set', name: '集合' },
  { knowledgeId: 'a', name: '交集', parentId: 'set' },
  { knowledgeId: 'b', name: '并集', parentId: 'set' },
  { knowledgeId: 'c', name: '补集', parentId: 'set' },
  { knowledgeId: 'top', name: '数学' },
  { knowledgeId: 'set2', name: '集合与逻辑', parentId: 'top' },
];

function treeDb(progress, nodes) {
  const state = { knowledge_nodes: nodes || NODES_TREE, knowledge_progress: progress.slice() };
  return { state, tools: createKnowledgeTools({ db: fakeDb(state) }) };
}

test('aggregateUp：父节点 = 有账子节点的等权平均，且标记 aggregated（不再直记父节点）', async () => {
  const { state, tools } = treeDb([
    { _id: 'l1', userId: 'u', knowledgeNodeId: 'a', mastery: 1, attempts: 2, correctCount: 2 },
    { _id: 'l2', userId: 'u', knowledgeNodeId: 'b', mastery: 0.5, attempts: 2, correctCount: 1 },
    { _id: 'l3', userId: 'u', knowledgeNodeId: 'c' },   // 没账的子节点不参与
  ]);
  const touched = await tools.aggregateUp('a', 'u');
  const parent = state.knowledge_progress.find((r) => r.knowledgeNodeId === 'set');
  assert.ok(parent, '父节点行被写入');
  assert.strictEqual(parent.mastery, 0.75, '(1 + 0.5) / 2 等权平均');
  assert.strictEqual(parent.attempts, 2, 'attempts 记的是「有账子节点数」，不是作答次数');
  assert.strictEqual(parent.aggregated, true, '必须打 aggregated 标记（前端/统计要能识别它不是直接证据）');
  assert.strictEqual(parent.evidence, 'ok');
  assert.ok(Array.isArray(touched) && touched.includes('set'), '返回被重算的父节点 id');
});

test('aggregateUp：只有一个子节点有账 → 证据不足档（不能给结论）', async () => {
  const { state, tools } = treeDb([{ _id: 'l1', userId: 'u', knowledgeNodeId: 'a', mastery: 0.3, attempts: 1, correctCount: 0 }]);
  await tools.aggregateUp('a', 'u');
  const parent = state.knowledge_progress.find((r) => r.knowledgeNodeId === 'set');
  assert.strictEqual(parent.mastery, 0.3);
  assert.strictEqual(parent.evidence, 'insufficient');
});

test('aggregateUp：子节点一个账都没有 → 不写父节点（宁缺勿假）', async () => {
  const { state, tools } = treeDb([]);
  await tools.aggregateUp('a', 'u');
  assert.strictEqual(state.knowledge_progress.filter((r) => r.knowledgeNodeId === 'set').length, 0, '无子账不落父行');
});

test('aggregateUp：父节点本来没账 → 新建父行也在同一 userId 下', async () => {
  const { state, tools } = treeDb([
    { _id: 'l1', userId: 'u', knowledgeNodeId: 'a', mastery: 1, attempts: 1, correctCount: 1 },
    { _id: 'l2', userId: 'u', knowledgeNodeId: 'b', mastery: 0, attempts: 1, correctCount: 0 },
  ]);
  await tools.aggregateUp('a', 'u');
  const parent = state.knowledge_progress.find((r) => r.knowledgeNodeId === 'set');
  assert.strictEqual(parent.userId, 'u', '父行必须带 userId（否则串到别的学生）');
  assert.strictEqual(parent.mastery, 0.5);
});

// ============ 决策 063 · noul 形式：题目 → 节点 + 单元 ============
const { createKnowledgeTools: mkTools } = require('../src/lib/knowledgeMatch');

function jevTestTools(nodes) {
  const q = { where: () => q, limit: () => q, get: async () => ({ data: nodes }) };
  return mkTools({ db: { collection: () => q } });
}

const JNODES = [
  { knowledgeId: 'a', name: '集合', path: ['数学', '必修一', '第一章 集合', '1.1'], type: 'definition' },
  { knowledgeId: 'b', name: '并集', path: ['数学', '必修一', '第一章 集合', '1.3'], type: 'definition' },
  { knowledgeId: 'c', name: '交集', path: ['数学', '必修一', '第一章 集合', '1.3'], type: 'definition' },
  { knowledgeId: 'd', name: '三角函数', path: ['数学', '必修一', '第五章 三角函数', '5.1'], type: 'definition' },
  { knowledgeId: 'g', name: '子节点', parentId: 'a', path: ['数学', '必修一', '第一章 集合', '1.1'], type: 'property' },
];

/** mock：一段返回章节概率；二段按【收到的候选】反查名字给概率（不能假定顺序） */
function twoStageMock(chProbs, ptProbs) {
  let call = 0;
  const chapters = Object.keys(chProbs);
  return {
    ask: async (state, questions) => {
      call++;
      const out = {};
      if (call === 1) {
        chapters.forEach((c, i) => { if (questions['c' + i]) out['c' + i] = { noul: chProbs[c] }; });
      } else {
        Object.keys(questions || {}).forEach((id) => {
          if (!/^k\d+$/.test(id)) return;
          const nm = (String(questions[id].instructions).match(/「(.+?)」/) || [])[1];
          if (nm != null && ptProbs[nm] != null) out[id] = { noul: ptProbs[nm] };
          else out[id] = { noul: 0.01 };
        });
      }
      return { answers: out };
    },
  };
}

test('matchByJevNodes：命中 → 返回节点 id（不是名字）', async () => {
  const t = jevTestTools(JNODES);
  const c = twoStageMock({ '第一章 集合': 0.95, '第五章 三角函数': 0.02 }, { 并集: 0.99, 交集: 0.97, 三角函数: 0.01 });
  const r = await t.matchByJevNodes(c, '求 A∪B 与 A∩B');
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.nodeIds.sort(), ['b', 'c'], '并集/交集两个节点都要返回');
  assert.deepStrictEqual(r.units, ['第一章 集合']);
});

test('matchByJevNodes：跨单元题 → units 两章，points 来自两章池', async () => {
  const t = jevTestTools(JNODES);
  const c = twoStageMock({ '第一章 集合': 0.95, '第五章 三角函数': 0.9 }, { 并集: 0.99, 交集: 0.9, 三角函数: 0.95 });
  const r = await t.matchByJevNodes(c, '跨单元题');
  assert.deepStrictEqual(r.units.sort(), ['第一章 集合', '第五章 三角函数'].sort());
  assert.strictEqual(r.nodeIds.length, 3);
});

test('matchByJevNodes：未命中 → ok=false，nodeIds 空（不回退字符匹配）', async () => {
  const t = jevTestTools(JNODES);
  // top-1 = 0.2：过了兜底线（0.15）但二段没有任何知识点命中
  const c = twoStageMock({ '第一章 集合': 0.2, '第五章 三角函数': 0.1 }, {});
  const r = await t.matchByJevNodes(c, '图谱里没有的题');
  assert.strictEqual(r.ok, false);
  assert.deepStrictEqual(r.nodeIds, []);
  assert.strictEqual(r.reason, '章内知识点全未命中');
});

test('matchByJevNodes：连兜底线都不到 → 不硬塞单元', async () => {
  const t = jevTestTools(JNODES);
  const c = twoStageMock({ '第一章 集合': 0.05, '第五章 三角函数': 0.01 }, {});
  const r = await t.matchByJevNodes(c, '完全无关的题');
  assert.strictEqual(r.ok, false);
  assert.deepStrictEqual(r.units, [], '过低概率不该硬塞单元（否则 A 会记到无关单元）');
  assert.strictEqual(r.reason, '章节概率过低');
});

test('matchByJevNodes：不再回退字符匹配（关键行为变更）', async () => {
  const t = jevTestTools(JNODES);
  // 章节全不命中，但题目文本里含「并集」——旧实现会回退字符匹配命中它
  const c = twoStageMock({ '第一章 集合': 0.2, '第五章 三角函数': 0.1 }, {});
  const r = await t.matchByJevNodes(c, '这是一道考并集的题');
  assert.deepStrictEqual(r.nodeIds, [],
    '即使名字能与图谱精确匹配，Jev 说没有也必须返回空（宁缺勿假，不硬塞）');
});

test('matchByJevNodes：未传 client → 空结果，不抛', async () => {
  const t = jevTestTools(JNODES);
  const r = await t.matchByJevNodes(null, '题目');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, '未提供 jevClient');
});

test('matchByJevNodes：client 抛错 → 空结果，不冒泡', async () => {
  const t = jevTestTools(JNODES);
  const c = { ask: async () => { throw new Error('网关 500'); } };
  const r = await t.matchByJevNodes(c, '题目');
  assert.strictEqual(r.ok, false);
  assert.ok(r.reason.includes('Jev 调用失败'));
});

test('matchByJevNodes：无题目文本 → 不调网络', async () => {
  const t = jevTestTools(JNODES);
  let called = false;
  const c = { ask: async () => { called = true; } };
  const r = await t.matchByJevNodes(c, '');
  assert.strictEqual(called, false);
  assert.strictEqual(r.reason, '无题目文本');
});
