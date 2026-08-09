# AI 学习助手 — diagnose 诊断管线 详细设计文档

**文档编号**：DES-20260808-004
**版本**：v1.0.0
**状态**：🟡 草稿
**创建日期**：2026-08-08
**最后更新**：2026-08-09
**作者**：task-decomposer（AI）
**所属层次**：Layer 2（编排层——编排 vision/judge/clamp/db）
**关联文档**：`doc/arch/拍照录入MVP_SAD_后端.md`、`scripts/poc/full-pipeline-test.js`

---

## 1. 功能描述

- **诊断管线编排**：接收 batchId → 读照片 → **RAG 检索历史（相似题 top-5）** → Qwen 视觉转录 → DeepSeek 诊断判定（注入历史参考）→ clamp 钳制 → **生成完整报告 → embedding 入库** → 更新批次状态 → 返回报告
- **参考实现**：`scripts/poc/full-pipeline-test.js`（POC 已验证全链路）
- **状态流转**：batch.status：pending → analyzing → completed/failed
- **并行策略**：批次内多张照片并行调 Qwen（减少总耗时）
- **RAG 闭环**：每次诊断的报告 → text-embedding-v4 → mastery_logs 入库 → 下次诊断检索命中（自增强闭环，决策 E3）

## 2. 业务规则

| 规则编号 | 规则描述 |
|----------|----------|
| DI-REG-01 | 诊断仅在 batch.status='pending' 时执行（幂等去重） |
| DI-REG-02 | 单张照片失败不影响整批（C2 降级：标记 + 原图 + 引导重传） |
| DI-REG-03 | 诊断完成更新 batch.status='completed'，记录 totalQuestions/failedCount |
| DI-REG-04 | 超时 120s（云函数限制），超时后标记 'failed' 并返回重试引导 |
| DI-REG-05 | 每张照片的视觉转录原文（traceReport）存档到 questions |

## 3. 接口定义

### 3.1 POST /diagnose — 触发诊断

```yaml
post:
  summary: 触发整批诊断管线
  requestBody:
    required: true
    content:
      application/json:
        schema:
          type: object
          required: [batchId]
          properties:
            batchId:
              type: string
              example: "batch_abc123"
  responses:
    '200':
      content:
        application/json:
          schema:
            type: object
            properties:
              code: {type: integer, example: 0}
              data:
                type: object
                properties:
                  batchId: {type: string}
                  status: {type: string, example: "analyzing"}
                  totalQuestions: {type: integer, example: 4}
                  message: {type: string, example: "诊断已启动"}
    '400':
      content:
        application/json:
          schema:
            type: object
            properties:
              code: {type: integer, example: 40003}
              message: {type: string, example: "批次不存在或已诊断"}
    '500':
      description: 诊断失败
```

### 3.2 GET /getReport — 获取诊断报告

```yaml
get:
  summary: 获取诊断报告
  parameters:
    - name: batchId
      in: query
      required: true
      schema: {type: string}
  responses:
    '200':
      content:
        application/json:
          schema:
            type: object
            properties:
              code: {type: integer}
              data:
                type: object
                properties:
                  batchId: {type: string}
                  status: {type: string}
                  questions:
                    type: array
                    items:
                      type: object
                      properties:
                        questionId: {type: string}
                        questionText: {type: string}
                        questionType: {type: string}
                        isCorrect: {type: boolean}
                        questionCategory: {type: string}
                        difficultyLevel: {type: string}
                        difficultyValue: {type: number}
                        processScore: {type: number}
                        pathQuality: {type: number}
                        transferQuality: {type: null}
                        correctAnswer: {type: string}
                        knowledgeNodeId: {type: string}
                        nodeStatus: {type: string}
                        errorAttribution: {type: string}
                  failedItems:
                    type: array
                    items: {type: object}
```

## 4. 功能逻辑（伪代码）

```
async function handleDiagnose(batchId, userId) {
    const batch = await db.collection('batches').doc(batchId).get();
    if (!batch || batch.data.status !== 'pending') {
        return error(40003, '批次不存在或已诊断');
    }

    // 更新状态为 analyzing
    await db.collection('batches').doc(batchId).update({status: 'analyzing'});

    let totalQuestions = 0, failedCount = 0;
    const results = [];

    // ---- 第一阶段：并行视觉转录 ----
    const images = await getBatchImages(batchId);
    const visionTasks = images.map(async (img) => {
        try {
            const visionReport = await qwenVision(img.fileId);
            return { success: true, imageId: img._id, visionReport };
        } catch (e) {
            return { success: false, imageId: img._id, error: e.message };
        }
    });
    const visionResults = await Promise.all(visionTasks);

    // ---- 第二阶段：逐张诊断 ----
    for (const vr of visionResults) {
        if (!vr.success) {
            // 单张失败：标记 + 原图（C2）
            failedCount++;
            const q = await insertQuestion({batchId, userId, imageFileId: vr.imageId,
                isCorrect: null, nodeStatus: 'unmapped', source: 'photo',
                traceReport: null, status: 'failed'});
            results.push({questionId: q._id, status: 'failed', imageFileId: vr.imageId});
            continue;
        }

        // DeepSeek 诊断（含 rubric 判定 + RAG 历史参考注入）
        const historyHits = await searchHistory(item.questionText, userId);
        const ragContext = buildRagContext(historyHits);
        const rawDiagnosis = await deepseekJudge(vr.visionReport, ragContext);

        // 提取题目列表（一图多题）
        const questionItems = parseQuestionsFromVision(vr.visionReport, rawDiagnosis);

        for (const item of questionItems) {
            totalQuestions++;
            // 参数钳制（clamp 模块）
            const clamped = clamp(item.rawDiagnosis, item.questionType);

            // 写 questions
            const questionData = {
                batchId, userId, imageFileId: vr.imageId,
                questionText: item.questionText, options: item.options,
                questionType: item.questionType,
                studentAnswer: item.studentAnswer,
                correctAnswer: rawDiagnosis.correctAnswer,
                isCorrect: rawDiagnosis.isCorrect,
                questionCategory: rawDiagnosis.questionCategory,
                difficultyLevel: rawDiagnosis.difficultyLevel,
                difficultyValue: clamped.D,
                processScore: clamped.P,
                pathQuality: clamped.eta,
                transferQuality: clamped.r,
                knowledgeNodeId: item.knowledgeNodeId || null,
                nodeStatus: item.knowledgeNodeId ? 'mapped' : 'unmapped',
                errorAttribution: rawDiagnosis.errorAttribution || null,
                traceReport: vr.visionReport,
                source: 'photo',
                revisions: []
            };
            const q = await insertQuestion(questionData);

            // 写 mastery_logs（完整报告 + embedding，供 RAG 检索）
            const report = {
                questionText: item.questionText, options: item.options,
                questionType: item.questionType,
                studentAnswer: item.studentAnswer,
                correctAnswer: rawDiagnosis.correctAnswer,
                isCorrect: rawDiagnosis.isCorrect,
                questionCategory: rawDiagnosis.questionCategory,
                difficultyLevel: rawDiagnosis.difficultyLevel,
                difficultyValue: clamped.D,
                processScore: clamped.P,
                pathQuality: clamped.eta,
                transferQuality: clamped.r,
                knowledgeNodeId: item.knowledgeNodeId || null,
                nodeStatus: item.knowledgeNodeId ? 'mapped' : 'unmapped',
                errorAttribution: rawDiagnosis.errorAttribution || null,
                evidence: [], actionAdvice: null
            };
            const reportText = buildReportText(report);
            const embedding = await embedText(reportText);

            await db.collection('mastery_logs').add({data: {
                userId, questionId: q._id,
                knowledgeNodeId: item.knowledgeNodeId || null,
                algorithm: 'score_poc',
                report,
                reportText,
                embedding,
                createdAt: new Date()
            }});

            results.push({questionId: q._id, status: 'completed', ...clamped});
        }
    }

    // ---- 完成 ----
    await db.collection('batches').doc(batchId).update({
        status: 'completed',
        totalQuestions,
        failedCount,
        completedAt: new Date()
    });

    return { batchId, status: 'completed', totalQuestions, failedCount, questions: results };
}
```

## 5. 算法

### 5.1 Qwen 视觉转录 prompt

```
你是数学学习诊断助手的图像理解阶段。任务：准确转录题目 + 如实描述做题痕迹。不要做诊断判断。
输出 Markdown：# 题目转录（每题：题号/完整题干含所有条件和选项内容/题目形式）
# 做题痕迹观察（按书写顺序逐条：第N步+位置+痕迹；涂改/草稿/最终答案）
# 输出要求：不确定处标(不确定)；看不清写(看不清)；最终答案逐字符精确（≥≤><=符号不能错）；不臆测
```

**参数**：model=qwen3.7-plus, enable_thinking=false, max_tokens=2500

### 5.2 DeepSeek 诊断 rubric（决策 020/021 定稿）

```
■ D 难度：L1~L11 档位钳制+档内自由。第1步判 Lx 档（例子锚：L1求A∩B/L2求√定义域/L3比log/L4△ABC求c/L5裂项/L6含参零点/L7极点极线/L8极值点偏移/L9多高观点/L10竞赛/L11IMO）；第2步档内自由打值
■ 题型分类：回忆类=直接套公式；单元内=本单元变形推理；跨单元=结合≥2单元
■ P（§4.4）：1.0清晰正确/0.5部分正确模糊/0.3错误有思路/0空白
■ η：只对解答题判0.4~1.0（本质解法0.9+）；填空/选择无过程→null
■ r：一律 null
■ isCorrect：严格数学判定。≥ 可能被读成 >（用数学核验）
■ 归因：做错才给；做对 null；不编造
```

**参数**：model=deepseek-chat, temperature=0.2, max_tokens=3000

### 5.3 parseQuestionsFromVision()

从视觉转录 Markdown 中提取每道题（正则分割 + DeepSeek 输出的 JSON 对齐）。一图可能含多题（如 4 道题随堂演练）。

## 6. DDL

不直接建表——questions/mastery_logs/batches 由 databaseSchema 定义。

## 7. 外部接口

| 接口 | 说明 |
|------|------|
| Qwen API（阿里百炼） | 视觉转录，base64 图片 + prompt |
| DeepSeek API | 诊断判定，rubric + vision 转录 |

## 8. 内部接口

| 接口 | 来源 | 说明 |
|------|------|------|
| getBatchImages(batchId) | 内部 | 读 batches + 云存储 |
| qwenVision(fileId) | 内部 | Qwen 视觉客户端 |
| deepseekJudge(report, ragContext) | 内部 | DeepSeek 诊断客户端（注入 RAG 历史） |
| clamp(raw, type) | clamp 模块 | 参数钳制 |
| insertQuestion(data) | databaseSchema | 题目写入 |
| searchHistory(text, userId) | rag 模块 | RAG 检索（top-5 历史相似题） |
| buildRagContext(hits) | rag 模块 | 注入段构建 |
| embedText(text) | rag 模块 | 报告向量化 |
| buildReportText(report) | rag 模块 | 报告文本化 |

## 9. 性能要求

- 单题诊断 ≤60s，整批 ≤3min（9 张并行后）
- 云函数超时 120s（最大限制）

## 10. 安全要求

- Qwen/DeepSeek API key 存环境变量，不落代码/前端
- 诊断结果按 userId 写库（openid 隔离）

## 11. 测试要点

| 场景 | 预期 |
|------|------|
| 4 道题随堂演练 | 全题诊断完成，isCorrect/D/η 有值 |
| 单张照片识别失败 | 该题标记 failed，其他题正常 |
| 重复提交同一 batchId | 拒绝（status≠pending） |
| 整批超时 | status=failed，返回重试引导 |
| 一图多题 | 每道题独立记录 |

## 12. 依赖关系

- 依赖：photoUpload（batchId）、clamp（钳制）、databaseSchema（写入）、**rag（检索 + embedding）**
- 被依赖：dispute（单题重诊需要重新调 judge 判定）

---

## 变更记录

| 版本 | 日期 | 变更说明 |
|------|------|---------|
| v1.0.0 | 2026-08-09 | 初版：诊断管线编排 + Qwen/DeepSeek prompt 结构 |
