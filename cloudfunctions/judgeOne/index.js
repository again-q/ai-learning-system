const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { updateMastery } = require('./updateMastery');

// ============ 配置 ============
const QWEN_API_KEY = process.env.QWEN_API_KEY;
const DS_API_KEY = process.env.DEEPSEEK_API_KEY;
const QWEN_BASE_URL = process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const DS_BASE_URL = process.env.DS_BASE_URL || 'https://api.deepseek.com';
const DS_MODEL = process.env.DS_MODEL || 'deepseek-v4-flash'; // 新模型名（chat/reasoner 已弃用）
const DS_THINKING = process.env.DS_THINKING || 'enabled';
const DS_EFFORT = process.env.DS_EFFORT || 'high'; // reasoning_effort：low 会误判，max 烧钱，high 是准确底线
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-v4';
const TOP_K = 5;
const HISTORY_LIMIT = 200;

const success = (data = null) => ({ code: 0, data, message: 'ok' });
const fail = (code, msg) => ({ code, data: null, message: msg });

// ============ 完整版标尺（决策 020/021 + D难度标尺-L11分层.md） ============
const RUBRIC = `
【诊断判定标准（决策 020/021 + D 难度标尺完整版 L1~L11）】
■ D 难度：第1步边界判定速查卡判 Lx 档；第2步档内自由打 D 值；代码钳制回区间。
| 判定依据 | 层级 | D 区间 |
| 读题即写答案，0步推导 | L1 | 0.01–0.15 |
| 套1个公式，1-2步计算 | L2 | 0.15–0.30 |
| 套1-2个公式，2-3步推导，无变形 | L3 | 0.30–0.45 |
| 3-5步标准流程，单一板块内串联 | L4 | 0.45–0.60 |
| 5-10步流程，轻度分类讨论（2-3类） | L5 | 0.60–0.70 |
| 10步以上，复杂分类讨论（3-5类） | L6 | 0.70–0.79 |
| 二级结论/高观点 | L7 | 0.79–0.85 |
| 高数背景初等化 | L8 | 0.85–0.90 |
| 多高观点叠加 | L9 | 0.90–0.94 |
| 竞赛板块 | L10 | 0.94–0.98 |
| 纯原创 | L11 | 0.98–0.999 |
■ 例子锚：L1:A∩B求值 L2:√(x-1)定义域 L3:比log大小 L4:△ABC求c(含参分类讨论也算L4) L5:裂项求和 L6:e^x-ax²两零点 L7:极点极线 L8:极值点偏移 L9:多高观点 L10:竞赛 L11:IMO
■ 5维锁定：L1(1,1,1,1,1) L2(1-2,1,1,2,1) L3(2,1,1,2,2) L4(2,2,1,3,2) L5(2,2,2,3,2) L6(3,3,2,3,2) L7(3,3,3,4,3) L8(4,4,3,4,3) L9(4,4,4,4,4) L10(5,5,4,5,5) L11(5,5,5,5,5)
■ 档内 D 值（决策 024，详细规则）：
   判完档后，先在档位区间内凭第一直觉形成一个初步 D 判断（这题在档内偏简单、中等还是偏难），
   然后逐维审视五维难度特征，每维感受后决定向上还是向下修正，最后给出精细 D 值：

   (1) 知识复杂度 —— 涉及多少知识储备、是否跨板块调用
       低：单个概念直接套用（如"数集合元素个数套 2^n"）
       中：本单元 2-3 个概念串联（如"通分变形 + 奇偶性判断"）
       高：跨单元知识组合（如"函数 + 不等式 + 数列综合"）

   (2) 思维深度 —— 要不要转换思路、逆向、构造
       低：正向直接推理，按部就班
       中：需要一次思路转换（换元/补集思想/整体代换）
       高：逆向构造/反证/需要灵感跳跃才能想到

   (3) 陷阱密度 —— 有没有隐蔽条件、易错点、分类讨论
       低：条件直白无坑
       中：1-2 个易错点（漏空集、忘互异性、边界值取舍）
       高：多重陷阱叠加，或大段分类讨论容易漏类

   (4) 计算强度 —— 计算量多大
       低：口算即可
       中：几行代数变形/代入验证
       高：长链运算/高次方程/多步化简，容易算错

   (5) 陌生度 —— 题型/情境有多常见
       低：课本例题级，见过很多次
       中：常见题型加变式
       高：新定义/新情境/不常见结构，第一次见到要想很久

   浮动规则（描述性，非公式）：
   · 五维中多数维度偏低 → 在初步判断上明显下浮，落到档内下沿附近
   · 五维高低参半 → 小幅浮动，保持在中段附近
   · 五维中多数维度偏高 → 明显上浮，落到档内上沿附近
   · 单个维度特别突出（如陷阱密度很高）→ 至少向上浮动一档内位置
   最终给出一个精细 D 值；不要趋同、不要总取中间；D 必须落在本档区间内
■ 题型：回忆类=直接套公式；单元内=本单元变形推理分类讨论；跨单元=结合≥2单元
■ P（§4.4 连续 0~1）：过程与正确答案的距离，**P 本身编码对错**（无独立对错字段）——完全正确且答案对=1.0；选填对=1.0、错=0；解答答案错但过程几乎完整=0.8~0.95；中途偏航但思路对=0.4~0.7；只有思路无结果=0.2~0.3；空白/完全跑偏=0。P<0.5 视为答得不好（原判错语义），P≥0.5 视为基本答对
■ η：只对解答题0.4~1.0；填空选择null
■ r：一律null
■ 归因：P<0.5 才给；P≥0.5 给 null；不编造
`;

// ============ 钳制 ============
const LR = {
  L1: [0.01, 0.15], L2: [0.15, 0.30], L3: [0.30, 0.45],
  L4: [0.45, 0.60], L5: [0.60, 0.70], L6: [0.70, 0.79],
  L7: [0.79, 0.85], L8: [0.85, 0.90], L9: [0.90, 0.94],
  L10: [0.94, 0.98], L11: [0.98, 0.999],
};
// P 连续 0~1（决策 2026-08-14 用户：不再收敛四档），clampParams 内直接钳制

// ============ 知识点匹配（#3 方案：封装独立函数，精确 → 子串最长；待 #9 图谱补全后升级为搜索） ============
let _nodeCache = null;
let _nodeCacheAt = 0;
const NODE_CACHE_TTL = 5 * 60 * 1000;   // 5 分钟缓存，避免每次判题拉全量

async function loadNodes() {
  const now = Date.now();
  if (!_nodeCache || now - _nodeCacheAt > NODE_CACHE_TTL) {
    const res = await db.collection('knowledge_nodes')
      .where({ knowledgeId: _.exists(true) }).limit(1000).get();
    _nodeCache = res.data;
    _nodeCacheAt = now;
  }
  return _nodeCache;
}

// 知识节点查找：先精确（name 全等），失败则子串容错（AI 常输出句子式描述，取最长命中的节点名=最具体），返回节点对象
async function findNode(kName) {
  const nodes = await loadNodes();
  let best = null, bestLen = 0;
  for (const n of nodes) {
    const nm = n.name || '';
    if (!nm) continue;
    if (nm === kName) return n;
    if (kName.includes(nm) && nm.length > bestLen) { bestLen = nm.length; best = n; }
  }
  return best;
}

// 知识节点匹配：返回节点标识（A 单元级定位用 findNode 取 path[2]）
// 决策（2026-08-17 方案 A）：官方图谱匹配失败 → custom_nodes 兜底——AI 输出的知识点名直接作为 K 的键，
// 图谱匹配不上不丢弃 K 数据；图谱治理后匹配率上来，自然少走兜底
async function matchKnowledgeNode(kName, userId) {
  const n = await findNode(kName);
  if (n) return n.knowledgeId || n._id;   // 新 schema 用 knowledgeId，旧 schema 用 _id
  try {
    const cRes = await db.collection('custom_nodes')
      .where({ name: kName }).limit(1).get();
    if (cRes.data.length) return cRes.data[0]._id;
    const cIns = await db.collection('custom_nodes').add({
      data: { name: kName, userId: userId || null, createdAt: db.serverDate() },   // userId 记录提炼来源
    });
    return cIns._id;
  } catch (e) {
    console.warn('[judgeOne] custom_nodes 兜底失败:', e.message);
    return null;
  }
}

// 知识点所属单元名（宪法 §5.3：A 为单元级）——节点 path[2] 即单元名，如「第一章 集合与常用逻辑用语」
function unitNameOf(node) {
  if (!node || !Array.isArray(node.path) || node.path.length < 3) return null;
  return node.path[2];
}

// 掌握度迁移（#8 用户拍板 2026-08-14）：复核页改 knowledgeNodeName 后，把这条题的 S_k/D_k 贡献从旧节点移到新节点
// 旧节点扣回（Dsum 归零则删记录），新节点添加；同名/匹配失败安全跳过
async function migrateProgress(openid, oldName, newName, D, P) {
  if (!oldName || !newName || oldName === newName) return;
  const d = Number(D) || 0;
  const p = Number(P) || 0;
  if (d <= 0) return;   // 没判过题（无 D）就没有掌握度可迁
  const oldId = await matchKnowledgeNode(oldName);
  const newId = await matchKnowledgeNode(newName);
  if (oldId === newId) return;

  // 旧节点扣回
  if (oldId) {
    const pRes = await db.collection('knowledge_progress')
      .where({ userId: openid, knowledgeNodeId: oldId }).limit(1).get();
    if (pRes.data.length) {
      const doc = pRes.data[0];
      const S = Math.max(0, (doc.sValue || 0) - d * p);
      const Dsum = Math.max(0, (doc.dValue || 0) - d);
      if (Dsum <= 0.0001) {
        await db.collection('knowledge_progress').doc(doc._id).remove();
      } else {
        await db.collection('knowledge_progress').doc(doc._id).update({ data: {
          sValue: Math.round(S * 10000) / 10000,
          dValue: Math.round(Dsum * 10000) / 10000,
          mastery: Math.round((S / Dsum) * 100) / 100,
          lastUpdated: db.serverDate(),
        }});
      }
    }
  }

  // 新节点添加
  if (newId) {
    const pRes = await db.collection('knowledge_progress')
      .where({ userId: openid, knowledgeNodeId: newId }).limit(1).get();
    const doc = pRes.data[0] || {};
    const S = (doc.sValue || 0) + d * p;
    const Dsum = (doc.dValue || 0) + d;
    const patch = {
      sValue: Math.round(S * 10000) / 10000,
      dValue: Math.round(Dsum * 10000) / 10000,
      mastery: Math.round((S / Dsum) * 100) / 100,
      attempts: (doc.attempts || 0) + 1,
      correctCount: (doc.correctCount || 0) + (p >= 0.5 ? 1 : 0),
      lastUpdated: db.serverDate(),
    };
    if (pRes.data.length) {
      await db.collection('knowledge_progress').doc(pRes.data[0]._id).update({ data: patch });
    } else {
      await db.collection('knowledge_progress').add({ data: { userId: openid, knowledgeNodeId: newId, ...patch } });
    }
  }
}

function clampParams(raw, questionType) {
  const [lo, hi] = LR[raw.level] || [0.01, 0.999];
  const D = Math.min(hi, Math.max(lo, Number(raw.D) || lo));
  const isOpen = questionType === '解答';
  const eta = isOpen ? (raw.eta === undefined ? null : raw.eta) : null;
  // P：连续 0~1（决策 2026-08-14 用户：P=过程距答案的距离，不再收敛四档）
  let P = Math.min(1, Math.max(0, Number(raw.P) || 0));
  P = Math.round(P * 100) / 100;
  return { D, eta, P };
}

// ============ 网络 ============
async function postJSON(url, body, key) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  return resp.json();
}

// ============ RAG ============
async function embedText(text) {
  const data = await postJSON(`${QWEN_BASE_URL}/embeddings`, { model: EMBEDDING_MODEL, input: text }, QWEN_API_KEY);
  return data.data[0].embedding;
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

async function searchHistory(questionText, userId) {
  try {
    const queryEmbedding = await embedText(questionText);
    const logs = await db.collection('mastery_logs')
      .where({ userId }).orderBy('createdAt', 'desc').limit(HISTORY_LIMIT).get();
    return logs.data
      .filter((log) => log.embedding && Array.isArray(log.embedding) && log.embedding.length > 0)
      .map((log) => ({
        score: cosine(queryEmbedding, log.embedding),
        reportText: log.reportText || '',
        isCorrect: log.report && log.report.isCorrect,
      }))
      .filter((h) => h.reportText)
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_K);
  } catch (e) {
    console.warn('[judgeOne] RAG search failed:', e.message);
    return [];
  }
}

function buildRagContext(hits) {
  if (!hits.length) return '';
  return hits.map((h, i) =>
    `[历史参考 ${i + 1}] 题目：${h.reportText}（当时判定：${h.isCorrect ? '对' : '错'}，相似度 ${h.score.toFixed(2)}）`
  ).join('\n');
}

function buildReportText(report) {
  const parts = [
    `题目：${report.questionText || ''}`,
    `作答：${report.studentAnswer || ''}`,
    `判定：${report.isCorrect ? '对' : '错'}`,
    `题型：${report.questionCategory || ''}`,
    `难度：${report.difficultyLevel || ''}`,
    `知识点：${report.knowledgeNodeName || report.knowledgeNodeId || ''}`,
  ];
  if (report.errorDimension) parts.push(`归因维度：${report.errorDimension}`);
  if (report.errorAttribution) parts.push(`归因：${report.errorAttribution}`);
  if (report.breakpoint) parts.push(`断点：第${report.breakpoint.index}段 ${report.breakpoint.nature}`);
  if (Array.isArray(report.knowledgeUsage) && report.knowledgeUsage.length) {
    parts.push(`知识点使用：${report.knowledgeUsage.map((u) => `${u.name}(P=${u.P})`).join('、')}`);
  }
  return parts.join(' | ');
}

// ============ 完整标尺（决策 023 定稿：学生视角 + L1-L11 判档） ============
const RUBRIC_V2 = `
【我方 D 难度标尺 L1~L11（决策 020/021/023 定稿）】
■ 档位边界卡：
L1(0.01-0.15) 读题即写答案，0步推导
L2(0.15-0.30) 套1公式，1-2步计算
L3(0.30-0.45) 套1-2公式，2-3步推导无变形
L4(0.45-0.60) 3-5步标准流程，单板块串联
L5(0.60-0.70) 5-10步，轻度分类讨论
L6(0.70-0.79) 10步+，复杂分类讨论，或需二级结论
L7(0.79-0.85) 需二级结论或高观点工具，或非线性构造
L8(0.85-0.90) 需高数背景初等化（泰勒/拉格朗日/帕德）
L9(0.90-0.94) 需多个高观点叠加，或复杂构造性证明
L10(0.94-0.98) 课外科板块（数论/组合/平几）
L11(0.98-0.999) 纯原创，全球个位数能解
■ 例子锚：L1:A∩B求值 L2:√(x-1)定义域 L3:比log大小 L4:△ABC求c(含参分类也L4) L5:裂项求和 L6:e^x-ax²两零点 L7:极点极线；抽象函数性质推理 L8:极值点偏移；新定义集合运算 L9:多高观点；新定义+抽象条件+多问证明压轴 L10:竞赛 L11:IMO
■ 新定义/抽象函数补充：难度不在步骤数而在「先理解新定义→再构造逻辑链」的思维跳跃+陌生度；单问新定义→L7-L8；新定义+抽象条件+多问证明压轴→L8-L9
■ 5维锁定：L1(1,1,1,1,1) L2(1-2,1,1,2,1) L3(2,1,1,2,2) L4(2,2,1,3,2) L5(2,2,2,3,2) L6(3,3,2,3,2) L7(3,3,3,4,3) L8(4,4,3,4,3) L9(4,4,4,4,4) L10(5,5,4,5,5) L11(5,5,5,5,5)
■ 档内 D 值（决策 024，详细规则）：
   判完档后，先在档位区间内凭第一直觉形成一个初步 D 判断（这题在档内偏简单、中等还是偏难），
   然后逐维审视五维难度特征，每维感受后决定向上还是向下修正，最后给出精细 D 值：

   (1) 知识复杂度 —— 涉及多少知识储备、是否跨板块调用
       低：单个概念直接套用（如"数集合元素个数套 2^n"）
       中：本单元 2-3 个概念串联（如"通分变形 + 奇偶性判断"）
       高：跨单元知识组合（如"函数 + 不等式 + 数列综合"）

   (2) 思维深度 —— 要不要转换思路、逆向、构造
       低：正向直接推理，按部就班
       中：需要一次思路转换（换元/补集思想/整体代换）
       高：逆向构造/反证/需要灵感跳跃才能想到

   (3) 陷阱密度 —— 有没有隐蔽条件、易错点、分类讨论
       低：条件直白无坑
       中：1-2 个易错点（漏空集、忘互异性、边界值取舍）
       高：多重陷阱叠加，或大段分类讨论容易漏类

   (4) 计算强度 —— 计算量多大
       低：口算即可
       中：几行代数变形/代入验证
       高：长链运算/高次方程/多步化简，容易算错

   (5) 陌生度 —— 题型/情境有多常见
       低：课本例题级，见过很多次
       中：常见题型加变式
       高：新定义/新情境/不常见结构，第一次见到要想很久

   浮动规则（描述性，非公式）：
   · 五维中多数维度偏低 → 在初步判断上明显下浮，落到档内下沿附近
   · 五维高低参半 → 小幅浮动，保持在中段附近
   · 五维中多数维度偏高 → 明显上浮，落到档内上沿附近
   · 单个维度特别突出（如陷阱密度很高）→ 至少向上浮动一档内位置
   最终给出一个精细 D 值；不要趋同、不要总取中间；D 必须落在本档区间内
■ P（§4.4 连续 0~1）：过程与正确答案的距离，**P 本身编码对错**（无独立对错字段）——完全正确且答案对=1.0；选填对=1.0、错=0；解答答案错但过程几乎完整=0.8~0.95；中途偏航但思路对=0.4~0.7；只有思路无结果=0.2~0.3；空白/完全跑偏=0。P<0.5 视为答得不好，P≥0.5 视为基本答对；归因：P<0.5 才给，P≥0.5 给 null，不编造
`;

// ============ 单题判定 ============
async function judgeQuestion(question, ragContext) {
  const ragSection = ragContext ? `\n\n【历史参考（仅供参考不强制）】\n${ragContext}` : '';
  // isRecallQuestion 字段保留输出（未来报告/统计可用），当前掌握度逻辑不再区分回忆/应用（2026-08-14 K 整题更新）
  const userMsg = `输入是一道题的视觉转录上下文（题目文本 + 整图痕迹，可能含转录误差）。对这道题做四件事：

第一步【学生视角感受难度】：模拟一个对应水平的高中生真实解题体验——先注意到什么、第一次卡在哪、卡住时缺的是什么、思维需要几次跳跃（每次难不难）、试错成本多高。重点是【体验难度】，不是拆步骤、不是证明。

第二步【判定作答 + 对照标尺判档】：基于学生视角体验对照 L1-L11 标尺判档（档位边界卡+例子锚+新定义补充+5维锁定），同时判定对错/作答质量。

第三步【题型归类】：把本题归入中粒度题型，输出题型三层结构 {domain, pattern, variant}。pattern 是【题型描述】（能概括一类同类题，如"含参不等式恒成立求参数范围""分离参数求最值"），不是知识点名也不是题目原文；domain 是【知识板块】（如"函数""集合"）；variant 是【变体细节】只进语义不进检索。

第四步【过程分段】：把学生作答过程按书写顺序切成若干段（仅解答题），逐段标记；选填题（选择/填空）无过程，segments 直接给空数组。

只输出 JSON：
{"index":1,"questionText":"","questionType":"选择|填空|解答|其他","questionCategory":"","level":"L1~L11","D":0~1,"correctAnswer":"","P":0~1,"eta":0.4~1.0|null,"r":null,"errorAttribution":null|"","knowledgeNodeName":"题目考察的核心知识点名称（教材术语，如'函数的单调性'）","fiveDim":{"K":0.5,"A":0.5,"T":0.5,"Q":0.5,"S":0.5},"isRecallQuestion":true,"isOutOfSyllabus":false,"errorDimension":null,"knowledgeUsage":[{"name":"知识点教材术语","P":0|0.5|1,"D":0~1}],"pattern":{"domain":"知识板块","pattern":"中粒度题型描述（同类题共用）","variant":"变体细节"},"segments":[{"step":"段内容摘要","status":"通|断|空白","evidence":"该段过程原文片段"}],"breakpoint":{"index":2,"nature":"起步即停|中途断|收尾断"},"processAvailable":true}
约束：D 落在 level 区间（D 是题目固有难度，与学生熟练度无关）；knowledgeNodeName 必须用教材术语原词；fiveDim 是【能力五维】（K知识储备/A分析推理/T技巧熟练/Q思维品质/S学习状态，各 0~1 连续值，对齐理论文档五维量纲；0 最低 1 最高）；isRecallQuestion 是【回忆类题标记】：默写公式/复述定义/判断对错=回忆类（true），解题应用=应用类（false）；isOutOfSyllabus 是【超纲标记】：超出高中课标范围才 true，默认 false；errorDimension 是【错题归因维度】：判错时归因 K=概念/公式/定义掌握问题、A=思路/变式/应用问题、T=跨单元迁移问题、S=计算/审题/执行失误，做对时 null；errorAttribution 是【错因一句话描述】（如"分类讨论遗漏B={-2}情形"），只写文本描述；knowledgeUsage 是【本题知识点使用清单】1~5 个：列出本题实际调用的知识点（含知识层/思想方法层），name 用教材术语原词，D=该知识点环节在本题的难度（0~1，与整题 D 无关），P=该知识点环节的作答质量三档（决策 026）：1=用对；0.5=用了但漏边界/不完整（如漏特殊值验证、多选漏特殊情况、知识边界掌握不清）；0=该环节缺失或全错。0.5 的判定看该知识点自身——涉及边界/陷阱/分类讨论的环节，漏了特殊情形给 0.5；环节根本没做给 0；pattern 是【题型三层结构】：domain 知识板块、pattern 中粒度题型（检索主键，必须能概括同类题，禁止用题目原文或知识点名）、variant 变体细节；segments 是【过程分段】（仅解答题）：按书写顺序把学生过程切成 N 段，每段 step=段内容摘要、status=通|断|空白、evidence=该段过程原文片段（引用转录原话，禁止编造）；breakpoint 是【断点】：{index 断点所在段号（1 起），nature=起步即停|中途断|收尾断}，没断（全通）给 null；processAvailable 是【过程可信标记】：转录清晰可引用过程=true，涂改乱/看不清/过程缺失=false。【选填题（选择/填空）无过程】：segments=[]、breakpoint=null、processAvailable=false；最后输出纯 JSON`;
  const data = await postJSON(`${DS_BASE_URL}/chat/completions`, {
    model: DS_MODEL,
    thinking: { type: 'disabled' },       // 决策 023：thinking 开 + 难题 = content 空死锁，判档用 disabled
    temperature: 0.2,                      // 决策 023：低温稳定档位
    messages: [
      { role: 'system', content: '你是严谨的数学诊断推理引擎。先学生视角感受难度，再对照 L1-L11 标尺判档，最后判定作答。输出纯 JSON。' },
      { role: 'user', content: userMsg + '\n\n===== L1-L11 标尺 =====\n' + RUBRIC_V2 + ragSection + '\n\n===== 本题上下文 =====\n题目：' + question.questionText + '\n\n【学生作答痕迹（仅用于判定对错/P/η/归因，严禁用于评估难度——难度是题目固有属性，与作答过程无关）】\n' + (question.traceReport || '').slice(0, 1500) },
    ],
    max_tokens: 8000,
  }, DS_API_KEY);
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
  return JSON.parse(content.slice(start, end + 1));
}

// ============ 主入口 ============
exports.main = async (event) => {
  try {
    const wxContext = cloud.getWXContext();
    // 身份：小程序调用 OPENID 必有；云函数互调/测试场景（MCP invoke）OPENID 为空，用调用方显式传入的 userId
    const openid = wxContext.OPENID || (event && event.userId) || null;
    if (!openid) return fail(401, '未登录');

    const { action } = event;
    // ===== 复核接口（一次复核/二次复核共用） =====
    if (action === 'listQuestions') {
      const { batchId } = event;
      if (!batchId) return fail(400, '缺少批次ID');
      const batchRes = await db.collection('batches').doc(batchId).get().catch(() => null);
      if (!batchRes || !batchRes.data || batchRes.data.userId !== openid) return fail(403, '无权操作他人批次');
      const qs = await db.collection('questions').where({ batchId, userId: openid }).limit(30).get();
      return success(qs.data.map((q) => ({
        questionId: q._id, questionText: q.questionText || '', studentAnswer: q.studentAnswer || '',
        traceReport: q.traceReport || '', status: q.status || 'pending',
        reviewed: !!q.reviewed,
        // 二次复核参数（judge 后）
        questionType: q.questionType || '', questionCategory: q.questionCategory || '',
        difficultyLevel: q.difficultyLevel || '', difficultyValue: q.difficultyValue != null ? q.difficultyValue : null,
        isCorrect: q.isCorrect === undefined ? null : q.isCorrect, P: q.processScore != null ? q.processScore : null,
        eta: q.pathQuality != null ? q.pathQuality : null, errorAttribution: q.errorAttribution || null,
        knowledgeNodeName: q.knowledgeNodeName || '', fiveDim: q.fiveDim || null,
      })));
    }
    if (action === 'updateTranscription') {
      const { questionId, questionText, studentAnswer, traceReport } = event;
      if (!questionId) return fail(400, '缺少题目ID');
      const qRes = await db.collection('questions').doc(questionId).get().catch(() => null);
      if (!qRes || !qRes.data || qRes.data.userId !== openid) return fail(403, '无权操作他人题目');
      const patch = {};
      if (typeof questionText === 'string' && questionText.trim()) patch.questionText = questionText.trim();
      if (typeof studentAnswer === 'string') patch.studentAnswer = studentAnswer.trim();
      if (typeof traceReport === 'string') patch.traceReport = traceReport.trim();
      patch.transcriptionReviewed = true;
      await db.collection('questions').doc(questionId).update({ data: patch });
      return success({ questionId });
    }

    // 白话改写：学生用自然语言说明要改什么 → AI 更新题干/最终作答/过程（默认信任学生，不做防作弊）
    if (action === 'reviseByNaturalLanguage') {
      const { questionId, instruction } = event;
      if (!questionId) return fail(400, '缺少题目ID');
      const note = (instruction || '').trim();
      if (!note) return fail(400, '请用一句话说明要改什么');
      if (note.length > 500) return fail(400, '说明太长，请精简到 500 字内');

      const qRes = await db.collection('questions').doc(questionId).get().catch(() => null);
      if (!qRes || !qRes.data || qRes.data.userId !== openid) return fail(403, '无权操作他人题目');
      const q = qRes.data;

      // 允许前端把弹层里尚未保存的草稿一并传入，否则用库里的值
      const curText = (typeof event.questionText === 'string' ? event.questionText : q.questionText) || '';
      const curAnswer = (typeof event.studentAnswer === 'string' ? event.studentAnswer : q.studentAnswer) || '';
      const curTrace = (typeof event.traceReport === 'string' ? event.traceReport : q.traceReport) || '';

      if (!DS_API_KEY) return fail(500, '未配置模型密钥');

      const data = await postJSON(`${DS_BASE_URL}/chat/completions`, {
        model: DS_MODEL,
        thinking: { type: 'disabled' },
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              '你是题目转录修正助手。学生看不懂或不会改 LaTeX，会用大白话说明要改哪里。' +
              '根据「当前内容」和「学生说明」输出修正后的三个字段。' +
              '规则：① 只改学生明确提到的地方，其他保持原样；② 默认信任学生的修正，不做防作弊；' +
              '③ 公式尽量写成 $...$ 或 $$...$$；④ 最终作答保持简短（如 A、x=1/2）；⑤ 只输出 JSON，不要解释。',
          },
          {
            role: 'user',
            content:
              '【当前题目】\n' + curText.slice(0, 2000) +
              '\n\n【当前最终作答】\n' + curAnswer.slice(0, 200) +
              '\n\n【当前做题过程】\n' + curTrace.slice(0, 2000) +
              '\n\n【学生说明（要改什么）】\n' + note +
              '\n\n输出：{"questionText":"...","studentAnswer":"...","traceReport":"..."}',
          },
        ],
        max_tokens: 4000,
      }, DS_API_KEY);

      const msg = data.choices && data.choices[0] && data.choices[0].message;
      const content = (msg && (msg.content || msg.reasoning_content)) || '';
      const end = content.lastIndexOf('}');
      if (end < 0) return fail(500, '改写结果解析失败');
      let depth = 0, start = -1;
      for (let i = end; i >= 0; i--) {
        const ch = content[i];
        if (ch === '}') depth++;
        else if (ch === '{') {
          depth--;
          if (depth === 0) { start = i; break; }
        }
      }
      if (start < 0) return fail(500, '改写结果定位失败');
      let parsed;
      try {
        parsed = JSON.parse(content.slice(start, end + 1));
      } catch (e) {
        return fail(500, '改写 JSON 无效');
      }

      const questionText = typeof parsed.questionText === 'string' ? parsed.questionText.trim() : curText.trim();
      const studentAnswer = typeof parsed.studentAnswer === 'string' ? parsed.studentAnswer.trim() : curAnswer.trim();
      const traceReport = typeof parsed.traceReport === 'string' ? parsed.traceReport.trim() : curTrace.trim();
      if (!questionText) return fail(500, '改写后题目为空');

      // 只返回草稿，不直接落库——让学生在弹层确认后再点保存（仍走 updateTranscription）
      return success({ questionText, studentAnswer, traceReport });
    }

    if (action === 'updateParams') {
      const { questionId, params } = event;
      if (!questionId || !params) return fail(400, '缺少参数');
      const qRes = await db.collection('questions').doc(questionId).get().catch(() => null);
      if (!qRes || !qRes.data || qRes.data.userId !== openid) return fail(403, '无权操作他人题目');
      const patch = {};
      if (params.difficultyLevel) patch.difficultyLevel = params.difficultyLevel;
      if (params.difficultyValue != null) patch.difficultyValue = params.difficultyValue;
      if (params.knowledgeNodeName) patch.knowledgeNodeName = params.knowledgeNodeName;
      if (params.fiveDim) patch.fiveDim = params.fiveDim;
      if (params.isCorrect !== undefined) patch.isCorrect = params.isCorrect;
      patch.paramsReviewed = true;
      await db.collection('questions').doc(questionId).update({ data: patch });
      // 掌握度迁移（#8）：改了知识点名 → 把这条题的贡献从旧节点移到新节点（try/catch 不阻断复核保存）
      try {
        const newName = (params.knowledgeNodeName || '').trim();
        const oldName = (qRes.data.knowledgeNodeName || '').trim();
        if (newName && newName !== oldName) {
          await migrateProgress(openid, oldName, newName,
            qRes.data.difficultyValue, qRes.data.processScore);
        }
      } catch (e) {
        console.error('[judgeOne] 掌握度迁移失败:', e);
      }
      return success({ questionId });
    }

    // ===== 默认：单题判定 =====
    const { questionId } = event;
    if (!questionId) return fail(400, '缺少题目ID');

    // 归属校验
    const qRes = await db.collection('questions').doc(questionId).get().catch(() => null);
    if (!qRes || !qRes.data) return fail(404, '题目不存在');
    if (qRes.data.userId !== openid) return fail(403, '无权操作他人题目');
    const question = qRes.data;

    // 判定（含 RAG 历史注入）
    const historyHits = await searchHistory(question.questionText, openid);
    const ragContext = buildRagContext(historyHits);
    const raw = await judgeQuestion(question, ragContext);

    const questionType = raw.questionType || question.questionType || '其他';
    const clamped = clampParams(raw, questionType);

    // P 由 AI 直接输出（连续 0~1），对错语义由 P 编码，无需独立钳制

    // 更新题目
    await db.collection('questions').doc(questionId).update({
      data: {
        questionType,
        correctAnswer: raw.correctAnswer || '',
        questionCategory: raw.questionCategory || '无法归类',
        difficultyLevel: raw.level || 'L4',
        difficultyValue: clamped.D,
        processScore: clamped.P,
        pathQuality: clamped.eta,
        errorAttribution: raw.errorAttribution || null,
        knowledgeNodeName: raw.knowledgeNodeName || '',
        fiveDim: raw.fiveDim || null,
        // 报告数据输入（2026-08-17）：分段路径/断点/过程可信；选填题 segments=[] breakpoint=null processAvailable=false
        segments: Array.isArray(raw.segments) ? raw.segments : [],
        breakpoint: raw.breakpoint || null,
        processAvailable: raw.processAvailable === true,
        reviewed: true,
      },
    });

    // 掌握度更新（决策 026：K 知识点粒度 + A 单元级）——独立函数 updateMastery.js
    const mastery = await updateMastery({
      db, matchKnowledgeNode, findNode, unitNameOf,
      openid, questionId, question, raw, clamped,
    });
    let mainNodeId = mastery.mainNodeId;   // RAG 记录写入需要
    let pOk = mastery.pOk;


    // ============ RAG 记录入库（检索源，algorithm=diagnose_v1）——判定成功即写，失败降级不报错 ============
    // 契约：doc/architecture/RAG工具契约.md 第五节；embedding 失败时记录仍写（检索自动跳过无向量记录）
    try {
      // 题型三层结构（D-18）：pattern 是中粒度题型，检索主键；模型未输出/输出异常时降级为空
      const rawPattern = (raw.pattern && typeof raw.pattern === 'object') ? raw.pattern : {};
      const patternText = ((rawPattern.pattern || '').trim() || '').slice(0, 80);
      const patternFull = [rawPattern.domain, rawPattern.pattern, rawPattern.variant]
        .filter((s) => s && typeof s === 'string' && s.trim())
        .map((s) => s.trim()).join(' / ').slice(0, 120);
      const ragReportText = buildReportText({
        questionText: question.questionText || '',
        studentAnswer: (question.traceReport || '').slice(0, 300),
        isCorrect: pOk,
        questionCategory: patternText || raw.questionCategory || question.questionType || '',
        difficultyLevel: raw.level || 'L4',
        knowledgeNodeId: mainNodeId || '',
        knowledgeNodeName: (raw.knowledgeNodeName || '').trim(),
        errorAttribution: raw.errorAttribution || null,
        errorDimension: raw.errorDimension || null,
        breakpoint: raw.breakpoint || null,
        knowledgeUsage: Array.isArray(raw.knowledgeUsage) ? raw.knowledgeUsage : [],
      });
      let embedding = null;
      let patternEmbedding = null;
      try {
        embedding = await embedText(ragReportText);
        if (patternFull) patternEmbedding = await embedText(patternFull);
      } catch (e) {
        console.warn('[judgeOne] RAG embed failed:', e.message);
      }
      await db.collection('mastery_logs').add({
        data: {
          _openid: openid,
          userId: openid,
          questionId,
          knowledgeNodeId: mainNodeId || null,
          knowledgeNodeName: (raw.knowledgeNodeName || '').trim() || null,
          algorithm: 'diagnose_v1',
          isCorrect: pOk,
          processScore: Number(clamped.P) || 0,
          difficultyValue: Number(clamped.D) || 0,
          errorAttribution: raw.errorAttribution || null,
          errorDimension: raw.errorDimension || null,
          segments: Array.isArray(raw.segments) ? raw.segments : [],
          breakpoint: raw.breakpoint || null,
          knowledgeUsage: Array.isArray(raw.knowledgeUsage) ? raw.knowledgeUsage : [],
          processAvailable: raw.processAvailable === true,
          pattern: patternFull || null,
          report: {
            questionText: question.questionText || '',
            isCorrect: pOk,
            knowledgeNodeName: (raw.knowledgeNodeName || '').trim() || null,
            errorAttribution: raw.errorAttribution || null,
            errorDimension: raw.errorDimension || null,
            segments: Array.isArray(raw.segments) ? raw.segments : [],
            breakpoint: raw.breakpoint || null,
            knowledgeUsage: Array.isArray(raw.knowledgeUsage) ? raw.knowledgeUsage : [],
            processAvailable: raw.processAvailable === true,
          },
          reportText: ragReportText,
          embedding,
          patternEmbedding,
          createdAt: db.serverDate(),
        },
      });
    } catch (e) {
      console.warn('[judgeOne] mastery_logs RAG 记录写入失败（判定已更新，降级）:', e.message);
    }

    // 更新批次进度；最后一题判完 → completed
    try {
      const batchRes = await db.collection('batches').doc(question.batchId).get();
      if (batchRes.data) {
        const done = (batchRes.data.progress && batchRes.data.progress.done || 0) + 1;
        const total = batchRes.data.progress ? batchRes.data.progress.total : 0;
        await db.collection('batches').doc(question.batchId).update({
          data: { progress: { done, total } },
        });
        if (total > 0 && done >= total) {
          await db.collection('batches').doc(question.batchId).update({
            data: { status: 'completed', completedAt: db.serverDate() },
          });
        }
      }
    } catch (e) {
      console.warn('[judgeOne] batch progress update failed:', e.message);
    }

    return success({
      questionId,
      newDiagnosis: {
        correctAnswer: raw.correctAnswer || '',
        questionCategory: raw.questionCategory || '无法归类',
        difficultyLevel: raw.level || 'L4',
        difficultyValue: clamped.D,
        processScore: clamped.P,
        pathQuality: clamped.eta,
        knowledgeNodeName: raw.knowledgeNodeName || '',
        fiveDim: raw.fiveDim || null,
        // 报告数据输入（2026-08-17）
        segments: Array.isArray(raw.segments) ? raw.segments : [],
        breakpoint: raw.breakpoint || null,
        processAvailable: raw.processAvailable === true,
      },
    });
  } catch (e) {
    console.error('[judgeOne] error:', e);
    return fail(500, '判定失败，请重试');
  }
};
