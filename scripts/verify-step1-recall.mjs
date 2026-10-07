#!/usr/bin/env node
// ============ 实测：第一步「挑考点」到底漏多少 ============
//
// 难点：什么叫「漏」？需要一个标准答案。
//   库里的现成答案（判题时模型写的知识点）不干净 —— 它自己就带错（会把父节点名写进去、
//   会写图谱里没有的名字）。拿它当标尺会把「第一步漏了」和「标尺本身错了」混在一起。
//
// 所以本脚本用一个更强的判据：**让一个模型只读题目、对着完整图谱清单，尽量列全考点**
//   （这是「看题定考点」的尽力而为版，比第一步的 Jev 宽松得多）
// 然后用它当参照，量 Jev 漏了什么、多挑了什么。
//
// 注意：这不是"绝对真理"，是"更强的参照"。所以报告里一律写「相对参照漏了 N 个」，
//       不写「一定漏了 N 个」。
//
// 用法：node scripts/verify-step1-recall.mjs [题数，默认 10]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { find } from './db.mjs';
import { groupByChapter, createJevClient, matchByJev } from '../cloudfunctions/graphEngine/src/lib/jevMatch.js';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const L = '='.repeat(96);
const show = (t) => console.log('\n' + L + '\n  ' + t + '\n  ' + L);

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+)\s*$/);
  if (m) env[m[1]] = m[2];
}
const DS_KEY = env.SMOKE_API_KEY;
const DS_BASE = (env.SMOKE_API_BASE || 'https://api.deepseek.com').replace(/\/+$/, '');
const DS_MODEL = env.SMOKE_MODEL || 'deepseek-v4-flash';
const JEV_KEY = process.env.OR_KEY || env.OPENROUTER_API_KEY;

const { createKnowledgeTools } = require('../cloudfunctions/graphEngine/src/lib/knowledgeMatch.js');
const nodes = find('knowledge_nodes', 1000, { knowledgeId: 1, name: 1, partition: 1, parentId: 1, path: 1 });
const KNOWN = new Set(nodes.map((n) => String(n.name || '').trim()));
const groups = groupByChapter(nodes);
const qq = { where: () => qq, limit: () => qq, get: async () => ({ data: nodes }) };
const kg = createKnowledgeTools({ db: { collection: () => qq } });
const fullList = await kg.buildNodeNames();

// 参照：只读题面 + 完整清单，尽量列全（宽松，允许列图谱外的）
const REF_SYS = '你是高中数学教研专家。只根据题目本身判断它考查哪些知识点，不要考虑难度、不要考虑学生做得怎么样。输出纯 JSON。';
async function reference(questionText) {
  const user = `下面是一道高中数学题。请列出它考查的**知识本体**。

【什么是知识本体】定义 / 性质 / 表示 / 运算 / 关系 —— 即「这道题在考什么」。
【什么不算】解题方法、解题套路、解题用到的工具步骤（例如"求补集的方法""用不等式表示不等关系"这类都不算）。
判断口诀：把解题用的工具拿掉，剩下那个"这题在考什么"才是本体。

要求：
· 列全这道题真正考的知识本体，不要只列最主要的
· 不要把"解题方法/步骤"写进来
· 优先从下面图谱清单里挑原词；清单里确实没有的才自己写

只输出 JSON：{"points":["知识点1","知识点2"]}

===== 图谱清单 =====
${fullList}

===== 题目 =====
${questionText}`;
  const res = await fetch(DS_BASE + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + DS_KEY },
    body: JSON.stringify({ model: DS_MODEL, thinking: { type: 'disabled' }, temperature: 0, max_tokens: 2000,
      messages: [{ role: 'system', content: REF_SYS }, { role: 'user', content: user }] }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const c = j.choices[0].message.content || '';
  const e = c.lastIndexOf('}');
  let d = 0, s = -1;
  for (let i = e; i >= 0; i--) { if (c[i] === '}') d++; else if (c[i] === '{') { d--; if (!d) { s = i; break; } } }
  return JSON.parse(c.slice(s, e + 1)).points || [];
}

const all = find('questions', 1000).filter((x) => String(x.questionText || '').trim().length > 30);
const seen = new Set(); const uniq = [];
for (const q of all) { const t = String(q.questionText).replace(/\s+/g, ' ').trim(); const k = t.slice(0, 200); if (seen.has(k)) continue; seen.add(k); uniq.push(q); }
const N = Number(process.argv[2] || 10);
const jevClient = createJevClient({ apiKey: JEV_KEY });

console.log(`  模型=${DS_MODEL}  题数=${Math.min(N, uniq.length)}`);
console.log('  参照 = 同一模型「只读题面 + 完整清单 + 宁多勿漏」的结果（比第一步宽松）');

const rows = [];
for (let i = 0; i < Math.min(N, uniq.length); i++) {
  const Q = uniq[i];
  const text = String(Q.questionText);
  let ref = [], jevPts = [];
  try { ref = (await reference(text.slice(0, 1500))).map((x) => String(x).trim()).filter(Boolean); } catch (e) { console.log(`  [${i}] 参照失败`); continue; }
  try { jevPts = (await matchByJev(jevClient, text.slice(0, 1200), groups)).points; } catch (e) { console.log(`  [${i}] Jev 失败`); continue; }
  const refInGraph = ref.filter((n) => KNOWN.has(n));
  const missed = refInGraph.filter((n) => !jevPts.includes(n));
  const extra = jevPts.filter((n) => !refInGraph.includes(n));
  rows.push({ i, text: text.replace(/\s+/g, ' ').slice(0, 36), ref, refInGraph, jevPts, missed, extra });
  console.log(`  [${i}] ✔ ${text.replace(/\s+/g, ' ').slice(0, 30)}`);
}

show('一、逐题对比');
for (const r of rows) {
  console.log(`\n  [${r.i}] ${r.text}`);
  console.log(`    参照（宁多勿漏）: ${r.refInGraph.length} 个  ${r.refInGraph.join('、')}`);
  console.log(`    第一步挑的      : ${r.jevPts.length} 个  ${r.jevPts.join('、')}`);
  if (r.missed.length) console.log(`    ★ 漏了: ${r.missed.join('、')}`);
  if (r.extra.length) console.log(`      多挑: ${r.extra.join('、')}`);
}

show('二、汇总');
const n = rows.length;
const totalRef = rows.reduce((s, r) => s + r.refInGraph.length, 0);
const totalJev = rows.reduce((s, r) => s + r.jevPts.length, 0);
const totalMissed = rows.reduce((s, r) => s + r.missed.length, 0);
const totalExtra = rows.reduce((s, r) => s + r.extra.length, 0);
const perfect = rows.filter((r) => r.missed.length === 0).length;
const anyMiss = rows.filter((r) => r.missed.length > 0).length;

console.log(`  题数                          ${n}`);
console.log(`  参照总共列出                  ${totalRef} 个考点（平均 ${(totalRef / n).toFixed(1)} 个/题）`);
console.log(`  第一步总共挑出                ${totalJev} 个考点（平均 ${(totalJev / n).toFixed(1)} 个/题）`);
console.log();
console.log(`  ★ 完全没漏的题                ${perfect}/${n} = ${(perfect / n * 100).toFixed(0)}%`);
console.log(`  ★ 至少漏一个的题              ${anyMiss}/${n} = ${(anyMiss / n * 100).toFixed(0)}%`);
console.log(`  ★ 漏掉的考点总数              ${totalMissed}/${totalRef} = ${(totalMissed / totalRef * 100).toFixed(0)}%（召回率 ${((1 - totalMissed / totalRef) * 100).toFixed(0)}%）`);
console.log(`    多挑的考点总数              ${totalExtra}/${totalJev}`);
console.log();
console.log('  ⚠️ 参照本身也不完美（它是"宁多勿漏"，可能多列）。');
console.log('     所以「漏」的数字是**相对参照**的，不是绝对真理。');
