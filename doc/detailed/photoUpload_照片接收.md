# AI 学习助手 — photoUpload 照片接收 详细设计文档

**文档编号**：DES-20260808-003
**版本**：v1.0.0
**状态**：🟡 草稿
**创建日期**：2026-08-08
**最后更新**：2026-08-09
**作者**：task-decomposer（AI）
**所属层次**：Layer 1（服务层）
**关联文档**：`doc/arch/拍照录入MVP_SAD_后端.md`

---

## 1. 功能描述

- 接收学生拍照批次（1-9 张照片），上传到云存储，在 batches 集合登记批次
- 返回 batchId 供 diagnose 触发诊断

## 2. 业务规则

| 规则编号 | 规则描述 |
|----------|----------|
| PH-REG-01 | 一批最多 9 张，超出拒绝并提示 |
| PH-REG-02 | 批次创建时 status='pending'，诊断完成后更新 |
| PH-REG-03 | 批次归属 student openid（userId 隔离） |

## 3. 接口定义

### 3.1 POST /photoUpload — 接收照片批次

```yaml
post:
  summary: 接收学生拍照批次
  requestBody:
    required: true
    content:
      multipart/form-data:
        schema:
          type: object
          required: [files]
          properties:
            files:
              type: array
              items: {type: string, format: binary}
              maxItems: 9
              description: 照片文件列表
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
                  batchId: {type: string, example: "batch_abc123"}
                  imageCount: {type: integer, example: 4}
                  fileIds: {type: array, items: {type: string}, example: ["cloud://file1.jpg", "cloud://file2.jpg"]}
    '400':
      content:
        application/json:
          schema:
            type: object
            properties:
              code: {type: integer, example: 40001}
              message: {type: string, example: "最多9张照片"}
    '401':
      description: 未登录
    '500':
      description: 上传失败
```

## 4. 功能逻辑（伪代码）

```
async function handlePhotoUpload(files, userId) {
    if (files.length > 9) {
        return error(40001, '最多9张照片');
    }
    if (files.length === 0) {
        return error(40002, '请选择照片');
    }

    // 逐张上传到云存储
    const fileIds = [];
    for (const file of files) {
        const result = await cloud.uploadFile({
            cloudPath: `photos/${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`,
            fileContent: file
        });
        fileIds.push(result.fileID);
    }

    // 登记批次
    const batch = {
        userId,
        imageCount: files.length,
        status: 'pending',
        createdAt: new Date()
    };
    const result = await db.collection('batches').add({data: ensureIsolation(batch, userId)});

    return {
        code: 0,
        data: {
            batchId: result._id,
            imageCount: files.length,
            fileIds
        }
    };
}
```

## 5. 算法

无（文件上传 + 数据写入）。

## 6. DDL

不直接建表——batches 集合由 databaseSchema 定义。

## 7. 外部接口

| 接口 | 说明 |
|------|------|
| cloud.uploadFile() | CloudBase 云存储上传 |
| db.collection('batches').add() | 文档数据库写入 |

## 8. 内部接口

| 接口 | 调用方 | 说明 |
|------|--------|------|
| 无 | — | — |

## 9. 性能要求

- 单张上传 <5s，9 张并行 <10s
- 云函数超时 60s（充裕）

## 10. 安全要求

- 文件名校验（仅允许 jpg/jpeg/png/webp）
- 单张 <10MB（PRD §5.5）
- 照片存储路径含 userId（便于后续隔离/清理）

## 11. 测试要点

| 场景 | 预期 |
|------|------|
| 上传 4 张 | 成功，返回 batchId + 4 fileIds |
| 上传 10 张 | 拒绝（40001） |
| 上传 0 张 | 拒绝（40002） |
| 无登录 | 拒绝（401） |
| 非图片文件 | 拒绝（文件名校验） |

## 12. 依赖关系

- 依赖：databaseSchema（batches 集合写入）
- 被依赖：diagnose（触发诊断需要 batchId）

---

## 变更记录

| 版本 | 日期 | 变更说明 |
|------|------|---------|
| v1.0.0 | 2026-08-09 | 初版：照片接收 + 批次登记 |
