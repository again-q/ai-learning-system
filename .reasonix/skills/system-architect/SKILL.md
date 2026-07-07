---
name: system-architect
description: |
  系统架构设计技能。将 PRD 转化为开发团队可直接实现的架构文档（SAD）和技术栈清单（tech-stack.json）。
  适用场景：
  - 基于 PRD 新建完整架构设计文档
  - 定向升级特定章节（安全/数据库/API）
  - 合并多份架构文档
  - 补充前端/小程序端架构
  - 用户说"改进设计文档"、"安全设计太弱"、"增加区块链章节"、"合并两份文档"时触发
  - 用户提供 PRD 并询问如何实现时触发

  不适用场景（勿触发）：
  - 用户只询问某个技术概念或框架用法（技术问答，不触发）
  - 用户要求直接写代码而没有 PRD 或架构需求（使用 gatekeeper）
  - 用户要求生成任务分解文档（SAD 已有时，使用 task-decomposer）

inputs:
  - name: prd_files
    type: file[]
    path: doc/prd/
    description: prd-writer 生成的 PRD 文档（经 review-expert 评审通过）
    required: true

outputs:
  - name: sad_files
    type: file[]
    path: doc/arch/
    description: |
      架构设计文档（Markdown）+ tech-stack.json：
      - 纯后端：{项目名}_SAD.md + tech-stack.json
      - 含前端/小程序：各端 SAD + 概览（多端时）+ tech-stack.json

allowed-tools:
  write:
    - doc/arch/

---

# 系统架构师

将 PRD 转化为生产级架构文档。输入：`doc/prd/`；输出：`doc/arch/`。

## 参考文件（按需加载）

> 本表为**快速索引**，各文件的详细加载时机以 Step 4 正文说明为准。

| 文件 | 加载时机（概要） |
|------|---------|
| `resources/glossary.md` | **首次触发技能时**加载——核心术语、架构模式术语、技术选型术语、接口设计术语、质量属性术语，全流程保持术语一致性 |
| `templates/doc-template.md` | 生成任何后端 SAD 文档前——文档骨架、25 个章节定义、版本规则 |
| `templates/doc-template.md` PART 1 | 生成 `_SAD_前端.md` 时——Web 前端专属章节（F1-F6）骨架定义 |
| `templates/doc-template.md` PART 2 | 生成 `_SAD_小程序.md` 时——微信小程序专属章节（M1-M6）骨架定义 |
| `templates/tech-stack.md` | 生成 `tech-stack.json` 前——JSON Schema 和字段规则 |
| `resources/reference.md` | 技术选型时（Part 1）；新建设计时（Part 2 NFR）；数据库章节（Part 3）；安全章节（Part 4）；特殊集成（Part 5）；与 task-decomposer 协作时（Part 6） |
| `resources/overlays.md` | Step 2 探测到目标语言后加载——使用对应语言的安全/数据库/技术栈特化规范 |

**选择规则**：
- `templates/doc-template.md` 每次生成后端 SAD 时必加载。
- `templates/doc-template.md` PART 1/PART 2 仅含前端/小程序时加载，使用对应 PART（已合并在同一文件内）。
- `resources/reference.md` 按需加载对应 Part，无需全文读取。
- `resources/overlays.md` 探测到语言后立即加载，贯穿后续所有安全/数据库设计。

## 工作流

### Step 1：模式识别

| 模式 | 触发条件 | 跳转 |
|------|---------|------|
| 新建设计 | 有 PRD，无现有 SAD | → Step 2 |
| 定向升级 | 改进特定章节 | → Step 4（直接执行） |
| 文档合并 | 两份或多份 SAD 需整合 | → Step 4（合并流程） |
| 补充端文档 | 后端 SAD 已有，需补前端/小程序 | → Step 2（仅探测端类型） |

**失败动作**：若无法判断当前模式（如用户描述混淆），主动向用户确认，不得假设模式并继续执行。

---

### Step 2：双探测（新建设计必执行）

**探测 A：端类型**（决定文档拆分方式）

优先级：PRD 概览文档 → PRD 用户界面章节 → 用户对话 → 询问用户

| 端类型 | 输出文件 |
|--------|---------|
| 纯后端 | `{项目名}_SAD.md` |
| 含 Web 前端 | `{项目名}_SAD_后端.md` + `{项目名}_SAD_前端.md` |
| 含微信小程序 | `{项目名}_SAD_后端.md` + `{项目名}_SAD_小程序.md` |
| 多端并存 | 后端 + 各端 + `{项目名}_SAD_概览.md` |

**探测 B：目标语言**（决定加载哪个 Overlay）

优先级：用户明确指定 → PRD 技术约束章节 → 项目根目录特征文件（`pom.xml`/`go.mod`/`package.json`） → 现有 SAD → 询问用户

> ⚠️ **询问后必须等待用户回复**，收到明确答复后才能继续。若用户未回复，不得自行假设语言并继续执行。

两项探测完成后，立即加载 `resources/overlays.md` 对应语言章节，后续所有安全/数据库/技术栈内容均使用该语言特化规范。

**失败动作**：若 PRD 文件不存在或无法读取，立即告知用户文件路径和问题，等待用户确认，不得继续生成。

---

### Step 3：PRD 分析（新建设计）

读取 PRD，识别并记录：
- 核心业务功能和数据实体
- NFR 指标（并发/响应时间/可用性）→ 加载 `resources/reference.md` Part 2 量化
- 安全合规要求（PII 字段、认证模型）
- 特殊集成点（区块链/支付/文件存储）
- 技术约束

有疑问时提出澄清问题，但仅限 PRD 中确实缺失的信息。

**失败动作**：若 PRD 缺失关键信息（如无任何 NFR 描述、端类型不明确），在此步骤提出澄清问题，等待用户补充后再进入 Step 4。

---

### Step 4：架构设计与文档生成

**生成前必须加载：**
- `templates/doc-template.md`（后端/纯后端文档章节骨架）
- `templates/doc-template.md` PART 1（F1-F6，生成 `_SAD_前端.md` 时）
- `templates/doc-template.md` PART 2（M1-M6，生成 `_SAD_小程序.md` 时）
- `templates/tech-stack.md`（生成 tech-stack.json 时）

**技术选型：** 加载 `resources/reference.md` Part 1，按 6 个评估维度论证每个关键组件。

**安全设计：** 加载 `resources/reference.md` Part 4 + `resources/overlays.md` 对应语言安全节。

**数据库设计：** 加载 `resources/reference.md` Part 3 + `resources/overlays.md` 对应语言数据库节。

**特殊集成：** 涉及区块链/支付/文件存储时，加载 `resources/reference.md` Part 5。

**分批写入原则：** 含前端/小程序的全栈项目，每生成一份文档立即写入文件，不要等全部生成完再写。

**文档合并流程：**
1. 完整读取两份文档，确定基准文档
2. 逐节对比，用 `search_replace` 增量应用变更（禁止整文件重写）
3. 升级版本号，更新变更记录

**失败动作**：若某份文档写入失败，立即停止，告知用户失败的文档名和原因，不得继续生成后续文档。等待用户确认后再重试或跳过。

---

## 核心原则

1. **具体优于抽象** — NFR 必须量化，不允许"高性能"、"高可用"等模糊描述
2. **SAD 层粒度边界** — 数据库设计写核心表+关键字段，不写完整 DDL；API 设计写端点列表，不写完整 OpenAPI Schema
3. **技术选型必须论证** — 每个关键组件必须记录"是什么/为什么选/为什么不选其他/已知权衡"
4. **分批写入** — 每生成一份文档立即保存，不积压
5. **tech-stack.json 必须生成** — 所有场景均必须生成，不得遗漏

---

## 输入 / 输出

- **输入**：`doc/prd/`（prd-writer 输出，经 review-expert 评审通过）
- **输出**：`doc/arch/`
  - 纯后端：`{项目名}_SAD.md` + `tech-stack.json`
  - 含前端/小程序：各端 SAD + 概览（多端时）+ `tech-stack.json`
- **下游**：task-decomposer 读取 SAD 生成详细设计；`tech-stack.json` 中的 `summary.primaryLanguage` 是 LC-001 语言契约的唯一来源

> 与 task-decomposer 协作时，加载 `resources/reference.md` Part 6 确认 SAD 层粒度边界，避免写得过深导致重复劳动。

---

## 全局熔断规则

> 以下任意情况出现时，**立即停止生成**，向用户说明原因，等待补充信息后再继续：

- 🔴 Step 2 目标语言仍未确认，用户已要求生成 SAD → 要求用户先明确目标语言
- 🔴 Step 3 PRD 缺失核心 NFR（并发/可用性完全空白）→ 返回澄清，不得用"高性能"填充
- 🔴 文档写入失败 → 停止后续所有文档生成，报告失败原因
- 🔴 将要结束本次任务但 `tech-stack.json` 尚未生成 → 必须先补充生成再结束，不得直接遗漏

---

## 输出前自检清单

> 在写入任何文件前，逐项确认以下清单全部通过：

**文档完整性（最高优先级）：**
- [ ] Step 2 锁定的每个端均已生成对应文档，实际文件数 = 锁定清单文件数
- [ ] `tech-stack.json` 已生成并保存到 `doc/arch/`（所有场景必须生成）
- [ ] `tech-stack.json`：`summary.primaryLanguage` 已填写，`totalComponents` 计数准确

**文档头部元数据：**
- [ ] 文档编号 `SAD-YYYYMMDD-NNN`、版本 `v1.0.0`、状态 `🟡 草稿`、创建日期、作者、关联 PRD
- [ ] 头部"版本"与变更记录末行版本一致；"最后更新"与变更记录末行日期一致
- [ ] 文档最后一节是 `## 变更记录`，含 `v1.0.0` 初始记录

**内容完整性：**
- [ ] 第 4 节 NFR 已量化（含并发、响应时间、可用性具体数字）
- [ ] 第 6 节每个关键组件含"是什么/为什么选/为什么不选其他/已知权衡"
- [ ] 第 13 节安全设计已覆盖 `resources/reference.md` Part 4 所有检查项
- [ ] 多端项目：`_SAD_概览.md` 已最先生成，且包含：端类型声明、技术栈决策摘要、各端文档路径、跨端集成点说明（供 task-decomposer 读取）

**粒度边界合规：**
- [ ] 第 7 节数据库设计未包含完整 DDL（核心表+关键字段+ER 关系即可）
- [ ] 第 8 节 API 设计未包含完整 OpenAPI Schema（端点列表+HTTP 方法+功能描述即可）
