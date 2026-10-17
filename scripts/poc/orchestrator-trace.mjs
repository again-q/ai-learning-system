// 编排 Agent 原型：拆解 → 逐单元子对话 → 代码比对 → 汇总
//
// 结构（用户 2026-10-17 拍板）：
//   ① 拆解：用 flash 把学生过程切成【最小可核查单元】（不按类型分派）
//   ② 逐单元核查：每单元起一个独立子对话，只问一个封闭问题
//   ③ 代码比对：用代码而不是模型来做最终判断
//   ④ 一个编排 Agent 负责调度上述三步
//
// 用法：node scripts/poc/orchestrator-trace.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')
    .map((l) => /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(l)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')])
);
const KEY = env.SMOKE_API_KEY;
const BASE = 'https://api.deepseek.com';
const MODEL = 'deepseek-v4-flash';

async function call(messages, opts = {}) {
  const t0 = Date.now();
  const r = await fetch(BASE + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: opts.maxTokens || 2000,
      // 默认不开思考；核查单元问题封闭，不需要
      thinking: { type: opts.thinking ? 'enabled' : 'disabled' },
      temperature: 0.2,
      messages,
    }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + JSON.stringify(d).slice(0, 200));
  return {
    text: (d.choices?.[0]?.message?.content || ''),
    ms: Date.now() - t0,
    inTok: d.usage?.prompt_tokens || 0,
    outTok: d.usage?.completion_tokens || 0,
  };
}

function extractJson(s) {
  const m = /\{[\s\S]*\}/.exec(s);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch (e) { return null; }
}

// ============ ① 拆解器 ============
// ⚠️ 关键（2026-10-17 实测踩坑）：拆解时必须**保留每一步的"依据"**。
//    首版只拆出原文，导致核查单元4「则有 1/(xy)∈M」时不知道「由(I)」指的是
//    加法封闭性（前面证过的 x+y∈M），于是它自己猜成了减法 → 算成 2(x-y)/xy。
//    故要求拆解器把「依据（引用了哪条条件/哪个已证结论）」一并抽出。
async function decompose(question, work) {
  const sys = `把学生的解题过程拆成【最小可核查单元】。

规则：
- 一个单元 = 一个可以单独判断"成立/不成立"的最小动作。
- 不要把多个动作塞进一个单元。例如「取 x=a, y=b」是一个单元，
  「由加法封闭性得 a+b∈M」是另一个单元，不要合并。
- 保持学生的原始书写顺序，不要改写他的内容。

**每个单元必须单独抽出 basis 字段：这一步是"由"什么得到的？**
- 如果他写了「由(I)」「由③」「由(1)知」这类引用，把引用对象**原样抄进 basis**。
- 如果这一步本身就是在定义/声明 (I)、(II)、(1) 等编号代表什么，
  在 defines 字段里写明「(I) = ……」。
- 没有显式依据就写 "无"。

只输出 JSON：
{"defs":[{"label":"(I)","means":"加法封闭性：若 x,y∈M 则 x+y∈M"}],
 "units":[{"i":1,"raw":"学生的原文片段","basis":"这一步的依据（原样引用，如 条件③、(I)、(1)）"}]}`;
  const r = await call([
    { role: 'system', content: sys },
    { role: 'user', content: '【题目】\n' + question + '\n\n【学生过程】\n' + work + '\n\n拆成最小单元并抽出依据，输出 JSON。' },
  ], { maxTokens: 3000 });
  return { ...extractJson(r.text), _ms: r.ms, _tok: r.inTok + r.outTok };
}

// ============ ② 逐单元核查（每个单元一个独立子对话）============
// ⚠️ 关键设计（2026-10-17 首轮实测踩坑后修正）：
//   1) 每个单元**独立核查**，不要把"前面已断裂"塞进上下文 ——
//      否则模型停止计算自己的运算，computed 恒为空，真正的错误点被淹没（级联假阳性）。
//   2) 每个单元都要**独立算出它自己的结果**，再与学生的声称比对。
//      链式成立性由 ③ 的代码汇总判断，不交给单个子对话。
async function checkUnit(question, priorUnits, unit, defs) {
  const sys = `你在核查一份数学证明里的**一个**步骤。只针对这一步，不要评论其他步骤。

给你【题目条件】、【编号含义】、【前面写过的步骤】（背景，不保证成立）和【待核查的这一步】。

请回答：

1. 先看这一步的 basis（依据）。**严格按依据的字面含义决定怎么算**：
   - 依据若是「加法封闭性 / 由(I) / x+y∈M」→ 这是**相加**
   - 依据若是「减法封闭性 / 由条件② / x-y∈M」→ 这是**相减**
   - **绝对不要自己挑选运算方式**；依据写的是哪个就用哪个。
2. 如果这一步出现了运算（代入、合并、化简、求值等），**你必须亲自把这个运算算一遍**，
   把**结果的完整表达式**写进 computed。不要因为前面步骤可能有问题就不算——**照算**。
3. 判断：学生写的结论，与你自己算出来的结果**一致吗**？

只输出 JSON：
{"hasComputation":true|false,
 "usedBasis":"你据以运算的依据（原样引用）",
 "computed":"你算出的结果（含运算时必填）",
 "studentClaim":"这一步学生声称得到的结果",
 "consistent":true|false|null,
 "reason":"一句话"}`;
  const prior = priorUnits.map((u) => u.i + '. ' + u.raw).join('\n') || '（无）';
  const defsTxt = (defs || []).map((d) => d.label + ' = ' + d.means).join('\n') || '（无）';
  const r = await call([
    { role: 'system', content: sys },
    { role: 'user', content:
      '【题目条件】\n' + question +
      '\n\n【编号含义（学生过程中出现的编号代表什么）】\n' + defsTxt +
      '\n\n【前面写过的步骤（背景，不保证成立）】\n' + prior +
      '\n\n【待核查的这一步】\n' + unit.raw +
      '\n这一步的依据是：' + (unit.basis || '无') +
      '\n\n输出 JSON。' },
  ]);
  return { ...(extractJson(r.text) || {}), _ms: r.ms, _tok: r.inTok + r.outTok };
}

// ============ ③ 代码比对 ============
// 把「模型算出的正确结果」与「学生声称的结果」做字面归一化后比对。
// 注意：这是确定性的代码判断，不依赖模型。
function normalize(s) {
  return String(s || '')
    .replace(/\\[a-zA-Z]+/g, '')      // 去 LaTeX 命令
    .replace(/[\s${}]/g, '')
    .replace(/−/g, '-')
    .replace(/·/g, '*')
    .toLowerCase();
}
// 汇总规则（代码判定，不交给模型）：
//   · 只有「含运算 且 consistent=false」才算找到一处**确定性错误**
//   · 不含运算的步骤（引用/假设/结论）不做对错判定，只记录
//   · 不再用「前一步断裂」去否定后续步骤 —— 避免级联假阳性
function compare(unit, chk) {
  if (chk.hasComputation === false) {
    return { status: 'no-computation' };
  }
  if (chk.consistent === false) {
    const comp = normalize(chk.computed);
    const claim = normalize(chk.studentClaim);
    return {
      status: 'broken',
      correct: chk.computed || '(未给出)',
      claimed: chk.studentClaim || '(未给出)',
      mismatch: !!(comp && claim && comp !== claim),
      reason: chk.reason,
    };
  }
  if (chk.consistent === true) return { status: 'ok' };
  return { status: 'unknown' };
}

// ============ ④ 编排 ============
async function orchestrate(question, work) {
  console.log('【编排 Agent 启动】');
  const t0 = Date.now();

  console.log('\n── ① 拆解 ──');
  const dec = await decompose(question, work);
  const units = (dec.units || []).map((u, k) => ({ i: u.i || k + 1, raw: u.raw }));
  if (!units.length) { console.log('拆解失败'); return; }
  if (dec.defs && dec.defs.length) dec.defs.forEach((d) => console.log(`  编号 ${d.label} = ${d.means}`));
  units.forEach((u) => console.log(`  单元${u.i}: ${u.raw}\n          依据: ${u.basis || '无'}`));
  console.log(`  （${dec._ms}ms, ${dec._tok} tokens）`);

  console.log('\n── ② 逐单元核查（每个单元一个独立子对话）──');
  const prior = [];
  const results = [];
  for (const u of units) {
    const chk = await checkUnit(question, prior, u, dec.defs);
    const cmp = compare(u, chk);
    results.push({ unit: u, chk, cmp });
    const mark = cmp.status === 'ok' ? '✅'
      : cmp.status === 'broken' ? '❌'
      : cmp.status === 'no-computation' ? '·' : '❓';
    console.log(`  ${mark} 单元${u.i}: ${u.raw}`);
    if (cmp.status === 'broken') {
      console.log(`       学生声称  : ${cmp.claimed}`);
      console.log(`       实际应为  : ${cmp.correct}`);
      console.log(`       理由      : ${cmp.reason}`);
    } else if (cmp.status === 'no-computation') {
      console.log(`       （非运算步骤：${chk.reason || ''}）`);
    }
    // 只累积原文作为背景；**不注入"前面已断"** —— 避免级联假阳性
    prior.push(u);
  }

  console.log('\n── ③ 汇总（代码判定）──');
  const broken = results.filter((r) => r.cmp.status === 'broken');
  const noComp = results.filter((r) => r.cmp.status === 'no-computation');
  console.log(`  总单元 ${units.length}：含运算且一致 ${results.filter((r) => r.cmp.status === 'ok').length}`
    + `，含运算且不一致 ${broken.length}，非运算 ${noComp.length}`);
  if (!broken.length) console.log('  （未发现任何运算不一致）');
  for (const b of broken) {
    console.log(`  ❌ 第 ${b.unit.i} 个单元：「${b.unit.raw}」`);
    console.log(`     应为「${b.cmp.correct}」，学生写「${b.cmp.claimed}」`);
    console.log(`     ${b.cmp.reason}`);
  }
  console.log(`\n  总耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return { units, results, broken };
}

// ============ 跑 golden 用例 ============
const CASES = JSON.parse(fs.readFileSync(path.join(ROOT, 'output/golden/cases-过程审阅.json'), 'utf8'));
const c = CASES.cases.find((x) => x.id === 'ZX-19-CLOSURE');

const question = c.questionText;
const work = [
  c.studentActualWork.part3_multiplicative.join('\n'),
].join('\n');

console.log('='.repeat(66));
console.log(' 编排 Agent 原型 · 题19 第(3)问乘法部分');
console.log('='.repeat(66));
console.log('\n【输入：学生原文】');
console.log(work.split('\n').map((l) => '  ' + l).join('\n'));
console.log('\n【ground truth】应为：' + c.theRealError.correctMath);
console.log('              学生算成：' + c.theRealError.studentComputed);
console.log();

orchestrate(question, work).then((r) => {
  console.log('\n' + '='.repeat(66));
  const hit = r.broken.some((b) => /=?\s*0/.test(b.cmp.correct || ''));
  console.log(' 目标：找出「两式相加 = 0，而非 1/(xy)」');
  console.log(' 结果：' + (hit ? '✅ 找到了' : '❌ 未找到'));
  console.log('='.repeat(66));
});
