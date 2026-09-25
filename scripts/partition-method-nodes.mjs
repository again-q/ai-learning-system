#!/usr/bin/env node
// ============ 知识图谱分区：把 method 类节点移入「方法区」 ============
// 背景：云端 knowledge_nodes 271 节点里 89 个 type=method，而决策 028 的 WWH 规定
//       「方法/套路/推导过程」不建知识节点 → 它们会污染知识点选择（模型在「交集」与
//       「求并集交集的方法」之间摇摆），也让 K 记账被摊薄。
// 做法：**不搬集合、不删文档**，只给这些节点加一个 partition 字段（纯新增，可秒回退）。
//   - 「喂模型的清单」(buildNodeNames) 过滤掉 partition==='method'
//   - 「匹配」(findNode/matchKnowledgeNode) 仍然全查 → 历史引用不会炸出 custom_nodes
// 用法：
//   node scripts/partition-method-nodes.cjs              # 干跑（只统计，不写）
//   node scripts/partition-method-nodes.cjs --apply      # 执行打标
//   node scripts/partition-method-nodes.cjs --revert     # 撤销打标
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tcb = path.join(ROOT, 'node_modules/.bin/tcb');
const ENV = process.env.TCB_ENV || 'cloud1-d8g0ty39wd73f430a';
const APPLY = process.argv.includes('--apply');
const REVERT = process.argv.includes('--revert');
const TABLE = 'knowledge_nodes';

function unwrap(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(unwrap);
  const ks = Object.keys(v);
  if (ks.length === 1) {
    const k = ks[0];
    if (/^\$(numberInt|numberLong|numberDouble)$/.test(k)) return Number(v[k]);
    if (k === '$oid' || k === '$date') return v[k];
  }
  const o = {};
  for (const k of ks) o[k] = unwrap(v[k]);
  return o;
}
function run(commandType, cmd) {
  const payload = [{ TableName: TABLE, CommandType: commandType, Command: JSON.stringify(cmd) }];
  const raw = execFileSync(tcb, ['db', 'nosql', 'execute', '--json', '-e', ENV, '--command', JSON.stringify(payload)],
    { cwd: ROOT, encoding: 'utf8', timeout: 300000, maxBuffer: 1e8 });
  const s = raw.indexOf('['), e = raw.lastIndexOf(']');
  try { return unwrap(JSON.parse(raw.slice(s, e + 1))); } catch (err) { return { raw: raw.slice(0, 400) }; }
}
function query(cmd) {
  const arr = run('QUERY', cmd);
  const first = Array.isArray(arr) ? arr[0] : null;
  return Array.isArray(first) ? first : (first && first.data) || [];
}

const all = query({ find: TABLE, filter: {}, projection: { _id: 1, name: 1, type: 1, partition: 1, path: 1 }, limit: 1000 });
if (!all.length) throw new Error('knowledge_nodes 查询返回 0 条 → 拒绝继续（先查登录态/环境 id）');
if (!('path' in (all[0] || {}))) throw new Error('节点缺 path 字段（projection 漏了？）→ 章节统计会静默出错');
const method = all.filter((n) => n.type === 'method');
const tagged = all.filter((n) => n.partition === 'method');
console.log('节点总数 ' + all.length + '｜type=method ' + method.length + '｜已打 container/method 标记 ' + tagged.length);
console.log('章节分布: ' + JSON.stringify(method.reduce((a, n) => { a[n.path ? n.path[2] : '?'] = (a[n.path ? n.path[2] : '?'] || 0) + 1; return a; }, {})));

if (REVERT) {
  const r = run('UPDATE', { update: TABLE, updates: [{ q: { partition: 'method' }, u: { $unset: { partition: '' } }, multi: true }] });
  console.log('回退结果: ' + JSON.stringify(r).slice(0, 200));
} else if (APPLY) {
  const r = run('UPDATE', { update: TABLE, updates: [{ q: { type: 'method' }, u: { $set: { partition: 'method' } }, multi: true }] });
  console.log('打标结果: ' + JSON.stringify(r).slice(0, 300));
  const after = query({ find: TABLE, filter: { partition: 'method' }, projection: { _id: 1 }, limit: 1000 });
  console.log('复核：partition=method 节点数 ' + after.length + '（应为 ' + method.length + '）');
} else {
  console.log('（干跑：未写库。要执行请加 --apply）');
  const out = path.join(ROOT, 'output/graph-partition/method-nodes.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ fetchedAt: new Date().toISOString(), env: ENV, total: all.length, methodCount: method.length, items: method }, null, 1));
  console.log('清单已写 ' + path.relative(ROOT, out));
}
