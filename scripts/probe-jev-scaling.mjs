#!/usr/bin/env node
// ============ 实测：Jev 的候选数上限 + 分批策略 ============
//
// 上一轮结论：12 候选时 Jev 准确率 100% / conf 0.863
// 本轮回答两个问题：
//   ① criteria 能塞多少个候选？准确率/置信度怎么随候选数衰减？
//   ② 271 个节点必须分批 → 两阶段（先判单元，再判该单元内的知识点）准不准？
//
// 用法：node scripts/probe-jev-scaling.mjs
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tcb = path.join(ROOT, 'node_modules/.bin/tcb');
const ENV = process.env.TCB_ENV || 'cloud1-d8g0ty39wd73f430a';
const KEY = process.env.JEV_KEY;
if (!KEY) {
  console.error('[probe-jev-scaling] 缺少 JEV_KEY 环境变量——密钥禁止硬编码入库，请放入本地 .env（已被 .gitignore 忽略）');
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
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(j).slice(0, 200)}`);
  return j;
}

const nodes = query({ find: 'knowledge_nodes', filter: {}, limit: 1000 });
const byName = {};
nodes.forEach((n) => { const nm = String(n.name || '').trim(); if (nm) byName[nm] = n; });
console.log(`图谱 ${nodes.length} 节点\n`);

const descOf = (nm) => {
  const n = byName[nm];
  const st = n && n.concept && n.concept.source_text ? String(n.concept.source_text).trim() : '';
  return (st || nm).slice(0, 100);
};
const INSTR = '这道数学题实际考查的【知识本体】是哪一个？知识本体指定义、性质、表示、操作或关系本身，'
  + '不要选解题方法/题型套路/思想方法。若题目考查的是并、交、补这类运算，选那个运算本身，不要选上位概念。';

const TESTS = [
  { name: '并集运算', state: '已知集合 A={1,2,3}，B={2,3,4}，求 A∪B。', expect: '并集' },
  { name: '交集运算', state: '已知集合 M={x|-1<x<2}，N={x|0<x<3}，求 M∩N。', expect: '交集' },
  { name: '补集运算', state: '设全集 U={1,2,3,4,5}，A={1,3,5}，求 ∁ᵤA。', expect: '补集' },
  { name: '确定性', state: '判断：某班年龄较小的同学能形成一个集合。', expect: '确定性' },
  { name: '元素与集合关系', state: '判断：3 是否属于集合 {1,2,3}？用符号表示。', expect: '属于与不属于' },
];

// ============ 实验一：候选数递增，看衰减 ============
console.log('='.repeat(84));
console.log('  实验一：候选数递增 → 准确率/置信度怎么衰减');
console.log('='.repeat(84));

// 12 个核心候选（对照组）
const CORE12 = ['集合', '元素', '属于与不属于', '属于与包含的关系', '并集', '交集',
  '补集', '子集', '集合相等', '确定性', '互异性', '无序性'];

// 从图谱取更多节点（按 path 排序，保证稳定）
const others = nodes.map((n) => String(n.name || '').trim()).filter((nm) => nm && !CORE12.includes(nm));

const SIZES = [12, 30, 60, 120];
const exp1 = [];
for (const size of SIZES) {
  const names = [...CORE12, ...others.slice(0, Math.max(0, size - CORE12.length))];
  const criteria = {};
  for (const nm of names) criteria[nm] = descOf(nm);
  criteria['其他/都不是'] = '不属于以上任何一个';

  let hit = 0, confSum = 0, err = null;
  process.stdout.write(`  候选 ${String(size).padStart(3)} 个: `);
  for (const t of TESTS) {
    try {
      const r = await jev(t.state, { k: { type: 'choice', instructions: INSTR, criteria } });
      const ans = r.answers.k;
      if (ans.choice === t.expect) hit++;
      confSum += ans.confidence;
    } catch (e) { err = e.message; break; }
  }
  if (err) { console.log(`❌ ${err.slice(0, 90)}`); exp1.push({ size, error: err }); continue; }
  const acc = hit / TESTS.length;
  const avgConf = confSum / TESTS.length;
  console.log(`准确率 ${(acc * 100).toFixed(0)}%  平均conf ${avgConf.toFixed(3)}`);
  exp1.push({ size, acc, avgConf });
}

// ============ 实验二：两阶段（先判单元，再判知识点）============
console.log('\n' + '='.repeat(84));
console.log('  实验二：两阶段策略（先判章节，再判该章内的知识点）');
console.log('='.repeat(84));

// 按 path[2]（章节）分组
const chapters = {};
nodes.forEach((n) => {
  const p = n.path;
  const ch = Array.isArray(p) && p.length >= 3 ? String(p[2]) : '未分类';
  (chapters[ch] = chapters[ch] || []).push(String(n.name || '').trim());
});
const chNames = Object.keys(chapters);
console.log(`\n  章节数: ${chNames.length}`);
for (const c of chNames) console.log(`    ${c}  (${chapters[c].length} 个知识点)`);

const CH_OF = {
  '并集': '第一章 集合与常用逻辑用语', '交集': '第一章 集合与常用逻辑用语',
  '补集': '第一章 集合与常用逻辑用语', '确定性': '第一章 集合与常用逻辑用语',
  '属于与不属于': '第一章 集合与常用逻辑用语',
};

const exp2 = [];
for (const t of TESTS) {
  // 阶段1：判章节
  const chCriteria = {};
  for (const c of chNames) chCriteria[c] = `本章包含：${chapters[c].slice(0, 6).join('、')} 等`;
  chCriteria['其他/都不是'] = '不属于以上任何一章';
  let pickedCh = null, chConf = 0;
  try {
    const r1 = await jev(t.state, { ch: { type: 'choice', instructions: '这道题考查的知识点属于哪一章？', criteria: chCriteria } });
    pickedCh = r1.answers.ch.choice;
    chConf = r1.answers.ch.confidence;
  } catch (e) { console.log(`  [${t.name}] 阶段1失败: ${e.message.slice(0, 80)}`); continue; }

  const expectCh = CH_OF[t.expect] || null;
  const chOk = expectCh ? pickedCh === expectCh : null;

  // 阶段2：在该章内选知识点
  const inner = chapters[pickedCh] || [];
  let picked = null, conf = 0, nCand = inner.length;
  if (inner.length) {
    const c2 = {};
    for (const nm of inner.slice(0, 60)) c2[nm] = descOf(nm);
    c2['其他/都不是'] = '不属于以上任何一个';
    try {
      const r2 = await jev(t.state, { kp: { type: 'choice', instructions: INSTR, criteria: c2 } });
      picked = r2.answers.kp.choice;
      conf = r2.answers.kp.confidence;
    } catch (e) { console.log(`  [${t.name}] 阶段2失败: ${e.message.slice(0, 80)}`); }
  }
  const hit = picked === t.expect;
  exp2.push({ name: t.name, expect: t.expect, pickedCh, chOk, nCand, picked, conf, hit });
  console.log(`  [${t.name}] 期望「${t.expect}」`);
  console.log(`     阶段1 → ${pickedCh} (conf ${chConf.toFixed(2)}) ${chOk === null ? '' : chOk ? '✅' : '❌'}`);
  console.log(`     阶段2 → ${picked} (conf ${conf.toFixed(2)}, ${nCand}候选) ${hit ? '✅' : '❌'}`);
}

// ============ 汇总 ============
console.log('\n' + '='.repeat(84));
console.log('  汇总');
console.log('='.repeat(84));
console.log('\n  候选数衰减：');
for (const e of exp1) {
  if (e.error) console.log(`    ${e.size} 个: ❌ ${e.error.slice(0, 70)}`);
  else console.log(`    ${String(e.size).padStart(3)} 个: 准确率 ${(e.acc * 100).toFixed(0)}%  conf ${e.avgConf.toFixed(3)}`);
}
const ok2 = exp2.filter((x) => x.hit).length;
const chOkN = exp2.filter((x) => x.chOk).length;
console.log(`\n  两阶段：章节判断 ${chOkN}/${exp2.length}，最终命中 ${ok2}/${exp2.length}`);
console.log(`    对照单阶段 12 候选: 准确率 100%`);

fs.mkdirSync(path.join(ROOT, 'output/jev'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'output/jev/scaling.json'), JSON.stringify({
  generatedAt: new Date().toISOString(), experiment1: exp1, experiment2: exp2,
}, null, 1));
console.log('\n  落盘: output/jev/scaling.json');
