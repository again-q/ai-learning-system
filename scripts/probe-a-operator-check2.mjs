/**
 * 探针 2：加难度 —— 确认"切分稳定"是不是因为题太简单
 *
 * 三个对照：
 *   A. 更难的题（多步、分类讨论）
 *   B. 真实笔迹（含涂改、跳步、错误、书写不规范）
 *   C. 同一题不同轮次的温度抖动
 *
 * 跑法: node scripts/probe-a-operator-check2.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const ENV = fs.readFileSync(path.resolve(__dirname, '..', '.env'), 'utf8');
const KEY = (ENV.match(/^SMOKE_API_KEY=(.*)$/m) || [])[1]?.trim();
const BASE = (ENV.match(/^SMOKE_API_BASE=(.*)$/m) || [])[1]?.trim() || 'https://api.deepseek.com';
const MODEL = 'deepseek-flash';

async function call(prompt) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: MODEL, temperature: 1.0, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return j.choices[0].message.content;
}
function extractJSON(txt) {
  const m = txt.match(/```(?:json)?\s*([\s\S]*?)```/) || txt.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  return JSON.parse((m ? m[1] : txt).trim());
}

const CASES = [
  {
    name: 'A. 中等：抽象函数求解析式（原题）',
    q: '已知 f(x + 1) = x² + 2x，求 f(x) 的解析式。',
    work: `令 t = x + 1
则 x = t - 1
所以 f(t) = (t-1)² + 2(t-1)
= t² - 2t + 1 + 2t - 2
= t² - 1
所以 f(x) = x² - 1`,
  },
  {
    name: 'B. 较难：含分类讨论的恒成立',
    q: '已知函数 f(x) = x² - 2ax + 3 在区间 [1, +∞) 上单调递增，求实数 a 的取值范围。',
    work: `f(x) = x² - 2ax + 3
对称轴 x = a
因为开口向上
要使 f(x) 在 [1, +∞) 单调递增
需要对称轴在区间左侧
即 a ≤ 1
所以 a ∈ (-∞, 1]`,
  },
  {
    name: 'C. 真实笔迹：含涂改+跳步+算错',
    q: '已知 f(x + 1) = x² + 2x，求 f(x) 的解析式。',
    work: `令 t=x+1  (t-1 划掉)
x=t-1
f(t)=(t-1)²+2(t-1)
=t²-2t+1+2t-1   ← 这里 -2 抄成了 -1
=t²
所以 f(x)=x²`,
  },
];

const SEG = (c) => `你是数学阅卷助手。下面是学生的解答笔迹。

题目：${c.q}

学生笔迹：
${c.work}

请把学生的解答**切分成步骤段**，逐段标注状态（通/断/空白）。
输出 JSON 数组，每项 {"text":"该段原文","status":"通|断|空白"}。
只输出 JSON，不要解释。`;

const OPS = (c) => `你是数学教研专家。请分析下面这道题的**标准解题算子（operators）**。

题目：${c.q}

要求：把解题过程拆成**不可再分的操作**。
输出 JSON 数组，每项 {"id":1,"op":"算子名称","expect":"该算子在笔迹里应该表现为什么形式"}。
只输出 JSON，不要解释。`;

const CHECK = (c, ops) => `你是数学阅卷助手。请逐条检查下面每个算子，在学生的笔迹里**是否出现**。

题目：${c.q}

学生笔迹：
${c.work}

待检查的算子清单：
${ops.map((o) => `${o.id}. ${o.op}（预期形式：${o.expect}）`).join('\n')}

判定规则：
- present=true：该算子的形式**在笔迹里能找到**（等价变形也算）
- present=false：该算子的形式**在笔迹里找不到**
- 只判"找得到/找不到"，**不要判对错**

输出 JSON 数组，每项 {"id":1,"present":true,"evidence":"对应片段或空串"}。
只输出 JSON，不要解释。`;

const N = 3;
const report = [];

for (const c of CASES) {
  console.log('='.repeat(76));
  console.log(`  ${c.name}`);
  console.log('='.repeat(76));

  // 切分式
  const segs = [];
  for (let i = 0; i < N; i++) {
    try {
      const s = extractJSON(await call(SEG(c)));
      segs.push(s);
      console.log(`  [切分] 轮${i + 1}: ${s.length} 段  ${s.map((x) => x.status).join('|')}`);
    } catch (e) { console.log(`  [切分] 轮${i + 1} 失败: ${e.message}`); segs.push(null); }
  }
  const sc = segs.filter(Boolean).map((s) => s.length);
  const segStable = sc.length > 1 && sc.every((n) => n === sc[0]);

  // 算子清单（跑 2 次看清单本身稳不稳）
  let ops = null, ops2 = null;
  try { ops = extractJSON(await call(OPS(c))); } catch (e) { console.log('  算子清单失败', e.message); }
  try { ops2 = extractJSON(await call(OPS(c))); } catch (e) {}
  const opsStable = ops && ops2 && ops.length === ops2.length;
  console.log(`  [算子清单] 轮1: ${ops ? ops.length : '-'} 个   轮2: ${ops2 ? ops2.length : '-'} 个   ${opsStable ? '✅ 数量一致' : '⚠️ 数量不同'}`);

  // 检查表式
  const checks = [];
  if (ops) {
    for (let i = 0; i < N; i++) {
      try {
        const r = extractJSON(await call(CHECK(c, ops)));
        checks.push(r);
        console.log(`  [检查] 轮${i + 1}: ${r.map((x) => (x.present ? '✓' : '✗')).join(' ')}`);
      } catch (e) { console.log(`  [检查] 轮${i + 1} 失败: ${e.message}`); checks.push(null); }
    }
  }
  let agree = 0, total = 0;
  const valid = checks.filter(Boolean);
  if (ops && valid.length > 1) {
    for (let id = 1; id <= ops.length; id++) {
      const vals = valid.map((r) => (r.find((x) => x.id === id) || {}).present);
      if (vals.every((v) => v === vals[0])) agree++;
      total++;
    }
  }
  console.log(`\n  ▶ 切分段数：${sc.join(' / ')}  ${segStable ? '✅ 稳定' : '❌ 不稳'}（极差 ${sc.length ? Math.max(...sc) - Math.min(...sc) : '-'}）`);
  console.log(`  ▶ 检查表逐算子一致率：${total ? ((agree / total) * 100).toFixed(0) + '%' : '-'}（${agree}/${total}）\n`);

  report.push({ name: c.name, segCounts: sc, segStable, opCount: ops ? ops.length : 0, opsStable, agree, total });
}

console.log('='.repeat(76));
console.log('  汇总');
console.log('='.repeat(76));
console.log('  用例                                    │ 切分段数      │ 切分稳 │ 检查一致率');
console.log('  ' + '-'.repeat(72));
for (const r of report) {
  const rate = r.total ? ((r.agree / r.total) * 100).toFixed(0) + '%' : '-';
  console.log(`  ${r.name.padEnd(38)} │ ${r.segCounts.join('/').padEnd(13)} │ ${(r.segStable ? '✅' : '❌').padEnd(6)} │ ${rate}`);
}
