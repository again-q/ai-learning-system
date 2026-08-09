# AI 学习助手 — 数据库 Schema 详细设计文档

**文档编号**：DES-20260808-001
**版本**：v1.0.0
**状态**：🟡 草稿
**创建日期**：2026-08-08
**最后更新**：2026-08-09
**作者**：task-decomposer（AI）
**审核人**：待定
**所属层次**：Layer 0（基础层）
**关联文档**：`doc/arch/拍照录入MVP_SAD_后端.md`

---

## 1. 功能描述

- **五集合数据模型**：questions（题目记录）、batches（诊断批次）、mastery_logs（诊断快照）、knowledge_progress（掌握度，P0 预建不写入）、knowledge_nodes（知识图谱 361 节点）
- **数据访问规则**：各集合读写权限归属、字段约束、索引策略、openid 隔离
- **图谱导入**：本地 knowledge-graph/nodes/*.json 批量写入

## 2. 业务规则

| 规则编号 | 规则描述 |
|----------|----------|
| DB-REG-01 | questions 仅追加（insert），不 update；修正通过 revisions[] 追加记录 |
| DB-REG-02 | 含 userId 的集合查询须带 userId（openid 隔离） |
| DB-REG-03 | difficultyLevel 取值 L1~L11，difficultyValue 落档内（钳制后） |
| DB-REG-04 | eta 仅解答题填写（0.4~1.0），选择/填空必须 null |
| DB-REG-05 | r 本轮一律 null |
| DB-REG-06 | knowledgeNodeId 可 null（关联失败），nodeStatus='unmapped' |

## 3. 接口定义（数据访问层字段）

### 3.1 questions

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| _id | String | 自动 | |
| batchId | String | 是 | 批次 ID |
| userId | String | 是 | openid |
| imageFileId | String | 是 | 云存储 fileID |
| questionText | String | 否 | AI 识别题目文本 |
| options | String[] | 否 | 选择题选项 |
| questionType | String | 否 | 选择/填空/解答/其他 |
| studentAnswer | String | 否 | 作答 |
| correctAnswer | String | 否 | 标准答案 |
| isCorrect | Boolean | 否 | 对错 |
| questionCategory | String | 否 | 回忆类/单元内应用/跨单元应用/无法归类 |
| difficultyLevel | String | 否 | L1~L11 |
| difficultyValue | Number | 否 | D 值（钳制后） |
| processScore | Number | 否 | P（0/0.3/0.5/1.0） |
| pathQuality | Number | 否 | η（0.4~1.0 或 null） |
| transferQuality | null | 否 | r（本轮 null） |
| knowledgeNodeId | String | 否 | 知识点 ID |
| nodeStatus | String | 否 | mapped/unmapped |
| errorAttribution | String | 否 | 归因（P0 null） |
| traceReport | String | 否 | 视觉转录原文 |
| source | String | 是 | photo/manual |
| revisions | Array | 否 | 修正记录 |
| createdAt | Date | 是 | |

索引：`batchId`，`userId+createdAt` 降序，`knowledgeNodeId`

### 3.2 batches

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| _id | String | 自动 | |
| userId | String | 是 | |
| imageCount | Number | 是 | 1-9 |
| status | String | 是 | pending→analyzing→completed/failed |
| totalQuestions | Number | 否 | |
| failedCount | Number | 否 | |
| createdAt | Date | 是 | |
| completedAt | Date | 否 | |

索引：`userId+createdAt` 降序

### 3.3 mastery_logs 集合（诊断报告 + embedding，供 RAG）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| _id | String | 自动 | |
| userId | String | 是 | openid |
| questionId | String | 是 | 关联 questions._id |
| knowledgeNodeId | String | 否 | 知识点 ID |
| algorithm | String | 是 | "score_poc" |
| report | Object | 是 | **完整诊断报告**（整报告入库） |
| reportText | String | 是 | 报告文本化（embedding 源文本） |
| embedding | Array | 是 | text-embedding-v4 向量 |
| createdAt | Date | 是 | |

**report 结构（完整诊断报告）**：
```
{
  questionText, options, questionType,
  studentAnswer, correctAnswer, isCorrect,
  questionCategory, difficultyLevel, difficultyValue,
  processScore, pathQuality, transferQuality,
  knowledgeNodeId, nodeStatus,
  errorAttribution, evidence: [], actionAdvice: null
}
```

**reportText 拼接规则**（embedding 源）：
```
`题目：${questionText} | 作答：${studentAnswer} | 判定：${isCorrect?'对':'错'} | 题型：${questionCategory} | 难度：${difficultyLevel} | 知识点：${knowledgeNodeId}`
```

索引：`userId+createdAt`（降序）、`knowledgeNodeId`

### 3.4 knowledge_progress（P0 预建）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| _id | String | 自动 | |
| userId | String | 是 | |
| knowledgeNodeId | String | 是 | |
| mastery | Number | 否 | P1 启用 |
| correctCount | Number | 否 | |
| lastUpdated | Date | 否 | |

### 3.5 knowledge_nodes

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| knowledgeId | String | 是 | |
| name | String | 是 | |
| type | String | 是 | definition/property/notation/method/example |
| level | Number | 是 | |
| parentId | String | 否 | |
| path | String | 是 | |
| concept | Object | 否 | {sourceText,level} |
| importance | Object | 否 | {curriculumWeight,examFrequency} |

索引：`parentId`，`path`

## 4. 功能逻辑

```
ensureIsolation(query, userId): query.userId = userId
insertQuestion(data): _id=genId(); src='photo'; revisions=[]; questions.add(data)
appendRevision(qid, field, org, rev, note): doc(qid).update({[field]:rev, revisions:push({field,org,rev,source:'student_revision',note,createdAt:now()})})
importNodes(arr): for n in arr: knowledge_nodes.add(n)
```

## 5. 算法

无（数据层）。

## 6. DDL

CloudBase 文档数据库。安全规则：所有集合 `doc._openid == auth.openid`。

## 7-8. 外部/内部接口

| 接口 | 调用方 | 说明 |
|------|--------|------|
| getCollection(name) | 全部 | 集合引用 |
| ensureIsolation(q,uid) | 全部 | 隔离注入 |

## 9. 性能要求

单写 <100ms、查询 <50ms。图谱 361 节点可整体读入 <1MB。

## 10. 安全要求

所有集合 `doc._openid == auth.openid`，不设 READONLY。

## 11. 测试要点

写 question/不带 uid 查询返回空/异议修正后 revisions[] 新增/导入 361 节点全部写入/batchId 去重。

## 12. 依赖关系

无外部依赖（Layer 0），被 photoUpload/diagnose/dispute/graphService 依赖。

---

## 变更记录

| 版本 | 日期 | 变更说明 |
|------|------|---------|
| v1.0.0 | 2026-08-09 | 初版：五集合 Schema + 索引 + 隔离规则 |
