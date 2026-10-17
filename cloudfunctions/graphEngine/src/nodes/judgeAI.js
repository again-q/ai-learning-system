'use strict';
// N2 · AI 判定（judgeOne/index.js:381-399 + 401-451 搬迁）
// 红线：与线上同一 prompt、同一模型参数（thinking disabled / temperature 0.2 / max_tokens 8000），
//      变化只来自「壳」，不来自「芯」；prompt 文本在 src/lib/prompts.js（逐字抽取）。
const { RUBRIC_V2, TRACE_CROP_PROMPT, userMsg } = require('../lib/prompts');
const orchestratorLib = require('../lib/orchestrator');

const SYSTEM_MSG = '你是严谨的数学诊断推理引擎。先学生视角感受难度，再对照 L1-L11 标尺判档，最后判定作答。输出纯 JSON。';

function createJudgeAINode({ cloud, postJSON, config, kg, logger } = {}) {
  const log = (logger && logger.warn) ? logger.warn.bind(logger) : console.warn;
  const cfg = config || {};
  if (typeof postJSON !== 'function') throw new Error('N2: postJSON 必填');

  // 切题 v1：单题裁剪图 → 精读痕迹（失败回退整页文本痕迹，不阻断判定）
  async function traceFromCrop(fileId) {
    const file = await cloud.getTempFileURL({ fileList: [fileId] });
    const url = file.fileList[0] && file.fileList[0].tempFileURL;
    if (!url) throw new Error('crop tempURL 为空');
    const imageResp = await fetch(url);
    const buffer = Buffer.from(await imageResp.arrayBuffer());
    const ext = (String(fileId).split('.').pop() || 'jpg').toLowerCase();
    const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' }[ext] || 'image/jpeg';
    const data = await postJSON(cfg.qwenBaseUrl + '/chat/completions', {
      model: cfg.qwenVlModel || 'qwen3.7-plus',
      messages: [{ role: 'user', content: [
        { type: 'image_url', image_url: { url: 'data:' + mime + ';base64,' + buffer.toString('base64') } },
        { type: 'text', text: TRACE_CROP_PROMPT },
      ] }],
      max_tokens: 1500,
      enable_thinking: false,
    }, cfg.qwenApiKey);
    return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  }

  async function judgeQuestion(question, ragContext, jevPoints) {
    const issues = [];
    const ragSection = ragContext ? '\n\n【历史参考（仅供参考不强制）】\n' + ragContext : '';
    // 切题 v1：有单题裁剪图 → 精读痕迹替代整页文本痕迹
    let traceInput = (question.traceReport || '').slice(0, 1500);
    if (question.cropFileID) {
      try {
        const cropTrace = await traceFromCrop(question.cropFileID);
        if (cropTrace && cropTrace.trim()) traceInput = cropTrace.trim().slice(0, 1500);
      } catch (e) {
        log('[graphEngine/N2] 裁剪图痕迹精读失败，回退整页痕迹: ' + e.message);
        issues.push('N2: 裁剪图痕迹精读失败，已回退整页痕迹（' + e.message + '）');
      }
    }
    // 决策 063（先 J 再 L）：N1.5 的 Jev 已把考点缩小到几个 → 只把这几个喂给 LLM。
    //   没有 Jev 结果时退回原「全量清单」（= 接入前行为，保证可降级）。
    const jevList = Array.isArray(jevPoints) ? jevPoints.filter(Boolean) : null;
    const nodeList = jevList && jevList.length
      ? '【本题考点清单（系统已判定本题考以下知识点，请逐个给出它们的 D 与 P）】' + jevList.join('、')
        + '\n\n（若你认为本题还考了清单之外的「知识本体」，仍可写进 knowledgeUsage 并加 newNode:true）'
      : ((kg && typeof kg.buildNodeNames === 'function') ? await kg.buildNodeNames() : '');
    const data = await postJSON(cfg.dsBaseUrl + '/chat/completions', {
      model: cfg.dsModel,
      // 决策 023（「thinking 开 → content 空死锁」）已被 2026-10-17 实测推翻：
      //   当年"死锁"实为 max_tokens 过小（思考约 7000~11000 tokens 把预算吃光 → content 为空），
      //   不是思考模式不能用。
      // 成本取舍（2026-10-17 用户拍板）：N2 判定**默认关思考**，把「找错在哪」交给 N2 后的编排 Agent
      //   （编排的子对话问题封闭，关思考已实测可命中，实测题19 能找到「相加=0」）。
      //   要临时用思考判定时，显式设 JUDGE_THINKING=enabled（不沿用 DS_THINKING，避免受其他链路配置影响）。
      thinking: { type: (process.env.JUDGE_THINKING === 'enabled') ? 'enabled' : 'disabled' },
      // 官方文档（api-docs.deepseek.com/guides/thinking_mode）：思考模式下 temperature 不生效，
      // 故仅在关思考时传，避免"看起来控了温其实没控"。
      ...((process.env.JUDGE_THINKING === 'enabled') ? {} : { temperature: 0.2 }),
      messages: [
        { role: 'system', content: SYSTEM_MSG },
        { role: 'user', content: userMsg + '\n\n' + (nodeList || '') + '\n\n===== L1-L11 标尺 =====\n' + RUBRIC_V2 + ragSection + '\n\n===== 本题上下文 =====\n题目：' + question.questionText + '\n\n【学生作答痕迹（仅用于判定对错/P/η/归因，严禁用于评估难度——难度是题目固有属性，与作答过程无关）】\n' + traceInput },
      ],
      // 实测 reasoning 最高 11003 tokens，旧的 8000 会截断 → content 为空（正是当年"死锁"的成因）。
      max_tokens: 16000,
    }, cfg.dsApiKey);
    const msg = data.choices[0].message;
    const content = msg.content || msg.reasoning_content || '';
    // 括号配平：从末尾 } 配平到真实 JSON 起点（跳过 prompt 示例/reasoning 复述）
    const end = content.lastIndexOf('}');
    if (end < 0) throw new Error('判定输出无 JSON');
    let depth = 0, start = -1;
    for (let i = end; i >= 0; i--) {
      const ch = content[i];
      if (ch === '}') depth++;
      else if (ch === '{') { depth--; if (depth === 0) { start = i; break; } }
    }
    if (start < 0) throw new Error('判定 JSON 起点定位失败');
    return { raw: JSON.parse(content.slice(start, end + 1)), issues };
  }

  return async function judgeAINode(state) {
    const question = state.question || {};
    const out = await judgeQuestion(question, state.ragContext, state.jevPoints);
    const raw = out.raw;
    // 预留接口：外部按「图片题号」提供的标准答案 > LLM 自算的 correctAnswer（judgeOne:619）
    if (state.providedAnswer) raw.correctAnswer = state.providedAnswer;

    // ============ 编排 Agent（2026-10-17 接入，全部走档 2）============
    // 用户拍板：「全部上 2 的判定」。解答题→逐步核查；选填题→选项分析。
    // 红线：编排失败**不阻塞**判定（降级为原 N2 结论），只记 issues。
    const issues = out.issues;
    let orchestrator = null;
    if (orchestratorLib && typeof orchestratorLib.analyze === 'function' && process.env.ORCHESTRATOR !== 'off') {
      try {
        const call = async ({ system, user, maxTokens }) => {
          const d = await postJSON(cfg.dsBaseUrl + '/chat/completions', {
            model: cfg.dsModel,
            // 子对话问题封闭，不开思考（实测足够且便宜得多）
            thinking: { type: 'disabled' },
            temperature: 0.2,
            max_tokens: maxTokens || 2000,
            messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          }, cfg.dsApiKey);
          const m = d.choices && d.choices[0] && d.choices[0].message;
          return { text: (m && m.content) || '' };
        };
        orchestrator = await orchestratorLib.analyze({ call, question, logger });
        if (orchestrator) {
          // 编排结果挂到 raw，供 N3 之后的展示层/日志使用；**不覆盖** N2 的判定字段
          raw.orchestrator = orchestrator;
          // 若编排找到确定性错误，同步一条可观察的错因（放在 N2 没给的时候）
          if (!raw.errorAttribution && orchestrator.findings && orchestrator.findings.length) {
            const f = orchestrator.findings[0];
            raw.errorAttribution = `第${f.unit}步运算与声称不一致：应为「${f.correct}」，学生写「${f.claim}」`;
          }
        }
      } catch (e) {
        log('[graphEngine/N2] 编排失败（不阻塞判定）: ' + e.message);
        issues.push('N2: 编排失败，已降级为原判定（' + (e && e.message) + '）');
      }
    }

    return { raw, issues };
  };
}

module.exports = { createJudgeAINode, SYSTEM_MSG };
