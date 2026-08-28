// ============ 报告内容确定性清洗层 ============
// 来源：《诊断报告内容质量审视_交接包_2026-08-27》§5.1（P0-1/P0-2/P0-3/P1-3）。
// 背景：systemV3 的 prompt 禁令（原则 12/13）对 LLM 不保证生效，样本报告已出现毒点
// （根因复读「未理解××」/ 无历史却编「检索记录显示一直很稳」）。
// 本层在 LLM JSON 解析后、入库前做确定性改写；纯函数、零依赖，可脱离云环境单测。

// 毒点句式：「未理解/没理解/不理解」任意出现（原则 13：禁止复述判定归因原文）；
// 以及「不会 + 方法/思路/技巧/概念/知识点」的断言式归因
const POISON_RE = /未理解|没理解|不理解|不会(?=[^，。；]{0,20}(?:方法|思路|技巧|概念|知识点))/;

// 否定语境豁免：「不是不会」「不等于未理解」这类句子是在纠正归因，不能误伤
const NEGATION_RE = /(不是|并非|不等于|≠|没有|并没有)$/;

// 单句是否命中毒点（先找毒点词位置，再看其前 6 字是否否定语境）
function isPoisonSentence(sentence) {
  const idx = sentence.search(POISON_RE);
  if (idx < 0) return false;
  const prefix = sentence.slice(Math.max(0, idx - 6), idx);
  return !NEGATION_RE.test(prefix);
}

// 句级清洗：命中毒点的整句替换为合规表述（不动好句子），连续重复的替换句去重
function scrubSentences(text, fallback) {
  if (typeof text !== 'string' || !text) return text;
  const parts = text.split(/(?<=[。！？；!?\n])/).filter(Boolean);
  const out = [];
  for (const s of parts) {
    if (isPoisonSentence(s)) {
      const last = out[out.length - 1];
      if (last !== fallback) out.push(fallback); // 避免同句重复堆积
    } else {
      out.push(s);
    }
  }
  return out.join('').trim();
}

// 空白/无过程题识别（确定性代理）：分段里有「空白」段，或现象描述里有空白措辞
function looksBlank(wp) {
  const segs = (wp.breakpoint && wp.breakpoint.segments) || [];
  if (segs.some((s) => s && s.status === '空白')) return true;
  const txt = [wp.rootcause && wp.rootcause.phenomenon, wp.rootcause && wp.rootcause.preview,
    wp.breakpoint && wp.breakpoint.preview].filter(Boolean).join(' ');
  return /空白|未下笔|未作答|没有作答|没有下笔/.test(txt);
}

// P0-2：空白题 sources 补足为 2~3 个并列假设（判断权给学生），过滤毒点项
function sanitizeSources(sources, isBlank) {
  const clean = (Array.isArray(sources) ? sources : [])
    .filter((s) => typeof s === 'string' && s.trim() && !isPoisonSentence(s)).slice(0, 3);
  if (isBlank) {
    const defaults = ['没认出这类题型（一种可能）', '知道思路，但这次没下笔（另一种可能）', '当时选择先跳过（另一种可能）'];
    for (const d of defaults) {
      if (clean.length >= 2) break;
      if (!clean.some((s) => s.includes(d.slice(0, 6)))) clean.push(d);
    }
  }
  return clean.length ? clean : (Array.isArray(sources) ? sources : sources || null);
}

// 单个薄弱点清洗（disputeModule 重新生成的四段式走同一入口）
function sanitizeWeakpoint(wp) {
  if (!wp || typeof wp !== 'object') return wp;
  const isBlank = looksBlank(wp);
  const rc = wp.rootcause;
  if (rc && typeof rc === 'object') {
    // P0-1：directCause 命中毒点 → 整字段降级（可观察事实 + 原因待确认）
    if (typeof rc.directCause === 'string' && isPoisonSentence(rc.directCause)) {
      rc.directCause = isBlank
        ? '整题未见下笔，直接原因待确认。可以对照下面的几种可能，看看哪种更接近你的情况。'
        : '断点位置已由过程证据定位，直接原因待确认。可以对照下面的几种可能。';
    }
    // P0-3：history 为空却写「检索/历史一直很稳」类叙事 → 整字段降级
    if ((rc.history == null) && typeof rc.closing === 'string'
      && /(检索|历史|以往|过去|记录).{0,12}(显示|记录)|一直很稳/.test(rc.closing)) {
      rc.closing = '若这是你第一次集中遇到这类问题，也没关系——先把这一步找回来。';
    }
    // P0-1/P0-2：现象/预览/收尾句级清洗
    rc.phenomenon = scrubSentences(rc.phenomenon, '现象以过程记录为准。');
    rc.preview = scrubSentences(rc.preview, '');
    rc.closing = scrubSentences(rc.closing, ''); // 空白题同样清洗（history 降级规则之上再兜底）
    rc.sources = sanitizeSources(rc.sources, isBlank);
  }
  const bp = wp.breakpoint;
  if (bp && typeof bp === 'object') {
    bp.preview = scrubSentences(bp.preview, '');
    bp.confirmed = scrubSentences(bp.confirmed, '');
    bp.contradiction = scrubSentences(bp.contradiction, '');
    if (!isBlank) bp.closing = scrubSentences(bp.closing, '');
  }
  const hook = wp.hook;
  if (hook && typeof hook === 'object') {
    // P1-3：钩子最多 2 问（prompt 已约束，代码兜底强制）
    if (Array.isArray(hook.questions) && hook.questions.length > 2) {
      hook.questions = hook.questions.slice(0, 2);
    }
    hook.preview = scrubSentences(hook.preview, '');
    hook.scaffold = scrubSentences(hook.scaffold, '');
  }
  if (typeof wp.mindPoint === 'string') wp.mindPoint = scrubSentences(wp.mindPoint, '');
  return wp;
}

// 整份报告清洗（报告生成主流程入库前调用）
function sanitizeReport(report) {
  if (!report || typeof report !== 'object') return report;
  const ov = report.overview;
  if (ov && typeof ov === 'object') {
    ov.coreHint = scrubSentences(ov.coreHint, '本次最值得关注的问题见薄弱点分析。');
    ov.moodText = scrubSentences(ov.moodText, '');
  }
  if (Array.isArray(report.weakpoints)) {
    report.weakpoints = report.weakpoints.map(sanitizeWeakpoint);
  }
  if (Array.isArray(report.secondaryPatterns)) {
    report.secondaryPatterns = report.secondaryPatterns.map((sp) => {
      if (!sp || typeof sp !== 'object') return sp;
      sp.preview = scrubSentences(sp.preview, '');
      sp.note = scrubSentences(sp.note, '');
      return sp;
    });
  }
  return report;
}

module.exports = { sanitizeReport, sanitizeWeakpoint, isPoisonSentence };
