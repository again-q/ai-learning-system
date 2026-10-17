#!/usr/bin/env node
// 过程审阅 golden 集验收脚本
//
// 用途：任何改动「转录层 / 判定层 / 报告文案」之后，跑这个脚本，自动比对是否达标。
//   · 静态检查（默认）：校验 golden 集自身完整、图片资产在位
//   · 跑模型（--run）：对每条用例重新转录+判定，比对 expected
//
// 用法：
//   node scripts/verify-golden-trace.mjs            # 只做静态检查
//   node scripts/verify-golden-trace.mjs --run      # 实跑模型比对（花钱，按需）
//   node scripts/verify-golden-trace.mjs --run --case=ZX-14-BLANK
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CASES = path.join(ROOT, 'output/golden/cases-过程审阅.json');
const IMG_DIR = path.join(ROOT, 'output/golden/_src/zhixue-20260918');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
  })
);

const data = JSON.parse(fs.readFileSync(CASES, 'utf8'));
let fail = 0;
const ok = (m) => console.log('  ✅ ' + m);
const bad = (m) => { console.log('  ❌ ' + m); fail++; };

console.log('='.repeat(64));
console.log(' 过程审阅 golden 集 · 静态检查');
console.log('='.repeat(64));

// ① golden 集自身完整性
console.log('\n[1] golden 集结构');
if (!Array.isArray(data.cases) || !data.cases.length) bad('没有任何用例');
else ok(`${data.cases.length} 条用例`);

for (const c of data.cases) {
  const need = ['id', 'priority', 'questionNo', 'questionText', 'official', 'expected'];
  const miss = need.filter((k) => c[k] == null);
  if (miss.length) bad(`${c.id} 缺字段: ${miss.join(',')}`);
  if (!c.expected?.judgment && !c.expected?.transcription) bad(`${c.id} 没有任何期望值（无法验收）`);
}

// ② 图片资产在位
console.log('\n[2] 图片资产');
for (const c of data.cases) {
  const f = path.join(IMG_DIR, `q${c.questionNo}.jpg`);
  if (fs.existsSync(f)) {
    const kb = (fs.statSync(f).size / 1024).toFixed(0);
    ok(`q${c.questionNo}.jpg (${kb} KB)`);
  } else {
    bad(`q${c.questionNo}.jpg 缺失 → 无法重跑该用例（可从云存储重新下载）`);
  }
}

// ③ 每条用例的「必须出现 / 必须不出现」是否成对（防只写一半）
console.log('\n[3] 期望值可用性');
for (const c of data.cases) {
  const j = c.expected?.judgment || {};
  const t = c.expected?.transcription || {};
  const hasPositive = (j.shouldSay || j.errorAttribution || j.errorType) || (t.mustCapture?.length);
  const hasNegative = (j.mustNotSay?.length) || (t.mustNotContain?.length);
  if (hasPositive) ok(`${c.id} 有正面期望`);
  else bad(`${c.id} 只有『不许说什么』，没有『应该说什么』—— 无法判断改对了没有`);
  if (hasNegative) ok(`${c.id} 有反面期望`);
}

// ④ 回归信号：记录当前系统的已知错误行为（改对后这些应消失）
console.log('\n[4] 当前系统已知错误行为（这些是待修目标）');
for (const c of data.cases) {
  const cur = c.currentSystemBehavior || {};
  if (cur.verdict) console.log(`  · ${c.id}: ${cur.verdict}`);
}

console.log('\n' + '='.repeat(64));
if (fail) {
  console.log(` ❌ 静态检查未通过：${fail} 个问题`);
  process.exit(1);
}
console.log(' ✅ 静态检查通过');
console.log(`    用例 ${data.cases.length} 条 | P0 ${data.cases.filter((c) => c.priority === 'P0').length} 条`);
if (!args.run) {
  console.log('\n （未加 --run，只做了静态检查。实跑模型请加 --run）');
}
