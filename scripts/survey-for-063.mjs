#!/usr/bin/env node
// ============ 落地前实况勘察 v2（只读 · 修正集合名） ============
// v1 用错了集合名（question_records 不存在），本版改用代码里实际使用的 questions。
// 用法：node scripts/survey-for-063.mjs
import { find, runRaw } from './db.mjs';

const L = '='.repeat(96);
const show = (t) => console.log('\n' + L + '\n  ' + t + '\n' + L);
const tally = (arr, fn) => arr.reduce((a, x) => { const k = String(fn(x)); a[k] = (a[k] || 0) + 1; return a; }, {});

function countOf(t) {
  const r = runRaw({ find: t, filter: {}, limit: 20000, projection: { _id: 1 } });
  const arr = Array.isArray(r) ? r[0] : null;
  return Array.isArray(arr) ? arr.length : (arr && arr.data ? arr.data.length : 0);
}

show('一、集合规模（读完为止，上限 2 万）');
for (const t of ['knowledge_nodes', 'knowledge_progress', 'unit_progress', 'mastery_logs',
  'questions', 'batches', 'reports', 'node_requests', 'custom_nodes']) {
  try { console.log(`  ${t.padEnd(22)} ${countOf(t)}`); }
  catch (e) { console.log(`  ${t.padEnd(22)} ✖ ${String(e.message).slice(0, 70)}`); }
}

show('二、questions 全字段与形态');
const qs = find('questions', 5000);
console.log('  取到', qs.length, '条');
console.log('  字段:', JSON.stringify(Object.keys(qs[0] || {})));
console.log('  nodeStatus 分布:', JSON.stringify(tally(qs, (r) => r.nodeStatus || 'null')));
console.log('  isCorrect 分布:', JSON.stringify(tally(qs, (r) => r.isCorrect)));
const withUsage = qs.filter((r) => Array.isArray(r.knowledgeUsage) && r.knowledgeUsage.length);
console.log(`  带 knowledgeUsage: ${withUsage.length}/${qs.length}`);
console.log('  errorLevel 分布:', JSON.stringify(tally(qs, (r) => r.errorLevel || 'null')));
console.log('  difficulty 分布:', JSON.stringify(tally(qs, (r) => r.difficulty || 'null')));
console.log('  difficultyValue 分布:', JSON.stringify(tally(qs, (r) => r.difficultyValue != null ? 'has' : 'null')));
console.log('  difficultyLevel 分布:', JSON.stringify(tally(qs, (r) => r.difficultyLevel || 'null')));
console.log('  processScore 分布:', JSON.stringify(tally(qs, (r) => r.processScore != null ? 'has' : 'null')));

if (withUsage[0]) {
  show('三、knowledgeUsage 真实样本');
  const s = withUsage[0];
  console.log('  题目:', String(s.questionText || '').slice(0, 80));
  console.log('  knowledgeUsage:', JSON.stringify(s.knowledgeUsage, null, 1).slice(0, 1200));
  console.log('  difficulty:', s.difficulty, ' errorLevel:', s.errorLevel);
}

show('四、unit_progress 全量（A 的账）');
const up = find('unit_progress', 500);
for (const r of up) {
  console.log(`    ${String(r.unitName || '?').slice(0, 26).padEnd(28)} A=${r.aValue} U=${r.aUpper} n=${r.n} algo=${r.algorithm || 'null'}`);
}

show('五、knowledge_progress 算法与父子标记');
const kp = find('knowledge_progress', 500);
console.log('  algorithm:', JSON.stringify(tally(kp, (r) => r.algorithm || 'null')));
console.log('  aggregated:', JSON.stringify(tally(kp, (r) => r.aggregated === true)));
console.log('  evidence:', JSON.stringify(tally(kp, (r) => r.evidence || 'null')));
console.log('  mastery 分布 top:', JSON.stringify(Object.entries(tally(kp, (r) => r.mastery)).sort((a, b) => b[1] - a[1]).slice(0, 10)));

show('六、knowledge_nodes（图谱）');
const kn = find('knowledge_nodes', 5000, { knowledgeId: 1, name: 1, type: 1, partition: 1, parentId: 1, path: 1 });
console.log('  取到', kn.length, '条');
console.log('  type 分布:', JSON.stringify(tally(kn, (r) => r.type || 'null')));
console.log('  partition 分布:', JSON.stringify(tally(kn, (r) => r.partition || 'null')));
const paths = kn.map((r) => r.path).filter(Array.isArray);
console.log('  有 path 数组:', paths.length, ' 样本 path:', JSON.stringify(paths[0]));
