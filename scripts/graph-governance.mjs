#!/usr/bin/env node
// ============ 图谱生产治理 · 多 agent 协作（最小版：分诊员） ============
// 定位：**建库链（图谱生产）**的多 agent 治理，不是运行时链路。
// 判据来源（逐字取自用户既有文档，不另发明）：
//   doc/knowledge-graph/图谱治理审计报告.md §4.2 判定式提问法（type 判定）
//                                          §七  WWH 模型（什么该建/不该建 + 判定口诀）
//                                          §4.1 命名规则 / §4.3 粒度规则
// 原则：
//   ① agent 只出**提案**，不写库（决策：官方图谱保护，修改权在用户）
//   ② 每条提案必须带【判据出处 + 证据片段】——让你 15~30 分钟能逐条批
//   ③ 代码当裁判：值域校验 / 编号合法 / 成环检测，全在代码侧
//   ④ 分诊员只看单个节点（无状态、可并行、便宜）
// 用法：
//   node scripts/graph-governance.mjs --task=triage --limit=10 [--type=method]
// 产出：output/graph-governance/triage-<ts>.json（提案队列）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'output/graph-governance');
const arg = (k, d) => { const hit = process.argv.find((a) => a.startsWith('--' + k + '=')); return hit ? hit.split('=').slice(1).join('=') : d; };
const LIMIT = Number(arg('limit', 10)) || 10;
const TYPE = arg('type', 'method');

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
const USAGE = [];

async function chatJSON(system, user) {
  const body = { model: cfg.model, temperature: 0.2, max_tokens: 1200, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
  if (cfg.base.includes('deepseek')) body.thinking = { type: 'disabled' };
  else body.response_format = { type: 'json_object' };
  const resp = await fetch(cfg.base + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key }, body: JSON.stringify(body) });
  if (!resp.ok) throw new Error('HTTP ' + resp.status + ': ' + (await resp.text()).slice(0, 160));
  const data = await resp.json();
  if (data.usage) USAGE.push({ in: data.usage.prompt_tokens || 0, out: data.usage.completion_tokens || 0 });
  const c = String((data.choices && data.choices[0] && data.choices[0].message.content) || '');
  const s = c.indexOf('{'), e = c.lastIndexOf('}');
  if (s < 0 || e <= s) throw new Error('无 JSON: ' + c.slice(0, 120));
  return JSON.parse(c.slice(s, e + 1));
}

// —— 判据原文（逐字取自 图谱治理审计报告 §4.2 / §七 / §4.1） ——
const RULES = [
  '【type 判定提问法（§4.2）】',
  'definition：能回答「什么是 X」（合格：集合、子集、命题）',
  'property：能回答「X 有什么性质/定理」（合格：确定性、互异性、空集的性质）',
  'notation：符号表示（合格：常用数集、逻辑蕴含符号）',
  'method：能回答「怎么做 X」（合格：列举法、配方法、求交集的方法）',
  'example：典型案例（仅教学价值显著）',
  '判别句/关系辨析（如「属于与包含的区别」）不是独立知识点 → 并入相关节点 source_text',
  '',
  '【WWH 判定（§七）】该内容回答的是「这是什么」（What→建）、「它从哪来」（Why→不建）、「它能干嘛」（How→不建）',
  '建：定义 / 表示 / 性质 / 操作（对知识的运算变换，可独立考核）/ 关系',
  '不建：推导链与推导方法（Why）/ 知识来源（Why）/ 应用实例与建模实例（How，归 A/题型）/ 研究思路与思想 / 教材阅读栏目 / 主知识的应用细节步骤',
  '',
  '【命名（§4.1）】主体精炼名词短语，≤6 字优先；禁止句子、括号注释、引号；说明放 concept.source_text',
].join('\n');

const SYSTEM_TRIAGE = [
  '你是知识图谱的**分诊员**。给你一个已存在的节点（name / type / 教材原文 / 章节），你要判它**是否应该作为知识节点存在**，并给出规范归类。',
  '判据严格用下面这份规则，不要自己发明标准：',
  RULES,
  '',
  '只输出 JSON：{"verdict":"keep|rename|merge|drop","wwh":"definition|notation|property|operation|relation|why|how|other","suggestName":"规范化后的名字（verdict=rename 时给；否则原样）","evidence":"教材原文里支持你判断的片段（20 字内）","rule":"你依据的规则条目（如 §七 How / §4.2 method）","reason":"一句话理由"}',
  'verdict 取值含义：keep=保留为知识节点；rename=该建但名字要规范；merge=与其他节点重复应合并；drop=不该建（Why/How/思想/阅读栏目）',
].join('\n');

(async () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'output/graph-partition/knowledge-catalog.json'), 'utf8'));
  const all = JSON.parse(fs.readFileSync(path.join(ROOT, 'output/graph-partition/method-nodes.json'), 'utf8'));
  if (!['method', 'knowledge'].includes(TYPE)) throw new Error('未知 --type=' + TYPE + '（只允许 method | knowledge）—— 不做静默 fallback');
  const pool = TYPE === 'method' ? all.items : catalog.items;
  const chOf = (x) => String(x.chapter || (x.path || [])[2] || '');
  const picked = pool.filter((x) => /^(第0章|第一章|第二章)/.test(chOf(x))).slice(0, LIMIT);
  // ⚠️ 「空结果」必须当失败处理（2026-09-25 教训：静默 0 命中比报错更危险——它会安静产出空提案队列）
  if (!picked.length) {
    const sample = pool[0] || {};
    throw new Error('分诊选到 0 个节点 → 拒绝生成空提案。诊断：pool=' + pool.length + '，样例字段=[' + Object.keys(sample).join(',') + ']，样例=' + JSON.stringify(sample).slice(0, 200));
  }
  console.log('分诊任务: type=' + TYPE + ' 取前 ' + picked.length + ' 个（限定前两章便于人工核对）');
  const proposals = [];
  let i = 0;
  for (const n of picked) {
    i++;
    const user = ['【节点】' + n.name, '【当前 type】' + (n.type || '(未知)'), '【章节】' + (n.chapter || ''), '【教材原文】' + String(n.source || '(无)').slice(0, 300)].join('\n\n');
    let r;
    try { r = await chatJSON(SYSTEM_TRIAGE, user); } catch (e) { console.log('[' + i + '/' + picked.length + '] ' + n.name + ' → 失败: ' + e.message.slice(0, 60)); continue; }
    // 【代码裁判】值域校验（不合法就拒收，不让脏提案进队列）
    const vOk = ['keep', 'rename', 'merge', 'drop'].includes(String(r.verdict));
    const wOk = ['definition', 'notation', 'property', 'operation', 'relation', 'why', 'how', 'other'].includes(String(r.wwh));
    const row = { name: n.name, curType: n.type || '', verdict: vOk ? r.verdict : 'REJECTED', wwh: wOk ? r.wwh : 'REJECTED', suggestName: r.suggestName || n.name, evidence: r.evidence || '', rule: r.rule || '', reason: r.reason || '' };
    proposals.push(row);
    console.log('[' + i + '/' + picked.length + '] ' + n.name.padEnd(14) + ' → ' + String(row.verdict).padEnd(7) + ' ' + String(row.wwh).padEnd(10) + ' | ' + String(row.rule).slice(0, 16) + ' | ' + String(row.reason).slice(0, 34));
  }
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, 'triage-' + Date.now() + '.json');
  fs.writeFileSync(file, JSON.stringify({ meta: { ts: new Date().toISOString(), model: cfg.model, task: 'triage', type: TYPE, tokens: USAGE }, proposals }, null, 1));
  const tally = proposals.reduce((m, p) => { m[p.verdict] = (m[p.verdict] || 0) + 1; return m; }, {});
  console.log('');
  console.log('提案分布: ' + JSON.stringify(tally));
  console.log('调用 ' + USAGE.length + ' 次｜in ' + USAGE.reduce((s, u) => s + u.in, 0) + ' / out ' + USAGE.reduce((s, u) => s + u.out, 0));
  console.log('提案队列: ' + path.relative(ROOT, file));
})();
