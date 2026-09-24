#!/usr/bin/env node
// ============ D6 · 判定稳定性评测 ============
// 目的：把「新版比旧版更稳」变成数字——同一批语料跑 N 轮，看同一输入是否给同一结果。
// 用法：node scripts/eval-stability.mjs --label=old --rounds=3 [--limit=40] [--ids=a,b]
// 输入：output/golden/traces/traces-v1.json（题干/答案/痕迹，带 quality 的条目自动跳过）
// 输出：output/golden/results/stability-<label>.json + .md（raw 逐轮落盘）
// 口径：prompt 取 cloudfunctions/graphEngine/src/lib/prompts.js（与线上逐字同一份）；参数同线上
//       （thinking disabled / temperature 0.2 / max_tokens 8000）。本地无图谱节点清单与 RAG 注入，已在 meta 标注。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TRACES = path.join(ROOT, 'output/golden/traces/traces-v1.json');
const RESULTS = path.join(ROOT, 'output/golden/results');
const RAWDIR = path.join(RESULTS, 'stability-raw');
const arg = (k, d) => { const hit = process.argv.find((a) => a.startsWith('--' + k + '=')); return hit ? hit.split('=').slice(1).join('=') : d; };
const LABEL = arg('label', 'old');
const ROUNDS = Number(arg('rounds', 2));      // 默认 2 轮（用户 2026-09-25：别跑太多，费钱费时）
const LIMIT = Number(arg('limit', 6)) || 6;   // 默认 6 例；要全量显式传 --limit=0
const CONC = Number(arg('concurrency', 6));   // 并发数：串行跑 38×3 要 35 分钟，并发 6 约 6 分钟
const SOURCE = arg('source', 'traces');   // traces=合成痕迹（全 syllabus，与图谱覆盖不对齐）| db=线上真题（多为必修一，与图谱对齐）
const IDS = arg('ids', '') ? String(arg('ids')).split(',') : null;
const VARIANT = arg('variant', 'old');   // old=线上原版一口气 | split=D6 两段
const D6 = await import(new URL('./d6-prompts.mjs', import.meta.url).href);
// 线上会把【知识点节点清单】注入 prompt（judgeAI.js: nodeList = kg.buildNodeNames()）；
// 本 harness 之前漏了这一步 → name 一致率基线失真（2026-09-25 修）。清单取自云端 knowledge_nodes 导出。
const NODE_LIST = (() => {
  const p = path.join(ROOT, 'output/golden/nodes-dump.json');
  if (!fs.existsSync(p)) { console.warn('⚠️ 缺 nodes-dump.json → 本次不注入清单（与线上不一致）'); return ''; }
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  return '【知识点节点清单】' + (j.names || []).join('、');
})();

// ---------- 模型配置（与 scripts/synth-traces.mjs 同款） ----------
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+)$/);
  if (m) env[m[1]] = m[2];
}
const cfg = {
  key: env.SMOKE_API_KEY || process.env.SMOKE_API_KEY || env.QWEN_API_KEY,
  base: (env.SMOKE_API_BASE || process.env.SMOKE_API_BASE || env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, ''),
  model: env.SMOKE_MODEL || process.env.SMOKE_MODEL || 'qwen-plus',
};
if (!cfg.key) { console.error('缺少 SMOKE_API_KEY / QWEN_API_KEY（.env）'); process.exit(1); }
const IS_ANTHROPIC = /kimi\.com|anthropic/i.test(cfg.base);
const USAGE = [];

const P = require(path.join(ROOT, 'cloudfunctions/graphEngine/src/lib/prompts.js'));
const SYSTEM_MSG = '你是严谨的数学诊断推理引擎。先学生视角感受难度，再对照 L1-L11 标尺判档，最后判定作答。输出纯 JSON。';

function extractJSON(text) {
  const s = String(text).replace(/^\`\`\`(?:json)?\s*/i, '').replace(/\`\`\`\s*$/, '').trim();
  const end = s.lastIndexOf('}');
  if (end < 0) throw new Error('无 JSON');
  let depth = 0, start = -1;
  for (let i = end; i >= 0; i--) {
    const ch = s[i];
    if (ch === '}') depth++;
    else if (ch === '{') { depth--; if (depth === 0) { start = i; break; } }
  }
  if (start < 0) throw new Error('JSON 起点定位失败');
  return JSON.parse(s.slice(start, end + 1));
}

// 网络韧性：单次抖动不该毁掉整轮评测（2026-09-25 实测：一次 UND_ERR_CONNECT_TIMEOUT 把 38 例的跑挂了）
async function postWithRetry(url, body, headers, tries = 3) {
  let lastErr;
  for (let i = 1; i <= tries; i++) {
    try {
      const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) });
      if (!resp.ok) throw new Error('HTTP ' + resp.status + ': ' + (await resp.text()).slice(0, 200));
      return await resp.json();
    } catch (e) {
      lastErr = e;
      if (i < tries) { const wait = 1500 * i; console.log('   ↻ 第 ' + i + ' 次失败（' + (e.message || e) + '），' + wait + 'ms 后重试'); await new Promise((res) => setTimeout(res, wait)); }
    }
  }
  throw lastErr;
}

async function chatJSON(system, user) {
  let content = '';

  if (IS_ANTHROPIC) {
    const data = await postWithRetry(cfg.base + '/v1/messages',
      { model: cfg.model, max_tokens: 8000, temperature: 0.2, system: SYSTEM_MSG, messages: [{ role: 'user', content: user }] },
      { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key, 'anthropic-version': '2023-06-01' });
    if (data.usage) USAGE.push({ in: data.usage.input_tokens || 0, out: data.usage.output_tokens || 0 });
    content = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  } else {
    const body = { model: cfg.model, temperature: 0.2, max_tokens: 8000, messages: [{ role: 'system', content: SYSTEM_MSG }, { role: 'user', content: user }] };
    if (cfg.base.includes('deepseek')) body.thinking = { type: 'disabled' };
    else body.response_format = { type: 'json_object' };
    const data = await postWithRetry(cfg.base + '/chat/completions', body,
      { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key });
    if (data.usage) USAGE.push({ in: data.usage.prompt_tokens || 0, out: data.usage.completion_tokens || 0 });
    content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  }
  return extractJSON(content);
}

async function judge(questionText, traceText) {
  const user = P.userMsg + '\n\n' + NODE_LIST + '\n\n===== L1-L11 标尺 =====\n' + P.RUBRIC_V2 + '\n\n===== 本题上下文 =====\n题目：' + questionText
    + '\n\n【学生作答痕迹（仅用于判定对错/P/η/归因，严禁用于评估难度——难度是题目固有属性，与作答过程无关）】\n' + String(traceText || '').slice(0, 1500);
  return chatJSON(SYSTEM_MSG, user);
}

// D6 两段：A 认题（只给题干）→ B 看过程（题干 + A 的答案/参考解法/知识点清单 + 痕迹）
async function judgeSplit(questionText, traceText) {
  const A = D6.buildA(questionText);
  const rawA = await chatJSON(A.system, A.user);
  const B = D6.buildB({ questionText, answer: rawA.correctAnswer, referenceProcess: rawA.referenceProcess, knowledgeUsage: rawA.knowledgeUsage, traceText });
  const rawB = await chatJSON(B.system, B.user);
  return D6.mergeAB(rawA, rawB);
}

// ---------- 指标 ----------
const statusOf = (p) => (Number(p) === 1 ? '对' : (Number(p) > 0 ? '半对' : '错'));
const knOf = (raw) => String(raw.knowledgeNodeName || '').trim();
const patOf = (raw) => String((raw.pattern && raw.pattern.pattern) || '').trim();
function same(arr) { return arr.every((x) => JSON.stringify(x) === JSON.stringify(arr[0])); }
function median(a) { const s = a.slice().sort((x, y) => x - y); const n = s.length; if (!n) return null; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; }
function spread(a) { const v = a.map(Number).filter((x) => Number.isFinite(x)); return v.length ? Math.max.apply(null, v) - Math.min.apply(null, v) : null; }

(async () => {
  if (SOURCE !== 'db' && !fs.existsSync(TRACES)) throw new Error('缺少 ' + TRACES + '（先跑 node scripts/synth-traces.mjs）');
  const store = JSON.parse(fs.readFileSync(TRACES, 'utf8'));
  let cases;
  if (SOURCE === 'db') {
    const DUMP2 = path.join(ROOT, 'output/shadow-判定/questions-dump.json');
    const qs = JSON.parse(fs.readFileSync(DUMP2, 'utf8')).filter((q) => q.reviewed === true && String(q.traceReport || '').trim());
    cases = qs.map((q) => ({ id: q._id, role: 'real', type: q.questionType || '', question: q.questionText || '', traceText: q.traceReport || '' }));
  } else {
    cases = store.traces.filter((t) => !t.quality && t.traceText !== undefined);
  }
  if (IDS) cases = cases.filter((t) => IDS.includes(t.id));
  if (LIMIT) cases = cases.slice(0, LIMIT);
  fs.mkdirSync(RAWDIR, { recursive: true });
  console.log('label=' + LABEL + ' 模型=' + cfg.model + ' 用例=' + cases.length + ' 轮数=' + ROUNDS);

  const rows = [];
  let done = 0;
  async function runCase(c) {
    const caseId = c.id + '__' + c.role;
    const rounds = [];
    let caseErr = null;
    for (let r = 1; r <= ROUNDS; r++) {
      const rawFile = path.join(RAWDIR, LABEL + '__' + caseId + '__r' + r + '.json');
      try {
        let raw;
        if (fs.existsSync(rawFile)) raw = JSON.parse(fs.readFileSync(rawFile, 'utf8'));
        else { raw = await (VARIANT === 'split' ? judgeSplit : judge)(c.question || '', c.traceText || ''); fs.writeFileSync(rawFile, JSON.stringify(raw, null, 1)); }
        rounds.push(raw);
      } catch (e) {
        caseErr = 'r' + r + ': ' + (e.message || e);
        console.error('   ✗ ' + caseId + ' ' + caseErr);
        break;
      }
    }
    done++;
    if (caseErr || rounds.length < ROUNDS) { rows.push({ id: c.id, role: c.role, type: c.type, error: caseErr || ('只拿到 ' + rounds.length + ' 轮') }); console.log('[' + done + '/' + cases.length + '] ' + caseId + ' | ✗ 失败'); return; }
    const levels = rounds.map((x) => String(x.level || ''));
    const statuses = rounds.map((x) => statusOf(x.P));
    const ets = rounds.map((x) => String(x.errorType || ''));
    const els = rounds.map((x) => String(x.errorLevel === undefined ? '' : x.errorLevel));
    const kns = rounds.map(knOf);
    const pats = rounds.map(patOf);
    const Ds = rounds.map((x) => Number(x.D));
    const Ps = rounds.map((x) => Number(x.P));
    const row = {
      id: c.id, role: c.role, type: c.type,
      levelSame: same(levels), statusSame: same(statuses), errorTypeSame: same(ets), errorLevelSame: same(els),
      knSame: same(kns), patternSame: same(pats),
      levels, statuses, kns,
      Dspread: spread(Ds), Pspread: spread(Ps), Ds, Ps,
    };
    rows.push(row);
    console.log('[' + done + '/' + cases.length + '] ' + caseId + ' | level ' + (row.levelSame ? 'OK' : 'DIFF') + ' | 三态 ' + (row.statusSame ? 'OK' : 'DIFF') + ' | D 抖 ' + row.Dspread);
  }

  // 并发执行（2026-09-25 用户要求：省时省钱。串行 38×3 要 35 分钟）
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(CONC, cases.length)) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= cases.length) return;
      await runCase(cases[idx]);
    }
  }));

  const valid = rows.filter((r) => !r.error);
  const failed = rows.filter((r) => r.error);
  if (failed.length) console.error('失败用例 ' + failed.length + ' 个（已记录，不计入一致率）');
  const rate = (k) => valid.length ? valid.filter((r) => r[k]).length / valid.length : null;
  const rep = {
    meta: { label: LABEL, ts: new Date().toISOString(), model: cfg.model, rounds: ROUNDS, cases: rows.length,
      note: NODE_LIST ? '已按线上注入【知识点节点清单】；本地不接 RAG 历史与裁剪图精读' : '⚠️ 未注入节点清单（与线上不一致）',
      tokens: { calls: USAGE.length, in: USAGE.reduce((s, u) => s + u.in, 0), out: USAGE.reduce((s, u) => s + u.out, 0) } },
    summary: {
      levelRate: rate('levelSame'), statusRate: rate('statusSame'), errorTypeRate: rate('errorTypeSame'),
      errorLevelRate: rate('errorLevelSame'), knRate: rate('knSame'), patternRate: rate('patternSame'),
      D_median: median(valid.map((r) => r.Dspread)), D_max: valid.length ? Math.max.apply(null, valid.map((r) => r.Dspread || 0)) : null,
      P_median: median(valid.map((r) => r.Pspread)), P_max: valid.length ? Math.max.apply(null, valid.map((r) => r.Pspread || 0)) : null,
      unstableCases: valid.filter((r) => !r.levelSame || !r.statusSame).length,
      validCases: valid.length, failedCases: failed.length,
    },
    rows,
  };
  const base = path.join(RESULTS, 'stability-' + LABEL);
  fs.writeFileSync(base + '.json', JSON.stringify(rep, null, 2));
  const pct = (x) => x === null ? '-' : (x * 100).toFixed(1) + '%';
  const L = ['# 判定稳定性评测 · ' + LABEL, '',
    '- 时间：' + rep.meta.ts + '｜模型：' + rep.meta.model + '｜轮数：' + ROUNDS + '｜用例：' + rows.length,
    '- token：' + rep.meta.tokens.calls + ' 次调用 / in ' + rep.meta.tokens.in + ' / out ' + rep.meta.tokens.out,
    '- 注：' + rep.meta.note, '',
    '| 指标 | 值 |', '|---|---|',
    '| level 档位一致率 | ' + pct(rep.summary.levelRate) + ' |',
    '| 三态（对/半对/错）一致率 | ' + pct(rep.summary.statusRate) + ' |',
    '| errorType 一致率 | ' + pct(rep.summary.errorTypeRate) + ' |',
    '| errorLevel 一致率 | ' + pct(rep.summary.errorLevelRate) + ' |',
    '| 知识点名一致率 | ' + pct(rep.summary.knRate) + ' |',
    '| 题型 pattern 一致率 | ' + pct(rep.summary.patternRate) + ' |',
    '| D 抖动（中位 / 最大） | ' + rep.summary.D_median + ' / ' + rep.summary.D_max + ' |',
    '| P 抖动（中位 / 最大） | ' + rep.summary.P_median + ' / ' + rep.summary.P_max + ' |',
    '| 不稳定用例数（level 或三态翻过） | ' + rep.summary.unstableCases + ' / ' + rows.length + ' |', '',
    '## 逐用例', '', '| 用例 | level | 三态 | 知识点 | D 抖 |', '|---|---|---|---|---|'];
  for (const r of rows) {
    if (r.error) { L.push('| ' + r.id + '__' + r.role + ' | ⚠️ 失败 | ' + r.error + ' | - | - |'); continue; }
    L.push('| ' + r.id + '__' + r.role + ' | ' + (r.levelSame ? '✅' : '❌ ' + r.levels.join('/')) + ' | ' + (r.statusSame ? '✅' : '❌ ' + r.statuses.join('/')) + ' | ' + (r.knSame ? '✅' : '❌ ' + r.kns.join('/')) + ' | ' + r.Dspread + ' |');
  }
  fs.writeFileSync(base + '.md', L.join('\n'));
  console.log('---');
  console.log('level 一致率 ' + pct(rep.summary.levelRate) + '｜三态一致率 ' + pct(rep.summary.statusRate) + '｜D 抖动中位 ' + rep.summary.D_median);
  console.log('报告：output/golden/results/stability-' + LABEL + '.{json,md}');
})();
