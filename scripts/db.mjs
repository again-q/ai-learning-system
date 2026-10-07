#!/usr/bin/env node
// ============ 只读 DB 助手（供本次落地任务的验证脚本共用） ============
// 用途：统一封装 tcb nosql 只读查询，避免每个脚本重复写 execFileSync。
// 约束：只发 QUERY 命令，不做任何写操作。
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TCB = path.join(ROOT, 'node_modules/.bin/tcb');
export const ENV = process.env.TCB_ENV || 'cloud1-d8g0ty39wd73f430a';

function unwrap(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(unwrap);
  const ks = Object.keys(v);
  if (ks.length === 1) {
    const k = ks[0];
    if (/^\$(numberInt|numberLong|numberDouble|numberDecimal)$/.test(k)) return Number(v[k]);
    if (k === '$oid' || k === '$date') return v[k];
  }
  const o = {};
  for (const k of ks) o[k] = unwrap(v[k]);
  return o;
}

export function runRaw(cmd) {
  const payload = [{ TableName: cmd.find || 'x', CommandType: 'QUERY', Command: JSON.stringify(cmd) }];
  const raw = execFileSync(TCB, ['db', 'nosql', 'execute', '--json', '-e', ENV, '--command', JSON.stringify(payload)],
    { cwd: ROOT, encoding: 'utf8', timeout: 300000, maxBuffer: 1e8 });
  const s = raw.indexOf('['), e = raw.lastIndexOf(']');
  if (s < 0 || e < 0) return { raw: raw.slice(-500) };
  try { return unwrap(JSON.parse(raw.slice(s, e + 1))); } catch { return { raw: raw.slice(0, 300) }; }
}

export function find(table, limit = 5000, projection = {}, filter = {}) {
  const arr = runRaw({ find: table, filter, projection, limit });
  const first = Array.isArray(arr) ? arr[0] : null;
  return Array.isArray(first) ? first : (first && first.data) || [];
}

export function count(table) {
  const arr = runRaw({ count: table, query: {} });
  const first = Array.isArray(arr) ? arr[0] : null;
  return (first && first.n) || 0;
}
