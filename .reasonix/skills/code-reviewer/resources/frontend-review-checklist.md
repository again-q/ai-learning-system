# 前端代码评审检查清单

## 目录

| 维度 | 章节 | 行数参考 |
|------|------|---------|
| 6.1 前端编码规范 | 命名规范、TypeScript 规范、代码风格、分层规范 | §维度6.1 |
| 6.2 前端业务逻辑一致性 | 页面展示、表单提交、状态映射、异常处理 | §维度6.2 |
| 6.3 前端安全检查 | Token 存储（P0）、XSS 防护、路由守卫、API 安全、敏感信息 | §维度6.3 |
| 6.4 前端性能反模式 | 路由懒加载、渲染性能、响应式性能、网络请求优化 | §维度6.4 |
| 6.5 前端可维护性 | 组件复杂度、重复代码、硬编码、路由规范、注释质量 | §维度6.5 |
| 6.6 框架特化检查 | Vue3 专项（Composition API/Pinia/模板）、React 专项（Hooks/渲染优化/Zustand） | §维度6.6 |
| 速查表 | 13 个高频反模式、危害、正确做法、等级 | §前端反模式速查表 |

---

> **框架适用说明**：本文件包含 Vue3 和 React 双框架的前端检查项。
> 当 LC-FE-001 = Vue3 时，使用 Vue3 专项检查项；当 LC-FE-001 = React 时，使用 React 专项检查项。
> 通用检查项（不带框架标注的）对两种框架均适用。
>
> **与后端检查清单的关系**：本文件是 `review-checklist.md` 的前端补充，
> 全栈模式下两份文件均需加载。本文件聚焦前端特有的问题，
> 不重复后端已覆盖的通用规则（如日志、事务等）。

本文件包含前端六个维度的完整检查清单，供 code-reviewer 技能在全栈模式下执行前端评审时加载使用。

---

## 维度6.1：前端编码规范检查清单

### 6.1.1 命名规范
- [ ] 组件文件名使用 PascalCase（如 `UserList.vue`、`UserForm.tsx`）
- [ ] 组件内部名称（`name` 属性 / 函数名）与文件名一致
- [ ] composable 函数命名以 `use` 开头（如 `useUserList`、`useFormSubmit`）
- [ ] React hook 命名以 `use` 开头（如 `useUserList`、`useFormSubmit`）
- [ ] Store 文件命名：Vue3 使用 `use{Module}Store`，React 使用 `{module}Store`
- [ ] 类型/接口命名使用 PascalCase（如 `UserVO`、`CreateUserRequest`）
- [ ] 常量命名使用 UPPER_SNAKE_CASE（如 `MAX_PAGE_SIZE`）
- [ ] 事件处理函数命名以 `handle` 开头（如 `handleSubmit`、`handleDelete`）

### 6.1.2 TypeScript 规范
- [ ] 无 `any` 类型滥用（每处 `any` 必须有注释说明原因）
- [ ] 接口/类型定义从 `types/` 目录导入，不在组件内重复定义
- [ ] 函数参数和返回值有明确的类型注解
- [ ] 泛型使用合理（如 `ref<UserVO | null>(null)` 而非 `ref(null)`）
- [ ] 枚举值使用 `const enum` 或常量对象，不使用魔法数字

### 6.1.3 代码风格
- [ ] 无 `console.log`、`console.error`、`debugger` 未清理（生产代码）
- [ ] 无注释掉的代码块（应删除，版本控制会保留历史）
- [ ] import 语句按规范排序（框架 → 第三方库 → 内部模块）
- [ ] 无未使用的 import（会增加 bundle 体积）

### 6.1.4 分层规范（依 LC-FE-010）
- [ ] `views/pages` 层不直接调用 `api/` 层（必须通过 store 或 composable/hook）
- [ ] `api/` 层只负责 HTTP 请求，不包含业务逻辑
- [ ] `stores/` 层不直接操作 DOM
- [ ] `composables/hooks/` 层封装可复用逻辑，不包含 UI 渲染代码
- [ ] `types/` 层只包含类型定义，不包含运行时逻辑

---

## 维度6.2：前端业务逻辑一致性检查清单

### 6.2.1 页面展示一致性
- [ ] 列表页展示的字段与设计文档第3节 response schema 中的字段一致
- [ ] 详情页展示的字段与设计文档第3节 response schema 中的字段一致
- [ ] 字段的展示格式与设计文档一致（日期格式、金额格式、状态文字映射）
- [ ] 分页组件的参数名与后端一致（`pageNum`/`pageSize` vs `page`/`size`）
- [ ] 分页组件的总数字段名与后端一致（`total` vs `count`）

### 6.2.2 表单提交一致性
- [ ] 表单提交的字段名与设计文档第3节 requestBody 中的字段名一致
- [ ] 必填字段有前端校验（与后端 `@NotBlank`/`@NotNull` 对应）
- [ ] 字段长度限制与后端一致（`maxlength` 与 `@Size(max=...)` 对应）
- [ ] 表单提交成功后的跳转/刷新逻辑与设计文档一致

### 6.2.3 状态映射一致性
- [ ] 枚举值的前端展示文字与设计文档中的状态说明一致
- [ ] 错误码的前端提示文字与设计文档中的错误码定义一致
- [ ] 操作权限的前端控制（按钮显隐）与设计文档中的权限规则一致

### 6.2.4 异常处理完整性
- [ ] API 请求失败时有用户友好的错误提示（Toast/Message）
- [ ] 网络超时有对应的提示和重试机制
- [ ] 表单校验失败时有明确的错误提示（字段级别）
- [ ] 加载状态（loading）在请求开始时设为 true，请求结束（成功或失败）时设为 false

---

## 维度6.3：前端安全检查清单

### 6.3.1 Token 存储安全（P0 级别）
- [ ] **Token 不存储在 `localStorage`**（XSS 攻击可直接读取）
- [ ] **Token 不存储在 `sessionStorage`**（同样存在 XSS 风险）
- [ ] Token 存储在内存（Pinia store / Zustand store）或 httpOnly Cookie
- [ ] **使用 httpOnly Cookie 时必须配置 CSRF 防护**：后端 Cookie 设置 `SameSite=Strict` 或 `SameSite=Lax`；若需支持跨站请求，必须实现 CSRF Token 验证（Double Submit Cookie 或同步 Token 模式）
- [ ] 页面刷新后的 Token 恢复机制安全（不依赖 localStorage）
- [ ] Token 过期后自动跳转登录页，不暴露过期 Token

### 6.3.2 XSS 防护
- [ ] **`v-html` 的使用必须有注释说明内容来源已消毒**（Vue3）
- [ ] **`dangerouslySetInnerHTML` 的使用必须有注释说明内容来源已消毒**（React）
- [ ] 用户输入的内容在展示前经过转义（不直接插入 DOM）
- [ ] 富文本编辑器的输出在保存前经过 XSS 过滤（如 DOMPurify）

### 6.3.3 路由权限守卫
- [ ] 需要登录的页面在路由配置中有 `meta.requiresAuth = true` 标记
- [ ] 需要特定权限的页面在路由配置中有 `meta.roles` 或 `meta.permissions` 标记（如管理员页面标记 `meta.roles = ['admin']`）
- [ ] 全局路由守卫（`beforeEach`）检查 `meta.requiresAuth` 并验证 Token
- [ ] 全局路由守卫检查 `meta.roles`/`meta.permissions`（若存在），验证当前用户是否有对应权限
- [ ] 未登录访问受保护页面时重定向到登录页（保留 `redirect` 参数）
- [ ] 登录成功后跳转到 `redirect` 参数指定的页面（而非固定首页）
- [ ] 权限不足时有友好的 403 提示页面（而非白屏）

### 6.3.4 API 请求安全
- [ ] axios 请求拦截器统一携带认证 Token（`Authorization: Bearer {token}`）
- [ ] axios 响应拦截器统一处理 401（Token 失效）→ 清除 Token → 跳转登录
- [ ] axios 响应拦截器统一处理 403（权限不足）→ 提示用户
- [ ] 敏感操作（删除、支付）有二次确认弹窗
- [ ] 文件上传有文件类型和大小的前端校验（与后端限制一致）

### 6.3.5 敏感信息展示
- [ ] 手机号展示时脱敏（如 `138****8888`）
- [ ] 身份证号展示时脱敏（如 `110***********1234`）
- [ ] 银行卡号展示时脱敏（如 `**** **** **** 1234`）
- [ ] 密码字段使用 `type="password"`，不以明文展示

---

## 维度6.4：前端性能反模式检查清单

### 6.4.1 路由懒加载
- [ ] 所有页面组件使用动态 import（`() => import('./views/...')`）
- [ ] 不在路由配置中直接 import 页面组件（会导致首屏加载所有页面代码）
- [ ] 大型第三方库（如富文本编辑器、图表库）使用动态 import 按需加载

### 6.4.2 渲染性能
- [ ] 大型列表（>100 条）使用虚拟滚动（`vue-virtual-scroller` / `react-window`）
- [ ] 图片使用懒加载（`loading="lazy"` 或 `v-lazy`）
- [ ] 频繁触发的事件（scroll、resize、input）有防抖/节流处理
- [ ] 不在 `<template>` / JSX 中写复杂计算逻辑（应提取为 `computed` / `useMemo`）

### 6.4.3 响应式/状态管理性能（Vue3 专项）
- [ ] 大型对象使用 `shallowRef`/`shallowReactive` 而非深度响应式
- [ ] `computed` 属性有合理的依赖（不依赖整个大对象）
- [ ] `watch` 的 `deep: true` 使用谨慎（深度监听大对象性能差）
- [ ] `v-for` 列表有 `:key` 绑定（且 key 不是 index，应使用唯一 ID）

### 6.4.4 React 渲染性能（React 专项）
- [ ] 父组件重渲染时，子组件是否有不必要的重渲染（应使用 `React.memo`）
- [ ] 传给子组件的函数是否用 `useCallback` 包裹（避免每次渲染创建新函数）
- [ ] 传给子组件的对象是否用 `useMemo` 包裹（避免每次渲染创建新对象）
- [ ] `useEffect` 依赖数组是否完整（缺少依赖会导致闭包陈旧值问题）
- [ ] `useEffect` 依赖数组是否过多（可能导致频繁执行）

### 6.4.5 网络请求优化
- [ ] 同一数据不在多个组件中各自发起请求（应在 store 中统一管理）
- [ ] 列表页有防重复请求机制（快速切换页码时取消上一次请求）
- [ ] 搜索框有防抖处理（不在每次输入时立即发起请求）
- [ ] 不在 `created`/`mounted` 中发起不必要的初始化请求

---

## 维度6.5：前端可维护性检查清单

### 6.5.1 组件复杂度
- [ ] 单个组件文件不超过 300 行（超过时应拆分子组件）
- [ ] 单个 composable/hook 不超过 150 行（超过时应拆分）
- [ ] 模板/JSX 嵌套层级不超过 5 层（超过时应提取子组件）
- [ ] 单个方法/函数不超过 50 行（前端组件方法；后端方法上限为 80 行，见 `review-checklist.md` § 5.1）

### 6.5.2 重复代码
- [ ] 相同的表格列定义不在多个页面中重复（应提取为公共配置）
- [ ] 相同的表单校验规则不在多个页面中重复（应提取为公共规则）
- [ ] 相同的 API 调用逻辑不在多个组件中重复（应提取为 composable/hook）
- [ ] 相同的状态管理逻辑不在多个组件中重复（应提取为 store）

### 6.5.3 硬编码问题
- [ ] 无硬编码的 API 地址（如 `http://localhost:8080/api`，应使用 vite proxy + 相对路径）
- [ ] 无硬编码的枚举值（如 `status === 1`，应使用常量对象或枚举）
- [ ] 无硬编码的分页大小（如 `pageSize: 10`，应使用配置常量）
- [ ] 无硬编码的超时时间（如 `setTimeout(fn, 3000)`，应使用配置常量）

### 6.5.4 路由配置规范
- [ ] 新增路由使用追加方式，不覆盖已有路由配置
- [ ] 路由 `name` 唯一，不与已有路由重名
- [ ] 路由 `path` 规范（全小写，单词间用 `-` 分隔，如 `/user-management`）
- [ ] 动态路由参数有类型说明（如 `:id(\\d+)` 限制为数字）

### 6.5.5 注释质量
- [ ] 复杂业务逻辑有注释说明"为什么"（而非"是什么"）
- [ ] `v-html`/`dangerouslySetInnerHTML` 使用处有安全说明注释
- [ ] TODO 注释有负责人（如 `// TODO(zhanbiao): 待实现 XXX`）
- [ ] 无过时注释（注释描述与代码行为不符）

---

## 维度6.6：前端框架特化检查清单

### Vue3 专项检查

#### 6.6.1 Composition API 规范
- [ ] 使用 `<script setup>` 语法（而非 Options API 或 `setup()` 函数）
- [ ] `reactive` 对象解构时使用 `toRefs`（避免丢失响应性）
  ```typescript
  // ❌ 错误：解构后 name 不再是响应式的
  const { name } = reactive({ name: 'Alice' })
  
  // ✅ 正确：使用 toRefs 保持响应性
  const state = reactive({ name: 'Alice' })
  const { name } = toRefs(state)
  ```
- [ ] `props` 解构时使用 `toRefs(props)` 或 `defineProps` 的解构语法（Vue 3.3+）
- [ ] 异步操作在 `onMounted` 中发起（不在 `setup` 顶层直接 `await`）

#### 6.6.2 Pinia Store 规范
- [ ] Store 使用 `defineStore` 定义，不直接操作 `reactive` 对象
- [ ] Store 在组件 `setup` 内调用（`const store = useXxxStore()`），不在 `setup` 外调用
- [ ] Store 的 `action` 处理异步操作，不在组件中直接调用 `api/`
- [ ] Store 的 `state` 不直接在组件外修改（应通过 `action`）
- [ ] Store 有 `$reset()` 方法或等效的重置逻辑（用于登出时清空状态）

#### 6.6.3 模板规范
- [ ] `v-for` 有 `:key` 绑定，且 key 使用唯一 ID（不使用 index）
  ```html
  <!-- ❌ 错误：使用 index 作为 key -->
  <div v-for="(item, index) in list" :key="index">
  
  <!-- ✅ 正确：使用唯一 ID 作为 key -->
  <div v-for="item in list" :key="item.id">
  ```
- [ ] `v-if` 和 `v-for` 不在同一元素上使用（`v-if` 优先级高于 `v-for`，可能导致意外行为）
- [ ] 模板中无复杂三元表达式（应提取为 `computed`）
- [ ] 事件处理函数在模板中不写内联逻辑（应提取为方法）

#### 6.6.4 异步状态管理
- [ ] 异步操作有 `loading` 状态控制（请求中禁用按钮/显示加载动画）
- [ ] 异步操作有 `error` 状态处理（请求失败时展示错误信息）
- [ ] 组件卸载时取消未完成的请求（使用 `AbortController` 或 `onUnmounted` 清理）

---

### React 专项检查

#### 6.6.5 Hooks 规范
- [ ] `useEffect` 依赖数组完整（不遗漏依赖，不添加不必要的依赖）
  ```typescript
  // ❌ 错误：缺少 userId 依赖，userId 变化时不会重新执行
  useEffect(() => {
    fetchUser(userId)
  }, []) // 应为 [userId]
  
  // ✅ 正确：依赖数组包含所有用到的外部变量
  useEffect(() => {
    fetchUser(userId)
  }, [userId])
  ```
- [ ] 组件卸载时清理副作用（`useEffect` 返回清理函数）
  ```typescript
  useEffect(() => {
    const controller = new AbortController()
    fetchData({ signal: controller.signal })
    return () => controller.abort() // 组件卸载时取消请求
  }, [])
  ```
- [ ] 不在 `useEffect` 中直接调用 `api/` 层（应通过 store action 或 hook 封装）
- [ ] 自定义 hook 只在函数组件或其他 hook 中调用（不在普通函数中调用）

#### 6.6.6 渲染优化
- [ ] 纯展示组件使用 `React.memo` 包裹（避免父组件重渲染时不必要的子组件重渲染）
- [ ] 传给子组件的回调函数使用 `useCallback` 包裹
  ```typescript
  // ❌ 错误：每次渲染都创建新函数，导致子组件重渲染
  <ChildComponent onSubmit={() => handleSubmit(data)} />
  
  // ✅ 正确：使用 useCallback 缓存函数引用
  const handleSubmitMemo = useCallback(() => handleSubmit(data), [data])
  <ChildComponent onSubmit={handleSubmitMemo} />
  ```
- [ ] 传给子组件的对象/数组使用 `useMemo` 包裹（避免每次渲染创建新引用）
- [ ] 列表渲染有 `key` 属性，且 key 使用唯一 ID（不使用 index）

#### 6.6.7 Zustand Store 规范
- [ ] Store 的 selector 精确（只订阅需要的字段，避免全量订阅导致不必要的重渲染）
  ```typescript
  // ❌ 错误：全量订阅，任何字段变化都会触发重渲染
  const store = useUserStore()
  
  // ✅ 正确：精确订阅，只在 userName 变化时重渲染
  const userName = useUserStore(state => state.userName)
  ```
- [ ] Store 的 `action` 处理异步操作，不在组件中直接调用 `api/`
- [ ] 登出时调用 store 的重置方法清空所有状态

#### 6.6.8 异步状态管理
- [ ] 异步操作有 `loading` 状态控制（请求中禁用按钮/显示加载动画）
- [ ] 异步操作有 `error` 状态处理（请求失败时展示错误信息）
- [ ] 组件卸载后不调用 `setState`（使用 `useRef` 跟踪挂载状态或 `AbortController`）
  ```typescript
  // ✅ 正确：使用 AbortController 避免组件卸载后的 setState
  useEffect(() => {
    const controller = new AbortController()
    fetchData({ signal: controller.signal })
      .then(data => setData(data))
      .catch(err => { if (!controller.signal.aborted) setError(err) })
    return () => controller.abort()
  }, [])
  ```

---

## 前端反模式速查表

| 反模式 | 危害 | 正确做法 | 等级 |
|--------|------|---------|------|
| Token 存 `localStorage` | XSS 攻击可直接读取 | 存内存（store）或 httpOnly Cookie | **P0** |
| `v-html`/`dangerouslySetInnerHTML` 无消毒 | XSS 注入 | 使用 DOMPurify 消毒后再渲染 | **P0** |
| 路由无权限守卫 | 未登录可访问受保护页面 | 全局 `beforeEach` 检查 Token | **P1** |
| 页面组件直接调用 `api/` | 绕过 store，状态不同步 | 通过 store action 或 composable/hook | **P1** |
| 类型字段名与后端不一致 | 运行时数据为 `undefined` | 严格对照 OpenAPI 定义 | **P0**（契约维度） |
| `any` 类型滥用 | 失去 TypeScript 保护 | 从 `types/` 导入具体类型 | **P2** |
| 路由文件全量覆盖 | 删除已有路由，页面 404 | 只追加新路由条目 | **P1** |
| 硬编码 API 地址 | 环境切换失败 | vite proxy + 相对路径 | **P2** |
| `v-for` 使用 index 作为 key | 列表更新时 DOM 复用错误 | 使用唯一 ID 作为 key | **P2** |
| `useEffect` 依赖数组不完整 | 闭包陈旧值，逻辑错误 | 补全所有依赖 | **P1** |
| 组件卸载后 setState | 内存泄漏，控制台警告 | 使用 AbortController 清理 | **P1** |
| httpOnly Cookie 无 CSRF 防护 | CSRF 攻击风险 | 后端 Cookie 设置 `SameSite=Strict/Lax` | **P0** |
| 大型列表不用虚拟滚动 | 页面卡顿，内存占用高 | 使用 vue-virtual-scroller / react-window | **P2** |
| 路由不懒加载 | 首屏加载时间过长 | 使用 `() => import(...)` | **P2** |
