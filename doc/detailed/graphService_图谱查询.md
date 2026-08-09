# AI 学习助手 — graphService 图谱查询 详细设计文档

**文档编号**：DES-20260808-006
**版本**：v1.0.0
**状态**：🟡 草稿
**创建日期**：2026-08-08
**最后更新**：2026-08-09
**作者**：task-decomposer（AI）
**所属层次**：Layer 2（服务层）
**关联文档**：`doc/arch/拍照录入MVP_SAD_后端.md`

---

## 1. 功能描述

- 提供知识图谱层级数据（361 节点，按章→节→知识点组织）
- 支持：根节点列表 / 子树查询 / 单节点详情
- 数据源：knowledge_nodes 集合（一次性从本地 knowledge-graph/nodes/*.json 导入）

## 2. 业务规则

| 规则编号 | 规则描述 |
|----------|----------|
| GR-REG-01 | 图谱数据公开可读（不绑定 userId） |
| GR-REG-02 | 节点类型 5 种：definition/property/notation/method/example |

## 3. 接口定义

### 3.1 GET /getGraph — 图谱层级查询

```yaml
get:
  summary: 获取知识图谱数据
  parameters:
    - name: parentId
      in: query
      required: false
      schema: {type: string}
      description: 父节点ID（空=根节点）
    - name: nodeId
      in: query
      required: false
      schema: {type: string}
      description: 单节点ID（获取详情）
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
                  nodes:
                    type: array
                    items:
                      type: object
                      properties:
                        knowledgeId: {type: string}
                        name: {type: string}
                        type: {type: string}
                        level: {type: integer}
                        childCount: {type: integer}
                        hasChildren: {type: boolean}
                  currentNode:
                    type: object
                    description: 仅 nodeId 参数时返回
                    properties:
                      knowledgeId: {type: string}
                      name: {type: string}
                      type: {type: string}
                      concept: {type: object}
                      importance: {type: object}
```

## 4. 功能逻辑（伪代码）

```
async function getGraph(parentId, nodeId, userId) {
    if (nodeId) {
        // 单节点详情
        const node = await db.collection('knowledge_nodes').where({knowledgeId: nodeId}).get();
        if (!node.data.length) return error(404, '节点不存在');
        return {currentNode: node.data[0]};
    }

    // 子树查询
    let query = {};
    if (parentId) {
        query.parentId = parentId;
    } else {
        // 根节点（level=1 的章）
        query.level = 1;
    }
    const result = await db.collection('knowledge_nodes').where(query).get();

    // 标注是否有子节点
    const nodes = await Promise.all(result.data.map(async (n) => {
        const children = await db.collection('knowledge_nodes')
            .where({parentId: n.knowledgeId}).count();
        return {...n, childCount: children.total, hasChildren: children.total > 0};
    }));

    return {nodes};
}
```

## 5. 算法

无（单表查询 + 计数）。

## 6. DDL

knowledge_nodes 由 databaseSchema 定义。

## 7. 外部接口

无。

## 8. 内部接口

| 接口 | 调用方 | 说明 |
|------|--------|------|
| getGraph(parentId, nodeId) | 小程序知识图谱页 | 层级浏览 / 节点详情 |

## 9. 性能要求

- 子树查询（最多 ~30 节点/层）<50ms
- 首次加载根节点可整体缓存（361 节点 <1MB）

## 10. 安全要求

图谱数据公开可读（不含学生数据，无需 userId 隔离）。

## 11. 测试要点

| 场景 | 预期 |
|------|------|
| parentId 为空 | 返回所有根节点（章） |
| 传入 parentId | 返回该章下的节/知识点 |
| 传入 nodeId | 返回节点详情 |
| 不存在的 nodeId | 404 |

## 12. 依赖关系

- 依赖：databaseSchema（knowledge_nodes 读取）
- 被依赖：小程序知识图谱页

---

## 变更记录

| 版本 | 日期 | 变更说明 |
|------|------|---------|
| v1.0.0 | 2026-08-09 | 初版：图谱层级查询 + 节点详情 |
