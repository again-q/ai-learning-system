#!/usr/bin/env node
// ============ 批量实测：换提示词到底改变了什么（把「噪声」和「真实差异」分开）============
//
// 为什么要这个脚本：
//   单看一两道题，很容易把「模型自己抖」误判成「提示词改了行为」。
//   所以每题都跑 3 次：新提示词 ×2（测噪声）+ 旧提示词 ×1（测真实差异）。
//   只有「新提示词自己两次一致、但和旧提示词不同」的地方，才算提示词的真实影响。
//
// 关心什么：P 最重要（它直接决定知识点记对还是记错），其次是 level / D（影响 A）。
//
// 用法：node scripts/verify-n2-batch.mjs [题数，默认 6]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { find } from './db.mjs';
import { groupByChapter, createJevClient, matchByJev } from '../cloudfunctions/graphEngine/src/lib/jevMatch.js';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const L = '='.repeat(96);
const show = (t) => console.log('\n' + L + '\n  ' + t + '\n' + L);

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+)\s*$/);
  if (m) env[m[1]] = m[2];
}
const DS_KEY = env.SMOKE_API_KEY || env.DEEPSEEK_API_KEY;
const DS_BASE = (env.SMOKE_API_BASE || 'https://api.deepseek.com').replace(/\/+$/, '');
const DS_MODEL = env.SMOKE_MODEL || 'deepseek-v4-flash';
const JEV_KEY = process.env.OR_KEY || env.OPENROUTER_API_KEY;

const { RUBRIC_V2, userMsg } = require('../cloudfunctions/graphEngine/src/lib/prompts.js');
const { createKnowledgeTools } = require('../cloudfunctions/graphEngine/src/lib/knowledgeMatch.js');
const SYSTEM_MSG = '你是严谨的数学诊断推理引擎。先学生视角感受难度，再对照 L1-L11 标尺判档，最后判定作答。输出纯 JSON。';

const nodes = find('knowledge_nodes', 1000, { knowledgeId: 1, name: 1, partition: 1, parentId: 1, path: 1 });
const KNOWN = new Set(nodes.map((n) => String(n.name || '').trim()));
const groups = groupByChapter(nodes);
const qq = { where: () => qq, limit: () => qq, get: async () => ({ data: nodes }) };
const kg = createKnowledgeTools({ db: { collection: () => qq } });

async function callDS(userContent) {
  const res = await fetch(DS_BASE + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + DS_KEY },
    body: JSON.stringify({ model: DS_MODEL, thinking: { type: 'disabled' }, temperature: 0.2, max_tokens: 8000,
      messages: [{ role: 'system', content: SYSTEM_MSG }, { role: 'user', content: userContent }] }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const m = j.choices[0].message;
  return { content: m.content || m.reasoning_content || '', inTok: j.usage.prompt_tokens };
}
function extractJson(c) {
  const end = c.lastIndexOf('}');
  if (end < 0) throw new Error('无 JSON');
  let d = 0, st = -1;
  for (let i = end; i >= 0; i--) { if (c[i] === '}') d++; else if (c[i] === '{') { d--; if (d === 0) { st = i; break; } } }
  if (st < 0) throw new Error('无起点');
  return JSON.parse(c.slice(st, end + 1));
}

const all = find('questions', 1000).filter((x) => String(x.questionText || '').trim().length > 30);
const N = Number(process.argv[2] || 6);
const jevClient = createJevClient({ apiKey: JEV_KEY });
const fullList = await kg.buildNodeNames();

console.log(`  模型=${DS_MODEL}  题数=${N}  每题跑 3 次（新×2 + 旧×1）`);

const rows = [];
let tokNew = 0, tokOld = 0;
for (let i = 0; i < Math.min(N, all.length); i++) {
  const Q = all[i];
  const text = String(Q.questionText);
  let jev;
  try { jev = await matchByJev(jevClient, text.slice(0, 1200), groups); } catch (e) { console.log(`  [${i}] Jev 失败，跳过`); continue; }
  if (!jev.points.length) { console.log(`  [${i}] Jev 无考点，跳过`); continue; }
  const trace = (Q.traceReport || '').slice(0, 1500) || '（无痕迹）';
  const tail = '\n\n===== 本题上下文 =====\n题目：' + text + '\n\n【学生作答痕迹】\n' + trace;
  const listNew = '【本题考点清单（系统已判定本题考以下知识点，请逐个给出它们的 D 与 P）】' + jev.points.join('、')
    + '\n\n（若你认为本题还考了清单之外的「知识本体」，仍可写进 knowledgeUsage 并加 newNode:true）';
  const pNew = userMsg + '\n\n' + listNew + '\n\n===== L1-L11 标尺 =====\n' + RUBRIC_V2 + tail;
  const pOld = userMsg + '\n\n' + fullList + '\n\n===== L1-L11 标尺 =====\n' + RUBRIC_V2 + tail;

  const run = async (p) => { const r = await callDS(p); return { o: extractJson(r.content), tok: r.inTok }; };
  const a1 = await run(pNew), a2 = await run(pNew), b1 = await run(pOld);
  tokNew += a1.tok + a2.tok; tokOld += b1.tok;
  rows.push({ i, text: text.replace(/\s+/g, ' ').slice(0, 34), a1: a1.o, a2: a2.o, b1: b1.o,
    ptsA1: (a1.o.knowledgeUsage || []).map((x) => String(x.name).trim()).filter((n) => KNOWN.has(n)),
    ptsA2: (a2.o.knowledgeUsage || []).map((x) => String(x.name).trim()).filter((n) => KNOWN.has(n)),
    ptsB: (b1.o.knowledgeUsage || []).map((x) => String(x.name).trim()).filter((n) => KNOWN.has(n)) });
  console.log(`  [${i}] ✔ ${text.replace(/\s+/g, ' ').slice(0, 30)}`);
}

show('一、逐题：参数是否稳定（A1/A2=新提示词两次  B=旧提示词）');
console.log('  题  参数       A1       A2       B     ｜新自己稳不稳 新vs旧');
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
const stat = { P: { noise: 0, diff: 0, n: 0 }, level: { noise: 0, diff: 0, n: 0 }, D: { noise: 0, diff: 0, n: 0 }, errorLevel: { noise: 0, diff: 0, n: 0 } };
for (const r of rows) {
  for (const k of ['P', 'level', 'D', 'errorLevel']) {
    const stab = same(r.a1[k], r.a2[k]);
    const diff = !same(r.a1[k], r.b1[k]);
    stat[k].n++; if (stab) stat[k].noise++; if (diff) stat[k].diff++;
  }
  const line = ['P', 'level', 'D', 'errorLevel'].map((k) => {
    const stab = same(r.a1[k], r.a2[k]);
    return `${k}:${JSON.stringify(r.a1[k])}/${JSON.stringify(r.a2[k])}/${JSON.stringify(r.b1[k])}${stab ? '' : '(抖)'}`;
  }).join('  ');
  console.log(`  ${String(r.i).padStart(2)}  ${line}`);
}

show('二、汇总：把「模型自己抖」和「提示词真实影响」分开');
console.log('  参数       新提示词自己两次一致率   新vs旧 不一致率   判定');
for (const k of ['P', 'level', 'D', 'errorLevel']) {
  const s = stat[k];
  const noiseRate = s.noise / s.n, diffRate = s.diff / s.n;
  let verdict;
  if (k === 'P') verdict = diffRate <= 0.15 ? '✅ 关键参数稳定' : '⚠️ 记账会变，需注意';
  else verdict = diffRate > noiseRate + 0.3 ? '⚠️ 提示词有真实影响' : '（差异在噪声范围内）';
  console.log(`  ${k.padEnd(11)} ${(noiseRate * 100).toFixed(0)}%${' '.repeat(20)}${(diffRate * 100).toFixed(0)}%${' '.repeat(6)}${verdict}`);
}

show('三、知识点集合'+'');
let exactSame = 0, a1Loss = 0;
for (const r of rows) {
  const setEq = (x, y) => x.length === y.length && x.every((v) => y.includes(v));
  if (setEq(r.ptsA1, r.ptsB)) exactSame++;
  if (r.ptsA1.length < r.ptsB.length) a1Loss++;
  console.log(`  [${r.i}] A1=${r.ptsA1.length} A2=${r.ptsA2.length} B=${r.ptsB.length}   ${r.ptsA1.join('、')}`);
}
console.log(`\n  新旧集合完全相同的题：${exactSame}/${rows.length}`);
console.log(`  新提示词知识点更少的题：${a1Loss}/${rows.length}`);

show('四、成本');
console.log(`  输入 token：新提示词平均 ${Math.round(tokNew / (rows.length * 2))} / 题`);
console.log(`             旧提示词平均 ${Math.round(tokOld / rows.length)} / 题`);
console.log(`  省 ${(100 - tokNew / (rows.length * 2) / (tokOld / rows.length) * 100).toFixed(0)}%`);
