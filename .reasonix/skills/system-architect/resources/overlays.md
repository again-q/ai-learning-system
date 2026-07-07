# 语言技术栈特化规则（Overlays）

> 本文件合并了 Java、Python、Go、Node.js 四种语言的技术栈特化规则。
>
> **加载时机**：Step 2 探测到目标语言后加载本文件，后续安全/数据库/技术栈内容均使用对应语言章节。
> - 目标语言为 Java → 使用「Part 1：Java Overlay」
> - 目标语言为 Python → 使用「Part 2：Python Overlay」
> - 目标语言为 Go → 使用「Part 3：Go Overlay」
> - 目标语言为 Node.js/TypeScript → 使用「Part 4：Node.js Overlay」

---

# Part 1：Java 技术栈特化规则

## 安全设计 — Java 特化实现

### 认证与 Token 策略（Java 实现）

| 检查项 | Java 实现方式 |
|--------|-------------|
| Token 机制 | `io.jsonwebtoken:jjwt` 或 `com.auth0:java-jwt`；双 Token 方案：Access Token（15min）+ Refresh Token（7d） |
| Token 存储 | 前端：`httpOnly Cookie`（Web）或内存（SPA）；后端：Redis 存储 Refresh Token |
| Token 吊销 | Redis 黑名单（`token:blacklist:{jti}`，TTL = Token 剩余有效期） |
| 会话管理 | Spring Security `SecurityContextHolder`，无状态模式（`SessionCreationPolicy.STATELESS`） |

### 敏感数据加密（Java 实现）

| 检查项 | Java 实现方式 |
|--------|-------------|
| 密码哈希 | `BCryptPasswordEncoder`（cost = 12），Spring Security 内置 |
| PII 字段加密 | `AES-256-GCM`，使用 `javax.crypto.Cipher`；推荐封装为 `AesEncryptUtil` |
| 哈希列 | `SHA-256 + 服务端盐`，使用 `SecureUtil.sha256(value + serverSecret)` |
| 传输安全 | Spring Boot 配置 `server.ssl.*`，TLS 1.2+（优先 TLS 1.3） |
| 文件访问 | MinIO/OSS SDK 生成预签名 URL，TTL ≤ 1 小时 |

### API 安全（Java 实现）

| 检查项 | Java 实现方式 |
|--------|-------------|
| 限流 | `bucket4j` 或 `resilience4j-ratelimiter`；Redis 分布式限流 |
| 防重放 | 自定义 `ReplayAttackFilter`，Redis 存储 Nonce（TTL = 10min） |
| 输入校验 | `jakarta.validation`（`@NotBlank`、`@Size`、`@Pattern`）+ `@Valid` |
| RBAC 执行 | Spring Security `@PreAuthorize("hasRole('ADMIN')")`，方法级权限 |

## 数据库设计 — Java 特化规范

### ORM 框架选型

| 场景 | 推荐方案 |
|------|---------|
| 标准 CRUD + 复杂查询 | **MyBatis 3.x + MyBatis-Plus**（推荐，灵活可控） |
| 快速原型 + 简单查询 | Spring Data JPA + Hibernate |
| 混合场景 | MyBatis-Plus 处理复杂查询，JPA 处理简单 CRUD |

### MyBatis-Plus 实体规范

```java
@Data
@TableName("t_{entity}")
public class {Entity}DO {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String {entity}Id;          // UUID 业务主键
    // ... 业务字段 ...
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private String createdBy;
    private String updatedBy;
    @TableLogic
    private Integer deleted;            // 0=正常, 1=已删除
}
```

### 命名规范（Java + MySQL）

| 规范项 | 规则 |
|--------|------|
| 表前缀 | `t_`（如 `t_user`、`t_order`） |
| 主键 | 自增 `id BIGINT` + UUID `{entity}_id VARCHAR(36)` 并存 |
| 软删除 | `deleted TINYINT NOT NULL DEFAULT 0`，加 `@TableLogic` |
| 时间戳 | `created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`，`updated_at ... ON UPDATE CURRENT_TIMESTAMP` |
| 状态字段 | `TINYINT`，COMMENT 中列出所有枚举值 |
| Java 字段 | `camelCase`，MyBatis-Plus 自动映射 `snake_case` |

## 技术栈推荐（Java 生态）

| 组件 | 推荐选型 | 版本 |
|------|---------|------|
| Web 框架 | Spring Boot | 3.x（JDK 17+） |
| 数据访问 | MyBatis-Plus | 3.5.x |
| 安全框架 | Spring Security | 6.x |
| 缓存 | Spring Data Redis + Lettuce | 3.x |
| 消息队列 | Spring AMQP（RabbitMQ）/ Spring Kafka | 3.x |
| 工具库 | Hutool | 5.x |
| 参数校验 | jakarta.validation（Spring Boot 内置） | — |
| 分页 | PageHelper | 2.x |
| API 文档 | SpringDoc OpenAPI | 2.x |
| 对象映射 | MapStruct | 1.5.x |

### 分层模型

```
Controller（接口层）→ DTO（Request/Response）
Service（业务逻辑层）→ DO（数据对象）
Mapper（数据访问层）→ MyBatis XML
Database（MySQL / PostgreSQL）
```

### 项目结构

```
backend/
└── src/main/java/{base-package}/
    ├── controller/          # REST 控制器
    ├── service/impl/        # 业务逻辑实现
    ├── mapper/              # MyBatis Mapper 接口
    ├── entity/              # 数据库实体（DO）
    ├── dto/request/         # 请求 DTO
    ├── dto/response/        # 响应 DTO
    ├── config/              # 配置类
    ├── exception/           # 自定义异常
    ├── enums/               # 枚举类
    └── util/                # 工具类
```

## 编码规范要点（Java）

- 禁止 `new Date()` / `SimpleDateFormat`，使用 `LocalDateTime` / `DateUtil`
- 禁止 `System.out.println()`，使用 `@Slf4j` + `log.info/warn/error`
- 禁止 `e.printStackTrace()`，使用 `log.error("描述", e)`
- 禁止金额使用 `double/float`，使用 `BigDecimal`
- 禁止密码使用 `MD5/SHA1`，使用 `BCryptPasswordEncoder`
- 禁止 MyBatis XML 中 `${}` 拼接用户输入，使用 `#{}`
- 禁止 `SELECT *`，明确列出所需字段
- 写操作必须加 `@Transactional(rollbackFor = Exception.class)`

---

# Part 2：Python 技术栈特化规则

## 安全设计 — Python 特化实现

### 认证与 Token 策略（Python 实现）

| 检查项 | Python 实现方式 |
|--------|---------------|
| Token 机制 | `python-jose` 或 `PyJWT`；双 Token 方案：Access Token（15min）+ Refresh Token（7d） |
| Token 存储 | 前端：`httpOnly Cookie`（Web）或内存（SPA）；后端：Redis 存储 Refresh Token |
| Token 吊销 | Redis 黑名单（`token:blacklist:{jti}`，TTL = Token 剩余有效期） |
| 会话管理 | FastAPI：`Depends(get_current_user)`；Django：`rest_framework_simplejwt` |

### 敏感数据加密（Python 实现）

| 检查项 | Python 实现方式 |
|--------|---------------|
| 密码哈希 | `passlib[bcrypt]`（`bcrypt` rounds = 12）或 `argon2-cffi` |
| PII 字段加密 | `cryptography` 库，`AES-256-GCM`；封装为 `AesEncryptUtil` |
| 哈希列 | `hashlib.sha256(value.encode() + server_secret.encode()).hexdigest()` |
| 传输安全 | Uvicorn/Gunicorn 配置 SSL，TLS 1.2+（优先 TLS 1.3） |
| 文件访问 | boto3（S3/MinIO）`generate_presigned_url`，TTL ≤ 3600s |

### API 安全（Python 实现）

| 检查项 | Python 实现方式 |
|--------|---------------|
| 限流 | `slowapi`（FastAPI）或 `django-ratelimit`；Redis 分布式限流 |
| 防重放 | 自定义中间件，Redis 存储 Nonce（TTL = 10min） |
| 输入校验 | `pydantic` v2（`Field(min_length=..., pattern=...)`）+ FastAPI 自动校验 |
| RBAC 执行 | FastAPI `Depends` 依赖注入权限检查；Django `@permission_required` |

## 数据库设计 — Python 特化规范

### ORM 框架选型

| 场景 | 推荐方案 |
|------|---------|
| FastAPI + 异步 | **SQLAlchemy 2.x（async）+ asyncpg/aiomysql** |
| Django 项目 | Django ORM（内置） |
| 轻量脚本 | `peewee` 或原生 `psycopg2/pymysql` |

### SQLAlchemy 模型规范

```python
class {Entity}(Base):
    __tablename__ = "t_{entity}"
    id = Column(Integer, primary_key=True, autoincrement=True)
    {entity}_id = Column(String(36), unique=True, nullable=False)  # UUID
    # ... 业务字段 ...
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    created_by = Column(String(64))
    updated_by = Column(String(64))
    deleted = Column(SmallInteger, default=0, nullable=False)
```

### 命名规范（Python + SQLAlchemy）

| 规范项 | 规则 |
|--------|------|
| 表前缀 | `t_`（如 `t_user`、`t_order`） |
| 主键 | 自增 `id INTEGER` + UUID `{entity}_id VARCHAR(36)` 并存，UUID 加 UNIQUE 索引 |
| 软删除 | `deleted SMALLINT NOT NULL DEFAULT 0`（0=正常，1=已删除） |
| 创建时间 | `created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP` |
| 更新时间 | `updated_at DATETIME ON UPDATE CURRENT_TIMESTAMP` |
| Python 字段 | `snake_case`，与数据库列名一致，SQLAlchemy 直接映射 |
| 状态字段 | `SmallInteger`，注释中列出所有枚举值 |

## 技术栈推荐（Python 生态）

| 组件 | 推荐选型 | 版本 |
|------|---------|------|
| Web 框架 | FastAPI | 0.110.x / Django 5.x |
| 数据访问 | SQLAlchemy | 2.x（async 模式） |
| 数据校验 | Pydantic | v2 |
| 缓存 | `redis-py`（async：`redis.asyncio`） | 5.x |
| 消息队列 | `celery` + Redis/RabbitMQ | 5.x |
| 日志 | `loguru` | — |
| 分页 | `fastapi-pagination` | 0.12.x |

### 分层模型

```
Router（路由层）→ Schema（Pydantic Request/Response）
Service（业务逻辑层）→ Model（SQLAlchemy ORM）
Repository（数据访问层）→ SQLAlchemy Session
Database（PostgreSQL / MySQL）
```

### 项目结构（FastAPI）

```
backend/
└── app/
    ├── api/v1/endpoints/    # 路由处理器
    ├── services/            # 业务逻辑
    ├── repositories/        # 数据访问层
    ├── models/              # SQLAlchemy 模型
    ├── schemas/             # Pydantic 模型
    ├── core/config.py       # 配置
    └── utils/               # 工具函数
```

## 编码规范要点（Python）

- 禁止 `print()`，使用 `loguru.logger.info/warning/error`
- 禁止裸 `except:`，使用具体异常类型
- 禁止密码使用 `hashlib.md5/sha1`，使用 `passlib.bcrypt`
- 禁止 SQL 字符串拼接，使用 SQLAlchemy 参数化查询
- 禁止金额使用 `float`，使用 `decimal.Decimal`
- 异步函数必须使用 `async def`
- 写操作必须在数据库事务中执行（`async with session.begin()`）

---

# Part 3：Go 技术栈特化规则

## 安全设计 — Go 特化实现

### 认证与 Token 策略（Go 实现）

| 检查项 | Go 实现方式 |
|--------|-----------|
| Token 机制 | `github.com/golang-jwt/jwt/v5`；双 Token 方案：Access Token（15min）+ Refresh Token（7d） |
| Token 存储 | 前端：`httpOnly Cookie`（Web）或内存（SPA）；后端：Redis 存储 Refresh Token |
| Token 吊销 | Redis 黑名单（`token:blacklist:{jti}`，TTL = Token 剩余有效期） |
| 会话管理 | Gin：`gin.Context` 中间件；Echo：`echo.Context` 中间件 |

### 敏感数据加密（Go 实现）

| 检查项 | Go 实现方式 |
|--------|-----------|
| 密码哈希 | `golang.org/x/crypto/bcrypt`（cost = 12） |
| PII 字段加密 | `crypto/aes` + `crypto/cipher`（GCM 模式）；封装为 `pkg/crypto/aes.go` |
| 哈希列 | `crypto/sha256`：`sha256.Sum256([]byte(value + serverSecret))` |
| 传输安全 | `net/http` 配置 `TLSConfig`，TLS 1.2+（优先 TLS 1.3） |
| 文件访问 | `minio-go` SDK `PresignedGetObject`，TTL ≤ 1 小时 |

### API 安全（Go 实现）

| 检查项 | Go 实现方式 |
|--------|-----------|
| 限流 | `golang.org/x/time/rate`（令牌桶）或 `github.com/ulule/limiter`（Redis 分布式） |
| 防重放 | 自定义中间件，Redis 存储 Nonce（TTL = 10min） |
| 输入校验 | `github.com/go-playground/validator/v10`（`binding:"required,min=8"`） |
| RBAC 执行 | 自定义中间件 `RequireRole("admin")`；或 `casbin` 策略引擎 |

## 数据库设计 — Go 特化规范

### ORM 框架选型

| 场景 | 推荐方案 |
|------|---------|
| 标准 CRUD + 复杂查询 | **GORM v2**（推荐，功能完整） |
| 高性能 + 精细控制 | `sqlx` + 原生 SQL |
| 代码生成 | `sqlc`（从 SQL 生成类型安全的 Go 代码） |

### GORM 模型规范

```go
type {Entity} struct {
    gorm.Model                                      // 内嵌 ID、CreatedAt、UpdatedAt、DeletedAt
    {Entity}ID string `gorm:"uniqueIndex;size:36"` // UUID 业务主键
    // ... 业务字段 ...
    CreatedBy string `gorm:"size:64"`
    UpdatedBy string `gorm:"size:64"`
}
func ({Entity}) TableName() string { return "t_{entity}" }
```

## 技术栈推荐（Go 生态）

| 组件 | 推荐选型 | 版本 |
|------|---------|------|
| Web 框架 | Gin | v1.9.x / Echo v4 |
| 数据访问 | GORM | v2 |
| 缓存 | `go-redis/redis/v9` | v9.x |
| 配置管理 | `spf13/viper` | v1.x |
| 日志 | `uber-go/zap` | v1.x |
| 参数校验 | `go-playground/validator/v10` | v10.x |
| API 文档 | `swaggo/swag` | v1.x |

### 分层模型

```
Handler（路由处理层）→ Request/Response DTO（struct）
Service（业务逻辑层）→ Model（GORM struct）
Repository（数据访问层）→ GORM DB
Database（MySQL / PostgreSQL）
```

### 项目结构（Gin）

```
backend/
├── cmd/server/main.go
├── internal/
│   ├── handler/             # HTTP 处理器
│   ├── service/             # 业务逻辑
│   ├── repository/          # 数据访问层
│   ├── model/               # GORM 模型
│   ├── dto/                 # 请求/响应 DTO
│   ├── middleware/          # 中间件
│   └── config/              # 配置结构体
└── pkg/
    ├── crypto/              # 加密工具
    ├── jwt/                 # JWT 工具
    └── response/            # 统一响应格式
```

## 编码规范要点（Go）

- 禁止 `fmt.Println()`，使用 `zap.Logger.Info/Warn/Error`
- 禁止忽略 `error` 返回值，必须处理或显式忽略并注释原因
- 禁止密码使用 `crypto/md5`，使用 `golang.org/x/crypto/bcrypt`
- 禁止 SQL 字符串拼接，使用 GORM 参数化查询
- 禁止金额使用 `float64`，使用 `shopspring/decimal`
- 数据库操作必须在事务中执行

---

# Part 4：Node.js 技术栈特化规则

## 安全设计 — Node.js 特化实现

### 认证与 Token 策略（Node.js 实现）

| 检查项 | Node.js 实现方式 |
|--------|----------------|
| Token 机制 | `jsonwebtoken`；双 Token 方案：Access Token（15min）+ Refresh Token（7d） |
| Token 存储 | 前端：`httpOnly Cookie`（Web）或内存（SPA）；后端：Redis 存储 Refresh Token |
| Token 吊销 | Redis 黑名单（`token:blacklist:{jti}`，TTL = Token 剩余有效期） |
| 会话管理 | Express：`passport-jwt`；NestJS：`@nestjs/passport` + `passport-jwt` |

### 敏感数据加密（Node.js 实现）

| 检查项 | Node.js 实现方式 |
|--------|----------------|
| 密码哈希 | `bcrypt`（rounds = 12）或 `argon2` |
| PII 字段加密 | Node.js 内置 `crypto` 模块，`AES-256-GCM`；封装为 `src/utils/crypto.ts` |
| 哈希列 | `crypto.createHmac('sha256', serverSecret).update(value).digest('hex')` |
| 传输安全 | `https.createServer` 配置 TLS，或 Nginx 反向代理处理 SSL |
| 文件访问 | `@aws-sdk/client-s3` `getSignedUrl`，TTL ≤ 3600s |

### API 安全（Node.js 实现）

| 检查项 | Node.js 实现方式 |
|--------|----------------|
| 限流 | `express-rate-limit` + `rate-limit-redis`（分布式） |
| 防重放 | 自定义中间件，Redis 存储 Nonce（TTL = 10min） |
| 输入校验 | `class-validator` + `class-transformer`（NestJS）或 `zod`（Express） |
| RBAC 执行 | NestJS `@Roles()` 装饰器 + `RolesGuard`；Express 自定义中间件 |

## 数据库设计 — Node.js 特化规范

### ORM 框架选型

| 场景 | 推荐方案 |
|------|---------|
| NestJS + TypeScript | **TypeORM**（推荐）或 **Prisma** |
| Express + 灵活查询 | **Prisma**（类型安全，推荐）或 `knex.js` |
| 轻量项目 | `sequelize` |

### TypeORM 实体规范

```typescript
@Entity('t_{entity}')
export class {Entity}Entity {
    @PrimaryGeneratedColumn() id: number;
    @Column({ name: '{entity}_id', length: 36, unique: true }) {entity}Id: string;
    // ... 业务字段 ...
    @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
    @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
    @Column({ name: 'created_by', length: 64, nullable: true }) createdBy: string;
    @Column({ name: 'updated_by', length: 64, nullable: true }) updatedBy: string;
    // 软删除：与通用规范保持一致，使用整型标志位（0=正常, 1=已删除）
    @Column({ name: 'deleted', type: 'tinyint', default: 0, nullable: false }) deleted: number;
    // 注：如需 TypeORM 自动软删除（find 自动过滤），可改用 @DeleteDateColumn({ name: 'deleted_at' })，
    //      但需在 _SAD_后端.md 中注明与其他语言的表结构差异。
}
```

## 技术栈推荐（Node.js 生态）

| 组件 | 推荐选型 | 版本 |
|------|---------|------|
| Web 框架 | NestJS | v10.x / Express v4 |
| 数据访问 | TypeORM | 0.3.x / Prisma 5.x |
| 缓存 | `ioredis` | v5.x |
| 消息队列 | `@nestjs/bull`（Bull + Redis）/ `amqplib`（RabbitMQ） | — |
| 日志 | `winston` | v3.x |
| 参数校验 | `class-validator` + `class-transformer` | — |
| API 文档 | `@nestjs/swagger`（基于 OpenAPI 3.0） | — |

### 分层模型（NestJS）

```
Controller（路由层）→ DTO（class-validator）
Service（业务逻辑层）→ Entity（TypeORM）
Repository（数据访问层）→ TypeORM DataSource
Database（MySQL / PostgreSQL）
```

### 项目结构（NestJS）

```
backend/
└── src/
    ├── modules/{module}/
    │   ├── {module}.controller.ts
    │   ├── {module}.service.ts
    │   ├── {module}.module.ts
    │   ├── entities/{entity}.entity.ts
    │   └── dto/
    ├── common/
    │   ├── decorators/
    │   ├── filters/
    │   ├── guards/
    │   ├── interceptors/
    │   └── pipes/
    └── main.ts
```

## 编码规范要点（Node.js/TypeScript）

- 禁止 `console.log()`，使用 `winston.logger.info/warn/error`
- 禁止 `any` 类型（TypeScript），使用具体类型或 `unknown`
- 禁止密码使用 `crypto.createHash('md5')`，使用 `bcrypt`
- 禁止 SQL 字符串拼接，使用 TypeORM 参数化查询或 Prisma
- 禁止金额使用 `number`，使用 `decimal.js` 或整数分（分为单位）
- 数据库写操作必须在事务中执行
- 配置通过 `@nestjs/config` 从环境变量读取，禁止硬编码
