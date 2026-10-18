#!/usr/bin/env node
// subThinking 模块单测（零依赖，直接 node 跑）
// 用法：node scripts/test-subthinking.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const LIB = path.join(ROOT, 'cloudfunctions/reportService/lib/subThinking');
const { checkField } = require(path.join(LIB, 'corrector.js'));
const { decide } = require(path.join(LIB, 'verifier.js'));
const { validateThinking } = require(path.join(LIB, 'thinker.js'));
const { sanitizeCards, allNames } = require(path.join(LIB, 'cards.js'));
const { splitSubQuestions, detectSubMarks } = require(path.join(LIB, 'splitter.js'));

let pass = 0, fail = 0;
const t = (name, cond) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name); }
};

console.log('=== [1] 54 项思维清单 ===');
t('总数 = 54', allNames().length === 54);
t('不含花色符号', !allNames().some((n) => /[♠♥♦♣]/.test(n)));
t('牌号被剥：♠10 转化策略 → 转化策略', JSON.stringify(sanitizeCards(['♠10 转化策略'])) === '["转化策略"]');
t('自造名被剔', sanitizeCards(['我自己的思维']).length === 0);
t('最多保留 2 个', sanitizeCards(['转化策略', '构造法', '反证法']).length === 2);
t('重复名去重', sanitizeCards(['转化策略', '转化策略']).length === 1);

console.log('\n=== [2] 诊断更正白名单 ===');
['errorType', 'processScore', 'errorLevel', 'segments', 'breakpoint', 'officialScore', 'officialStatus']
  .forEach((f) => t(f + ' 被拒', checkField(f).ok === false));
['diagnosis.comment', 'diagnosis.inference', 'diagnosis.hook']
  .forEach((f) => t(f + ' 可写', checkField(f).ok === true));
t('未知名被拒', checkField('foo.bar').ok === false);

console.log('\n=== [3] 验证裁决（判断权在代码） ===');
t('成立 → pass', decide('成立') === 'pass');
t('部分成立 → partial', decide('部分成立') === 'partial');
t('不成立 → fail', decide('不成立') === 'fail');
t('无法识别 → fail（保守）', decide('大概可以吧') === 'fail');
t('空值 → fail', decide('') === 'fail');

console.log('\n=== [4] 思路结构校验 ===');
const step = { have: 'a', lack: 'b', why: 'c', do: 'd', thinking: { cards: ['转化策略'], say: 'x' } };
const good = { goal: 'g', steps: [step, step], ending: 'e' };
t('2 步通过（极简小问下限）', validateThinking(good) !== null);
t('1 步被拒', validateThinking({ ...good, steps: [step] }) === null);
t('9 步被拒（上限）', validateThinking({ ...good, steps: Array(9).fill(step) }) === null);
t('8 步通过（上限内）', validateThinking({ ...good, steps: Array(8).fill(step) }) !== null);
t('缺 why 被拒', validateThinking({ ...good, steps: [{ have: 'a', lack: 'b', do: 'd' }, step] }) === null);
t('缺 lack 被拒', validateThinking({ ...good, steps: [{ have: 'a', why: 'c', do: 'd' }, step] }) === null);

console.log('\n=== [5] 小问切分 ===');
const g = require(path.join(ROOT, 'output/golden/cases-过程审阅.json'));
for (const c of g.cases) {
  if (c.questionType !== '解答') continue;
  const det = detectSubMarks(c.questionText);
  const expect = c.questionNo === '19' ? '1,2,3' : '1,2';
  t(`第 ${c.questionNo} 题切分 = [${expect}]`, det.ok && det.nums.join(',') === expect);
}
t('误判防御：f(x)=(1)x^2 不切分',
  (() => { const d = detectSubMarks('已知 f(x)=(1)x^2，求 f(2) 的值'); return d.ok === false; })());
t('编号不连续被拒：只有 (2)(3)',
  detectSubMarks('(2) 求 x (3) 求 y 这里内容足够长').ok === false);

console.log('\n=== [6] 切分退化 ===');
const fb = splitSubQuestions({ questionText: '已知 f(x)=(1)x^2，求 f(2) 的值', studentWork: '', referenceProcess: [], question: {} });
t('退化后 subNo = 全题', fb.splitFallback === true && fb.subQuestions[0].subNo === '全题');

console.log('\n' + '='.repeat(50));
console.log(`通过 ${pass} · 失败 ${fail}`);
process.exit(fail ? 1 : 0);
