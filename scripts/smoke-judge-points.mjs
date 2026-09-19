#!/usr/bin/env node
// 冒烟执行：环节判定节点（D3 · K 第二节点）—— SOP 第②步
// 用法：node scripts/smoke-judge-points.mjs [--only=T1,T2] [--rounds=1] [--with-d2]
// 环境：本地 .env（QWEN_API_KEY / QWEN_BASE_URL 或 SMOKE_*）
// 说明：默认用夹具点清单（隔离 D3 本身）；--with-d2 时先跑 D2 拆考点拿真实点清单。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import judgePointsMod from '../cloudfunctions/graphEngine/src/nodes/judgePoints.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'output/smoke-环节判定');
const RAW = path.join(OUT, 'raw');

// ---------- 配置 ----------
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+)\s*$/);
  if (m) env[m[1]] = m[2];
}
const API_KEY = env.SMOKE_API_KEY || process.env.SMOKE_API_KEY || env.QWEN_API_KEY;
const BASE = (env.SMOKE_API_BASE || process.env.SMOKE_API_BASE || env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, '');
const MODEL = env.SMOKE_MODEL || process.env.SMOKE_MODEL || 'qwen-plus';
const IS_ANTHROPIC = /kimi\.com|anthropic/i.test(BASE);
if (!API_KEY) { console.error('缺少 QWEN_API_KEY（.env）'); process.exit(1); }

// ---------- 模型调用（与 D2 冒烟同款：对齐线上判定配置 disabled + temp 0.2） ----------
const USAGE = [];
let LLM_CALLS = 0;
async function chatJSON(system, user) {
  LLM_CALLS++;
  let content;
  if (IS_ANTHROPIC) {
    const resp = await fetch(BASE + '/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 4000, temperature: 0.2, system, messages: [{ role: 'user', content: user }] }),
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status + ': ' + (await resp.text()).slice(0, 300));
    const data = await resp.json();
    if (data.usage) USAGE.push({ in: data.usage.input_tokens || 0, out: data.usage.output_tokens || 0 });
    content = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  } else {
    const body = { model: MODEL, temperature: 0.2, max_tokens: 4000,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
    if (BASE.includes('deepseek')) body.thinking = { type: 'disabled' };
    else body.response_format = { type: 'json_object' };
    const resp = await fetch(BASE + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + API_KEY },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status + ': ' + (await resp.text()).slice(0, 300));
    const data = await resp.json();
    if (data.usage) USAGE.push({ in: data.usage.prompt_tokens || 0, out: data.usage.completion_tokens || 0, cached: data.usage.prompt_tokens_details?.cached_tokens || 0 });
    content = data.choices?.[0]?.message?.content || '';
  }
  const cleaned = String(content).replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const s = cleaned.indexOf('{'), e = cleaned.lastIndexOf('}');
  if (s < 0 || e <= s) throw new Error('模型未返回 JSON: ' + cleaned.slice(0, 160));
  return JSON.parse(cleaned.slice(s, e + 1));
}

// ---------- 节点实现（正式版，D3 落地）----------
// 冒烟直接调用 src/nodes/judgePoints.js（避免内联原型与正式实现两处漂移）；纯函数在 src/lib/pkp.js。
const { judgePointsNode, buildJudgeSystem } = judgePointsMod;

// ---------- 测试集（T1–T5；痕迹是构造的学生作答文本） ----------
const P_SET = [
  { name: '一元二次不等式', chapter: '第二章 一元二次函数、方程和不等式' },
  { name: '因式分解', chapter: '第二章 一元二次函数、方程和不等式' },
  { name: '交集与并集', chapter: '第一章 集合与常用逻辑用语' },
  { name: '子集与真子集', chapter: '第一章 集合与常用逻辑用语' },
];
const Q1 = '解不等式 x²−5x+6>0，并把解集用区间表示。';
const T1 = ['求 x²−5x+6>0。', '', '解：因式分解得 (x−2)(x−3)>0，', '所以 x<2 或 x>3，', '解集为 (−∞,2)∪(3,+∞)。'];
const T2 = ['求 x²−5x+6>0。', '', '解：(x−2)(x−3)>0，', '所以 2<x<3，', '解集为 (2,3)。'];
const T3 = [];
const T4 = ['（选填题）答案是 D。'];
const T5 = ['求 x²−5x+6>0。', '', '解：画出 y=x²−5x+6 的抛物线，开口向上，与 x 轴交于 2 和 3，', '看图得 x<2 或 x>3，解集 (−∞,2)∪(3,+∞)。'];

const CASES = [
  { id: 'T1', title: '解答做对（过程完整）', q: Q1, trace: T1.join('\n'), expect: '两章点大多 judged；因式分解 judged=1' },
  { id: 'T2', title: '解答做错（解集方向错）', q: Q1, trace: T2.join('\n'), expect: '因式分解 judged（用上）、一元二次不等式 judged 但 0（用错）' },
  { id: 'T3', title: '整题空白（断言短路）', q: Q1, trace: T3.join('\n'), expect: 'LLM 调用=0；全 blank；derived.blank=true', blank: true },
  { id: 'T4', title: '选填（无过程）', q: '已知集合 A={1,2,3}，B={2,3,4}，则 A∩B=（ ）A.{1} B.{2,3} C.{1,2,3} D.{2,3,4}', trace: T4.join('\n'), expect: '无过程 → 交集并集可能 noEvidence 或 judged(0.5)，但不许编造' },
  { id: 'T5', title: '替代路径（画图未写因式分解）', q: Q1, trace: T5.join('\n'), expect: '决策 038：因式分解 应 noEvidence（心算未落笔）；一元二次不等式 judged=1' },
];

const argOnly = (process.argv.find(a => a.startsWith('--only=')) || '').split('=')[1];
const ids = argOnly ? argOnly.split(',').map(s => s.trim()).filter(Boolean) : CASES.map(c => c.id);
const rounds = Number((process.argv.find(a => a.startsWith('--rounds=')) || '').split('=')[1] || 1);

fs.mkdirSync(RAW, { recursive: true });
console.log('模型=' + MODEL + ' 题集=' + ids.join(',') + ' 轮数=' + rounds);

const report = { meta: { node: 'D3 环节判定', model: MODEL, points: P_SET.map(p => p.name), ts: new Date().toISOString() }, rows: [] };

for (const c of CASES.filter(x => ids.includes(x.id))) {
  for (let r = 1; r <= rounds; r++) {
    const row = { id: c.id, title: c.title, round: r, expect: c.expect };
    try {
      const res = await judgePointsNode({
        question: c.q,
        points: P_SET,
        trace: c.trace,
        derived: { blank: c.blank === true ? true : undefined, learnedChapters: null },
        llm: async ({ system, user }) => chatJSON(system, user),
      });
      row.derivedBlank = res.blank;
      row.llmCalls = res.llmCalls;
      row.got = res.points.map(p => ({ name: p.name, state: p.state, P_kp: p.P_kp, basis: String(p.basis || '').slice(0, 60), alignedFrom: p.alignedFrom, isAhead: p.isAhead, auto: p.auto }));
      row.judged = res.points.filter(p => p.state === 'judged').length;
      row.noEvidence = res.points.filter(p => p.state === 'noEvidence').length;
      row.eta = res.eta; row.note = res.note; row.issues = res.issues;
      row.C1_blankShortCircuit = res.blank ? (res.llmCalls === 0 && res.points.every(p => p.state === 'blank')) : 'n/a';
      row.C2_clamp = res.points.filter(p => p.state === 'judged').every(p => [0, 0.5, 1].includes(p.P_kp));
      row.C3_noInvent = !res.issues.some(i => i.indexOf('编造') >= 0 || i.indexOf('越界') >= 0);
      row.C4_noMissing = !res.issues.some(i => i.indexOf('漏点') >= 0);
      if (c.id === 'T2') { const it = res.points.find(p => p.name === '一元二次不等式'); row.C5_wrong = it ? (it.state === 'judged' && it.P_kp === 0) : 'missing'; }
      if (c.id === 'T5') { const it = res.points.find(p => p.name === '因式分解'); row.C6_altPath = it ? (it.state === 'noEvidence') : 'missing'; }
      fs.writeFileSync(path.join(RAW, c.id + '_r' + r + '.json'), JSON.stringify({ expect: c.expect, trace: c.trace, node: res }, null, 2), 'utf8');
      console.log(c.id + '#r' + r + ' eta=' + row.eta + ' judged=' + row.judged + ' noEvidence=' + row.noEvidence + ' 问题=' + (res.issues.length ? res.issues.join('; ') : '无'));
    } catch (e) {
      row.error = String(e.message || e).slice(0, 200);
      console.log(c.id + '#r' + r + ' 失败: ' + row.error);
    }
    report.rows.push(row);
  }
}
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log('\n报告: ' + path.join(OUT, 'report.json'));
const t = USAGE.reduce((a, u) => ({ in: a.in + (u.in || 0), out: a.out + (u.out || 0), cached: a.cached + (u.cached || 0) }), { in: 0, out: 0, cached: 0 });
const cny = ((t.in - t.cached) / 1e6 * 0.22 + t.cached / 1e6 * 0.007 + t.out / 1e6 * 0.66) * 7.2;
console.log('token 合计: input=' + t.in + ' (cache_hit=' + t.cached + ') output=' + t.out + '  估算成本≈¥' + cny.toFixed(4) + ' (' + USAGE.length + ' 次调用)');