#!/usr/bin/env node
// ============ 实测：判定环节换用「先Jev缩小清单」之后，真模型还吐不吐合法结果 ============
//
// 背景：2026-10-06 把判定用的提示词从「全量清单（159 个知识点 + 89 个方法）」
//       改成「Jev 先挑出的那几个考点」。这个改动**只跑过假数据测试，没跑过真模型**。
//       本脚本用真题目 + 真 Jev + 真 DeepSeek 跑一遍，检查四件事：
//         ① 模型还吐不吐合法 JSON
//         ② knowledgeUsage 里的名字是不是都落在给它的清单里
//         ③ D / P / errorLevel 这些参数还正不正常
//         ④ 对照：同一题用【旧的全量清单】再跑一次，看两者差多少
//
// 用法：node scripts/verify-n2-prompt.mjs [题号，默认 0]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { find } from './db.mjs';
import { groupByChapter, createJevClient, matchByJev } from '../cloudfunctions/graphEngine/src/lib/jevMatch.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const L = '='.repeat(96);
const show = (t) => console.log('\n' + L + '\n  ' + t + '\n' + L);

// ---------- 读 .env ----------
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+)\s*$/);
  if (m) env[m[1]] = m[2];
}
const DS_KEY = env.SMOKE_API_KEY || env.DEEPSEEK_API_KEY;
const DS_BASE = (env.SMOKE_API_BASE || env.DS_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
const DS_MODEL = env.SMOKE_MODEL || env.DS_MODEL || 'deepseek-v4-flash';
const JEV_KEY = process.env.OR_KEY || env.OPENROUTER_API_KEY;
if (!DS_KEY) { console.error('缺 DeepSeek key'); process.exit(1); }

// ---------- 用真实的提示词（从代码里 require，保证一致）----------
const { RUBRIC_V2, userMsg } = require('../cloudfunctions/graphEngine/src/lib/prompts.js');
const { createKnowledgeTools } = require('../cloudfunctions/graphEngine/src/lib/knowledgeMatch.js');
const SYSTEM_MSG = '你是严谨的数学诊断推理引擎。先学生视角感受难度，再对照 L1-L11 标尺判档，最后判定作答。输出纯 JSON。';

const nodes = find('knowledge_nodes', 1000, { knowledgeId: 1, name: 1, partition: 1, parentId: 1, path: 1 });
const groups = groupByChapter(nodes);
const q = { where: () => q, limit: () => q, get: async () => ({ data: nodes }) };
const kg = createKnowledgeTools({ db: { collection: () => q } });

async function callDS(userContent) {
  const res = await fetch(DS_BASE + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + DS_KEY },
    body: JSON.stringify({
      model: DS_MODEL,
      thinking: { type: 'disabled' },
      temperature: 0.2,
      max_tokens: 8000,
      messages: [{ role: 'system', content: SYSTEM_MSG }, { role: 'user', content: userContent }],
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(j).slice(0, 200)}`);
  const msg = j.choices[0].message;
  return { content: msg.content || msg.reasoning_content || '', usage: j.usage };
}

/** 从模型输出里抠出 JSON（与线上同样的「括号配平」逻辑） */
function extractJson(content) {
  const end = content.lastIndexOf('}');
  if (end < 0) throw new Error('输出里没有 JSON');
  let depth = 0, start = -1;
  for (let i = end; i >= 0; i--) {
    const ch = content[i];
    if (ch === '}') depth++;
    else if (ch === '{') { depth--; if (depth === 0) { start = i; break; } }
  }
  if (start < 0) throw new Error('找不到 JSON 起点');
  return JSON.parse(content.slice(start, end + 1));
}

const questions = find('questions', 1000).filter((x) => String(x.questionText || '').trim().length > 30);
const idx = Number(process.argv[2] || 0);
const Q = questions[idx];
if (!Q) { console.error('题号越界'); process.exit(1); }

show('一、测试用的题');
console.log('  ' + String(Q.questionText).replace(/\s+/g, ' ').slice(0, 160));
console.log(`  （题面 ${String(Q.questionText).length} 字，类型 ${Q.questionType}，判过的 P=${Q.processScore}）`);

// ---------- 先跑 Jev，拿缩小后的清单 ----------
show('二、Jev 挑出的考点（就是新提示词要喂给模型的那几个）');
const jevClient = createJevClient({ apiKey: JEV_KEY });
const jev = await matchByJev(jevClient, String(Q.questionText).slice(0, 1200), groups);
console.log('  单元: ' + JSON.stringify(jev.units));
console.log('  考点: ' + JSON.stringify(jev.points));
if (!jev.points.length) { console.error('  ✖ Jev 没挑出考点，无法测新提示词'); process.exit(1); }

const trace = (Q.traceReport || '').slice(0, 1500) || '（无痕迹记录）';
const contextTail = '\n\n===== 本题上下文 =====\n题目：' + Q.questionText
  + '\n\n【学生作答痕迹（仅用于判定对错/P/η/归因，严禁用于评估难度——难度是题目固有属性，与作答过程无关）】\n' + trace;

// ---------- A：新提示词（Jev 缩小清单）----------
show('三、A 组：新提示词（只喂 Jev 挑出的考点）');
const jevListText = '【本题考点清单（系统已判定本题考以下知识点，请逐个给出它们的 D 与 P）】' + jev.points.join('、')
  + '\n\n（若你认为本题还考了清单之外的「知识本体」，仍可写进 knowledgeUsage 并加 newNode:true）';
const promptA = userMsg + '\n\n' + jevListText + '\n\n===== L1-L11 标尺 =====\n' + RUBRIC_V2 + contextTail;
let outA = null, errA = null, rawA = '';
try {
  const r = await callDS(promptA);
  rawA = r.content;
  outA = extractJson(r.content);
  console.log('  ✅ 吐出了合法 JSON');
  console.log('  usage: input=' + r.usage.prompt_tokens + ' output=' + r.usage.completion_tokens);
} catch (e) { errA = e.message; console.log('  ✖ 失败: ' + e.message); }

// ---------- A2：同一份新提示词再跑一次（测模型自身抖动，做噪声基线）----------
show('三之二、A2 组：新提示词重复跑一次（噪声基线）');
let outA2 = null;
try {
  const r = await callDS(promptA);
  outA2 = extractJson(r.content);
  console.log('  ✅ 吐出了合法 JSON');
} catch (e) { console.log('  ✖ ' + e.message); }

// ---------- B：旧提示词（全量清单）作对照 ----------
show('四、B 组：旧提示词（全量清单）作对照');
const fullList = await kg.buildNodeNames();
const promptB = userMsg + '\n\n' + fullList + '\n\n===== L1-L11 标尺 =====\n' + RUBRIC_V2 + contextTail;
let outB = null, errB = null;
try {
  const r = await callDS(promptB);
  outB = extractJson(r.content);
  console.log('  ✅ 吐出了合法 JSON');
  console.log('  usage: input=' + r.usage.prompt_tokens + ' output=' + r.usage.completion_tokens);
} catch (e) { errB = e.message; console.log('  ✖ 失败: ' + e.message); }
console.log(`  清单长度对比：A 组 ${jevListText.length} 字  vs  B 组 ${fullList.length} 字`);
if (errA || errB) { console.log('\n  有组失败，无法对比'); process.exit(0); }

// ---------- 对比 ----------
const KNOWN = new Set(nodes.map((n) => String(n.name || '').trim()));
function summarize(o, tag) {
  const u = Array.isArray(o.knowledgeUsage) ? o.knowledgeUsage : [];
  const names = u.map((x) => String((x && x.name) || '').trim()).filter(Boolean);
  const inGraph = names.filter((n) => KNOWN.has(n));
  console.log(`\n  【${tag}】`);
  console.log(`    level=${o.level} D=${o.D} P=${o.P} errorType=${o.errorType} errorLevel=${o.errorLevel}`);
  console.log(`    knowledgeUsage ${names.length} 个: ${names.join('、')}`);
  console.log(`    其中在图谱里存在: ${inGraph.length}/${names.length} ${inGraph.length === names.length ? '✅' : '⚠️ ' + names.filter((n) => !KNOWN.has(n)).join('、')}`);
  return { names, inGraph };
}
show('五、结果对比');
const sA = summarize(outA, 'A 新提示词');
const sB = summarize(outB, 'B 旧提示词');

const overlap = sA.inGraph.filter((n) => sB.inGraph.includes(n));
console.log('\n  两组都在图谱里的知识点：');
console.log(`    A 组 ${sA.inGraph.length} 个 ｜ B 组 ${sB.inGraph.length} 个 ｜ 重叠 ${overlap.length} 个`);
console.log(`    重叠内容: ${overlap.join('、') || '（无）'}`);
function sameSet(a, b) { return a.length === b.length && a.every((x) => b.includes(x)); }
console.log('\n  ⚠️ 关键：必须区分「提示词造成的差异」与「模型自己抖」');
console.log('  参数对比（A1=新提示词 / A2=同一份新提示词重跑 / B=旧提示词）：');
console.log('    参数        A1        A2        B      ｜ A1vsA2(噪声)  A1vsB(提示词效应)');
['level', 'D', 'P', 'errorLevel', 'errorType'].forEach((k) => {
  const v1 = JSON.stringify(outA[k]), v2 = outA2 ? JSON.stringify(outA2[k]) : '—', v3 = JSON.stringify(outB[k]);
  const noise = outA2 ? (v1 === v2) : null;
  console.log(`    ${String(k).padEnd(11)} ${String(v1).padEnd(9)} ${String(v2).padEnd(9)} ${String(v3).padEnd(8)} ｜ ${noise === null ? '—' : (noise ? '一致' : '★不同')}          ${v1 === v3 ? '一致' : '★不同'}`);
});
if (outA2) {
  const n2 = Array.isArray(outA2.knowledgeUsage) ? outA2.knowledgeUsage.map((x) => String(x.name).trim()).filter((n) => KNOWN.has(n)) : [];
  console.log(`\n    知识点集合：A1=${sA.inGraph.length} A2=${n2.length} B=${sB.inGraph.length}`);
  console.log(`      A1 vs A2（噪声）: ${sameSet(sA.inGraph, n2) ? '完全一致' : '★不同'}`);
  console.log(`      A1 vs B（提示词效应）: ${sameSet(sA.inGraph, sB.inGraph) ? '完全一致' : '★不同'}`);
}
