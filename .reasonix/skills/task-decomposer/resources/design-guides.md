# 设计指南（后端分层 / 功能链规则 / 前端 / 小程序 / 工程规则）

> 本文件合并了五个参考文件：
> - **Part 1**：后端分层模型参考
> - **Part 2**：功能链完整性推导规则
> - **Part 3**：前端设计指南
> - **Part 4**：小程序设计指南
> - **Part 5**：语言工程规则（原 `er-rules.md`，4种语言禁止项/必须实现项 + 通用质量/安全/性能规则）
>
> **加载时机**（按需加载，无需全文读取）：
> - Step 2 依赖排序时 → Part 1
> - Step 2.5 功能链推导时 → Part 2
> - Step 4 生成前端详设前 → Part 3（仅 LC-FE-001 ≠ `无` 时）
> - Step 4 生成小程序详设前 → Part 4（仅 LC-MP-001 ≠ `无` 时）
> - Step 5 生成项目规则时 → Part 5 对应语言节（LC-001 = Java/Python/Go/Node.js）

---

# Part 1：后端分层模型参考

本节定义后端代码的标准分层模型，供 Step 2（依赖排序）使用。

## 通用分层原则

后端代码分为5层，层间依赖方向严格单向（上层依赖下层，禁止反向）：

```
Layer 4（集成层）
    ↓ 依赖
Layer 3（接口层）
    ↓ 依赖
Layer 2（业务逻辑层）
    ↓ 依赖
Layer 1（数据访问层）
    ↓ 依赖
Layer 0（基础层）
```

每份详设文档的第12节（依赖关系）必须标注所属层次，并精确到接口路径，不得只写模块名。

## Java（Spring Boot + MyBatis）

| 层次 | 职责 | 典型类/文件 | 命名约定 |
|-----|-----|-----------|---------|
| Layer 0 | 数据模型、枚举、常量、配置 | `Entity`、`Enum`、`@Configuration` | `XxxEntity`、`XxxEnum`、`XxxConfig` |
| Layer 1 | 数据访问 | `Mapper` 接口 + MyBatis XML | `XxxMapper`、`XxxMapper.xml` |
| Layer 2 | 业务逻辑 | `Service` 接口 + `ServiceImpl` | `XxxService`、`XxxServiceImpl` |
| Layer 3 | 对外接口 | `Controller`、`@KafkaListener`、`@Scheduled` | `XxxController`、`XxxConsumer` |
| Layer 4 | 跨模块编排、外部集成 | Feign Client、外部 API 客户端 | `XxxClient`、`XxxGateway` |

关键约束：`Controller` 不得直接调用 `Mapper`；`@Transactional` 只加在 `ServiceImpl` 上；DTO 不出 `Service` 层。

## Python（FastAPI + SQLAlchemy）

| 层次 | 职责 | 典型类/文件 | 命名约定 |
|-----|-----|-----------|---------|
| Layer 0 | 数据模型、Schema、配置 | SQLAlchemy `Model`、Pydantic `Schema`、`config.py` | `XxxModel`、`XxxCreate`、`XxxResponse` |
| Layer 1 | 数据访问 | `Repository` 类（封装 SQLAlchemy Session） | `XxxRepository` |
| Layer 2 | 业务逻辑 | `Service` 类 | `XxxService` |
| Layer 3 | 对外接口 | FastAPI `Router`、Celery `Task` | `xxx_router`、`xxx_task` |
| Layer 4 | 跨模块编排、外部集成 | HTTP Client（httpx）、外部 API 封装 | `XxxClient`、`XxxGateway` |

关键约束：Pydantic Schema 分 `XxxCreate`/`XxxUpdate`/`XxxResponse` 三类，不混用；`Model` 不直接暴露给 `Router`。

## Go（Gin + GORM）

| 层次 | 职责 | 典型类/文件 | 命名约定 |
|-----|-----|-----------|---------|
| Layer 0 | 数据模型、配置 | GORM `Model` struct、`config` 包 | `Xxx` struct（model 包） |
| Layer 1 | 数据访问 | `Repository` 接口 + 实现 struct | `XxxRepository` 接口、`xxxRepository` 实现 |
| Layer 2 | 业务逻辑 | `Service` 接口 + 实现 struct | `XxxService` 接口、`xxxService` 实现 |
| Layer 3 | 对外接口 | Gin `Handler` 函数、定时任务 | `XxxHandler`、`RegisterXxxRoutes` |
| Layer 4 | 跨模块编排、外部集成 | HTTP Client、外部 API 封装 | `XxxClient`、`XxxGateway` |

关键约束：接口（interface）定义在调用方包中；`Handler` 只做参数绑定 + 调用 `Service` + 返回响应；不使用 panic（除初始化）。

## Node.js（NestJS + TypeORM / Prisma）

| 层次 | 职责 | 典型类/文件 | 命名约定 |
|-----|-----|-----------|---------|
| Layer 0 | 数据模型、DTO、配置 | TypeORM `Entity`、`CreateXxxDto`、`@Module` | `XxxEntity`、`CreateXxxDto` |
| Layer 1 | 数据访问 | TypeORM `Repository` 封装 / Prisma Client | `XxxRepository`（`@Injectable`） |
| Layer 2 | 业务逻辑 | `Service` 类 | `XxxService`（`@Injectable`） |
| Layer 3 | 对外接口 | `Controller`、`@MessagePattern` | `XxxController`（`@Controller`） |
| Layer 4 | 跨模块编排、外部集成 | HTTP Module、外部 API 封装 | `XxxClient`、`XxxGateway` |

关键约束：每个功能域对应一个 `Module`；DTO 使用 `class-validator`；`Controller` 不得直接注入 `Repository`。

## 层次编号分配规则

| 文档内容 | 层次 |
|---------|-----|
| DDL、Entity/Model、枚举、常量、配置类 | Layer 0 |
| Mapper/Repository（数据访问接口和实现） | Layer 1 |
| Service 接口和实现（业务逻辑） | Layer 2 |
| Controller/Router/Handler（对外接口） | Layer 3 |
| 跨模块编排、外部系统集成 | Layer 4 |

> 一份文档可能跨多个层次时，标注**最高层次**，并在第12节说明各层的具体依赖。

---

# Part 2：功能链完整性推导规则

本节定义详细设计文档生成时必须执行的**功能链完整性推导**规则（Step 2.5）。
目标是在文档生成阶段主动发现并补全隐含的支撑接口。

## 为什么需要功能链推导？

架构文档只描述"显式需求"，但每个功能背后都有**隐含的支撑接口**。例如：只有 `PUT /users/{id}` 而没有 `GET /users/{id}`，前端表单无法回显数据，更新操作在实际使用中根本无法完成。

## 推导时机

**阶段2（依赖排序）完成后、阶段3（文档生成）开始前**，对每个模块的接口清单执行以下6类规则检查。

## 规则一：操作前置依赖（最常见）

**推导矩阵**：

| 已有接口 | 必须补充的接口 | 原因 |
|---------|-------------|------|
| `PUT /{resource}/{id}`（修改） | `GET /{resource}/{id}` | 前端表单回显、后端校验数据存在性 |
| `DELETE /{resource}/{id}`（删除） | `GET /{resource}/{id}` | 确认删除对象存在，展示确认信息 |
| `PATCH /{resource}/{id}/status`（状态变更） | `GET /{resource}/{id}` | 校验当前状态是否允许此次变更 |
| 子资源操作 `POST /{parent}/{id}/children` | `GET /{parent}/{id}` | 确认父资源存在 |
| 批量操作 `POST /{resource}/batch-delete` | `GET /{resource}`（列表） | 用户需要先查询再选择 |

## 规则二：状态机完整性

**推导矩阵**：

| 已有设计 | 必须补充的内容 | 原因 |
|---------|-------------|------|
| 状态变更接口（如审批通过） | 伪代码中的**前置状态校验**逻辑 | 防止非法状态跳转 |
| 多状态流转 | 状态枚举定义 + 合法转换表 | 明确哪些状态可转换 |
| 审批/驳回流程 | `PUT /{resource}/{id}/resubmit`（重新提交） | 被驳回的单据需要修改后重新提交 |
| 并发状态变更场景 | 乐观锁字段（`version`）或分布式锁说明 | 防止并发状态竞争 |

## 规则三：跨模块依赖完整性

**推导矩阵**：

| 常见依赖场景 | 依赖方需要的接口 | 被依赖方需要补充的接口 |
|------------|--------------|-------------------|
| 创建订单时校验用户余额 | 用户模块 `GET /users/{id}/balance` | 用户模块需补充余额查询接口 |
| 发货时扣减库存 | 库存模块 `PUT /inventory/{sku}/deduct` | 库存模块需补充库存扣减接口 |
| 消息通知获取用户联系方式 | 用户模块 `GET /users/{id}/contact` | 用户模块需补充联系方式查询接口 |

**检查方式**：读取当前模块第12节的所有依赖接口路径，在其他模块文档中查找是否存在；若不存在，在对应模块的接口清单中补充，或在当前模块第12节标注「⚠️ 被依赖接口待补充」。

## 规则四：数据生命周期完整性

**推导矩阵**：

| 已有接口 | 必须检查是否存在 | 原因 |
|---------|--------------|------|
| `POST /{resource}`（创建附件/关联） | `DELETE /{resource}/{id}` | 附件/关联需要能删除 |
| `POST /{parent}/{id}/bind`（绑定关系） | `DELETE /{parent}/{id}/unbind`（解绑） | 关系需要能解除 |
| 软删除（`is_deleted` 字段） | `PUT /{resource}/{id}/restore`（恢复，视业务需要） | 误删需要能恢复 |
| `POST /{resource}/draft`（保存草稿） | `GET /{resource}/drafts`（草稿列表） | 草稿需要能找到 |
| `POST /import-tasks`（批量导入） | `GET /import-tasks/{id}`（导入结果查询） | 异步导入需要能查询结果 |

## 规则五：异步流程完整性

**推导矩阵**：

| 已有设计 | 必须补充的内容 | 原因 |
|---------|-------------|------|
| 异步任务触发接口 | `GET /tasks/{id}/status`（任务状态查询） | 调用方需要轮询或查询任务结果 |
| MQ 消息消费逻辑 | 消费失败的**死信处理方案** | 消费失败的消息不能永久丢失 |
| 第三方回调接收接口 | 回调签名验证逻辑（伪代码） | 防止伪造回调 |

## 规则六：权限与数据隔离完整性

**推导矩阵**：

| 已有设计 | 必须在伪代码中补充的步骤 | 原因 |
|---------|----------------------|------|
| 多租户系统的 `list` 接口 | `WHERE tenant_id = currentTenantId` 过滤条件 | 防止跨租户数据泄露 |
| 有数据归属的 `update` 接口 | `getById` 后校验 `ownerId == currentUserId` | 防止越权修改他人数据 |
| 有数据归属的 `delete` 接口 | `getById` 后校验 `ownerId == currentUserId` | 防止越权删除他人数据 |

## 推导执行流程

```
1. 收集接口清单
   → 从架构文档的模块设计章节提取已知接口（HTTP方法 + 路径 + 功能描述）

2. 逐规则扫描（规则一 → 规则六）
   → 对每条规则，检查接口清单是否满足
   → 记录发现的缺失接口或缺失逻辑

3. 补全缺失内容
   → 将缺失接口加入本模块接口清单
   → 在文档第1节（功能描述）中追加对应功能点
   → 在文档第3节（接口定义）中补充 OpenAPI 定义
   → 在文档第4节（伪代码）中补充对应逻辑步骤

4. 跨模块依赖验证（规则三）
   → 检查其他模块是否已设计了本模块依赖的接口
   → 若未设计，在对应模块的待补充清单中记录

5. 输出推导报告并向用户确认
```

## 推导报告格式

```
📋 功能链完整性推导报告

模块：{模块名}
─────────────────────────────────────────
✅ 规则一（操作前置依赖）：已满足 / ⚠️ 发现缺失
   缺失：GET /users/{id} — 支撑 PUT /users/{id} 的表单回显
   → 已补充到接口清单

✅ 规则二（状态机完整性）：已满足 / ⚠️ 发现缺失
✅ 规则三（跨模块依赖）：已满足 / ⚠️ 发现缺失
✅ 规则四（数据生命周期）：已满足
✅ 规则五（异步流程）：已满足
✅ 规则六（权限隔离）：已满足 / ⚠️ 发现缺失

共补充 {N} 个接口，{M} 处伪代码逻辑。请确认后继续生成文档。
```

---

# Part 3：前端设计指南

本节供 Step 4（前端详设生成）使用，**仅在 LC-FE-001 有值（非`无`）时加载**。

## 框架选择依据

根据 `编码规范.md` 中的 `LC-FE-001` 值决定使用哪套模式：

| LC-FE-001 值 | 使用模式 |
|------------|---------|
| `Vue3` | Vue3 Composition API + Pinia |
| `React` | React Hooks + Zustand |

## 第一章：Vue3 设计模式

### 1.1 组件结构规范

```vue
<script setup lang="ts">
// 1. 导入
import { ref, reactive, computed, onMounted } from 'vue'
import { useXxxStore } from '@/stores/xxx'
import { useXxx } from '@/composables/useXxx'

// 2. Store
const xxxStore = useXxxStore()
// 3. Composable
const { loading, list, fetchList } = useXxx()
// 4. 本地状态
const visible = ref(false)
const formData = reactive<XxxType>({ ... })
// 5. 计算属性
const isValid = computed(() => ...)
// 6. 方法
async function handleSubmit() { ... }
// 7. 生命周期
onMounted(() => { fetchList() })
</script>
```

### 1.2 状态管理（Pinia）

- 每个业务域对应一个 Store（`stores/useXxxStore.ts`）
- 使用 Composition API 风格（`defineStore(id, setup函数)`），不用 Options 风格
- Store 中的 Action 负责调用 API 并更新 State；跨组件共享的数据放 Store，页面内部临时状态用 `ref/reactive`

### 1.3 Composable 设计规范

```typescript
export function useXxx(options?: XxxOptions) {
  const loading = ref(false)
  async function fetchData() { ... }
  onMounted(fetchData)
  return { loading, fetchData }
}
```

命名规范：`use` + 业务名（驼峰），如 `useUserList`、`useOrderForm`

### 1.4 路由（Vue Router 4）

```typescript
// 路由懒加载（必须）
component: () => import('@/views/xxx/XxxPage.vue')

// 路由 meta 标准字段
meta: {
  title: '页面标题',
  requiresAuth: true,
  roles: ['ROLE_ADMIN'],
  keepAlive: false,
}
```

## 第二章：React 设计模式

### 2.1 组件结构规范

```tsx
export default function XxxPage({ ...props }: XxxPageProps) {
  // 1. Store
  const { data, fetchData } = useXxxStore()
  // 2. Custom Hook
  const { loading, list } = useXxx()
  // 3. 本地状态
  const [visible, setVisible] = useState(false)
  // 4. 派生状态（useMemo）
  const isValid = useMemo(() => ..., [formData])
  // 5. 回调（useCallback）
  const handleSubmit = useCallback(async () => { ... }, [formData])
  // 6. 副作用
  useEffect(() => { fetchData() }, [])
  return ( <div>...</div> )
}
```

### 2.2 状态管理（Zustand）

- 每个业务域对应一个 Store（`stores/xxxStore.ts`）
- 使用 `immer` 中间件处理嵌套对象更新
- 避免在 Store 中存储派生数据，用 `useMemo` 在组件中计算

### 2.3 Custom Hook 设计规范

```typescript
export function useXxx(options?: XxxOptions) {
  const [loading, setLoading] = useState(false)
  const fetchData = useCallback(async () => {
    setLoading(true)
    try { ... } finally { setLoading(false) }
  }, [/* 依赖项 */])
  useEffect(() => { fetchData(); return () => { /* 清理 */ } }, [fetchData])
  return { loading, fetchData }
}
```

### 2.4 路由（React Router 6）

```tsx
const XxxPage = lazy(() => import('@/pages/xxx/XxxPage'))
<Suspense fallback={<PageSkeleton />}><XxxPage /></Suspense>
<ProtectedRoute roles={['ROLE_ADMIN']}><XxxPage /></ProtectedRoute>
```

## 第三章：共同规范（Vue3 和 React 均适用）

### API 层封装

所有 API 调用必须封装在独立的 API 模块中，不在组件/页面中直接写 `axios.get`：

```typescript
// api/xxxApi.ts
export const xxxApi = {
  getList: (params: XxxListParams) => request.get<XxxListResponse>('/api/xxx', { params }),
  create: (data: CreateXxxDto) => request.post<{ id: string }>('/api/xxx', data),
  update: (id: string, data: Partial<CreateXxxDto>) => request.put(`/api/xxx/${id}`, data),
  delete: (id: string) => request.delete(`/api/xxx/${id}`),
}
```

### TypeScript 类型规范

- 与后端 DTO 字段名保持一致（来自后端详设第3节 OpenAPI 定义）
- `XxxVO`（后端返回视图对象）、`CreateXxxDto`（创建请求体）、`PageResult<T>`（分页结果）

### 错误处理统一拦截

在 `utils/request.ts` 的响应拦截器中统一处理 401/403/500，组件层只处理**业务特定错误**。

---

# Part 4：小程序设计指南

本节供 Step 4（小程序详设生成）使用，**仅在 LC-MP-001 有值（非`无`）时加载**。

## 框架选择说明

| LC-MP-001 值 | 框架 | 说明 |
|---|-----|-----|
| `MiniApp-Native` | 原生小程序 | 使用微信官方 WXML/WXSS/JS/JSON，性能最优 |
| `MiniApp-Taro` | Taro 3.x | React 语法，编译为小程序 |
| `MiniApp-UniApp` | uni-app | Vue 语法，编译为小程序 |

## 目录结构规范（原生小程序）

```
miniprogram/
├── app.js / app.json / app.wxss
├── pages/{domain}/{page}/        # 主包页面
├── package{A}/pages/             # 分包
├── components/                   # 公共组件
└── utils/
    ├── request.js                # 网络请求封装
    ├── auth.js                   # 登录/token 管理
    └── cache.js                  # 缓存工具（含过期机制）
```

## 登录流程规范

```
App.onLaunch：wx.getStorageSync('token')
    ├─ token 存在 → 调用后端 /api/auth/verify 验证 token 有效性
    │       ├─ 有效 → 正常进入
    │       └─ 无效（401）→ 清除 token，进入静默登录流程
    └─ token 不存在 → 进入静默登录流程

静默登录流程：
    wx.login() → 获取 code
    → 调用后端 POST /api/auth/miniapp/login（body: { code }）
    → 后端返回 token + userInfo
    → wx.setStorageSync('token', token) + wx.setStorageSync('userInfo', userInfo)
```

## 页面跳转规范

| 场景 | API | 说明 |
|-----|-----|-----|
| 普通页面跳转（可返回） | `wx.navigateTo` | 保留当前页面，最多10层 |
| 替换当前页面（不可返回） | `wx.redirectTo` | 关闭当前页面 |
| 跳转 tabBar 页面 | `wx.switchTab` | 关闭所有非 tabBar 页面 |
| 返回上一页 | `wx.navigateBack` | `delta` 参数控制返回层数 |

**跨页面传参**：简单参数用 URL 拼接；复杂对象用 `EventChannel`；返回时传值用 `EventChannel.emit`，不用 `globalData`。

## 性能优化规范

**setData 使用约束**：
- 合并为一次 `setData`，禁止在循环中频繁调用
- 单次 `setData` 数据量不超过 **1MB**
- 更新列表单条数据用路径语法：`this.setData({ 'list[0].status': newStatus })`

**长列表优化**：超过 **50条** 的列表使用虚拟列表；每页不超过 **20条**。

## 微信支付设计规范

```
用户点击「支付」
    ↓
前端调用后端 POST /api/order/prepay（body: { orderId }）
    ↓
后端调用微信统一下单 API，返回支付参数
    ↓
前端调用 wx.requestPayment(payParams)
    ├─ 成功 → 调用后端 GET /api/order/{id}/status 查询最终状态（不信任前端回调）
    └─ 失败
        ├─ fail cancel → 用户取消，Toast 提示，不报错
        └─ 其他失败 → wx.showModal 显示原因，提供重试按钮
```

支付安全：支付结果以后端查询为准；支付参数（sign）由后端生成；订单金额在后端校验。

## 分包设计决策树

```
该页面是否在 tabBar 中？
    ├─ 是 → 必须放主包
    └─ 否 → 是否在首屏加载路径上？
                ├─ 是 → 放主包
                └─ 否 → 是否被多个分包共同依赖？
                            ├─ 是 → 放主包（避免分包间互相依赖）
                            └─ 否 → 放对应功能域的分包
```

主包目标：**< 1MB**（为后续迭代留出空间）。

## 错误边界与降级设计

| 场景 | 降级方案 |
|-----|---------|
| 接口请求失败 | 显示空状态组件 + 重试按钮，不白屏 |
| 图片加载失败 | `binderror` 事件替换为默认占位图 |
| 微信 API 不支持（低版本） | `wx.canIUse` 检测，不支持时隐藏功能入口 |
| 分包加载失败 | 捕获 `wx.navigateTo` 的 fail 回调，提示用户重试 |

---

# Part 5：语言工程规则

> 加载时机：Step 5 生成 `编码规范.md` 时，根据 LC-001 加载对应语言节（**按需加载，无需全文**）：
> - LC-001 = Java → 5.1 + 5.5
> - LC-001 = Python → 5.2 + 5.5
> - LC-001 = Go → 5.3 + 5.5
> - LC-001 = Node.js → 5.4 + 5.5

---

## 5.1 Java 工程规则

### ER-FORBIDDEN：禁止使用项

| 禁止项 | 替代方案 |
|--------|---------|
| `new Date()` / `SimpleDateFormat` | `LocalDateTime.now()` / `DateUtil` |
| `System.out.println()` | `log.info()` / `log.error()` |
| `e.printStackTrace()` | `log.error("描述", e)` |
| `double`/`float` 用于金额 | `BigDecimal` |
| `MD5`/`SHA1` 用于密码存储 | `BCryptPasswordEncoder` |
| MyBatis XML 中 `${}` 拼接用户输入 | `#{}` 参数绑定 |
| `SELECT *` | 明确列出所需字段 |
| 循环内调用 Mapper | 批量查询 + Map 映射 |
| `@Transactional` 内调用 HTTP 接口 | 事务外执行或消息队列解耦 |
| 硬编码 IP / URL / 密钥 | 配置文件 + 环境变量 |

### ER-REQUIRED：必须实现项

**每个 Service 方法**：入参日志（INFO）/ 异常日志（ERROR + 堆栈）/ 业务规则校验（对照详设第2节）/ 不允许空 catch

**每个写操作 Service 方法**：`@Transactional(rollbackFor = Exception.class)` / 操作前状态校验 / 操作后返回值检查

**每个 Controller 方法**：`@Valid` / 返回 `BaseResponse<T>` / Swagger 注解 / 不包含业务逻辑

**每个 Entity**：`@TableName` / `@TableId` / `created_at`、`updated_at`、`created_by`、`updated_by`、`deleted` 五个基础字段 / `@TableLogic`

---

## 5.2 Python 工程规则

### ER-FORBIDDEN：禁止使用项

| 禁止项 | 替代方案 |
|--------|---------|
| `print()` 在业务代码中 | `logger.info()` / `logger.error()` |
| 裸 `except:` 或 `except Exception: pass` | 记录日志 + 重新抛出或返回错误 |
| `datetime.now()` 不带时区 | `datetime.now(timezone.utc)` |
| `float` 用于金额 | `Decimal` |
| `MD5`/`SHA1` 用于密码 | `passlib.hash.bcrypt` |
| f-string 拼接 SQL | SQLAlchemy ORM 参数化查询 |
| `SELECT *` | 明确列出所需字段 |
| `async def` 中同步阻塞调用 | `run_in_executor` 或异步库 |
| 循环内 ORM 查询 | 批量查询 + 字典映射 |
| 硬编码 IP / URL / 密钥 | `pydantic-settings` + 环境变量 |

### ER-REQUIRED：必须实现项

**每个 Service 方法**：入参日志（INFO）/ 异常日志（ERROR + `exc_info=True`）/ 业务规则校验 / 不允许裸 except

**每个写操作 Service 方法**：`async with db.begin()` 事务包装 / 操作前状态校验 / 操作后结果验证

**每个 Router 函数**：Pydantic Schema 校验 / 返回 `BaseResponse` / OpenAPI 注解 / 不包含业务逻辑

**每个 SQLAlchemy Model**：`__tablename__` / `created_at`、`updated_at`、`deleted`（SmallInteger, 0=正常）/ `Mapped[T]` 类型注解

---

## 5.3 Go 工程规则

### ER-FORBIDDEN：禁止使用项

| 禁止项 | 替代方案 |
|--------|---------|
| `fmt.Println()` 在业务代码中 | `logger.Info()` / `logger.Error()` |
| `panic()` 在业务逻辑中 | 返回 `(result, error)` |
| 忽略 error 返回值（`_ = err`） | 显式处理或向上传递 |
| `time.Now()` 不带时区 | `time.Now().UTC()` |
| `float64` 用于金额 | `github.com/shopspring/decimal` |
| 字符串拼接 SQL | GORM 参数化查询 |
| `SELECT *` | 明确列出所需字段 |
| 循环内 DB 查询 | 批量查询 + map 映射 |
| 全局变量存储请求状态 | `context.Context` 传递 |
| goroutine 泄漏（无退出机制） | context 取消或 WaitGroup |
| 硬编码 IP / URL / 密钥 | `viper` + 环境变量 |

### ER-REQUIRED：必须实现项

**每个 Service 方法**：入参日志（Info）/ 异常日志（Error）/ 业务规则校验 / 不允许忽略 error

**每个写操作 Service 方法**：`db.Transaction()` 事务包装 / 操作前状态校验 / `RowsAffected` 检查

**每个 Handler 函数**：`ShouldBindJSON` + validator 校验 / 返回 `BaseResponse` / 不包含业务逻辑

**每个 GORM Model**：`gorm.Model` 嵌入 / `TableName()` 方法 / 字段 tag（column、type、comment）

---

## 5.4 Node.js 工程规则

### ER-FORBIDDEN：禁止使用项

| 禁止项 | 替代方案 |
|--------|---------|
| `console.log()` 在业务代码中 | `logger.info()` / `logger.error()` |
| 未处理的 Promise rejection | `.catch()` 或 `try/await/catch` |
| `new Date()` 不带时区处理 | `dayjs().utc()` |
| `Number` 用于金额 | `decimal.js` / 整数分为单位 |
| 字符串拼接 SQL | TypeORM/Prisma 参数化查询 |
| `SELECT *` | 明确列出所需字段 |
| `any` 类型（TypeScript） | 明确类型或 `unknown` |
| 循环内 DB 查询 | 批量查询 + Map 映射 |
| 在 Controller 中写业务逻辑 | 业务逻辑下沉到 Service |
| 硬编码 IP / URL / 密钥 | `@nestjs/config` + 环境变量 |

### ER-REQUIRED：必须实现项

**每个 Service 方法**：入参日志（info）/ 异常日志（error + stack）/ 业务规则校验 / 不允许空 catch

**每个写操作 Service 方法**：`DataSource.transaction()` 事务包装 / 操作前状态校验 / `affected` 检查

**每个 Controller 方法**：DTO 校验（class-validator + ValidationPipe）/ 返回 `BaseResponse` / Swagger 注解 / 不包含业务逻辑

**每个 TypeORM Entity**：`@Entity()` 指定表名 / `@PrimaryGeneratedColumn()` / `createdAt`、`updatedAt`、`deleted`（tinyint, 0=正常）/ 字段 comment

---

## 5.5 通用工程规则（所有语言共用）

### ER-QUALITY：代码质量门槛

| 指标 | Java | Python / Go / Node.js | 超出时的处理 |
|------|------|-----------------------|-------------|
| 单个方法/函数行数 | ≤ 80 行 | ≤ 60 行 | 提取私有方法 |
| 单个类/文件行数 | ≤ 500 行 | ≤ 400 行 | 拆分职责/模块 |
| 嵌套层级 | ≤ 4 层 | ≤ 4 层 | 提前 return 或提取方法 |
| 相同代码块重复次数 | ≤ 2 次 | ≤ 2 次 | 提取公共方法 |
| 方法圈复杂度 | ≤ 10 | ≤ 10 | 拆分条件逻辑 |

### ER-SECURITY：安全强制要求（应用于所有语言）

| 编号 | 要求 |
|------|------|
| ER-S-001 | 禁止字符串拼接构造 SQL，必须使用参数化查询 |
| ER-S-002 | 所有涉及用户数据的查询必须验证数据归属 |
| ER-S-003 | 日志中禁止出现密码、Token、完整手机号、身份证号 |
| ER-S-004 | 响应 DTO/结构体中禁止包含密码哈希、内部 Token 等敏感字段 |
| ER-S-005 | 所有对外接口必须通过认证拦截器/中间件/Guard，公开接口需显式配置白名单 |

### ER-PERFORMANCE：性能强制要求（应用于所有语言）

| 编号 | 要求 |
|------|------|
| ER-P-001 | 分页查询必须使用框架分页机制，禁止全量加载后切片 |
| ER-P-002 | 单次查询结果集不超过 `{N}` 条（超出时必须分页）|
| ER-P-003 | 高频查询接口（TPS > `{N}`）必须有 Redis 缓存 |
| ER-P-004 | 缓存 key 格式：`{项目}:{模块}:{业务}:{唯一标识}` |
| ER-P-005 | 所有缓存必须设置 TTL，禁止永不过期 |
