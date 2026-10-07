'use strict';
// Jev noul 形式单测（用 mock client，不打真网络）
// 跑法：node --test test/jevMatch.test.js
const test = require('node:test');
const assert = require('node:assert');
const {
  groupByChapter, createJevClient, pickUnits, pickPoints, matchByJev, noulProb, THRESHOLD,
} = require('../src/lib/jevMatch');

const NODES = [
  { knowledgeId: 'a', name: '集合', path: ['数学', '必修一', '第一章 集合', '1.1'], type: 'definition' },
  { knowledgeId: 'b', name: '并集', path: ['数学', '必修一', '第一章 集合', '1.3'], type: 'definition' },
  { knowledgeId: 'c', name: '交集', path: ['数学', '必修一', '第一章 集合', '1.3'], type: 'definition' },
  { knowledgeId: 'd', name: '三角函数', path: ['数学', '必修一', '第五章 三角函数', '5.1'], type: 'definition' },
  { knowledgeId: 'e', name: '解题套路', path: ['数学', '必修一', '第一章 集合', '1.9'], partition: 'method' },
  { knowledgeId: 'g', name: '子节点', parentId: 'a', path: ['数学', '必修一', '第一章 集合', '1.1'], type: 'property' },
];

/** mock client：按调用次序返回 noul 概率表 */
function mockClient(seq) {
  let i = 0;
  return { ask: async () => ({ answers: seq[i++] }) };
}

/** 把 {名称: 概率} 造 id 化的 noul answers */
function nouls(prefix, list, map) {
  const out = {};
  list.forEach((nm, i) => { out[prefix + i] = { noul: map[nm] }; });
  return out;
}

test('THRESHOLD：用户 2026-10-06 指定为 0.8', () => {
  assert.strictEqual(THRESHOLD, 0.8);
});

test('groupByChapter：排除方法类与父节点（路由不进候选）', () => {
  const g = groupByChapter(NODES);
  assert.ok(g['第一章 集合'].includes('并集') && g['第一章 集合'].includes('交集'));
  assert.ok(!g['第一章 集合'].includes('解题套路'), '方法类不是 K 节点（决策 028）');
  assert.ok(!g['第一章 集合'].includes('集合'), '父节点是给学生看的路由，不进记账候选（决策 052）');
  assert.deepStrictEqual(g['第五章 三角函数'], ['三角函数']);
});

test('noulProb：读 noul 字段；缺失返回 null', () => {
  assert.strictEqual(noulProb({ k0: { noul: 0.93 } }, 'k0'), 0.93);
  assert.strictEqual(noulProb({ k0: {} }, 'k0'), null);
  assert.strictEqual(noulProb({}, 'k0'), null);
  assert.strictEqual(noulProb(null, 'k0'), null);
});

// ---- 一段：定单元（关键：跨单元题不能丢）----
test('一段：多章命中 → 全部保留（跨单元题是常态，不能用 choice）', async () => {
  const chapters = ['第一章 集合', '第五章 三角函数', '第0章 预备'];
  const c = mockClient([nouls('c', chapters, { '第一章 集合': 0.97, '第五章 三角函数': 0.02, '第0章 预备': 0.85 })]);
  const r = await pickUnits(c, '题目', chapters);
  assert.deepStrictEqual(r.units.sort(), ['第0章 预备', '第一章 集合'].sort(), '两个都要留下');
  assert.strictEqual(r.probs['第五章 三角函数'], 0.02);
});

test('一段：阈值边界（0.8 算命中，0.79 不算）', async () => {
  const chapters = ['A', 'B'];
  const c = mockClient([nouls('c', chapters, { A: 0.8, B: 0.79 })]);
  const r = await pickUnits(c, 't', chapters);
  assert.deepStrictEqual(r.units, ['A'], '≥0.8 命中');
});

test('一段：无章节 → 不调网络', async () => {
  let called = false;
  const c = { ask: async () => { called = true; } };
  const r = await pickUnits(c, 't', []);
  assert.deepStrictEqual(r.units, []);
  assert.strictEqual(called, false);
});

// ---- 二段：定知识点（多标签）----
test('二段：多个知识点同时命中（一题 1~5 个，天然多标签）', async () => {
  const cand = ['并集', '交集', '三角函数'];
  const c = mockClient([nouls('k', cand, { 并集: 0.99, 交集: 0.99, 三角函数: 0.1 })]);
  const r = await pickPoints(c, '求 A∪B 与 A∩B', cand);
  assert.deepStrictEqual(r.points.sort(), ['交集', '并集'].sort(), '并集和交集都要命中');
});

// ---- 完整三段（2026-10-06 定稿：池=top2，单元=top1 ∪ 二段折章）----
/** name-aware mock：一段按章节名给概率；二段按 instructions 里的名字给概率 */
function threeStage(chProbs, ptProbs) {
  let call = 0;
  return {
    ask: async (state, questions) => {
      call++;
      const out = {};
      if (call === 1) {
        Object.keys(questions).forEach((id) => {
          const nm = (String(questions[id].instructions).match(/「(.+?)」/) || [])[1];
          out[id] = { noul: chProbs[nm] != null ? chProbs[nm] : 0.01 };
        });
      } else {
        Object.keys(questions).forEach((id) => {
          const nm = (String(questions[id].instructions).match(/「(.+?)」/) || [])[1];
          out[id] = { noul: ptProbs[nm] != null ? ptProbs[nm] : 0.01 };
        });
      }
      return { answers: out };
    },
  };
}

test('matchByJev：候选池按相对阈值取章（章数自适应，不写死 2）', async () => {
  const groups = { '第一章 集合': ['并集'], '第五章 三角函数': ['三角函数'] };
  const seenPools = [];
  const c = {
    ask: async (state, questions) => {
      const ids = Object.keys(questions);
      if (ids.some((i) => i.startsWith('k'))) {
        ids.forEach((i) => seenPools.push((String(questions[i].instructions).match(/「(.+?)」/) || [])[1]));
        return { answers: { k0: { noul: 0.9 } } };
      }
      return { answers: { c0: { noul: 0.97 }, c1: { noul: 0.2 } } };
    },
  };
  await matchByJev(c, 't', groups);
  assert.ok(seenPools.includes('三角函数'),
    '第五章只有 0.2，但 0.2 ≥ 0.97×0.2 → 必须进池（卡绝对阈值会丢掉"考得少"的章节）');
});

test('matchByJev：章数随题目变 —— 相关章多则取多章，不固定 2', async () => {
  const groups = {
    '第一章 集合': ['并集'],
    '第三章 函数': ['区间表示法'],
    '第二章 不等式': ['基本不等式'],
    '第五章 三角函数': ['三角函数'],
  };
  // 四个章节都 ≥ top1×0.2 → 应全部进池（4 章）
  let chCount = 0;
  const c = {
    ask: async (state, questions) => {
      const ids = Object.keys(questions);
      if (ids.some((i) => i.startsWith('k'))) {
        // 二段收到的候选数 = 池子里所有章的点数
        chCount = ids.length;
        return { answers: Object.fromEntries(ids.map((i) => [i, { noul: 0.9 }])) };
      }
      return { answers: { c0: { noul: 0.9 }, c1: { noul: 0.85 }, c2: { noul: 0.7 }, c3: { noul: 0.3 } } };
    },
  };
  const r = await matchByJev(c, '跨多章题', groups);
  assert.strictEqual(chCount, 4, '四章都过相对阈值 → 池子应含 4 章的点（固定 N=2 会漏掉两章）');
  assert.strictEqual(r.poolChapters.length, 4);
});

test('matchByJev：候选数超过 POOL_MAX 时截断（成本安全阀）', async () => {
  // 造一章超大的图：top-1 就超上限
  const big = []; for (let i = 0; i < 100; i++) big.push('点' + i);
  const groups = { '第一章 集合': big, '第五章 三角函数': ['三角函数'] };
  let poolSize = 0;
  const c = {
    ask: async (state, questions) => {
      const ids = Object.keys(questions);
      if (ids.some((i) => i.startsWith('k'))) {
        poolSize = ids.length;
        return { answers: { k0: { noul: 0.9 } } };
      }
      return { answers: { c0: { noul: 0.97 }, c1: { noul: 0.9 } } };
    },
  };
  await matchByJev(c, 't', groups);
  assert.ok(poolSize <= 100, `池子不得超上限太多（实得 ${poolSize}）`);
});

test('matchByJev：units = top1 ∪ 二段命中知识点所属章节（考得少也记上）', async () => {
  const groups = {
    '第一章 集合': ['并集', '交集'],
    '第三章 函数': ['区间表示法'],
  };
  // 一段：第三章只有 0.2（漏），二段：区间表示法 0.83（抓到）
  const c = threeStage(
    { '第一章 集合': 0.97, '第三章 函数': 0.2 },
    { 并集: 0.99, 交集: 0.9, 区间表示法: 0.83 },
  );
  const r = await matchByJev(c, '求 M∪N（用区间表示）', groups);
  assert.ok(r.units.includes('第一章 集合'), 'top-1 保底');
  assert.ok(r.units.includes('第三章 函数'),
    '第三章「考得少但确实考了」—— 二段抓到就必须记上（用户 2026-10-06 明确要求）');
  assert.deepStrictEqual(r.points.sort(), ['交集', '区间表示法', '并集'].sort());
});

test('matchByJev：二段没命中的章节不进 units（只有 top-1 保底）', async () => {
  const groups = { '第一章 集合': ['并集'], '第五章 三角函数': ['三角函数'] };
  const c = threeStage(
    { '第一章 集合': 0.97, '第五章 三角函数': 0.9 },
    { 并集: 0.95, 三角函数: 0.2 },        // 三角函数未过阈值
  );
  const r = await matchByJev(c, 't', groups);
  assert.deepStrictEqual(r.units, ['第一章 集合'],
    '第五章一段分高但二段没有命中知识点 → 不记它的账（没证据）');
  assert.deepStrictEqual(r.points, ['并集']);
});

test('matchByJev：一段 top-1 低于兜底线 → 不硬塞单元', async () => {
  const groups = { '第一章 集合': ['并集'] };
  let calls = 0;
  const c = { ask: async () => { calls++; return { answers: { c0: { noul: 0.05 } } }; } };
  const r = await matchByJev(c, 't', groups);
  assert.strictEqual(r.hit, false);
  assert.strictEqual(r.reason, '章节概率过低');
  assert.deepStrictEqual(r.units, []);
  assert.strictEqual(calls, 1, '过低就不该再问二段（省一次调用）');
});

test('matchByJev：有单元但知识点全未命中 → 记为图谱缺口', async () => {
  const groups = { '第一章 集合': ['并集'] };
  const c = threeStage({ '第一章 集合': 0.9 }, { 并集: 0.3 });
  const r = await matchByJev(c, 't', groups);
  assert.strictEqual(r.hit, false);
  assert.strictEqual(r.reason, '章内知识点全未命中');
  assert.deepStrictEqual(r.units, ['第一章 集合'], '单元仍保留（A 可以记账，K 不能）');
});

test('matchByJev：难题不再被阈值丢弃（§6.10 的回归）', async () => {
  // 难题特征：一段 top-1 只有 0.72（低于 0.8），但排名是对的
  const groups = { '第一章 集合': ['子集'], '第五章 三角函数': ['三角函数'] };
  const c = threeStage({ '第一章 集合': 0.72, '第五章 三角函数': 0.02 }, { 子集: 0.9 });
  const r = await matchByJev(c, '新定义难题', groups);
  assert.strictEqual(r.hit, true, '0.72 的难题必须能命中（旧实现卡 0.8 会整题丢掉）');
  assert.deepStrictEqual(r.units, ['第一章 集合']);
});

test('matchByJev：无候选章节 → 直接返回，不调网络', async () => {
  let called = false;
  const c = { ask: async () => { called = true; } };
  const r = await matchByJev(c, 't', {});
  assert.strictEqual(r.hit, false);
  assert.strictEqual(called, false);
});

// ---- client ----
test('client：HTTP 失败抛带 status 的错误', async () => {
  const c = createJevClient({
    apiKey: 'k',
    fetch: async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'supports 1-255 options' } }) }),
  });
  await assert.rejects(() => c.ask('s', {}), /HTTP 400/);
});

// 回归：noul 不能带 criteria（2026-10-06 实测踩坑）
// 带上 criteria 后 Jev 不报错，但对所有 noul 项返回同一个常数（≈0.72），
// 区分度完全丧失 → 第一段把 6 个章节全判成未命中。
test('回归：noul 请求体绝不能带 criteria 字段', async () => {
  const chapters = ['第一章 集合', '第五章 三角函数'];
  let captured = null;
  const c = { ask: async (state, questions) => {
    captured = questions;
    return { answers: nouls('c', chapters, { '第一章 集合': 0.92, '第五章 三角函数': 0.01 }) };
  } };
  await pickUnits(c, '求交集', chapters);
  for (const [id, q] of Object.entries(captured)) {
    assert.strictEqual(q.type, 'noul');
    assert.strictEqual(q.criteria, undefined, `noul 项 ${id} 不得带 criteria（会让概率退化成常数）`);
    assert.ok(typeof q.instructions === 'string' && q.instructions.length > 0, '必须有 instructions');
  }
});

test('回归：二段 noul 同样不得带 criteria，且要把知识点名写进 instructions', async () => {
  let captured = null;
  const c = { ask: async (state, questions) => { captured = questions; return { answers: nouls('k', ['并集'], { 并集: 0.9 }) }; } };
  await pickPoints(c, '求并集', ['并集', '交集']);
  for (const [id, q] of Object.entries(captured)) {
    assert.strictEqual(q.criteria, undefined, `noul 项 ${id} 不得带 criteria`);
  }
  assert.ok(captured.k0.instructions.includes('并集'), '知识点名要写进 instruction');
  assert.ok(captured.k1.instructions.includes('交集'), '每个候选取自己的名字');
});

// 2026-10-07：二段问法必须问「是否用到」，不能问「是否考查」
//   背景：问「是否考查 X」时，Jev 产出高度集中在通用元概念（10 道题只 8 个不同知识点，
//         具体标签仅 1 个），「同一处丢过几次」拿不到能定位问题的标签。
//         改成「是否用到 X 的定义/性质/表示/运算/关系」后，具体标签 2 → 11。
//   这条测试锁住问法，防止被无声改回去。
test('二段问法：必须问「是否用到」，不得回到「是否考查」', async () => {
  let captured = null;
  const c = { ask: async (s, questions) => { captured = questions; return { answers: nouls('k', ['并集'], { 并集: 0.9 }) }; } };
  await pickPoints(c, '求并集', ['并集']);
  const ins = captured.k0.instructions;
  assert.ok(ins.includes('是否用到了'), '要问「是否用到了」（实测具体标签召回高 5.5 倍）');
  assert.ok(!ins.includes('是否考查'), '不得回到「是否考查」问法');
  // 实测教训：加"只是顺带提一句不算"这类排除条件，Jev 会按字面把结果压死（3.6 → 1.4）
  assert.ok(!ins.includes('顺带') && !ins.includes('不算'),
    '不得加排除条件 —— 实测会让 Jev 按字面把产出压死');
});

test('区分度：概率必须能区分命中/不命中（防止退化成常数）', async () => {
  const chapters = ['第一章 集合', '第五章 三角函数'];
  const c = mockClient([nouls('c', chapters, { '第一章 集合': 0.92, '第五章 三角函数': 0.01 })]);
  const r = await pickUnits(c, 't', chapters);
  assert.deepStrictEqual(r.units, ['第一章 集合']);
  assert.ok(Math.abs(r.probs['第一章 集合'] - r.probs['第五章 三角函数']) > 0.5,
    '命中与不命中的概率必须拉开差距（否则说明 noul 退化了）');
});
