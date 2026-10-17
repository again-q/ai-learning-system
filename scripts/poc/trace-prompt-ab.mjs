#!/usr/bin/env node
// 提示词 A/B 实测：现有 TRACE_CROP_PROMPT（改前） vs 优化版（改后）
// 用真实答题卡裁图，看转录质量差异。不写库、不改线上。
//
// 用法：node scripts/poc/trace-prompt-ab.mjs /tmp/zximg/q17.jpg /tmp/zximg/q19.jpg
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// —— 读 .env ——
function loadEnv() {
  const p = path.join(ROOT, '.env');
  const out = {};
  if (!fs.existsSync(p)) return out;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const env = loadEnv();
const BASE = env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const KEY = env.QWEN_API_KEY;
const MODEL = env.QWEN_VL_MODEL || 'qwen3.7-plus';

// ============ 改前：线上现役 ============
const PROMPT_OLD = `你是数学学习诊断助手的痕迹判读阶段。图中是一道数学题（含学生手写作答）。请精确描述学生手写痕迹：
1) 手写答案/结论：逐字符精确（≥≤><=符号不能错），写在哪个位置（题末括号内/选项旁/过程中）；
2) 涂改、圈画、划线：画在了什么对象上（哪个选项/哪个词/哪步算式），动作是什么（圈选=选择还是叉=排除）；
3) 解题过程：书写到哪一步、有没有中途停顿或换思路；
4) 完全无手写痕迹则写「整题空白未下笔」。
不确定处标(不确定)。只输出痕迹描述，不要解题、不要评价难度。`;

// ============ 改后：优化版 ============
// 优化依据（2026-10-17 实测发现的问题）：
//   1. 旧版只说「精确描述」→ 模型用自然语言概括（"学生讨论了a-1=0的情况"），公式细节丢失
//   2. 旧版不要求分段 → 题目与过程混在一起（下游无法分开用）
//   3. 旧版「不确定处标(不确定)」实测 0 次执行 → 换成可执行的逐式置信度
//   4. 旧版无自检要求 → 加"抄完复核"步骤
const PROMPT_NEW = `你是数学答题卡的逐字转录员。图中是一道数学题（含印刷题干 + 学生手写内容）。
你的唯一任务是**逐字抄录**，不做诊断、不评价对错、不总结。

## 输出格式（严格照此分三段）

### 题目
（抄录印刷体的题干全文。公式用 $...$。题干里的每个符号都要抄到，包括下标、上标、集合符号、不等号。）

### 学生过程
（按书写顺序逐行抄录学生手写内容。**每一行都要抄成一个 LaTeX 式子或原话**，格式：）
行1｜位置：左侧/右侧/题末横线｜内容：$...$
行2｜位置：...｜内容：$...$
（如果学生写的是文字说明，就照抄文字；如果写的是算式，必须抄成 $LaTeX$）

### 痕迹与改动
（涂改、划掉、圈选、箭头、插入符号：写明作用在【哪一行】上、动作是什么。例如「行3 被黑色横线划掉」。）

## 硬性要求
1. **禁止概括**：不许写「学生讨论了a-1=0的情况」「学生尝试分类讨论」这类总结。必须抄出**具体式子**。
2. **符号逐字符精确**：≥ ≤ ≠ < > = ∈ ⊆ ∅ Δ 和分数、指数、分母一个都不能错。
3. **每一行只能给一个最终答案**（重要）：
   - 自检在你自己心里做，**不要把思考、犹豫、反复修改的过程写出来**。
   - 禁止出现「修正识别」「再次修正」「尝试」「推测可能是」这类自我推翻的话。
   - 一行就是一行，写一个你**最终认定**的答案。
4. **拿不准时**：照抄你能看到的部分，并在该行末尾加一个标记，不要给多个候选：
   - 完全看不清 → 该处写 (看不清)
   - 看得到但不确定 → 该处写 (不确定)
   - 被截断 → 该处写 (截断)
   标注是**给下游一个可信度信号**，不是让你列备选答案。
5. 学生完全没有手写内容时，才写「整题空白未下笔」。
6. **只输出三段内容，不要输出任何分析、说明、开场白或结语。**

## 特别注意
- 学生可能把式子写得很潦草，或有大量涂改。**涂改后的最终版本才是有效内容**，但被划掉的旧版本也要抄出来并标明「已划掉」。
- 分式务必看清横线上下各是什么。例如 $\\frac{xy}{x-y}$ 与 $\\frac{1}{1/xy}$ 完全不同，不要混淆。

只输出上述三段，不要任何额外说明。`;

async function call(prompt, imgPath) {
  const buf = fs.readFileSync(imgPath);
  const dataUrl = 'data:image/jpeg;base64,' + buf.toString('base64');
  const t0 = Date.now();
  const r = await fetch(BASE + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      enable_thinking: false,
      messages: [{ role: 'user', content: [
        { type: 'image_url', image_url: { url: dataUrl } },
        { type: 'text', text: prompt },
      ] }],
    }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + JSON.stringify(d).slice(0, 200));
  return {
    text: (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '',
    usage: d.usage || {},
    ms: Date.now() - t0,
  };
}

// 质量打分：看几个关键信号
function score(text) {
  return {
    有分段: /###\s*题目/.test(text) && /###\s*学生过程/.test(text),
    有LaTeX式子: (text.match(/\$[^$]{2,}\$/g) || []).length,
    标注不确定: (text.match(/\(不确定\)|\(看不清\)|\(截断\)|\(自检存疑\)/g) || []).length,
    概括句式: (text.match(/学生(讨论|尝试|进行|分析|考虑)了?/g) || []).length,
    字数: text.length,
  };
}

(async () => {
  const imgs = process.argv.slice(2);
  if (!imgs.length) { console.error('用法: node scripts/poc/trace-prompt-ab.mjs <图片> [...]'); process.exit(1); }
  const outDir = '/tmp/prompt-ab';
  fs.mkdirSync(outDir, { recursive: true });

  for (const img of imgs) {
    const base = path.basename(img, path.extname(img));
    console.log(`\n${'='.repeat(70)}\n图片：${path.basename(img)}\n${'='.repeat(70)}`);
    for (const [tag, prompt] of [['old', PROMPT_OLD], ['new', PROMPT_NEW]]) {
      try {
        const r = await call(prompt, img);
        fs.writeFileSync(path.join(outDir, `${base}.${tag}.md`), r.text, 'utf8');
        const s = score(r.text);
        console.log(`\n----- ${tag === 'old' ? '改前（线上现役）' : '改后（优化版）'} -----`);
        console.log(`耗时 ${(r.ms / 1000).toFixed(1)}s  tokens ${r.usage.prompt_tokens}/${r.usage.completion_tokens}`);
        console.log(`分段:${s.有分段 ? '✅' : '❌'}  LaTeX式子:${s.有LaTeX式子}个  不确定标注:${s.标注不确定}处  概括句式:${s.概括句式}句  字数:${s.字数}`);
        console.log(`→ 全文 /tmp/prompt-ab/${base}.${tag}.md`);
      } catch (e) {
        console.log(`\n----- ${tag} 失败：${e.message}`);
      }
    }
  }
  console.log('\n\n对比文件在 /tmp/prompt-ab/');
})();
