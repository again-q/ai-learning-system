# 代码评审检查清单（通用层）

## 目录

| 维度 | 章节 | 说明 |
|------|------|------|
| 维度1 编码规范符合性 | 1.1 命名规范、1.2 类/模块注释、1.3 日志规范、1.4 响应格式、1.5 代码格式 | **语言特化内容见 `lang/{language}.md`** |
| 维度2 业务逻辑一致性 | 2.1 业务规则完整性、2.2 伪代码忠实度、2.3 接口契约符合性、2.4 异常处理、2.5 数据一致性 | 所有语言通用 |
| 维度3 安全漏洞扫描 | 3.1 注入防护、3.2 越权访问、3.3 敏感信息、3.4 认证授权、3.5 输入验证、3.6 幂等性、3.7 其他安全项 | 所有语言通用 |
| 维度4 性能反模式 | 4.1 N+1 查询、4.2 大事务、4.3 缓存使用、4.4 数据库查询效率、4.5 内存与资源管理 | 所有语言通用 |
| 维度5 可维护性 | 5.1 代码复杂度、5.2 重复代码、5.3 魔法数字、5.4 可测试性、5.5 注释质量、5.6 异常处理规范 | 所有语言通用 |

---

> **架构说明**：本文件为**语言无关通用层**，包含维度1的通用命名原则和维度2-5的完整检查项。
> 维度1的语言特化检查项（注解/装饰器、工具库、框架约定、响应格式等）由 `lang/{language}.md` 提供：
>
> | LC-001 值 | 加载文件 |
> |-----------|---------|
> | `java` | `references/lang/java.md` |
> | `python` | `references/lang/python.md` |
> | `go` | `references/lang/go.md` |
> | `nodejs` | `references/lang/nodejs.md` |
>
> **通用原则**（所有语言适用）：
> - 命名规范符合目标语言惯例（驼峰/下划线/帕斯卡等）
> - 日志使用框架而非 print/println/console.log 裸输出
> - 敏感信息不出现在日志和响应中
> - 写操作有事务/原子性保护
> - 输入有校验，输出有统一格式
> - 无 N+1 查询，无大事务，无缓存穿透

---

## 维度1：编码规范符合性检查清单（通用部分）

> ⚠️ 本节仅包含**所有语言通用**的命名原则。
> 语言特化检查项（注解/装饰器、工具库、框架约定、响应格式等）见 `lang/{language}.md` § 维度1扩展。

### 1.1 命名规范（通用原则）
- [ ] 类/结构体/模块名使用目标语言惯例（Java/JS/TS: UpperCamelCase；Go: UpperCamelCase；Python: UpperCamelCase）
- [ ] 方法/函数名使用目标语言惯例（Java/JS/TS: lowerCamelCase；Go: lowerCamelCase/UpperCamelCase；Python: snake_case）
- [ ] 变量名使用目标语言惯例（Java/JS/TS: lowerCamelCase；Go: lowerCamelCase；Python: snake_case）
- [ ] 常量使用目标语言惯例（Java/JS: UPPER_SNAKE_CASE；Go: UpperCamelCase；Python: UPPER_SNAKE_CASE）
- [ ] 包/模块/命名空间名符合目标语言惯例（Java: 全小写无下划线；Go: 全小写；Python: snake_case）
- [ ] 布尔变量/函数命名语义清晰（如 `isActive`、`hasPermission`、`canRetry`）
- [ ] DTO/请求响应对象有明确后缀（如 `Request`/`Response`/`DTO`/`Schema`/`Payload`）
- [ ] 枚举/常量集合命名语义明确，值命名清晰

### 1.2 模块/类注释规范（通用原则）
- [ ] 每个公开类/模块/包有文档注释，说明其职责
- [ ] 注释包含作者信息（`@author` 或等效）
- [ ] 注释包含创建/更新日期
- [ ] 复杂公开方法/函数有文档注释，说明参数和返回值
- [ ] 注释语言与项目规范一致（中文/英文统一）

### 1.3 日志规范（通用原则）
- [ ] 使用框架日志（Log4j/Logback/logging/zap/winston 等），禁止裸输出（`print`/`println`/`console.log`）
- [ ] 禁止 `e.printStackTrace()` 或等效的裸异常打印
- [ ] 日志消息使用占位符，禁止字符串拼接构造日志
- [ ] 关键业务操作有 INFO 日志（含入参摘要，不含敏感信息）
- [ ] 异常捕获有 ERROR 日志（含异常堆栈）
- [ ] 外部接口调用有 INFO 日志（请求参数 + 响应结果摘要）
- [ ] 日志级别使用合理：DEBUG（调试）、INFO（业务流程）、WARN（潜在问题）、ERROR（异常）

### 1.4 响应格式规范（通用原则）
- [ ] 所有接口返回值使用项目统一的响应包装格式（`BaseResponse`/`ApiResponse`/`Result` 等，依 LC-004 约定）
- [ ] 成功响应和失败响应格式一致
- [ ] 禁止直接返回裸对象、`null`、无结构的 Map/dict
- [ ] 分页响应使用统一的分页包装格式
- [ ] 错误响应包含错误码和可读消息

### 1.5 代码格式规范（通用原则）
- [ ] 缩进风格与项目规范一致（空格数/Tab 依语言惯例）
- [ ] 每行长度不超过项目规范上限（通常 80-120 字符）
- [ ] 函数/方法之间有空行分隔
- [ ] 无未使用的 import/require/use 语句
- [ ] 无注释掉的代码块（应删除，版本控制会保留历史）

---

## 维度2：业务逻辑一致性检查清单

### 2.1 业务规则实现完整性
- [ ] 设计文档第2节每条业务规则，在业务逻辑层中有对应实现
- [ ] 每条规则的校验逻辑完整（非空、长度、格式、业务约束）
- [ ] 规则违反时抛出的异常/错误码与设计文档一致
- [ ] 规则违反时的错误消息与设计文档一致
- [ ] 规则的执行顺序与设计文档一致（先校验后操作）

### 2.2 伪代码忠实度
- [ ] 设计文档第4节每个步骤，在业务逻辑层中有对应代码段
- [ ] 无步骤被跳过（即使"感觉不重要"）
- [ ] 无步骤被合并（可能遗漏边界条件）
- [ ] 条件分支完整（if 有对应 else，switch/match 有 default/case）
- [ ] 循环逻辑与伪代码一致（循环条件、终止条件）

### 2.3 接口契约符合性
- [ ] **设计文档第3节所有接口在后端代码中均有对应实现**（逐条检查：HTTP方法 + 路径 → Controller/Router/Handler 中存在对应注册，缺失一条即为 **P0**）
- [ ] 路由/URL 路径与 OpenAPI 定义完全一致
- [ ] HTTP 方法（GET/POST/PUT/DELETE/PATCH）正确
- [ ] 请求参数名称与 OpenAPI 定义一致（大小写敏感）
- [ ] 响应字段名称与 OpenAPI 定义一致
- [ ] 分页接口参数名与设计文档一致（`pageNum`/`page`/`offset` 等）
- [ ] 必填参数有校验，可选参数无强制校验

### 2.4 异常处理完整性
- [ ] 每个可能失败的操作有异常处理（数据库操作、外部调用、文件操作）
- [ ] 无空 catch/except 块
- [ ] 无吞掉异常后继续执行的情况
- [ ] 自定义异常使用设计文档定义的错误码
- [ ] 全局异常处理器/中间件覆盖所有自定义异常类型
- [ ] 数据库唯一约束冲突有对应的业务异常处理

### 2.5 数据一致性
- [ ] 写操作后返回的数据与数据库状态一致（不返回入参，而是查询最新状态）— **豁免**：JPA/GORM/SQLAlchemy 的 `save()`/`insert()` 返回值已是持久化后对象，无需额外查询；手写 SQL 或无返回值的 ORM 方法必须额外查询
- [ ] 软删除操作正确设置删除标记字段
- [ ] 创建时间、更新时间由框架/ORM 自动填充
- [ ] 乐观锁/版本号字段在更新时正确处理

---

## 维度3：安全漏洞检查清单

### 3.1 注入防护（SQL / NoSQL / 命令注入）
- [ ] 数据库查询使用参数化查询/预编译语句，禁止字符串拼接 SQL
- [ ] ORDER BY / GROUP BY 字段使用白名单校验（不直接使用用户输入）
- [ ] ORM 框架的动态查询使用框架提供的安全 API，而非字符串拼接
- [ ] 无命令注入风险（用户输入不直接传入 shell 命令）
- [ ] NoSQL 查询（MongoDB/Redis 等）同样使用参数化，避免注入

### 3.2 越权访问防护
- [ ] 查询操作验证数据归属（`WHERE id = ? AND user_id = ?`）
- [ ] 修改/删除操作验证数据归属
- [ ] 管理员接口有权限校验（角色/权限注解或中间件）
- [ ] 批量操作验证每条数据的归属（不能仅校验第一条）
- [ ] 文件下载接口验证文件归属

### 3.3 敏感信息保护
- [ ] 日志中无密码、Token、身份证号、银行卡号、完整手机号
- [ ] 响应体中无密码哈希、盐值、内部 ID 等敏感字段
- [ ] 异常信息不直接返回给前端（全局异常处理器统一处理）
- [ ] 配置文件中无明文密码（使用环境变量或加密配置）
- [ ] 代码中无硬编码的密钥、密码、Token、AK/SK

### 3.4 认证与授权
- [ ] 需要登录的接口有对应的认证要求（中间件/注解/守卫）
- [ ] Token 解析时验证签名和过期时间
- [ ] Token 刷新逻辑正确（旧 Token 失效）
- [ ] 登录失败次数限制（防暴力破解）
- [ ] 密码存储使用 BCrypt 或同等强度的哈希算法

### 3.5 输入验证
- [ ] 所有外部输入（请求参数、请求体、路径参数、Header）有校验
- [ ] 字段有对应的校验规则（非空、长度、格式、范围）
- [ ] 文件上传有文件类型白名单校验
- [ ] 文件上传有文件大小限制
- [ ] 富文本输入有 XSS 过滤（**判定标准**：使用白名单 HTML 标签过滤库，Java 用 Jsoup/AntiSamy，Python 用 bleach，Node.js 用 sanitize-html/DOMPurify，Go 用 bluemonday；手写正则替换不算通过）
- [ ] 整数参数有范围校验（防止负数、超大值）

### 3.6 幂等性保护
- [ ] 支付、下单等关键写操作有幂等保护
- [ ] 幂等 key 设计合理（业务唯一标识，非随机 UUID）
- [ ] 幂等 key 有合理的过期时间
- [ ] 幂等检查和业务操作在同一事务/原子操作中

### 3.7 其他安全项
- [ ] 无 SSRF 风险（用户输入的 URL 不直接用于 HTTP 请求）
- [ ] 无路径遍历风险（文件路径不直接使用用户输入）
- [ ] 无反序列化漏洞（不反序列化不可信来源的数据）
- [ ] CORS 配置合理（不使用 `allowedOrigins("*")` + `allowCredentials(true)`）

---

## 维度4：性能反模式检查清单

### 4.1 N+1 查询
- [ ] 无在循环内调用数据库/ORM 的情况
- [ ] 列表查询的关联数据使用批量查询（`IN` 查询）而非循环单条查询
- [ ] 关联数据量小时使用 JOIN 查询，量大时使用批量查询 + 内存组装
- [ ] ORM 的懒加载关联在循环中使用时注意 N+1 问题

### 4.2 大事务
- [ ] 事务方法内无 HTTP 请求、RPC 调用
- [ ] 事务方法内无消息发送（MQ）
- [ ] 事务方法内无文件 I/O 操作
- [ ] 事务方法不包含不需要事务保护的纯读操作
- [ ] 批量写操作分批提交（每批 500-1000 条），而非一次性大事务

### 4.3 缓存使用
- [ ] 高频读取、低频变更的数据有缓存（Redis/内存缓存）
- [ ] 缓存 key 有 TTL（无永不过期的缓存）
- [ ] 缓存穿透防护：查询不存在的数据时缓存空值（TTL 较短）
- [ ] 缓存击穿防护：热点 key 过期时使用分布式锁重建缓存
- [ ] 缓存雪崩防护：TTL 加随机偏移（`baseTime + random(0, 300)`）
- [ ] 缓存更新策略一致（先更新数据库，再删除缓存）

### 4.4 数据库查询效率
- [ ] 查询条件字段有索引（对照 DDL 的 INDEX 定义）
- [ ] 无 `SELECT *`（应指定具体字段）
- [ ] 分页查询无深分页问题（大 OFFSET 场景使用游标分页）
- [ ] 批量插入使用批量 SQL（`INSERT INTO ... VALUES (...),(...),...`）
- [ ] 批量更新使用批量语句，而非循环单条 UPDATE
- [ ] 统计查询（COUNT、SUM）有对应的索引支持

### 4.5 内存与资源管理
- [ ] 无一次性加载全量数据到内存（应分页或流式处理）
- [ ] 流、连接、文件句柄等资源在使用后正确关闭（`try-with-resources`/`with`/`defer`/`finally`）
- [ ] 大对象（文件内容、大 JSON）不长期持有在内存中
- [ ] 线程池/协程池/Worker 配置合理（核心数、最大数、队列大小、拒绝策略）
- [ ] 无内存泄漏风险（事件监听器、定时器、全局缓存未清理）

---

## 维度5：可维护性检查清单

### 5.1 代码复杂度
- [ ] 单个方法/函数不超过 80 行（后端业务逻辑；前端组件方法上限为 50 行，见 `frontend-review-checklist.md` § 6.5.1）
- [ ] 嵌套层级不超过 4 层（if/for/try 嵌套）
- [ ] 单个类/模块不超过 500 行
- [ ] 方法/函数的圈复杂度不超过 10（条件分支数量）
- [ ] 函数参数不超过 5 个（超过时使用参数对象/结构体）

### 5.2 重复代码
- [ ] 相似代码块不超过 2 处（第 3 处应提取为公共函数/方法）
- [ ] 相同的业务校验逻辑不在多个模块中重复
- [ ] 相同的数据转换逻辑提取为工具函数/Converter

### 5.3 魔法数字与硬编码
- [ ] 无未命名的数字常量（应使用命名常量或枚举）
- [ ] 无硬编码的 URL、IP、端口（应在配置文件/环境变量中管理）
- [ ] 无硬编码的业务参数（超时时间、重试次数、阈值应可配置）
- [ ] 状态值使用枚举/常量，而非裸 int/string（**判定标准**：同一状态值在 2 处及以上引用时必须提取为常量/枚举；仅 1 处引用可不提取，但应加注释说明含义）

### 5.4 可测试性
- [ ] 依赖通过构造函数/参数注入，而非在函数内部直接实例化
- [ ] 无在业务逻辑中直接 `new`/实例化外部依赖对象
- [ ] 无静态方法直接调用外部服务（难以 Mock）
- [ ] 时间相关逻辑使用可注入的时钟/时间函数，而非直接调用 `now()`

### 5.5 注释质量
- [ ] 复杂业务逻辑有注释说明"为什么"（而非"是什么"）
- [ ] 无过时注释（注释描述与代码行为不符）
- [ ] TODO 注释有负责人和说明
- [ ] 无注释掉的代码块（应删除，版本控制会保留历史）
- [ ] 关键算法有注释说明时间复杂度和空间复杂度

### 5.6 异常处理规范
- [ ] 无空 catch/except 块
- [ ] 无过于宽泛的异常捕获（应捕获具体异常类型）
- [ ] 异常不用于控制正常业务流程（不用 try-catch 代替 if-else）
- [ ] 自定义异常继承自合适的基类
- [ ] 异常消息清晰，包含足够的上下文信息（如：`"用户不存在: userId=" + userId`）

---

## 语言特化检查项

> 以下各节在对应语言（`LC-001`）时加载，通用层（维度1~5）始终适用。

---

## 【Java / Spring Boot】特化检查项（LC-001 = java）

> 框架：Spring Boot 3.x + MyBatis / MyBatis-Plus

### J-1 Java 命名规范（补充）
- [ ] 类名使用 UpperCamelCase（如 `UserServiceImpl`）
- [ ] 方法名、变量名使用 lowerCamelCase（如 `getUserById`）
- [ ] 常量使用 UPPER_SNAKE_CASE（如 `MAX_RETRY_COUNT`）
- [ ] 包名全小写，无下划线（如 `com.example.user.service`）
- [ ] 接口名不加 `I` 前缀；实现类加 `Impl` 后缀
- [ ] 布尔字段避免 `isXxx` 命名（Lombok `@Data` + Jackson 序列化会去掉 `is` 前缀导致字段名不一致，建议使用 `active` 字段名）

### J-2 注解规范
- [ ] Service 实现类：`@Slf4j` + `@Service` + `@RequiredArgsConstructor`
- [ ] Controller：`@RestController` + `@RequestMapping` + `@Tag(name="...")`
- [ ] Entity：`@Data` + `@TableName` + `@NoArgsConstructor` + `@AllArgsConstructor`
- [ ] DTO：`@Data` + `@Schema(description="...")`
- [ ] 写操作 Service 方法：`@Transactional(rollbackFor = Exception.class)`
- [ ] 读操作 Service 方法（高并发场景）：`@Transactional(readOnly = true)`
- [ ] Controller 方法：`@Operation(summary="...")` + 参数加 `@Valid`

### J-3 工具库使用（Hutool 优先）
- [ ] 日期时间：`LocalDateTime` + `DateUtil`（Hutool），禁止 `SimpleDateFormat`（线程不安全）
- [ ] 字符串：`StrUtil`（Hutool），禁止手写 null 判断 + isEmpty
- [ ] 集合：`CollUtil`（Hutool），禁止手写 null 判断 + size()==0
- [ ] Bean 拷贝：`BeanUtil.copyProperties`（Hutool），禁止手写 getter/setter 拷贝
- [ ] HTTP 请求：`HttpUtil`（Hutool）或 `RestTemplate`/`OpenFeign`，禁止手写 `HttpURLConnection`

### J-4 SQL 注入防护（MyBatis 专项）
- [ ] MyBatis XML 中无 `${}` 拼接用户输入（ORDER BY 除外）
- [ ] ORDER BY 字段使用白名单校验
- [ ] 动态查询使用 MyBatis `<if>` 标签或 MyBatis-Plus `QueryWrapper`，禁止字符串拼接

### J-5 Spring 事务与性能
- [ ] `@Transactional` 方法内无 HTTP 请求、RPC 调用、MQ 发送、文件 I/O
- [ ] MyBatis `<collection>/<association>` 使用 `select` 属性时无 N+1 问题
- [ ] 无在循环内调用 Mapper 的情况

### J-6 可测试性与异常处理
- [ ] Service 依赖通过构造函数注入（`@RequiredArgsConstructor`），禁止 `@Autowired` 字段注入
- [ ] 全局异常处理器使用 `@RestControllerAdvice`
- [ ] 软删除使用 `deleted` 字段；创建/更新时间由 `@TableField(fill=...)` 自动填充
- [ ] 乐观锁字段（`version`）使用 `@Version` 注解正确处理

---

## 【Python / FastAPI / Django】特化检查项（LC-001 = python）

> 框架：FastAPI 或 Django REST Framework

### P-1 Python 命名规范（补充）
- [ ] 函数名、变量名使用 snake_case；类名使用 UpperCamelCase；常量使用 UPPER_SNAKE_CASE
- [ ] 模块名使用 snake_case（如 `user_service.py`）；私有方法以单下划线开头
- [ ] Pydantic Schema 类加 `Request`/`Response`/`Schema` 后缀

### P-2 装饰器与框架规范（FastAPI）
- [ ] 路由函数有 `summary` 和 `response_model` 参数（OpenAPI 文档）
- [ ] 依赖注入使用 `Depends()`，禁止在路由函数内直接实例化 Service
- [ ] 写操作 Service 在 `get_db()` 返回的 session 上操作（`get_db()` 已通过 `async with session.begin()` 启动事务，Service 层**不得**再嵌套 `async with db.begin()`，会报"A transaction is already begun"；嵌套事务用 `begin_nested()`）
- [ ] 读操作路由**无需**显式开启事务（直接使用 session 查询即可）
- [ ] 异步路由使用 `async def`；同步 CPU 密集型任务使用 `run_in_executor`

### P-3 工具库使用（Python）
- [ ] 日期时间：`datetime` 标准库或 `pendulum`，禁止手写时区转换
- [ ] 数据校验：Pydantic v2（FastAPI）或 DRF Serializer（Django），禁止手写正则校验
- [ ] 加密：`passlib`（bcrypt）或 `hashlib`，禁止手写 MD5/SHA 密码哈希
- [ ] 环境变量：`pydantic-settings` 或 `python-dotenv`，禁止 `os.environ.get` 散落各处

### P-4 SQL 注入防护（SQLAlchemy / Django ORM）
- [ ] SQLAlchemy：使用 ORM 查询或 `text()` + 参数绑定，禁止字符串拼接 SQL
- [ ] Django ORM：使用 `filter()`/`exclude()` 参数化，禁止 `raw()` 拼接用户输入
- [ ] 动态排序字段使用白名单校验；富文本输入使用 `bleach` 过滤 XSS

### P-5 异步安全与性能
- [ ] 异步函数中无阻塞 I/O（`time.sleep`/同步数据库调用）
- [ ] 共享状态使用 `asyncio.Lock` 保护
- [ ] SQLAlchemy 关联查询使用 `joinedload()`/`selectinload()` 预加载，避免 N+1
- [ ] 事务块内无 HTTP 请求、长时间等待

### P-6 可测试性与异常处理
- [ ] Service 层函数依赖通过参数注入（FastAPI `Depends`），禁止模块级全局实例
- [ ] 全局异常使用 `@app.exception_handler()` 或中间件；禁止裸 `except:` 吞掉异常
- [ ] 所有公开函数有完整类型注解；禁止 `Any` 类型滥用

---

## 【Go / Gin / Echo】特化检查项（LC-001 = go）

> 框架：Gin 或 Echo

### G-1 Go 命名规范（补充）
- [ ] 导出符号用 UpperCamelCase；未导出符号用 lowerCamelCase；包名全小写单词
- [ ] 常量使用 UpperCamelCase（导出）或 lowerCamelCase（未导出），禁止 UPPER_SNAKE_CASE
- [ ] 错误变量以 `Err` 前缀命名（如 `ErrUserNotFound`）；缩写词全大写（如 `userID`、`apiURL`）
- [ ] 接口名以行为命名，单方法接口用 `-er` 后缀

### G-2 框架规范（Gin/Echo）
- [ ] 路由注册在 `router/` 或 `handler/` 层，禁止在 `main.go` 注册业务路由
- [ ] Handler 只做参数绑定和响应，业务逻辑委托给 Service 层
- [ ] 参数绑定使用 `c.ShouldBindJSON()`/`c.ShouldBindQuery()`，禁止手动解析 `c.Request.Body`
- [ ] 认证、日志、限流中间件在路由组级别注册

### G-3 工具库使用（Go）
- [ ] 日志：`zap`（uber-go）或 `logrus`，禁止裸 `fmt.Println`/`log.Println`；禁止 `panic` 用于业务错误
- [ ] UUID：`github.com/google/uuid`；加密：`golang.org/x/crypto/bcrypt`
- [ ] 配置：`viper` 或 `envconfig`，禁止 `os.Getenv` 散落各处
- [ ] 错误必须处理，禁止 `_ = someFunc()` 忽略错误（除非有明确注释说明原因）

### G-4 SQL 注入防护（GORM / sqlx）
- [ ] GORM：使用 `Where("id = ?", id)` 参数化，禁止 `Where("id = " + id)` 字符串拼接
- [ ] GORM 更新：使用 `Updates(map[string]interface{}{...})` 部分更新，**禁止** `db.Save(entity)` 全字段更新（会将零值字段覆盖数据库原有数据）
- [ ] Repository 的 `Update` 方法签名应接收 `map[string]interface{}` 而非整个 entity struct

### G-5 goroutine 安全与性能
- [ ] 共享状态使用 `sync.Mutex`/`sync.RWMutex` 保护；并发读写 map 使用 `sync.Map`
- [ ] goroutine 有明确退出条件或 `context.Done()` 监听，无 goroutine 泄漏
- [ ] 事务函数内无 HTTP 请求、`time.Sleep()`；批量写用 `db.CreateInBatches(&records, 500)`
- [ ] GORM 关联查询使用 `Preload()` 预加载，避免 N+1

### G-6 可测试性与错误处理
- [ ] Repository/Service 层定义接口，Handler 依赖接口而非具体实现
- [ ] 错误使用 `fmt.Errorf("...: %w", err)` 包装保留错误链；使用 `errors.Is/As` 判断类型
- [ ] 资源（文件、HTTP 响应体）使用 `defer f.Close()` 关闭；Context 传递链从 Handler 到 Repository 完整

---

## 【Node.js / NestJS / Express】特化检查项（LC-001 = nodejs）

> 框架：NestJS 或 Express（TypeScript 优先）

### N-1 TypeScript 命名规范（补充）
- [ ] 类名 UpperCamelCase；函数/变量 lowerCamelCase；常量 UPPER_SNAKE_CASE；文件名 kebab-case
- [ ] 接口名风格依编码规范文档（LC-003）为准，同一项目内保持一致即可
- [ ] DTO 加 `Dto` 后缀（如 `CreateUserDto`）；枚举值使用 UPPER_SNAKE_CASE

### N-2 装饰器与框架规范（NestJS）
- [ ] Controller：`@Controller` + `@ApiTags` + `@UseGuards(JwtAuthGuard)`
- [ ] Service：`@Injectable()` + 构造函数注入依赖
- [ ] 写操作 Service 方法：使用 `@Transactional()` 或手动事务
- [ ] 参数校验：`@Body()` + `ValidationPipe`；DTO 字段加 `class-validator` 注解（`whitelist: true` 过滤未声明字段，防批量赋值漏洞）
- [ ] 权限控制：`@Roles('admin')` + `RolesGuard`

### N-3 工具库使用（Node.js）
- [ ] 日期时间：`dayjs` 或 `date-fns`，禁止 `moment`（已废弃）
- [ ] 加密：`bcrypt`/`argon2`，禁止手写 MD5/SHA 密码哈希
- [ ] 日志：`winston` 或 `pino`，禁止裸 `console.log`；生产环境禁止 `debug` 级别输出
- [ ] 配置：`@nestjs/config` 或 `dotenv`，禁止 `process.env.XXX` 散落各处

### N-4 SQL 注入与认证（TypeORM / Prisma）
- [ ] TypeORM：使用 `createQueryBuilder().where("id = :id", { id })` 参数化，禁止字符串拼接
- [ ] Prisma：使用 ORM 查询，禁止 `$queryRaw` 拼接用户输入
- [ ] 需要认证的路由使用 `@UseGuards(JwtAuthGuard)`；管理员路由加 `@Roles('admin')` + `RolesGuard`
- [ ] 使用 httpOnly Cookie 存储 Token 时必须配置 CSRF 防护（`sameSite: 'strict'` 或 `'lax'`；跨站场景使用 `csurf` 中间件或 Double Submit Cookie 模式）

### N-5 异步安全与性能
- [ ] 所有 Promise 有 `.catch()` 或 `try-catch` 处理；无未处理的 Promise rejection
- [ ] 事件监听器在不需要时调用 `removeListener()` 移除，避免内存泄漏
- [ ] TypeORM/Prisma 关联查询使用 `relations/include` 预加载，避免 N+1
- [ ] CPU 密集型任务使用 `worker_threads`，避免阻塞事件循环；禁止同步 I/O 在请求路径中

### N-6 可测试性与异常处理
- [ ] Service 依赖通过构造函数注入（NestJS DI），禁止模块级全局实例
- [ ] 全局异常过滤器使用 `@Catch()` + `ExceptionFilter`；禁止裸 `try-catch` 吞掉异常后继续执行
- [ ] 无 `any` 类型滥用（使用 `unknown` 替代，再做类型收窄）；TypeScript 编译无 error