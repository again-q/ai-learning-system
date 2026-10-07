#!/usr/bin/env node
// ============ 线上库实况快照（只读） ============
// 用途：状态文档全量更新前，从线上库取真实规模与分布，替代「凭记忆/凭旧文档」。
// 用法：node scripts/dump-live-state.mjs [-e 环境id]
// 严禁：本脚本不做任何写操作（只用 QUERY 命令类型）。
// 输出：output/live-state/<时间戳>.json（含每个集合的样本结构与分布统计）
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
function run(cmd) {
  const payload = [{ TableName: cmd.find || 'x', CommandType: 'QUERY', Command: JSON.stringify(cmd) }];
  const raw = execFileSync(tcb, ['db', 'nosql', 'execute', '--json', '-e', ENV, '--command', JSON.stringify(payload)],
    { cwd: ROOT, encoding: 'utf8', timeout: 300000, maxBuffer: 1e8 });
  const s = raw.indexOf('['), e = raw.lastIndexOf(']');
  try { return unwrap(JSON.parse(raw.slice(s, e + 1))); } catch (err) { return { raw: raw.slice(0, 300) }; }
}
function find(table, limit = 5000, projection = {}) {
  const arr = run({ find: table, filter: {}, projection, limit });
  const first = Array.isArray(arr) ? arr[0] : null;
  return Array.isArray(first) ? first : (first && first.data) || [];
}
const tally = (arr, fn) => arr.reduce((a, x) => { const k = String(fn(x)); a[k] = (a[k] || 0) + 1; return a; }, {});
const has = (v) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0) && v !== '';
const round = (n, d = 3) => (typeof n === 'number' ? Number(n.toFixed(d)) : n);

const snap = { env: ENV, fetchedAt: new Date().toISOString(), collections: {}, detail: {} };

// ---------- 1. 各集合规模 ----------
const COLLECTIONS = ['knowledge_nodes', 'custom_nodes', 'knowledge_extras', 'questions', 'batches',
  'users', 'reports', 'knowledge_progress', 'unit_progress', 'mastery_logs', 'node_requests', 'debug_logs'];
const docs = {};
for (const c of COLLECTIONS) {
  docs[c] = find(c, 5000);
  snap.collections[c] = docs[c].length;
}

// ---------- 2. 知识图谱 ----------
const kn = docs.knowledge_nodes;
snap.detail.knowledge_nodes = {
  total: kn.length,
  byType: tally(kn, (n) => n.type || '(无)'),
  byPartition: tally(kn, (n) => n.partition || '(未打标)'),
  byGrade: tally(kn, (n) => n.grade || '(无)'),
  withPath: kn.filter((n) => Array.isArray(n.path) && n.path.length > 0).length,
  withDeps: kn.filter((n) => Array.isArray(n.deps) && n.deps.length > 0).length,
  withKnowledgeId: kn.filter((n) => has(n.knowledgeId)).length,
  byChapter: tally(kn, (n) => n.chapter || '(无)'),
};

// ---------- 3. 题目 ----------
const qs = docs.questions;
const judged = qs.filter((q) => has(q.diagnosis) || has(q.errorType) || has(q.pattern));
snap.detail.questions = {
  total: qs.length,
  bySource: tally(qs, (q) => q.source || '(无)'),
  byQuestionCategory: tally(qs, (q) => q.questionCategory || '(无)'),
  byQuestionType: tally(qs, (q) => q.questionType || '(无)'),
  judgedOrHasPattern: judged.length,
  withIsCorrect: qs.filter((q) => q.isCorrect !== undefined && q.isCorrect !== null).length,
  withFiveDim: qs.filter((q) => has(q.fiveDim)).length,
  withKnowledgeUsage: qs.filter((q) => Array.isArray(q.knowledgeUsage) && q.knowledgeUsage.length > 0).length,
  withOldSingleNodeName: qs.filter((q) => has(q.knowledgeNodeName)).length,
  withReferenceProcess: qs.filter((q) => has(q.referenceProcess)).length,
  distinctUserId: [...new Set(qs.map((q) => q.userId || q._openid).filter(Boolean))].length,
  byErrorLevel: tally(qs, (q) => q.errorLevel || '(无)'),
};

// ---------- 4. 批次 / 用户 / 报告 ----------
snap.detail.batches = {
  total: docs.batches.length,
  byStatus: tally(docs.batches, (b) => b.status || '(无)'),
  imageTotal: docs.batches.reduce((a, b) => a + (Number(b.imageCount) || 0), 0),
  distinctUserId: [...new Set(docs.batches.map((b) => b.userId || b._openid).filter(Boolean))].length,
};
snap.detail.users = {
  total: docs.users.length,
  nickNames: docs.users.map((u) => u.nickName || '(无昵称)'),
  kOverall: docs.users.map((u) => round(u.kOverall)),
  aOverall: docs.users.map((u) => round(u.aOverall)),
};
snap.detail.reports = {
  total: docs.reports.length,
  distinctUserId: [...new Set(docs.reports.map((r) => r.userId).filter(Boolean))].length,
  latest: docs.reports.map((r) => r.createdAt).filter(has).sort().slice(-1)[0] || null,
  earliest: docs.reports.map((r) => r.createdAt).filter(has).sort()[0] || null,
};

// ---------- 5. 掌握度账 ----------
const kp = docs.knowledge_progress;
const masteryVals = kp.map((x) => Number(x.mastery)).filter((v) => !Number.isNaN(v));
snap.detail.knowledge_progress = {
  total: kp.length,
  distinctUserId: [...new Set(kp.map((x) => x.userId).filter(Boolean))].length,
  withEvidence: kp.filter((x) => has(x.evidence)).length,
  withAggregated: kp.filter((x) => has(x.aggregated)).length,
  withAlgorithm: kp.filter((x) => has(x.algorithm)).length,
  withAttempts: kp.filter((x) => has(x.attempts)).length,
  withCorrectCount: kp.filter((x) => has(x.correctCount)).length,
  withOldOnly: kp.filter((x) => has(x.sValue) || has(x.dValue)).length,
  masteryMin: masteryVals.length ? round(Math.min(...masteryVals)) : null,
  masteryMax: masteryVals.length ? round(Math.max(...masteryVals)) : null,
  masteryAvg: masteryVals.length ? round(masteryVals.reduce((a, b) => a + b, 0) / masteryVals.length) : null,
  allKeys: [...new Set(kp.flatMap((x) => Object.keys(x)))].sort(),
};
const up = docs.unit_progress;
snap.detail.unit_progress = {
  total: up.length,
  distinctUserId: [...new Set(up.map((x) => x.userId).filter(Boolean))].length,
  aValueList: up.map((x) => ({ unitName: x.unitName, aValue: round(x.aValue), n: x.n })),
  allKeys: [...new Set(up.flatMap((x) => Object.keys(x)))].sort(),
};

// ---------- 6. 掌握度日志（口径是否跑过） ----------
const ml = docs.mastery_logs;
snap.detail.mastery_logs = {
  total: ml.length,
  byAlgorithm: tally(ml, (x) => x.algorithm || '(无)'),
  distinctUserId: [...new Set(ml.map((x) => x.userId).filter(Boolean))].length,
  latest: ml.map((x) => x.createdAt).filter(has).sort().slice(-1)[0] || null,
  earliest: ml.map((x) => x.createdAt).filter(has).sort()[0] || null,
  byMonth: tally(ml, (x) => String(x.createdAt || '').slice(0, 7) || '(无)'),
};

snap.detail.debug_logs = { total: docs.debug_logs.length, byStep: tally(docs.debug_logs, (x) => x.step || '(无)') };
snap.detail.knowledge_extras = { total: docs.knowledge_extras.length, byAspect: tally(docs.knowledge_extras, (x) => x.aspect || '(无)') };
snap.detail.custom_nodes = { total: docs.custom_nodes.length };
snap.detail.node_requests = { total: docs.node_requests.length };

// ---------- 输出 ----------
console.log(JSON.stringify(snap, null, 1));
fs.mkdirSync(path.join(ROOT, 'output/live-state'), { recursive: true });
const file = path.join(ROOT, `output/live-state/${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.json`);
fs.writeFileSync(file, JSON.stringify(snap, null, 1));
console.error('\n快照已写 ' + path.relative(ROOT, file));
