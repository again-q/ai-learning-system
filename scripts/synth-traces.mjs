#!/usr/bin/env node
// 合成学生作答痕迹（L2 层，自建）——见 doc/architecture/评测数据集预研.md
// 用法：node scripts/synth-traces.mjs [--limit=2] [--roles=correct,wrong,blank,alt] [--ids=gk-2010-...] [--force]
// 输入：output/golden/dataset-v1.json（L1 题面集）
// 产出：output/golden/traces/traces-v1.json（按 (id, role) 幂等合并，逐条落盘）
// 说明：痕迹 = 手写本上真实会写出来的字（跳步/口语/断行），不是给老师看的规范解答。
//       期望标注（L3：P_kp/对错）**故意不由本脚本产出**，避免"同模型自证"。
// 质检：默认对 wrong/alt 做二次模型判定（数学等价判不了字符串相等，见开发经验 §51）；--no-verify 关闭；--audit 重判库里全部 wrong/alt。
// 消费约定：**忽略带 quality 字段的条目**（可疑数据不删、留证据）。
//       已知边界：概念型填空题天然没有出错空间 → wrong 会被判等价（实测 gk-2010-Math_I_Fill-in-the-Blank-0），这类题只跑 correct/blank。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATASET = path.join(ROOT, 'output/golden/dataset-v1.json');
const OUT_DIR = path.join(ROOT, 'output/golden/traces');
const OUT = path.join(OUT_DIR, 'traces-v1.json');

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};
const LIMIT = Number(arg('limit', 2));
const ROLES = String(arg('roles', 'correct,wrong,blank,alt')).split(',').map((s) => s.trim()).filter(Boolean);
const IDS = arg('ids', '') ? String(arg('ids')).split(',') : null;
const FORCE = process.argv.includes('--force');
// 语义质检：wrong/alt 的"对错"必须由第二次模型判定（字符串比对判不了数学等价——本脚本实测踩过）
const VERIFY = !process.argv.includes('--no-verify');

// ---------- 配置（与 scripts/smoke-decompose-points.mjs 同款） ----------
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+)\s*$/);
  if (m) env[m[1]] = m[2];
}
const API_KEY = env.SMOKE_API_KEY || process.env.SMOKE_API_KEY || env.QWEN_API_KEY;
const BASE = (env.SMOKE_API_BASE || process.env.SMOKE_API_BASE || env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, '');
const MODEL = env.SMOKE_MODEL || process.env.SMOKE_MODEL || 'qwen-plus';
const IS_ANTHROPIC = /kimi\.com|anthropic/i.test(BASE);
if (!API_KEY) { console.error('缺少 QWEN_API_KEY / SMOKE_API_KEY（.env）'); process.exit(1); }

const USAGE = [];
async function chatJSON(system, user) {
  let content;
  if (IS_ANTHROPIC) {
    const resp = await fetch(`${BASE}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}`, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 2000, temperature: 0.2, system, messages: [{ role: 'user', content: user }] }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    const data = await resp.json();
    if (data.usage) USAGE.push({ in: data.usage.input_tokens || 0, out: data.usage.output_tokens || 0 });
    content = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  } else {
    const body = {
      model: MODEL, temperature: 0.2, max_tokens: 4000,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    };
    if (BASE.includes('deepseek')) body.thinking = { type: 'disabled' };
    else body.response_format = { type: 'json_object' };
    const resp = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    const data = await resp.json();
    if (data.usage) USAGE.push({ in: data.usage.prompt_tokens || 0, out: data.usage.completion_tokens || 0, cached: data.usage.prompt_tokens_details?.cached_tokens || 0 });
    content = data.choices?.[0]?.message?.content || '';
  }
  const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const s = cleaned.indexOf('{'), e = cleaned.lastIndexOf('}');
  return JSON.parse(cleaned.slice(s, e + 1));
}

// ---------- 四种角色：同一道题，不同学生的痕迹 ----------
const ROLE_SPEC = {
  correct: {
    desc: '一个学得不错的学生，**完整做对**',
    extra: '过程要一步步写下来（含关键变形），但仍是学生笔迹风格：能省的中间运算就省，偶有"由①得"这类简写。',
    answerRule: 'studentAnswer 必须与【正确答案】一致。',
  },
  wrong: {
    desc: '一个中等学生，**在过程中途出错**（结论因此错）',
    extra: '写到某一步出现真实错误（符号写反/漏分类讨论/忘验算/计算失误任选其一，要选这道题最容易犯的那个），后面的推导顺着这个错误继续写下去，不要自我纠正、不要划掉重来。',
    answerRule: '**硬约束：错误必须让结论数学上错**——把 n=1（或题目里第一个具体值）代进去，studentAnswer 的数值必须与正确答案不同。仅仅换个写法（同一式子展开/通分/调换顺序）不算错，会被判为不合格。同时在 JSON 里给出 errorStep（从哪一步开始错）与 errorKind（符号反|漏情况|计算失误）。',
  },
  blank: {
    desc: '一个完全不会的学生，**整题空白**（只在答题区写下题号）',
    extra: '什么都不写。traceText 只保留题号，segments 为空数组，breakpoint = {index:1,nature:"起步即停"}，processAvailable=false，studentAnswer 为空字符串。',
    answerRule: 'studentAnswer 必须是空字符串。',
  },
  alt: {
    desc: '一个思路灵活的学生，用**非常规但正确**的方法**做对**',
    extra: '刻意绕开标准解法：例如用几何直观/对称性/特殊值先猜后验/换元构造，跳掉标准步骤链。**不写标准解法里的那些中间环节**（这正是要测"标准考点没被走到"的情形），但答案正确。',
    answerRule: 'studentAnswer 必须与【正确答案】一致，但过程中**不得出现标准解法的关键中间步骤**。',
  },
};

function buildPrompt(q, role) {
  const spec = ROLE_SPEC[role];
  const system = [
    '你在为一个数学诊断系统造**测试用的学生作答痕迹**。',
    `这次你要扮演：${spec.desc}。`,
    '痕迹的定义：把学生写在答题纸上的字**原样转录**成文本——那就是流水线实际会拿到的东西。',
    '硬性要求：',
    '1) 只输出 JSON，不要任何解释文字；',
    '2) traceText 是转录文本：保留学生式简写与断行（用 \\n），数学用 $...$ LaTeX；',
    '3) 不要写成"标准答案/教师解析"的口吻，不要出现"解：由题意可知"这种教科书腔；',
    '4) 不要包含"我是AI/以下是模拟"之类元话语。',
    `本题特有要求：${spec.extra}`,
    `强制约束（不可违反）：${spec.answerRule}`,
    '输出 JSON 字段：',
    '{"traceText":"学生写在纸上的过程转录","studentAnswer":"学生的最终答案（选填题就是所选项）",',
    ' "segments":[{"step":"该段内容摘要","status":"通|断|空白","evidence":"该段原文片段（引 traceText 原话）"}],',
    ' "breakpoint":{"index":1,"nature":"起步即停|中途断|收尾断"}|null,',
    ' "processAvailable":true|false,',
    ' "errorStep":"（仅 wrong 角色填）从哪一步开始错","errorKind":"（仅 wrong 角色填）符号反|漏情况|计算失误"}',
  ].join('\n');
  const user = [
    `【题目】${q.q}`,
    q.answer ? `【正确答案】${q.answer}` : '',
    `【解析（仅供你理解本题，不要出现在痕迹里）】${(q.analysis || '').slice(0, 1200)}`,
  ].filter(Boolean).join('\n\n');
  return { system, user };
}

// ---------- 主流程 ----------
function main() {
  if (!fs.existsSync(DATASET)) throw new Error(`缺少 ${DATASET}（先跑 node scripts/build-eval-dataset.mjs）`);
  const ds = JSON.parse(fs.readFileSync(DATASET, 'utf8'));
  // 只挑有过程的题（解答/填空）；选择题的痕迹只剩一个选项，价值低。解答题优先（可错空间大、有分段）
  let pool = ds.items.filter((x) => x.type === '解答' || x.type === '填空');
  if (IDS) pool = ds.items.filter((x) => IDS.includes(x.id));
  pool.sort((a, b) => ((a.type === '解答' ? 0 : 1) - (b.type === '解答' ? 0 : 1)) || a.id.localeCompare(b.id));
  const picked = pool.slice(0, LIMIT);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const store = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { meta: {}, traces: [] };
  const have = new Set(store.traces.map((t) => `${t.id}__${t.role}`));
  store.meta = {
    purpose: 'L2 痕迹层（合成）：给回归测试用的作答痕迹；期望标注(L3)不在此产出',
    model: MODEL, builtAt: new Date().toISOString(),
  };

  // --audit：把库里所有 wrong/alt 重新判一遍对错（防"修复前生成的毒数据"混在库里）
  if (process.argv.includes('--audit')) {
    (async () => {
      let bad = 0;
      for (const rec of store.traces) {
        if (rec.role !== 'wrong' && rec.role !== 'alt') continue;
        const q = ds.items.find((x) => x.id === rec.id);
        if (!q || !q.answer || !rec.studentAnswer) continue;
        try {
          const v = await chatJSON(
            '你是数学判卷员。判断【学生答案】与【正确答案】在数学上是否等价（不同写法/等价变形算等价）。只输出 JSON：{"equivalent":true|false,"reason":"一句话"}',
            `【题目】${q.q}\n【正确答案】${q.answer}\n【学生答案】${rec.studentAnswer}`,
          );
          const eq = v.equivalent === true;
          const ok = rec.role === 'wrong' ? !eq : eq;
          rec.verify = { equivalent: eq, reason: String(v.reason || '').slice(0, 120), by: MODEL, auditedAt: new Date().toISOString() };
          delete rec.quality;
          if (!ok) { rec.quality = rec.role === 'wrong' ? 'suspect: wrong 判为等价 → 没真错' : 'suspect: alt 判为不等价 → 没真对'; bad++; }
          console.log(`${ok ? '✅' : '⚠️'} ${rec.id}__${rec.role}  verify=${eq ? '等价' : '不等价'}  ${rec.quality || ''}`);
        } catch (e) {
          console.error(`❌ ${rec.id}__${rec.role} 审计失败：${e.message}`);
        }
      }
      fs.writeFileSync(OUT, JSON.stringify(store, null, 1));
      console.log(`\n审计完成：${store.traces.length} 条痕迹，可疑 ${bad} 条`);
    })();
    return;
  }

  (async () => {
    for (const q of picked) {
      for (const role of ROLES) {
        const key = `${q.id}__${role}`;
        if (have.has(key) && !FORCE) { console.log(`↷ 跳过已存在 ${key}`); continue; }
        try {
          const { system, user } = buildPrompt(q, role);
          const out = await chatJSON(system, user);
          const rec = {
            id: q.id, role, type: q.type, synthetic: true,
            question: q.q, answer: q.answer,
            traceText: String(out.traceText || ''),
            studentAnswer: String(out.studentAnswer || ''),
            segments: Array.isArray(out.segments) ? out.segments : [],
            breakpoint: out.breakpoint || null,
            processAvailable: out.processAvailable === true,
            errorStep: out.errorStep || null,
            errorKind: out.errorKind || null,
          };
          // 质检：blank 可代码判定；wrong/alt 的对错必须走第二次模型判定（数学等价 ≠ 字符串相等）
          if (role === 'blank' && (rec.studentAnswer !== '' || rec.traceText.replace(/^[\s\d.、（）()【】]+$/, '') !== '')) rec.quality = 'suspect: blank 角色并不空白';
          if (VERIFY && (role === 'wrong' || role === 'alt') && rec.studentAnswer && q.answer) {
            try {
              const v = await chatJSON(
                '你是数学判卷员。判断【学生答案】与【正确答案】在数学上是否等价（不同写法/等价变形算等价）。只输出 JSON：{"equivalent":true|false,"reason":"一句话"}',
                `【题目】${q.q}\n【正确答案】${q.answer}\n【学生答案】${rec.studentAnswer}`,
              );
              rec.verify = { equivalent: v.equivalent === true, reason: String(v.reason || '').slice(0, 120), by: MODEL };
              if (role === 'wrong' && rec.verify.equivalent) rec.quality = 'suspect: wrong 判为等价 → 没真错';
              if (role === 'alt' && !rec.verify.equivalent) rec.quality = 'suspect: alt 判为不等价 → 没真对';
            } catch (e) {
              rec.verify = { error: e.message.slice(0, 120) };
            }
          }
          const i = store.traces.findIndex((t) => `${t.id}__${t.role}` === key);
          if (i >= 0) store.traces[i] = rec; else store.traces.push(rec);
          fs.writeFileSync(OUT, JSON.stringify(store, null, 1)); // 逐条落盘，崩了不丢
          console.log(`${rec.quality ? '⚠️' : '✅'} ${key}  痕迹 ${rec.traceText.length} 字 / segments ${rec.segments.length} / 答案「${rec.studentAnswer.slice(0, 24)}」${rec.quality ? '  ' + rec.quality : ''}`);
        } catch (e) {
          console.error(`❌ ${key} 失败：${e.message}`);
        }
      }
    }
    const cost = USAGE.reduce((a, u) => ({ in: a.in + u.in, out: a.out + u.out, cached: a.cached + (u.cached || 0) }), { in: 0, out: 0, cached: 0 });
    console.log(`\n调用 ${USAGE.length} 次｜tokens in=${cost.in}（缓存 ${cost.cached}）out=${cost.out}`);
    console.log(`产出：${OUT}（共 ${store.traces.length} 条痕迹）`);
  })();
}

main();
