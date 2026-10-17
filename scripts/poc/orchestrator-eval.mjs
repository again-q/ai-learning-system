// 编排 Agent 的准入门禁测试：准确率 / 无偏性 / 稳定性
//
// 判据（用户 2026-10-18 拍板）：
//   不追求单题 100%；只要 ①准确率 > 线 ②方向无偏 ③大样本能涌现能力
//
// 本脚本测 ①②：对一批题跑编排 Agent，统计
//   · 真阳性 TPR：学生确实算错的步骤，找出来没有
//   · 假阳性 FPR：学生写对的步骤，会不会被冤枉
//   · 偏差方向：两个错误率是否接近（接近=无偏）
//
// 用法：node scripts/poc/orchestrator-eval.mjs [--repeat=3]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true];
  })
);
const REPEAT = Number(args.repeat || 1);

const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')
    .map((l) => /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(l)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')])
);
const KEY = env.SMOKE_API_KEY;
const BASE = 'https://api.deepseek.com';
const MODEL = 'deepseek-v4-flash';

async function call(messages, maxTokens = 3000) {
  const r = await fetch(BASE + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
    body: JSON.stringify({
      model: MODEL, max_tokens: maxTokens,
      thinking: { type: 'disabled' }, temperature: 0.2, messages,
    }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + JSON.stringify(d).slice(0, 200));
  return (d.choices?.[0]?.message?.content || '');
}
function extractJson(s) {
  const m = /\{[\s\S]*\}/.exec(s);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch (e) { return null; }
}

// ============ 编排：拆解 → 逐单元核查 → 代码汇总 ============
async function decompose(question, work) {
  const sys = `把学生的解题过程拆成【最小可核查单元】。
规则：
- 一个单元 = 一个可单独判断"成立/不成立"的最小动作，不要合并多个动作。
- 保持学生原始书写顺序，不改写内容。
- 每个单元抽出 basis 字段：这一步"由"什么得到（原样引用，如 条件③、(I)、(1)；没有写"无"）。
- 若过程中出现编号定义（如 (I)=加法封闭性），写进 defs。
只输出 JSON：{"defs":[{"label":"(I)","means":"..."}],"units":[{"i":1,"raw":"...","basis":"..."}]}`;
  const j = extractJson(await call([
    { role: 'system', content: sys },
    { role: 'user', content: '【题目】\n' + question + '\n\n【学生过程】\n' + work + '\n\n输出 JSON。' },
  ]));
  return j || { defs: [], units: [] };
}

async function checkUnit(question, prior, unit, defs) {
  const sys = `你在核查一份数学证明里的**一个**步骤。只针对这一步。

1. 先看 basis（依据）。严格按依据字面决定运算方式：
   加法封闭性/由(I)/x+y∈M → 相加；减法封闭性/由条件②/x-y∈M → 相减。
   不要自己挑运算方式。
2. 若本步含运算（代入/合并/化简/求值），必须亲自算一遍，结果完整写入 computed。
   不要因为前面可能有问题就不算——照算。
3. 判断学生写的结论与你的结果是否一致。
只输出 JSON：{"hasComputation":true|false,"computed":"","studentClaim":"","consistent":true|false|null,"reason":"一句话"}`;
  const priorTxt = prior.map((u) => u.i + '. ' + u.raw).join('\n') || '（无）';
  const defsTxt = (defs || []).map((d) => d.label + ' = ' + d.means).join('\n') || '（无）';
  const j = extractJson(await call([
    { role: 'system', content: sys },
    { role: 'user', content:
      '【题目条件】\n' + question +
      '\n\n【编号含义】\n' + defsTxt +
      '\n\n【前面写过的步骤（背景，不保证成立）】\n' + priorTxt +
      '\n\n【待核查的这一步】\n' + unit.raw +
      '\n这一步的依据是：' + (unit.basis || '无') + '\n\n输出 JSON。' },
  ], 1500));
  return j || {};
}

async function runOrchestrator(question, work) {
  const t0 = Date.now();
  const dec = await decompose(question, work);
  const units = (dec.units || []).map((u, k) => ({ i: u.i || k + 1, raw: u.raw, basis: u.basis }));
  const prior = [];
  const flags = [];
  for (const u of units) {
    const chk = await checkUnit(question, prior, u, dec.defs);
    if (chk.hasComputation !== false && chk.consistent === false) {
      flags.push({ unit: u, computed: chk.computed, claim: chk.studentClaim, reason: chk.reason });
    }
    prior.push(u);
  }
  return { units, flags, ms: Date.now() - t0 };
}

// ============ 测试集 ============
// 每条：用【真实转录的分段文本】作为"学生过程"输入
const SRC = JSON.parse(fs.readFileSync('/tmp/allq_flat.json', 'utf8'));
function pick(no, src) {
  const q = SRC.find((x) => String(x.questionNo) === String(no) && x.source === src);
  if (!q) return null;
  const segs = (q.segments || []).filter((s) => s.evidence || s.step);
  return {
    no, official: `${q.officialScore}/${q.officialStandardScore}`,
    p: q.processScore,
    question: q.questionText || '',
    work: segs.map((s) => s.evidence || s.step).join('\n'),
    segs,
  };
}

// 期望：题19 第(3)问乘法部分 → 应发现错误（真阳性目标）
// 题12 → 学生基本做对（官方 14/15，接近于对）→ 不应大范围报警（假阳性探针）
// 题11 → 学生最终答案对但过程有涂改（官方 7/10）→ 边界案例
const CASES = [
  { id: 'ZX-19', kind: 'has-error', expect: 'find', ...(() => {
      // ⚠️ 数据库里题19第4段被截断（以 "……" 结尾，缺最后三行），
      //    所以这里用 golden 集的完整 ground truth 覆盖，否则测的是「残缺输入」不是「Agent」。
      const g = JSON.parse(fs.readFileSync(path.join(ROOT, 'output/golden/cases-过程审阅.json'), 'utf8'))
        .cases.find((x) => x.id === 'ZX-19-CLOSURE');
      const base = pick('19', 'zhixue');
      return {
        ...base,
        question: g.questionText,
        work: [...g.studentActualWork.part3_multiplicative].join('\n'),
        note: '使用 golden 完整过程（DB 分段被截断）',
      };
    })() },
  { id: 'ZX-12', kind: 'mostly-right', expect: 'quiet', ...pick('12', 'zhixue') },
  { id: 'ZX-11', kind: 'boundary', expect: 'either', ...pick('11', 'zhixue') },
].filter((c) => c.question && c.work);

(async () => {
  console.log('='.repeat(70));
  console.log(` 编排 Agent 门禁测试  （repeat=${REPEAT}）`);
  console.log('='.repeat(70));

  const rows = [];
  for (const c of CASES) {
    console.log(`\n【${c.id}】${c.kind}  官方 ${c.official}  系统P=${c.p}`);
    console.log('  过程（前2段）:');
    c.work.split('\n').slice(0, 2).forEach((l) => console.log('    ' + l.slice(0, 80)));
    for (let r = 0; r < REPEAT; r++) {
      try {
        const res = await runOrchestrator(c.question, c.work);
        console.log(`  第${r + 1}次: ${res.units.length} 单元, 报警 ${res.flags.length} 处, ${(res.ms / 1000).toFixed(1)}s`);
        res.flags.forEach((f) => console.log(`     ⚠ 单元${f.unit.i}: 应为「${(f.computed || '').slice(0, 50)}」 学生「${(f.claim || '').slice(0, 40)}」`));
        rows.push({ id: c.id, kind: c.kind, expect: c.expect, flags: res.flags.length, ms: res.ms, detail: res.flags });
      } catch (e) {
        console.log(`  第${r + 1}次: ❌ ${e.message.slice(0, 100)}`);
        rows.push({ id: c.id, kind: c.kind, expect: c.expect, flags: null, err: e.message });
      }
    }
  }

  // ===== 汇总 =====
  console.log('\n' + '='.repeat(70));
  console.log(' 汇总');
  console.log('='.repeat(70));
  const byId = {};
  for (const r of rows) (byId[r.id] = byId[r.id] || []).push(r);
  for (const [id, rs] of Object.entries(byId)) {
    const good = rs.filter((r) => r.flags != null);
    const avg = good.length ? (good.reduce((a, b) => a + b.flags, 0) / good.length).toFixed(2) : '—';
    const avgMs = good.length ? (good.reduce((a, b) => a + b.ms, 0) / good.length / 1000).toFixed(1) : '—';
    const stable = new Set(good.map((r) => r.flags)).size;
    console.log(`  ${id.padEnd(8)} 平均报警 ${avg} 处 | 均耗时 ${avgMs}s | 各次报警数的不同取值 ${stable} 种 ${stable === 1 ? '(稳定)' : '(不稳定)'}`);
  }

  const c19 = byId['ZX-19'] || [];
  const tpr = c19.length ? c19.filter((r) => r.flags > 0).length / c19.length : 0;
  const c12 = byId['ZX-12'] || [];
  const fpr = c12.length ? c12.filter((r) => r.flags > 0).length / c12.length : 0;
  console.log('\n  真阳性率（题19 报警）: ' + (tpr * 100).toFixed(0) + '%');
  console.log('  假阳性率（题12 误报）: ' + (fpr * 100).toFixed(0) + '%');
  console.log('  ※ 样本仅 2 道题，此结果只能作冒烟参考，不能定论');
  fs.writeFileSync('/tmp/orchestrator_eval.json', JSON.stringify(rows, null, 1));
  console.log('\n  明细 → /tmp/orchestrator_eval.json');
})();
