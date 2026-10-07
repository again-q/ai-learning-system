/**
 * 成本实测：A 按"检查表式"逐算子判定的 token / 金额
 *
 * 对比三种口径的单题成本：
 *   ① 现状（整题级判定）：1 次调用
 *   ② 算子清单生成：1 次调用（可缓存，按题型复用）
 *   ③ 逐算子检查：1 次调用 / 题
 *
 * 跑法: node scripts/probe-a-cost.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const ENV = fs.readFileSync(path.resolve(__dirname, '..', '.env'), 'utf8');
const KEY = (ENV.match(/^SMOKE_API_KEY=(.*)$/m) || [])[1]?.trim();
const BASE = (ENV.match(/^SMOKE_API_BASE=(.*)$/m) || [])[1]?.trim() || 'https://api.deepseek.com';
const MODEL = 'deepseek-flash';

const QUESTION = '已知 f(x + 1) = x² + 2x，求 f(x) 的解析式。';
const WORK = `令 t = x + 1
则 x = t - 1
所以 f(t) = (t-1)² + 2(t-1)
= t² - 2t + 1 + 2t - 2
= t² - 1
所以 f(x) = x² - 1`;

// 模拟"整题判定"的 prompt（现状口径）
const WHOLE_PROMPT = `你是数学阅卷助手。请判定这道题的解答质量。

题目：${QUESTION}

学生笔迹：
${WORK}

请输出 JSON：{"P":0~1的过程分,"errorType":"...","errorLevel":"concept|rule|skill|null","D":0~1的难度,"knowledgeUsage":[{"name":"知识点","P":0~1}]}。
只输出 JSON。`;

const OPS_PROMPT = `你是数学教研专家。请分析下面这道题的标准解题算子。

题目：${QUESTION}

输出 JSON 数组，每项 {"id":1,"op":"算子名称","expect":"在笔迹里应该表现为什么形式"}。
只输出 JSON。`;

const CHECK_PROMPT = (ops) => `你是数学阅卷助手。请逐条检查下面每个算子，在学生的笔迹里是否出现。

题目：${QUESTION}

学生笔迹：
${WORK}

待检查的算子清单：
${ops.map((o) => `${o.id}. ${o.op}（预期形式：${o.expect}）`).join('\n')}

规则：present=true 表示形式在笔迹里能找到（等价变形也算）；present=false 表示找不到。只判找到/找不到，不判对错。
输出 JSON 数组，每项 {"id":1,"present":true,"evidence":"对应片段或空串"}。只输出 JSON。`;

async function call(prompt) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: MODEL, temperature: 1.0, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  return { usage: j.usage, content: j.choices[0].message.content };
}
function extractJSON(t) {
  const m = t.match(/```(?:json)?\s*([\s\S]*?)```/) || t.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  return JSON.parse((m ? m[1] : t).trim());
}

console.log('='.repeat(74));
console.log('  成本实测：逐算子检查 vs 整题判定');
console.log(`  模型：${MODEL}`);
console.log('='.repeat(74));

const N = 3;
const acc = { whole: [], ops: [], check: [] };

// ① 整题判定
console.log('\n① 整题判定（现状口径）');
for (let i = 0; i < N; i++) {
  const r = await call(WHOLE_PROMPT);
  acc.whole.push(r.usage);
  console.log(`   轮${i + 1}: in ${r.usage.prompt_tokens} / out ${r.usage.completion_tokens} / total ${r.usage.total_tokens}`);
}

// ② 算子清单
console.log('\n② 算子清单生成（可缓存，按题型复用）');
let ops = null;
for (let i = 0; i < N; i++) {
  const r = await call(OPS_PROMPT);
  acc.ops.push(r.usage);
  if (!ops) ops = extractJSON(r.content);
  console.log(`   轮${i + 1}: in ${r.usage.prompt_tokens} / out ${r.usage.completion_tokens} / total ${r.usage.total_tokens}`);
}
console.log(`   算子数：${ops.length}`);

// ③ 逐算子检查
console.log('\n③ 逐算子检查（每题 1 次调用）');
for (let i = 0; i < N; i++) {
  const r = await call(CHECK_PROMPT(ops));
  acc.check.push(r.usage);
  console.log(`   轮${i + 1}: in ${r.usage.prompt_tokens} / out ${r.usage.completion_tokens} / total ${r.usage.total_tokens}`);
}

const avg = (arr, k) => arr.reduce((s, u) => s + u[k], 0) / arr.length;
const fmt = (n) => n.toFixed(0);

console.log('\n' + '='.repeat(74));
console.log('  单题平均');
console.log('='.repeat(74));
console.log('  口径                    │ 输入tok │ 输出tok │ 合计tok');
console.log('  ' + '-'.repeat(68));
console.log(`  ① 整题判定（现状）        │ ${fmt(avg(acc.whole, 'prompt_tokens')).padStart(7)} │ ${fmt(avg(acc.whole, 'completion_tokens')).padStart(7)} │ ${fmt(avg(acc.whole, 'total_tokens')).padStart(7)}`);
console.log(`  ② 算子清单（可缓存）      │ ${fmt(avg(acc.ops, 'prompt_tokens')).padStart(7)} │ ${fmt(avg(acc.ops, 'completion_tokens')).padStart(7)} │ ${fmt(avg(acc.ops, 'total_tokens')).padStart(7)}`);
console.log(`  ③ 逐算子检查             │ ${fmt(avg(acc.check, 'prompt_tokens')).padStart(7)} │ ${fmt(avg(acc.check, 'completion_tokens')).padStart(7)} │ ${fmt(avg(acc.check, 'total_tokens')).padStart(7)}`);

// 一题总成本：整题判定 vs (检查 + 清单摊销)
const wholeTok = avg(acc.whole, 'total_tokens');
const checkTok = avg(acc.check, 'total_tokens');
const opsTok = avg(acc.ops, 'total_tokens');

console.log('\n' + '='.repeat(74));
console.log('  单题总成本对比（假设清单缓存在题型库，20 题摊 1 次清单）');
console.log('='.repeat(74));
console.log(`  现状（只做整题判定）：        ${fmt(wholeTok)} tok/题`);
console.log(`  新增（整题判定 + 逐算子检查）：${fmt(wholeTok + checkTok + opsTok / 20)} tok/题`);
console.log(`    ├ 其中 整题判定：          ${fmt(wholeTok)} tok`);
console.log(`    ├ 其中 逐算子检查：        ${fmt(checkTok)} tok`);
console.log(`    └ 其中 清单摊销(1/20)：    ${fmt(opsTok / 20)} tok`);
const ratio = (wholeTok + checkTok + opsTok / 20) / wholeTok;
console.log(`\n  → 成本倍数：${ratio.toFixed(2)}x`);

console.log('\n  缓存方案对比：');
console.log(`    清单不缓存（每题重算）：  ${fmt(wholeTok + checkTok + opsTok)} tok/题  (${((wholeTok + checkTok + opsTok) / wholeTok).toFixed(2)}x)`);
console.log(`    清单缓存(20题摊销)：     ${fmt(wholeTok + checkTok + opsTok / 20)} tok/题  (${ratio.toFixed(2)}x)`);
console.log(`    清单缓存(整题型复用)：    ${fmt(wholeTok + checkTok)} tok/题  (${((wholeTok + checkTok) / wholeTok).toFixed(2)}x)`);
