# 📋 项目状态清单

> **用途一**：当你说「更新状态」时，按下方「更新操作清单」改对应文件。
> **用途二**：下方「当前快照」反映 main 分支最新结构（2026-08-17）。

---

## 知识图谱专项状态（2026-08-17 治理后）

| 项 | 状态 |
|---|---|
| **knowledge_nodes** | ✅ **269 节点**（369→269，纯 WWH 五要素：定义/表示/性质/操作/关系） |
| **knowledge_extras** | ✅ 新建 61 条（思想 16/来源 4/应用 41），挂靠主节点，不参与 K 计算；**应用条目标注非高考题型** |
| **第 0 章（初高衔接）** | ✅ 12 节点：0.1 数与式 / 0.2 一元二次方程 / 0.3 函数基础 |
| **schema** | ✅ 统一新 schema（knowledgeId+path+type），旧 10 条已清（迁第 0 章/删） |
| **命名** | ✅ 句子式/括号式/辨析式全部精炼；同名去重 |
| **匹配** | ✅ judgeOne matchKnowledgeNode + **custom_nodes 兜底**（匹配失败 K 不丢） |
| **图谱构建规则** | ✅ agent2/3 prompt 按 WWH 判定（What 建 / Why·How 不建）+ 并列保留 + 第 0 章归属 |
| **⚠️ 残留** | type 语义少量错标（4.4_011 等，待过一遍）；**覆盖仅必修一数学**（0 章+一~五章），必修二~五/选必/其他学科未建 |

### 图谱质量评分（2026-08-17）

| 维度 | 治理前 | 治理后 | 只看必修一 |
|---|---|---|---|
| 结构（schema 统一/层级） | 60 | **90** | 90 |
| 命名（精炼/可匹配） | 55 | **85** | 85 |
| 纯净度（五要素/WWH） | 40 | **92** | 92 |
| type 语义 | 70 | **85** | 85 |
| 覆盖度 | 20 | **25**（仅必修一） | **88**（章节全有，节内少量漏项已补：不等式性质4/5 等，编号跳号处待逐节核） |
| **综合** | ~50 | **~75** | **~88** |

> 只看必修一口径（2026-08-17）：0 章（初高衔接）+ 第一~五章全覆盖；清理时发现并补齐不等式性质4/5 等跳号遗漏。剩余：type 少量错标、个别节（3.4 应用节）清理后偏薄（符合 WWH）、编号跳号待逐节核查。

---

## ⚠️ 2026-08-17 新增功能（全部未验证）

> 以下本次会话新增/修改，**均未在小程序端端到端验证**（MCP 测不了长任务/前端未编译运行）。验证方式：用户在小程序端实际操作。

| 项 | 内容 | 状态 |
|---|---|---|
| judgeOne 分段路径 | segments/breakpoint/processAvailable 输出 + 存 questions | ✅ 代码已部署，⚠️ 判定质量未多题实测（单题 MCP 测过） |
| judgeOne K 粒度 | knowledgeUsage 三档（P=0/0.5/1）+ 剥离版主路径 + custom_nodes 兜底 | ✅ 代码已部署，⚠️ 未真实判题验证 |
| judgeOne pattern | 题型三层输出 + RAG patternEmbedding | ✅ 代码已部署，⚠️ 单题验证过，稳定性未测 |
| statService | 本次统计聚合（total/correct/rate/trend/lastRate） | ✅ MCP 双批次测试通过 |
| ragService | 4 工具（vectorSearch 题型主键/getErrorPattern/getTrend/getNodeHistory）+ getSchemas | ✅ MCP 冒烟通过，⚠️ 真实检索数据少（冷启动） |
| reportService | 生成（装配+Function Calling+JSON 报告+持久化） | ✅ 部署 + ping 通过，⚠️ **完整生成未验证**（MCP 长任务超时，需小程序端） |
| reportService disputeModule | 异议 → 整个薄弱点重生成 + fix 连带更新 questions | ⚠️ **完全未验证**（无 reports 数据可测） |
| reportService getByBatch | 读该批次最新报告 | ⚠️ 未验证 |
| 前端报告组件 | report-overview / report-module / report-dispute-modal + report 页改造 | ⚠️ **未编译运行**（开发者工具未打开） |
| 异议功能前端 | 模块「我有异议」→ 弹窗 → 重新生成 → 局部更新 | ⚠️ 未验证 |
| unit_progress 集合 | 新建（A 维度数据源，原来缺失） | ✅ 集合已建，⚠️ A 更新逻辑真实数据未验证 |
| 图谱治理 | knowledge_nodes 369→271（WWH 五要素）+ knowledge_extras 61 + 第 0 章 + source_text 100% | ✅ 数据已改，⚠️ 图谱前端展示/检索匹配未验证 |

完整文件分类见 [`doc/PROJECT-STRUCTURE.md`](PROJECT-STRUCTURE.md)。

---

## 当前快照（2026-08-14）

### 仓库布局

| 区域 | 路径 | 状态 |
|------|------|------|
| 小程序前端 | `miniprogram/` | ✅ 11 个活跃页面（已归档 knowledge-map / knowledge-tree） |
| 云函数 | `cloudfunctions/` | 8 个（graphService + knowledgeAdmin 为图谱核心） |
| 图谱源数据 | `knowledge-graph/` | 356 节点 JSON |
| 管线产物 | `output/` | OCR/抽取中间文件 |
| 文档 | `doc/` | 61 文件 |
| 归档 | `archive/` | 废弃页面 + v4 原型 + 旧 K 维度规格 |
| 知识库镜像 | `knowledge-base/` | 文档同步副本，非运行时 |

### 小程序页面状态

| 页面 | 路径 | 状态 |
|------|------|------|
| 知识图谱（Tab「图谱」） | `pages/graph/graph` | ✅ 新版：目录列表 + 演化链（2026-08-13 生产化） |
| 拍照诊断 | photo → report | ✅ 本地代码就绪，云端 diagnose 等待部署 |
| 五维雷达 | — | ❌ 已移除（2026-08-10 graph 改知识图谱），待重建 |
| 知识图谱副本 | archive/knowledge-map | 📦 已归档 |
| 旧知识树 | archive/knowledge-tree | 📦 已归档 |
| 维度详情 | dimension-detail | 🟡 占位，无入口 |

### 模块进度（摘要）

| 模块 | 状态 |
|------|------|
| 知识图谱数据 | ✅ **269 节点**（五要素纯净）+ knowledge_extras 61 条（2026-08-17 治理） |
| 知识图谱前端 | ✅ graph 页新版上线 |
| 五维能力可视化 | 🔴 雷达页缺失 |
| 拍照诊断闭环 | 🟡 前端有，云函数待部署 |
| 掌握度真实数据 | 🔴 仍 mock（judgeOne 已备 custom_nodes 兜底 + K 粒度，待判题实测） |

### 技术债

- `manageKnowledge` 与 `knowledgeAdmin` 双轨
- Code-Wiki 部分章节仍写 graph=五维雷达（以 PROJECT-STRUCTURE 为准）
- dimension-detail / model-cards / method-list 占位无入口

---

## 更新操作清单

### 一、时间信息

**涉及**：README、ROADMAP

| 字段 | 说明 |
|------|------|
| 距 9/1 剩余天数 | 同步更新 |
| 时间线 | ROADMAP 首段 |

### 二、进度概览

**涉及**：README、ROADMAP、本文「当前快照」

| 要更新 | 说明 |
|--------|------|
| 总进度百分比 | README |
| 模块状态表 | ROADMAP + 本文快照 |
| 页面/归档变动 | **必须同步** `doc/PROJECT-STRUCTURE.md` + `archive/README.md` |

### 三、待办完成

**涉及**：ROADMAP、ENGINEERING_TODO、Code-Wiki

### 四、更新日志

ROADMAP 末尾追加一行。

### 五、结构变更时额外步骤

```
1. 文件移入 archive/ → 更新 archive/README.md 清单
2. 从 app.json / 脚本移除引用
3. 更新 doc/PROJECT-STRUCTURE.md
4. 更新本文「当前快照」
5. ROADMAP 更新日志一行
```

### 六、执行顺序

```
1. 时间 → 2. 进度 → 3. 待办 → 4. 结构（如有）→ 5. 更新日志 → 6. git commit
```
