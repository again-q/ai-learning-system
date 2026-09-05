#!/usr/bin/env node
// 评测骨架：真题 golden 跑拆考点（disabled），输出供人核的准确率雏形
// 用法：node scripts/eval-golden.mjs [--thinking=enabled] [--effort=low]
// 说明：gold 考点标注为空待人工填；本脚本只跑拆解并落结果，看流程与模型输出形态
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'output/golden/results');
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+)\s*$/);
  if (m) env[m[1]] = m[2];
}
const API_KEY = env.SMOKE_API_KEY || process.env.SMOKE_API_KEY || env.QWEN_API_KEY;
const BASE = (env.SMOKE_API_BASE || process.env.SMOKE_API_BASE || env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, '');
const MODEL = env.SMOKE_MODEL || process.env.SMOKE_MODEL || 'qwen-plus';
const argThinking = process.argv.find(a => a.startsWith('--thinking='))?.split('=')[1] || 'disabled';
const argEffort = process.argv.find(a => a.startsWith('--effort='))?.split('=')[1];
const cfg = { thinking: argThinking, effort: argEffort };

const nodes = [];
for (const f of fs.readdirSync(path.join(ROOT, 'knowledge-graph/nodes')).filter(x => x.endsWith('.json'))) {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'knowledge-graph/nodes', f), 'utf8'));
  const items = Array.isArray(d) ? d : (d.nodes || [d]);
  for (const n of items) {
    const p = (n.tree && n.tree.path) || n.path || [];
    if (Array.isArray(p) && p.length >= 3) nodes.push({ name: String((n.basic && n.basic.name) || n.name || '').trim(), chapter: p[2] });
  }
}
const CHAPTERS = [...new Set(nodes.map(n => n.chapter))].sort();
const pointsOf = ch => [...new Set(nodes.filter(n => n.chapter === ch).map(n => n.name).filter(Boolean))];
const USAGE = [];

async function callLLM(system, user) {
  const body = {
    model: MODEL, temperature: 0.2,
    max_tokens: cfg.thinking === 'enabled' ? 32000 : 8000,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  };
  if (/deepseek/i.test(BASE)) {
    body.thinking = { type: cfg.thinking };
    if (cfg.thinking === 'enabled' && cfg.effort) body.reasoning_effort = cfg.effort;
  } else body.response_format = { type: 'json_object' };
  const resp = await fetch(`${BASE}/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` }, body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const data = await resp.json();
  if (data.usage) USAGE.push({ i: data.usage.prompt_tokens || 0, o: data.usage.completion_tokens || 0, c: data.usage.prompt_tokens_details?.cached_tokens || 0 });
  const txt = (data.choices?.[0]?.message?.content || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const s = txt.indexOf('{'), e = txt.lastIndexOf('}');
  return JSON.parse(txt.slice(s, e + 1));
}

const S1 = `你是高中数学题目分析器。判断题目涉及必修第一册的哪些章（人教 A 版）。
可选章：\n${CHAPTERS.join('\n')}
若题目完全不涉及这些章（如复数、解析几何、立体几何、概率等非必修一内容），chapters 返回空数组。
只输出 JSON：{"chapters":[...]}`;
const S3 = n => `拆出本题【标准考察】的完整考点（出题意图所需，独立于学生）。
【一个单元】候选清单（编号 1~${n}）：
· 候选中有用的点 → pointIds + dkps（0~1 纯难度）；
· 候选没有但标准考察确实需要的点 → other（name 五要素 + elementType + reason，缺一不可）；
· 禁止勾无关候选点掩盖候选外核心考察。
只输出 JSON：{"pointIds":[...],"dkps":{},"other":[],"outOfSyllabus":false}`;
// 候选外专用（chapters 空时的出口）
const S0 = `本题疑似完全不涉及必修第一册内容（识别章为空）。请判断：
· 若确认超出当前图谱范围 → outOfScope=true，并列出本题标准考察涉及的知识领域（domain，如"复数""解析几何"），可选列出你估计的考点名（五要素命名）；
· 若其实涉及 → scopeFix 给出涉及章名。
只输出 JSON：{"outOfScope":bool,"domains":["..."],"scopeFix":[]}`;

async function decompose(question) {
  const s1 = await callLLM(S1, `题目：${question}`);
  const chapters = (s1.chapters || []).filter(c => CHAPTERS.includes(c));
  if (!chapters.length) {
    const s0 = await callLLM(S0, `题目：${question}\n可选的必修一章：${CHAPTERS.join('、')}`);
    return { chapters: [], got: [], others: [], scopeOut: s0 };
  }
  const got = [], others = [];
  for (const ch of chapters) {
    const list = pointsOf(ch);
    if (!list.length) continue;
    const numbered = list.map((nm, i) => `  ${i + 1}. ${nm}`).join('\n');
    const s3 = await callLLM(S3(list.length), `题目：${question}\n\n【当前单元：${ch}】\n${numbered}`);
    for (const id of (s3.pointIds || [])) { const nm = list[id - 1]; if (nm) got.push({ name: nm, chapter: ch, dkp: s3.dkps?.[String(id)] ?? null }); }
    others.push(...(s3.other || []).map(o => ({ ...o, chapter: ch })));
  }
  return { chapters, got, others, scopeOut: null };
}

const golden = JSON.parse(fs.readFileSync(path.join(ROOT, 'output/golden/golden-2025-I.json'), 'utf8'));
fs.mkdirSync(OUT, { recursive: true });
console.log(`评测 golden 2025-I：${golden.length} 题 | 模型=${MODEL} cfg=${JSON.stringify(cfg)}`);
const rows = [];
for (const item of golden) {
  const t0 = Date.now();
  const u0 = USAGE.length;
  try {
    const r = await decompose(item.q);
    rows.push({ id: item.id, type: item.type, seconds: ((Date.now() - t0) / 1000).toFixed(1), chapters: r.chapters, got: r.got, others: r.others, scopeOut: r.scopeOut });
    console.log(`${item.id} ${((Date.now() - t0) / 1000).toFixed(1)}s 章=[${r.chapters}] 考点=${r.got.length} other=${r.others.length}${r.scopeOut ? ` 图谱外=${r.scopeOut.outOfScope} domains=${(r.scopeOut.domains || []).join(',')}` : ''}`);
  } catch (e) {
    rows.push({ id: item.id, error: String(e.message || e).slice(0, 150) });
    console.log(`${item.id} 失败: ${e.message?.slice(0, 100)}`);
  }
  const c = USAGE.slice(u0).reduce((a, u) => a + (u.i - u.c) / 1e6 * 0.22 + u.c / 1e6 * 0.007 + u.o / 1e6 * 0.66, 0) * 7.2;
  console.log(`   成本≈¥${c.toFixed(4)}`);
}
const total = USAGE.reduce((a, u) => a + (u.i - u.c) / 1e6 * 0.22 + u.c / 1e6 * 0.007 + u.o / 1e6 * 0.66, 0) * 7.2;
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ model: MODEL, cfg, rows, totalCost: total }, null, 2), 'utf8');
console.log(`\n完成 ${rows.length} 题，总计≈¥${total.toFixed(4)}，结果: ${path.join(OUT, 'result.json')}`);
