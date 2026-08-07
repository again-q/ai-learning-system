# 规范重整复盘

> 项目第一次系统性规范性文件审查与整理
> 日期：2026-07-14
> 状态：完成

---

## 背景

项目从理论探索阶段（五维框架 + 知识图谱构建）进入工程落地阶段后，规范性文件的问题开始暴露。理论阶段的目标是"跑通思路"，文档以探索笔记为主，重内容轻形式。进入工程阶段后，多人（多 AI 会话）协作、云函数开发、小程序联调成为常态，文档结构的混乱开始拖累效率。

触发这次重整的具体场景是：一次新会话启动后，根目录 13 个文档文件无法快速定位入口，AI 花了大量时间判断"该读哪篇"而非"该做什么"。

---

## 诊断出的问题

### 1. 根目录文档散落

根目录堆积了 13 个 Markdown 文档，涵盖理论、规范、路线图、架构决策、AI 协作指引等不同用途。新人（或新 AI 会话）打开项目，第一眼看到的不是项目入口，而是一份无从下手的文件列表。业界常规做法是 `doc/` 统一管理、根目录只保留 `README.md` 和少数配置文件。

### 2. 知识图谱 schema 漂移

知识图谱节点 JSON 存在至少 6 种不同的结构变体：

| 范围 | 字段命名 | 结构特点 |
|------|---------|---------|
| ch1–ch4 节点 | `knowledge_id` | 嵌套 `basic/tree/concept/relations/importance` 五段式 |
| ch5 节点 | `id` | 扁平 `id/title/description/keywords` 字段 |
| knowledge_index.json | `section_id/node_ids` | 引用 `node_ids` 数组，与节点文件松散耦合 |
| 规范文档中示例 | 混合写法 | 含 `level` 在 `basic` 内，与 ch1–4 实际格式不同 |
| 归档版本 (K-dimension-final) | 另一种结构 | 旧版 schema，已废弃 |
| 归档版本 (K-dimension-final-v2) | 又一种结构 | 再迭代版，也已废弃 |

这不是"迭代演进"的正常痕迹——同一目录下不同章节用不同 schema，说明构建过程缺少集中管控。

### 3. 云函数无统一返回格式

三个云函数（manageKnowledge、userLogin、quickstartFunctions）各用一套返回约定：

| 云函数 | 成功返回 | 错误返回 | 风格 |
|--------|---------|---------|------|
| manageKnowledge | `{ code: 0, data: ... }` | `{ code: -1, message: ... }` | code + data |
| userLogin | `{ code: 0, data: ... }` | `{ code: -1, message: ... }` | code + data |
| quickstartFunctions | `{ success: true/false }` 或 `{ success: true, data: ... }` 或 `{ success: false, errMsg: ... }` | `success` 布尔值 |

前两个格式接近但不完全一致，第三个完全是另一套规范。前端对接时每个函数都要单独适配。

### 4. 文档面向 AI 不面向人

大部分文档是"给 AI 的笔记"，缺少新人上手入口。`README.md` 没有说明"这是什么项目、怎么开始"；目录结构、技术栈、本地开发流程等关键信息散落在多个文档中。对不熟悉上下文的人来说，项目没有清晰的入口点。

### 5. 废弃文件与当前文件混在一起

`specs/` 目录下的旧版本（K-dimension-final.md、K-dimension-final-v2.md）没有过期标记或归档说明，容易让新会话误读。和当前生效的文档混在一起，增加了认知负担。

---

## 做了什么

### 1. 根目录文档整理归入 `doc/`

将根目录的 7 个文档归入 `doc/` 各子目录：

| 原位置 | 目标位置 | 归属分类 |
|--------|---------|---------|
| `AI协作手册.md` | `doc/reference/` | 参考 / 工作指南 |
| `REVIEW_STRUCTURE.md` | `doc/reference/` | 参考 / 结构自查 |
| `ROADMAP.md` | `doc/reference/` | 参考 / 路线图 |
| `GATE_SUMMARY.md` | `doc/standards/` | 规范 / 门禁系统 |
| （理论文档已归入 theory/） | `doc/theory/` | 理论 / 五维框架 |
| （架构决策已归入 architecture/） | `doc/architecture/` | 架构 / 决策记录 |
| `CLAUDE.md` | 保留根目录 | 每个会话都读 |
| `coding-rules.md` | 保留根目录 | AI 行为规则 |
| `README.md` | 保留根目录 | 项目简介 |

整理后根目录只保留 `README.md`、`CLAUDE.md`、`coding-rules.md` 三个必备文件，其余文档按类别进入 `doc/` 下的 `theory/`、`standards/`、`architecture/`、`reference/`、`archive/`。

`doc/` 目录结构变为：

```
doc/
├── theory/               # 理论文档（五维框架等）
├── standards/            # 设计规范、工程规范
├── architecture/         # 架构决策记录
├── reference/            # 工作指南、路线图、自查报告
├── archive/              # 已废弃的旧版本
├── prompts/              # AI agent 提示词
├── decision-log.md       # 决策日志（按时间线）
├── 知识图谱结构规范.md      # 知识图谱 schema 定义
├── ENGINEERING_TODO.md   # 工程待办
└── granularity_decisions_for_review.md
```

### 2. 废弃文档归档

`specs/` 目录下的旧版本移入 `doc/archive/`，并编写归档说明 `doc/archive/README.md`，标注每个文件的原始位置、被什么文件替代、废弃原因。归档原则：

- 废弃文件只移入此目录，**不删除**
- archive 目录不参与任何开发引用
- 如需恢复某个归档版本，需明确标记版本号并更新归档 README

### 3. 云函数 API 规范文档

新建 `doc/API-GUIDE.md`，定义统一的云函数返回格式：

```
成功：{ code: 0, data: <实际数据> }
失败：{ code: -1, message: "<错误描述>" }
```

- 废弃 `success: true/false` 风格的返回
- 所有云函数统一采用 `code` + `data`/`message` 结构
- 后续新云函数严格遵循此格式，旧云函数逐步改造

---

## 没做的事（和原因）

### 知识图谱 schema 对齐 — 挂起

ch1–ch4 和 ch5 使用了不同的 JSON schema，但当前两者都在使用中。统一 schema 涉及全局替换和验证逻辑调整，需要先与业界知识图谱标准（如 wikidata schema.org 的教育本体）对照，确定最佳实践后再动手。**不应急于在标准尚不确定时做一次性机械替换。**

### 数据库字段定义 — 挂起

当前用户集合字段、节点集合字段散落在云函数代码中，没有统一的数据库 schema 文档。但这涉及五阶段门禁流程讨论——数据库结构变更会影响云函数和前端——不能由一次规范化行动单独决定。后续在 `doc/architecture/` 中补充 ER 图或字段定义文档。

### 入门指南（新人 onboarding） — 暂缓

当前项目没有新人加入计划，写入门指南的投入产出比不高。`AI协作手册.md` 已迁入 `doc/reference/`，可以作为未来入门指南的基础材料。有新人时再整理。

---

## 后续维护建议

### 文档存放规则

- **根目录**只保留 `README.md`、`CLAUDE.md`、`coding-rules.md`
- **新增文档**优先放入 `doc/` 对应子目录
- **理论类** → `doc/theory/`
- **规范类** → `doc/standards/`
- **架构决策类** → `doc/architecture/`
- **参考指南类** → `doc/reference/`
- **提示词类** → `doc/prompts/`
- 不确定分类的，先放 `doc/` 根目录，定期评审归类

### 文档版本标记

每次对文档做实质性更新时，在文件头部（Front Matter 或文档首行注释）同步标记：

```markdown
> 版本：v2
> 最后更新：2026-07-14
> 状态：生效中 | 草稿 | 废弃
```

便于新会话快速判断文档时效性。

### 废弃文档处理

- 不再适用的文档**移入 `doc/archive/`**，不留在原地
- 移入时更新 `doc/archive/README.md`，标注：
  - 原始位置
  - 被什么文件替代
  - 废弃原因
- 归档文件只做参考，不用于任何开发引用

### 云函数返回格式

新云函数严格按照 `doc/API-GUIDE.md` 定义的格式开发。旧云函数改造请见该文档的"遗留改造清单"章节。

---

## 本次重整的边界说明

这次规范重整**不是一次完美的重构**，而是一次"扫清眼前障碍"的工程健康检查。它的目标是：

- ✅ 让新人（新 AI）能在 30 秒内找到该读哪篇文档
- ✅ 废弃文件和当前文件不再混在一起
- ✅ 云函数有了统一的 API 规范可以参考
- ❌ 没有解决 schema 漂移的根本原因（需要流程管控）
- ❌ 没有解决数据库定义缺失的问题（需要跨角色讨论）
- ❌ 没有一键迁移所有遗留代码（逐步改造）

项目目前的理论基础（五维框架 + 知识图谱）已经稳定，工程层正在填充。规范重整的优先级低于核心功能开发，因此这次只做最紧迫的事，不做过度工程。
