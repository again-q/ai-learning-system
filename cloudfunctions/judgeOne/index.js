const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

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

// 知识节点匹配：先精确（name 全等），失败则子串容错（AI 常输出句子式描述，取最长命中的节点名=最具体）
async function matchKnowledgeNode(kName) {
  const nodes = await loadNodes();
  let nodeId = null, bestLen = 0;
  for (const n of nodes) {
    const nm = n.name || '';
    if (!nm) continue;
    if (nm === kName) return n.knowledgeId;
    if (kName.includes(nm) && nm.length > bestLen) { bestLen = nm.length; nodeId = n.knowledgeId; }
  }
  return nodeId;
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
  return `题目：${report.questionText || ''} | 作答：${report.studentAnswer || ''} | 判定：${report.isCorrect ? '对' : '错'} | 题型：${report.questionCategory || ''} | 难度：${report.difficultyLevel || ''} | 知识点：${report.knowledgeNodeId || ''}`;
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
  const userMsg = `输入是一道题的视觉转录上下文（题目文本 + 整图痕迹，可能含转录误差）。对这道题做两件事：

第一步【学生视角感受难度】：模拟一个对应水平的高中生真实解题体验——先注意到什么、第一次卡在哪、卡住时缺的是什么、思维需要几次跳跃（每次难不难）、试错成本多高。重点是【体验难度】，不是拆步骤、不是证明。

第二步【判定作答 + 对照标尺判档】：基于学生视角体验对照 L1-L11 标尺判档（档位边界卡+例子锚+新定义补充+5维锁定），同时判定对错/作答质量。

只输出 JSON：
{"index":1,"questionText":"","questionType":"选择|填空|解答|其他","questionCategory":"","level":"L1~L11","D":0~1,"correctAnswer":"","P":0~1,"eta":0.4~1.0|null,"r":null,"errorAttribution":null|"","knowledgeNodeName":"题目考察的核心知识点名称（教材术语，如'函数的单调性'）","fiveDim":{"K":0.5,"A":0.5,"T":0.5,"Q":0.5,"S":0.5},"isRecallQuestion":true,"isOutOfSyllabus":false,"errorDimension":null,"knowledgeUsage":[{"name":"知识点教材术语","correct":true|false,"D":0~1}]}
约束：D 落在 level 区间（D 是题目固有难度，与学生熟练度无关）；knowledgeNodeName 必须用教材术语原词；fiveDim 是【能力五维】（K知识储备/A分析推理/T技巧熟练/Q思维品质/S学习状态，各 0~1 连续值，对齐理论文档五维量纲；0 最低 1 最高）；isRecallQuestion 是【回忆类题标记】：默写公式/复述定义/判断对错=回忆类（true），解题应用=应用类（false）；isOutOfSyllabus 是【超纲标记】：超出高中课标范围才 true，默认 false；errorDimension 是【错题归因维度】：判错时归因 K=概念/公式/定义掌握问题、A=思路/变式/应用问题、T=跨单元迁移问题、S=计算/审题/执行失误，做对时 null；errorAttribution 是【错因一句话描述】（如"分类讨论遗漏B={-2}情形"），只写文本描述；knowledgeUsage 是【本题知识点使用清单】1~5 个：列出本题实际调用的知识点，name 用教材术语原词，correct=该知识点是否被正确使用，D=该知识点环节在本题的难度（0~1，与整题 D 无关）；最后输出纯 JSON`;
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
    const openid = wxContext.OPENID;
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
      const { questionId, questionText, studentAnswer } = event;
      if (!questionId) return fail(400, '缺少题目ID');
      const qRes = await db.collection('questions').doc(questionId).get().catch(() => null);
      if (!qRes || !qRes.data || qRes.data.userId !== openid) return fail(403, '无权操作他人题目');
      const patch = {};
      if (typeof questionText === 'string' && questionText.trim()) patch.questionText = questionText.trim();
      if (typeof studentAnswer === 'string') patch.studentAnswer = studentAnswer.trim();
      patch.transcriptionReviewed = true;
      await db.collection('questions').doc(questionId).update({ data: patch });
      return success({ questionId });
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
        reviewed: true,
      },
    });

    // 报告 + embedding 入库（RAG 自增强）——本阶段「报告先不输出」，后续报告功能恢复时再打开
    // const report = {...}; const reportText = buildReportText(report); mastery_logs.add(...)

    // 掌握度更新（2026-08-14 简化版：K=整题加权得分法 S_k/D_k；A=能力指数 E=D×η）
    // 开关：USE_KNOWLEDGE_USAGE=false 时走最简版（K 用整题 D×P，A 不做归因分流）；
    //       true 时恢复知识点剥离（knowledgeUsage）与归因分流（errorDimension）——功能保留，暂时不跑
    try {
      const USE_KNOWLEDGE_USAGE = false;   // 2026-08-14 用户：剥离/归因暂时不跑，先验证 D/P 参数
      const pOk = clamped.P >= 0.5;   // P 编码对错：P≥0.5 视为基本答对（isCorrect 已删除 2026-08-14）
      const isOut = raw.isOutOfSyllabus === true;
      const eta = clamped.eta;   // 仅解答题 0.4~1.0，选择/填空 null

      // 主知识点定位（matchKnowledgeNode：模块级独立函数，精确 → 子串最长）
      const mainNodeId = await matchKnowledgeNode((raw.knowledgeNodeName || '').trim());
      const upsertProgress = async (nodeId, patch) => {
        const pRes = await db.collection('knowledge_progress')
          .where({ userId: openid, knowledgeNodeId: nodeId }).limit(1).get();
        if (pRes.data.length) {
          await db.collection('knowledge_progress').doc(pRes.data[0]._id).update({ data: patch });
        } else {
          await db.collection('knowledge_progress').add({ data: { userId: openid, knowledgeNodeId: nodeId, ...patch } });
        }
      };

      // ---- K 维度（§4.4 加权得分法：S_k = Σ(D×P)，D_k = ΣD，mastery = S_k/D_k）----
      // 最简版：整题 D×P 挂在主知识点；超纲且判错 → 跳过（文档：超纲做错不降）
      if (mainNodeId && !(isOut && !pOk)) {
        const D = Number(clamped.D) || 0;
        const P = Number(clamped.P) || 0;
        const pRes = await db.collection('knowledge_progress')
          .where({ userId: openid, knowledgeNodeId: mainNodeId }).limit(1).get();
        const old = pRes.data[0] || {};
        const S = (old.sValue || 0) + D * P;
        const Dsum = (old.dValue || 0) + D;
        const newMastery = Dsum > 0 ? Math.round((S / Dsum) * 100) / 100 : 0;
        await upsertProgress(mainNodeId, {
          sValue: Math.round(S * 10000) / 10000,
          dValue: Math.round(Dsum * 10000) / 10000,
          mastery: newMastery,
          attempts: (old.attempts || 0) + 1,
          correctCount: (old.correctCount || 0) + (pOk ? 1 : 0),
          lastUpdated: db.serverDate(),
        });
        // mastery_logs 追加写（#5 三集合架构补写 2026-08-14）：每次 K 更新记一笔，支持趋势/重算
        try {
          await db.collection('mastery_logs').add({
            data: {
              userId: openid,
              knowledgeNodeId: mainNodeId,
              triggerQuestionId: questionId,
              oldMastery: old.mastery != null ? old.mastery : null,
              newMastery,
              algorithm: 'weighted_score_v1',
              createdAt: db.serverDate(),
            },
          });
        } catch (e) {
          console.warn('[judgeOne] mastery_logs 写入失败:', e.message);
        }
      }

      // ---- K 剥离版（暂不跑，USE_KNOWLEDGE_USAGE=true 时启用）----
      if (USE_KNOWLEDGE_USAGE && !(isOut && !pOk)) {
        const usage = Array.isArray(raw.knowledgeUsage) ? raw.knowledgeUsage : [];
        for (const u of usage) {
          const uName = (u.name || '').trim();
          if (!uName) continue;
          const nodeId = await matchKnowledgeNode(uName);
          if (!nodeId) continue;
          const Dkp = Math.min(1, Math.max(0, Number(u.D) || 0));
          const Pkp = u.correct === true ? 1 : 0;
          const pRes = await db.collection('knowledge_progress')
            .where({ userId: openid, knowledgeNodeId: nodeId }).limit(1).get();
          const old = pRes.data[0] || {};
          const S = (old.sValue || 0) + Dkp * Pkp;
          const Dsum = (old.dValue || 0) + Dkp;
          await upsertProgress(nodeId, {
            sValue: Math.round(S * 10000) / 10000,
            dValue: Math.round(Dsum * 10000) / 10000,
            mastery: Dsum > 0 ? Math.round((S / Dsum) * 100) / 100 : 0,
            attempts: (old.attempts || 0) + 1,
            correctCount: (old.correctCount || 0) + Pkp,
            lastUpdated: db.serverDate(),
          });
        }
      }

      // ---- A 维度（§5.5 能力指数：E = D×η；ΔA = 0.25×E×(U−A)）----
      if (eta != null && eta >= 0.4 && mainNodeId) {
        const D = Number(clamped.D) || 0;
        // 最简版：E 方向由 P 映射（P≥0.5 正刺激 / P<0.5 负刺激），E = D×η×(2P−1)；归因分流保留在开关分支
        let eff = D * eta * (2 * Number(clamped.P) - 1);
        if (USE_KNOWLEDGE_USAGE) {
          // 归因分流（暂不跑）：错题归因 K/S → E=0；errorDimension 缺失时回退关键词判断
          const dim = raw.errorDimension;
          const isKS = !pOk && (dim === 'K' || dim === 'S'
            || (!dim && /概念|定义|公式|记错|遗忘|知识/.test(raw.errorAttribution || '')));
          if (isKS) eff = 0;
        }
        if (eff !== 0) {
          const pRes = await db.collection('knowledge_progress')
            .where({ userId: openid, knowledgeNodeId: mainNodeId }).limit(1).get();
          const old = pRes.data[0] || {};
          let A = old.aValue != null ? old.aValue : 0.3;
          let U = old.aUpper != null ? old.aUpper : 0.5;
          // U 上浮：本质解法（η≥0.7）+ 鉴别力足够（E≥0.5）
          if (eff >= 0.5 && eta >= 0.7) U += 0.05 * (1 - U);
          // U 下浮：连续 5 题低路径质量（暴力计算挤压虚假上限）
          let streak = old.lowEtaStreak || 0;
          if (eta <= 0.6) {
            streak += 1;
            if (streak >= 5) { U -= 0.03 * (U - A); streak = 0; }
          } else streak = 0;
          const dA = 0.25 * Math.abs(eff) * (U - A);
          A = eff > 0 ? Math.min(A + dA, U) : Math.max(A - dA, 0);
          await upsertProgress(mainNodeId, {
            aValue: Math.round(A * 100) / 100,
            aUpper: Math.round(U * 100) / 100,
            lowEtaStreak: streak,
            lastUpdated: db.serverDate(),
          });
        }
      }
    } catch (e) {
      console.error('[judgeOne] 掌握度更新失败:', e);
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
      },
    });
  } catch (e) {
    console.error('[judgeOne] error:', e);
    return fail(500, '判定失败，请重试');
  }
};
