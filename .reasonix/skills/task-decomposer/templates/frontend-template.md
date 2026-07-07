# 前端 / 小程序详细设计文档模板

> 本文件合并了两部分内容：
> - **PART 1**：Web 前端详细设计文档模板（`前端_{页面域}.md`）
> - **PART 2**：微信小程序详细设计文档模板（`小程序_{页面域}.md`）
>
> **加载时机**：
> - Step 4 生成前端详设前 → 使用 PART 1（配合 `resources/design-guides.md` Part 3 前端设计指南，仅 LC-FE-001 ≠ `无` 时）
> - Step 4 生成小程序详设前 → 使用 PART 2（配合 `resources/design-guides.md` Part 4 小程序设计指南，仅 LC-MP-001 ≠ `无` 时）
>
> **框架分支说明**：PART 1 的第4/5/6/7节因 Vue3 与 React 实现模式不同，各有专属写法。
> 根据 `LC-FE-001` 的值选择对应分支，**不得混用**。

---

# PART 1：Web 前端详细设计文档模板

每个前端功能域对应一份详细设计文档，文件命名为 `前端_{页面域}.md`，保存到 `doc/detailed/` 目录。

---

## 模板正文（前端）

```markdown
# {项目名称} — 前端 {页面域} 详细设计文档

**文档编号**：FE-DES-YYYYMMDD-NNN
**版本**：v1.0.0
**状态**：🟡 草稿
**创建日期**：YYYY-MM-DD
**最后更新**：YYYY-MM-DD
**作者**：[姓名]
**前端框架**：{Vue3 | React}（来自 LC-FE-001）
**关联后端文档**：{对应后端详设文档路径}
**关联架构文档**：{架构设计文档路径}

---

## 1. 页面清单

| 页面名称 | 路由路径 | 权限要求 | 所属布局 | 说明 |
|---------|---------|---------|---------|------|
| {页面名} | {/path/to/page} | {PUBLIC \| ROLE_USER \| ROLE_ADMIN} | {DefaultLayout \| BlankLayout} | {简要说明} |

---

## 2. 页面交互规则

### 2.1 {页面名称}

**初始化行为**：
- 进入页面时执行：{如：调用 GET /api/xxx 加载列表数据，显示骨架屏}
- 权限不足时：{如：重定向到 /403 页面}

**用户操作 → 触发逻辑**：

| 操作 | 触发条件 | 执行逻辑 | 结果反馈 |
|-----|---------|---------|---------|
| 点击「提交」按钮 | 表单校验通过 | 调用 POST /api/xxx，按钮置为 loading | 成功：Toast 提示 + 跳转；失败：显示错误信息 |
| 点击「提交」按钮 | 表单校验失败 | 不发起请求 | 各字段显示校验错误提示 |

**表单校验规则**：

| 字段名 | 校验规则 | 错误提示文案 |
|-------|---------|------------|
| {字段} | {必填 \| 长度 \| 格式正则} | {提示文案} |

---

## 3. API 调用映射

> **契约来源**：所有 URL、HTTP 方法、请求/响应字段必须来自后端详设文档第3节 OpenAPI 定义，禁止自行发明。
>
> **⛔ 填写规则（硬性要求，违反视为错误）**：
> 1. **URL 列**：从后端详设第3节 OpenAPI YAML 的 `paths` 节点复制完整路径（含占位符，如 `/api/users/{id}`），禁止简写
> 2. **请求参数/Body 列**：
>    - 查询参数：从 `parameters[?in=='query'].name` 提取，格式 `{query: {参数1}, {参数2}}`
>    - 路径参数：从 `parameters[?in=='path'].name` 提取，格式 `{path: {参数名}}`
>    - 请求体：从 `requestBody.content.application/json.schema.properties` 的**所有键名**提取，格式 `{body: {{字段1}, {字段2}}}`
>    - **字段名大小写必须与 OpenAPI 定义完全一致**（如后端定义为 `user_name` 则此处写 `user_name`，不得改为 `userName`）
> 3. **响应关键字段 列**：从 `responses.200.content.application/json.schema.properties` 提取**实际字段名**，格式 `{字段1}, {字段2}`，禁止使用 `data.list`/`{field1}` 等通用占位符
> 4. **禁止自行发明任何字段名、URL 路径或 HTTP 方法**

| 页面/操作 | HTTP 方法 | URL | 请求参数/Body | 响应关键字段 | 调用时机 |
|---------|---------|-----|------------|-----------|---------|
| {页面名} 初始化 | GET | /api/{path} | {query: page, size} | {data.list, data.total} | onMounted / useEffect |
| 提交表单 | POST | /api/{path} | {body: {field1, field2}} | {data.id} | 点击提交按钮 |

**统一请求封装约定**：
- 请求头：`Authorization: Bearer {token}`（来自 {Store名称/localStorage}）
- 错误码处理：401 → 清除 token 跳转登录；403 → 跳转 /403；500 → 全局 Toast 错误提示

---

## 4. 状态定义

### 【Vue3 分支】（LC-FE-001 = Vue3）

**页面级响应式状态**（`<script setup>` 中的 `ref/reactive`）：

```typescript
const loading = ref(false)
const list = ref<{类型}[]>([])
const total = ref(0)
const currentItem = ref<{类型} | null>(null)
const formData = reactive<{表单类型}>({ {field1}: '', {field2}: null })
const formRef = ref<FormInstance>()
```

**Pinia Store 全局状态**（`stores/{storeName}.ts`）：

```typescript
export const use{Name}Store = defineStore('{name}', () => {
  const {field} = ref<{类型}>({默认值})
  const {computed字段} = computed(() => ...)
  async function {actionName}({参数}: {类型}) { /* 调用 API，更新 state */ }
  return { {field}, {computed字段}, {actionName} }
})
```

### 【React 分支】（LC-FE-001 = React）

**页面级本地状态**：

```typescript
const [loading, setLoading] = useState(false)
const [list, setList] = useState<{类型}[]>([])
const [formData, setFormData] = useState<{表单类型}>({ {field1}: '', {field2}: null })
```

**Zustand Store 全局状态**（`stores/{storeName}.ts`）：

```typescript
export const use{Name}Store = create<{Name}State>((set, get) => ({
  {field}: {默认值},
  {action}: async ({参数}) => { /* 调用 API，set({ field: newValue }) */ },
}))
```

---

## 5. 组件拆分

### 【Vue3 分支】

| 组件名 | 文件路径 | 职责 | Props | Emits |
|-------|---------|-----|-------|-------|
| `{ComponentName}` | `components/{ComponentName}.vue` | {职责描述} | `{propName}: {类型}` | `{eventName}: ({参数类型}) => void` |

### 【React 分支】

| 组件名 | 文件路径 | 职责 | Props |
|-------|---------|-----|-------|
| `{ComponentName}` | `components/{ComponentName}.tsx` | {职责描述} | `{propName}: {类型}` |

---

## 6. 复用逻辑封装

### 【Vue3 分支】Composable（`composables/use{Name}.ts`）

```typescript
export function use{Name}({参数}: {类型}) {
  const loading = ref(false)
  const list = ref<{类型}[]>([])
  async function fetchList() {
    loading.value = true
    try { const res = await {apiCall}; list.value = res.data.list }
    finally { loading.value = false }
  }
  onMounted(fetchList)
  return { loading, list, fetchList }
}
```

### 【React 分支】Custom Hook（`hooks/use{Name}.ts`）

```typescript
export function use{Name}({参数}: {类型}) {
  const [loading, setLoading] = useState(false)
  const [list, setList] = useState<{类型}[]>([])
  const fetchList = useCallback(async () => {
    setLoading(true)
    try { const res = await {apiCall}; setList(res.data.list) }
    finally { setLoading(false) }
  }, [{依赖项}])
  useEffect(() => { fetchList() }, [fetchList])
  return { loading, list, fetchList }
}
```

---

## 7. 路由设计

### 【Vue3 分支】（Vue Router 4）

```typescript
export const {domain}Routes: RouteRecordRaw[] = [
  {
    path: '/{path}',
    component: () => import('@/layouts/{LayoutName}.vue'),
    meta: { requiresAuth: true, roles: ['{ROLE}'] },
    children: [
      { path: '', name: '{RouteName}', component: () => import('@/views/{domain}/{PageName}.vue'),
        meta: { title: '{页面标题}', keepAlive: false } },
    ],
  },
]
```

**路由守卫规则**：

| 守卫类型 | 触发条件 | 处理逻辑 |
|---------|---------|---------|
| 全局前置守卫 | 访问需认证路由且无 token | 重定向到 /login，携带 redirect 参数 |
| 全局前置守卫 | token 存在但角色不满足 | 重定向到 /403 |

### 【React 分支】（React Router 6）

```typescript
export const {domain}Routes = [
  {
    path: '/{path}',
    element: <ProtectedRoute roles={['{ROLE}']}><{LayoutName} /></ProtectedRoute>,
    children: [
      { index: true, element: <Suspense fallback={<Skeleton />}><{PageName} /></Suspense> },
    ],
  },
]
```

---

## 8. 错误处理

| 错误场景 | HTTP 状态码 | 处理方式 | 用户提示 |
|---------|-----------|---------|---------|
| 未登录 / token 过期 | 401 | 清除本地 token，跳转 /login | 无提示（静默跳转） |
| 无权限 | 403 | 跳转 /403 页面 | 显示无权限提示页 |
| 服务器错误 | 500 | 不跳转，Toast 提示 | "服务器繁忙，请稍后重试" |
| 网络超时 | Network Error | 重试一次，仍失败则 Toast | "网络连接失败，请检查网络" |
| 表单提交失败 | 400（业务错误） | 不跳转，显示 message | 直接展示 `response.data.message` |

---

## 9. 构建与环境配置

| 变量名 | 开发环境值 | 生产环境值 | 用途 |
|-------|---------|---------|-----|
| `VITE_API_BASE_URL` | `http://localhost:8080` | `https://api.{domain}.com` | API 基础路径 |
| `VITE_{NAME}` | {开发值} | {生产值} | {用途} |

---

## 10. 测试要点

| 测试场景 | 前置条件 | 操作步骤 | 预期结果 |
|---------|---------|---------|---------|
| {场景描述} | {前置条件} | {操作步骤} | {预期结果} |
| 表单必填校验 | 空表单 | 直接点击提交 | 各必填字段显示红色错误提示，不发起请求 |
| 无权限访问 | 未登录 | 直接访问 /{path} | 重定向到 /login?redirect=/{path} |

---

## 变更记录

| 版本 | 日期 | 变更类型 | 变更内容摘要 | 变更人 |
|-----|------|---------|------------|--------|
| v1.0.0 | YYYY-MM-DD | 🆕 新建 | 初始版本 | [姓名] |
```

---

## 质量检查清单（前端）

- [ ] 头部 `LC-FE-001` 已填写（Vue3 或 React），且第4/5/6/7节使用了对应框架分支
- [ ] 第3节所有 API URL 和字段名来自后端详设文档第3节 OpenAPI 定义，无自行发明
- [ ] 第3节已纳入 `_PROGRESS.md` 中相关后端模块「补充接口（Step 2.5）」列表的所有接口，无遗漏
- [ ] 第2节每个页面的交互规则覆盖了正常流程、校验失败、加载态、空状态
- [ ] 第7节路由配置包含权限守卫和懒加载
- [ ] 第8节覆盖了 401/403/404/500/网络超时五类错误
- [ ] 文档中无 `{...}` 占位符残留
- [ ] 文件保存路径为 `doc/detailed/前端_{页面域}.md`

---

# PART 2：微信小程序详细设计文档模板

每个小程序功能域对应一份详细设计文档，文件命名为 `小程序_{页面域}.md`，保存到 `doc/detailed/` 目录。

---

## 模板正文（小程序）

```markdown
# {项目名称} — 小程序 {页面域} 详细设计文档

**文档编号**：MP-DES-YYYYMMDD-NNN
**版本**：v1.0.0
**状态**：🟡 草稿
**创建日期**：YYYY-MM-DD
**最后更新**：YYYY-MM-DD
**作者**：[姓名]
**小程序框架**：原生小程序 / Taro / uni-app（来自 LC-MP-001）
**关联后端文档**：{对应后端详设文档路径}
**关联架构文档**：{架构设计文档路径}

---

## 1. 页面清单

| 页面名称 | 页面路径 | 所属分包 | tabBar 归属 | 权限要求 | 说明 |
|---------|---------|---------|-----------|---------|------|
| {页面名} | pages/{domain}/{page}/{page} | {主包 \| 分包名} | {无 \| tabBar项名称} | {无需登录 \| 需要登录} | {简要说明} |

---

## 2. 页面交互规则

### 2.1 {页面名称}

**生命周期行为**：

| 生命周期 | 执行操作 | 说明 |
|---------|---------|------|
| onLoad(options) | {如：从 options 获取 id，调用接口加载详情} | {说明} |
| onShow | {如：刷新列表数据（从其他页面返回时）} | {说明} |
| onPullDownRefresh | {如：重置分页，重新加载列表，stopPullDownRefresh} | 需在 .json 中开启 enablePullDownRefresh |
| onReachBottom | {如：加载下一页数据，判断是否已到最后一页} | 需在 .json 中配置 onReachBottomDistance |

**用户操作 → 触发逻辑**：

| 操作 | 触发条件 | 执行逻辑 | 结果反馈 |
|-----|---------|---------|---------|
| 点击「提交」按钮 | 表单校验通过 | 调用 POST /api/xxx | 成功：wx.showToast + 跳转；失败：wx.showModal 显示错误 |
| 点击「提交」按钮 | 表单校验失败 | 不发起请求 | wx.showToast 提示具体错误 |

---

## 3. API 调用映射

> **契约来源**：所有 URL、HTTP 方法、请求/响应字段必须来自后端详设文档第3节 OpenAPI 定义，禁止自行发明。
>
> **⛔ 填写规则（与 Web 前端完全相同）**：
> 1. **URL 列**：从后端详设第3节 OpenAPI YAML 的 `paths` 节点复制完整路径（含占位符，如 `/api/users/{id}`），禁止简写
> 2. **请求参数/Body 列**：
>    - 查询参数：从 `parameters[?in=='query'].name` 提取，格式 `{query: {参数1}, {参数2}}`
>    - 路径参数：从 `parameters[?in=='path'].name` 提取，格式 `{path: {参数名}}`
>    - 请求体：从 `requestBody.content.application/json.schema.properties` 的**所有键名**提取，格式 `{body: {{字段1}, {字段2}}}`
>    - **字段名大小写必须与 OpenAPI 定义完全一致**（如后端定义为 `user_name` 则此处写 `user_name`，不得改为 `userName`）
> 3. **响应关键字段 列**：从 `responses.200.content.application/json.schema.properties` 提取**实际字段名**，格式 `{字段1}, {字段2}`，禁止使用 `data.list`/`{field1}` 等通用占位符
> 4. **禁止自行发明任何字段名、URL 路径或 HTTP 方法**

| 页面/操作 | HTTP 方法 | URL | 请求参数/Body | 响应关键字段 | 调用时机 |
|---------|---------|-----|------------|-----------|---------|
| {页面名} 初始化 | GET | /api/{path} | {query: page, size} | {data.list, data.total} | onLoad |
| 提交表单 | POST | /api/{path} | {body: {field1, field2}} | {data.id} | 点击提交 |

**统一请求封装约定**：
- 请求工具：`utils/request.js`（封装 `wx.request`）
- 请求头：`Authorization: Bearer {token}`（来自 `wx.getStorageSync('token')`）
- 错误码处理：401 → 清除 token 跳转登录页；500 → wx.showToast 错误提示

---

## 4. 状态与存储

**页面级 data 字段定义**：

```javascript
Page({
  data: {
    loading: false,
    list: [],
    total: 0,
    page: 1,
    pageSize: 20,
    hasMore: true,
    currentItem: null,
    formData: { {field1}: '', {field2}: null },
  },
})
```

**globalData 全局状态**（`app.js`）：

| 字段名 | 类型 | 初始值 | 用途 | 更新时机 |
|-------|-----|-------|-----|---------|
| `userInfo` | Object | null | 当前登录用户信息 | 登录成功后 |
| `token` | String | '' | 登录凭证 | 登录成功后 |

**Storage 持久化存储**：

| Key | 类型 | 存储内容 | 写入时机 | 读取时机 | 失效策略 |
|-----|-----|---------|---------|---------|---------|
| `token` | String | 登录 token | 登录成功 | 每次请求前 | 主动退出或 401 时清除 |
| `userInfo` | Object | 用户基本信息 | 登录成功 | App.onLaunch | 退出登录时清除 |

---

## 5. 微信能力使用

| 微信 API | 调用时机 | 权限要求 | 失败处理 |
|---------|---------|---------|---------|
| `wx.login` | App.onLaunch / 登录页 onLoad | 无需授权 | 重试3次，仍失败提示用户 |
| `wx.getUserProfile` | 用户点击「授权登录」按钮 | 需用户主动触发 | 用户拒绝时提示功能受限 |
| `wx.requestPayment` | 用户点击「立即支付」 | 需商户配置 | 支付失败显示具体原因 |
| `{其他 API}` | {时机} | {权限} | {处理} |

---

## 6. 生命周期钩子

```javascript
Page({
  onLoad(options) {
    // 1. 从 options 获取参数：{如：const { id } = options}
    // 2. {如：调用 this.fetchDetail(id) 加载详情}
  },
  onShow() { /* {如：检查登录状态；从其他页面返回时刷新数据} */ },
  onPullDownRefresh() {
    // 1. 重置分页：this.setData({ page: 1, list: [], hasMore: true })
    // 2. 重新加载：this.fetchList()
    // 3. 停止刷新：wx.stopPullDownRefresh()（在 fetchList 完成后）
  },
  onReachBottom() {
    // 1. 判断是否还有更多：if (!this.data.hasMore || this.data.loading) return
    // 2. 加载下一页：this.setData({ page: this.data.page + 1 }); this.fetchList(true)
  },
  onShareAppMessage() {
    return { title: '{分享标题}', path: '/pages/{domain}/{page}/{page}?{参数}', imageUrl: '{封面图}' }
  },
})
```

---

## 7. 错误处理

| 错误场景 | 错误来源 | 处理方式 | 用户提示 |
|---------|---------|---------|---------|
| 未登录 / token 过期 | 接口返回 401 | 清除 token 和 userInfo，跳转登录页 | wx.showToast: "登录已过期，请重新登录" |
| 无权限 | 接口返回 403 | 不跳转 | wx.showToast: "暂无权限" |
| 网络超时 | wx.request timeout | 重试一次，仍失败则提示 | wx.showToast: "网络连接超时，请重试" |
| 服务器错误 | 接口返回 500 | 不跳转 | wx.showToast: "服务器繁忙，请稍后重试" |
| 支付失败 | wx.requestPayment fail | 显示失败原因 | wx.showModal 展示具体原因 + 重试按钮 |

---

## 8. 分包策略

**分包归属决策**：

| 页面 | 归属 | 理由 |
|-----|-----|-----|
| {页面名} | {主包 \| 分包A} | {理由} |

**分包配置**（`app.json` subpackages 节）：

```json
{
  "subpackages": [
    { "root": "packageA", "name": "{分包名称}", "pages": ["{domain}/{page}/{page}"] }
  ],
  "preloadRule": {
    "{触发页面路径}": { "network": "all", "packages": ["{分包名称}"] }
  }
}
```

---

## 9. 缓存策略

| 缓存 Key | 缓存内容 | 缓存时长 | 写入时机 | 读取时机 | 失效/清除时机 |
|---------|---------|---------|---------|---------|------------|
| `cache_{domain}_list` | {列表数据} | {5分钟} | 接口返回成功后 | onLoad 时先读缓存 | 超时 \| 用户主动刷新 |
| `cache_{domain}_{id}` | {详情数据} | {10分钟} | 详情接口返回后 | onLoad 时先读缓存 | 超时 \| 用户编辑提交后 |

---

## 10. 测试要点

| 测试场景 | 前置条件 | 操作步骤 | 预期结果 | 测试工具 |
|---------|---------|---------|---------|---------|
| 下拉刷新 | 列表有数据 | 下拉页面触发刷新 | 数据重新加载，刷新动画消失 | 微信开发者工具 |
| 上拉加载更多 | 列表数据 > 1页 | 滚动到底部 | 加载下一页数据，追加到列表 | 微信开发者工具 |
| 未登录访问 | 未登录状态 | 直接进入需登录页面 | 跳转到登录页 | 微信开发者工具 |
| 网络断开 | 关闭网络 | 触发任意接口请求 | Toast 提示网络错误，不白屏 | 真机测试 |

---

## 变更记录

| 版本 | 日期 | 变更类型 | 变更内容摘要 | 变更人 |
|-----|------|---------|------------|--------|
| v1.0.0 | YYYY-MM-DD | 🆕 新建 | 初始版本 | [姓名] |
```

---

## 质量检查清单（小程序）

- [ ] 第3节所有 API URL 和字段名来自后端详设文档第3节 OpenAPI 定义，无自行发明
- [ ] 第3节已纳入 `_PROGRESS.md` 中相关后端模块「补充接口（Step 2.5）」列表的所有接口，无遗漏
- [ ] 第2节每个页面的交互规则覆盖了正常流程、校验失败、加载态、空状态
- [ ] 第5节列出了所有使用的微信 API 及其权限要求和失败处理
- [ ] 第6节每个页面的 onLoad/onShow/onPullDownRefresh/onReachBottom 均有明确操作描述
- [ ] 第8节明确了每个页面的分包归属
- [ ] 第9节为高频读取的数据定义了缓存策略和失效机制
- [ ] 第7节覆盖了 401/403/500/网络超时/授权拒绝/支付失败六类错误（支付功能不涉及时可标注"不适用"）
- [ ] 文档中无 `{...}` 占位符残留
- [ ] 文件保存路径为 `doc/detailed/小程序_{页面域}.md`
