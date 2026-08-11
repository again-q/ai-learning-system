# 拍照录入 MVP（P0 最小闭环）— 代码评审报告

| 属性 | 值 |
|------|---|
| **文档编号** | CR-20260809-001 |
| **版本** | v1.0.0 |
| **状态** | 🟡 草稿 |
| **评审模式** | 全栈模式（CloudBase 云函数 + 微信小程序，无 frontend/ 目录，按小程序契约执行） |
| **报告日期** | 2026-08-09 |
| **最后更新** | 2026-08-09 |
| **评审人** | AI Code Reviewer |
| **关联文档** | `doc/detailed/photoUpload_照片接收.md`、`diagnose_诊断管线.md`、`dispute_异议重诊.md`、`graphService_图谱查询.md`、`clamp_参数钳制.md`、`rag_向量检索.md`、`小程序_拍照页.md`、`小程序_报告页.md`、`databaseSchema_数据模型.md` |
| **审查包** | `doc/review/编码审查包-P0最小闭环.md` |

---

## 一、评审概要

| 项目 | 内容 |
|-----|------|
| 后端结论 | ⚠️ 有条件通过（无 P0，P1=4） |
| 前端结论 | ⚠️ 有条件通过（无 P0，P1=1） |
| 契约一致性 | ✅ 一致（无 P0 断裂，5 接口前后端字段对齐） |
| **综合结论** | **⚠️ 有条件通过（无 P0 但 P1=5 > 2）** |
| P0 致命问题 | 0 个 |
| P1 高风险问题 | 5 个（建议修复） |
| P2 改进建议 | 10 个（可选优化） |
| 是否允许进入测试阶段 | 否（修复 P1 后可进入） |

> **结论说明：** 无 P0 问题，但存在 5 个 P1（诊断管线同步执行超时风险导致批次卡死、云存储路径无 userId 隔离、dispute JSON 结构容错缺失、数据库复合索引未建、云函数运行时版本未声明），限期修复后可进入测试。上轮评审 8 个问题 7 个完全修复、1 个部分修复（升级为 CR-003）。

---

## 二、评审范围

### 后端代码文件（CloudBase 云函数，Node.js）

| 云函数 | 文件路径 | 说明 |
|--------|---------|------|
| photoUpload | `cloudfunctions/photoUpload/index.js`（48 行） | 批次登记（fileIds → batches） |
| diagnose | `cloudfunctions/diagnose/index.js`（353 行） | 诊断管线编排：RAG → Qwen 转录 → DeepSeek 判定 → clamp → 报告+embedding 入库 |
| dispute | `cloudfunctions/dispute/index.js`（189 行） | 异议单题重诊 + RAG 闭环 |
| graphService | `cloudfunctions/graphService/index.js`（73 行） | getGraph（图谱查询）+ getReport（报告查询） |

### 小程序端代码文件

| 层次 | 文件路径 | 说明 |
|------|---------|------|
| 拍照页 | `miniprogram/pages/photo/photo.{js,wxml,wxss,json}` | 选图/上传/触发诊断 |
| 报告页 | `miniprogram/pages/report/report.{js,wxml,wxss,json}` | 报告展示 + 异议流程 |
| 首页入口 | `miniprogram/pages/index/index.{js,wxml,wxss}` | 拍照诊断入口按钮 |
| 页面注册 | `miniprogram/app.json` | photo/report 已注册 |
| 导入脚本 | `scripts/import-knowledge-graph.js`（47 行） | 361 节点导入（输出 JSON） |

### 参考文档状态

| 文档 | 状态 | 影响 |
|------|------|------|
| 编码规范文档 | ⚠️ 未找到（使用通用规范） | 维度1 仅检查通用层 |
| 详细设计文档 | ✅ 已加载（8 份 + databaseSchema） | 业务逻辑验证 + 契约一致性 |

---

## 三、维度0：前后端契约一致性

**结论：** ✅ 契约完全一致（无 P0 断裂）

### 3.1 接口覆盖（详设 vs 实现）

| 详设接口 | 实现位置 | 请求字段 | 响应字段 | 状态 |
|---------|---------|---------|---------|------|
| POST /photoUpload | photoUpload | `fileIds[]`（详设写 `files` binary） | batchId/imageCount/fileIds | ✅ 实现一致；详设滞后（P2） |
| POST /diagnose | diagnose | `batchId` | batchId/status/totalQuestions/failedCount/questions | ✅ 实现一致；同步模型 vs 详设异步语义（P2） |
| GET /getReport | graphService | `batchId` | questions[]/status/failedCount | ✅ 实现一致；详设 `failedItems[]` 未返回（P2） |
| POST /disputeQuestion | dispute | `questionId`/`corrections{studentAnswer,note}` | questionId/newDiagnosis | ✅ 完全一致 |
| GET /getGraph | graphService | `parentId`/`nodeId` | nodes[]/currentNode | ✅ 完全一致 |

### 3.2 小程序字段核对

- **photo.js → photoUpload**：请求 `{fileIds}` ✅；→ diagnose：请求 `{batchId}` ✅
- **report.js → graphService**：请求 `{action:'getReport', batchId}` ✅；响应字段 questionId/questionText/isCorrect/questionCategory/difficultyLevel/difficultyValue/processScore/pathQuality/correctAnswer/studentAnswer 全部使用后端返回字段名 ✅
- **report.js → dispute**：请求 `{questionId, corrections:{studentAnswer, note}}` ✅；响应 newDiagnosis 字段对齐 ✅

### 3.3 枚举完整性

| 枚举 | 覆盖情况 | 状态 |
|------|---------|------|
| isCorrect（true/false/null） | statusText 三分支 + 失败题判定 `isCorrect===null && !questionText` | ✅ 完整 |
| questionType（选择/填空/解答/其他） | 前端仅展示无分支 | ✅ 无遗漏 |
| batch.status | 前端未做分支（仅透传） | ✅ 无遗漏 |

> **小结：** 5 个接口前后端字段名、请求参数、枚举分支全部对齐，无 P0 契约断裂。偏差均为详设文档滞后（P2 级别），实现内部自洽。

---

## 四、后端审查

### 维度1：编码规范符合性

**结论：** ⚠️ 部分通过

| 检查项 | 状态 | 问题描述 | 等级 |
|--------|------|---------|------|
| 命名规范（驼峰/语义化） | ✅ | 变量/函数命名清晰（clampParams/buildRagContext 等） | - |
| 统一响应格式 | ✅ | 4 个云函数均用 `{code, data, message}` | - |
| 错误码体系一致性 | ⚠️ | photoUpload 用业务码（40001/40002/40004），diagnose/dispute/graphService 混用 HTTP 风格（404/403/401/500） | P2 |
| 死代码 | ⚠️ | `diagnose/index.js:4` `const _ = db.command` 未使用 | P2 |
| 注释质量 | ✅ | 关键决策引用编号（决策 017/020/021、DI-REG-01 等） | - |

> **小结：** 命名与注释质量良好，错误码体系不统一（P2），存在 1 处死变量（P2）。

---

### 维度2：业务逻辑一致性

**结论：** ⚠️ 部分通过

| 检查项 | 状态 | 问题描述 | 等级 |
|--------|------|---------|------|
| photoUpload BR-001/002/003 | ✅ | 最多 9 张、status=pending、userId 归属全部实现 | - |
| diagnose DI-REG-01/02/03/05 | ✅ | 幂等检查、单张降级、完成更新、traceReport 存档全部实现 | - |
| diagnose DI-REG-04（超时标记） | ❌ | 无超时检测；平台超时强杀不走 catch，批次卡 analyzing 无法重试 | **P1** |
| dispute DR-REG-01~04 | ✅ | 关键字段修正、单题重诊、revisions 追加、mastery_logs 追加全部实现 | - |
| dispute JSON 结构容错 | ❌ | `questions[0]` 为空数组时 undefined → TypeError → 500（diagnose 有兜底，dispute 无） | **P1** |
| clamp 钳制（CL-REG-01~04） | ✅ | D 区间钳制/η 强制 null/r=null/P 四档归一化全部实现 | - |
| questionType 默认值 | ⚠️ | `item.questionType || '解答'`——AI 未输出题型时填空/选择被当解答题，η 错留 | P2 |
| 数据一致性（DB-REG-01） | ⚠️ | databaseSchema 规定 questions "仅追加不 update"，dispute 实际 update 当前值（revisions 保留 originalValue 可回溯，需澄清设计意图） | P2 |

> **小结：** 核心业务规则实现完整；超时处理（DI-REG-04）与 dispute 容错是主要缺口。

---

### 维度3：安全漏洞扫描

**结论：** ⚠️ 发现 1 个安全要求遗漏

| 检查项 | 状态 | 问题描述 | 等级 |
|--------|------|---------|------|
| SQL 注入 | ✅ | 无 SQL，全部走文档数据库 API | - |
| 越权访问 | ✅ | 4 个数据接口全部有归属校验（userId !== openid → 403/404） | - |
| 敏感信息保护 | ✅ | API key 全部走环境变量；错误信息不回传敏感内容 | - |
| 认证与授权 | ✅ | 云函数内 getWXContext().OPENID 鉴权；getGraph 公开（GR-REG-01 设计如此） | - |
| 输入验证 | ⚠️ | fileID 仅校验 `cloud://` 前缀（审查包已知遗留 #3，前端已限 mediaType=image） | P2 |
| 云存储路径隔离 | ❌ | `photo.js:64` cloudPath 无 userId，违反详设 §10"照片存储路径含 userId" | **P1** |
| prompt 注入 | ⚠️ | vision 转录（AI 生成）拼入 DeepSeek prompt，理论可注入（学生自用场景风险极低） | P2 |

> **小结：** 越权防护与密钥管理到位；云存储路径未按 userId 隔离（P1），属详设安全要求未实现。

---

### 维度4：性能反模式识别

**结论：** ⚠️ 发现 2 个性能风险

| 检查项 | 状态 | 问题描述 | 等级 |
|--------|------|---------|------|
| 同步阻塞/串行外部调用 | ❌ | diagnose 9 张 vision 并行后，9 次 DeepSeek 判定**串行**（每次 10-30s）→ 上限场景 180s+，远超 120s 云函数限制 | **P1** |
| N+1 查询 | ⚠️ | graphService getGraph 每节点一次 count()（最多 100 次调用）；详设伪代码同款，但违反自身性能要求 <50ms；当前无前端调用 | P2 |
| 无索引查询 | ❌ | `mastery_logs.where({userId}).orderBy('createdAt')`、`questions.where({batchId,userId})` 需复合索引，否则数据量上来后报 -502005 | **P1** |
| 缓存 | ⚠️ | 详设 §9 建议根节点整体缓存（361 节点 <1MB）未实现 | P2 |
| 资源管理 | ✅ | 无泄漏风险（无长连接/句柄） | - |

> **小结：** 主要风险是 diagnose 同步串行执行（P1）与数据库复合索引缺失（P1）。

---

### 维度5：可维护性评估

**结论：** ⚠️ 一般

| 检查项 | 状态 | 问题描述 | 等级 |
|--------|------|---------|------|
| 代码复杂度 | ✅ | diagnose 353 行拆分为 9 个函数，职责清晰 | - |
| 重复代码 | ⚠️ | `clampParams`/`RUBRIC`/`LR`/`P_BINS`/embedding 逻辑在 diagnose 与 dispute 双份复制；dispute 内联 embedding fetch | P2 |
| 魔法数字 | ✅ | 9/200/TOP_K/HISTORY_LIMIT 均有命名常量 | - |
| 可测试性 | ⚠️ | 云函数无单测（无测试目录）；AI 调用不可 mock | P2 |
| 注释质量 | ✅ | 决策编号引用便于追溯 | - |

> **小结：** 结构清晰，但 diagnose/dispute 公共逻辑未提取（P2），后续修改易漂移。

---

## 五、前端审查（小程序端）

**前端综合结论：** ⚠️ 部分通过

### 6.1 编码规范

| 检查项 | 状态 | 问题描述 | 等级 |
|--------|------|---------|------|
| 页面结构（四件套齐全） | ✅ | js/wxml/wxss/json 齐全，navigationStyle:custom 已声明 | - |
| 设计 Token（CSS 变量） | ✅ | --accent/--radius-lg/--ease-out 等统一变量 | - |
| 安全区适配 | ✅ | `calc(88rpx + env(safe-area-inset-top))` 两页均有 | - |
| wx:key | ⚠️ | photo.wxml 用 `wx:key="index"`，删除时节点复用易闪烁，建议 `*this` | P2 |
| WXML 表达式复杂度 | ✅ | 无嵌套三元（statusText 在 JS 预计算） | - |

### 6.2 业务逻辑一致性

| 检查项 | 状态 | 问题描述 | 等级 |
|--------|------|---------|------|
| 页面字段与后端一致 | ✅ | report.js 全部字段名对齐 graphService 返回 | - |
| 提交字段与后端一致 | ✅ | photo/report 请求体字段对齐 | - |
| 枚举分支完整 | ✅ | isCorrect 三态处理完整 | - |
| 异常处理完整 | ⚠️ | 报告加载失败无重试按钮（详设 §7 要求）；失败与空状态混淆；navigateBack 无兜底；submitDispute 后 `nd.isCorrect ? '正确' : '错误'` 在 null 时误显"错误" | P2 |
| 上传扩展名提取 | ⚠️ | `file.split('.').pop()`——chooseMedia tempFilePath 可能无扩展名 → cloudPath 含 `://`/`/` 非法字符（需真机确认） | P2 |

### 6.3 安全检查

| 检查项 | 状态 | 问题描述 | 等级 |
|--------|------|---------|------|
| Token/密钥 | ✅ | 无密钥落前端；上传走 wx.cloud.uploadFile | - |
| XSS | ✅ | WXML 数据绑定自动转义，无富文本渲染 | - |
| 路由权限 | ✅ | 云函数侧统一鉴权（前端无业务数据可越权） | - |
| 云存储路径隔离 | ❌ | cloudPath 无 userId（同 CR-002） | **P1** |

### 6.4 性能反模式

| 检查项 | 状态 | 问题描述 | 等级 |
|--------|------|---------|------|
| 串行上传 | ⚠️ | photo.js 逐张 `await wx.cloud.uploadFile`（9 张串行 ~3-5s），可 Promise.all 并行 | P2 |
| 重复请求 | ✅ | 无 | - |

> **小结：** 前端整体规范（token/安全区/契约对齐），主要问题为云存储路径隔离缺失（P1）与若干边界处理缺失（P2）。

---

## 六、综合问题清单

| 问题ID | 栈 | 文件 | 行号 | 等级 | 维度 | 问题描述 | 修复建议 |
|--------|----|-----|------|------|------|---------|---------|
| CR-001 | 后端 | `cloudfunctions/diagnose/index.js` | 214-338 | **P1** | 性能/可用性 | 9 张上限场景：vision 并行后 9 次 DeepSeek 判定串行（180s+）远超 120s；平台超时强杀不走 catch，批次卡 analyzing 无法重试（DI-REG-04 未实现） | ① 方案A：diagnose 改为异步任务化（先返 analyzing，另起云函数/定时器跑批）；方案B（轻量）：DeepSeek 判定并发上限 3，并增加 analyzing 超时（如 10min 前）的兜底查询/手动置回 pending；② 至少在前端提示"超时后重新提交" |
| CR-002 | 前端 | `miniprogram/pages/photo/photo.js` | 64 | **P1** | 安全 | cloudPath 不含 userId，违反详设 §10 与审查包环境依赖声明 | 改为 `photos/${app.globalData.userInfo._openid}/${Date.now()}_${rand}.${ext}` |
| CR-003 | 后端 | `cloudfunctions/dispute/index.js` | 74 | **P1** | 容错 | `JSON.parse(...).questions[0]` 在 questions 为空数组时 undefined → TypeError → 500 | 解析后判空：`const q0 = arr && arr[0]; if (!q0) throw new Error('判定输出结构异常')`（对齐 diagnose 的容错） |
| CR-004 | 部署 | 数据库索引 | — | **P1** | 性能 | mastery_logs(userId+createdAt)、questions(batchId+userId) 复合索引未建 | 部署前在控制台建 2 个复合索引，并补充进审查包环境依赖节 |
| CR-005 | 部署 | 云函数运行时 | — | **P1** | 部署 | diagnose/dispute 用原生 fetch，Nodejs16 无全局 fetch | 云函数运行时选 Nodejs18.15+，并在环境依赖节声明 |
| CR-006 | 文档 | `doc/detailed/photoUpload_照片接收.md` | §3.1/§4 | P2 | 契约 | 请求体 files(binary) 与实现 fileIds(string[]) 不符；上传职责已移至前端 | 更新详设 |
| CR-007 | 文档 | `doc/detailed/diagnose_诊断管线.md` | §3.2 | P2 | 契约 | failedItems[] 未返回（实现用 questions 占位）；studentAnswer 幽灵字段（前端需要） | 更新详设或注明取舍 |
| CR-008 | 文档 | `doc/detailed/databaseSchema_数据模型.md` | DB-REG-01 | P2 | 契约 | "questions 仅追加不 update" 与 dispute update 冲突 | 澄清设计意图（当前 revisions 可回溯，风险可控） |
| CR-009 | 后端 | `cloudfunctions/diagnose/index.js` `cloudfunctions/dispute/index.js` | — | P2 | 可维护 | clampParams/RUBRIC/LR/P_BINS/embedding 重复 | 提取 `cloudfunctions/common/diagnosis-core.js` 公共模块 |
| CR-010 | 后端 | `cloudfunctions/graphService/index.js` | 22-25 | P2 | 性能 | getGraph N+1 count + 无缓存（详设 §9 建议未实现） | 数据量增大后改批量 count 或加缓存；当前无前端调用可后置 |
| CR-011 | 后端 | `cloudfunctions/diagnose/index.js` | 4 | P2 | 规范 | 死变量 `const _ = db.command` | 删除 |
| CR-012 | 后端 | `cloudfunctions/diagnose/index.js` | 256 | P2 | 业务 | questionType 默认 '解答' 导致填空/选择错留 η | 默认改 '其他'（η 归 null），或让 DeepSeek 强制输出题型 |
| CR-013 | 前端 | `miniprogram/pages/photo/photo.js` | 63 | P2 | 容错 | tempFilePath 可能无扩展名 → cloudPath 非法 | `const ext = (file.split('.').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g, '')` |
| CR-014 | 前端 | `miniprogram/pages/report/report.js` | 18-41 | P2 | 边界 | 加载失败无重试按钮、失败/空状态混淆、navigateBack 无兜底、isCorrect=null 误显"错误" | 加 error 状态 + 重试按钮；navigateBack 失败时 redirectTo 首页 |
| CR-015 | 全局 | 4 个云函数 | — | P2 | 规范 | 错误码体系不统一 | 统一为业务码（4xxxx）或 HTTP 风格 |

---

## 七、P0 阻断项详情

无 P0 问题。

---

## 八、评审结论

### 最终结论

> **⚠️ 有条件通过**
>
> 本次全栈评审发现 0 个 P0、5 个 P1、10 个 P2。上轮评审 8 个问题中 7 个完全修复、1 个部分修复（CR-003）。P1 问题集中在：诊断管线同步执行超时风险（CR-001）、云存储路径无 userId 隔离（CR-002）、dispute JSON 容错缺失（CR-003）、数据库复合索引未建（CR-004）、云函数运行时版本未声明（CR-005）。修复全部 P1 后可进入测试阶段；CR-004/CR-005 为部署前置项，可在部署时一并处理。

### 改进建议（P1 建议阻断，P2 不阻断）

| 问题ID | 栈 | 问题描述 | 优先级 |
|--------|----|---------|--------|
| CR-001 | 后端 | 同步执行超时风险 + 批次卡 analyzing | P1 高 |
| CR-002 | 前端 | 云存储路径无 userId 隔离 | P1 高 |
| CR-003 | 后端 | dispute JSON 结构容错缺失 | P1 高 |
| CR-004 | 部署 | 数据库复合索引未建 | P1 中 |
| CR-005 | 部署 | 云函数运行时需 Node ≥18 | P1 中 |
| CR-006~015 | 混合 | 文档滞后/重复代码/边界处理等 | P2 低 |

### 已知遗留确认

| 审查包遗留 | 状态 | 说明 |
|-----------|------|------|
| #1 knowledge-tree 未切换 graphService | ✅ 属实 | 前端仅 report.js 调用 graphService（getReport），getGraph 无调用方 |
| #2 导入脚本只输出 JSON | ✅ 属实 | 需管理端/脚本实际写入 |
| #3 fileID 无法验 MIME | ✅ 属实 | 仅校验 cloud:// 前缀（P2） |
| #4 状态更新非原子 | ✅ 属实 | 已并入 CR-001（回滚仅覆盖 JS 异常） |
| #5 同步执行超时风险 | ✅ 属实 | 已并入 CR-001（串行 DeepSeek 是最大耗时源） |
| #6 getReport 无分页 | ✅ 属实 | 单批 ≤9 题无压力 |

### 下一步行动

1. **修复 P1**：CR-001~CR-003 代码内修复 + CR-004/CR-005 部署前置（用户决策：本轮暂不修复）
2. **重新评审**：修复完成后触发 code-reviewer 多轮评审（_R2）
3. **进入测试**：P1 全部修复并通过复核后，移交 tester
4. **P2 建议**：本迭代内顺手修复 CR-011（死变量）、CR-013（扩展名清洗）、CR-014（失败重试）

---

## 变更记录

| 版本 | 日期 | 变更类型 | 变更内容摘要 | 变更人 |
|------|------|---------|------------|--------|
| v1.0.0 | 2026-08-09 | 🆕 新建 | 初始版本：P0 最小闭环批次全量评审（4 云函数 + 3 页面 + 1 脚本） | AI Code Reviewer |
