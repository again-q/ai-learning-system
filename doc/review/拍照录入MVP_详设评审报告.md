# 拍照诊断最小闭环 — 详细设计评审报告

**文档编号**：REV-DET-20260808-001
**版本**：v1.0.0
**状态**：🟡 草稿
**报告日期**：2026-08-08
**最后更新**：2026-08-09
**评审人**：review-expert（AI）
**关联文档**：`doc/detailed/*.md`（9 份）；上游 `doc/prd/*.md`、`doc/arch/*.md`

---

## 一、评审概要

| 项 | 内容 |
|----|------|
| **评审类型** | 多端详细设计评审（后端 6 份 + 小程序 3 份） |
| **项目阶段** | MVP |
| **评审结论** | ✅ **通过**（P0=0，P1=0，P2=3） |

## 二、风险热点扫描

| 序号 | 风险点 | 风险类型 | 评级 |
|------|--------|---------|------|
| 1 | diagnose 同步编排，120s 云函数超时风险 | 性能 | P2（MVP，POC 实测 ~30s/批） |
| 2 | 外部 AI（Qwen/DeepSeek）单点依赖 | 单点 | P2（MVP 豁免） |
| 3 | 一图多题拆分（parseQuestionsFromVision）准确性 | 逻辑 | P2（POC 已验证 4 题场景） |

## 三、分类评审结果

### 3.1 上游正向比对（PRD/SAD → 详设）✅
- 5 端点全覆盖 PRD F-001~F-010：photoUpload→F-001、diagnose→F-002~008、dispute→F-009、getGraph→F-010
- 决策 017（散文 prompt）、020/021（D 钳制）、018（异议重诊）均落地到详设
- 无需求驱动缺口

### 3.2 跨端接口对齐 ✅（含 5A/5B 核对）
| 接口 | 后端定义 | 小程序引用 | 对齐 |
|------|---------|-----------|------|
| POST /photoUpload | files/batchId/imageCount/fileIds | 拍照页同字段 | ✅ |
| POST /diagnose | batchId/status | 拍照页 status | ✅ |
| GET /getReport | batchId/questions[]/failedItems[] | 报告页同 | ✅（字段级清单见 P2-01） |
| POST /disputeQuestion | questionId/corrections/newDiagnosis | 报告页同 | ✅ |
| GET /getGraph | parentId/nodeId/nodes[]/currentNode | 图谱页同 | ✅ |

### 3.3 后端模块检查（6 份）✅
- 每份 12 节齐全（功能/规则/接口 YAML/伪代码/算法/DDL/外部/内部/性能/安全/测试/依赖）
- OpenAPI YAML 均含 requestBody/responses 200/400/500
- clamp 模块：D 钳制、η 无过程 null、r null、P 归一化 4 档——与决策 020/021 一致
- diagnose 幂等（status≠pending 拒绝）符合评审遗留 REVIEW-ARCH-02

### 3.4 小程序模块检查（3 份）✅
- 每份 10 节齐全
- 报告页异议流程（弹层→修正→重诊刷新）符合决策 018
- 错误处理覆盖：上传失败/超时/网络/单张失败

### 3.5 轻量向下验证（详设 → 编码可行性）
- 伪代码可直接转实现（Node.js 云函数风格）
- POC 脚本 full-pipeline-test.js 与 diagnose 伪代码逻辑一致（vision→judge→clamp→写库）

## 四、问题清单

### 4.1 P0 阻断项
无。

### 4.2 P1 高风险项
无。

### 4.3 P2 改进建议

| 问题ID | 风险 | 描述 | 建议动作 |
|--------|------|------|---------|
| REVIEW-DET-01 | P2 | 报告页 API 映射表未逐字段列出 getReport 响应（仅 questions[]/failedItems[]，后端有 15 个字段） | 编码时按 diagnose 详设 §3.2 字段清单实现，报告页已覆盖业务展示（对错/题型/难度/P/η/知识点） |
| REVIEW-DET-02 | P2 | diagnose 接口示例返回 status:"analyzing"，但伪代码同步执行完返回 completed | 编码时统一为同步返回 completed；如需异步再改 |
| REVIEW-DET-03 | P2 | dispute 伪代码引用 deepseekJudgeWithCorrection 未在 diagnose 详设显式定义 | 编码时复用 diagnose 的 judge 客户端，追加修正上下文即可 |

## 五、结论与下一步

**评审结论：✅ 通过**（P0=0，P1=0，P2=3，MVP 阶段性能/高可用豁免）

**下一步行动：**
1. 责任角色：门禁执行 → `bash gate.sh pass detailed` 标记详细设计阶段完成（已 pass）
2. 责任角色：gatekeeper → 进入编码阶段，读取编码指令 + 详设生成代码
3. P2 项编码时顺带处理（字段清单/状态统一/judge 复用）

---

## 变更记录

| 版本 | 日期 | 变更说明 |
|------|------|---------|
| v1.0.0 | 2026-08-09 | 初版：多端详设评审通过（P0=0，P1=0，P2=3） |

---

## 附录：问题摘要卡

| 问题ID | 风险 | 描述 | 修复指令 |
|--------|------|------|---------|
| （无 P0/P1 问题，评审通过） | — | — | — |
