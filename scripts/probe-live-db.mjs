#!/usr/bin/env node
// ============ 线上库探针（只读）：打印每个集合的样本结构与计数 ============
// 用途：写状态文档前，先确认真实字段名与真实规模，不靠文档猜。
// 用法：node scripts/probe-live-db.mjs [-e 环境id] [--limit 1]
// 严禁：本脚本不做任何写操作（只用 QUERY 命令类型）。
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tcb = path.join(ROOT, 'node_modules/.bin/tcb');
const ENV = process.env.TCB_ENV || 'cloud1-d8g0ty39wd73f430a';
const SAMPLE = Number(process.env.SAMPLE || 1);

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
  const payload = [{ TableName: cmd.find || cmd.count || 'x', CommandType: commandType, Command: JSON.stringify(cmd) }];
  const raw = execFileSync(tcb, ['db', 'nosql', 'execute', '--json', '-e', ENV, '--command', JSON.stringify(payload)],
    { cwd: ROOT, encoding: 'utf8', timeout: 300000, maxBuffer: 1e8 });
  const s = raw.indexOf('['), e = raw.lastIndexOf(']');
  try { return unwrap(JSON.parse(raw.slice(s, e + 1))); } catch (err) { return { raw: raw.slice(0, 300) }; }
}
function find(table, limit = 5000, projection = {}) {
  const arr = run('QUERY', { find: table, filter: {}, projection, limit });
  const first = Array.isArray(arr) ? arr[0] : null;
  return Array.isArray(first) ? first : (first && first.data) || [];
}

const COLLECTIONS = [
  'knowledge_nodes', 'custom_nodes', 'knowledge_extras', 'questions', 'batches',
  'users', 'reports', 'knowledge_progress', 'unit_progress', 'mastery_logs',
  'node_requests', 'debug_logs',
];

const out = { env: ENV, fetchedAt: new Date().toISOString(), collections: {} };
for (const c of COLLECTIONS) {
  const docs = find(c, 5000);
  out.collections[c] = {
    count: docs.length,
    hitLimit: docs.length >= 5000,
    sampleKeys: docs[0] ? Object.keys(docs[0]).sort() : [],
    sample: docs.slice(0, SAMPLE),
  };
  console.log(`${c.padEnd(20)} 计数=${String(docs.length).padEnd(6)} 字段: ${out.collections[c].sampleKeys.join(',')}`);
}
fs.mkdirSync(path.join(ROOT, 'output/live-state'), { recursive: true });
const file = path.join(ROOT, 'output/live-state/probe.json');
fs.writeFileSync(file, JSON.stringify(out, null, 1));
console.log('\n明细已写 ' + path.relative(ROOT, file));
