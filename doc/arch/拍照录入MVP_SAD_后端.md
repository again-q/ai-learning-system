# 拍照诊断最小闭环 — 架构设计（后端 SAD）

**文档编号**：SAD-20260808-001
**版本**：v1.0.0
**状态**：🟡 草稿
**创建日期**：2026-08-08
**最后更新**：2026-08-08
**作者**：system-architect（AI）
**关联 PRD**：`doc/prd/拍照录入MVP_PRD_后端.md`、`doc/prd/拍照录入MVP_PRD_概览.md`

---

## 目录

1. 文档头部（本文件）
2. 目录
3. 执行摘要
4. 需求分析
5. 系统架构
6. 技术栈
7. 数据库设计
8. API 设计
9. 模块设计
10. 缓存策略
11. 安全设计
12. 性能优化
13. 可扩展性设计
14. 监控和告警
15. 部署架构
16. 成本分析
17. 风险评估
18. 实现路线图
19. 名词解释
20. 变更记录

---

## 3. 执行摘要

拍照诊断最小闭环后端：接收学生拍照批次 → 图像识别（Qwen）→ 诊断判定（DeepSeek + rubric）→ 参数钳制 → 生成报告 → 持久化。支持报告异议（单题重诊）与知识图谱数据提供。技术栈：CloudBase 云函数（Node.js）+ 文档数据库 + 外部 AI 服务。

## 4. 需求分析

来自 PRD（F-001~F-010）：
- 拍照批次接收（≤9 张）、题目识别、对错/题型/难度/过程质量判定、知识点关联、报告生成、异议重诊、图谱数据
- NFR：单题诊断 ≤60s、整批 ≤3min、链路可用率 ≥95%、数据仅本人可见

## 5. 系统架构

```
小程序端 ──▶ 云函数 photoUpload ──▶ 云存储（照片）
              │
              ▼
        云函数 diagnose ──▶ Qwen 视觉转录（散文）
              │                │
              │                ▼
              │          DeepSeek 诊断（rubric：题型/D档/η/P/r/对错/知识点）
              │                │
              │                ▼
              │          参数钳制（D 钳回 L1~L11 区间；η 无过程=null）
              │                │
              │                ▼
              │          写入三集合（questions / mastery_logs / knowledge_progress）
              │                │
              ▼                ▼
        报告返回小程序 ◀── 报告数据
              │
              ▼
        异议入口 → 修正 process_evidence → 单题重诊（仅该题重跑管线）
```

**关键架构决策**：
1. **诊断管线单函数编排**（diagnose 内串行：vision → judge → 钳制 → 写库）——MVP 不拆微服务，减少跨函数延迟
2. **AI 填参 + 代码钳制**（决策 014/021）：DeepSeek 只出分类结果，D 数值/η 规则由代码强制
3. **报告异议单题重诊**（决策 018）：只重跑该题，批次其他题结果不变
4. **外部 AI 无状态调用**：Qwen/DeepSeek 均为 HTTP 调用，无持久连接

## 6. 技术栈

| 组件 | 选型 | 为什么选 | 为什么不选其他 | 已知权衡 |
|------|------|---------|--------------|---------|
| 后端运行时 | CloudBase 云函数（Node.js 16+） | 与现有小程序云开发一致、零运维、按量付费 | 云托管（容器）——重，MVP 不需要 | 冷启动延迟（接受） |
| 图像理解 | Qwen3.7Plus（阿里百炼） | POC 实测：散文转录稳定、14s/张 | OCR 专精模型——无痕迹语义能力（实测完败） | 手写 ≥ 符号偶误读（靠报告异议兜底） |
| 诊断推理 | DeepSeek（API/TokenHub） | POC 实测：rubric 治漂移、D 档位稳定 | 其他 LLM——已定选型（决策） | 参数漂移需 rubric + 双跑兜底 |
| 数据库 | CloudBase 文档数据库 | 数据量小、免费容量够、与云函数同环境 | MySQL/PG——过重，MVP 不需要 | 无 SQL 复杂查询（不需要） |
| 云存储 | CloudBase 存储 | 照片存储、微信生态原生 | 自建对象存储——多余 | 免费 5GB（120+ 学生够用） |

## 7. 数据库设计（核心表 + 关键字段，不写 DDL）

**集合：questions（题目记录，只追加）**
- 批次信息：batchId、imageFileId、顺序
- 题目内容：questionText（识别结果）、选项内容、作答、最终答案
- 诊断结果：isCorrect、questionCategory、difficultyLevel（L1~L11）、difficultyValue（钳制后）、eta、P、r、knowledgeNodeId（可 null=未关联）
- 来源：source（拍照）、createdAt
- 修正记录：revisions[]（异议修正留痕，决策 016）

**集合：mastery_logs（掌握度变更记录，最小写入）**
- 本轮 P0：仅存诊断快照（五维原始信号 isCorrect/D/η/P），不算掌握度（K 时机未拍板）
- userId、questionId、algorithm:'score_poc'、createdAt

**集合：knowledge_progress（当前快照）**
- 本轮 P0：不更新（K 时机未拍板）；集合预建，字段待 P1

**集合：knowledge_nodes（知识图谱 361 节点，导入）**
- knowledgeId、name、type（5 种）、level、parentId、path、concept、importance

**ER 关系**：batch → questions（1:N）；questions → mastery_logs（1:N）；questions → knowledge_nodes（N:1，可空）

## 8. API 设计（端点列表，不写完整 Schema）

| 端点 | 方法 | 功能 | 输入要点 | 输出要点 |
|------|------|------|---------|---------|
| photoUpload | 上传 | 接收一批照片，存云存储，登记批次 | 照片列表（≤9） | batchId |
| diagnose | 调用 | 触发整批诊断管线 | batchId | 报告数据 |
| getReport | 查询 | 获取诊断报告 | batchId | 逐题判定结果 |
| disputeQuestion | 提交 | 异议修正某题 | questionId + 修正内容 | 该题新判定 |
| getGraph | 查询 | 图谱层级数据 | 章节/节点 ID | 节点树/详情 |

> 小程序端经云函数调用（非直连外部 AI），key 不落前端。

## 9. 模块设计

| 模块 | 职责 |
|------|------|
| photoUpload | 收图 → 云存储 → 建批次记录 |
| diagnose | 编排管线：vision → judge → 钳制 → 写库 → 组报告 |
| vision 客户端 | 调 Qwen（散文 prompt，决策 017） |
| judge 客户端 | 调 DeepSeek（rubric 判定，决策 020/021） |
| clamp 模块 | D 钳制（Lx 区间）、η 无过程=null（代码强制） |
| dispute | 修正 process_evidence → 单题重跑 judge → 更新该题 |
| graph 服务 | 图谱节点查询 |

## 10. 缓存策略

- 本轮无缓存需求（数据量小、低频使用）
- 图谱 361 节点：冷启动时可整体读入内存（<1MB）

## 11. 安全设计

- 外部 AI key（Qwen/DeepSeek）仅存云函数环境变量，不落前端、不入 git（.env 已 gitignore）
- 数据隔离：questions/mastery_logs 按 userId 隔离，仅本人可读
- 云函数鉴权：小程序端云函数调用自动携带 openid，服务端校验归属

## 12. 性能优化

- Qwen enable_thinking:false（提速 5.6x，POC 实测）
- 云函数超时 120s（对齐 POC 全链路 ~30s/批，余量充足）
- 并行化：一批 9 张可并行调 Qwen（POC 单张 ~19s，并行可显著降耗时）

## 13. 可扩展性设计

- rubric 参数集中管理（决策 014：改一处不碰 prompt）
- 诊断管线与界面解耦：新增维度/算法只改 diagnose 内部
- D 标尺锚例库可扩充（决策 021 遗留项）

## 14. 监控和告警

- 云函数日志：记录每次诊断的输入输出摘要（POC 已验证可观测）
- 失败率/耗时统计：诊断失败、超时上报

## 15. 部署架构

- 云函数：photoUpload、diagnose、graphService（3 个函数）
- 图谱导入：一次性脚本（361 节点 JSON → knowledge_nodes）
- 环境：开发环境先内测，9/1 前切生产

## 16. 成本分析

- Qwen：2 元/百万 tokens，单批 ~2K tokens → 单次 ~0.004 元
- DeepSeek：API 按量，单批诊断 ~8-10K tokens → 单次 <0.1 元
- 云存储/数据库：免费额度内（120+ 学生低频足够）
- **月成本预估 < 30 元**（120 学生 × 30 次/月）

## 17. 风险评估

| 风险 | 等级 | 缓解 |
|------|------|------|
| 外部 AI 服务不可用 | P1 | 失败降级（C2）+ 重试；MVP 可接受 |
| Qwen 手写符号误读污染对错 | P1 | 报告异议兜底（决策 018，P0 必含） |
| 冷启动延迟 | P2 | 接受首调延迟，MVP 不预热 |
| 并发高峰（考试后集中拍） | P2 | 云函数自动扩缩，量级小无虞 |

## 18. 实现路线图

1. 三集合建库 + 图谱导入脚本
2. photoUpload + diagnose（搬 POC 管线）
3. dispute（单题重诊）
4. graphService
5. 内测 → 9/1 开放

## 19. 名词解释

- process_evidence：经校准/确认后的过程证据（决策 015/017）
- rubric：诊断判定标准（决策 020/021）
- L1~L11：难度 11 档标尺

## 20. 变更记录

| 版本 | 日期 | 变更说明 |
|------|------|---------|
| v1.0.0 | 2026-08-08 | 初版：拍照诊断最小闭环后端架构 |
