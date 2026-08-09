# AI 学习助手 — dispute 异议重诊 详细设计文档

**文档编号**：DES-20260808-005
**版本**：v1.0.0
**状态**：🟡 草稿
**创建日期**：2026-08-08
**最后更新**：2026-08-09
**作者**：task-decomposer（AI）
**所属层次**：Layer 2（服务层）
**关联文档**：`doc/arch/拍照录入MVP_SAD_后端.md`

---

## 1. 功能描述

- 学生对某题发起异议 → 修正关键字段 → 仅该题重新诊断（决策 018）
- 修正记录以 revisions[] 追加到 questions 集合（决策 016：可回溯）
- 单题重诊不触发整批重跑（BR-005）

## 2. 业务规则

| 规则编号 | 规则描述 |
|----------|----------|
| DR-REG-01 | 仅可修正关键字段：studentAnswer / correctAnswer / difficultyLevel / isCorrect（按需） |
| DR-REG-02 | 修正后仅该题重新诊断（调用 judge + clamp），批次其他题不变 |
| DR-REG-03 | 修正记录以 revisions[] 追加，不覆盖原值（决策 016） |
| DR-REG-04 | 单题重诊不影响 batch.status 和 mastery_logs 旧记录（mastery_logs 追加新条） |

## 3. 接口定义

### 3.1 POST /disputeQuestion — 异议修正

```yaml
post:
  summary: 学生修正某题信息并触发重诊
  requestBody:
    required: true
    content:
      application/json:
        schema:
          type: object
          required: [questionId, corrections]
          properties:
            questionId: {type: string}
            corrections:
              type: object
              properties:
                studentAnswer: {type: string, example: "a≥4"}
                note: {type: string, example: "我是≥不是>"}
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
                  questionId: {type: string}
                  newDiagnosis:
                    type: object
                    properties:
                      isCorrect: {type: boolean}
                      correctAnswer: {type: string}
                      difficultyLevel: {type: string}
                      difficultyValue: {type: number}
                      processScore: {type: number}
                      pathQuality: {type: number}
    '400':
      description: 题目不存在或不可修正
```

## 4. 功能逻辑（伪代码）

```
async function handleDispute(questionId, corrections, userId) {
    const q = await db.collection('questions').doc(questionId).get();
    if (!q || q.data.userId !== userId) return error(404, '题目不存在');

    // 1. 追加修正记录到 revisions[]
    const revision = {field: 'studentAnswer', originalValue: q.data.studentAnswer,
        revisedValue: corrections.studentAnswer, source: 'student_revision',
        note: corrections.note || '', createdAt: new Date()};

    // 2. 重新诊断
    const rawDiagnosis = await deepseekJudgeWithCorrection(q.data, corrections);

    // 3. 钳制
    const clamped = clamp(rawDiagnosis, q.data.questionType);

    // 4. 更新 questions 当前值 + revisions
    await db.collection('questions').doc(questionId).update({
        studentAnswer: corrections.studentAnswer || q.data.studentAnswer,
        isCorrect: rawDiagnosis.isCorrect,
        correctAnswer: rawDiagnosis.correctAnswer,
        difficultyLevel: rawDiagnosis.difficultyLevel,
        difficultyValue: clamped.D,
        processScore: clamped.P,
        pathQuality: clamped.eta,
        revisions: _.push(revision)
    });

    // 5. 追加 mastery_logs（新条目，不覆盖旧记录）
    await db.collection('mastery_logs').add({data: {
        userId, questionId, algorithm: 'score_poc',
        snapshot: {isCorrect: rawDiagnosis.isCorrect, ...clamped},
        createdAt: new Date()
    }});

    return {questionId, newDiagnosis: {isCorrect: rawDiagnosis.isCorrect, ...clamped}};
}
```

## 5. 算法

无——复用 diagnose 的 judge 判定（deepseekJudgeWithCorrection 在 judge prompt 基础上追加修正说明）。

## 6-8. DDL/外部接口/内部接口

DDL：revisions[] 结构由 databaseSchema 定义。
外部：deepseekJudgeWithCorrection 调 DeepSeek（同 diagnose）。
内部：clamp（钳制）、databaseSchema（读写）。

## 9. 性能要求

单题重诊 ≤30s（仅一次 judge 调用）。

## 10. 安全要求

修正仅限本人题目（userId 校验）。

## 11. 测试要点

| 场景 | 预期 |
|------|------|
| 修正 a>4→a≥4 后重诊 | isCorrect 从 false 变为 true |
| 修正后 revisions[] | 新增 1 条记录 |
| master_logs 修正后 | 2 条记录（原 + 新） |
| 修正他人题目 | 拒绝 404 |
| 修正不存在的 questionId | 拒绝 404 |

## 12. 依赖关系

- 依赖：diagnose（judge 判定）、clamp、databaseSchema
- 被依赖：小程序报告页

---

## 变更记录

| 版本 | 日期 | 变更说明 |
|------|------|---------|
| v1.0.0 | 2026-08-09 | 初版：异议修正 + 单题重诊 |
