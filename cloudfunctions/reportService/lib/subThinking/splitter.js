// ============ 小问切分 ============
// 把一道解答题的题面 / 学生作答 / 参考过程按 (1)(2)(3) 切开。
//
// ⚠️ 2026-10-18 实测踩到的坑（已写进详细设计 §3.2.2）：
//    「已知 f(x)=(1)x^2，求 f(2) 的值」会被正则抓出 ['1','2']，
//    但 (1) 是系数、(2) 是函数自变量 —— 都不是小问。
//    不加校验就会把单问题切成两问，白烧两次生成。
//
// 校验方向：**宁可漏判，不可误判**。
//    漏判 = 退化成整题（多花一点钱）；误判 = 生成两次无意义内容（更差）。
'use strict';

// 题面里小问后面会跟的设问动词（跳过 $ 与空白后比对）
const ASK_VERBS = [
  '判断', '证明', '求', '若', '已知', '解', '设', '用',
  '写出', '计算', '说明', '化', '比较', '作出', '画出',
];

const MIN_GAP = 8;          // 相邻小问之间的最少实质字符数
const MAX_SUBS = 6;         // 超过这个数视为切分错误

/** 剥掉 LaTeX 定界符与空白，用于「标记后是不是设问动词」的判断 */
function stripWs(s) {
  return String(s || '').replace(/[$\s]/g, '');
}

/**
 * 从题面检测小问标记，三重校验全部通过才算数。
 * @returns {{ok: boolean, nums: number[], marks: Array<{start:number,end:number,n:number}>, reason: string}}
 */
function detectSubMarks(text) {
  const src = String(text || '');
  const marks = [];
  const re = /[(（]\s*(\d+)\s*[)）]/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    marks.push({ start: m.index, end: m.index + m[0].length, n: Number(m[1]) });
  }

  if (marks.length < 2) {
    return { ok: false, nums: [], marks, reason: '标记少于 2 个' };
  }

  // 校验 a：编号必须从 1 开始连续递增
  const nums = marks.map((x) => x.n);
  const expect = Array.from({ length: nums.length }, (_, i) => i + 1);
  if (nums.join(',') !== expect.join(',')) {
    return { ok: false, nums, marks, reason: `编号不连续或未从 1 开始：[${nums.join(',')}]` };
  }

  // 校验 b：每个标记后（跳过 $ 与空白）必须紧跟设问动词
  for (const mk of marks) {
    const after = stripWs(src.slice(mk.end, mk.end + 14));
    if (!ASK_VERBS.some((v) => after.startsWith(v))) {
      return { ok: false, nums, marks, reason: `(${mk.n}) 后面不是设问：${after.slice(0, 8)}` };
    }
  }

  // 校验 c：相邻两个标记之间必须有实质内容
  for (let i = 0; i < marks.length - 1; i++) {
    const gap = stripWs(src.slice(marks[i].end, marks[i + 1].start));
    if (gap.length < MIN_GAP) {
      return { ok: false, nums, marks, reason: `(${nums[i]})→(${nums[i + 1]}) 间隔过短` };
    }
  }

  return { ok: true, nums, marks, reason: 'ok' };
}

/** 按标记位置切题面，得到每个小问的设问文本 */
function sliceAsks(text, marks) {
  const src = String(text || '');
  return marks.map((mk, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].start : src.length;
    return src.slice(mk.start, end).trim();
  });
}

/**
 * 按同样的小问编号切学生作答。
 * 学生作答里通常没有 (1)(2) 标记 —— 切不出就整段归第一问，其余留空。
 */
function sliceStudentWork(work, nums) {
  const src = String(work || '');
  if (!src.trim() || nums.length <= 1) return nums.map(() => src.trim());

  const marks = [];
  const re = /[(（]\s*(\d+)\s*[)）]/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (nums.includes(Number(m[1]))) marks.push({ start: m.index, n: Number(m[1]) });
  }
  // 学生作答里的小问标记必须覆盖全部编号，才敢按它切
  const found = [...new Set(marks.map((x) => x.n))].sort((a, b) => a - b);
  if (found.join(',') !== nums.join(',')) {
    return nums.map((_, i) => (i === 0 ? src.trim() : ''));
  }
  return marks.map((mk, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].start : src.length;
    return src.slice(mk.start, end).trim();
  });
}

/** 参考过程的步骤自带「第(1)问」/「第一步」等描述，按小问编号归组 */
function groupRefSteps(refSteps, nums) {
  const list = Array.isArray(refSteps) ? refSteps : [];
  if (nums.length <= 1) return [list];
  const buckets = nums.map(() => []);
  let lastIdx = 0;
  for (const st of list) {
    const label = String((st && (st.step || st.title)) || '');
    // 只认「第(1)问」「第1问」「(1)」这类明确指小问的写法
    const mm = /第\s*[（(]?\s*(\d+)\s*[)）]?\s*问/.exec(label) || /[（(]\s*(\d+)\s*[)）]/.exec(label);
    if (mm) {
      const idx = nums.indexOf(Number(mm[1]));
      if (idx >= 0) lastIdx = idx;
    }
    buckets[lastIdx].push(st);
  }
  return buckets;
}

/**
 * 主入口：切分小问。
 *
 * @param {object} args
 * @param {string} args.questionText    题面
 * @param {string} args.studentWork     学生作答
 * @param {Array}  args.referenceProcess 参考过程
 * @param {object} args.question        题目记录（用于 isWrong）
 * @returns {{subQuestions: Array, splitFallback: boolean, reason: string}}
 */
function splitSubQuestions({ questionText, studentWork, referenceProcess, question }) {
  const q = question || {};
  const det = detectSubMarks(questionText);

  // 切不出 → 整题作为一问
  if (!det.ok) {
    return {
      subQuestions: [buildSub('全题', String(questionText || ''), String(studentWork || '').trim(),
        Array.isArray(referenceProcess) ? referenceProcess : [], q)],
      splitFallback: true,
      reason: det.reason,
    };
  }

  // 数量过多 → 视为切分错误
  if (det.nums.length > MAX_SUBS) {
    return {
      subQuestions: [buildSub('全题', String(questionText || ''), String(studentWork || '').trim(),
        Array.isArray(referenceProcess) ? referenceProcess : [], q)],
      splitFallback: true,
      reason: `小问数量 ${det.nums.length} 超过上限 ${MAX_SUBS}`,
    };
  }

  const asks = sliceAsks(questionText, det.marks);
  const works = sliceStudentWork(studentWork, det.nums);
  const refGroups = groupRefSteps(referenceProcess, det.nums);

  const subQuestions = det.nums.map((n, i) => buildSub(
    `(${n})`,
    asks[i] || '',
    works[i] || '',
    refGroups[i] || [],
    q,
    i,
  ));

  // 交叉校验：切分后学生作答拼起来不能凭空丢内容
  const joined = works.join('').replace(/\s/g, '');
  const origin = String(studentWork || '').replace(/\s/g, '');
  if (origin && joined.length < origin.length * 0.9) {
    return {
      subQuestions: [buildSub('全题', String(questionText || ''), String(studentWork || '').trim(),
        Array.isArray(referenceProcess) ? referenceProcess : [], q)],
      splitFallback: true,
      reason: '切分后作答内容丢失超过 10%',
    };
  }

  return { subQuestions, splitFallback: false, reason: 'ok' };
}

function buildSub(subNo, ask, studentWork, refSteps, question, index) {
  return {
    subNo,
    ask,
    studentWork,
    refSteps,
    isWrong: isSubWrong(question, index),
  };
}

/**
 * 该小问是否被判错（只用于显示 ✓/✗ 标记，不用于隐藏入口）。
 * PRD N3-改：所有小问都给入口。
 */
function isSubWrong(question, index) {
  const q = question || {};
  // 优先官方三态
  if (q.officialStatus && q.officialStatus !== '未判') {
    if (q.officialStatus === '对') return false;
    // 半对/错：多问时无法细分，标为「要注意」→ 视为 wrong=false 但由 segs 兜底
    if (q.officialStatus === '错') return true;
  }
  const segs = Array.isArray(q.segments) ? q.segments : [];
  if (!segs.length) {
    const p = q.processScore;
    return p != null && p < 1;
  }
  // 有分段：找与学生作答位置对应的段，看是否为断
  const brokenCount = segs.filter((s) => s.status === '断' || s.status === '空白').length;
  if (!brokenCount) return false;
  // 简化：多问时按比例粗分，不强求精确对应（显示用）
  return true;
}

module.exports = { splitSubQuestions, detectSubMarks, sliceAsks, sliceStudentWork, groupRefSteps, MAX_SUBS };
