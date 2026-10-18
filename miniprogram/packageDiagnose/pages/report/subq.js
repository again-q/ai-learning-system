// ============ 小问切分（前端） ============
// 只用于「渲染入口位置」，不做 AI 判断；真正的切分在后端生成时以题面为准。
//
// ⚠️ 校验规则必须与后端 `cloudfunctions/reportService/lib/subThinking/splitter.js` 保持一致，
//    否则会出现「前端显示三个入口、后端只认一个」的错位。
//    前端没有 require 后端的条件（分包限制），所以这里是**精简副本**；
//    改动任一侧时，另一侧必须同步（见 doc/detailed/这一问怎么想的_详细设计.md §3.2）。

const ASK_VERBS = [
  '判断', '证明', '求', '若', '已知', '解', '设', '用',
  '写出', '计算', '说明', '化', '比较', '作出', '画出',
];
const MIN_GAP = 8;
const MAX_SUBS = 6;

function stripWs(s) {
  return String(s || '').replace(/[$\s]/g, '');
}

/**
 * 检测小问标记（三重校验，与后端一致）
 * @returns {{ok:boolean, nums:number[], marks:Array}}
 */
function detectSubMarks(text) {
  const src = String(text || '');
  const marks = [];
  const re = /[(（]\s*(\d+)\s*[)）]/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    marks.push({ start: m.index, end: m.index + m[0].length, n: Number(m[1]) });
  }
  if (marks.length < 2) return { ok: false, nums: [], marks };

  const nums = marks.map((x) => x.n);
  const expect = nums.map((_, i) => i + 1);
  if (nums.join(',') !== expect.join(',')) return { ok: false, nums, marks };

  for (const mk of marks) {
    const after = stripWs(src.slice(mk.end, mk.end + 14));
    if (!ASK_VERBS.some((v) => after.startsWith(v))) return { ok: false, nums, marks };
  }
  for (let i = 0; i < marks.length - 1; i++) {
    const gap = stripWs(src.slice(marks[i].end, marks[i + 1].start));
    if (gap.length < MIN_GAP) return { ok: false, nums, marks };
  }
  return { ok: true, nums, marks };
}

/**
 * 切出用于渲染的小问列表。
 * @param {object} q 加工后的题目对象（含 textNodes / yourWork / brokenCount）
 * @returns {Array<{subNo, studentWork, wrong}>}
 */
function splitForDisplay(q) {
  const text = String((q && q.rawQuestionText) || '');
  const det = detectSubMarks(text);

  if (!det.ok || det.nums.length > MAX_SUBS) {
    return [{ subNo: '全题', studentWork: '', wrong: !!(q && q.brokenCount) }];
  }

  // 学生作答按小问切（切不出则整段归第一问）
  const work = String((q && q.yourWork) || '');
  const parts = splitByMarks(work, det.nums);

  return det.nums.map((n, i) => {
    // 判定是否「错」：多问时无法精确对应，退化为「该段是否含断点关键词」
    // —— 这里只影响 ✓/✗ 标记，不影响入口是否显示（PRD N3-改：所有小问都有入口）
    const seg = parts[i] || '';
    const wrong = !!(q && q.brokenCount) && (i === det.nums.length - 1 || seg.length > 0);
    return { subNo: '(' + n + ')', studentWork: seg, wrong };
  });
}

function splitByMarks(work, nums) {
  if (!work.trim()) return nums.map(() => '');
  const marks = [];
  const re = /[(（]\s*(\d+)\s*[)）]/g;
  let m;
  while ((m = re.exec(work)) !== null) {
    if (nums.indexOf(Number(m[1])) >= 0) marks.push({ start: m.index, n: Number(m[1]) });
  }
  const found = [];
  marks.forEach((x) => { if (found.indexOf(x.n) < 0) found.push(x.n); });
  found.sort((a, b) => a - b);
  if (found.join(',') !== nums.join(',')) {
    return nums.map((_, i) => (i === 0 ? work.trim() : ''));
  }
  return marks.map((mk, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].start : work.length;
    return work.slice(mk.start, end).trim();
  });
}

module.exports = { detectSubMarks, splitForDisplay, splitByMarks };
