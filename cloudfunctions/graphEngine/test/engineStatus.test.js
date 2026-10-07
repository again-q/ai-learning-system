'use strict';
// 诊断引擎服务状态单测（2026-10-06）
// 跑法：node --test test/engineStatus.test.js
const test = require('node:test');
const assert = require('node:assert');
const {
  probeJev, readEngineStatus, recordEngineResult, listHeldBatches, summarize, PROBE_INSTRUCTION,
} = require('../src/lib/engineStatus');

/** 假 db：内存集合，支持 where/limit/get + add + doc().update() */
function fakeDb(seed) {
  const store = Object.assign({ engine_status: [], batches: [] }, seed || {});
  // 时钟要**递增**，否则测不出 since 有没有刷新
  let tick = 0;
  const db = {
    serverDate: () => new Date(Date.UTC(2026, 9, 6, 0, 0, tick++)),
    collection: (c) => ({
      where: (cond) => {
        const rows = (store[c] || []).filter((r) => Object.entries(cond || {}).every(([k, v]) => {
          // 支持 'a.b' 形式的点路径
          const val = k.split('.').reduce((o, kk) => (o == null ? o : o[kk]), r);
          return val === v;
        }));
        return { limit: () => ({ get: async () => ({ data: rows }) }) };
      },
      add: async ({ data }) => { const _id = 'id' + ((store[c] || []).length + 1); store[c].push(Object.assign({ _id }, data)); return { _id }; },
      doc: (id) => ({
        update: async ({ data }) => {
          const i = (store[c] || []).findIndex((r) => r._id === id);
          if (i >= 0) store[c][i] = Object.assign({}, store[c][i], data);
        },
      }),
    }),
  };
  return { db, store };
}

// ---- 探测 ----
test('probeJev：成功 → ok=true 且有耗时', async () => {
  const jev = { ask: async () => ({ answers: { p: { noul: 0.9 } } }) };
  const r = await probeJev(jev);
  assert.strictEqual(r.ok, true);
  assert.ok(Number.isFinite(r.latencyMs) && r.latencyMs >= 0);
});

test('probeJev：网络失败 → ok=false 且标为服务不可用', async () => {
  const jev = { ask: async () => { throw new Error('fetch failed'); } };
  const r = await probeJev(jev);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.serviceUnavailable, true);
  assert.ok(r.error.includes('fetch failed'));
});

test('probeJev：401（key 没配）→ ok=false，带 status', async () => {
  const jev = { ask: async () => { throw Object.assign(new Error('Unauthorized'), { status: 401 }); } };
  const r = await probeJev(jev);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.status, 401);
  assert.strictEqual(r.serviceUnavailable, true);
});

test('probeJev：未配置 client → 直接判不可用，不抛', async () => {
  const r = await probeJev(null);
  assert.strictEqual(r.ok, false);
  assert.ok(r.error.includes('未配置'));
});

test('probeJev：探测请求极小（单条 noul），不拉整章清单', async () => {
  let captured = null;
  const jev = { ask: async (state, questions) => { captured = questions; return { answers: {} }; } };
  await probeJev(jev);
  assert.strictEqual(Object.keys(captured).length, 1, '只发一条，控制成本');
  assert.strictEqual(captured.p.type, 'noul');
  assert.strictEqual(captured.p.instructions, PROBE_INSTRUCTION);
});

// ---- 记录 / 读取 ----
test('recordEngineResult：首次记录 → 建立状态 + since', async () => {
  const { db, store } = fakeDb();
  const s = await recordEngineResult(db, 'jev', { ok: false, error: 'fetch failed', status: null });
  assert.strictEqual(s.ok, false);
  assert.strictEqual(s.consecutiveFailures, 1);
  assert.ok(s.since, '状态变化要记 since');
  assert.strictEqual(store.engine_status.length, 1);
});

test('recordEngineResult：连续失败 → 次数累加，since 不变（状态没变）', async () => {
  const { db } = fakeDb();
  const s1 = await recordEngineResult(db, 'jev', { ok: false, error: 'e1' });
  const s2 = await recordEngineResult(db, 'jev', { ok: false, error: 'e2' });
  assert.strictEqual(s2.consecutiveFailures, 2);
  assert.deepStrictEqual(s2.since, s1.since, '同一状态 during 期间 since 不该刷新');
  assert.strictEqual(s2.lastError, 'e2');
});

test('recordEngineResult：恢复 → ok=true、失败次数清零、since 刷新', async () => {
  const { db } = fakeDb();
  const s1 = await recordEngineResult(db, 'jev', { ok: false, error: 'e1' });
  const s2 = await recordEngineResult(db, 'jev', { ok: true, latencyMs: 120 });
  assert.strictEqual(s2.ok, true);
  assert.strictEqual(s2.consecutiveFailures, 0);
  assert.strictEqual(s2.lastError, null);
  assert.strictEqual(s2.latencyMs, 120);
  assert.notDeepStrictEqual(s2.since, s1.since, '恢复是状态变化 → since 要刷新');
  assert.ok(s2.lastOkAt);
});

test('readEngineStatus：无记录 → null（不编造）', async () => {
  const { db } = fakeDb();
  assert.strictEqual(await readEngineStatus(db, 'jev'), null);
});

// ---- 挂起批次 ----
test('listHeldBatches：只列「pending 且有 serviceHold」的批次', async () => {
  const { db } = fakeDb({
    batches: [
      { _id: 'b1', status: 'pending', serviceHold: { engine: 'jev' } },
      { _id: 'b2', status: 'completed', serviceHold: { engine: 'jev' } },
      { _id: 'b3', status: 'pending' },
      { _id: 'b4', status: 'pending', serviceHold: { engine: 'jev' } },
    ],
  });
  const held = await listHeldBatches(db);
  assert.deepStrictEqual(held.map((b) => b._id).sort(), ['b1', 'b4']);
});

// ---- 摘要（给前端看） ----
test('summarize：无记录 → 未知（不谎报正常）', () => {
  const s = summarize(null, 'jev');
  assert.strictEqual(s.known, false);
  assert.strictEqual(s.ok, null);
  assert.ok(s.text.includes('未知'));
});

test('summarize：不可用 → 文案明确说不可用 + 带上原因', () => {
  const s = summarize({ ok: false, lastError: 'fetch failed', consecutiveFailures: 3 }, 'jev');
  assert.strictEqual(s.ok, false);
  assert.ok(s.text.includes('暂不可用'));
  assert.ok(s.text.includes('fetch failed'));
  assert.strictEqual(s.consecutiveFailures, 3);
});

test('summarize：正常', () => {
  const s = summarize({ ok: true, latencyMs: 88 }, 'jev');
  assert.strictEqual(s.ok, true);
  assert.ok(s.text.includes('正常'));
});
