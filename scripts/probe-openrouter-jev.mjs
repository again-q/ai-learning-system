#!/usr/bin/env node
// ============ OpenRouter Jev 实测：跨网关复现 + 成本 + choice/noul 组合 ============
//
// 背景：腾讯 EdgeOne 上已实测（同款 jev-1.13）：
//   · 12 候选 → 准确率 100%，conf 0.998
//   · 254 候选 → 准确率 100%，conf 0.992（255 是上限）
//   · 两阶段（判章→章内选点）→ 5/5 全对
//
// 本轮在 OpenRouter 上验证三件事：
//   ① 跨网关一致性：同样题目是否复现同样结果
//   ② 上下文限制：OpenRouter 宣称 32k，实测候选数上限
//   ③ choice/noul 组合方案（更贴合 knowledgeUsage 的 1~5 个知识点）
//      —— 官方 cookbook 推荐：choice 选主分类 + 每个 tag 一个 noul
//
// 用法：node scripts/probe-openrouter-jev.mjs
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tcb = path.join(ROOT, 'node_modules/.bin/tcb');
const ENV = process.env.TCB_ENV || 'cloud1-d8g0ty39wd73f430a';
const KEY = process.env.OR_KEY;
const URL = 'https://openrouter.ai/api/v1/systemone';
const MODEL = 'typesafe/jev-1.13';

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
    body: JSON.stringify({ model: MODEL, state, questions }),
  });
  const j = await res.json();
  if (!res.ok) {
    const msg = j && j.error ? j.error.message : JSON.stringify(j).slice(0, 200);
    const err = new Error(`HTTP ${res.status}: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return j;
}

const nodes = query({ find: 'knowledge_nodes', filter: {}, limit: 1000 });
const byName = {};
nodes.forEach((n) => { const nm = String(n.name || '').trim(); if (nm) byName[nm] = n; });
const descOf = (nm) => {
  const n = byName[nm];
  const st = n && n.concept && n.concept.source_text ? String(n.concept.source_text).trim() : '';
  return (st || nm).slice(0, 100);
};
console.log(`图谱 ${nodes.length} 节点\n`);

const INSTR = '这道数学题实际考查的【知识本体】是哪一个？知识本体指定义、性质、表示、操作或关系本身，'
  + '不要选解题方法/题型套路/思想方法。若题目考查的是并、交、补这类运算，选那个运算本身，不要选上位概念。';

const CORE12 = ['集合', '元素', '属于与不属于', '属于与包含的关系', '并集', '交集',
  '补集', '子集', '集合相等', '确定性', '互异性', '无序性'];

const TESTS = [
  { name: '并集运算', state: '已知集合 A={1,2,3}，B={2,3,4}，求 A∪B。', expect: '并集' },
  { name: '交集运算', state: '已知集合 M={x|-1<x<2}，N={x|0<x<3}，求 M∩N。', expect: '交集' },
  { name: '补集运算', state: '设全集 U={1,2,3,4,5}，A={1,3,5}，求 ∁ᵤA。', expect: '补集' },
  { name: '确定性', state: '判断：某班年龄较小的同学能形成一个集合。', expect: '确定性' },
  { name: '元素与集合关系', state: '判断：3 是否属于集合 {1,2,3}？用符号表示。', expect: '属于与不属于' },
];

const all = nodes.map((n) => String(n.name || '').trim()).filter(Boolean);

// ============ 实验一：跨网关复现（12 / 254 候选）============
console.log('='.repeat(84));
console.log('  实验一：跨网关复现（对照腾讯 EdgeOne 的结果）');
console.log('='.repeat(84));

const exp1 = [];
for (const size of [12, 60, 254]) {
  const names = size === 12 ? CORE12 : all.slice(0, size);
  const criteria = {};
  for (const nm of names) criteria[nm] = descOf(nm);
  criteria['其他/都不是'] = '不属于以上任何一个';
  let hit = 0, conf = 0, cost = 0, tok = 0, err = null;
  for (const t of TESTS) {
    try {
      const r = await jev(t.state, { k: { type: 'choice', instructions: INSTR, criteria } });
      const a = r.answers.k;
      if (a.choice === t.expect) hit++;
      conf += a.confidence;
      if (r.usage) { cost += Number(r.usage.cost || 0); tok += Number(r.usage.prompt_tokens || r.usage.input_tokens || 0); }
    } catch (e) { err = e.message; break; }
  }
  if (err) { console.log(`  候选 ${String(size).padStart(3)}: ❌ ${err.slice(0, 110)}`); exp1.push({ size, error: err }); continue; }
  const acc = hit / TESTS.length * 100;
  const avgConf = conf / TESTS.length;
  const avgCost = cost / TESTS.length;
  console.log(`  候选 ${String(size).padStart(3)}: 准确率 ${acc.toFixed(0)}%  conf ${avgConf.toFixed(3)}  输入tok ${(tok / TESTS.length).toFixed(0)}  成本 $${avgCost.toFixed(6)}`);
  exp1.push({ size, acc, avgConf, avgTok: tok / TESTS.length, avgCostUsd: avgCost });
}

// ============ 实验二：choice + noul 组合（官方 cookbook 推荐）============
console.log('\n' + '='.repeat(84));
console.log('  实验二：choice（主知识点）+ noul × N（是否还考查 X）');
console.log('='.repeat(84));
console.log('  （更贴合 knowledgeUsage 的 1~5 个知识点，choice 是互斥单选）\n');

// 用 question id 必须英文/合法标识符（腾讯那边中文 id 报错）
const exp2 = [];
for (const t of TESTS.slice(0, 3)) {
  const questions = {
    main: { type: 'choice', instructions: INSTR, criteria: (() => {
      const c = {}; for (const nm of CORE12) c[nm] = descOf(nm); c['其他/都不是'] = '不属于以上任何一个'; return c;
    })() },
  };
  // 对每个候选（除主选外）问一次 noul
  CORE12.forEach((nm, i) => {
    questions['tag_' + (i + 1)] = {
      type: 'noul',
      instructions: `这道题是否也考查了「${nm}」这个知识点？`,
      criteria: { true: '确实考查了 / 用到了', false: '没有考查' },
    };
  });
  try {
    const r = await jev(t.state, questions);
    const main = r.answers.main.choice;
    const hits = [];
    CORE12.forEach((nm, i) => {
      const v = r.answers['tag_' + (i + 1)];
      if (v && v.noul > 0.5) hits.push(`${nm}:${v.noul.toFixed(2)}`);
    });
    const ok = main === t.expect;
    console.log(`  [${t.name}] 期望「${t.expect}」`);
    console.log(`     主 choice → ${main} (conf ${r.answers.main.confidence.toFixed(2)}) ${ok ? '✅' : '❌'}`);
    console.log(`     noul 命中: ${hits.join('  ') || '（无）'}`);
    exp2.push({ name: t.name, expect: t.expect, main, mainOk: ok, tags: hits });
  } catch (e) { console.log(`  [${t.name}] ❌ ${e.message.slice(0, 120)}`); }
}

// ============ 汇总 ============
console.log('\n' + '='.repeat(84));
console.log('  汇总');
console.log('='.repeat(84));
console.log('\n  OpenRouter（本次）：');
for (const e of exp1) {
  if (e.error) console.log(`    ${e.size} 候选: ❌ ${e.error.slice(0, 70)}`);
  else console.log(`    ${String(e.size).padStart(3)} 候选: 准确率 ${e.acc.toFixed(0)}%  conf ${e.avgConf.toFixed(3)}  $${e.avgCostUsd.toFixed(6)}/题`);
}
console.log('\n  腾讯 EdgeOne（对照，同款模型）：');
console.log('      12 候选: 准确率 100%  conf 0.998');
console.log('     254 候选: 准确率 100%  conf 0.992');
console.log('     两阶段  : 准确率 100% (5/5)');

const okMain = exp2.filter((x) => x.mainOk).length;
if (exp2.length) console.log(`\n  choice+noul 组合：主 choice 命中 ${okMain}/${exp2.length}`);

fs.mkdirSync(path.join(ROOT, 'output/openrouter'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'output/openrouter/result.json'), JSON.stringify({
  generatedAt: new Date().toISOString(), gateway: 'openrouter', model: MODEL,
  experiment1: exp1, experiment2: exp2,
}, null, 1));
console.log('\n  落盘: output/openrouter/result.json');
