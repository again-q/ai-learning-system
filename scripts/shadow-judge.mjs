#!/usr/bin/env node
// ============ D5 · 判定域影子对比 ============
// 目标：证明「新引擎只是换了个壳」——把同一份模型 raw 同时喂【线上壳】与【新壳】，逐字段比。
// 判据（决策 046）：意外差异必须 0；有意修正逐条签字（见 doc/architecture/判定域影子对比（D5）.md §7）。
// 用法：
//   node scripts/shadow-judge.mjs --mode=fixture                26 条手工夹具（纯本地，0 成本，秒级）
//   node scripts/shadow-judge.mjs --mode=live [--rounds=2]      真模型出 raw → 两壳对拍（读 .env 的 SMOKE_*）
//   node scripts/shadow-judge.mjs --mode=cloud                  回放线上真题 raw（读 output/shadow-判定/inputs/）
// 输出：output/shadow-判定/report.json（机器）+ report.md（人读）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'output/shadow-判定');
const INPUTS = path.join(OUT, 'inputs');
const arg = (k, dflt) => { const hit = process.argv.find((a) => a.startsWith('--' + k + '=')); return hit ? hit.split('=')[1] : dflt; };
const MODE = arg('mode', 'fixture');
const ROUNDS = Number(arg('rounds', '1'));

// ---------- 两套壳（同一份输入、两条实现） ----------
const { deriveAll: onlineDerive } = require(path.join(ROOT, 'cloudfunctions/judgeOne/derivePure.js'));
const N = require(path.join(ROOT, 'cloudfunctions/graphEngine/src/lib/normalize.js'));

function onlineShell(question, raw) { return onlineDerive(question, raw); }

// 新壳 = N3 节点的等价调用序列（注意顺序：先按题型归一无过程字段，再推导——与线上一致）
function newShell(question, raw) {
  const questionType = raw.questionType || question.questionType || '其他';
  const clamped = N.clampParams(raw, questionType);
  const d = N.deriveAll(raw, question, clamped);
  const proc = N.normalizeProcessFields(raw, questionType);
  return {
    questionType,
    clamped,
    fiveDim: N.clampFiveDim(raw.fiveDim),
    segOut: proc.segments,
    bpOut: proc.breakpoint,
    paOut: proc.processAvailable,
    isBlank: d.isBlank,
    derivedErrorType: d.errorType,
    derivedErrorLevel: d.errorLevel,
    derivedErrorAttribution: d.errorAttribution,
    patternText: d.patternText,
    patternFull: d.patternFull,
  };
}

const FIELDS = Object.keys(onlineShell({ questionType: '解答' }, {}));

function diffShells(question, raw) {
  const a = onlineShell(question, raw);
  const b = newShell(question, raw);
  const diffs = [];
  for (const k of FIELDS) {
    const va = JSON.stringify(a[k]);
    const vb = JSON.stringify(b[k]);
    if (va !== vb) diffs.push({ field: k, online: va, new: vb });
  }
  return { diffs, online: a, new: b };
}

// ---------- 夹具（把「输入自相矛盾」的情形也钉住：选填题却带过程字段等） ----------
const FD = { K: 0.8, A: 0.7, T: 0.6, Q: 0.5, S: 0.4 };
const SEG = [{ index: 1, content: '解：', status: '通' }, { index: 2, content: '所以 x<2', status: '通' }];
const FIXTURES = [
  ['解答-答对', { questionType: '解答', studentAnswer: 'x<2 或 x>3' }, { questionType: '解答', level: 'L5', D: 0.65, P: 1, eta: 0.8, segments: SEG, breakpoint: null, processAvailable: true, errorType: '无', errorLevel: 'concept', errorDimension: 'K', pattern: { domain: 'D1', pattern: 'P1', variant: 'V1' }, fiveDim: FD }],
  ['解答-答错', { questionType: '解答', studentAnswer: '2<x<3' }, { questionType: '解答', level: 'L5', D: 0.62, P: 0.4, eta: 0.6, segments: SEG, breakpoint: { index: 2, nature: '中途断' }, processAvailable: true, errorAttribution: '解集方向错', errorType: '结果错', errorLevel: 'rule', errorDimension: 'A', pattern: { pattern: 'P2' }, fiveDim: FD }],
  ['整题空白', { questionType: '解答', studentAnswer: '' }, { questionType: '解答', level: 'L4', D: 0.5, P: 0, eta: 0.5, segments: [], breakpoint: { index: 1, nature: '起步即停' }, processAvailable: false, errorAttribution: '未理解该知识点', errorType: '结果错', errorDimension: 'K', pattern: {} }],
  ['★选填-选择-模型声称有过程', { questionType: '选择', studentAnswer: 'B' }, { questionType: '选择', level: 'L2', D: 0.2, P: 1, eta: 0.9, segments: SEG, breakpoint: { index: 1, nature: '中途断' }, processAvailable: true, errorType: '过程风险', errorLevel: 'skill', errorDimension: 'S', pattern: { pattern: '选择题' } }],
  ['★选填-填空-无作答但模型给分段', { questionType: '填空', studentAnswer: '' }, { questionType: '填空', level: 'L3', D: 0.4, P: 0, segments: SEG, processAvailable: true, errorType: '过程风险', pattern: {} }],
  ['★选填-选择-声称有过程且P<0.5', { questionType: '选择', studentAnswer: 'C' }, { questionType: '选择', level: 'L2', D: 0.2, P: 0.3, eta: 0.9, segments: SEG, processAvailable: true, errorType: '过程风险' }],
  ['选填-选择-正常无过程', { questionType: '选择', studentAnswer: 'B' }, { questionType: '选择', level: 'L2', D: 0.2, P: 1, eta: 0.9, segments: [], processAvailable: false, errorType: '无' }],
  ['题型未知-有过程', { questionType: undefined, studentAnswer: 'x=1' }, { level: 'L3', D: 0.35, P: 0.7, eta: 0.5, segments: SEG, processAvailable: true, errorType: '过程风险', errorLevel: 'skill', errorDimension: 'T', pattern: { domain: 'D', pattern: 'P' } }],
  ['题型未知-无过程', { questionType: undefined, studentAnswer: '4' }, { level: 'L1', D: 0.05, P: 1, eta: 0.2, segments: [], processAvailable: false, pattern: { pattern: '  ' } }],
  ['fiveDim越界', { questionType: '解答', studentAnswer: 'a' }, { level: 'L4', D: 0.5, P: 0.5, eta: 0.5, segments: SEG, processAvailable: true, fiveDim: { K: 3, A: 0.7, T: 0.6, Q: 4, S: 0.4 } }],
  ['fiveDim缺维度', { questionType: '解答', studentAnswer: 'a' }, { level: 'L4', D: 0.5, P: 0.5, eta: 0.5, segments: SEG, processAvailable: true, fiveDim: { K: 1, A: 1 } }],
  ['fiveDim非对象', { questionType: '解答', studentAnswer: 'a' }, { level: 'L4', D: 0.5, P: 0.5, fiveDim: 'x' }],
  ['P越界1.5', { questionType: '解答', studentAnswer: 'a' }, { level: 'L5', D: 0.99, P: 1.5, eta: 2, segments: SEG, processAvailable: true }],
  ['P负数', { questionType: '解答', studentAnswer: 'a' }, { level: 'L5', D: 0.1, P: -3, eta: -1, segments: SEG, processAvailable: true }],
  ['P非数字', { questionType: '解答', studentAnswer: 'a' }, { level: 'L5', D: 0.65, P: 'abc', eta: 'x', segments: SEG, processAvailable: true }],
  ['level未知', { questionType: '解答', studentAnswer: 'a' }, { level: 'LX', D: 2, P: 0.5, eta: 0.5, segments: SEG, processAvailable: true }],
  ['eta缺省', { questionType: '解答', studentAnswer: 'a' }, { level: 'L5', D: 0.65, P: 0.5, segments: SEG, processAvailable: true }],
  ['起步即停但有答案', { questionType: '解答', studentAnswer: '写了点' }, { level: 'L4', D: 0.5, P: 0.3, eta: 0.4, segments: SEG, breakpoint: { index: 1, nature: '起步即停' }, processAvailable: true, errorType: '过程风险' }],
  ['errorType非法', { questionType: '解答', studentAnswer: 'a' }, { level: 'L4', D: 0.5, P: 0.7, eta: 0.5, segments: SEG, processAvailable: true, errorType: '奇怪值', errorLevel: 'weird', errorDimension: 'Z' }],
  ['errorLevel缺失-K', { questionType: '解答', studentAnswer: 'a' }, { level: 'L4', D: 0.5, P: 0.2, eta: 0.5, segments: SEG, processAvailable: true, errorDimension: 'K' }],
  ['errorLevel缺失-S', { questionType: '解答', studentAnswer: 'a' }, { level: 'L4', D: 0.5, P: 0.2, eta: 0.5, segments: SEG, processAvailable: true, errorDimension: 'S' }],
  ['errorLevel缺失-无dimension', { questionType: '解答', studentAnswer: 'a' }, { level: 'L4', D: 0.5, P: 0.2, eta: 0.5, segments: SEG, processAvailable: true }],
  ['pattern非对象', { questionType: '解答', studentAnswer: 'a' }, { level: 'L4', D: 0.5, P: 0.5, eta: 0.5, segments: SEG, processAvailable: true, pattern: 'str' }],
  ['pattern超长', { questionType: '解答', studentAnswer: 'a' }, { level: 'L4', D: 0.5, P: 0.5, eta: 0.5, segments: SEG, processAvailable: true, pattern: { domain: 'D'.repeat(80), pattern: 'P'.repeat(200), variant: 'V' } }],
  ['P=1且给了归因', { questionType: '解答', studentAnswer: 'a' }, { level: 'L4', D: 0.5, P: 1, eta: 0.9, segments: SEG, processAvailable: true, errorAttribution: '不该给' }],
  ['P=0.5边界', { questionType: '解答', studentAnswer: 'a' }, { level: 'L4', D: 0.5, P: 0.5, eta: 0.9, segments: SEG, processAvailable: true, errorAttribution: '边界' }],
];

// ---------- live：真模型出 raw（同一份 raw 喂两壳） ----------
const LIVE_CASES = [
  { id: 'L1', title: '解答·过程完整答对', q: '解不等式 x²−5x+6>0，并把解集用区间表示。', question: { questionType: '解答', studentAnswer: '(−∞,2)∪(3,+∞)' }, trace: '解：因式分解得 (x−2)(x−3)>0，所以 x<2 或 x>3，解集为 (−∞,2)∪(3,+∞)。' },
  { id: 'L2', title: '解答·解集方向错', q: '解不等式 x²−5x+6>0，并把解集用区间表示。', question: { questionType: '解答', studentAnswer: '(2,3)' }, trace: '解：(x−2)(x−3)>0，所以 2<x<3，解集为 (2,3)。' },
  { id: 'L3', title: '解答·整题空白', q: '解不等式 x²−5x+6>0，并把解集用区间表示。', question: { questionType: '解答', studentAnswer: '' }, trace: '' },
  { id: 'L4', title: '选择·只写答案', q: '已知集合 A={1,2,3}，B={2,3,4}，则 A∩B=（ ）A.{1} B.{2,3} C.{1,2,3} D.{2,3,4}', question: { questionType: '选择', studentAnswer: 'B' }, trace: '（选填题）答案是 B。' },
  { id: 'L5', title: '填空·只写答案', q: '若 x²=9，则 x=____。', question: { questionType: '填空', studentAnswer: '3' }, trace: '3' },
  { id: 'L6', title: '解答·替代路径（画图）', q: '解不等式 x²−5x+6>0，并把解集用区间表示。', question: { questionType: '解答', studentAnswer: '(−∞,2)∪(3,+∞)' }, trace: '解：画出抛物线，开口向上，与 x 轴交于 2 和 3，看图得 x<2 或 x>3。' },
];

function loadEnv() {
  const env = {};
  const p = path.join(ROOT, '.env');
  if (!fs.existsSync(p)) return env;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function extractJSON(text) {
  const s = String(text).replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const i = s.indexOf('{');
  const j = s.lastIndexOf('}');
  if (i < 0 || j <= i) throw new Error('模型未返回 JSON: ' + s.slice(0, 160));
  return JSON.parse(s.slice(i, j + 1));
}

async function chatJSON(cfg, system, user) {
  const IS_ANTHROPIC = /kimi\.com|anthropic/i.test(cfg.base);
  let content = '';
  if (IS_ANTHROPIC) {
    const resp = await fetch(cfg.base + '/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: cfg.model, max_tokens: 8000, temperature: 0.2, system, messages: [{ role: 'user', content: user }] }),
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status + ': ' + (await resp.text()).slice(0, 300));
    const data = await resp.json();
    content = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  } else {
    const body = { model: cfg.model, temperature: 0.2, max_tokens: 8000, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
    if (cfg.base.includes('deepseek')) body.thinking = { type: 'disabled' };
    else body.response_format = { type: 'json_object' };
    const resp = await fetch(cfg.base + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status + ': ' + (await resp.text()).slice(0, 300));
    const data = await resp.json();
    content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  }
  return extractJSON(content);
}

// 与线上 N2 同款提示词（RUBRIC_V2 / userMsg 逐字来自 prompts.js = judgeOne 的拷贝）；
// live 模式不接 RAG 历史与裁剪图精读（本机无库），已在报告 meta 里标注
async function llmRaw(cfg, P, c) {
  const system = '你是严谨的数学诊断推理引擎。先学生视角感受难度，再对照 L1-L11 标尺判档，最后判定作答。输出纯 JSON。';
  const user = P.userMsg + '\n\n' + '\n\n===== L1-L11 标尺 =====\n' + P.RUBRIC_V2 + '\n\n===== 本题上下文 =====\n题目：' + c.q + '\n\n【学生作答痕迹（仅用于判定对错/P/η/归因，严禁用于评估难度——难度是题目固有属性，与作答过程无关）】\n' + c.trace;
  return chatJSON(cfg, system, user);
}

// ---------- real：库里的真题（questions-dump.json）→ 真模型出 raw → 两壳对拍 + 与历史落库值比 ----------
const DUMP = path.join(OUT, 'questions-dump.json');
const RAWDIR = path.join(OUT, 'raw');

function histFields(q) {
  const p = q.processScore;
  return {
    questionType: q.questionType || '',
    errorType: q.errorType === undefined ? null : q.errorType,
    errorLevel: q.errorLevel === undefined ? null : q.errorLevel,
    knowledgeNodeName: q.knowledgeNodeName || '',
    status: p === 1 ? '对' : (p > 0 ? '半对' : '错'),
  };
}

function nowFields(d, raw) {
  const p = d.clamped.P;
  return {
    questionType: d.questionType || '',
    errorType: d.derivedErrorType === undefined ? null : d.derivedErrorType,
    errorLevel: d.derivedErrorLevel === undefined ? null : d.derivedErrorLevel,
    knowledgeNodeName: raw.knowledgeNodeName || '',
    status: p === 1 ? '对' : (p > 0 ? '半对' : '错'),
  };
}

function median(a) { const s = a.slice().sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; }

async function runReal(limit) {
  const env = loadEnv();
  const cfg = {
    key: env.SMOKE_API_KEY || process.env.SMOKE_API_KEY || env.QWEN_API_KEY,
    base: (env.SMOKE_API_BASE || process.env.SMOKE_API_BASE || env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, ''),
    model: env.SMOKE_MODEL || process.env.SMOKE_MODEL || 'qwen-plus',
  };
  if (!cfg.key) throw new Error('缺少 SMOKE_API_KEY / QWEN_API_KEY（.env）');
  const P = require(path.join(ROOT, 'cloudfunctions/graphEngine/src/lib/prompts.js'));
  const all = JSON.parse(fs.readFileSync(DUMP, 'utf8')).filter((q) => q.reviewed === true);
  const list = limit ? all.slice(0, limit) : all;
  fs.mkdirSync(RAWDIR, { recursive: true });
  const rows = [];
  let i = 0;
  for (const q of list) {
    i++;
    const title = (q.questionType || '') + ' · ' + (q.knowledgeNodeName || '');
    const rawFile = path.join(RAWDIR, q._id + '.json');
    let raw;
    if (fs.existsSync(rawFile)) {
      raw = JSON.parse(fs.readFileSync(rawFile, 'utf8'));
    } else {
      raw = await llmRaw(cfg, P, { q: q.questionText || '', trace: (q.traceReport || q.studentAnswer || '').slice(0, 1500) });
      fs.writeFileSync(rawFile, JSON.stringify(raw, null, 1));
    }
    const { diffs, new: nv } = diffShells(q, raw);
    const h = histFields(q);
    const n = nowFields(nv, raw);
    const structDiff = [];
    for (const k of Object.keys(h)) if (JSON.stringify(h[k]) !== JSON.stringify(n[k])) structDiff.push({ field: k, hist: JSON.stringify(h[k]), now: JSON.stringify(n[k]) });
    rows.push({ id: q._id, title, kind: 'real', diffs, hist: h, now: n, structDiff,
      band: { levelHist: q.difficultyLevel, levelNow: raw.level, DHist: q.difficultyValue, DNow: nv.clamped.D, PHist: q.processScore, PNow: nv.clamped.P, etaHist: q.pathQuality, etaNow: nv.clamped.eta } });
    console.log('[' + i + '/' + list.length + '] ' + title + ' | 壳差异 ' + diffs.length + ' | 结构差异 ' + structDiff.length);
  }
  return { rows, model: cfg.model };
}

// ---------- 报告 ----------
function md(rep) {
  const L = [];
  L.push('# D5 · 判定域影子对比报告');
  L.push('');
  L.push('- 生成时间：' + rep.meta.ts);
  L.push('- 模式：' + rep.meta.mode + (rep.meta.model ? '｜模型：' + rep.meta.model : ''));
  L.push('- 判据（决策 046）：**意外差异必须 0**；有意修正逐条签字');
  L.push('- 对照字段（' + rep.meta.fields.length + ' 个）：' + rep.meta.fields.join('、'));
  L.push('');
  L.push('## 结论');
  L.push('');
  L.push(rep.summary.diffCases === 0 ? '✅ **0 处意外差异**——两壳在全部 ' + rep.summary.total + ' 个用例上逐字段一致。' : '❌ **发现 ' + rep.summary.diffCases + ' 个用例存在差异**（共 ' + rep.summary.diffFields + ' 个字段）——按闸门判 D5 不通过，须修或签字。');
  L.push('');
  if (rep.summary.diffCases > 0) {
    L.push('## 差异明细');
    L.push('');
    for (const row of rep.rows) {
      if (!row.diffs.length) continue;
      L.push('### ' + row.id + ' · ' + row.title);
      L.push('');
      L.push('| 字段 | 线上壳 | 新壳 |');
      L.push('|---|---|---|');
      for (const d of row.diffs) L.push('| ' + d.field + ' | ' + d.online + ' | ' + d.new + ' |');
      L.push('');
    }
  }
  if (rep.real) {
    L.push('## 真数据：与历史落库值的结构差异（' + rep.real.structDiffCases + ' / ' + rep.summary.total + ' 题）');
    L.push('');
    L.push('| 用例 | 字段 | 历史值 | 本次 |');
    L.push('|---|---|---|---|');
    for (const row of rep.rows) for (const d of row.structDiff) L.push('| ' + String(row.id).slice(0, 8) + ' ' + row.title + ' | ' + d.field + ' | ' + d.hist + ' | ' + d.now + ' |');
    L.push('');
    L.push('## 抖动带（同题重跑 vs 历史值）');
    L.push('');
    L.push('| 指标 | 值 |');
    L.push('|---|---|');
    L.push('| 样本 | ' + rep.real.band.n + ' 题 |');
    L.push('| D 中位抖动 / 最大 | ' + rep.real.band.D_median + ' / ' + rep.real.band.D_max + ' |');
    L.push('| P 中位抖动 / 最大 | ' + rep.real.band.P_median + ' / ' + rep.real.band.P_max + ' |');
    L.push('| 难度档位变化题数 | ' + rep.real.band.levelChanged + ' |');
    L.push('');
    L.push('> ⚠️ 结构差异与抖动带都含**模型自身抖动**（本机不接 RAG 历史注入与裁剪图精读，raw 与当时线上那次不同源）；**只有「壳差异」是 D5 闸门**，结构差异/抖动带用于喂审计 P1/P2。');
    L.push('');
  }
  L.push('## 全部用例');
  L.push('');
  L.push('| 用例 | 差异字段数 |');
  L.push('|---|---|');
  for (const row of rep.rows) L.push('| ' + row.id + ' · ' + row.title + ' | ' + row.diffs.length + ' |');
  L.push('');
  if (rep.summary.errors) {
    L.push('## 失败用例');
    L.push('');
    for (const [id, msg] of Object.entries(rep.summary.errors)) L.push('- ' + id + '：' + msg);
    L.push('');
  }
  L.push('---');
  L.push('');
  L.push('> 本报告由 scripts/shadow-judge.mjs 生成。线上壳 = cloudfunctions/judgeOne/derivePure.js（线上同一个文件）；新壳 = cloudfunctions/graphEngine/src/lib/normalize.js。');
  return L.join('\n');
}

function runFixtures() {
  const rows = [];
  for (const [title, question, raw] of FIXTURES) {
    const { diffs } = diffShells(question, raw);
    rows.push({ id: 'F' + (rows.length + 1), title, kind: 'fixture', diffs });
  }
  return rows;
}

function runInputs() {
  const rows = [];
  if (!fs.existsSync(INPUTS)) return rows;
  for (const f of fs.readdirSync(INPUTS).filter((x) => x.endsWith('.json')).sort()) {
    const d = JSON.parse(fs.readFileSync(path.join(INPUTS, f), 'utf8'));
    const { diffs } = diffShells(d.question || {}, d.raw || {});
    rows.push({ id: d.questionId || f, title: d.title || f, kind: 'cloud', diffs });
  }
  return rows;
}

async function runLive() {
  const env = loadEnv();
  const cfg = {
    key: env.SMOKE_API_KEY || process.env.SMOKE_API_KEY || env.QWEN_API_KEY,
    base: (env.SMOKE_API_BASE || process.env.SMOKE_API_BASE || env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, ''),
    model: env.SMOKE_MODEL || process.env.SMOKE_MODEL || 'qwen-plus',
  };
  if (!cfg.key) throw new Error('缺少 SMOKE_API_KEY / QWEN_API_KEY（.env）');
  const P = require(path.join(ROOT, 'cloudfunctions/graphEngine/src/lib/prompts.js'));
  const rows = [];
  for (const c of LIVE_CASES) {
    for (let r = 1; r <= ROUNDS; r++) {
      const raw = await llmRaw(cfg, P, c);
      const { diffs } = diffShells(c.question, raw);
      rows.push({ id: c.id + '-r' + r, title: c.title, kind: 'live', diffs, raw });
    }
  }
  return { rows, model: cfg.model };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const errors = {};
  let rows = [];
  let model = null;
  if (MODE === 'fixture') {
    rows = runFixtures();
  } else if (MODE === 'cloud') {
    rows = runInputs();
    if (!rows.length) {
      console.log('没有可回放的输入。请先把线上真题的 raw 落到 ' + INPUTS + '/<questionId>.json，格式：');
      console.log('  { "questionId": "...", "question": { ...questions 文档... }, "raw": { ...模型原始输出... } }');
      console.log('取 raw 的办法：graphEngine action=judgeQuestion + until=N3_normalize + debug=true + includeRaw=true（本机 node-sdk 15s 会超时，用 tcb fn invoke）');
      process.exit(2);
    }
  } else if (MODE === 'live') {
    const live = await runLive();
    rows = live.rows;
    model = live.model;
  } else if (MODE === 'real') {
    const real = await runReal(Number(arg('limit', '0')) || null);
    rows = real.rows;
    model = real.model;
  } else {
    throw new Error('未知 mode: ' + MODE);
  }

  const diffCases = rows.filter((r) => r.diffs.length > 0);
  const rep = {
    meta: { ts: new Date().toISOString(), mode: MODE, model, fields: FIELDS, rounds: ROUNDS, note: MODE === 'live' ? 'live 模式不接 RAG 历史与裁剪图精读（本机无库）' : null },
    summary: { total: rows.length, diffCases: diffCases.length, diffFields: diffCases.reduce((n, r) => n + r.diffs.length, 0), errors },
    real: (rows.length && rows[0].band) ? {
      structDiffCases: rows.filter((r) => r.structDiff.length > 0).length,
      structDiffFields: rows.reduce((n, r) => n + r.structDiff.length, 0),
      band: {
        n: rows.length,
        levelChanged: rows.filter((r) => r.band.levelHist !== r.band.levelNow).length,
        D_median: median(rows.map((r) => Math.abs((r.band.DNow || 0) - (r.band.DHist || 0)))),
        D_max: Math.max.apply(null, rows.map((r) => Math.abs((r.band.DNow || 0) - (r.band.DHist || 0)))),
        P_median: median(rows.map((r) => Math.abs((r.band.PNow || 0) - (r.band.PHist || 0)))),
        P_max: Math.max.apply(null, rows.map((r) => Math.abs((r.band.PNow || 0) - (r.band.PHist || 0)))),
      },
    } : null,
    rows,
  };
  const base = 'report-' + MODE;
  fs.writeFileSync(path.join(OUT, base + '.json'), JSON.stringify(rep, null, 2));
  fs.writeFileSync(path.join(OUT, base + '.md'), md(rep));
  console.log('用例 ' + rows.length + ' 个｜有差异 ' + rep.summary.diffCases + ' 个｜差异字段 ' + rep.summary.diffFields + ' 个');
  console.log(rep.summary.diffCases === 0 ? '✅ 0 处意外差异' : '❌ 见 output/shadow-判定/report-' + MODE + '.md');
  console.log('报告：output/shadow-判定/report-' + MODE + '.json + .md');
  process.exit(rep.summary.diffCases === 0 ? 0 : 1);
})();
