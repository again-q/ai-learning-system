// ============ 知识点匹配（Jev noul 形式 · 决策 063 落地件） ============
//
// 形式（2026-10-06 定稿，用户拍板）：
//   一段：noul × 章节   → 命中哪些单元（跨单元题是常态，**不能用 choice**）
//   二段：noul × 候选池 → 命中哪些知识点（一题 1~5 个，天然多标签）
//   阈值：0.8（用户指定）
//
// 为什么是 noul 而不是 choice：
//   · choice 是**互斥单选**，表达不了「一题考多个知识点」（决策 053 已废「主知识点」）
//   · choice 也表达不了**跨单元题** —— 实测 55 题里跨单元占比很高
//     （如「第一章 集合 + 第0章 预备知识」「第一章 + 第三章 函数」）
//   · 实测对比（同一题跑 3 次）：
//       choice：并集 conf 0.42/0.42/0.46 —— 只选一个，且自己就不确定
//       noul  ：交集 0.99、并集 0.99、集合运算的基本性质 0.85~0.89 —— 三次完全一致
//   · noul 返回的是**概率**（不是选项），所以不存在「模型写歪名字再去猜节点」这一步
//
// 与旧「字符相似度」的关系：**不再回退**。
//   字符匹配的唯一效果是把自由文本拽到一个可能不对的节点上
//   （「集合的并集」→「集合」父节点，实测 20/51 命中落在禁止记账的节点）。
//   noul 的第 1 段命中集合**同时就是 A 的记账单元**，不需要从知识点反推。
//   宁可返回空（进 node_requests 待建队列），也不硬塞一个错节点（决策 053 宁缺勿假）。
'use strict';

const DEFAULT_URL = process.env.JEV_URL || 'https://openrouter.ai/api/v1/systemone';
const DEFAULT_MODEL = process.env.JEV_MODEL || 'typesafe/jev-1.13';

// 阈值（用户 2026-10-06 指定）：noul 概率 ≥ 此值才算命中
const THRESHOLD = 0.8;
// 候选池 = 一段概率 ≥ top1 × POOL_RATIO 的所有章节（**章数自适应，不写死**）
//   实测（离线用 output/jev/chapter-probs.json 分析）：
//     ratio 0.2 → 中位 2 章 / 平均 2.65 章 / 平均 46 个候选 / 单元召回上界 92%
//     ratio 0.3 → 平均 2.42 章 / 41 候选 / 88%
//     ratio 0.5 → 平均 2.15 章 / 37 候选 / 84%
//   选 0.2：能覆盖「排第 3 位但确实考了」的章节
//   （例：M∪N 那题 第三章=0.20，top1=0.96，0.20 ≥ 0.96×0.2=0.192 → 进池）
const POOL_RATIO = 0.2;
// 候选数上限（成本安全阀）：池子按排名累加，超过此数就截断
//   Jev 输入 $0.042/M，每候选约 60 tok → 64 候选约 ¥0.0016（8.4x），作为异常情况的兜底
const POOL_MAX = 64;
// 一段 top-1 的最低分兜底：低于此值视为「不是本图谱能覆盖的内容」，不硬塞单元
const UNIT_FLOOR = 0.15;

// ⚠️ noul **不能带 criteria**（2026-10-06 实测踩坑）：
//   带上 criteria 后 Jev 不报错，但对**所有** noul 项返回同一个常数（≈0.71~0.74），
//   等于完全丧失区分度 —— 第一段会把 6 个章节全判成"没命中"，第二段全军覆没。
//   正确的用法：noul 只给 instructions（把要问的对象写进 instruction 里）。
//   实测对照（同一题）：
//     带 criteria → 六章全 0.72 左右，无法区分
//     不带 criteria → 集合章 0.92 / 三角函数章 0.01（区分度正常）
const CHAPTER_INSTR = '这道题是否考查了下面这一章的知识？按题目实际用到的知识判断，不要按难度判断。';
const POINT_INSTR = '这道题是否考查了下面这个知识点？考查指解题时必须用到它（用它定义、性质、表示、运算或关系），'
  + '只是顺带提一句不算。';

/**
 * 从节点列表构建「章节 → 候选名」映射（章节取 path[2]）。
 * 只收【知识本体叶子】（排除 partition='method'）——方法不是 K 节点（决策 028/052）。
 * 父节点不进候选：它是给学生看的**路由**（graphService 逐层下钻），不是记账单位。
 */
function groupByChapter(nodes) {
  const all = Array.isArray(nodes) ? nodes : [];
  const parents = new Set(all.map((n) => n && n.parentId).filter(Boolean));
  const groups = {};
  for (const n of all) {
    if (!n || String(n.partition || '') === 'method') continue;
    if (parents.has(n.knowledgeId || n._id)) continue;
    const nm = String(n.name || '').trim();
    if (!nm) continue;
    const p = Array.isArray(n.path) ? n.path[2] : null;
    const ch = p ? String(p).trim() : '未知章节';
    (groups[ch] = groups[ch] || []).push(nm);
  }
  for (const k of Object.keys(groups)) groups[k] = Array.from(new Set(groups[k])).sort();
  return groups;
}

/** 构造 Jev client（依赖注入 fetch，便于单测 mock） */
function createJevClient(opts) {
  const o = opts || {};
  const url = o.url || DEFAULT_URL;
  const model = o.model || DEFAULT_MODEL;
  const apiKey = o.apiKey || process.env.OPENROUTER_API_KEY || process.env.JEV_API_KEY || '';
  const doFetch = o.fetch || (typeof fetch === 'function' ? fetch : null);

  async function ask(state, questions) {
    if (!doFetch) throw new Error('Jev: 无可用的 fetch');
    const res = await doFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, state, questions }),
    });
    const j = await res.json();
    if (!res.ok) {
      const msg = (j && j.error && j.error.message) || JSON.stringify(j).slice(0, 200);
      const e = new Error(`Jev HTTP ${res.status}: ${msg}`);
      e.status = res.status;
      throw e;
    }
    return j;
  }
  return { ask };
}

/** 抽出 noul 概率（question id 用 ASCII，避免 Jev 对中文 id 报错）
 *  ⚠️ 缺失必须返回 null，不能返回 0：`Number(null) === 0`，
 *     不显式判空会把「没返回」伪装成「确定不考查」，静默丢知识点。 */
function noulProb(answers, id) {
  const a = answers && answers[id];
  if (!a) return null;
  const v = a.noul != null ? a.noul : a.probability;
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * 一段：noul × 章节 → 命中的单元列表。
 * @returns {Promise<{units:string[], probs:Object}>}
 */
async function pickUnits(client, questionText, chapters) {
  const list = Array.isArray(chapters) ? chapters : [];
  if (!list.length) return { units: [], probs: {} };
  const questions = {};
  list.forEach((ch, i) => {
    questions['c' + i] = { type: 'noul', instructions: `这道题是否考查了「${ch}」这一章的知识？按题目实际用到的知识判断，不要按难度判断。` };
  });
  const r = await client.ask(String(questionText || ''), questions);
  const probs = {};
  const units = [];
  list.forEach((ch, i) => {
    const p = noulProb(r.answers, 'c' + i);
    probs[ch] = p;
    if (p != null && p >= THRESHOLD) units.push(ch);
  });
  return { units, probs };
}

/**
 * 二段：noul × 候选 → 命中的知识点。
 * @returns {Promise<{points:string[], probs:Object}>}
 */
async function pickPoints(client, questionText, candidates) {
  const list = Array.isArray(candidates) ? candidates : [];
  if (!list.length) return { points: [], probs: {} };
  const questions = {};
  list.forEach((nm, i) => {
    // 2026-10-07 改问法（实测）：原问法「这道题是否**考查**了 X？」产出高度集中在通用元概念
    //   （集合运算的基本性质 / 并集 / 交集 / 元素 —— 10 道题只挑出 8 个不同知识点，
    //    其中「具体的」仅 1 个），导致「同一处丢过几次」（跨题对齐）拿不到能定位问题的标签。
    //   改成「是否**用到**它的定义/性质/表示/运算/关系」后：具体标签 2 → 11 个，
    //   每题挑出数 3.6 → 5.3（可接受）。
    //   对照依据：scripts/verify-n2-batch.mjs、output/jev/fix-test.json。
    //   ⚠️ 不要再加"这只是顺带提一句不算"之类的排除条件 —— 实测会让 Jev 按字面把结果压死
    //      （"挑这道题特有的"问法让产出从 3.6 掉到 1.4）。
    questions['k' + i] = { type: 'noul', instructions: `解这道题时，是否用到了「${nm}」的定义、性质、表示、运算或关系？用到了就算，不只是"提到"。` };
  });
  const r = await client.ask(String(questionText || ''), questions);
  const probs = {};
  const points = [];
  list.forEach((nm, i) => {
    const p = noulProb(r.answers, 'k' + i);
    probs[nm] = p;
    if (p != null && p >= THRESHOLD) points.push(nm);
  });
  return { points, probs };
}

/**
 * 完整匹配：题目文本 → { units, points, ... }
 *
 * 三段结构（2026-10-06 用户拍板 + 实测定稿）：
 *   ① 一段 noul × 章节 → **按概率排名取前 POOL_TOP_N 章**作为候选池
 *      （不用绝对阈值：章节概率与难度强相关，难题平均只有 0.75，
 *        固定 0.8 会把难题系统性丢掉 —— 而难题正是最需要追踪的）
 *   ② 二段 noul × 候选池 → 命中知识点
 *   ③ 单元 = **一段 top-1 ∪ 二段命中知识点所属章节**
 *
 * 为什么单元要「top-1 ∪ 二段章节」而不是只用一段：
 *   实测（scripts/verify-unit-source.mjs，逐题计费）：
 *     · 只用一段 top-1   → 真实单元召回 56%，成本 15.8x
 *     · top1 ∪ 二段折章  → 真实单元召回 69%，成本 13.5x   ← 采用
 *     · 池=top3          → 75%，但成本 9.4x（低于用户要求的 10x）
 *   例：「已知 M={x|-4<x≤1}, N={x|-1<x<3}，求 M∪N」
 *     一段：第一章 0.97 / 第三章 仅 0.20（漏了）
 *     二段：并集 0.99、集合运算的基本性质 0.94、**区间表示法 0.83（第三章）**
 *     → 第三章「考得少但确实考了」，二段能抓到，一段抓不到。
 *
 * top-1 保底的意义：保证**不漏**（一段 top-1 正确率实测 96.1%）。
 * 二段补充的意义：把「考得少」的章节也记上（用户 2026-10-06：「确实也考到了
 * 第三章的知识，只不过考的比较小」）。
 *
 * @returns {Promise<{units:string[],points:string[],chapterProbs:Object,pointProbs:Object,hit:boolean}>}
 */
async function matchByJev(client, questionText, groups, opts) {
  const chapters = Object.keys(groups || {});
  if (!chapters.length) {
    return { units: [], points: [], chapterProbs: {}, pointProbs: {}, hit: false, reason: '无候选章节' };
  }

  // ---- 一段：排名（不卡绝对阈值）----
  const stage1 = await pickUnits(client, questionText, chapters);
  const ranked = Object.entries(stage1.probs)
    .filter(([, v]) => v != null)
    .sort((a, b) => b[1] - a[1]);
  if (!ranked.length) {
    return { units: [], points: [], chapterProbs: stage1.probs, pointProbs: {}, hit: false, reason: '章节无概率返回' };
  }
  const top1 = ranked[0][0];
  // 极低分兜底：连 0.15 都不到的题，多半不是这个图谱能覆盖的内容 → 不硬塞单元
  if (ranked[0][1] < UNIT_FLOOR) {
    return { units: [], points: [], chapterProbs: stage1.probs, pointProbs: {}, hit: false, reason: '章节概率过低' };
  }

  // ---- 候选池：一段概率 ≥ top1 × RATIO 的章节（章数自适应），按候选数封顶 ----
  const top1Prob = ranked[0][1];
  const cut = top1Prob * POOL_RATIO;
  const poolChapters = [];
  let acc = 0;
  for (const [ch, p] of ranked) {
    if (p < cut && poolChapters.length) break;      // top-1 永远保留
    const nodes = groups[ch] || [];
    if (acc + nodes.length > POOL_MAX && poolChapters.length) break;
    poolChapters.push(ch);
    acc += nodes.length;
    if (acc >= POOL_MAX) break;
  }
  const pool = Array.from(new Set(poolChapters.flatMap((ch) => groups[ch] || [])));

  // ---- 二段：在候选池里定知识点 ----
  const stage2 = await pickPoints(client, questionText, pool);

  // ---- 单元 = top-1 ∪ 二段命中知识点所属章节 ----
  const fromPoints = stage2.points.map((nm) => chapterOfName(nm, groups)).filter(Boolean);
  const units = Array.from(new Set([top1, ...fromPoints]));

  return {
    units,
    points: stage2.points,
    chapterProbs: stage1.probs,
    pointProbs: stage2.probs,
    poolChapters,
    hit: stage2.points.length > 0,
    // 有单元但没命中知识点 → 该单元有题，但没有合适节点（图谱缺口）
    reason: stage2.points.length ? undefined : '章内知识点全未命中',
  };
}

/** 知识点名 → 所属章节（用候选池反查，避免额外查库） */
function chapterOfName(name, groups) {
  for (const [ch, list] of Object.entries(groups || {})) {
    if (list.includes(name)) return ch;
  }
  return null;
}

/**
 * 判断一个 Jev 错误是不是「服务不可用」（而不是「这题没匹配上」）。
 *
 * 用途（2026-10-06 用户定）：服务不可用时**不降级**，而是报「暂不可用」+ 把批次挂起等恢复。
 *   「JEV不可用的时候直接说目前服务不可用，先把这一批题目离线缓存了，等可以用的时候再做。」
 *
 * 判据：
 *   · 网络层失败（fetch 抛错，无 status）→ 服务不可用
 *   · HTTP 5xx / 429（限流）/ 401 / 403（key 没配或失效）→ 服务不可用
 *   · 其他（如 400 参数错）→ **不算**服务不可用（那是我们的 bug，应该暴露出来）
 */
function isServiceUnavailable(err) {
  if (!err) return false;
  const st = Number(err && err.status);
  if (!Number.isFinite(st) || st === 0) return true;      // 网络层失败：fetch 抛错没有 status
  return st >= 500 || st === 429 || st === 401 || st === 403;
}

module.exports = {
  DEFAULT_URL, DEFAULT_MODEL, THRESHOLD, POOL_RATIO, POOL_MAX, UNIT_FLOOR,
  CHAPTER_INSTR, POINT_INSTR,
  groupByChapter, createJevClient, pickUnits, pickPoints, matchByJev, noulProb,
  chapterOfName, isServiceUnavailable,
};
