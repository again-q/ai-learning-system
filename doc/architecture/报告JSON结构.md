# 诊断报告 JSON 结构 v1（reportService 输出契约）

> 生成：2026-08-17
> 定位：V3 报告 Prompt 的**反推产物**——V3 定义报告「长什么样」，本 schema 定义报告「怎么存/怎么传」。前端组件按此 schema 渲染（方案 A：结构化 JSON，支持折叠/按钮/回访交互，Markdown 做不到）。
> 关联：V3 系统 Prompt（用户 449 行稿）、`doc/诊断报告-设计讨论记录.md`（五层结构 + 认知科学依据）、`doc/architecture/诊断方法论指导.md`

---

## 顶层

```json
{
  "overview": { ... },          // 总览（默认展开）
  "weakpoints": [ ... ],        // 薄弱点模块（主模式，每个完整四段式）
  "secondaryPatterns": [ ... ]  // 次模式（仅折叠预览 + 已记录标记）
}
```

## ① overview（总览）

| 字段 | 类型 | 对应 V3 规则 |
|---|---|---|
| dataAnchor | string | 数据锚点：`这次 N 道题做对 M 道，正确率 X%` + 趋势对比 |
| mood | "celebrate" \| "empathize" | 报喜（rate>75% 且 up）\| 共情 |
| moodText | string | 情绪文案（共情后可追加数据支撑的进步肯定） |
| coreHint | string | 核心提示：最值得看的问题一句话 |
| expectedManagement | string | 预期管理（固定结构，当次语境微调） |
| stateCare | string | 状态照顾 |
| patterns | [{name, count, isMain}] | 模式列表（主 + 次，仅名称次数，不展开） |

## ② weakpoints[]（主模式，完整四段式）

每个元素对应 V3「断点 → 根因 → 钩子 → 检验」四个子模块：

```json
{
  "patternId": "p1",
  "name": "主模式名",
  "count": 3,
  "breakpoint": {
    "preview": "2-3 行预览（summary）",
    "processAvailable": true,
    "segments": [{ "step": "段摘要", "status": "通|断|空白", "evidence": "过程原文" }],
    "confirmed": "先确认做对的部分",
    "contradiction": "定位断点 + 暴露矛盾（不写答案）",
    "closing": "收尾（单题/多题句式）"
  },
  "rootcause": {
    "preview": "预览",
    "phenomenon": "现象（指向过程证据）",
    "directCause": "直接原因（具体步骤，不带评价）",
    "sources": ["两种可能来源 1", "两种可能来源 2"],
    "history": [{ "title": "历史题名", "date": "近30天", "similarity": 0.83 }] | null,
    "closing": "结尾（第一次/不是第一次）"
  },
  "hook": {
    "preview": "预览（引出一个关键问题）",
    "questions": ["问题 1", "问题 2", "问题 3"],
    "scaffold": "可选支架（中立）",
    "whyNotAnswer": "为什么我不直接告诉你答案（固定结构）"
  },
  "check": {
    "preview": "预览",
    "suggestions": [
      { "type": "teach", "title": "讲给同学听", "minutes": 5, "why": "为什么这个有用" },
      { "type": "newQuestion", "title": "找一道新的同类题", "why": "为什么这个有用" }
    ],
    "buttons": ["我讲懂了", "我做对了新的同类题"],
    "followUp": "点击后会发生什么"
  },
  "mindPoint": "思维点出（可选，正向绑定过程证据）"
}
```

**字段生成规则（继承 V3）**：
- `preview` 必须 2-3 行、有信息量（禁止「请展开查看」）
- `segments` 引用学生过程原文（evidence 逐字引用，禁止编造）；processAvailable=false 时 segments 降级为基于结果的推测
- `contradiction` 只暴露矛盾，不写最终答案/零点个数/分类结果
- `questions` 3 个左右，递进，不回答
- `sources` 动态生成（根据断点性质），不得对所有错误套同一模板
- `history` 来自 vectorSearch 结果；空则 null（前端显示「如果这是第一次遇到，也没关系」）
- `mindPoint` 禁止「你缺 XX」，只能「你已经在用 X，可以加强」（最多 1 处）

## ③ secondaryPatterns[]（次模式，仅折叠预览）

```json
[{ "name": "次模式名", "count": 2, "preview": "2-3 行预览", "note": "已记录，下次优先处理" }]
```

---

## 与 V3 的映射

| V3（Markdown 结构） | JSON |
|---|---|
| 总览 7 条规则 | overview 各字段 |
| 薄弱点 4 子模块（断点/根因/钩子/检验） | weakpoints[].breakpoint/rootcause/hook/check |
| 多模式处理（主展开/次折叠） | weakpoints[]（主）+ secondaryPatterns[]（次） |
| 完成后按钮 | check.buttons（前端渲染，非报告正文） |
| 降级分支（process_available/history 空） | breakpoint.processAvailable / rootcause.history=null |

## 前端组件映射

```
report-overview  ← overview
report-details   ← weakpoints[]（折叠容器）
report-breakpoint ← weakpoints[].breakpoint
report-rootcause ← weakpoints[].rootcause
report-hook      ← weakpoints[].hook
report-check     ← weakpoints[].check（按钮 → 记录回访）
report-patterns  ← secondaryPatterns
```
