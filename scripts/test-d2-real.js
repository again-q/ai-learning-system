// ============ D2 真实验证：拆考点节点 × 真实图谱 × 真实模型（T1–T8） ============
// 用法：先 .env 填 SMOKE_API_KEY/SMOKE_API_BASE/SMOKE_MODEL（或 DEEPSEEK_*，或回退 QWEN_*）
//       node scripts/test-d2-real.js [--only=T1,T7]
// 说明：调用 graphEngine 的 decomposePointsNode（与单测同一份代码），非复制逻辑。
const fs = require('node:fs');
const path = require('node:path');
const ROOT = __dirname.replace(/\/scripts$/, '');
const { buildChapterIndex } = require(path.join(ROOT, 'cloudfunctions/graphEngine/src/lib/knowledgeGraph'));
const { decomposePointsNode } = require(path.join(ROOT, 'cloudfunctions/graphEngine/src/nodes/decomposePoints'));

// ---------- .env ----------
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+)\s*$/);
  if (m) env[m[1]] = m[2];
}
const API_KEY = env.SMOKE_API_KEY || process.env.SMOKE_API_KEY || env.DEEPSEEK_API_KEY || env.QWEN_API_KEY;
const BASE = (env.SMOKE_API_BASE || process.env.SMOKE_API_BASE || env.DS_BASE_URL || env.QWEN_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
const MODEL = env.SMOKE_MODEL || process.env.SMOKE_MODEL || env.DS_MODEL || 'deepseek-v4-flash';
const IS_ANTHROPIC = /kimi\.com|anthropic/i.test(BASE);
if (!API_KEY) { console.error('缺少模型 key（.env: SMOKE_API_KEY / DEEPSEEK_API_KEY / QWEN_API_KEY）'); process.exit(1); }

// ---------- 真实图谱（knowledge-graph/nodes/*.json，章=path[2]，与 smoke 同源） ----------
const nodes = [];
for (const f of fs.readdirSync(path.join(ROOT, 'knowledge-graph/nodes')).filter((x) => x.endsWith('.json'))) {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'knowledge-graph/nodes', f), 'utf8'));
  const items = Array.isArray(d) ? d : d.nodes || [d];
  for (const n of items) {
    const p = (n.tree && n.tree.path) || n.path || [];
    nodes.push({ name: String((n.basic && n.basic.name) || n.name || '').trim(), chapter: p[2] });
  }
}
const kg = buildChapterIndex(nodes);
console.log(`图谱: ${nodes.length} 条 → ${kg.chapters.length} 章, 候选=${kg.chapters.map((c) => `${c.split(' ')[0]}:${kg.getPointsByChapter(c).length}`).join(' ')}, 模型=${MODEL}`);

// ---------- LLM adapter（openai / anthropic 双协议，返回已解析 JSON） ----------
let totalIn = 0, totalOut = 0, calls = 0;
async function llm({ system, user }) {
  let content;
  if (IS_ANTHROPIC) {
    const resp = await fetch(`${BASE}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}`, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 1500, temperature: 0.2, system, messages: [{ role: 'user', content: user }] }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    const data = await resp.json();
    totalIn += data.usage?.input_tokens || 0; totalOut += data.usage?.output_tokens || 0; calls++;
    content = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  } else {
    const isDeepSeek = /deepseek/i.test(BASE);
    const body = {
      model: MODEL, temperature: 0.2, max_tokens: 8000,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    };
    if (isDeepSeek) body.thinking = { type: 'disabled' }; // 与线上 judgeOne 判定配置一致
    else body.response_format = { type: 'json_object' };
    const resp = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    const data = await resp.json();
    totalIn += data.usage?.prompt_tokens || 0; totalOut += data.usage?.completion_tokens || 0; calls++;
    content = data.choices?.[0]?.message?.content || '';
  }
  const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const s = cleaned.indexOf('{'), e = cleaned.lastIndexOf('}');
  if (s < 0 || e < 0) throw new Error('模型输出无 JSON: ' + cleaned.slice(0, 120));
  return JSON.parse(cleaned.slice(s, e + 1));
}

// ---------- 设计测试集（同 smoke-decompose-points SET） ----------
const SET = {
  T1: { q: '已知集合 A={1,2,3}，B={2,3,4}，求 A∩B。', expect: '单章单考点' },
  T2: { q: '解不等式 x²−5x+6>0，并把解集用区间表示。', expect: '单章多考点' },
  T3: { q: '求函数 f(x)=√(x−1)+1/(x−2) 的定义域。', expect: '跨章' },
  T4: { q: '已知 f(x)=x³−3x，判断 f(x) 的奇偶性并说明理由。', expect: '隐性考点' },
  T5: { q: '若集合 A={x | ax²+2x+1=0} 中恰有一个元素，求实数 a 的值。', expect: '边界陷阱' },
  T6: { q: '默写分数指数幂的运算性质（至少两条），并说明底数 a 的取值范围。', expect: '回忆类' },
  T7: { q: "已知 f(x)=sinx·cosx，求 f'(x) 并判断其单调区间。", expect: '候选外(导数,图谱未覆盖)' },
  T8: { q: '求函数 f(x)=√(x−1)+1/(x−2) 的定义域。', expect: '题侧独立性(=T3)' },
};
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1];
const ids = only ? only.split(',').map((s) => s.trim()) : Object.keys(SET);

(async () => {
  for (const id of ids) {
    const row = { id, expect: SET[id].expect };
    const t0 = Date.now();
    try {
      const out = await decomposePointsNode({ question: SET[id].q, llm, kg });
      row.ms = Date.now() - t0;
      row.ok = out.ok;
      row.chapters = out.chapters;
      row.n = out.pointList.length;
      row.points = out.pointList.map((p) => `${p.name}(dkp=${p.dkp})`).join('、');
      row.other = out.other.length;
      row.otherNames = out.other.map((o) => o.name).join('、');
      row.oss = out.outOfSyllabus;
      row.issues = out.issues.length ? out.issues.join(';') : '';
    } catch (e) {
      row.ms = Date.now() - t0;
      row.error = String(e.message || e).slice(0, 150);
    }
    console.log(`\n===== ${id}（${row.expect}）${row.ms}ms =====`);
    if (row.error) { console.log('  失败:', row.error); continue; }
    console.log(`  章: ${row.chapters.join(' / ')}`);
    console.log(`  候选考点 ${row.n}: ${row.points}`);
    if (row.other) console.log(`  other ${row.other}: ${row.otherNames}`);
    console.log(`  超纲=${row.oss} 问题=${row.issues || '无'}`);
  }
  console.log(`\n[统计] 调用=${calls} input_tok=${totalIn} output_tok=${totalOut}`);
})().catch((e) => { console.error('脚本失败:', e); process.exit(1); });
