#!/usr/bin/env node
// 反向测试：验证器到底会不会拦下【故意写错】的解答？
//
// 为什么必须测（PRD RK-1，🔴）：整个「这一问怎么想的」方案的地基是
//   「AI 独立求解 → 验证通过 → 才给思路」。
//   如果验证器什么都判「成立」，这道门槛就是纸糊的。
//
// 测法：喂 5 份错解（错法各不相同），看验证器能否判「不成立」并指出错在哪。
//   E1 学生真实错法：两个分式相加算成 1/(xy)（第 19 题原错）
//   E2 循环论证：假设 xy∈M 去证 xy∈M
//   E3 条件用错：把「减法封闭」当「加法封闭」用
//   E4 非零条件漏检：对可能为 0 的元素取倒数
//   E5 跳步：关键构造写「易得」，实际没做
//   另加 2 份【正确】解答作对照，防止验证器一律判「不成立」。
//
// 用法：node scripts/probe-verifier-redteam.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.+)\s*$/);
  if (m) env[m[1]] = m[2];
}
const KEY = env.SMOKE_API_KEY || env.DEEPSEEK_API_KEY;
const BASE = (env.SMOKE_API_BASE || env.DS_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
const MODEL = env.SMOKE_MODEL || env.DS_MODEL || 'deepseek-v4-flash';
if (!KEY) { console.error('缺 key'); process.exit(1); }

async function callDS(system, user, maxTokens = 8000) {
  const res = await fetch(BASE + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
    body: JSON.stringify({
      model: MODEL, thinking: { type: 'enabled' }, temperature: 0.2, max_tokens: maxTokens,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(j).slice(0, 200)}`);
  return j.choices[0].message.content || '';
}
function extractJson(s) {
  const m = /```(?:json)?\s*([\s\S]*?)```/.exec(s);
  const body = m ? m[1] : s;
  const i = body.indexOf('{'); const j = body.lastIndexOf('}');
  if (i < 0 || j < 0) return null;
  try { return JSON.parse(body.slice(i, j + 1)); } catch (_) { return null; }
}

// 与生产同款验证 prompt（本次测试专用副本，上线后应共用同一份常量）
const VERIFY_SYS = `你是一名严格的证明审阅者。只审查给出的小问解答，逐行判断每一步在数学上是否严格成立。

规则：
1. 每步独立核对：依据是什么（题设条件？前面小问结论？本问前面步骤？），推理是否成立。
2. 不要因为结论对就放过中间步骤。
3. 特别注意：有没有把「要证的」当成「已证的」来用；有没有计算错误；有没有跳过性表述掩盖未完成的推理。
4. 引用前面小问结论时，核对那个结论本身是否已证。

输出纯 JSON：
{"overall":"成立/不成立/部分成立","problems":[{"step":第几步,"issue":"问题","severity":"致命/严重/轻微"}],"note":"整体评价"}`;

const Q = `已知 M 是满足下列条件的集合：
① 0∈M，1∈M；
② 若 x，y∈M，则 x-y∈M；
③ 若 x∈M 且 x≠0，则 1/x∈M．
(3) 证明：若 x，y∈M，则 x+y∈M 且 xy∈M．`;

const CASES = [
  {
    id: 'E1', type: '错', name: '学生真实错法：两分式相加算错',
    expect: '不成立/部分成立',
    steps: [
      { step: '造出 1/x 与 1/y', math: '由条件③，1/x∈M，1/y∈M。' },
      { step: '相减得分式', math: '由条件②，1/x−1/y=(y−x)/xy∈M。' },
      { step: '取两个参数相加', math: '由条件②，取 x=(y−x)/xy，y=(x−y)/xy，得 (y−x)/xy+(x−y)/xy=1/(xy)∈M。' },
      { step: '取倒数得 xy', math: '由条件③，取 x=1/(1/xy)，得 xy∈M。证毕。' },
    ],
  },
  {
    id: 'E2', type: '错', name: '循环论证：用 xy∈M 证 xy∈M',
    expect: '不成立/部分成立',
    steps: [
      { step: '已证加法封闭', math: '由上一步，x+y∈M。' },
      { step: '利用乘法', math: '因为 xy∈M，所以 xy∈M。故乘法封闭成立。' },
    ],
  },
  {
    id: 'E3', type: '错', name: '条件用错：把减法封闭当加法封闭',
    expect: '不成立/部分成立',
    steps: [
      { step: '直接用加法', math: '由条件②，若 x，y∈M，则 x+y∈M，故加法封闭成立。' },
      { step: '乘法同理', math: '同理由条件②可得 xy∈M。' },
    ],
  },
  {
    id: 'E4', type: '错', name: '非零条件漏检：对可能为 0 的元素取倒数',
    expect: '不成立/部分成立',
    steps: [
      { step: '取倒数', math: '由条件③，对任意 x∈M，取倒数得 1/x∈M（未验证 x≠0）。' },
      { step: '推 xy', math: '令 x=y，则 1/x=1/y，故 x∈M，从而 xy=x^2∈M。' },
    ],
  },
  {
    id: 'E5', type: '错', name: '跳步：关键构造写「易得」',
    expect: '不成立/部分成立',
    steps: [
      { step: '加法封闭', math: '由上一步，x+y∈M。' },
      { step: '乘法封闭', math: '由加法封闭与条件②，易得 xy∈M。故乘法封闭成立。' },
    ],
  },
  {
    id: 'C1', type: '对', name: '对照组：正确（平方差路线）',
    expect: '成立',
    steps: [
      { step: '相反数与加法封闭', math: '对任意 y∈M，由条件②取 x=0 得 -y∈M；再由条件②取 x=x，y=-y 得 x-(-y)=x+y∈M。' },
      { step: '平方封闭', math: '任取 u∈M。u=0 时 u²=0∈M。u≠0 且 u≠-1 时，由加法封闭 u+1∈M 且 u+1≠0。由条件③，1/u∈M、1/(u+1)∈M。由条件②，1/u−1/(u+1)=1/(u(u+1))∈M，该数非零。由条件③取倒数得 u(u+1)∈M。再由条件②，u(u+1)−u=u²∈M。' },
      { step: '乘法封闭', math: '若 xy=0 则 xy=0∈M。否则由平方封闭与条件②，(x+y)²−(x−y)²=4xy∈M。再由已证加法封闭，1/(4xy)+1/(4xy)+1/(4xy)+1/(4xy)=1/(xy)∈M（此步需 4xy≠0，已满足），由条件③取倒数得 xy∈M。' },
    ],
  },
  {
    id: 'C2', type: '对', name: '对照组：正确（平方引理路线）',
    expect: '成立',
    steps: [
      { step: '加法封闭', math: '由条件②，0−y=−y∈M；再取 x=x, y=−y 得 x+y∈M。' },
      { step: '平方封闭', math: '若 a=0 或 a=−1 直接验证 a²∈M。否则由条件③ 1/a, 1/(a+1)∈M，相减得 1/(a(a+1))∈M，取倒数得 a(a+1)∈M，再减 a 得 a²∈M。' },
      { step: '乘法封闭', math: '由平方封闭，(x+y)², x², y² ∈ M；相减得 2xy∈M。若 2xy≠0，取倒数得 1/(2xy)∈M，自加得 1/(xy)∈M，再取倒数得 xy∈M；若 2xy=0 则 xy=0∈M。' },
    ],
  },
];

async function main() {
  console.log('验证器反向测试 · 模型 ' + MODEL);
  console.log('='.repeat(70));
  const results = [];
  let caught = 0, missed = 0, falseAlarm = 0, correctPassed = 0, correctTotal = 0;

  for (const c of CASES) {
    const user = '【题目】\n' + Q + '\n\n【待审查的解答】\n'
      + JSON.stringify({ answer: '加法封闭与乘法封闭均成立', steps: c.steps }, null, 2)
      + '\n\n输出 JSON。';
    let verdict = '解析失败', problems = [], note = '';
    try {
      const raw = await callDS(VERIFY_SYS, user);
      const j = extractJson(raw);
      if (j) { verdict = j.overall || '?'; problems = j.problems || []; note = j.note || ''; }
    } catch (e) { verdict = '调用失败: ' + e.message; }

    const isWrongCase = c.type === '错';
    const blocked = /不成立|部分成立/.test(verdict);
    let mark;
    if (isWrongCase) {
      if (blocked) { caught++; mark = '✅ 拦住了'; }
      else { missed++; mark = '❌ 没拦住'; }
    } else {
      correctTotal++;
      if (!blocked) { correctPassed++; mark = '✅ 正确放行'; } else { falseAlarm++; mark = '❌ 误杀'; }
    }
    console.log(`\n[${c.id}] ${c.name}`);
    console.log(`   期望: ${c.expect}   实际: ${verdict}   ${mark}`);
    if (problems.length) {
      problems.slice(0, 2).forEach((p) => console.log(`   · 第${p.step}步 [${p.severity}] ${String(p.issue).slice(0, 90)}`));
    }
    results.push({ ...c, verdict, problems, note, mark });
  }

  console.log('\n' + '='.repeat(70));
  console.log('结果汇总');
  console.log('='.repeat(70));
  console.log(`错解拦截： ${caught}/${CASES.filter((c) => c.type === '错').length}`);
  console.log(`正确放行： ${correctPassed}/${correctTotal}`);
  console.log(`误杀：     ${falseAlarm}`);
  const pass = caught === CASES.filter((c) => c.type === '错').length && falseAlarm === 0;
  console.log('\n结论：' + (pass ? '✅ 验证器可用（错解全拦、正解全放）' : '❌ 验证器不可靠 —— PRD RK-1 需升级应对'));

  const out = path.join(ROOT, 'output', 'probe-verifier-redteam.json');
  fs.writeFileSync(out, JSON.stringify({ model: MODEL, results, summary: { caught, missed, falseAlarm, correctPassed, correctTotal, pass } }, null, 2), 'utf8');
  console.log('已保存：' + out);
}

main().catch((e) => { console.error('失败：' + e.message); process.exit(1); });
