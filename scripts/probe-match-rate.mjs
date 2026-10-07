#!/usr/bin/env node
// ============ 只读核查：知识点匹配成功率（A 停在 0.30 的真因排查）============
// 目的：验证「custom_nodes 兜底已删 + findNode 门槛 0.8」是否导致大量题匹配失败，
//       进而使 updateMastery 的 unitName=null → A 整段不写账。
// 严禁：只读（QUERY），不做任何写操作。
// 用法：node scripts/probe-match-rate.mjs
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tcb = path.join(ROOT, 'node_modules/.bin/tcb');
const ENV = process.env.TCB_ENV || 'cloud1-d8g0ty39wd73f430a';

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
function query(cmd) {
  const payload = [{ TableName: cmd.find, CommandType: 'QUERY', Command: JSON.stringify(cmd) }];
  const raw = execFileSync(tcb, ['db', 'nosql', 'execute', '--json', '-e', ENV, '--command', JSON.stringify(payload)],
    { cwd: ROOT, encoding: 'utf8', timeout: 300000, maxBuffer: 1e8 });
  const s = raw.indexOf('['), e = raw.lastIndexOf(']');
  const arr = unwrap(JSON.parse(raw.slice(s, e + 1)));
  const first = Array.isArray(arr) ? arr[0] : null;
  return Array.isArray(first) ? first : (first && first.data) || [];
}

// —— 照抄 graphEngine/src/lib/knowledgeMatch.js 的 simName / 门槛 0.8 ——
function simName(a, b) {
  a = String(a || '').trim(); b = String(b || '').trim();
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    const short = Math.min(a.length, b.length), long = Math.max(a.length, b.length);
    return Math.min(1, 0.6 + 0.4 * (short / long));
  }
  const sa = new Set(a), sb = new Set(b);
  let inter = 0;
  for (const c of sa) if (sb.has(c)) inter++;
  return (2 * inter) / (sa.size + sb.size);
}
const THRESHOLD = 0.8;

console.log('='.repeat(78));
console.log('  知识点匹配率核查（只读）  env=' + ENV);
console.log('='.repeat(78));

// 1) 取图谱节点
const nodes = query({ find: 'knowledge_nodes', filter: {}, limit: 1000 });
console.log(`\n图谱节点数：${nodes.length}`);
const nodeNames = nodes.map((n) => String(n.name || '').trim()).filter(Boolean);

// 2) 取题目
const qs = query({ find: 'questions', filter: {}, limit: 1000 });
console.log(`题目总数：${qs.length}`);

const answerQs = qs.filter((q) => q.questionType === '解答');
console.log(`其中解答题：${answerQs.length}`);

// 3) 逐题逐知识点匹配
function findBest(name) {
  let best = null, bestScore = 0;
  for (const n of nodes) {
    const nm = String(n.name || '');
    if (!nm) continue;
    const s = simName(name, nm);
    if (s > bestScore) { bestScore = s; best = n; }
  }
  return { node: best, score: bestScore };
}

const stat = {
  totalUsage: 0, matched: 0, failed: 0,
  failNames: new Map(),      // 失败的知识点名 → 次数
  nearMiss: [],              // 0.6~0.8 的近失（门槛挡掉的）
  unitResolved: 0,           // 至少有一个知识点能定出 unitName 的题数
  unitFailed: 0,             // 一个都定不出的题数
};

for (const q of answerQs) {
  const usage = Array.isArray(q.knowledgeUsage) ? q.knowledgeUsage : [];
  const names = usage.map((u) => String((u && u.name) || '').trim()).filter(Boolean);
  const fallback = String(q.knowledgeNodeName || '').trim();
  const list = names.length ? names : (fallback ? [fallback] : []);
  if (!list.length) { stat.unitFailed++; continue; }

  let gotUnit = false;
  for (const nm of list) {
    stat.totalUsage++;
    const { node, score } = findBest(nm);
    if (score >= THRESHOLD && node) {
      stat.matched++;
      const p = node.path;
      if (Array.isArray(p) && p.length >= 3) gotUnit = true;
    } else {
      stat.failed++;
      stat.failNames.set(nm, (stat.failNames.get(nm) || 0) + 1);
      if (score >= 0.6) stat.nearMiss.push({ name: nm, best: node ? node.name : null, score: Math.round(score * 1000) / 1000 });
    }
  }
  if (gotUnit) stat.unitResolved++; else stat.unitFailed++;
}

console.log('\n' + '='.repeat(78));
console.log('  一、知识点级匹配');
console.log('='.repeat(78));
console.log(`  知识点条目总数：${stat.totalUsage}`);
console.log(`  匹配成功：${stat.matched}  (${stat.totalUsage ? ((stat.matched / stat.totalUsage) * 100).toFixed(1) : 0}%)`);
console.log(`  匹配失败：${stat.failed}  (${stat.totalUsage ? ((stat.failed / stat.totalUsage) * 100).toFixed(1) : 0}%)`);

console.log('\n' + '='.repeat(78));
console.log('  二、题级：能否定出 unitName（= A 能不能写账）');
console.log('='.repeat(78));
console.log(`  能定出单元：${stat.unitResolved} 题`);
console.log(`  定不出单元：${stat.unitFailed} 题   ← 这些题的 A 完全不写账`);
const tot = stat.unitResolved + stat.unitFailed;
console.log(`  → A 的记账覆盖率：${tot ? ((stat.unitResolved / tot) * 100).toFixed(1) : 0}%`);

console.log('\n' + '='.repeat(78));
console.log('  三、门槛挡掉的近失（0.6 ≤ sim < 0.8）');
console.log('='.repeat(78));
if (!stat.nearMiss.length) console.log('  无');
for (const m of stat.nearMiss.slice(0, 25)) {
  console.log(`  "${m.name}" → 最接近 "${m.best}"  sim=${m.score}`);
}
console.log(`  近失总数：${stat.nearMiss.length}`);

console.log('\n' + '='.repeat(78));
console.log('  四、失败最多的知识点名（Top 20）');
console.log('='.repeat(78));
const fails = [...stat.failNames.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
if (!fails.length) console.log('  无');
for (const [nm, c] of fails) console.log(`  ${String(c).padStart(3)} 次  ${nm}`);
