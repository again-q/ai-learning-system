/**
 * 探针：A 按步骤（算子）观测 —— 检查表式 vs 切分式
 *
 * 目的：回答「AI 能不能识别清楚学生的每一步」
 * 做法：用 deepseek-flash (V4.1) 对同一份笔迹跑 3 轮
 *   ① 切分式：让模型自由切段 → 看段数与内容是否稳定（复现 segments 的失败模式）
 *   ② 检查表式：先由题目推出算子清单，再逐个到笔迹里找 → 看二值判定是否稳定
 *
 * 跑法: node scripts/probe-a-operator-check.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const ENV = fs.readFileSync(path.resolve(__dirname, '..', '.env'), 'utf8');
const KEY = (ENV.match(/^SMOKE_API_KEY=(.*)$/m) || [])[1]?.trim();
const BASE = (ENV.match(/^SMOKE_API_BASE=(.*)$/m) || [])[1]?.trim() || 'https://api.deepseek.com';
const MODEL = 'deepseek-flash'; // V4.1

// ── 测试题：抽象函数求解析式（用户指定的例子）──
const QUESTION = '已知 f(x + 1) = x² + 2x，求 f(x) 的解析式。';

// ── 一份学生笔迹（模拟真实卷面，含一处跳步 + 一处算错）──
const STUDENT_WORK = `令 t = x + 1
则 x = t - 1
所以 f(t) = (t-1)² + 2(t-1)
= t² - 2t + 1 + 2t - 2
= t² - 1
所以 f(x) = x² - 1`;

async function call(prompt, temperature = 1.0) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      temperature,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  return j.choices[0].message.content;
}

function extractJSON(txt) {
  const m = txt.match(/```(?:json)?\s*([\s\S]*?)```/) || txt.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  const raw = m ? m[1] : txt;
  return JSON.parse(raw.trim());
}

// ══════════ 实验一：切分式（复现 segments 失败模式）══════════
const SEG_PROMPT = `你是数学阅卷助手。下面是学生的解答笔迹。

题目：${QUESTION}

学生笔迹：
${STUDENT_WORK}

请把学生的解答**切分成步骤段**，逐段标注状态（通/断/空白）。
输出 JSON 数组，每项 {"text":"该段原文","status":"通|断|空白"}。
只输出 JSON，不要解释。`;

// ══════════ 实验二：检查表式（先算子清单，再逐个检查）══════════
const OP_PROMPT = `你是数学教研专家。请分析下面这道题的**标准解题算子（operators）**。

题目：${QUESTION}

要求：把解题过程拆成**不可再分的操作**，每个操作是一个算子。
输出 JSON 数组，每项 {"id":1,"op":"算子的简短名称","expect":"该算子在笔迹里应该表现为什么形式"}。
只输出 JSON，不要解释。`;

const CHECK_PROMPT = (ops) => `你是数学阅卷助手。请逐条检查下面每个算子，在学生的笔迹里**是否出现**。

题目：${QUESTION}

学生笔迹：
${STUDENT_WORK}

待检查的算子清单：
${ops.map((o) => `${o.id}. ${o.op}（预期形式：${o.expect}）`).join('\n')}

判定规则：
- present=true：该算子的形式**在笔迹里能找到**（等价变形也算，不要求一字不差）
- present=false：该算子的形式**在笔迹里找不到**
- 只判"找得到/找不到"，**不要判对错**

输出 JSON 数组，每项 {"id":1,"present":true,"evidence":"笔迹里的对应片段或空字符串"}。
只输出 JSON，不要解释。`;

const ROUNDS = 3;

console.log('='.repeat(78));
console.log('  探针：A 按步骤观测 —— 切分式 vs 检查表式');
console.log(`  模型：${MODEL}（DeepSeek-V4.1-Flash）｜轮数：${ROUNDS}`);
console.log('='.repeat(78));

// ── 实验一 ──
console.log('\n【实验一】切分式：让模型自由切步骤段\n');
const segRuns = [];
for (let i = 0; i < ROUNDS; i++) {
  try {
    const out = await call(SEG_PROMPT);
    const segs = extractJSON(out);
    segRuns.push(segs);
    console.log(`  第${i + 1}轮：${segs.length} 段 → ${segs.map((s) => s.status).join('|')}`);
  } catch (e) {
    console.log(`  第${i + 1}轮：失败 ${e.message}`);
    segRuns.push(null);
  }
}
const segCounts = segRuns.filter(Boolean).map((s) => s.length);
const segAllSame = segCounts.length > 1 && segCounts.every((n) => n === segCounts[0]);

// ── 实验二 ──
console.log('\n【实验二】检查表式：先算子清单，再逐个检查\n');
console.log('  生成算子清单...');
const opList = extractJSON(await call(OP_PROMPT, 0.3));
console.log(`  算子数：${opList.length}`);
opList.forEach((o) => console.log(`    ${o.id}. ${o.op}`));

console.log('\n  逐轮检查笔迹...');
const checkRuns = [];
for (let i = 0; i < ROUNDS; i++) {
  try {
    const out = await call(CHECK_PROMPT(opList));
    const r = extractJSON(out);
    checkRuns.push(r);
    console.log(`  第${i + 1}轮：${r.map((x) => (x.present ? '✓' : '✗')).join(' ')}`);
  } catch (e) {
    console.log(`  第${i + 1}轮：失败 ${e.message}`);
    checkRuns.push(null);
  }
}

// ── 一致性统计 ──
console.log('\n' + '='.repeat(78));
console.log('  一致性对比');
console.log('='.repeat(78));

console.log('\n  切分式：');
console.log(`    段数：${segCounts.join(' / ')}`);
console.log(`    段数是否完全一致：${segAllSame ? '✅ 是' : '❌ 否'}`);
if (segCounts.length) {
  const mn = Math.min(...segCounts), mx = Math.max(...segCounts);
  console.log(`    段数极差：${mx - mn}`);
}

console.log('\n  检查表式：');
const valid = checkRuns.filter(Boolean);
if (valid.length > 1) {
  let agree = 0, total = 0;
  for (let id = 1; id <= opList.length; id++) {
    const vals = valid.map((r) => (r.find((x) => x.id === id) || {}).present);
    const allSame = vals.every((v) => v === vals[0]);
    if (allSame) agree++;
    total++;
    console.log(`    算子${id} ${opList[id - 1] ? opList[id - 1].op : ''}：${vals.map((v) => (v ? '✓' : '✗')).join(' ')} ${allSame ? '✅' : '❌ 翻过'}`);
  }
  console.log(`\n    ★ 逐算子一致率：${agree}/${total} = ${((agree / total) * 100).toFixed(0)}%`);
}

console.log('\n' + '='.repeat(78));
console.log('  结论口径');
console.log('='.repeat(78));
console.log('  若「切分式」段数不稳、而「检查表式」一致率高 → A 走检查表可行');
console.log('  若两者都不稳 → A 只能退回整题级');
