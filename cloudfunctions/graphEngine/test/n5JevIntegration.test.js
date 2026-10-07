'use strict';
// 决策 063「先 J 再 L」集成测试
//   N1.5 Jev 分类 → N2 LLM 用缩小清单 → N5 用 jevPoints/jevUnits 记账
// 跑法：node --test test/n5JevIntegration.test.js
const test = require('node:test');
const assert = require('node:assert');
const { createJevMatchNode } = require('../src/nodes/jevMatchNode');
const { createUpdateMasteryNode } = require('../src/nodes/updateMastery');
const { createKnowledgeTools } = require('../src/lib/knowledgeMatch');

const NODES = [
  { knowledgeId: 'a', name: '集合', path: ['数学', '必修一', '第一章 集合', '1.1'], type: 'definition' },
  // 「集合」有子节点 → pickLeafNodes 才认它是父节点（路由，不是记账单位）
  { knowledgeId: 'a1', name: '列举法', parentId: 'a', path: ['数学', '必修一', '第一章 集合', '1.2'], type: 'method' },
  { knowledgeId: 'b', name: '并集', path: ['数学', '必修一', '第一章 集合', '1.3'], type: 'definition' },
  { knowledgeId: 'c', name: '交集', path: ['数学', '必修一', '第一章 集合', '1.3'], type: 'definition' },
  { knowledgeId: 'm', name: '因式分解', path: ['数学', '必修一', '第一章 集合', '1.9'], partition: 'method' },
];

/** 假 db：kg 与 N5 必须共用同一个 db，否则待建队列写到了别处 */
function fakeDb() {
  const log = { kp: [], up: [], requests: [], batches: [] };
  const db = {
    serverDate: () => new Date(),
    collection: (c) => {
      if (c === 'knowledge_nodes') {
        const q = { where: () => q, limit: () => q, get: async () => ({ data: NODES }) };
        return q;
      }
      return {
        where: () => ({ limit: () => ({ get: async () => ({ data: [] }) }) }),
        add: async ({ data }) => {
          if (c === 'knowledge_progress') log.kp.push(data);
          if (c === 'unit_progress') log.up.push(data);
          if (c === 'node_requests') log.requests.push(data.name);
        },
        doc: (id) => ({
          update: async ({ data }) => { if (c === 'batches') log.batches.push({ id, data }); },
          remove: async () => {},
        }),
      };
    },
  };
  return { db, log };
}

const makeKg = (db) => createKnowledgeTools({ db });

/** 假 Jev：按名字回答（章节段全命中，知识点段只命中 points 里的） */
function fakeJev(points, opts) {
  const o = opts || {};
  return {
    ask: async (state, questions) => {
      if (o.throw) throw new Error('网关挂了');
      const out = {};
      Object.keys(questions || {}).forEach((id) => {
        const nm = (String(questions[id].instructions).match(/「(.+?)」/) || [])[1];
        if (id.startsWith('c')) out[id] = { noul: 0.95 };
        else out[id] = { noul: points.includes(nm) ? 0.9 : 0.05 };
      });
      return { answers: out };
    },
  };
}

function state(usage, extra) {
  return Object.assign({
    openid: 'u1',
    questionId: 'q1',
    question: { questionText: '已知集合 A={1,2,3}，求 A∪B' },
    raw: { knowledgeUsage: usage, errorLevel: null, isOutOfSyllabus: false },
    clamped: { P: 1, D: 0.4 },
    derived: {},
  }, extra || {});
}

// ============ N1.5 · Jev 分类 ============
test('N1.5：Jev 命中 → 写出 jevPoints / jevUnits', async () => {
  const { db } = fakeDb();
  const node = createJevMatchNode({ kg: makeKg(db), jev: fakeJev(['并集', '交集']) });
  const r = await node(state([]));
  assert.strictEqual(r.jevInfo.ok, true);
  assert.deepStrictEqual(r.jevPoints.sort(), ['交集', '并集'].sort());
  assert.ok(Array.isArray(r.jevUnits) && r.jevUnits.length, '单元也要写出来给 A 用');
});

test('N1.5：非服务类失败（如 400 参数错）→ jevPoints=null，不抛 503', async () => {
  const { db } = fakeDb();
  // 400 是「我们的 bug」，不该被当成服务不可用
  const jev = { ask: async () => { throw Object.assign(new Error('Jev HTTP 400: Invalid input'), { status: 400 }); } };
  const node = createJevMatchNode({ kg: makeKg(db), jev, db });
  const r = await node(state([]));
  assert.strictEqual(r.jevPoints, null);
  assert.strictEqual(r.jevInfo.ok, false);
  assert.ok(!String(r.jevInfo.reason).includes('暂不可用'));
});

test('N1.5：服务不可用时**绝不静默降级**（不再返回 null 让下游退回字符匹配）', async () => {
  const { db } = fakeDb();
  const node = createJevMatchNode({
    kg: makeKg(db),
    jev: { ask: async () => { throw new Error('fetch failed'); } },
    db,
  });
  // 旧行为是返回 {jevPoints:null} 让 N2/N5 退回旧路径 —— 用户明确否掉了这条路
  await assert.rejects(() => node(state([])), (e) => e.code === 503);
});

test('N1.5：未配 Jev → 空结果，不报错', async () => {
  const { db } = fakeDb();
  const node = createJevMatchNode({ kg: makeKg(db) });
  const r = await node(state([]));
  assert.strictEqual(r.jevPoints, null);
  assert.strictEqual(r.jevInfo.reason, '未启用');
});

// ============ N5 · 用 jevPoints 精确解析 ============
test('N5：jevPoints 里的名字 → 精确解析到节点（无相似度参与）', async () => {
  const { db, log } = fakeDb();
  const node = createUpdateMasteryNode({ db, kg: makeKg(db) });
  await node(state([{ name: '并集', P: 1, D: 0.4 }], {
    jevPoints: ['并集', '交集'], jevUnits: ['第一章 集合'],
  }));
  assert.strictEqual(log.kp.length, 1);
  assert.strictEqual(log.kp[0].knowledgeNodeId, 'b');
});

test('N5：⚠️行为变更 —— 删掉相似度兜底后，「集合的并集」不再被猜成「并集」', async () => {
  const { db, log } = fakeDb();
  const node = createUpdateMasteryNode({ db, kg: makeKg(db) });
  // 先 J 再 L 之后，LLM 拿到的就是 jevPoints 那几个名字，本来就该写得一模一样；
  // 写歪了说明它没照清单写 —— 这时宁可不记账，也不要靠相似度去猜。
  await node(state([{ name: '集合的并集', P: 1, D: 0.4 }], {
    jevPoints: ['并集', '交集'], jevUnits: ['第一章 集合'],
  }));
  assert.strictEqual(log.kp.length, 0, '不猜：相似度兜底已按要求删除');
  assert.deepStrictEqual(log.requests, ['集合的并集'], '写歪的名字进待建队列');
});

test('N5：父节点全名 → 不解析（决策 052：父节点是路由，不记账）', async () => {
  const { db, log } = fakeDb();
  const node = createUpdateMasteryNode({ db, kg: makeKg(db) });
  await node(state([{ name: '集合', P: 1, D: 0.4 }], { jevPoints: ['并集'], jevUnits: ['第一章 集合'] }));
  assert.strictEqual(log.kp.length, 0);
  assert.deepStrictEqual(log.requests, ['集合']);
});

test('N5：方法类全名 → 不解析（决策 028：方法不做 K）', async () => {
  const { db, log } = fakeDb();
  const node = createUpdateMasteryNode({ db, kg: makeKg(db) });
  await node(state([{ name: '因式分解', P: 1, D: 0.4 }], { jevPoints: ['并集'], jevUnits: ['第一章 集合'] }));
  assert.strictEqual(log.kp.length, 0);
  assert.deepStrictEqual(log.requests, ['因式分解']);
});

// ============ N5 · A 的记账单元来自 Jev ============
test('N5：A 的单元直接用 jevUnits（不从 usage 名字反推）', async () => {
  const { db, log } = fakeDb();
  const node = createUpdateMasteryNode({ db, kg: makeKg(db) });
  // usage 只有「并集」（属第一章），但 Jev 判定本题横跨两个单元
  await node(state([{ name: '并集', P: 1, D: 0.4 }], {
    jevPoints: ['并集'], jevUnits: ['第一章 集合', '第三章 函数'],
  }));
  const units = log.up.map((x) => x.unitName).sort();
  assert.deepStrictEqual(units, ['第一章 集合', '第三章 函数'].sort(),
    'A 必须记 Jev 判定的两个单元 —— 从 usage 反推只会得到第一章');
});

test('N5：没有 jevUnits 时退回「从 usage 反推单元」（向后兼容）', async () => {
  const { db, log } = fakeDb();
  const node = createUpdateMasteryNode({ db, kg: makeKg(db) });
  await node(state([{ name: '并集', P: 1, D: 0.4 }]));   // 无 jevPoints/jevUnits
  assert.strictEqual(log.kp.length, 1, '仍走原路径记账');
  assert.ok(log.up.length >= 0);
});

test('N5：Jev 确认考点但 LLM 没写 → 不凭空记账（K 的 P 只能来自 LLM）', async () => {
  const { db, log } = fakeDb();
  const node = createUpdateMasteryNode({ db, kg: makeKg(db) });
  await node(state([{ name: '交集', P: 1, D: 0.4 }], {
    jevPoints: ['并集', '交集'], jevUnits: ['第一章 集合'],
  }));
  assert.strictEqual(log.kp.length, 1, '只有 LLM 给出 P 的点才记账');
  assert.strictEqual(log.kp[0].knowledgeNodeId, 'c');
});

// ============ 服务不可用：不降级 + 批次挂起（2026-10-06 用户定） ============
const { isServiceUnavailable } = require('../src/lib/jevMatch');

test('isServiceUnavailable：网络失败 / 5xx / 429 / 401 / 403 → 算；400 → 不算', () => {
  assert.strictEqual(isServiceUnavailable(new Error('fetch failed')), true, '网络失败无 status');
  assert.strictEqual(isServiceUnavailable(Object.assign(new Error('x'), { status: 503 })), true);
  assert.strictEqual(isServiceUnavailable(Object.assign(new Error('x'), { status: 500 })), true);
  assert.strictEqual(isServiceUnavailable(Object.assign(new Error('x'), { status: 429 })), true);
  assert.strictEqual(isServiceUnavailable(Object.assign(new Error('x'), { status: 401 })), true, 'key 没配');
  assert.strictEqual(isServiceUnavailable(Object.assign(new Error('x'), { status: 403 })), true);
  assert.strictEqual(isServiceUnavailable(Object.assign(new Error('x'), { status: 400 })), false,
    '400 是参数错＝我们的 bug，不该被当成服务不可用');
  assert.strictEqual(isServiceUnavailable(null), false);
});

test('N1.5：Jev 服务不可用 → 抛 503，批次挂起且 status 保持 pending（可重跑）', async () => {
  const { db, log } = fakeDb();
  const node = createJevMatchNode({
    kg: makeKg(db),
    jev: { ask: async () => { throw new Error('fetch failed'); } },
    db,
  });
  const st = state([]);
  st.question = { questionText: '题目', batchId: 'b1' };
  await assert.rejects(() => node(st), (e) => {
    assert.strictEqual(e.code, 503, '必须是 503');
    assert.strictEqual(e.serviceUnavailable, true);
    assert.strictEqual(e.engine, 'jev');
    assert.ok(/暂不可用/.test(e.message), '消息要说清是服务不可用');
    return true;
  });
  assert.strictEqual(log.batches.length, 1, '批次要被标记（离线缓存）');
  assert.strictEqual(log.batches[0].id, 'b1');
  // ⚠️ 关键：status 必须是 'pending'（不是自造值）——
  //    否则 diagnose 的幂等门 `status !== 'pending'` 会挡住重跑，"等恢复后再做"就落空了
  assert.strictEqual(log.batches[0].data.status, 'pending', '必须保持 pending 才能重跑');
  assert.strictEqual(log.batches[0].data.serviceHold.engine, 'jev');
  assert.ok(log.batches[0].data.serviceHold.reason);
});

test('N1.5：HTTP 401（key 没配）也按服务不可用处理 → 503 + 挂起', async () => {
  const { db, log } = fakeDb();
  const node = createJevMatchNode({
    kg: makeKg(db),
    jev: { ask: async () => { throw Object.assign(new Error('Jev HTTP 401: Unauthorized'), { status: 401 }); } },
    db,
  });
  const st = state([]);
  st.question = { questionText: '题目', batchId: 'b2' };
  await assert.rejects(() => node(st), (e) => e.code === 503);
  assert.strictEqual(log.batches[0].data.status, 'pending');
});

test('N1.5：非服务问题（无命中）→ 不抛错，正常往下走（图继续，进待建队列）', async () => {
  const { db } = fakeDb();
  // Jev 正常返回，但没有任何考点命中
  const node = createJevMatchNode({ kg: makeKg(db), jev: fakeJev([]), db });
  const r = await node(state([]));
  assert.strictEqual(r.jevPoints, null);
  assert.strictEqual(r.jevInfo.ok, false);
});

test('端到端：Jev 不可用 → 图停在 N1.5，**不产生任何记账**（不写半成品账）', async () => {
  const { runJudge, NODES } = require('../src/graphs/judgeGraph');
  const q = { _id: 'q1', userId: 'u1', questionText: '已知集合 A={1,2,3}', batchId: 'b9' };
  const written = { kp: [], up: [], batches: [] };
  const docDb = {
    serverDate: () => new Date(),
    collection: (c) => ({
      doc: (id) => ({
        get: async () => ({ data: c === 'questions' ? q : null }),
        update: async ({ data }) => { if (c === 'batches') written.batches.push(data); },
      }),
      where: () => ({ limit: () => ({ get: async () => ({ data: [] }) }) }),
      add: async ({ data }) => { if (c === 'knowledge_progress') written.kp.push(data); if (c === 'unit_progress') written.up.push(data); },
    }),
  };
  const kg = createKnowledgeTools({ db: docDb });
  const rag = { searchHistory: async () => [], buildRagContext: () => '', buildReportText: () => '' };
  const jev = { ask: async () => { throw new Error('fetch failed'); } };
  const out = await runJudge(
    { db: docDb, kg, jev, rag, postJSON: async () => ({}), config: {}, embed: async () => [], logger: { warn: () => {}, error: () => {}, log: () => {} } },
    { questionId: 'q1', openid: 'u1' },
  );
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.response.code, 503);
  assert.strictEqual(written.kp.length, 0, '不能写 K 账（知识点分类没跑成）');
  assert.strictEqual(written.up.length, 0, '不能写 A 账');
  assert.strictEqual(written.batches.length, 1, '批次要被挂起');
});
