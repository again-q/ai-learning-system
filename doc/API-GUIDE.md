# 云函数 API 规范指南

> 适用于微信小程序 + CloudBase 云开发项目  
> 目标：统一所有云函数返回格式、错误码、入参约定与代码风格

---

## 1. 统一返回格式

所有云函数必须返回以下固定结构：

```json
{ "code": 0, "data": { ... }, "message": "ok" }
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `code` | number | 状态码，0 表示成功，非 0 表示错误 |
| `data` | object / array / null | 业务数据，成功时必填，失败时为 `null` |
| `message` | string | 提示信息，成功为 `"ok"`，失败为具体错误描述 |

**示例**：

```json
{ "code": 0, "data": { "_id": "abc123", "name": "函数" }, "message": "ok" }
{ "code": 0, "data": [ { "id": 1 }, { "id": 2 } ], "message": "ok" }
{ "code": 1001, "data": null, "message": "缺少必填参数: name" }
```

> ⚠️ **当前问题**：`userLogin` 成功时缺 `message`，`manageKnowledge` 错误码用 `-1`，`quickstartFunctions` 用 `{ success: true, errMsg: ... }`。统一后全部按本规范整改。

---

## 2. 错误码规范

| 范围 | 类别 | 说明 |
|------|------|------|
| `0` | 成功 | 请求正常处理 |
| `1xxx` | 业务错误 | 调用方问题，如参数校验、资源不存在、权限不足 |
| `2xxx` | 系统错误 | 服务端异常，如数据库错误、第三方接口失败 |

### 业务错误码（1xxx）

| 码 | 含义 | 场景 |
|----|------|------|
| `1001` | 缺少必填参数 | `event` 中未传必要字段 |
| `1002` | 资源不存在 | 查询的记录或文档未找到 |
| `1003` | 参数格式错误 | 参数类型/值域非法 |
| `1004` | 操作不允许 | 权限不足或状态冲突 |
| `1005` | 操作重复 | 重复创建/提交 |
| `1006` | 无效操作 | `action` 值不在支持列表中 |

### 系统错误码（2xxx）

| 码 | 含义 | 场景 |
|----|------|------|
| `2001` | 数据库异常 | 数据库读写/网络超时 |
| `2002` | 云存储异常 | 文件上传/下载失败 |
| `2003` | 第三方 API 异常 | 微信开放能力调用失败 |
| `2004` | 未知错误 | 未捕获的异常 |

---

## 3. 入参规范

### 3.1 路由方式

多操作云函数统一通过 `event.action` 字段路由，禁止使用 `event.type` 或其他字段。

```javascript
// ✅ 正确
switch (event.action) {
  case 'list':    /* ... */ break;
  case 'add':     /* ... */ break;
  default:
    return { code: 1006, data: null, message: '无效操作: ' + event.action };
}

// ❌ 错误 —— 不应使用 type 字段
switch (event.type) { ... }
```

### 3.2 前端调用示例

```javascript
wx.cloud.callFunction({
  name: 'manageKnowledge',
  data: { action: 'list', subjectId: 'math' }
}).then(res => {
  const { code, data, message } = res.result;
  if (code !== 0) return wx.showToast({ title: message, icon: 'none' });
  // 渲染 data ...
});
```

### 3.3 参数校验

使用「提前返回 + 语义化错误码」模式：

```javascript
if (!name) {
  return { code: 1001, data: null, message: '缺少必填参数: name' };
}
if (typeof difficulty !== 'number' || difficulty < 0 || difficulty > 1) {
  return { code: 1003, data: null, message: 'difficulty 需为 0~1 的数字' };
}
```

---

## 4. 命名规范

### 云函数名

格式：**动词 + 名词**，小驼峰

| 云函数 | 说明 |
|--------|------|
| `userLogin` | ✅ 用户登录 |
| `manageKnowledge` | ✅ 知识管理 |
| `quickstartFunctions` | ❌ 模板残留，见第 7 节 |

### action 值

格式：**动词**，全小写

| action | 说明 | action | 说明 |
|--------|------|--------|------|
| `list` | 查询列表 | `get` | 查询单个详情 |
| `add` | 新增 | `update` | 更新 |
| `delete` | 删除 | `login` | 登录（单操作云函数） |

> 单操作云函数（如 `userLogin`）可省略 `action`，直接使用入参。

---

## 5. 错误处理规范

### 5.1 代码骨架

每个云函数的主入口必须用 `try-catch` 包裹：

```javascript
exports.main = async (event) => {
  try {
    // 业务逻辑 ...
  } catch (err) {
    console.error(`[FUNCTION_NAME]`, err);
    return { code: 2004, data: null, message: '服务器内部错误，请稍后重试' };
  }
};
```

### 5.2 区分业务异常与系统异常

- **业务异常**（调用方修复）：提前校验返回 1xxx 错误码
- **系统异常**（开发方排查）：catch 里返回 2xxx 错误码，可细化

```javascript
catch (err) {
  console.error('[manageKnowledge]', err);
  if (err && err.errCode === -502005) {
    return { code: 2001, data: null, message: '数据库服务暂时不可用' };
  }
  return { code: 2004, data: null, message: '服务器内部错误' };
}
```

### 5.3 日志规范

- 使用 `console.error` 记录异常，tag 为 `[云函数名]`
- 关键操作可打印摘要，但**禁止**打印 `_openid` 等敏感字段
- 调试日志用 `console.log`，最终上线前清理

```javascript
console.log(`[manageKnowledge] action=${action} nodeId=${nodeId}`);  // ✅
console.log('[manageKnowledge] openid:', openid);                    // ❌ 敏感信息
```

---

## 6. 完整云函数示例模板

`cloudfunctions/manageKnowledge/index.js`（按本规范整改后）：

```javascript
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const FUNC_NAME = 'manageKnowledge';

exports.main = async (event) => {
  try {
    const { action, subjectId, nodeId, type, data } = event;

    switch (action) {
      case 'list': {
        const where = {};
        if (subjectId) where.subjectId = subjectId;
        if (type) where.type = type;
        const res = await db.collection('knowledge_nodes')
          .where(where).orderBy('chapter', 'asc').get();
        return { code: 0, data: res.data, message: 'ok' };
      }

      case 'add': {
        if (!data || !data.name || !data.subjectId) {
          return { code: 1001, data: null, message: '缺少必填参数: name / subjectId' };
        }
        const doc = {
          subjectId: data.subjectId, type: data.type || 'concept',
          name: data.name, deps: data.deps || [],
          difficulty: data.difficulty || 0.5, chapter: data.chapter || '',
          createdAt: db.serverDate()
        };
        const res = await db.collection('knowledge_nodes').add({ data: doc });
        return { code: 0, data: { _id: res._id, ...doc }, message: 'ok' };
      }

      case 'update': {
        if (!nodeId) return { code: 1001, data: null, message: '缺少 nodeId' };
        const updateData = {};
        ['name','type','difficulty','chapter','deps','abilityMapping'].forEach(k => {
          if (data[k] !== undefined) updateData[k] = data[k];
        });
        if (Object.keys(updateData).length === 0) {
          return { code: 1003, data: null, message: '无可更新字段' };
        }
        await db.collection('knowledge_nodes').doc(nodeId).update({ data: updateData });
        return { code: 0, data: null, message: 'ok' };
      }

      case 'delete': {
        if (!nodeId) return { code: 1001, data: null, message: '缺少 nodeId' };
        await db.collection('knowledge_nodes').doc(nodeId).remove();
        return { code: 0, data: null, message: 'ok' };
      }

      default:
        return { code: 1006, data: null, message: '无效操作: ' + action };
    }
  } catch (err) {
    console.error(`[${FUNC_NAME}]`, err);
    return { code: 2004, data: null, message: '服务器内部错误，请稍后重试' };
  }
};
```

---

## 7. 需清理项：quickstartFunctions

**`cloudfunctions/quickstartFunctions/`** 是 CloudBase 初始化时生成的模板示例（带 `sales` 表演示代码），存在以下问题：

| 问题 | 说明 |
|------|------|
| 格式不统一 | 使用 `{ success: true, errMsg: ... }` 而非 `{ code, data, message }` |
| 路由字段错误 | 使用 `event.type` 而非 `event.action` |
| 残留演示数据 | `sales` 集合与本项目无关 |
| 注释含被删引用 | 含被注释掉的旧 require 路径 |

**建议操作**：

1. 确认没有前端页面依赖 `quickstartFunctions`（全局搜索 `.callFunction` 含 `quickstartFunctions`）
2. 若无依赖，直接删除：`rm -rf cloudfunctions/quickstartFunctions`
3. 若有依赖，创建等价的新云函数并按本规范重写，迁移后再删除

---

## 附录：快速对照表

| 维度 | 规范要求 | 违规现状 |
|------|----------|----------|
| 返回格式 | `{ code, data, message }` | `-1` 错误码 / `success` 字段混用 |
| 路由字段 | `event.action` | `quickstartFunctions` 用 `event.type` |
| 成功 message | `"ok"` | `userLogin` 缺 message |
| 错误 message | 中文描述 | `manageKnowledge` 直接暴露 `err.message` |
| 错误码 | 0 / 1xxx / 2xxx | 用 `-1` 代替 |
| 模板残留 | 不应存在 | `quickstartFunctions` 含 sales 演示代码 |
