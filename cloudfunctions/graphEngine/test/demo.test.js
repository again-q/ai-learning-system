// ============ D1 最小测试：空图能跑、计数正确（node:test，零额外依赖） ============
const test = require('node:test');
const assert = require('node:assert/strict');
const { graph, incNode } = require('../src/graphs/demoGraph');

test('空图 invoke：count 0 → 1', async () => {
  const out = await graph.invoke({ count: 0 });
  assert.equal(out.count, 1);
});

test('节点函数可单独调用（喂 5 → 6）', async () => {
  const out = await incNode({ count: 5 });
  assert.equal(out.count, 6);
});

test('连续两次 invoke 状态不串（图内 reducer 每次从入参开始）', async () => {
  const a = await graph.invoke({ count: 0 });
  const b = await graph.invoke({ count: 100 });
  assert.equal(a.count, 1);
  assert.equal(b.count, 101);
});
