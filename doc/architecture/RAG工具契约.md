# RAG 工具契约 v1（ragService 云函数）

> 生成：2026-08-17
> 定位：诊断引擎第三阶段（Flash 诊断 Agent）的 Tool-Use 层。AI 在生成诊断报告前，通过 DeepSeek Function Calling 调用本服务的工具获取检索型数据。
> 关联：`doc/RAG题型检索-测试报告.md`（方案验证）、`doc/architecture/诊断引擎-诊断输出规范v1.md`、`doc/诊断报告-设计讨论记录.md`
> 部署：云函数 `ragService`（独立函数，diagnose/judgeOne/AI教练 共用）

---

## 一、数据分工（工具负责什么）

| 类型 | 内容 | 提供方 | 工具 |
|---|---|---|---|
| ① 分析结论 | 本次答题统计、分段路径、断点、根定位、判定结果 | 上游代码/判定阶段**注入** | 不调工具 |
| ② 检索型 | 历史同类错误、错误模式、历史趋势、知识点状态 | **ragService** | 本文档 4 个工具 |
| ③ 拿不到的 | 工具未配 / 查不到 / 置信度低 | — | 返回空，走降级文案 |

**原则**：
- 工具只返回**数据库事实**，不做归因、不给建议（判断权留给 AI/学生）。
- 检索不到 → 返回空数组/空对象，**不编造**。
- 所有查询限定当前用户（`userId`），不可跨用户读取。

---

## 二、调用方式

### 方式 A：DeepSeek Function Calling（诊断 Agent 主路径）

诊断 Agent 调 DeepSeek 时传 `tools`（schema 见附录，或调 `ragService` 的 `getSchemas` action 动态获取），模型自主决定调哪个工具、传什么参数。代码执行工具后，把结果作为 tool message 回传给模型继续生成。

```
Flash 对话循环：
  ① 系统 prompt（V3 报告生成器）+ 注入的分析结论
  ② 模型 → tool_calls（如 vectorSearch）
  ③ 代码 → wx.cloud.callFunction('ragService', { action, ...args })
  ④ 结果作为 tool message 返回模型
  ⑤ 重复 ②~④ 直到模型不再请求工具 → 生成最终报告
```

### 方式 B：代码直接调用（顺序预取 / 调试）

任何云函数内 `wx.cloud.callFunction({ name: 'ragService', data: { action: 'vectorSearch', ... } })`。

### 统一入口

```
exports.main = async (event) => {
  const { action } = event;
  switch (action) {
    case 'vectorSearch': ...
    case 'getErrorPattern': ...
    case 'getTrend': ...
    case 'getNodeHistory': ...
    case 'getSchemas': return TOOLS_SCHEMA;
  }
}
```

响应统一格式：`{ code: 0, data, message: 'ok' }`；失败 `{ code, data: null, message }`。

---

## 三、工具契约

### ① vectorSearch — 历史同类题诊断报告检索（题型主键，D-19）

**用途**：报告「根因」模块的「历史记录参考」——近 30 天同类题型的历史诊断记录。

**输入**

```json
{
  "query": "AI 生成的题型描述（如：含参不等式恒成立求参数范围），可附当前题目文本",
  "topK": 5,
  "days": 30
}
```

- `query` 必填，**由 AI 先生成题型描述再检索**（不是原始题目文本）；`topK` 默认 5（上限 10）；`days` 默认 30。

**逻辑（D-19：结构化为主 + embedding 辅助）**：
1. query 题型文本 → `text-embedding-v4`
2. 与该用户 `mastery_logs`（createdAt ≥ now−days）记录的 `patternEmbedding` 近邻，**阈值 0.70 切出同类题型**
3. 命中题型内按整题 `embedding`（reportText 向量）排序取 topK；无 pattern 的旧记录回退按整题 embedding 排序（冷启动兼容）

**返回**

```json
{
  "hits": [
    {
      "score": 0.83,
      "patternScore": 0.91,
      "pattern": "函数 / 含参不等式恒成立求参数范围 / 二次函数开口方向讨论",
      "questionText": "题目摘要（reportText 或 questionText 字段）",
      "isCorrect": false,
      "knowledgeNodeId": "math_10_ch3_s2_002",
      "knowledgeNodeName": "集合间的基本关系",
      "errorAttribution": "在Δ=0情形验证时…",
      "errorDimension": "K",
      "segments": [{ "step": "代入条件", "status": "通", "evidence": "…" }],
      "breakpoint": { "index": 2, "nature": "中途断" },
      "knowledgeUsage": [{ "name": "一元二次不等式", "P": 0.5, "D": 0.8 }],
      "processAvailable": true,
      "createdAt": "2026-08-14T08:00:00.000Z"
    }
  ]
}
```

**冷启动**：无数据返回 `{ hits: [] }`。

---

### ② getErrorPattern — 错误模式聚合

**用途**：报告总览「模式列表」+ 主/次模式选择——近 30 天错题按知识点聚合的统计。

**输入**

```json
{
  "days": 30
}
```

**逻辑**：该用户近 days 天 `mastery_logs` 中 `isCorrect=false` 的记录 → 按 `knowledgeNodeId` 聚合 → 输出次数/最近出现/时间线。**标签由 AI（报告生成器）识别，本工具只聚合事实**。

**返回**

```json
{
  "totalWrong": 6,
  "patterns": [
    {
      "knowledgeNodeId": "math_10_ch3_s2_002",
      "knowledgeNodeName": "集合间的基本关系",
      "count": 3,
      "recentDays": 12,
      "lastErrorAttribution": "漏掉 Δ=0 情形的验证",
      "sampleQuestion": "已知 A={x|x²-2x-8=0}…",
      "timeline": ["2026-08-02", "2026-08-14"]
    }
  ]
}
```

**冷启动**：无错题返回 `{ totalWrong: 0, patterns: [] }`。

---

### ③ getTrend — 历史趋势

**用途**：报告总览「趋势」——正确率/掌握度变化方向。

**输入**

```json
{
  "knowledgeNodeId": "可选，不传则全局",
  "days": 30
}
```

**逻辑**：该用户近 days 天 `mastery_logs` 按时间排序。有 `newMastery` 的记录形成掌握度序列；其余记录按 `isCorrect` 算正确率。趋势方向 = 最近一半均值 vs 前一半均值。

**返回**

```json
{
  "trend": "up",
  "lastRate": 0.67,
  "prevRate": 0.5,
  "total": 6,
  "points": [
    { "date": "2026-08-02", "mastery": null, "isCorrect": false },
    { "date": "2026-08-14", "mastery": 0.77, "isCorrect": true }
  ]
}
```

**冷启动**：无记录返回 `{ trend: "none", lastRate: null, prevRate: null, total: 0, points: [] }`。

---

### ④ getNodeHistory — 知识点历史状态

**用途**：报告「根因」模块——该断点知识点的当前掌握度与历史变化。

**输入**

```json
{
  "knowledgeNodeId": "必填",
  "days": 90
}
```

**逻辑**：`knowledge_progress` 取当前掌握度；`mastery_logs` 取该节点历史（newMastery 序列）。

**返回**

```json
{
  "node": {
    "knowledgeNodeId": "math_10_ch3_s2_002",
    "knowledgeNodeName": "集合间的基本关系",
    "mastery": 0.77,
    "attempts": 5,
    "correctCount": 3,
    "lastUpdated": "2026-08-14T08:00:00.000Z"
  },
  "logs": [
    { "date": "2026-08-02", "oldMastery": 0.71, "newMastery": 0.77 }
  ]
}
```

**冷启动**：无记录返回 `{ node: null, logs: [] }`。

---

## 四、数据来源集合

| 集合 | 读 | 写 |
|---|---|---|
| `mastery_logs` | vectorSearch / getErrorPattern / getTrend / getNodeHistory | judgeOne 判定后写入（含 embedding，见五） |
| `knowledge_progress` | getNodeHistory（当前掌握度） | judgeOne K 更新 |
| `questions` | （工具不直接读，信息已进 mastery_logs） | judgeOne 判定 |

## 五、写侧（前置依赖，工具才有数据）

**judgeOne 判定成功后**，必须写入一条 RAG 记录（与 dispute 的 `score_poc` 格式对齐）：

```json
{
  "_openid": "…", "userId": "…", "questionId": "…",
  "knowledgeNodeId": "…", "knowledgeNodeName": "…",
  "algorithm": "diagnose_v1",
  "isCorrect": true,
  "processScore": 0.8,
  "difficultyValue": 0.65,
  "errorAttribution": "…",
  "errorDimension": "K",
  "segments": [{ "step": "段内容摘要", "status": "通|断|空白", "evidence": "过程原文" }],
  "breakpoint": { "index": 2, "nature": "中途断" },
  "knowledgeUsage": [{ "name": "知识点教材术语", "P": 0|0.5|1, "D": 0~1 }],
  "processAvailable": true,
  "pattern": "函数 / 含参不等式恒成立求参数范围 / 二次函数开口方向讨论",   // 题型三层：domain / pattern / variant（D-18，检索主键）
  "reportText": "题目：… | 判定：… | 题型：… | 难度：… | 知识点：… | 归因维度：… | 归因：… | 断点：… | 知识点使用：…",
  "embedding": [ … ],          // reportText 的 text-embedding-v4 向量（同题型内排序用）
  "patternEmbedding": [ … ],   // pattern 文本的向量（题型主键检索用）
  "createdAt": { "$date": … }
}
```

- `embedding` 生成失败 → 记录仍写入（embedding 字段缺省），检索自动跳过无向量记录。
- 写入失败 → 降级不报错（不影响判定主流程，P0-③ 原则）。

## 六、安全边界

- `userId` 一律取自调用方 `getWXContext().OPENID`；云函数互调场景由调用方显式传入自己上下文中的 openid，**工具不信任客户端传入的任意 userId**（防止越权读取他人数据）。
- 本服务只读集合，无任何写操作。

## 七、待办（不在本契约内）

- pattern 层（D-18 中粒度题型）落地后，vectorSearch 检索键升级为 pattern 向量近邻（测试报告第三节 C 路）
- 置信度档位（HIGH/MEDIUM/LOW）随 RAG 数据量积累后校准
- getErrorPattern 的 AI 标签提炼（报告生成器实现时）

---

## 附录：DeepSeek Function Calling schema（getSchemas 返回）

```json
[
  {
    "type": "function",
    "function": {
      "name": "vectorSearch",
      "description": "语义检索该用户近30天历史同类题诊断报告（按题型匹配）。用于报告『历史记录参考』。query 必须是 AI 生成的题型描述（如：含参不等式恒成立求参数范围），可附当前题目文本。",
      "parameters": {
        "type": "object",
        "properties": {
          "query": { "type": "string", "description": "AI 生成的题型描述（同类题共用），可附当前题目文本" },
          "topK": { "type": "integer", "description": "返回条数，默认5，上限10" },
          "days": { "type": "integer", "description": "时间窗口天数，默认30" }
        },
        "required": ["query"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "getErrorPattern",
      "description": "获取该用户近30天错误模式聚合（按知识点统计错题次数、最近出现时间）。用于报告总览的模式列表。",
      "parameters": {
        "type": "object",
        "properties": {
          "days": { "type": "integer", "description": "时间窗口天数，默认30" }
        }
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "getTrend",
      "description": "获取该用户历史正确率/掌握度趋势方向。用于报告总览的趋势判断。",
      "parameters": {
        "type": "object",
        "properties": {
          "knowledgeNodeId": { "type": "string", "description": "可选，指定知识点；不传则全局" },
          "days": { "type": "integer", "description": "时间窗口天数，默认30" }
        }
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "getNodeHistory",
      "description": "获取指定知识点的当前掌握度与历史变化记录。用于报告根因模块。",
      "parameters": {
        "type": "object",
        "properties": {
          "knowledgeNodeId": { "type": "string", "description": "知识点ID，必填" },
          "days": { "type": "integer", "description": "时间窗口天数，默认90" }
        },
        "required": ["knowledgeNodeId"]
      }
    }
  }
]
```
