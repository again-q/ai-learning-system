/**
 * 探针 2：涂改信息（traceReport）能否救回脏笔迹的切分
 *
 * 背景：probe-a-operator-check2 用例 C（含涂改+跳步+算错）切分崩了（6/5/6）
 *      干净笔迹 A/B 切分都稳。怀疑切分崩的唯一原因是「涂改/划掉未描述」。
 *
 * 做法：同一份脏笔迹，两版 prompt 各跑 3 轮
 *   ① 无涂改描述（现状）
 *   ② 加入 traceReport 式涂改描述
 * 对比切分稳定性。
 *
 * 跑法: node scripts/probe-a-trace-segmentation.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const ENV = fs.readFileSync(path.resolve(__dirname, '..', '.env'), 'utf8');
const KEY = (ENV.match(/^SMOKE_API_KEY=(.*)$/m) || [])[1]?.trim();
const BASE = (ENV.match(/^SMOKE_API_BASE=(.*)$/m) || [])[1]?.trim() || 'https://api.deepseek.com';
const MODEL = 'deepseek-flash';

const QUESTION = '已知 f(x + 1) = x² + 2x，求 f(x) 的解析式。';

// 脏笔迹（与 check2 用例 C 同源）
const WORK_PLAIN = `令 t=x+1  (t-1 划掉)
x=t-1
f(t)=(t-1)²+2(t-1)
=t²-2t+1+2t-1
=t²
所以 f(x)=x²`;

// 同一份笔迹 + traceReport 式描述（judgeOne/index.js:523 的口径）
const TRACE = `【痕迹描述】第1行"令 t=x+1"右侧有一处涂改：先写了"(t-1"后被划掉，划线对象是"(t-1"，动作是横线划除。其余行无涂改、无圈画。`;
const WORK_TRACE = `${WORK_PLAIN}\n\n${TRACE}`;

const mkPrompt = (work) => `你是数学阅卷助手。下面是学生的解答笔迹。

题目：${QUESTION}

学生笔迹：
${work}

请把学生的解答**切分成步骤段**，逐段标注状态（通/断/空白）。
输出 JSON 数组，每项 {"text":"该段原文","status":"通|断|空白"}。
只输出 JSON，不要解释。`;

// 同时测"检查表式"在脏笔迹上是否受涂改影响
const OPS_PROMPT = `你是数学教研专家。请分析下面这道题的标准解题算子。

题目：${QUESTION}

输出 JSON 数组，每项 {"id":1,"op":"算子名称","expect":"在笔迹里应该表现为什么形式"}。
只输出 JSON。`;

const CHECK_PROMPT = (ops, work) => `你是数学阅卷助手。请逐条检查下面每个算子，在学生的笔迹里是否出现。

题目：${QUESTION}

学生笔迹：
${work}

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
  return j.choices[0].message.content;
}
function extractJSON(t) {
  const m = t.match(/```(?:json)?\s*([\s\S]*?)```/) || t.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  return JSON.parse((m ? m[1] : t).trim());
}

const N = 3;
console.log('='.repeat(76));
console.log('  探针：涂改描述（traceReport）能否救回脏笔迹切分');
console.log(`  模型：${MODEL}｜轮数：${N}`);
console.log('='.repeat(76));

// ── 实验一：切分 × 有无涂改描述 ──
async function segTest(label, work) {
  console.log(`\n【${label}】`);
  const runs = [];
  for (let i = 0; i < N; i++) {
    try {
      const s = extractJSON(await call(mkPrompt(work)));
      runs.push(s);
      console.log(`  轮${i + 1}: ${s.length} 段 → ${s.map((x) => x.status).join('|')}`);
      console.log(`         段内容: ${s.map((x) => (x.text || '').replace(/\s+/g, ' ').slice(0, 18)).join(' ‖ ')}`);
    } catch (e) { console.log(`  轮${i + 1} 失败: ${e.message}`); runs.push(null); }
  }
  const v = runs.filter(Boolean);
  const counts = v.map((r) => r.length);
  const stable = counts.length > 1 && counts.every((n) => n === counts[0]);
  // 内容级一致：段数相同且每段文本前若干字相同
  let contentStable = false;
  if (v.length > 1 && stable) {
    contentStable = v.every((r) =>
      r.every((seg, idx) => (seg.text || '').replace(/\s+/g, '').slice(0, 10) ===
        (v[0][idx].text || '').replace(/\s+/g, '').slice(0, 10)));
  }
  console.log(`  ▶ 段数：${counts.join(' / ')}  ${stable ? '✅ 稳定' : '❌ 不稳'}（极差 ${counts.length ? Math.max(...counts) - Math.min(...counts) : '-'}）`);
  console.log(`  ▶ 内容对齐：${contentStable ? '✅ 一致' : '❌ 不一致'}`);
  return { counts, stable, contentStable };
}

const plain = await segTest('实验一A：无涂改描述（现状）', WORK_PLAIN);
const traced = await segTest('实验一B：加入 traceReport 涂改描述', WORK_TRACE);

// ── 实验二：检查表式在脏笔迹上是否受影响 ──
console.log('\n【实验二】检查表式 × 脏笔迹（看涂改是否影响算子判定）');
let ops = null;
try { ops = extractJSON(await call(OPS_PROMPT)); } catch (e) { console.log('  清单失败', e.message); }
if (ops) {
  console.log(`  算子数：${ops.length}`);
  for (const [label, work] of [['无描述', WORK_PLAIN], ['有描述', WORK_TRACE]]) {
    const runs = [];
    for (let i = 0; i < N; i++) {
      try { runs.push(extractJSON(await call(CHECK_PROMPT(ops, work)))); }
      catch (e) { runs.push(null); }
    }
    const v = runs.filter(Boolean);
    let agree = 0;
    for (let id = 1; id <= ops.length; id++) {
      const vals = v.map((r) => (r.find((x) => x.id === id) || {}).present);
      if (vals.every((x) => x === vals[0])) agree++;
    }
    console.log(`  ${label}: ${v.map((r) => r.map((x) => (x.present ? '✓' : '✗')).join('')).join('  ')}  → 一致率 ${((agree / ops.length) * 100).toFixed(0)}%`);
  }
}

console.log('\n' + '='.repeat(76));
console.log('  结论');
console.log('='.repeat(76));
console.log(`  无涂改描述：段数 ${plain.counts.join('/')}  ${plain.stable ? '稳定' : '不稳'}`);
console.log(`  有涂改描述：段数 ${traced.counts.join('/')}  ${traced.stable ? '稳定' : '不稳'}`);
if (!plain.stable && traced.stable) {
  console.log('  → ✅ 涂改描述救回了切分：切分崩的根因确认是「涂改未描述」');
} else if (plain.stable && traced.stable) {
  console.log('  → 🟡 两者都稳：本轮未复现切分不稳（可能温度波动）');
} else if (!traced.stable) {
  console.log('  → ❌ 涂改描述也没救回：切分式不可靠，A 应锁定检查表式');
}
