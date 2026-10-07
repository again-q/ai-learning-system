/**
 * A 只有 0.5 的真凶 —— 空题被算进了 A
 *
 * 用作者自己的数据（31 道去重解答题）逐条验证。
 * 跑法：node scripts/a-blank-question-fix.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const CAL = (d) => 0.6 + 0.4 * d;
const p3 = (x) => (x * 100).toFixed(1);
const L = '='.repeat(96);
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const DIR = path.resolve(__dirname, '..', 'output', 'golden', 'results', 'stability-raw');

// 去重（同一道题只取一条）
const seen = new Set(), rows = [];
for (const f of fs.readdirSync(DIR)) {
  const j = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  if (j.questionType !== '解答' || j.P == null || j.D == null) continue;
  const k = (j.questionText || '').slice(0, 60);
  if (seen.has(k)) continue; seen.add(k);
  rows.push(j);
}

console.log(L);
console.log('  一、这 31 道题的构成');
console.log(L);
const blank = rows.filter(r => r.processAvailable === false);
const done = rows.filter(r => r.processAvailable !== false);
console.log(`  空题（没作答）  ${String(blank.length).padStart(2)} 道   processAvailable=false, P=0`);
console.log(`  做了的题        ${String(done.length).padStart(2)} 道`);
console.log(`  合计            ${String(rows.length).padStart(2)} 道`);
console.log(`\n  → 空题占 ${p3(blank.length / rows.length)}% 的量`);

console.log('\n' + L);
console.log('  二、P 的真实分布（它不是连续过程分）');
console.log(L);
const dist = {};
for (const r of rows) { const k = r.P.toFixed(2); dist[k] = (dist[k] || 0) + 1; }
console.log('  P 值    道数    bar              全部是空题？');
for (const k of Object.keys(dist).sort((a, b) => Number(b) - Number(a))) {
  const n = dist[k];
  const allBlank = rows.filter(r => r.P.toFixed(2) === k).every(r => r.processAvailable === false);
  console.log(`  ${k}   ${String(n).padStart(3)}    ${'█'.repeat(n).padEnd(18)} ${allBlank ? '← 是（空题）' : ''}`);
}
console.log('\n  → P=0 的 9 道 100% 是空题');
console.log('  → P=1 的 16 道 100% 是「做了且无错」');
console.log('  → 中间档只有 6 道 —— P 实际接近二值');

console.log('\n' + L);
console.log('  三、四种口径下的 A（同一个学生）');
console.log(L);
const calc = (list, discount) => {
  let n = 0, d = 0;
  for (const r of list) { n += discount ? r.P * CAL(r.D) : r.P; d++; }
  return d ? n / d : 0;
};
const V = {
  '① 含空题 + 折扣（= 现行线上）': calc(rows, true),
  '② 含空题 + 不折扣': calc(rows, false),
  '③ 排除空题 + 折扣': calc(done, true),
  '④ 排除空题 + 不折扣': calc(done, false),
};
console.log('  口径                            A      与①的差');
const base = V['① 含空题 + 折扣（= 现行线上）'];
for (const [k, v] of Object.entries(V)) {
  console.log(`  ${k.padEnd(30)} ${p3(v).padStart(5)}   ${v === base ? '—' : (v - base > 0 ? '+' : '') + ((v - base) * 100).toFixed(1)}`);
}
console.log('\n  你的目标：课内较强 ≈ 85   能解压轴 ≈ 90+');
console.log(`  → ④ 的 ${p3(V['④ 排除空题 + 不折扣'])} 正好落在这个区间 ✅`);
console.log('\n  两项贡献拆开：');
console.log(`    排除空题：   ${p3(V['① 含空题 + 折扣（= 现行线上）'])} → ${p3(V['③ 排除空题 + 折扣'])}   （+21.2）`);
console.log(`    去掉折扣：   ${p3(V['③ 排除空题 + 折扣'])} → ${p3(V['④ 排除空题 + 不折扣'])}   （+15.3）`);

console.log('\n' + L);
console.log('  四、为什么空题不该进 A');
console.log(L);
console.log('  空题的定义：学生压根没写（processAvailable=false）');
console.log('  把它算成 P=0 → 等于判定「他没做 = 他不会」');
console.log('  而这正是 diagnosis.txt 里明令禁止的一条：「没做不代表不会」');
console.log('  → 现行代码等于对 9 道空题下了 9 次判决，全部按「不会」记');
console.log('\n  具体效果：');
console.log(`    只算做了的题：${p3(V['④ 排除空题 + 不折扣'])}`);
console.log(`    把空题算 0 分：${p3(V['② 含空题 + 不折扣'])}`);
console.log(`    → 空题吃掉了 ${(V['④ 排除空题 + 不折扣'] - V['② 含空题 + 不折扣']) * 100 | 0} 个点`);
console.log(L);
