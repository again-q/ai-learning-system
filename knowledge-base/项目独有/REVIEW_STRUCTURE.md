# 项目结构自查报告

> 生成日期：2026-07-14  
> 范围：前端 miniprogram/ + 云函数 cloudfunctions/  
> 目的：在开始核心开发前扫清结构债

---

## 等级说明

| 等级 | 含义 | 处理建议 |
|------|------|---------|
| 🔴 堵塞级 | 不改会影响后续开发效率 | 开始编码前必须解决 |
| 🟡 风险级 | 不改可能在未来积累成屎山 | 建议在 MVP 阶段解决 |
| 🟢 建议级 | 非必要，重构时可考虑 | 标记即可 |

---

## 🔴 堵塞级（2 项）

### 1. 无数据层抽象

**现状**：每个页面直接在 js 里硬编码 mock 数据或直接调云函数

```
index.js → 第74-100行硬编码 mockMastery/mockSuggest
graph.js → 直接使用 data.dimensions 硬编码
study.js → 回复硬编码 getReply()
```

**后果**：后续接入真实数据时，每个页面都要改，且改动散布在各处。

**解决方案**：新建 `miniprogram/services/` 目录，统一数据服务层

```
services/
  dataService.js    → getMastery(), getProgress(), getDiagnosis()
  cloudService.js   → 封装 wx.cloud.callFunction，统一错误处理
  authService.js    → 登录/用户状态管理
```

页面只调用 service 方法，不直接操作云函数或硬编码数据。

---

### 2. 云函数无统一规范

**现状**：三个云函数各自为政

| 问题 | 表现 |
|------|------|
| 返回格式不统一 | manageKnowledge 用 `{ code, data }`，quickstart 直接 return 数据 |
| 无统一错误码 | 错误时有的返回 `-1`，有的直接抛异常 |
| 无入参校验 | manageKnowledge 只有 add 做了校验，update/delete 没有 |
| action 路由不透明 | 前端必须知道 action 字符串拼写才能调用 |

**解决方案**：统一云函数返回格式

```javascript
// 统一格式
{
  code: 0,         // 0=成功，正数=业务错误，负数=系统错误
  data: {...},     // 业务数据
  message: 'ok'    // 错误描述
}
```

封装 `utils/cloud-response.js`，所有云函数使用同一套工具函数：

```javascript
// 成功
return success({ id: 'xxx' })
// 返回 { code: 0, data: { id: 'xxx' }, message: 'ok' }

// 错误
return fail('PARAM_MISSING', '缺少必要参数')
// 返回 { code: 1001, data: null, message: '缺少必要参数' }
```

---

## 🟡 风险级（3 项）

### 3. 页面导航关系混乱

**现状**：

```
我的页 → 登录页（navigateTo）         ❌ 语义不对
维度详情 → 方法列表（switchTab）       ❌ navigateTo 到 switchTab
登录成功 → 首页（switchTab）           ✅
首页 → 学习页（switchTab）             ✅
```

**问题**：`switchTab` 只能跳转 tabBar 页面，但当前有从非 tabBar 页面（维度详情）跳转到 tabBar 页面（方法列表）时用了 `switchTab`——这会导致原页面从页面栈中移除。而 `navigateTo` 到登录页表示"去登录"，但登录是流程不是页面。

**建议**：
- 登录用 `wx.getUserProfile` + `wx.cloud.callFunction` 在 app.js 处理，不要作为独立页面
- 维度详情 → 方法列表 用 `navigateTo`，不要 `switchTab`

---

### 4. 云函数职责边界模糊

**现状**：

| 云函数 | 操作的集合 | 是否必要 |
|--------|-----------|---------|
| manageKnowledge | knowledge_nodes, node_progress | ✅ 核心 |
| userLogin | users | ✅ 核心 |
| quickstartFunctions | sales | ❌ 模板残留 |

**quickstartFunctions** 是微信云开发模板自带的示例，操作的 `sales` 集合和业务完全无关。它还在线上是因为没有被删，但每次部署云函数都会把它一起部署上去。

**建议**：清理 `cloudfunctions/quickstartFunctions/` 目录和相关集合。

---

### 5. 缺少统一的 LLM 调用封装

**现状**：当前没有云函数需要 LLM（因为还在理论阶段），但根据框架设计，K/A/Q 三个维度都需要 LLM 判定：

```
K → LLM 判定难度（5维度），过程分（4档）
A → LLM 判定 D（鉴别力），η（路径质量）
Q → LLM 评思维链（3维度）
```

如果不提前封装，后续会出现：

```
manageK/index.js → 直接调一个 LLM API
manageA/index.js → 又调一次同样的 LLM API
各写各的 prompt，各写各的重试逻辑
```

**建议**：先建一个空的 `cloudfunctions/shared/llm.js`，定义统一的 LLM 调用接口。各维度云函数按需引用。

---

## 🟢 建议级（2 项）

### 6. 无环境/配置管理

当前环境 ID `cloud1-d8g0ty39wd73f430a` 硬编码在 `app.js` 第4行。后续如果有测试/生产环境区分，需要改代码。

建议抽成 `miniprogram/config.js`：

```javascript
// config.js
const ENV = {
  development: { envId: 'cloud1-dev-xxx' },
  production:  { envId: 'cloud1-d8g0ty39wd73f430a' }
}
export default ENV[__wxConfig.envVersion || 'production']
```

### 7. 页面公共逻辑未复用

多处页面重复了相同的代码模式：

- 页面淡入动画（`pageReady` + `setTimeout`）
- Canvas 环形图绘制
- 学科切换器 picker

建议后续抽取为自定义组件或 utils 函数。

---

## 处理优先级

```
立即（开始编码前）：
  1. 统一云函数返回格式 → 影响所有后续云函数
  2. 清理 quickstartFunctions → 避免混淆

本周内：
  3. 建 services/ 数据层 → 后续页面接入真实数据时不改烂
  4. 建 shared/llm.js 封装 → 先定义接口，暂不实现

可延后：
  5. 页面导航整理 → 等页面少的时候统一改
  6. config.js → 等需要多环境时再做
  7. 公共组件抽象 → 重构时再抽
```
