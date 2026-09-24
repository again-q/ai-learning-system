// ============ D4 · N3 整理归一 单测（纯函数，无 IO） ============
const test = require('node:test');
const assert = require('node:assert/strict');
const { clampParams, deriveAll, buildQuestionPatch, normalizeProcessFields, clampFiveDim } = require('../src/lib/normalize');

test('clampParams：D 落在等级区间内，未知等级用兜底区间', () => {
  assert.equal(clampParams({ level: 'L4', D: 0.9 }, '解答').D, 0.6, 'L4 上沿 0.6');
  assert.equal(clampParams({ level: 'L4', D: 0.1 }, '解答').D, 0.45, 'L4 下沿 0.45');
  assert.equal(clampParams({ level: 'L9', D: 0.91 }, '解答').D, 0.91, '区间内不动');
  assert.equal(clampParams({ level: 'X9', D: 0.5 }, '解答').D, 0.5, '未知等级兜底 [0.01,0.999]');
  assert.equal(clampParams({ level: 'X9', D: 9 }, '解答').D, 0.999, '兜底上限');
});

test('clampParams：P 连续 0~1 且四舍五入两位；eta 只有解答题才有', () => {
  assert.equal(clampParams({ level: 'L4', P: 0.876 }, '解答').P, 0.88);
  assert.equal(clampParams({ level: 'L4', P: 1.7 }, '解答').P, 1);
  assert.equal(clampParams({ level: 'L4', P: -3 }, '解答').P, 0);
  assert.equal(clampParams({ level: 'L4', P: 0.5, eta: 0.7 }, '解答').eta, 0.7);
  assert.equal(clampParams({ level: 'L4', P: 0.5, eta: 0.7 }, '选择').eta, null, '选填题 eta 必须为空');
  assert.equal(clampParams({ level: 'L4', P: 0.5 }, '解答').eta, null, '没给 eta 时为 null');
});

test('deriveAll：空白题 → 归因由代码推导，不采信模型解释', () => {
  const clamped = clampParams({ level: 'L4', P: 0 }, '解答');
  const d1 = deriveAll({ breakpoint: { nature: '起步即停' }, P: 0 }, { studentAnswer: '' }, clamped);
  assert.equal(d1.isBlank, true);
  assert.equal(d1.errorAttribution, '整题空白未下笔');
  assert.equal(d1.errorType, '结果错', 'P=0 → 结果错');
  assert.equal(d1.errorLevel, 'skill', '无 errorLevel 且无 errorDimension → 回退 skill');
  const d2 = deriveAll({ errorAttribution: '未理解某方法' }, { studentAnswer: '   ' }, clamped);
  assert.equal(d2.isBlank, true, '无答案且无分段也算空白');
  assert.equal(d2.errorAttribution, '整题空白未下笔', '空白必须覆盖模型给的臆测归因');
});

test('deriveAll：P≥0.5 时不给归因；模型给合法 errorType 就用它', () => {
  const clamped = clampParams({ level: 'L4', P: 0.8 }, '解答');
  const d = deriveAll({ errorType: '过程风险', errorAttribution: '漏了一步分类讨论', processAvailable: true, segments: [{ step: 'x' }] }, { studentAnswer: '答' }, clamped);
  assert.equal(d.isBlank, false);
  assert.equal(d.errorType, '过程风险');
  assert.equal(d.errorAttribution, null, 'P≥0.5 不给归因');
});

test('deriveAll：errorType 缺失时按 P 防御回退', () => {
  const mk = (P) => deriveAll({ processAvailable: true, segments: [{ step: 'x' }] }, { studentAnswer: '答' }, clampParams({ level: 'L4', P }, '解答'));
  assert.equal(mk(0.3).errorType, '结果错');
  assert.equal(mk(0.7).errorType, '过程风险');
  assert.equal(mk(1).errorType, '无');
  assert.equal(mk(1).errorLevel, null, '无错 → errorLevel 必须 null');
});

test('deriveAll：选填题（processAvailable=false）不允许过程风险', () => {
  const c1 = clampParams({ level: 'L4', P: 0.7 }, '选择');
  assert.equal(deriveAll({ errorType: '过程风险', processAvailable: false }, { studentAnswer: 'D' }, c1).errorType, '无', 'P>=0.5 → 无');
  const c2 = clampParams({ level: 'L4', P: 0.2 }, '选择');
  assert.equal(deriveAll({ errorType: '过程风险', processAvailable: false }, { studentAnswer: 'D' }, c2).errorType, '结果错', 'P<0.5 → 结果错');
});

// ⚠️ D5 对拍回归（2026-09-19）：原 deriveAll 直接用 raw.processAvailable 判「有无过程」，
//    选填题只要模型写了 processAvailable:true 就能被判「过程风险」→ 与线上不一致（线上是先归一、再推导）。
test('deriveAll：选填题即使模型声称 processAvailable=true，也不允许「过程风险」（D5 对拍回归）', () => {
  const q = { questionType: '选择' };
  const raw = { questionType: '选择', level: 'L1', P: 1, eta: 0.5, processAvailable: true, errorType: '过程风险', errorLevel: 'skill' };
  const d = deriveAll(raw, q, clampParams(raw, '选择'));
  assert.equal(d.errorType, '无', 'P=1 → 无，而不是过程风险');
  assert.equal(d.errorLevel, null, 'errorType=无 → errorLevel 必须 null');
  const raw2 = { ...raw, P: 0.3 };
  assert.equal(deriveAll(raw2, q, clampParams(raw2, '选择')).errorType, '结果错', 'P<0.5 → 结果错，而不是过程风险');
});

test('deriveAll：填空题无作答但模型给了过程分段 → 仍算空白（D5 对拍回归）', () => {
  const raw = { questionType: '填空', level: 'L3', P: 0, segments: [{ index: 1, content: 'x', status: '通' }], processAvailable: true };
  const d = deriveAll(raw, { questionType: '填空', studentAnswer: '' }, clampParams(raw, '填空'));
  assert.equal(d.isBlank, true, '选填题过程字段被归一清空 → 无答案即空白');
  assert.equal(d.errorAttribution, '整题空白未下笔');
});

test('deriveAll：errorLevel 缺失时按 errorDimension 映射', () => {
  const mk = (dim) => deriveAll({ errorType: '结果错', errorDimension: dim, processAvailable: true, segments: [{ step: 'x' }] }, { studentAnswer: '答' }, clampParams({ level: 'L4', P: 0.3 }, '解答'));
  assert.equal(mk('K').errorLevel, 'concept');
  assert.equal(mk('A').errorLevel, 'rule');
  assert.equal(mk('T').errorLevel, 'rule');
  assert.equal(mk('S').errorLevel, 'skill');
  assert.equal(mk(undefined).errorLevel, 'skill', '无维度也回退 skill');
});

test('deriveAll：pattern 三层拼装并限长', () => {
  const c = clampParams({ level: 'L4', P: 0.8 }, '解答');
  const long = 'x'.repeat(200);
  const d = deriveAll({ pattern: { domain: '集合', pattern: '集合概念辨析', variant: long }, processAvailable: true, segments: [{ step: 'x' }] }, { studentAnswer: '答' }, c);
  assert.equal(d.patternText, '集合概念辨析');
  assert.ok(d.patternFull.indexOf('集合 / 集合概念辨析 / ') === 0);
  assert.ok(d.patternFull.length <= 120, 'patternFull 不超过 120 字');
  const empty = deriveAll({}, { studentAnswer: '答' }, c);
  assert.equal(empty.patternFull, '', '没给 pattern 时为空串（落库时转 null）');
});

test('buildQuestionPatch：19 个字段齐全（与线上 questions.update 对齐）', () => {
  const raw = { questionType: '解答', correctAnswer: 'x=1', referenceProcess: [{ step: 'a', content: 'b', note: 'c' }], questionCategory: '集合', level: 'L4', D: 0.5, P: 1, eta: 0.9, knowledgeNodeName: '集合的表示', knowledgeUsage: [{ name: '集合的表示', P: 1, D: 0.3 }], fiveDim: { K: 1, A: 1, T: 1, Q: 1, S: 1 }, segments: [{ step: 'x', status: '通', evidence: 'y' }], breakpoint: null, processAvailable: true, pattern: { domain: '集合', pattern: '辨析', variant: 'v' } };
  const q = { questionType: '解答', studentAnswer: '答' };
  const c = clampParams(raw, '解答');
  const d = deriveAll(raw, q, c);
  const patch = buildQuestionPatch(raw, q, c, d);
  const need = ['questionType','correctAnswer','referenceProcess','questionCategory','difficultyLevel','difficultyValue','processScore','pathQuality','errorType','errorLevel','errorAttribution','pattern','knowledgeNodeName','knowledgeUsage','fiveDim','segments','breakpoint','processAvailable','reviewed'];
  need.forEach((k) => assert.ok(Object.prototype.hasOwnProperty.call(patch, k), '缺字段 ' + k));
  assert.equal(patch.difficultyValue, 0.5);
  assert.equal(patch.processScore, 1);
  assert.equal(patch.pathQuality, 0.9);
  assert.equal(patch.reviewed, true);
  assert.equal(patch.errorType, '无');
  assert.equal(patch.errorLevel, null);
  assert.equal(patch.errorAttribution, null);
});

// ============ 2026-09-19 审计后补的两道守卫（都来自生产数据暴露的问题） ============

test('选填题：即使模型给了过程分段/断点，落库也必须清空（生产里 2/28 违规）', () => {
  const raw = {
    questionType: '填空', P: 0.3, errorType: '结果错',
    segments: [{ step: '写了演算', status: '通', evidence: 'x=1' }],
    breakpoint: { index: 1, nature: '中途断' },
    processAvailable: true,
  };
  const patch = buildQuestionPatch(raw, { questionType: '填空' }, { D: 0.5, P: 0.3, eta: null }, { errorType: '结果错', errorLevel: 'skill', errorAttribution: 'x', patternFull: 'a / b / c' });
  assert.deepEqual(patch.segments, [], '选填题不允许带过程分段');
  assert.equal(patch.breakpoint, null, '选填题不允许有断点');
  assert.equal(patch.processAvailable, false, '选填题标记为无过程');
  // 解答题：原样保留
  const patch2 = buildQuestionPatch({ ...raw, questionType: '解答' }, { questionType: '解答' }, { D: 0.5, P: 0.3, eta: 0.7 }, { errorType: '结果错', errorLevel: 'skill', errorAttribution: 'x', patternFull: 'a / b / c' });
  assert.equal(patch2.segments.length, 1);
  assert.deepEqual(patch2.breakpoint, { index: 1, nature: '中途断' });
  assert.equal(patch2.processAvailable, true);
  assert.equal(normalizeProcessFields(raw, '选择').segments.length, 0);
  // 题型未知（智学网官方导入）→ 按「可能有过程」处理，不能清空
  const unknown = normalizeProcessFields(raw, '未知');
  assert.equal(unknown.segments.length, 1, '题型未知时不能清过程');
  assert.equal(unknown.processAvailable, true);
});

test('fiveDim 越界/缺失一律整组作废（宁缺勿假）', () => {
  assert.deepEqual(clampFiveDim({ K: 0.5, A: 0.8, T: 0.4, Q: 0.25, S: 0.6 }), { K: 0.5, A: 0.8, T: 0.4, Q: 0.25, S: 0.6 }, '五个都在 0~1 → 原样保留');
  assert.equal(clampFiveDim({ K: 0.5, A: 2, T: -1, Q: 0.25, S: 3 }), null, '越界不能钳成 1（那就等于把 3/5 说成 100%）');
  assert.equal(clampFiveDim({ K: 0.5, A: 0.8, T: 0.4, Q: 0.25, S: 3 }), null, '只要有一个越界，整组作废');
  assert.equal(clampFiveDim({ K: 0.7 }), null, '维度不全 → 作废');
  assert.equal(clampFiveDim(null), null);
  assert.equal(buildQuestionPatch({ fiveDim: null }, {}, { D: 0.5, P: 1, eta: null }, {}).fiveDim, null);
});
