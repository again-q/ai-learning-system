# 文档地图

> 用途：**先看这里**，再去看具体文档。项目文档多，本文是唯一入口。
> 更新：2026-10-06

---

## 一、四个「唯一事实源」（改东西前必看）

| 文档 | 管什么 | 优先级 |
|---|---|---|
| [`TARGET.md`](TARGET.md) | **产品目标**（服务谁、解决什么） | 最高 |
| [`theory/五维能力向量框架-理论文档.md`](theory/五维能力向量框架-理论文档.md) | **宪法**（K/A/T/Q/S 的定义与算法） | 最高 |
| [`decision-log.md`](decision-log.md) | **决策历史**（只追加，不改原文） | 最高 |
| [`STATUS.md`](STATUS.md) | **当前状态**（什么已实现、什么有问题） | 高 |

**规则**：目标看 TARGET，算法看宪法，为什么这么定看 decision-log，现在什么样看 STATUS。

---

## 二、按主题找文档

### A 维度（近期重做）

| 文档 | 状态 | 说明 |
|---|---|---|
| [`architecture/决策063-A与U的重新设计.md`](architecture/决策063-A与U的重新设计.md) | ✅ **现行** | A/U 五情况框架（替代 055/062） |
| [`architecture/决策062-A维度最终口径.md`](architecture/决策062-A维度最终口径.md) | ⛔ 被 063 替代 | 保留作历史 |
| 宪法 §五（决策 063 修订块） | ✅ 现行 | 算法落进宪法 |

### K 维度

| 文档 | 状态 |
|---|---|
| [`architecture/决策060-诊断产出判据集.md`](architecture/决策060-诊断产出判据集.md) | ✅ 现行（K 的公式与读法） |
| [`architecture/决策062-A维度最终口径.md`](architecture/决策062-A维度最终口径.md) | K 部分不适用 |

### 报告设计

| 文档 | 状态 | 说明 |
|---|---|---|
| [`报告设计说明-对外评审版.md`](报告设计说明-对外评审版.md) | ✅ **现行** | 对外评审用，含外部审查回应 |
| [`architecture/报告设计-重构版.md`](architecture/报告设计-重构版.md) | 🟡 设计稿 | 七段结构（待拍） |
| `architecture/诊断报告-镜子原则重构.md` | 🟡 部分有效 | 镜子原则 |

### 知识点 / 题型匹配

| 文档 | 状态 | 说明 |
|---|---|---|
| [`architecture/知识点匹配方案-Jev决策模型.md`](architecture/知识点匹配方案-Jev决策模型.md) | ✅ 方案已定，未落地 | Jev 替换字符匹配（实测 100%） |
| [`architecture/题型形态重设计.md`](architecture/题型形态重设计.md) | 🟡 待拍 | 教材单元 / 母题 / 变式 三层 |

### 知识图谱

| 文档 | 状态 |
|---|---|
| [`knowledge-graph/README.md`](knowledge-graph/README.md) | ⚠️ 含重要警告（本地 359 vs 线上 271） |
| [`knowledge-graph/图谱治理审计报告.md`](knowledge-graph/图谱治理审计报告.md) | 治理记录 |
| [`architecture/D难度标尺-L11分层.md`](architecture/D难度标尺-L11分层.md) | ✅ 决策 020，D 的分层依据 |

### 工程与规范

| 文档 | 说明 |
|---|---|
| [`standards/开发经验.md`](standards/开发经验.md) | **踩坑记录**（写代码前扫一遍） |
| [`standards/前端视觉与动画工程经验.md`](standards/前端视觉与动画工程经验.md) | 前端规范 |
| [`standards/设计语言规范.md`](standards/设计语言规范.md) | 视觉规范 |
| [`standards/工程化与CI经验.md`](standards/工程化与CI经验.md) | CI/工程化 |
| [`standards/智学网接入.md`](standards/智学网接入.md) | 官方分来源 |
| [`standards/DSH升级流程.md`](standards/DSH升级流程.md) | 环境升级 |
| [`PROJECT-STRUCTURE.md`](PROJECT-STRUCTURE.md) | 仓库布局 |
| [`ENGINEERING_TODO.md`](ENGINEERING_TODO.md) | ⚠️ 按旧目标排的，已失效（见其头部警告） |

### 参考资料（外部）

| 文档 | 说明 |
|---|---|
| [`external-references/理科学神训练体系-21项学习技术.md`](external-references/理科学神训练体系-21项学习技术.md) | 含第二十一章「错误根源诊断」（四步法） |
| [`external-references/数学思维就是5种智慧.md`](external-references/数学思维就是5种智慧.md) | 5 种智慧 |
| [`external-references/追笋学堂-KF知识图谱构建方法论.md`](external-references/追笋学堂-KF知识图谱构建方法论.md) | 图谱方法论 |

### 实测记录

| 文档 | 说明 |
|---|---|
| [`探针脚本索引-2026-10.md`](探针脚本索引-2026-10.md) | 2026-10-04~05 的 15 个探针脚本 + 结论 |
| [`RAG题型检索-测试报告.md`](RAG题型检索-测试报告.md) | 2026-08-15 冒烟测试 |

---

## 三、归档（历史稿，不要据以写代码）

所有归档在 [`archive/`](archive/)，按主题分子目录：

| 目录 | 内容 |
|---|---|
| [`archive/2026-10-报告重构/`](archive/2026-10-报告重构/) | 报告设计的 8 轮推导稿（全部被现行版取代） |
| `archive/knowledge-graph/` | 图谱旧索引 |
| `archive/scripts/` | 旧脚本 |

**报告重构归档清单（含作废原因）：**

| 稿 | 作废原因 |
|---|---|
| `REPORT-v3-结构重构.md` | "坏/松/绕"是 AI 造的词，用户不认 |
| `REPORT-从零重设计.md` | 被 15:57 定稿取代 |
| `REPORT-定稿-从发现缺失到知道该补.md` | `r`（跟班级比）作废 |
| `REPORT-定稿-只跟自己比.md` | 内容已吸收进现行对外评审版 |
| `从理论推导-高分段需要什么.md` | 推导过程，结论已入现行版 |
| `高分段什么重要-用你自己的数据回答.md` | 同上 |
| `标准可能是错的-对照方案的根本前提.md` | ✅ 结论已升级为核心前提（进现行版） |
| `难题与中档题-两种问题.md` | 被定稿收敛 |
| `报告设计-讨论状态.md` | 2026-08-15 讨论记录 |
| `报告重设计-外部AI思考上下文.md` | 2026-08-30 上下文包 |
| `诊断报告-设计讨论记录.md` | 2026-08-15 讨论记录 |
| `掌握度链路-待办.md` | 待办已并入 STATUS |

---

## 四、怎么看这套文档（给新协作者）

```
第 1 步：读 TARGET.md            → 知道产品要做什么
第 2 步：读宪法 §三（五维总览）    → 知道模型长什么样
第 3 步：读 STATUS.md 的"主要矛盾" → 知道当前卡在哪
第 4 步：按主题查上面的表          → 找到具体文档
```

**注意三条常见坑：**
```
① STATUS-MANIFEST.md 大部分内容已过期（只保留图谱专项）
② ENGINEERING_TODO.md 按旧目标排的，优先级已失效
③ 别用 knowledge-graph/nodes/ 重新导入（是治理前版本，会抹掉线上治理结果）
```
