// 清洗层单元测试：样本毒点来自《交接包 2026-08-27》§7
const { sanitizeReport, sanitizeWeakpoint, isPoisonSentence } = require('/Users/apple/Desktop/ai-learning-system/cloudfunctions/reportService/sanitize.js');
let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } }

// wp1 = 交接包 §7 样本毒点（整题空白）
const wp1 = {
  breakpoint: { preview: '例2整题空白。', processAvailable: false, segments: [{ step: '未见下笔', status: '空白', evidence: '' }], confirmed: '', contradiction: '', closing: '' },
  rootcause: {
    preview: '空白题根因', phenomenon: '例 2 空白未作答。',
    directCause: '判定给出的归因：例 2 是「空白未作答，未理解复合函数定义域求解方法」……',
    sources: null, history: null,
    closing: '检索记录显示你这类题一直很稳，这次是第一次集中暴露。',
  },
  hook: { preview: '想一想', questions: ['问题1', '问题2', '问题3'], scaffold: '' },
};
// wp2 否定语境（不能误伤）
const wp2 = { breakpoint: { processAvailable: true, segments: [{ status: '断' }] },
  rootcause: { directCause: '你不是不会这类方法，而是当时没下笔。', history: [{ title: '旧题' }], closing: '把这一步找回来。' },
  hook: { questions: ['a', 'b'] } };
// wp3 合法历史叙事（history 有值，不能误伤）
const wp3 = { breakpoint: { processAvailable: true, segments: [{ status: '通' }] },
  rootcause: { directCause: '分类讨论遗漏了 B={-2} 的情况。', history: [{ title: '旧题' }], closing: '历史记录显示这类题你上次也断在同一步。' },
  hook: { questions: ['a', 'b'] } };
// wp4 选填错题（无过程但非空白，不能套空白模板）
const wp4 = { breakpoint: { processAvailable: false, segments: [] },
  rootcause: { phenomenon: '选择了 B，正确为 A。', directCause: '分类讨论遗漏了 B={-2} 的情况。', sources: ['对集合元素的理解有偏差'], history: null, closing: '对照题目条件再走一遍。' },
  hook: { questions: ['a', 'b'] } };

const report = { overview: { coreHint: '同卷含参定义域全对是能力锚点。判定给出的归因：未理解复合函数定义域求解方法。' }, weakpoints: [wp1, wp2, wp3, wp4], secondaryPatterns: [] };
sanitizeReport(report);
const r1 = report.weakpoints[0], r2 = report.weakpoints[1], r3 = report.weakpoints[2], r4 = report.weakpoints[3];

console.log('== 验收 1：全文无「未理解××方法」空白归因 ==');
check('wp1.directCause 降级', r1.rootcause.directCause.includes('原因待确认') && !r1.rootcause.directCause.includes('未理解'));
check('coreHint 好句保留', report.overview.coreHint.startsWith('同卷含参定义域全对是能力锚点'));
check('coreHint 毒句被替换', !report.overview.coreHint.includes('未理解'));

console.log('== 验收 2：空白题 sources 为并列假设 ==');
check('sources 补足 2 个', Array.isArray(r1.rootcause.sources) && r1.rootcause.sources.length >= 2);
check('默认假设措辞（判断权给学生）', r1.rootcause.sources.every((s) => s.includes('可能')));

console.log('== 验收 3：history===null 无历史编造 ==');
check('wp1.closing 降级', r1.rootcause.closing.includes('第一次') && !r1.rootcause.closing.includes('一直很稳'));

console.log('== 验收 4：钩子 <=2 ==');
check('questions 截到 2', r1.hook.questions.length === 2);

console.log('== 验收 5：否定语境/合法历史/选填错题 不误伤 ==');
check('wp2 否定句保留', r2.rootcause.directCause.startsWith('你不是不会'));
check('wp3 合法历史叙事保留', r3.rootcause.closing.includes('历史记录显示'));
check('wp4 directCause 不动', r4.rootcause.directCause === '分类讨论遗漏了 B={-2} 的情况。');
check('wp4 sources 不套空白模板', r4.rootcause.sources.length === 1 && r4.rootcause.sources[0].includes('集合'));

console.log('== 边界 ==');
check('isPoisonSentence 否定豁免', !isPoisonSentence('空白不等于未理解。'));
check('isPoisonSentence 命中', isPoisonSentence('未理解复合函数定义域求解方法。'));

console.log('---');
console.log('pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
