#!/usr/bin/env node
// ============ 知识图谱快照：把 knowledge_nodes 全量导出为本地快照 ============
// 目的：eval-stability.mjs 要注入与线上**逐字一致**的两段清单（【知识本体清单】/【方法清单】），
//       而旧的 nodes-dump.json 只有扁平 names（无 parentId/partition）→ 无法复现线上 pickLeafNodes 的过滤。
// 做法：只读查询全量节点（含 parentId/partition）→ output/golden/nodes-full.json；
//       过滤规则由 harness 直接 import cloudfunctions 里的 pickLeafNodes，禁止二次实现（防漂移）。
// 用法：node scripts/dump-nodes.mjs   （纯读，不写库）
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tcb = path.join(ROOT, "node_modules/.bin/tcb");
const ENV = process.env.TCB_ENV || "cloud1-d8g0ty39wd73f430a";
const TABLE = "knowledge_nodes";
const { pickLeafNodes } = require(path.join(ROOT, "cloudfunctions/graphEngine/src/lib/knowledgeMatch.js"));

function unwrap(v) {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(unwrap);
  const ks = Object.keys(v);
  if (ks.length === 1) {
    const k = ks[0];
    if (/^\$(numberInt|numberLong|numberDouble)$/.test(k)) return Number(v[k]);
    if (k === "$oid" || k === "$date") return v[k];
  }
  const o = {};
  for (const k of ks) o[k] = unwrap(v[k]);
  return o;
}
function query(cmd) {
  const payload = [{ TableName: TABLE, CommandType: "QUERY", Command: JSON.stringify(cmd) }];
  const raw = execFileSync(tcb, ["db", "nosql", "execute", "--json", "-e", ENV, "--command", JSON.stringify(payload)],
    { cwd: ROOT, encoding: "utf8", timeout: 300000, maxBuffer: 1e8 });
  const s = raw.indexOf("["), e = raw.lastIndexOf("]");
  const arr = unwrap(JSON.parse(raw.slice(s, e + 1)));
  const first = Array.isArray(arr) ? arr[0] : null;
  return Array.isArray(first) ? first : (first && first.data) || [];
}

const items = query({ find: TABLE, filter: {}, projection: { _id: 1, name: 1, type: 1, partition: 1, parentId: 1, knowledgeId: 1, path: 1 }, limit: 1000 });
if (!items.length) throw new Error("knowledge_nodes 查询返回 0 条 → 拒绝写快照（先查登录态/环境 id）");
if (!("parentId" in items[0]) && !items.some((n) => n.parentId)) console.warn("⚠️ 本次快照里没有任何 parentId → 父节点过滤会失效（projection 漏了？）");
const leaves = pickLeafNodes(items);
const methods = items.filter((n) => String(n.partition || "") === "method");
const parents = new Set(items.map((n) => n.parentId).filter(Boolean));
const out = path.join(ROOT, "output/golden/nodes-full.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ fetchedAt: new Date().toISOString(), env: ENV, total: items.length, items }, null, 1));
console.log("节点总数 " + items.length + "｜本体叶子 " + leaves.length + "｜方法 " + methods.length + "｜被引用为父节点 " + parents.size);
console.log("快照已写 " + path.relative(ROOT, out));