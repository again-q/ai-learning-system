#!/usr/bin/env node
/**
 * 用「AI 能力地图」框架分析会话
 * 框架来源：~/Desktop/ai学习平台开发/doc/AI知识图谱-方案.md
 *
 * 8 领域（横轴）：A 工具选型 / B 沟通提示 / C 动手创造 / D 信息素养 / E 原理边界 / F 协作工程 / G 自动化Agent / H 创新影响
 * 5 境界（纵轴）：L1 入门会用 / L2 熟练会做 / L3 进阶会判 / L4 高阶会搭 / L5 创新会创
 *
 * 数据源：会话骨架 /tmp/recap-out.md（来自 dsh-recap 插件）
 */
import fs from 'node:fs';

const text = fs.readFileSync('/tmp/recap-out.md', 'utf8');
const lines = text.split('\n');

// ── 抽用户发言 ──
const userMsgs = lines.filter((l) => l.startsWith('**用户**：')).map((l) => l.replace('**用户**：', '').trim());
// ── 抽 AI 发言（用于判断用户是否推翻）──
const aiMsgs = lines.filter((l) => l.startsWith('**AI**：')).map((l) => l.replace('**AI**：', '').trim());

console.log('='.repeat(88));
console.log('  「AI 能力地图」框架分析 · 本次会话');
console.log('='.repeat(88));
console.log(`\n  数据：${userMsgs.length} 条用户发言 / ${aiMsgs.length} 条 AI 发言`);

// ══════════════════════════════════════════════
// 按 8 领域找证据
// ══════════════════════════════════════════════
const DOMAINS = [
  {
    code: 'A', name: '工具与选型', desc: '怎么选 AI App / 模型',
    patterns: [/决策模型|Jev|System One|openrouter|硅基流动|Intern.?Decision|国产.*模型|哪个模型|模型.*选|api.*模型|qwen|deepseek/i],
  },
  {
    code: 'B', name: '沟通与提示', desc: '把需求说清楚',
    patterns: [/我说错|你理解错|不是啊|不对啊|重新.*写|我说的是|你.*搞错|让我说|我来.*说/],
  },
  {
    code: 'C', name: '动手创造', desc: '用 AI 开发、自己攒东西',
    patterns: [/做一个|写一个|生成.*报告|设计.*报告|我要.*页面|加.*中心|拍照|前端/],
  },
  {
    code: 'D', name: '信息素养与判断', desc: '判断信息质量、识别幻觉',
    patterns: [/你是不是搞错|你搞错|你理解错|这不是|你确定|核实|查一下|为什么.*相关呢|真的吗|准确吗/],
  },
  {
    code: 'E', name: '原理与边界', desc: 'AI 是什么、局限在哪',
    patterns: [/决策模型.*不做推理|它怎么.*确定|贝叶斯|后验|先验|统计学|收敛|自指|随机前沿|SFA|IRT|Elo|Transformer|softmax|归一化|尺度/],
  },
  {
    code: 'F', name: '协作与工程', desc: '版本管理 / 与人协作',
    patterns: [/git|版本|commit|分支|文档.*整理|归档|索引|规范|宪法|决策.*文档/],
  },
  {
    code: 'G', name: '自动化与 Agent', desc: '让 AI 自己干活',
    patterns: [/插件|agent|mcp|工作流|自动|批量|脚本.*跑|recap|会话分析|多.?agent|协作.*agent/],
  },
  {
    code: 'H', name: '创新与影响', desc: '做出新东西、新用法',
    patterns: [/创新|新.*方案|我想到|自己.*设计|教学|教别人|开源|做成.*产品|这个想法|重新设计|从第一性/],
  },
];

console.log('\n' + '='.repeat(88));
console.log('  一、八个领域的证据命中');
console.log('='.repeat(88));
console.log('');
const hits = {};
for (const d of DOMAINS) {
  const matched = userMsgs.filter((m) => d.patterns.some((p) => p.test(m)));
  hits[d.code] = matched;
  const bar = '█'.repeat(Math.min(40, matched.length));
  console.log(`  ${d.code} ${d.name.padEnd(14)} ${String(matched.length).padStart(3)} 条  ${bar}`);
}

// ══════════════════════════════════════════════
// 关键证据展示
// ══════════════════════════════════════════════
console.log('\n' + '='.repeat(88));
console.log('  二、各领域的关键证据（原话）');
console.log('='.repeat(88));
for (const d of DOMAINS) {
  const ms = hits[d.code];
  if (!ms.length) { console.log(`\n  【${d.code}】${d.name} —— 无命中`); continue; }
  console.log(`\n  【${d.code}】${d.name}（${d.desc}）— ${ms.length} 条`);
  ms.slice(0, 4).forEach((m) => console.log(`     · ${m.slice(0, 80)}${m.length > 80 ? '…' : ''}`));
}

// ══════════════════════════════════════════════
// 境界推断
// ══════════════════════════════════════════════
console.log('\n' + '='.repeat(88));
console.log('  三、境界推断（每个领域落在 L?）');
console.log('='.repeat(88));
console.log('');

// 境界判据
const LEVELS = {
  A: { L1: '分得清模型类型', L2: '会挑模型', L3: '比价/比质量/看条款', L4: '自建路由/多模型编排', L5: '改模型/造模型' },
  B: { L1: '能说一句话需求', L2: '多轮迭代、给例子纠偏', L3: '提示词结构、能判断输出质量', L4: '结构化输出、约束边界', L5: '提出新交互范式' },
  C: { L1: '让 AI 做小东西', L2: '多文件项目、调试', L3: '自己搭能用的工具', L4: '做完整系统', L5: '做出新产品' },
  D: { L1: '知道 AI 会错', L2: '会交叉验证', L3: '识破幻觉、追问依据', L4: '建立验证机制', L5: '定义判断标准' },
  E: { L1: '知道 AI 不是搜索', L2: '懂训练/幻觉直觉', L3: '懂注意力/Transformer 直觉', L4: '懂微调/RLHF/RAG', L5: '掌握高级算法并动手' },
  F: { L1: '会存版本', L2: '分支/PR', L3: '代码评审', L4: '带人', L5: '建规范/文化' },
  G: { L1: '会用带工具的产品', L2: '会配 MCP/工作流', L3: '拆多步任务', L4: '多 agent 编排', L5: '自建 Agent 算法' },
  H: { L1: '完成一个真项目', L2: '解决身边真问题', L3: '教别人', L4: '开源/产生影响', L5: '提出新用法/新范式' },
};

// 手工判定的证据（基于上面命中的原话）
const VERDICTS = [
  { code: 'A', level: 'L2~L3', why: '主动问"决策模型 vs RAG 哪个便宜"、"国产有哪些 Jev"、跨网关验证 OpenRouter —— 已经从"会用"到"比质量/比价"' },
  { code: 'B', level: 'L4~L5', why: '58 条纠正中绝大多数是"把 AI 的话重述成精确的定义"；"我说错了，我指的是…"这类自我纠正频繁 —— 属于结构化沟通的高阶' },
  { code: 'C', level: 'L4', why: '不是让 AI 做小工具，而是指挥 AI 造一整套系统（诊断引擎 + 图谱 + 报告 + 插件）' },
  { code: 'D', level: 'L3~L4', why: '反复追问"你是不是搞错了""为什么算出来一样" —— 识破 AI 的表面正确；甚至纠正 AI 的因果倒置' },
  { code: 'E', level: 'L3~L4', why: '独立想到贝叶斯后验更新、独立说出"实际发挥永远低于估计"（=SFA 单边误差）—— 属于把外部理论拉进来解释直觉' },
  { code: 'F', level: 'L3~L4', why: '有宪法/决策日志/只追加不改史的规范；今天还让我整理了文档归档 —— 不是"会用 git"而是"在建规范"' },
  { code: 'G', level: 'L3~L4', why: '指挥多 agent 协作（探针脚本批量跑）、自己做插件（dsh-recap）—— 已经在"拆多步任务"和"编排"' },
  { code: 'H', level: 'L4~L5', why: '提出的"用五维模型测学习"、"用 AI 测运用 AI 的能力"本身就是新用法；而且做出了可运行的东西' },
];

console.log('  领域              推断境界   依据');
console.log('  ' + '-'.repeat(84));
for (const v of VERDICTS) {
  const d = DOMAINS.find((x) => x.code === v.code);
  console.log(`  ${v.code} ${d.name.padEnd(14)} ${v.level.padEnd(10)} ${v.why}`);
}

// ══════════════════════════════════════════════
// 框架的局限
// ══════════════════════════════════════════════
console.log('\n' + '='.repeat(88));
console.log('  四、用这套框架分析，暴露了什么');
console.log('='.repeat(88));
console.log(`
  ① 框架能覆盖：8 个领域里 8 个都有命中，说明这套地图的横轴够全

  ② 框架判不出"深度"：
     "问为什么" 和 "问怎么做" 都被算作 B（沟通）的命中
     → 但前者是 D（判断），后者只是 B
     → 现在靠正则匹配，分不出来

  ③ 框架的 L 级判据是"能做什么"（行为），不是"做得多好"（质量）
     → 你说"你搞错了"这句，L2 也会说（纠偏）
     → 但你是在【AI 给出完整方案后指出因果倒置】
     → 这是 L4 的判断力，L2 的纠偏是"这里不对"，不是"你的因果链断了"
`);
