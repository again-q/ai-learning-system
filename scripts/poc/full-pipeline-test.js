#!/usr/bin/env node
/**
 * POC 全链路测试 — 拍照 → Qwen 视觉转录 → DeepSeek 诊断（v5 rubric）
 *
 * 链路：图片 → vision-test（qwen3.7-plus 散文转录）→ judge（deepseek-chat 诊断）
 * 判定标准：决策 020/021（D=L1~L11 档位钳制+档内自由；P 理论§4.4；η 仅解答题；r 无追问=null）
 *
 * 用法:
 *   node scripts/poc/full-pipeline-test.js <图片路径> [图片路径...]
 *   DEEPSEEK_API_KEY=sk-xxx node scripts/poc/full-pipeline-test.js <图片>
 *
 * 依赖: .env 中 QWEN_API_KEY；DeepSeek key 用环境变量 DEEPSEEK_API_KEY 传入
 * 输出: 每张图的 vision 关键行 + 每题诊断参数（D 已钳制回档位区间）
 *
 * ────────────────────────────────────────────────
 * 最后一次全链路实测记录（2026-08-07，图二·4道题随堂演练）
 * ────────────────────────────────────────────────
 * 两次运行（temperature=0.2）：
 *   题1: L1 D=0.150 ✅ 单元内 η=null
 *   题2: L2 D=0.300 ✅ 单元内 η=null
 *   题3: L3 D=0.450 ✅ 单元内 η=0.9
 *   题4: L4 D=0.600 ❌/✅ 单元内/跨单元 η=0.6/0.9 —— isCorrect 两次不一致！
 *
 * 关键发现（决策 018 真实链路复现）：
 *   ① vision 把学生手写 a≥4 读成 a>4（≥ 误读，POC 多次复现，prompt 修不了）
 *   ② 第 1 次转录漏了"a=4 时 x=-2 保留"细节 → DeepSeek 误判"漏 B={-2} 情况" → isCorrect=false
 *   ③ 第 2 次转录细节稍全 → 判 true
 *   结论：全链路无学生确认时，vision 转录误差直接污染 isCorrect——
 *         「报告异议 + 学生确认」（决策 018）是必需品，不是可选项。
 *   ④ D 两次全部钳到档位上沿（0.15/0.30/0.45/0.60）——档内自由取值倾向打高，
 *      推测与 temperature 相关；档位判定本身稳定（L1/L2/L3/L4 两次一致），
 *      档位是主判据，档内 ±0.1 不影响诊断，可接受。
 * ────────────────────────────────────────────────
 */

const fs = require('fs');
const path = require('path');

// ---- 读 .env（Qwen key）----
function loadEnv(file) {
  if (!fs.existsSync(file)) return {};
  const env = {};
  fs.readFileSync(file, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
  return env;
}
const env = loadEnv(path.join(__dirname, '../../.env'));
const QWEN_KEY = process.env.QWEN_API_KEY || env.QWEN_API_KEY;
const DS_KEY = process.env.DEEPSEEK_API_KEY;

if (!QWEN_KEY) { console.error('❌ 未找到 QWEN_API_KEY（.env）。'); process.exit(1); }
if (!DS_KEY) { console.error('❌ 未找到 DEEPSEEK_API_KEY（环境变量）。'); process.exit(1); }

// ---- VLM prompt（决策 017：整体把握散文）----
const VISION_PROMPT = `你是数学学习诊断助手的图像理解阶段。任务：准确转录题目 + 如实描述做题痕迹。不要做诊断判断。

输出 Markdown：
# 题目转录（每题：题号/完整题干含所有条件和选项内容/题目形式）
# 做题痕迹观察（按书写顺序逐条：第N步+位置+痕迹；涂改/草稿/最终答案）
# 输出要求：不确定处标(不确定)；看不清写(看不清)；最终答案逐字符精确（≥≤><=符号不能错）；不臆测`;

// ---- judge rubric（决策 020/021 定稿）----
const RUBRIC = `
【诊断判定标准（决策 020/021 定稿）】
■ D 难度：L1~L11 档位钳制+档内自由。第1步判 Lx 档（例子锚：L1求A∩B/L2求√定义域/L3比log大小/L4△ABC求c(课本套路含分类讨论也算)/L5裂项/L6含参两零点/L7极点极线/L8极值点偏移/L9多高观点/L10竞赛板块/L11IMO）；第2步档内自由打 D 值（勿都取上沿）；代码钳制回区间
■ 题型分类（门禁1）：回忆类=直接套公式；单元内=本单元变形推理分类讨论；跨单元=结合≥2单元
■ P（理论§4.4）：1.0清晰正确/0.5部分正确模糊/0.3错误有思路/0空白
■ η：只对解答题判0.4~1.0（本质解法0.9+）；填空/选择无过程→null
■ r：一律 null（无追问）
■ isCorrect：严格数学判定。注意 vision 转录的 ≥ 可能被读成 >（转录不确定时按数学逻辑核验）
■ 归因：做错才给；做对 null；不编造
`;

// ---- L 档区间 + 钳制 ----
const LR = { L1:[0.01,0.15],L2:[0.15,0.30],L3:[0.30,0.45],L4:[0.45,0.60],L5:[0.60,0.70],L6:[0.70,0.79],L7:[0.79,0.85],L8:[0.85,0.90],L9:[0.90,0.94],L10:[0.94,0.98],L11:[0.98,0.999] };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---- Qwen 视觉转录 ----
async function vision(imagePath) {
  const base64 = fs.readFileSync(imagePath).toString('base64');
  const r = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + QWEN_KEY },
    body: JSON.stringify({ model: 'qwen3.7-plus', messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + base64 } }, { type: 'text', text: VISION_PROMPT }] }], max_tokens: 2500, enable_thinking: false })
  });
  const d = await r.json();
  if (!r.ok) throw new Error('vision HTTP ' + r.status + ': ' + JSON.stringify(d).slice(0, 300));
  return d.choices[0].message.content;
}

// ---- DeepSeek 诊断 ----
async function judge(visionReport) {
  const userMsg = `输入是视觉转录（可能含转录误差）。按 rubric 对每题输出：
{"questions":[{"index":1,"questionCategory":"","level":"L1~L11","D":0~1,"isCorrect":true|false,"correctAnswer":"","P":0|0.3|0.5|1.0,"eta":0.4~1.0|null,"r":null,"errorAttribution":null|"","knowledgePoints":[""]}]}
约束：D 落在 level 区间内；eta 只在解答题；isCorrect 严格数学核验（发现转录可疑处按数学逻辑判定并注明）；只输出 JSON`;
  const r = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + DS_KEY },
    body: JSON.stringify({ model: 'deepseek-chat', temperature: 0.2, messages: [{ role: 'system', content: '你是严谨的数学诊断推理引擎。严格按 rubric 判定。只输出 JSON。' }, { role: 'user', content: userMsg + '\n\n===== rubric =====\n' + RUBRIC + '\n\n===== vision 转录 =====\n' + visionReport }], max_tokens: 3000 })
  });
  const d = await r.json();
  if (!r.ok) throw new Error('judge HTTP ' + r.status + ': ' + JSON.stringify(d).slice(0, 300));
  return d.choices[0].message.content;
}

// ---- main ----
(async () => {
  const inputs = process.argv.slice(2);
  if (inputs.length === 0) {
    console.error('用法: node scripts/poc/full-pipeline-test.js <图片路径|目录> [更多图片]');
    console.error('      DEEPSEEK_API_KEY=sk-xxx node scripts/poc/full-pipeline-test.js <图片>');
    process.exit(1);
  }
  const files = [];
  for (const inp of inputs) {
    if (fs.statSync(inp).isDirectory()) {
      fs.readdirSync(inp).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f)).forEach(f => files.push(path.join(inp, f)));
    } else files.push(inp);
  }

  for (const img of files) {
    console.log(`\n════════ 全链路: ${path.basename(img)} ════════`);
    const t0 = Date.now();
    try {
      const report = await vision(img);
      console.log(`① Qwen 转录 ✅ (${((Date.now()-t0)/1000).toFixed(1)}s)`);
      const keys = report.split('\n').filter(l => /最终答案|舍去|综上|≥|≤|选项|作答|结论/.test(l));
      console.log('   关键行:', keys.slice(0, 12).join(' ⏐ '));

      const raw = await judge(report);
      console.log(`② DeepSeek 诊断 ✅`);
      const s = raw.indexOf('{');
      const data = JSON.parse(raw.slice(s, raw.lastIndexOf('}') + 1));
      for (const q of data.questions) {
        const [lo, hi] = LR[q.level] || [0, 1];
        const d = clamp(q.D, lo, hi);
        const flag = Math.abs(q.D - d) > 0.001 ? ' ⚠️钳制' : '';
        console.log(`题${q.index}: L${q.level} D=${d.toFixed(3)}${flag} 题型=${q.questionCategory} 对错=${q.isCorrect} P=${q.P} η=${q.eta} 归因=${q.errorAttribution || 'null'}`);
      }
    } catch (e) {
      console.error('❌ 失败:', e.message);
    }
    console.log(`   ⏱ 全链路 ${((Date.now()-t0)/1000).toFixed(1)}s`);
  }
})();
