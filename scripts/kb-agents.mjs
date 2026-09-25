#!/usr/bin/env node
// ============ 知识点生成 · 多 agent 协作（最小可跑版） ============
// 设计原则（避免「三个模型互相点赞」）：
//   ① 每个 agent 的输出都有【代码收口】校验（编号化/白名单/门槛）；
//   ② agent 之间不互相改稿：A 只提议、B 只投票、C 只在必要时裁决；
//   ③ 关键字段一律走【编号】，名字由代码回填（可复现）。
// 用法：node scripts/kb-agents.mjs --source=db --limit=1 [--ids=xxx]
// 输出：控制台逐阶段 trace + output/kb-agents/run-<ts>.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'output/kb-agents');
const arg = (k, d) => { const hit = process.argv.find((a) => a.startsWith('--' + k + '=')); return hit ? hit.split('=').slice(1).join('=') : d; };
const LIMIT = Number(arg('limit', 1)) || 1;
const IDS = arg('ids', '') ? String(arg('ids')).split(',') : null;

// ---------- 模型配置（同其它脚本） ----------
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+)$/);
  if (m) env[m[1]] = m[2];
}
const cfg = {
  key: env.SMOKE_API_KEY || process.env.SMOKE_API_KEY || env.QWEN_API_KEY,
  base: (env.SMOKE_API_BASE || process.env.SMOKE_API_BASE || env.QWEN_BASE_URL || '').replace(/\/+$/, ''),
  model: env.SMOKE_MODEL || process.env.SMOKE_MODEL || 'qwen-plus',
};
const P = require(path.join(ROOT, 'cloudfunctions/graphEngine/src/lib/prompts.js'));
const USAGE = [];

async function chatJSON(system, user) {
  const body = { model: cfg.model, temperature: 0.2, max_tokens: 4000, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
  if (cfg.base.includes('deepseek')) body.thinking = { type: 'disabled' };
  else body.response_format = { type: 'json_object' };
  const resp = await fetch(cfg.base + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key }, body: JSON.stringify(body) });
  if (!resp.ok) throw new Error('HTTP ' + resp.status + ': ' + (await resp.text()).slice(0, 200));
  const data = await resp.json();
  if (data.usage) USAGE.push({ in: data.usage.prompt_tokens || 0, out: data.usage.completion_tokens || 0 });
  const c = String((data.choices && data.choices[0] && data.choices[0].message.content) || '');
  const s = c.indexOf('{'), e = c.lastIndexOf('}');
  if (s < 0 || e <= s) throw new Error('无 JSON: ' + c.slice(0, 120));
  return JSON.parse(c.slice(s, e + 1));
}

// ---------- 知识区目录（编号化） ----------
const dump = JSON.parse(fs.readFileSync(path.join(ROOT, 'output/graph-partition/knowledge-catalog.json'), 'utf8'));
const CATALOG = (dump.items || []).map((x, i) => ({ no: i + 1, name: x.name, source: x.source }));
const NAME2NO = new Map(CATALOG.map((c) => [c.name, c.no]));

// —— 相似度：逐行照抄 cloudfunctions/graphEngine/src/lib/knowledgeMatch.js:36-48（纯函数） ——
function simName(a, b) {
  a = String(a || '').trim(); b = String(b || '').trim();
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) { const sh = Math.min(a.length, b.length), lo = Math.max(a.length, b.length); return Math.min(1, 0.6 + 0.4 * (sh / lo)); }
  const sa = new Set(a), sb = new Set(b); let inter = 0;
  for (const ch of sa) if (sb.has(ch)) inter++;
  return (2 * inter) / (sa.size + sb.size);
}
// —— 【代码】映射裁判：把自由命名映射到目录编号（≥0.8 才认，同线上门槛） ——
function mapToCatalog(names) {
  return names.map((n) => {
    const nm = String(n || '').trim();
    if (NAME2NO.has(nm)) return { input: nm, no: NAME2NO.get(nm), name: nm, how: 'exact', score: 1 };
    let best = null, bs = 0;
    for (const c of CATALOG) { const sc = simName(nm, c.name); if (sc > bs) { bs = sc; best = c; } }
    return bs >= 0.8 ? { input: nm, no: best.no, name: best.name, how: 'fuzzy', score: Number(bs.toFixed(3)) } : { input: nm, no: null, name: null, how: 'miss', score: Number(bs.toFixed(3)) };
  });
}

const SYSTEM_A = '你是知识点提议者。看题目与学生作答痕迹，列出**本题实际调用到的知识点**（宁多勿漏，最多 6 个）。用教材术语命名，允许暂时与规范名不完全一致。只输出 JSON。';
const SYSTEM_B = '你是知识点校验者。给你题目、候选知识点（每个附教材原文），逐条判断**这道题是否真的考到了该知识点**。你**只能投 keep 或 reject，禁止新增或改写名字**。只输出 JSON。';

async function agentA(q, trace) {
  const user = ['【题目】' + q, '【学生作答痕迹】' + String(trace || '').slice(0, 1200), '只输出 JSON：{"points":[{"name":"知识点教材术语","why":"一句话依据"}]}'].join('\n\n');
  return chatJSON(SYSTEM_A, user);
}
async function agentB(q, trace, cands) {
  const list = cands.map((c, i) => (i + 1) + '. ' + (c.name || c.input) + ' ｜教材原文：' + String((c.source || '')).slice(0, 180)).join('\n');
  const user = ['【题目】' + q, '【学生作答痕迹】' + String(trace || '').slice(0, 800), '【候选知识点（只能投票，不许改名/新增）】', list,
    '只输出 JSON：{"votes":[{"no":1,"keep":true,"reason":"一句话"}]}'].join('\n\n');
  return chatJSON(SYSTEM_B, user);
}

(async () => {
  // 语料：线上真题（与图谱覆盖对齐）
  let cases;
  if (arg('source', 'db') === 'db') {
    const qs = JSON.parse(fs.readFileSync(path.join(ROOT, 'output/shadow-判定/questions-dump.json'), 'utf8'))
      .filter((q) => q.reviewed === true && String(q.traceReport || '').trim());
    cases = qs.map((q) => ({ id: q._id, q: q.questionText || '', trace: q.traceReport || '', hist: q.knowledgeNodeName || '' }));
  } else {
    const tr = JSON.parse(fs.readFileSync(path.join(ROOT, 'output/golden/traces/traces-v1.json'), 'utf8')).traces.filter((t) => !t.quality);
    cases = tr.map((t) => ({ id: t.id + '__' + t.role, q: t.question || '', trace: t.traceText || '', hist: '' }));
  }
  if (IDS) cases = cases.filter((c) => IDS.includes(c.id));
  cases = cases.slice(0, LIMIT);

  const runs = [];
  for (const c of cases) {
    console.log('\n================ 题目 ' + c.id + ' ================');
    console.log('历史落库知识点: ' + (c.hist || '(无)'));
    // 阶段 1：A 提议
    const a = await agentA(c.q, c.trace);
    const names = (a.points || []).map((p) => p.name).filter(Boolean);
    console.log('① Agent A 提议(' + names.length + '): ' + names.join('、'));
    // 阶段 2：代码映射（裁判）
    const mapped = mapToCatalog(names);
    for (const m of mapped) console.log('   [代码映射] ' + m.input + ' → ' + (m.no ? ('#' + m.no + ' ' + m.name + '（' + m.how + ' ' + m.score + '）') : '不在图谱（最相似 ' + m.score + '）'));
    // 阶段 3：B 校验（只投 keep/reject）
    const keepCands = mapped.filter((m) => m.no).map((m) => { const c = CATALOG.find((x) => x.no === m.no); return Object.assign({}, m, { source: c ? c.source : '' }); });
    let votes = [];
    if (keepCands.length) {

      const b = await agentB(c.q, c.trace, keepCands);
      votes = (b.votes || []);
      const byNo = new Map(votes.map((v) => [Number(v.no), v]));
      for (let i = 0; i < keepCands.length; i++) {
        const v = byNo.get(i + 1);
        console.log('   [Agent B 投票] #' + keepCands[i].no + ' ' + keepCands[i].name + ' → ' + (v ? (v.keep ? 'keep' : 'reject') + '（' + String(v.reason || '').slice(0, 40) + '）' : '(未投)'));
      }
    }
    // 阶段 4：代码收口
    const kept = keepCands.filter((m, i) => { const v = votes.find((x) => Number(x.no) === i + 1); return v ? v.keep === true : true; });
    const finalNames = Array.from(new Set(kept.map((m) => m.name)));
    const misses = mapped.filter((m) => !m.no);
    console.log('② 代码收口 → 最终知识点(' + finalNames.length + '): ' + (finalNames.join('、') || '(空)'));
    // 阶段 5：C 裁决（仅当全被剔除 或 有未命中）
    let verdict = null;
    if ((!finalNames.length && keepCands.length) || misses.length) {
      console.log('③ 触发 Agent C 裁决（' + ((!finalNames.length && keepCands.length) ? '全部被剔除' : '有候选不在图谱') + '）—— 本最小版先只标记，不调用（省一次调用）');
      verdict = { needAdjudication: true, reason: (!finalNames.length && keepCands.length) ? 'all-rejected' : 'has-miss' };
    }
    runs.push({ id: c.id, hist: c.hist, proposed: names, mapped, votes, final: finalNames, verdict });
  }
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, 'run-' + Date.now() + '.json');
  fs.writeFileSync(file, JSON.stringify({ meta: { ts: new Date().toISOString(), model: cfg.model, tokens: USAGE }, runs }, null, 1));
  console.log('\n调用 ' + USAGE.length + ' 次｜in ' + USAGE.reduce((s, u) => s + u.in, 0) + ' / out ' + USAGE.reduce((s, u) => s + u.out, 0));
  console.log('结果: ' + path.relative(ROOT, file));
})();
