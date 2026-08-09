# AI 学习助手 — rag 向量检索 详细设计文档

**文档编号**：DES-20260808-010
**版本**：v1.0.0
**状态**：🟡 草稿
**创建日期**：2026-08-08
**最后更新**：2026-08-09
**作者**：task-decomposer（AI）
**所属层次**：Layer 1（服务层——被 diagnose 依赖）
**关联文档**：`doc/arch/拍照录入MVP_SAD_后端.md`、`doc/detailed/databaseSchema_数据模型.md`、`doc/detailed/diagnose_诊断管线.md`

---

## 1. 功能描述

- **报告 embedding**：诊断完成后，将完整报告文本化（reportText）→ text-embedding-v4 向量化 → 存入 mastery_logs.embedding
- **RAG 检索**：下次诊断前，用当前题目文本 embedding → cosine 相似度检索该生历史记录（top-5）→ 注入 DeepSeek prompt 增强诊断
- **检索范围**：仅当前学生自己的历史（userId 隔离）

## 2. 业务规则

| 规则编号 | 规则描述 |
|----------|----------|
| RAG-REG-01 | embedding 模型固定 text-embedding-v4（技术选型已定） |
| RAG-REG-02 | 检索仅限同 userId（数据隔离，不跨学生检索） |
| RAG-REG-03 | top-K = 5（技术选型已定） |
| RAG-REG-04 | 每次生成报告后实时计算（~7200 条/学期，无缓存必要） |
| RAG-REG-05 | 检索结果注入 prompt 时附「历史参考」标记，供 DeepSeek 参考但不强制采纳 |

## 3. 接口定义

### 3.1 embedReport(reportText) — 内部函数

```yaml
# 伪契约（内部函数）
embedReport:
  input:
    reportText: string   # 报告文本化拼接
  output:
    embedding: array      # 1536 维向量
```

### 3.2 searchHistory(questionText, userId, topK=5) — 内部函数

```yaml
# 伪契约（内部函数）
searchHistory:
  input:
    questionText: string
    userId: string
    topK: int = 5
  output:
    hits:
      type: array
      items:
        score: number      # cosine 相似度
        reportText: string # 历史报告文本
        isCorrect: boolean # 历史对错
        difficultyLevel: string
        knowledgeNodeId: string
```

## 4. 功能逻辑（伪代码）

```
const EMBEDDING_MODEL = 'text-embedding-v4';
const EMBEDDING_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings';
const TOP_K = 5;

// ---- 报告文本化（diagnose 调用）----
function buildReportText(report) {
    return `题目：${report.questionText} | 作答：${report.studentAnswer} | ` +
           `判定：${report.isCorrect ? '对' : '错'} | 题型：${report.questionCategory} | ` +
           `难度：${report.difficultyLevel} | 知识点：${report.knowledgeNodeId}`;
}

// ---- embedding（诊断完成后调用）----
async function embedText(text) {
    const resp = await fetch(EMBEDDING_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${QWEN_API_KEY}` },
        body: JSON.stringify({ model: EMBEDDING_MODEL, input: text })
    });
    const data = await resp.json();
    return data.data[0].embedding;
}

// ---- cosine 相似度 ----
function cosine(a, b) {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

// ---- RAG 检索（诊断前调用）----
async function searchHistory(questionText, userId, topK = TOP_K) {
    const queryEmbedding = await embedText(questionText);

    // 拉取该生最近 N 条历史（限 userId）
    const logs = await db.collection('mastery_logs')
        .where({ userId })
        .orderBy('createdAt', 'desc')
        .limit(200)
        .get();

    // 线性扫描 cosine（轻量自建，~200 条无压力）
    const scored = logs.data
        .filter(log => log.embedding)
        .map(log => ({
            score: cosine(queryEmbedding, log.embedding),
            reportText: log.reportText,
            isCorrect: log.report.isCorrect,
            difficultyLevel: log.report.difficultyLevel,
            knowledgeNodeId: log.report.knowledgeNodeId
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

    return scored;
}

// ---- 构建 RAG 注入段（diagnose 调用）----
function buildRagContext(hits) {
    if (!hits.length) return '';
    return hits.map((h, i) =>
        `[历史参考 ${i + 1}] 题目：${h.reportText}（当时判定：${h.isCorrect ? '对' : '错'}，相似度 ${h.score.toFixed(2)}）`
    ).join('\n');
}
```

## 5. 算法

- **cosine 相似度**：O(n)（1536 维，单次 <1ms）
- **线性扫描**：O(N)（N=200 条历史，云函数内 for 循环，技术选型已定轻量自建）
- **top-K**：排序取前 5

## 6. DDL

mastery_logs 新增字段：`report`（Object）、`reportText`（String）、`embedding`（Array）——见 databaseSchema §3.3。

## 7. 外部接口

| 接口 | 说明 |
|------|------|
| text-embedding-v4（阿里百炼 embeddings API） | 文本 → 向量，¥0.50/百万 tokens |

## 8. 内部接口

| 接口 | 调用方 | 说明 |
|------|--------|------|
| embedText(text) | diagnose（写库前）、searchHistory（查询前） | 向量化 |
| searchHistory(questionText, userId) | diagnose（诊断前） | RAG 检索 |
| buildRagContext(hits) | diagnose | 注入段构建 |

## 9. 性能要求

- 单次 embedding <500ms
- 检索（200 条 cosine）<50ms
- 整体增加 <1s（在 120s 预算内）

## 10. 安全要求

- 检索严格限 userId（不跨学生）
- embedding key 用 Qwen API key（环境变量）

## 11. 测试要点

| 场景 | 预期 |
|------|------|
| 报告入库 | mastery_logs 含 report/reportText/embedding |
| 检索同类题 | 相似度排序正确，top-5 返回 |
| 无历史记录 | 返回空数组，RAG 注入段为空（不阻塞诊断） |
| 跨用户隔离 | 只检索该生自己的记录 |

## 12. 依赖关系

- 依赖：databaseSchema（mastery_logs 读写）、阿里百炼 embeddings API
- 被依赖：diagnose（诊断前检索 + 诊断后入库）

---

## 变更记录

| 版本 | 日期 | 变更说明 |
|------|------|---------|
| v1.0.0 | 2026-08-09 | 初版：RAG 完整链路（embedding + cosine + top-5 注入） |
