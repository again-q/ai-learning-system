// ============ 拆考点节点测试（D2） ============
// 不联网不连库：llm 用假序列夹具，知识图谱用内存 fixture。
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildChapterIndex } = require('../src/lib/knowledgeGraph');
const { decomposePointsNode, buildStep1System, buildStep3System, resolvePicks } = require('../src/nodes/decomposePoints');

// ---------- fixture：迷你图谱（两章，验证候选/跨章/other） ----------
const FIX_NODES = [
  { name: '集合的表示（列举法/描述法）', chapter: '第一章 集合与常用逻辑用语' },
  { name: '交集与并集', chapter: '第一章 集合与常用逻辑用语' },
  { name: '子集与真子集', chapter: '第一章 集合与常用逻辑用语' },
  { name: '一元二次不等式', chapter: '第二章 一元二次函数、方程和不等式' },
  { name: '基本不等式', chapter: '第二章 一元二次函数、方程和不等式' },
  { name: '函数的概念', chapter: '第三章 函数的概念与性质' },
  { name: '函数的单调性', chapter: '第三章 函数的概念与性质' },
  // 重复名只算一次
  { name: '交集与并集', chapter: '第一章 集合与常用逻辑用语' },
];
const kg = buildChapterIndex(FIX_NODES);

// 顺序假 llm：按调用次序吐结果
function seqLlm(results) {
  let i = 0;
  const f = async () => {
    const r = results[Math.min(i, results.length - 1)];
    i++;
    return typeof r === 'function' ? r() : r;
  };
  f.calls = () => i;
  return f;
}

const Q = '已知集合 A={1,2,3}，B={2,3,4}，求 A∩B。';

test('buildChapterIndex：去重、排序、按章取候选', () => {
  assert.deepEqual(kg.chapters, ['第一章 集合与常用逻辑用语', '第三章 函数的概念与性质', '第二章 一元二次函数、方程和不等式']);
  const pts = kg.getPointsByChapter('第一章 集合与常用逻辑用语');
  assert.equal(pts.length, 3);
  assert.ok(pts.includes('交集与并集'));
  assert.equal(kg.getPointsByChapter('不存在的章').length, 0);
});

test('resolvePicks：编号还原 + dkp + 越界报 issue', () => {
  const r = resolvePicks([{
    ch: '第一章 集合与常用逻辑用语',
    numbered: '  1. 集合的表示（列举法/描述法）\n  2. 交集与并集\n  3. 子集与真子集',
    step3: { pointIds: [2], dkps: { '2': 0.6 }, other: [], outOfSyllabus: false },
  }]);
  assert.equal(r.issues.length, 0);
  assert.deepEqual(r.got, [{ name: '交集与并集', chapter: '第一章 集合与常用逻辑用语', dkp: 0.6 }]);

  const bad = resolvePicks([{
    ch: '第一章 集合与常用逻辑用语',
    numbered: '  1. 集合的表示（列举法/描述法）',
    step3: { pointIds: [99], dkps: {}, other: [], outOfSyllabus: false },
  }]);
  assert.ok(bad.issues.some((i) => i.includes('越界')));
});

test('resolvePicks：other 双门槛（name/elementType/reason 缺一不可）', () => {
  const good = resolvePicks([{
    ch: '第一章 集合与常用逻辑用语',
    numbered: '  1. 集合的表示（列举法/描述法）',
    step3: {
      pointIds: [], dkps: {}, outOfSyllabus: false,
      other: [{ name: '真子集的个数公式', elementType: '性质', reason: '标准解法要数子集，图谱无此点' }],
    },
  }]);
  assert.equal(good.issues.length, 0);
  assert.equal(good.got[0].isOther, true);

  const bad = resolvePicks([{
    ch: '第一章 集合与常用逻辑用语',
    numbered: '  1. 集合的表示（列举法/描述法）',
    step3: { pointIds: [], dkps: {}, outOfSyllabus: false, other: [{ name: '缺门槛的点', elementType: '', reason: '' }] },
  }]);
  assert.ok(bad.issues.some((i) => i.includes('other 双门槛')));
});

test('节点：正常拆解（两章、编号勾选还原、dkp、other、无 issue）', async () => {
  const llm = seqLlm([
    { chapters: ['第一章 集合与常用逻辑用语', '第二章 一元二次函数、方程和不等式'] },
    { pointIds: [2], dkps: { '2': 0.5 }, other: [], outOfSyllabus: false }, // 第一单元
    { pointIds: [1], dkps: { '1': 0.8 }, other: [], outOfSyllabus: false }, // 第二单元
  ]);
  const out = await decomposePointsNode({ question: Q, llm, kg });
  assert.equal(out.ok, true);
  assert.equal(out.chapters.length, 2);
  assert.deepEqual(out.pointList, [
    { name: '交集与并集', chapter: '第一章 集合与常用逻辑用语', dkp: 0.5 },
    { name: '一元二次不等式', chapter: '第二章 一元二次函数、方程和不等式', dkp: 0.8 },
  ]);
  assert.equal(out.other.length, 0);
  assert.equal(llm.calls(), 3); // 1 步① + 2 步③
});

test('节点：候选外的核心考点必须走 other 通道', async () => {
  const llm = seqLlm([
    { chapters: ['第一章 集合与常用逻辑用语'] },
    {
      pointIds: [1], dkps: { '1': 0.3 }, other: [
        { name: '集合元素互异性验证', elementType: '性质', reason: '含参集合须验互异，图谱叶子未单列' },
      ],
      outOfSyllabus: false,
    },
  ]);
  const out = await decomposePointsNode({ question: Q, llm, kg });
  assert.equal(out.ok, true);
  assert.equal(out.pointList.length, 1);
  assert.equal(out.other.length, 1);
  assert.equal(out.other[0].name, '集合元素互异性验证');
});

test('节点：步① 章名在表外 → 过滤后无有效章 → 明确失败', async () => {
  const llm = seqLlm([{ chapters: ['第九章 不存在'] }]);
  const out = await decomposePointsNode({ question: Q, llm, kg });
  assert.equal(out.ok, false);
  assert.ok(String(out.error).includes('步①'));
});

test('节点：缺 llm / 缺 kg / 空题面 → 明确报错', async () => {
  await assert.rejects(() => decomposePointsNode({ question: Q, kg }), /缺少 llm/);
  await assert.rejects(() => decomposePointsNode({ question: Q, llm: seqLlm([{}]) }), /缺少 kg/);
  await assert.rejects(() => decomposePointsNode({ question: '  ', llm: seqLlm([{}]), kg }), /缺/);
});

test('prompt 模板冒烟：编号与强约束都在', () => {
  const s1 = buildStep1System(kg.chapters);
  assert.ok(s1.includes('只能从这些里选'));
  assert.ok(kg.chapters.every((c) => s1.includes(c)));
  const { sys } = buildStep3System(['a', 'b']);
  assert.ok(sys.includes('pointIds'));
  assert.ok(sys.includes('other'));
  assert.ok(sys.includes('禁止'));
});
