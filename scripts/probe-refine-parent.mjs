#!/usr/bin/env node
// ============ 实测 4：父节点被挑中 → 怎么细化 ============
//
// 两条路线对比（用户提出）：
//   路线一（前置）：prompt 里要求 AI 一开始就输出到最细，禁止输出父节点名
//   路线二（后置）：AI 输出了父节点名 → 把该父节点的子节点清单丢回 AI，让它细化
//
// 本脚本测的是【路线二的可行性】：
//   ① AI 拿到「父节点名 + 它的子节点清单 + 题目上下文」→ 能否选出正确的子节点？
//   ② 三轮一致性如何（是不是稳定，还是会乱选）？
//   ③ 成本多少？
//
// 同时对照【路线一】：改 prompt 直接禁止父节点名（用同一道题测）。
//
// 用法：node scripts/probe-refine-parent.mjs
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tcb = path.join(ROOT, 'node_modules/.bin/tcb');
const ENV = process.env.TCB_ENV || 'cloud1-d8g0ty39wd73f430a';
const envText = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const getEnv = (k) => (envText.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim();
const KEY = getEnv('SMOKE_API_KEY');
const BASE = getEnv('SMOKE_API_BASE') || 'https://api.deepseek.com';
const MODEL = 'deepseek-flash';

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
async function call(prompt) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: MODEL, temperature: 1.0, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = await res.json();
  return { content: j.choices[0].message.content, usage: j.usage };
}
const extractJSON = (t) => {
  const m = t.match(/```(?:json)?\s*([\s\S]*?)```/) || t.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  return JSON.parse((m ? m[1] : t).trim());
};

// ---------- 数据 ----------
const nodes = query({ find: 'knowledge_nodes', filter: {}, limit: 1000 });
const qs = query({ find: 'questions', filter: {}, limit: 1000 });
console.log(`图谱 ${nodes.length} 节点｜题目 ${qs.length} 道\n`);

// 建父子关系
const byId = {};
nodes.forEach((n) => { const id = n.knowledgeId || n._id; if (id) byId[id] = n; });
const kidsOf = {};
nodes.forEach((n) => { if (n.parentId) (kidsOf[n.parentId] = kidsOf[n.parentId] || []).push(n); });
const parentIds = new Set(nodes.map((n) => n.parentId).filter(Boolean));

// 挑出"被 AI 频繁挑中"的父节点
const aiCount = new Map();
for (const q of qs) for (const u of (q.knowledgeUsage || [])) {
  const nm = String((u && u.name) || '').trim(); if (nm) aiCount.set(nm, (aiCount.get(nm) || 0) + 1);
}
const hotParents = nodes.filter((n) => parentIds.has(n.knowledgeId || n._id) && aiCount.has(String(n.name || '')))
  .map((n) => ({ node: n, cnt: aiCount.get(String(n.name)) }))
  .sort((a, b) => b.cnt - a.cnt);
console.log('被 AI 挑中的父节点：');
for (const h of hotParents) {
  const kids = kidsOf[h.node.knowledgeId || h.node._id] || [];
  console.log(`  ${String(h.cnt).padStart(3)} 次  ${h.node.name}  → ${kids.length} 个子节点`);
}

// ---------- 路线二：把子节点丢回 AI 细化 ----------
console.log('\n' + '='.repeat(84));
console.log('  路线二：父节点 → 丢回 AI 细化（看能否选对 + 是否稳定）');
console.log('='.repeat(84));

const REFINE = (parentName, kids, qText) => `你在为一道数学题标注「考查的知识点」。

题目：${qText}

系统初步判定这道题考查「${parentName}」。但「${parentName}」是一个**上位概念**，需要细化到最具体的那一层。

请从下面的候选中，选出这道题**实际考查**的最细知识点（可多选，1~3 个）：
${kids.map((k, i) => `${i + 1}. ${k.name}${k.type ? `（${k.type}）` : ''}`).join('\n')}

判定要求：
- 只选这道题**真正用到**的；用不到的不要选
- 如果这题同时用到多个，可以都选上（最多 3 个）
- 只输出 JSON：{"picked":[{"name":"选中的知识点名"}],"reason":"一句话依据"}
只输出 JSON。`;

// 取几道含这些父节点名的题
const tests = [];
for (const h of hotParents.slice(0, 4)) {
  const pname = String(h.node.name);
  const q = qs.find((x) => (x.knowledgeUsage || []).some((u) => String((u && u.name) || '').trim() === pname));
  if (!q) continue;
  const kids = (kidsOf[h.node.knowledgeId || h.node._id] || []).filter((k) => String(k.partition || '') !== 'method');
  if (kids.length < 2) continue;
  tests.push({ parent: h.node, kids, qText: String(q.questionText || '').slice(0, 200), cnt: h.cnt });
}

const ROUNDS = 3;
let totalUsage = { prompt: 0, completion: 0, total: 0 }, calls = 0;
for (const t of tests) {
  console.log(`\n  【${t.parent.name}】候选 ${t.kids.length} 个子节点：${t.kids.map((k) => k.name).join(' / ')}`);
  console.log(`  题目：${t.qText.slice(0, 60)}...`);
  const picks = [];
  for (let i = 0; i < ROUNDS; i++) {
    try {
      const r = await call(REFINE(t.parent.name, t.kids, t.qText));
      const j = extractJSON(r.content);
      picks.push((j.picked || []).map((p) => p.name).join('、'));
      totalUsage.prompt += r.usage.prompt_tokens; totalUsage.completion += r.usage.completion_tokens; totalUsage.total += r.usage.total_tokens; calls++;
      console.log(`     轮${i + 1}: ${picks[i]}`);
    } catch (e) { picks.push('ERR'); console.log(`     轮${i + 1} 失败: ${e.message}`); }
  }
  const stable = picks.length > 1 && picks.every((p) => p === picks[0]);
  console.log(`     ▶ ${stable ? '✅ 三轮一致' : '❌ 不稳定'}`);
}

// ---------- 路线一：prompt 直接要求禁止父节点 ----------
console.log('\n' + '='.repeat(84));
console.log('  路线一：prompt 一开始就禁止父节点名（同一批题测）');
console.log('='.repeat(84));

const leafNames = nodes.filter((n) => !parentIds.has(n.knowledgeId || n._id) && String(n.partition || '') !== 'method').map((n) => String(n.name));
const DIRECT = (qText) => `你在为一道数学题标注「考查的知识点」。

题目：${qText}

从下面的【知识点清单】里选出这道题实际考查的知识点（1~3 个）。
清单里的都是**最细一层**的节点，**必须从清单里选，不要写清单外的名字，不要写上位概念**。

【知识点清单】
${leafNames.join('、')}

只输出 JSON：{"picked":["名字1","名字2"],"reason":"一句话依据"}
只输出 JSON。`;

const directPicks = [];
for (const t of tests.slice(0, 2)) {
  console.log(`\n  题目：${t.qText.slice(0, 60)}...`);
  for (let i = 0; i < ROUNDS; i++) {
    try {
      const r = await call(DIRECT(t.qText));
      const j = extractJSON(r.content);
      const picked = (j.picked || []).join('、');
      directPicks.push(picked);
      totalUsage.prompt += r.usage.prompt_tokens; totalUsage.completion += r.usage.completion_tokens; totalUsage.total += r.usage.total_tokens; calls++;
      console.log(`     轮${i + 1}: ${picked}`);
    } catch (e) { console.log(`     轮${i + 1} 失败: ${e.message}`); }
  }
}

// ---------- 成本 ----------
console.log('\n' + '='.repeat(84));
console.log('  成本');
console.log('='.repeat(84));
console.log(`  调用次数：${calls}`);
console.log(`  平均每次：in ${(totalUsage.prompt / calls).toFixed(0)} / out ${(totalUsage.completion / calls).toFixed(0)} / total ${(totalUsage.total / calls).toFixed(0)} tok`);
console.log(`  合计：${totalUsage.total} tok`);
