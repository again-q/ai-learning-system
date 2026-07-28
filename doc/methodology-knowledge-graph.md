# 教材知识图谱构建方法论（AI学习助手）

> 状态：v1.4 定稿
> 适用范围：独立离线模块（教材PDF → 结构化JSON）
> 消费方：AI学习助手微信小程序（Canvas 2D 知识地图 + 五维诊断）
> 核心参考：追笋学堂 KF 知识图谱构建方法论（外部，仅吸收策略层）
> 对应规范文件：[知识图谱结构规范.md](知识图谱结构规范.md)
> **最新产出**：21/24节通过质检，318节点（截至2026-07-28）

---

## 0. 目标与基本产物

**目标**：给定教材章节（PDF/电子版），产出符合本项目 JSON 规范的、可用于 K 维诊断的知识图谱结构化文件。

**产物**：
1. **知识节点文件**：`final/*_knowledge_graph.json`（所有知识节点的结构化数组）
2. **校验报告**：`quality_report.json`（质量门禁结果）

产物**不是**小程序内置模块，是独立离线脚本生成的静态数据。

---

## 1. 核心原则（硬规则）

### 1.1 唯一门槛是想学（产品哲学基调）

- 本工具不搜题、不抄答案
- 任何输出仅供参考，不是绝对真理
- 学生和家长仍需要自己判断、自己做决策（悲观提醒哲学）

### 1.2 数据第一，先跑通再迭代

- 第一版直接用教科书目录为骨架（不依赖《五三》等教辅）
- 知识节点粒度：每节约 8-15 个节点（实际平均 15.1，范围为 10-30，视节内容量而定）
- 全部节点 `level: "knowledge"`（模型层/方法层后续迭代）
- `importance.curriculum_weight` 和 `importance.exam_frequency` 第一版统一预设 3，后续真题反推修正

### 1.3 知识节点命名规则

- 核心概念（通常来自标题）允许**裸名**，例如：`正数和负数`、`函数定义域`
- 非核心概念同样使用教材术语原词，不强制三段式命名，以**清晰可读、一个知识点可独立掌握**为原则
- `basic.name` 长度 1-35 字符

### 1.4 树结构为第一公民

- 知识树是主结构，关系（reference/related）是辅助
- 树负责：学生浏览、K 掌握度聚合、学习路径规划
- `tree.path` 为数组形式，从根到当前节点的完整路径，免递归渲染

---

## 2. 全链路设计：教材PDF → 结构化JSON

### 整体流程

```
教材PDF → [阶段一：解析] → 逐页文本 + 目录JSON
    → [阶段一·五：按节拆分] → 每节独立文本/Markdown
    → [阶段二：知识点提取] → 候选节点清单
    → [阶段三：关系构建] → 依赖/关联关系
    → [阶段四：格式化输出] → 项目JSON规范文件
    → [阶段五：质量校验] → 校验报告
    → [阶段六：对接五维模型] → CloudBase 导入
```

### 阶段一：教材PDF解析（OCR识别）

**工具**：腾讯云 OCR `GeneralAccurateOCR`（通用文字识别高精度版）  
**状态**：✅ 2026-07-28 通过可用性测试（封面页98%，公式页96%）  
**说明**：教材为图片型PDF（267页0文字），需OCR逐页识别。每月1000次免费额度，整本在免费额度内 **0元**  
**产出**：`output/raw/pages/page_XXX.json`（每页OCR结果，含文字+坐标+置信度）

**流程**：
1. PyMuPDF 逐页转为 PNG（200 DPI）
2. 调腾讯云 API 逐页识别（`GeneralAccurateOCR`）
3. 保存每页文字+坐标为独立JSON

> ⚠️ OCR只产出文字+坐标，不做版面还原。版面还原由后续大模型处理。
> 详见 `doc/decision-log.md` 决策003

```bash
# 使用 MinerU 解析整本 PDF
mineru -p 教材.pdf -o ./output/raw/
```

**产出目录结构**：
```
output/raw/
├── 教材.md              # 主输出：结构化 Markdown
├── 教材.json            # 结构化 JSON（含元数据）
├── images/              # 提取的图片
└── metadata.json        # 解析元数据
```

**注意**：如果教材是纯文字版（无图片公式），MinerU 仍然可用，但也可以直接用 pdf.js 提取文本以加快速度。本项目教材多为图文混排，统一使用 MinerU。

---

### 阶段一·五：按节拆分

**流程**：先建 TOC → 再按页号合并
**工具**：Node.js 脚本

**Step 1：建 TOC**
OCR 识别目录页 → 提取章节结构：
```json
{
  "book": "人教A版数学必修第一册",
  "toc": [
    {"chapter": "第一章 集合与常用逻辑用语", "sections": [
      {"id": "1.1", "title": "集合的概念", "pages": [2, 6]},
      {"id": "1.2", "title": "集合间的基本关系", "pages": [7, 10]}
    ]}
  ]
}
```

**Step 2：按页号合并**
读 toc.json → 按 pageStart~pageEnd 范围合并 OCR 结果：
```
sections/
├── math_10_ch1_s1_1.1_集合的概念.txt
├── math_10_ch1_s2_1.2_集合间的基本关系.txt
└── sections_meta.json
```

**section_id**：`{subject}_{grade}_ch{ch}_s{sec}`  
示例：`math_10_ch1_s1`

**每节一个独立文件，传给阶段二逐节提取知识点。**

### 阶段二：知识点提取

**策略参考**：追笋学堂方法论 §3 — 两问法 + 三层候选  
**知识点粒度**：每节 **8-15 个节点**，分三类：
- 核心概念（1-2个）：章节标题对应知识
- 知识要素（6-10个）：定义/性质/操作/关系/表示
- 案例（1-3个）：典型例题结论

**原则**：每条节点 = 一个可独立评估掌握程度的知识点

**工具**：Node.js 脚本 + 大模型 API（`deepseek-v4-flash`），**逐节跑**

> ⚠️ 旧模型 `deepseek-chat` 和 `deepseek-reasoner` 已于 2026/07/24 停用。
> Flash 模型支持 1M tokens 上下文，输入 $0.14/百万token（cache未命中）/ $0.0028（命中），输出 $0.28/百万token。
> 备用可选 `deepseek-v4-pro`（输入 $0.435/百万token，输出 $0.87/百万token）。

**两问法（逐段执行）**：
1. 这段讲什么？是否有知识？
2. 到底是什么知识？属于哪种类型？

**三层候选识别（宁多勿漏）**：
1. 显性：定义框/公式框/黑体术语
2. 半显性：性质、关键关系（未命名但可独立陈述）
3. 隐性：解释文字里的前提、约定、边界条件、常见误区

**产出格式**：

```json
{
  "section": "1.1 正数和负数",
  "nodes": [
    {
      "name": "正数",
      "source_text": "大于0的数叫做正数"
    },
    {
      "name": "负数",
      "source_text": "在正数前面加上负号的数叫做负数"
    },
    {
      "name": "0",
      "source_text": "0既不是正数也不是负数"
    }
  ]
}
```

**注意**：只输出 `name` 和 `source_text`，不输出 `summary` 或 `keywords`。

### 阶段三：关系构建

**策略参考**：追笋学堂方法论 §2 — 演化/结构双脉络思维

**映射关系**：

| 方法论概念 | 本项目 JSON 字段 | 说明 |
|-----------|-----------------|------|
| 演化脉络（前置→后置推导顺序） | `relations.reference` | 前置依赖，存目标节点 ID 数组 |
| 结构脉络（核心概念→WWH展开） | `relations.related` | 横向联系，存目标节点 ID 数组 |
| 演化模式前缀/边 content | ❌ 不存 | 本项目 relations 仅存 ID |
| 线程等级 E1-E5 / S1-S5 | ❌ 不存 | 本项目无此字段 |
| 页面区域坐标 | ❌ 不存 | 独立模块不需要 |

**调用方式**：同一节节点产出后，调用大模型分析关系

**产出格式**（中间态，name 对）：

```json
{
  "section": "1.1 正数和负数",
  "pairs": [
    {"from": "相反意义的量", "to": "正数和负数", "type": "reference"},
    {"from": "正数", "to": "0", "type": "related"},
    {"from": "负数", "to": "0", "type": "related"}
  ]
}
```

### 阶段四：格式化输出 → 项目JSON规范

将阶段二、三的产物组装为项目最终 JSON 格式。

```json
{
  "knowledge_id": "math_7_ch1s1_001",

  "basic": {
    "name": "正数",
    "subject": "数学",
    "stage": "初中",
    "grade": "七年级",
    "level": "knowledge"
  },

  "tree": {
    "parent_id": "math_7_ch1s1",
    "children_ids": [],
    "path": [
      "数学",
      "七年级",
      "第一章 有理数",
      "1.1 正数和负数"
    ]
  },

  "concept": {
    "source_text": "大于0的数叫做正数"
  },

  "relations": {
    "reference": ["math_7_ch1s0_002"],
    "related": ["math_7_ch1s1_002", "math_7_ch1s1_003"]
  },

  "importance": {
    "curriculum_weight": 3,
    "exam_frequency": 3
  }
}
```

**knowledge_id 命名规则**：
```
{学科缩写}_{年级}_{章}_{节}_{序号}
示例：math_7_ch1s1_001
```

**字段填充规则总表**：

| 字段 | 来源 | 填充逻辑 |
|------|------|---------|
| `knowledge_id` | 自动生成 | 按命名规则 |
| `basic.*` | 阶段一 toc | 教材元数据 |
| `basic.level` | **第一版全部 "knowledge"** | 模型层/方法层后续迭代 |
| `tree.parent_id` | 阶段一 toc | 所属章节节点 ID |
| `tree.children_ids` | 阶段二 | 子节点 ID 列表 |
| `tree.path` | 阶段一 toc | 从学科到当前节点的完整数组 |
| `concept.source_text` | 阶段二 | **教材原文，前端知识图谱页直接展示** |
| `relations.reference` | 阶段三 | name→ID 映射后填入 |
| `relations.related` | 阶段三 | name→ID 映射后填入 |
| `importance.*` | **第一版统一预设 3** | 后续真题反推修正 |

### 阶段五：质量校验

| # | 检查项 | 规则 | 阻塞/警告 |
|---|-------|------|---------|
| 1 | name 非空 | 每个节点有 name | 🔴 阻塞 |
| 2 | name 长度 | 1-35 字符 | 🔴 阻塞 |
| 3 | source_text 非空 | 前端展示需要 | 🔴 阻塞 |
| 4 | path 完整性 | 从根到节点的完整数组 | 🔴 阻塞 |
| 5 | parent_id 存在 | 非根节点有 parent_id | 🔴 阻塞 |
| 6 | reference/related ID 存在 | 交叉校验引用的 ID 都存在 | 🔴 阻塞 |
| 7 | 孤点检测 | 无任何 relations 的节点 | 🟡 警告 |
| 8 | 核心概念锚点 | 每节有核心概念节点 | 🟡 警告 |

### 阶段六：对接五维模型

```
最终JSON → 导入 CloudBase knowledge_nodes 集合
                      ↓
学生答题数据 → 每道题关联到知识节点 → 证据积累
                      ↓
K维度评分（加权得分法 Sₖ/Dₖ）
  mastery = 被判定为"掌握"的证据数 / 总证据数
  4档制：≥0.80 熟练 / ≥0.60 基本掌握 / ≥0.40 部分掌握 / <0.40 未掌握
                      ↓
五维诊断报告输出
  薄弱知识点列表：
    - name: "正数"                          ← basic.name
    - path: ["数学","七年级","第一章 有理数","1.1 正数和负数"]  ← tree.path
    - mastery: 0.45
                      ↓
AI教练读取：学生知识状态 + 知识节点 source_text + 五维报告
  不直接读教材，读 source_text（教材原文片段）
```

---

## 3. JSON 规范总表

### 知识节点完整结构

```json
{
  "knowledge_id": "string",

  "basic": {
    "name": "string",
    "subject": "string",
    "stage": "string",
    "grade": "string",
    "level": "string"
  },

  "tree": {
    "parent_id": "string",
    "children_ids": ["string"],
    "path": ["string"]
  },

  "concept": {
    "source_text": "string"
  },

  "relations": {
    "reference": ["string"],
    "related": ["string"]
  },

  "importance": {
    "curriculum_weight": 3,
    "exam_frequency": 3
  }
}
```

### 字段说明

| 字段 | 说明 | 谁读 |
|------|------|------|
| `knowledge_id` | 唯一标识 | 系统 |
| `basic.name` | 知识名称，教材术语 | 诊断报告展示 |
| `basic.subject/stage/grade` | 学科/学段/年级 | 系统定位 |
| `basic.level` | 层级（第一版全为 knowledge） | K 维度计分 |
| `tree.parent_id` | 父节点 ID | 系统聚合 |
| `tree.children_ids` | 子节点 ID 列表 | 系统聚合 |
| `tree.path` | 完整路径数组 | **诊断报告展示路径** + 前端导航 |
| `concept.source_text` | 教材原文 | **前端知识图谱页展示** + AI诊断读取 |
| `relations.reference` | 前置依赖节点 ID 数组 | AI 发现基础缺陷 |
| `relations.related` | 横向联系节点 ID 数组 | AI 探索和迁移 |
| `importance.*` | 重要程度（第一版预设 3） | 后续迭代用 |

### 关于 `concept` 字段的说明

| 修改项 | 原值 | 新值 | 原因 |
|-------|------|------|------|
| `summary` | 核心定义（一句话） | ❌ **移除** | 与 `source_text` 重复 |
| `keywords` | 关键词列表 | ❌ **移除** | AI 读关键词不如读原文 |
| `source_text` | 不存在 | ✅ **新增** | 前端展示 + AI 诊断统一使用教材原文 |

> ⚠️ 本方法论的 `concept` 结构在此正式修订 JSON 规范。`doc/知识图谱结构规范.md` 已同步更新。

### 学生知识状态（独立集合）

```json
{
  "student_id": "001",
  "knowledge_id": "math_function_domain_001",
  "mastery": 0.82,
  "evidence_count": 20,
  "last_update": "2026-07-17"
}
```

知识节点不存掌握度——同一个知识不同学生掌握度不同，独立存储。

---

## 4. 与外部方法论的差异对照（必须清楚）

本项目独立离线模块参考了追笋学堂 KF 方法论的部分策略，但**不是其实现**。关键差异如下：

| 维度 | 追笋学堂 KF 方法论 | 本项目做法 | 原因 |
|------|-------------------|-----------|------|
| 基础设施 | `kf` CLI + `forestapi` API 网关 | **完全不用** | 无 KF 基础设施 |
| 页面区域坐标 | `normalized_1000` 坐标体系 | **砍掉** | 独立模块不需要页面 grounding |
| 卡片创建 | `kf card create` 命令 | **直接输出 JSON 文件** | 产物是文件，不是实时 API |
| 区域定位 | `kf ai locate-regions` | **不用** | 第一版不做页面区域定位 |
| 边 content | 强制 content + 演化模式前缀 | **不存** | 项目 relations 仅存 ID |
| 线程等级 | E1-E5 / S1-S5 精细分级 | **不存** | 项目无此字段 |
| 三段式命名 | `概念的类型-核心内容` 强制 | **不强制** | 用教材术语原词 |
| 演化/结构双脉络 | 完整演化+结构两张图 | **映射为 reference/related** | 与项目规范兼容 |
| 两问法+三层候选 | 知识点提取策略 | ✅ **吸收为提取 prompt 策略** | 提升识别质量 |
| 核心概念裸名 | 核心概念用裸名 | ✅ **保留** | 与项目理念一致 |
| 质量门禁 | 命名/图谱/区域/内容四方面 | ✅ **保留并适配** | 保证产出质量 |

### 可以吸收的部分

- **两问法**（§3.1）：逐段问"这段讲什么？到底是什么知识？"
- **三层候选识别**（§3.2）：显性→半显性→隐性
- **演化/结构双脉络思维**（§2）：帮助 AI 判断关系类型
- **核心概念锚点**（§1.1）：核心概念裸名建卡
- **质量门禁**（§5）：命名检查、图谱可读性检查

### 必须放弃的部分

- KF CLI 整套基础设施（`kf` 命令）
- `forestapi` API 网关
- 页面区域坐标体系（`normalized_1000`）
- 边 content（演化模式前缀、挂载位）
- 线程等级（E1-E5, S1-S5）
- 三段式命名强制要求

---

## 5. 工具链总览

| 阶段 | 工具/方式 | 产出 |
|------|----------|------|
| 1. OCR识别 | Python `PyMuPDF` + 腾讯云 `GeneralAccurateOCR` | `pages/page_XXX.json` |
| 1.5 建TOC | Node.js 脚本（从目录页提取） | `toc.json` |
| 1.5 按节拆分 | Node.js 脚本（按页号合并） | `sections/*.txt` + `sections_meta.json` |
| 2. 知识点提取 | Node.js 脚本 + `deepseek-v4-flash`（逐节） | `candidates/*.json` |
| 3. 关系构建 | Node.js 脚本 + `deepseek-v4-flash`（逐节） | `relations/*.json` |
| 4. 格式化输出 | Node.js 脚本（name→ID映射） | `final/*_knowledge_graph.json` |
| 5. 质量校验 | Node.js 校验脚本 | `quality_report.json` |
| 6. 导入消费 | CloudBase 数据库 | `knowledge_nodes` 集合 |

**目录结构建议**（放在项目根目录下）：

```
knowledge-graph-builder/
├── input/          # 教材PDF
├── output/
│   ├── raw/        # MinerU 解析产出（.md + images/）
│   ├── sections/   # 按节拆分的独立 Markdown
│   ├── candidates/ # 阶段二产出
│   ├── relations/  # 阶段三产出
│   ├── final/      # 最终JSON
│   └── quality_report.json
├── scripts/        # Node.js 脚本（拆分/提取/校验）
└── README.md
```

---

## 6. 迭代计划

| 迭代 | 内容 | 时间 |
|------|------|------|
| v1.0 | 教科书逐节提取，每节约8-15节点，全部`level: knowledge` | **当前，9/1前** |
| v1.1 | AI补充教辅考点（粒度细化到考点级） | 上线后 |
| v1.2 | 真题反推修正 `importance` 权重 | 上线后 |
| v2.0 | 引入 `level: model`（模型层）和 `level: method`（方法层） | 待定 |

---

## 7. 修改记录

| 日期 | 修改内容 | 原因 |
|------|---------|------|
| 2026-07-28 | v1.0 定稿 | 基于教科书PDF为骨架、吸收方法论策略、符合项目JSON规范 |
| 2026-07-28 | `concept` 移除 `summary` 和 `keywords`，改为 `source_text` | 精简设计，原文更实用 |
| 2026-07-28 | 决策三修改：用教科书替代《五三》作为第一版骨架 | 项目现状决定 |
| 2026-07-28 | v1.1 更新：DeepSeek 模型改用 `deepseek-v4-flash`，PaddleOCR 升级至 3.7.0 含 PP-OCRv6，新增 PP-StructureV3 扫描版直转方案 | 模型停用 + 工具版本更新 |
| 2026-07-26 | **v1.2 更新**：PDF解析工具从 pdf.js/PaddleOCR 切换为 **MinerU**（opendatalab/MinerU）；新增**阶段一·五：按节拆分**步骤，明确"逐节跑"的前置分节流程 | 教材为图文混排数字PDF，MinerU 的 VLM+OCR 双引擎 + Apple Silicon 加速更优 |
| 2026-07-28 | **v1.3 更新**：MinerU 在 Mac 上因 MPS兼容性+网络下载+速度问题正式否掉。改为腾讯云 OCR GeneralAccurateOCR（已通过可用性测试，封面98%/公式96%）。分节改为先建TOC再按页号合并。知识点粒度明确为每节8-15节点 | MinerU 不可用；腾讯云 OCR 免费额度内 0元 |
| 2026-07-28 | **v1.4 更新**：21/24节 318节点管线跑通通过。补充实际节点粒度（avg 15.1, range 10-30），更新整体管线状态为 QwenPaw Agent 架构。 | 整本管线完成，数据驱动修正理论假设 |

---

**本文档定位**：本项目知识图谱构建独立模块的方法论和规范说明书。
**对应文件**：`doc/methodology-knowledge-graph.md`（本文件）+ `doc/知识图谱结构规范.md`（JSON 规范）
