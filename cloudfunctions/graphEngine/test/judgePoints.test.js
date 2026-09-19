// ============ D3 环节判定节点 · 假依赖单测（不联网、不连库） ============
// 覆盖：空白短路 / 三档钳制 / noEvidence 不带分 / 编造点丢弃 / 名称归一 / 漏点不静默 / 超前点 / basis 缺失 / 非法 state
const test = require('node:test');
const assert = require('node:assert/strict');
const { judgePointsNode, buildJudgeSystem, verifyAndNormalize } = require('../src/nodes/judgePoints');
const pkp = require('../src/lib/pkp');

const POINTS = [
  { name: '一元二次不等式', chapter: '第二章 一元二次函数、方程和不等式' },
  { name: '因式分解', chapter: '第二章 一元二次函数、方程和不等式' },
  { name: '子集与真子集', chapter: '第一章 集合与常用逻辑用语' },
];
const Q = '解不等式 x²−5x+6>0。';

function fakeLlm(out) {
  let n = 0;
  const f = async () => { n++; return out; };
  f.calls = () => n;
  return f;
}

test('空白题：短路不调 llm，全 blank + P_kp=0 + auto=true', async () => {
  const llm = fakeLlm({ points: [] });
  const r = await judgePointsNode({ question: Q, points: POINTS, trace: { answer: '', segments: [], breakpoint: '起步即停' }, llm });
  assert.equal(llm.calls(), 0, '空白不应调用模型');
  assert.equal(r.blank, true);
  assert.equal(r.llmCalls, 0);
  assert.equal(r.points.length, 3);
  assert.ok(r.points.every((p) => p.state === 'blank' && p.P_kp === 0 && p.auto === true));
});

test('clampPkp：≥1→1；0<v<1→0.5；≤0→0；无法解析→null', () => {
  assert.equal(pkp.clampPkp(0.9), 0.5);
  assert.equal(pkp.clampPkp(1.2), 1);
  assert.equal(pkp.clampPkp(-1), 0);
  assert.equal(pkp.clampPkp(1), 1);
  assert.equal(pkp.clampPkp(0.5), 0.5);
  assert.equal(pkp.clampPkp(null), null);
  assert.equal(pkp.clampPkp('abc'), null);
});

test('judged 点：三档规整 + basis 保留', async () => {
  const llm = fakeLlm({ points: [
    { name: '因式分解', state: 'judged', P_kp: 0.9, basis: '(x−2)(x−3)>0' },
    { name: '一元二次不等式', state: 'judged', P_kp: 0, basis: '所以 2<x<3' },
    { name: '子集与真子集', state: 'noEvidence', P_kp: null, basis: '未涉及' },
  ], eta: 0.4, note: 'ok' });
  const r = await judgePointsNode({ question: Q, points: POINTS, trace: '解：…', llm });
  assert.equal(r.ok, true);
  const by = Object.fromEntries(r.points.map((p) => [p.name, p]));
  assert.equal(by['因式分解'].P_kp, 0.5, '0.9 应钳成 0.5');
  assert.equal(by['一元二次不等式'].P_kp, 0, '本身做错 → 0（决策 043）');
  assert.equal(by['子集与真子集'].state, 'noEvidence');
  assert.equal(by['子集与真子集'].P_kp, null);
  assert.equal(r.eta, 0.4);
});

test('编造/越界点：被丢弃并记 issue，不进结果', async () => {
  const llm = fakeLlm({ points: [
    { name: '因式分解', state: 'judged', P_kp: 1, basis: 'x' },
    { name: '洛必达法则', state: 'judged', P_kp: 1, basis: 'x' },
    { name: '一元二次不等式', state: 'judged', P_kp: 1, basis: 'x' },
    { name: '子集与真子集', state: 'noEvidence', P_kp: null, basis: '未涉及' },
  ] });
  const r = await judgePointsNode({ question: Q, points: POINTS, trace: '解：…', llm });
  assert.ok(r.issues.some((i) => i.includes('编造/越界点: 洛必达法则')));
  assert.equal(r.points.some((p) => p.name === '洛必达法则'), false);
});

test('名称归一：模型把「（章节）」抄回来也能对齐（F1 修复）', async () => {
  const llm = fakeLlm({ points: [
    { name: '因式分解（第二章 一元二次函数、方程与不等式）', state: 'judged', P_kp: 1, basis: 'x' },
    { name: '一元二次不等式（第二章 一元二次函数、方程与不等式）', state: 'judged', P_kp: 1, basis: 'x' },
    { name: '子集与真子集（第一章 集合与常用逻辑用语）', state: 'noEvidence', P_kp: null, basis: '未涉及' },
  ] });
  const r = await judgePointsNode({ question: Q, points: POINTS, trace: '解：…', llm });
  assert.equal(r.ok, true, JSON.stringify(r.issues));
  assert.deepEqual(r.points.map((p) => p.name).sort(), POINTS.map((p) => p.name).sort());
  assert.equal(r.points.filter((p) => p.alignedFrom).length, 3);
});

test('漏点：不静默，记 issue', async () => {
  const llm = fakeLlm({ points: [
    { name: '因式分解', state: 'judged', P_kp: 1, basis: 'x' },
  ] });
  const r = await judgePointsNode({ question: Q, points: POINTS, trace: '解：…', llm });
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.includes('漏点')));
});

test('judged 缺 basis / 缺 P_kp / 非法 state：都被记 issue 且不崩', () => {
  const v = verifyAndNormalize([
    { name: '因式分解', state: 'judged', P_kp: 1, basis: '' },
    { name: '一元二次不等式', state: 'judged', basis: 'x' },
    { name: '子集与真子集', state: 'weird', P_kp: 1, basis: 'x' },
  ], POINTS);
  assert.ok(v.issues.some((i) => i.includes('缺 basis')));
  assert.ok(v.issues.some((i) => i.includes('缺 P_kp')));
  assert.ok(v.issues.some((i) => i.includes('非法 state')));
  const by = Object.fromEntries(v.points.map((p) => [p.name, p]));
  assert.equal(by['子集与真子集'].state, 'noEvidence', '非法 state 纠正为 noEvidence');
});

test('noEvidence 带分：记 issue 并把分抹掉', () => {
  const v = verifyAndNormalize([
    { name: '因式分解', state: 'noEvidence', P_kp: 0.5, basis: '未涉及' },
  ], POINTS);
  assert.ok(v.issues.some((i) => i.includes('noEvidence 点带分')));
  assert.equal(v.points[0].P_kp, null);
});

test('isAhead：learnedChapters=null 恒 false（决策 040）；传数组时未学章为 true', async () => {
  const mk = (learned) => fakeLlm({ points: POINTS.map((p) => ({ name: p.name, state: 'noEvidence', P_kp: null, basis: '未涉及' })) });
  const r1 = await judgePointsNode({ question: Q, points: POINTS, trace: '解：…', llm: mk(), derived: { learnedChapters: null } });
  assert.ok(r1.points.every((p) => p.isAhead === false));
  const r2 = await judgePointsNode({ question: Q, points: POINTS, trace: '解：…', llm: mk(), derived: { learnedChapters: ['第一章 集合与常用逻辑用语'] } });
  const by = Object.fromEntries(r2.points.map((p) => [p.name, p]));
  assert.equal(by['因式分解'].isAhead, true, '第二章未学 → 超前');
  assert.equal(by['子集与真子集'].isAhead, false, '第一章已学 → 非超前');
});

test('buildJudgeSystem：三问判据在，模糊时追加降级提示（决策 039-J）', () => {
  const s = buildJudgeSystem(POINTS, {});
  assert.ok(s.includes('这一步【本身】做对了吗'), '应含第二问');
  assert.ok(s.includes('这一步本身对不对'), '应含 0/0.5 判据');
  assert.ok(s.includes('不得新增点'), '应禁止编造');
  const b = buildJudgeSystem(POINTS, { traceBlurry: true });
  assert.ok(b.includes('字迹模糊'), '模糊时应追加降级提示');
  const c = buildJudgeSystem([], {});
  assert.ok(c.length > 0, '空清单也要能构造（由节点入口拦截）');
});