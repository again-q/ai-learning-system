#!/usr/bin/env node
// ============ 实测：Jev（TypeSafe System One）在真实知识点选择上的表现 ============
//
// 通过腾讯云 EdgeOne Makers 调用 @makers/jev（原版 Jev 1.13.0）
//
// 对照基准（今天已实测）：
//   · 本地 Intern-Decision-0.8B：稳定度 100%，准确率 25%（12候选中对1题），conf 0.22~0.39
//   · DeepSeek V4.1 自由写名字：稳定度 4%
//   · DeepSeek V4.1 只输出序号：稳定度 75%
//
// 本轮改进（避开本地测试踩的坑）：
//   ① 加 other 兜底选项（官方建议）
//   ② criteria 用更长的描述（教材原文风格）
//   ③ instructions 明确判断标准
//   ④ 对照"给全量271 vs 给分组后的候选"
//
// 用法：node scripts/probe-jev-knowledge.mjs
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tcb = path.join(ROOT, 'node_modules/.bin/tcb');
const ENV = process.env.TCB_ENV || 'cloud1-d8g0ty39wd73f430a';
const KEY = process.env.JEV_KEY;
if (!KEY) {
  console.error('[probe-jev-knowledge] 缺少 JEV_KEY 环境变量——密钥禁止硬编码入库，请放入本地 .env（已被 .gitignore 忽略）');
  process.exit(1);
}
const URL = 'https://ai-gateway.edgeone.link/v1/systemone';

function unwrap(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(unwrap);
  const ks = Object.keys(v);
  if (ks.length === 1) { const k = ks[0];
    if (/^\$(numberInt|numberLong|numberDouble)$/.test(k)) return Number(v[k]);
    if (k === '$oid' || k === '$date') return v[k]; }
  const o = {}; for (const k of ks) o[k] = unwrap(v[k]); return o;
}
function query(cmd) {
  const p = [{ TableName: cmd.find, CommandType: 'QUERY', Command: JSON.stringify(cmd) }];
  const raw = execFileSync(tcb, ['db', 'nosql', 'execute', '--json', '-e', ENV, '--command', JSON.stringify(p)],
    { cwd: ROOT, encoding: 'utf8', timeout: 300000, maxBuffer: 1e8 });
  const s = raw.indexOf('['), e = raw.lastIndexOf(']');
  const a = unwrap(JSON.parse(raw.slice(s, e + 1)));
  const f = Array.isArray(a) ? a[0] : null;
  return Array.isArray(f) ? f : (f && f.data) || [];
}
async function jev(state, questions) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: '@makers/jev', state, questions }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(j).slice(0, 300)}`);
  return j;
}

// ---------- 数据 ----------
const nodes = query({ find: 'knowledge_nodes', filter: {}, limit: 1000 });
const qs = query({ find: 'questions', filter: {}, limit: 1000 });
console.log(`图谱 ${nodes.length} 节点｜题目 ${qs.length} 道\n`);

const byName = {};
nodes.forEach((n) => { const nm = String(n.name || '').trim(); if (nm) byName[nm] = n; });

// 候选集 A：今天本地测过的那 12 个（做对照）
const CATALOG_12 = [
  '集合', '元素', '属于与不属于', '属于与包含的关系', '并集', '交集',
  '补集', '子集', '集合相等', '确定性', '互异性', '无序性',
];

// 描述（用教材原文风格，比本地测试时更长）
function descOf(name) {
  const n = byName[name];
  const st = n && n.concept && n.concept.source_text ? String(n.concept.source_text).trim() : '';
  return st ? st.slice(0, 120) : name;
}

function buildCriteria(names, withOther) {
  const c = {};
  for (const nm of names) c[nm] = descOf(nm);
  if (withOther) c['其他/都不是'] = '不属于以上任何一个，或这道题不考查数学知识点';
  return c;
}

const INSTR = '这道数学题实际考查的【知识本体】是哪一个？'
  + '知识本体指知识点的定义、性质、表示、操作或关系本身；'
  + '不要选"解题方法""题型套路""思想方法"这类非本体概念。'
  + '如果题目主要考查后面列出的某个运算（并、交、补），选那个运算本身，不要选上位概念。';

// ---------- 测试题（与本地测试同源，便于对照）----------
const TESTS = [
  { name: '并集运算', state: '已知集合 A={1,2,3}，B={2,3,4}，求 A∪B。', expect: '并集' },
  { name: '交集运算', state: '已知集合 M={x|-1<x<2}，N={x|0<x<3}，求 M∩N。', expect: '交集' },
  { name: '补集运算', state: '设全集 U={1,2,3,4,5}，A={1,3,5}，求 ∁ᵤA。', expect: '补集' },
  { name: '互异性', state: '已知集合 A={a, |a|, a-2}，若 3∈A，求实数 a 的值。', expect: '互异性' },
  { name: '元素与集合关系', state: '判断：3 是否属于集合 {1,2,3}？用符号表示。', expect: '属于与不属于' },
  { name: '确定性', state: '判断：某班年龄较小的同学能形成一个集合。', expect: '确定性' },
  { name: '无序性', state: '判断：集合 {1,2,3} 与 {3,2,1} 是否相等？', expect: '无序性' },
];

const ROUNDS = 3;
console.log('='.repeat(86));
console.log('  Jev（TypeSafe System One，原版）· 知识点选择实测');
console.log('='.repeat(86));

// ============ 实验一：12 候选 + other 兜底 ============
console.log('\n【实验一】12 候选 + other 兜底（与本地 0.8B 同候选集，做对照）\n');
const criteria1 = buildCriteria(CATALOG_12, true);
const exp1 = [];

for (const t of TESTS) {
  const picks = [], confs = [];
  for (let i = 0; i < ROUNDS; i++) {
    try {
      const r = await jev(t.state, { knowledge: { type: 'choice', instructions: INSTR, criteria: criteria1 } });
      const ans = r.answers.knowledge;
      picks.push(ans.choice);
      confs.push(ans.confidence);
    } catch (e) { picks.push('ERR'); confs.push(0); console.log(`  失败: ${e.message}`); }
  }
  const stable = picks.every((p) => p === picks[0]);
  const hit = picks[0] === t.expect;
  exp1.push({ name: t.name, expect: t.expect, picks, confs, stable, hit });
  console.log(`  [${t.name}] 期望「${t.expect}」`);
  console.log(`     三轮: ${picks.join(' / ')}   conf: ${confs.map((c) => c.toFixed(2)).join('/')}`);
  console.log(`     ${stable ? '✅稳定' : '❌不稳'}  ${hit ? '✅命中' : '❌未命中'}`);
}

// ============ 实验二：noul — 判断"是否考查某知识点"（逐个二值）============
console.log('\n' + '='.repeat(86));
console.log('  实验二：noul 逐个判断（对每个候选单独问"考不考它"）');
console.log('='.repeat(86));
console.log('\n  （取并集题，对 6 个候选逐个 noul 判断）\n');

const noulQ = {};
for (const nm of CATALOG_12) {
  noulQ[nm] = { type: 'noul', instructions: `这道题是否考查「${nm}」这个知识点？（${descOf(nm).slice(0, 60)}）` };
}
try {
  const r = await jev(TESTS[0].state, noulQ);
  const sorted = Object.entries(r.answers).map(([k, v]) => [k, v.noul]).sort((a, b) => b[1] - a[1]);
  console.log('  并集题 · P(考查) 排序：');
  for (const [k, v] of sorted.slice(0, 6)) console.log(`     ${v.toFixed(3)}  ${k}`);
} catch (e) { console.log('  失败:', e.message); }

// ============ 汇总 ============
console.log('\n' + '='.repeat(86));
console.log('  汇总');
console.log('='.repeat(86));
const n = exp1.length;
const stab = exp1.filter((x) => x.stable).length;
const hit = exp1.filter((x) => x.hit).length;
const avgConf = exp1.reduce((s, x) => s + (x.confs[0] || 0), 0) / n;
console.log(`  三轮一致率: ${stab}/${n} = ${(stab / n * 100).toFixed(0)}%`);
console.log(`  准确率:     ${hit}/${n} = ${(hit / n * 100).toFixed(0)}%`);
console.log(`  平均置信度: ${avgConf.toFixed(3)}`);
console.log(`\n  对照（本地 Intern-Decision-0.8B）: 一致率 100% / 准确率 25% / conf 0.22~0.39`);
console.log(`  对照（DeepSeek V4.1 自由写名）:   稳定度 4%`);
console.log(`  对照（DeepSeek V4.1 只输出序号）: 稳定度 75%`);

fs.mkdirSync(path.join(ROOT, 'output/jev'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'output/jev/result.json'), JSON.stringify({
  generatedAt: new Date().toISOString(), model: 'jev (EdgeOne Makers)', rounds: ROUNDS,
  experiment1: exp1,
}, null, 1));
console.log('\n  落盘: output/jev/result.json');
