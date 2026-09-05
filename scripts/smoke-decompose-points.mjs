#!/usr/bin/env node
// 冒烟执行：拆考点节点（本地可行性冒烟）
// 用法：node scripts/smoke-decompose-points.mjs [--only=T1] [--rounds=1]
// 环境：本地 .env（QWEN_API_KEY/QWEN_BASE_URL）+ knowledge-graph/nodes/*.json
// 说明：LangGraph 未部署，模型步用 Qwen 文本顶替（只验流程/契约）；候选检索真实执行。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'output/smoke-拆考点');
const RAW = path.join(OUT, 'raw');

// ---------- 配置 ----------
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+)\s*$/);
  if (m) env[m[1]] = m[2];
}
// 模型渠道：SMOKE_API_KEY / SMOKE_API_BASE / SMOKE_MODEL（可写进 .env 或 export）
const API_KEY = env.SMOKE_API_KEY || process.env.SMOKE_API_KEY || env.QWEN_API_KEY;
const BASE = (env.SMOKE_API_BASE || process.env.SMOKE_API_BASE || env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, '');
const MODEL = env.SMOKE_MODEL || process.env.SMOKE_MODEL || 'qwen-plus';
const IS_ANTHROPIC = /kimi\.com|anthropic/i.test(BASE); // kimi coding 等 anthropic 协议端点

if (!API_KEY) { console.error('缺少 QWEN_API_KEY（.env）'); process.exit(1); }

// ---------- 图谱与候选接口（真实执行，替代云库） ----------
const nodes = [];
for (const f of fs.readdirSync(path.join(ROOT, 'knowledge-graph/nodes')).filter(x => x.endsWith('.json'))) {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'knowledge-graph/nodes', f), 'utf8'));
  const items = Array.isArray(d) ? d : (d.nodes || [d]);
  for (const n of items) {
    const p = (n.tree && n.tree.path) || n.path || [];
    if (Array.isArray(p) && p.length >= 3) {
      nodes.push({ name: String((n.basic && n.basic.name) || n.name || '').trim(), chapter: p[2] });
    }
  }
}
const CHAPTERS = [...new Set(nodes.map(n => n.chapter))].sort();
// 候选接口：给定单元，返回该单元知识点名清单（确定性，章=path[2]）
function getPointsByChapter(ch) {
  return [...new Set(nodes.filter(n => n.chapter === ch).map(n => n.name).filter(Boolean))];
}
const MAX_CAND = Math.max(...CHAPTERS.map(getPointsByChapter).map(a => a.length));

// ---------- 模型调用（openai 兼容 / anthropic 双协议） ----------
const USAGE = []; // 每次调用 usage 累计（成本实测）
async function chatJSON(system, user) {
  let content;
  if (IS_ANTHROPIC) {
    const resp = await fetch(`${BASE}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL, max_tokens: 1500, temperature: 0.2,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    const data = await resp.json();
    if (data.usage) USAGE.push({ in: data.usage.input_tokens || 0, out: data.usage.output_tokens || 0 });
    content = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  } else {
    // 对齐线上 judgeOne 判定配置（决策 023：thinking disabled + 低温；无 json_object，靠解析容错）
    const isDeepSeek = BASE.includes('deepseek');
    const body = {
      model: MODEL, temperature: 0.2,
      max_tokens: (env.SMOKE_THINKING || process.env.SMOKE_THINKING) === 'enabled' ? 32000 : 8000,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    };
    if (isDeepSeek) {
      body.thinking = { type: (env.SMOKE_THINKING || process.env.SMOKE_THINKING || 'disabled') };
      if (body.thinking.type === 'enabled' && (env.SMOKE_EFFORT || process.env.SMOKE_EFFORT)) {
        body.reasoning_effort = env.SMOKE_EFFORT || process.env.SMOKE_EFFORT;
      }
    } else body.response_format = { type: 'json_object' };
    const resp = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    const data = await resp.json();
    if (data.usage) USAGE.push({
      in: data.usage.prompt_tokens || 0,
      out: data.usage.completion_tokens || 0,
      cached: data.usage.prompt_tokens_details?.cached_tokens || 0,
    });
    content = data.choices?.[0]?.message?.content || '';
  }
  // 容错：剥掉围栏再解析
  const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const start = cleaned.indexOf('{'), end = cleaned.lastIndexOf('}');
  return JSON.parse(cleaned.slice(start, end + 1));
}

// ---------- 节点内部三步 ----------
async function decompose(question) {
  const step1sys = `你是高中数学题目分析器。判断题目涉及必修第一册的哪些章。
可选的章（只能从这些里选，可多选，宁多勿漏；拿不准的章也列上）：
${CHAPTERS.join('\n')}
只输出 JSON：{"chapters":["章名",...]}`;
  const step1 = await chatJSON(step1sys, `题目：${question}`);
  const chapters = (step1.chapters || []).filter(c => CHAPTERS.includes(c));
  if (!chapters.length) {
    return { step1, step2: null, step3: null, error: '步①未识别出有效章' };
  }
  // 步②：逐单元取候选（真实检索）
  const cands = chapters.map(ch => ({ ch, list: getPointsByChapter(ch) }));
  // 步③：逐单元勾选（一次只呈现当前单元，编号本单元内）
  const picks = [];
  for (const { ch, list } of cands) {
    if (!list.length) continue;
    const numbered = list.map((n, i) => `  ${i + 1}. ${n}`).join('\n');
    const step3sys = `任务：拆出本题【标准考察】的完整考点——即按出题意图和常规解法，要解这道题必须用到的知识点。拆解独立于任何学生（不因学生水平改变）。
下面只给出【一个单元】的知识点候选清单（编号 1~${list.length}）：
· 候选中的点：本题标准考察用得到 → 勾编号并给 dkp（0~1 考察难度，纯难度无比重）；
· 候选里没有、但本题标准考察确实需要的点（如超出本图谱的知识）→ 必须填 other：每个 other 必须给 name（满足五要素命名：定义/表示/性质/操作/关系）+ elementType + reason（它是什么知识、为什么本题标准解法需要它、为何不在候选里）。缺一不可；
· 禁止为了凑数勾选与本题核心考察无关的候选点；也禁止用候选点掩盖候选外的核心考察。
只输出 JSON：{"pointIds":[编号...],"dkps":{"编号":0~1},"other":[{"name":"","elementType":"定义|表示|性质|操作|关系","reason":""}],"outOfSyllabus":false}`;
    const step3 = await chatJSON(step3sys, `题目：${question}\n\n【当前单元：${ch}】\n${numbered}`);
    picks.push({ ch, numbered, step3 });
  }
  return { step1, step2: cands.map(c => ({ ch: c.ch, count: c.list.length })), step3: picks };
}

// ---------- 校验 ----------
function verify(result) {
  const issues = [];
  const got = [];
  let otherOk = true;
  for (const p of result.step3 || []) {
    const list = p.numbered ? [] : [];
    const names = p.numbered.split('\n').map(l => l.replace(/^\s*\d+\.\s*/, '').trim()).filter(Boolean);
    const s3 = p.step3 || {};
    const map = {}; names.forEach((n, i) => { map[i + 1] = n; });
    for (const id of s3.pointIds || []) {
      if (!map[id]) { issues.push(`[${p.ch}] pointId ${id} 越界`); continue; }
      const nm = map[id];
      if (!names.includes(nm)) issues.push(`[${p.ch}] 编号${id}→${nm} 不在候选`);
      const dkp = s3.dkps?.[String(id)];
      got.push({ name: nm, chapter: p.ch, dkp: dkp != null ? Number(dkp) : null });
    }
    for (const o of s3.other || []) {
      const fiveOk = ['定义', '表示', '性质', '操作', '关系'].includes(o.elementType);
      if (!o.name || !fiveOk || !(o.reason || '').trim()) { otherOk = false; issues.push(`[${p.ch}] other 双门槛不满足`); }
    }
  }
  return { got, issues, otherOk };
}

// ---------- 测试集 ----------
const SET = {
  T1: { q: '已知集合 A={1,2,3}，B={2,3,4}，求 A∩B。', expect: '单章单考点' },
  T2: { q: '解不等式 x²−5x+6>0，并把解集用区间表示。', expect: '单章多考点' },
  T3: { q: '求函数 f(x)=√(x−1)+1/(x−2) 的定义域。', expect: '跨章' },
  T4: { q: '已知 f(x)=x³−3x，判断 f(x) 的奇偶性并说明理由。', expect: '隐性考点' },
  T5: { q: '若集合 A={x | ax²+2x+1=0} 中恰有一个元素，求实数 a 的值。', expect: '边界陷阱' },
  T6: { q: '默写分数指数幂的运算性质（至少两条），并说明底数 a 的取值范围。', expect: '回忆类' },
  T7: { q: `已知 f(x)=sinx·cosx，求 f'(x) 并判断其单调区间。`, expect: '候选外(导数,图谱未覆盖)' },
  T8: { q: '求函数 f(x)=√(x−1)+1/(x−2) 的定义域。', expect: '题侧独立性(=T3)' },
};

const argOnlyRaw = process.argv.find(a => a.startsWith('--only='))?.split('=')[1];
const argOnly = argOnlyRaw ? argOnlyRaw.split(',').map(s => s.trim()).filter(Boolean) : null;
const argRounds = Number(process.argv.find(a => a.startsWith('--rounds='))?.split('=')[1] || 1);

fs.mkdirSync(RAW, { recursive: true });
console.log(`章数=${CHAPTERS.length} 每章候选=${CHAPTERS.map(c => `${c}:${getPointsByChapter(c).length}`).join(' ')} 最大候选=${MAX_CAND}`);
console.log(`模型=${MODEL} 题集=${argOnly || '全部'} 轮数=${argRounds}`);

const report = { meta: { model: MODEL, chapters: CHAPTERS, maxCand: MAX_CAND, ts: new Date().toISOString() }, rows: [] };
const ids = argOnly && argOnly.length ? argOnly : Object.keys(SET);

for (const id of ids) {
  const rounds = id === 'T2' ? Math.max(argRounds, 3) : argRounds; // T2 至少 3 轮做稳定性
  for (let r = 1; r <= rounds; r++) {
    const row = { id, round: r, expect: SET[id].expect };
    try {
      const res = await decompose(SET[id].q);
      row.chapters = res.step1.chapters;
      row.step2 = res.step2;
      const v = verify(res);
      row.got = v.got;
      row.issues = v.issues;
      row.otherOk = v.otherOk;
      if (id === 'T7') {
        const steps3 = (res.step3 || []).map(p => p.step3);
        const hasOther = steps3.some(s => (s.other || []).length > 0);
        const isBeyond = steps3.some(s => s.outOfSyllabus === true);
        row.C6 = hasOther || isBeyond ? 'pass(报出候选外/超纲)' : 'FAIL(硬勾未报其他)';
      }
      fs.writeFileSync(path.join(RAW, `${id}_r${r}.json`), JSON.stringify(res, null, 2), 'utf8');
      const ok = !v.issues.length;
      row.C1 = true; row.C2 = ok && !v.issues.some(i => i.includes('候选'));
      console.log(`${id}#r${r} 章=[${(row.chapters || []).join(',')}] 考点=${v.got.length} C2=${row.C2} 问题=${v.issues.length ? v.issues.join(';') : '无'}`);
    } catch (e) {
      row.error = String(e.message || e).slice(0, 200);
      console.log(`${id}#r${r} 失败: ${row.error}`);
    }
    report.rows.push(row);
  }
}
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(`\n报告: ${path.join(OUT, 'report.json')}`);
// 成本实测（flash 谷时价 USD/M：input miss 0.22 / hit 0.007 / output 0.66；汇率按 7.2）
const t = USAGE.reduce((a, u) => ({ in: a.in + (u.in || 0), out: a.out + (u.out || 0), cached: a.cached + (u.cached || 0) }), { in: 0, out: 0, cached: 0 });
const cny = ((t.in - t.cached) / 1e6 * 0.22 + t.cached / 1e6 * 0.007 + t.out / 1e6 * 0.66) * 7.2;
console.log(`token 合计: input=${t.in} (cache_hit=${t.cached}) output=${t.out}  估算成本≈¥${cny.toFixed(4)} (${USAGE.length} 次调用, flash 谷时价)`);
