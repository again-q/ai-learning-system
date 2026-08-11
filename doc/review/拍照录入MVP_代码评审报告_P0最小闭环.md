# 拍照录入 MVP — P0 最小闭环 代码评审报告

**文档编号**：CR-20260810-001
**版本**：v1.0.0
**状态**：🟡 草稿
**创建日期**：2026-08-10
**评审依据**：`doc/review/编码审查包-P0最小闭环.md`（v4 精简版，从零通读，不带预设结论）
**评审对象**：photoUpload / diagnose / dispute / graphService + photo / report / index 小程序页 + import-knowledge-graph.js

## 变更记录

| 版本 | 日期 | 变更说明 |
|------|------|---------|
| v1.0.0 | 2026-08-10 | 初版：P0 最小闭环批次首次从零评审 |

---

## 评审结论

> ### ❌ 不通过（存在 P0）
>
> P0×1、P1×3、P2×10。P0 为跨 diagnose/dispute 的字段名断裂，导致核心诊断参数（D/P/η）全部失真，必须修复后重新评审。

---

## 上轮问题修复情况

首次评审（按审查包 v4 要求从零通读），无历史轮次对照。

---

## 维度 0：前后端契约一致性（小程序 + 云函数）

> 无 `doc/detailed/编码规范.md`（使用通用规范），无 LC-FE-001（纯后端模式 + 小程序端），未发现 `frontend/` 目录。

### 0.A 接口覆盖

| 设计文档接口 | 实现位置 | 状态 |
|-------------|---------|------|
| POST /photoUpload | photoUpload/index.js | ✅ 已实现（收 fileIds 登记批次） |
| POST /diagnose | diagnose/index.js | ✅ 已实现（同步执行至 completed） |
| GET /getReport | graphService/index.js (getReport) | ✅ 已实现 |
| POST /disputeQuestion | dispute/index.js | ✅ 已实现 |
| GET /getGraph | graphService/index.js (getGraph) | ✅ 已实现 |

### 0.C 小程序契约核对

- ✅ 必填字段：photoUpload（fileIds）✓、diagnose（batchId）✓、dispute（questionId+corrections）✓、getReport（batchId）✓
- ✅ 响应字段：questions 映射字段与设计 §3.2 对齐（questionId/questionText/questionType/isCorrect/questionCategory/difficultyLevel/difficultyValue/processScore/pathQuality/transferQuality/correctAnswer/knowledgeNodeId/nodeStatus/errorAttribution）
- ✅ 枚举三态：report.js `isCorrect === true/false/null` 三态全覆盖（P1-⑥ 已修复）
- ⚠️ P2：设计文档 §3.2 定义 `failedItems[]`，实现改为「questions 内嵌失败占位」（`isCorrect===null && questionText===''`），两端运行时契约一致，但设计文档未同步（契约漂移）
- ⚠️ P2：设计文档 photoUpload §3.1 定义 multipart files，实现为前端直传云存储 + 云函数收 fileIds（审查包已明示此形态，设计文档待同步）

---

## 维度 1：编码规范符合性（通用层）

- ✅ 统一响应格式（code/data/message）与 userLogin 一致
- ✅ 命名规范：成功/失败响应、云函数入口统一 exports.main
- ✅ 错误处理：所有云函数 try/catch 包裹 + console.error 记录
- ⚠️ P2：`import-knowledge-graph.js` 输出 `subject/stage` 字段，与 databaseSchema §3.5 knowledge_nodes 定义不符（幽灵字段，schema 未定义）

---

## 维度 2：业务逻辑一致性

### P0-1｜clampParams 字段名与 DeepSeek 输出字段断裂（diagnose + dispute）

- **位置**：`cloudfunctions/diagnose/index.js:50-61`（clampParams）、`cloudfunctions/diagnose/index.js:101-103`（prompt）、`cloudfunctions/dispute/index.js:33-43`、`cloudfunctions/dispute/index.js:58-60`
- **现象**：
  - DeepSeek prompt 定义输出 JSON 字段：`level` / `D` / `P` / `eta` / `r`
  - clampParams 读取：`raw.difficultyLevel` / `raw.difficultyValue` / `raw.processScore` / `raw.pathQuality`（与设计文档 clamp 契约字段同名，但与 prompt 输出字段完全不符）
  - 结果：`LR[undefined] → [0.01,0.999]`，`D = min(0.999, max(0.01, Number(undefined)||0.01)) = 0.01`（恒值）；`P = Number(undefined)=NaN → 归一化落 0`（恒值）；`η = raw.pathQuality=undefined`（解答题恒 undefined）
- **影响**：难度值（difficultyValue）、过程分（processScore）、路径质量（pathQuality）三个核心参数全部失真写入 questions 与 mastery_logs；RAG reportText 不含真实 D/P/η，自增强闭环退化
- **修复方案**：clampParams 按 prompt 字段名读取，或映射层统一：
  ```js
  // 方案 A：clampParams 内改用 prompt 字段
  const D = Math.min(hi, Math.max(lo, Number(raw.D) || lo));
  const eta = isOpen ? (raw.eta ?? null) : null;
  let P = Number(raw.P);
  ```
  或方案 B：parseQuestionsFromVision 映射时统一转成 difficultyLevel/difficultyValue/processScore/pathQuality。两处（diagnose/dispute）同步修复，且修复后必须对照 prompt schema 回归。

### P1-1｜diagnose 批量清理旧数据受 20 条限制，重诊后残留旧题

- **位置**：`cloudfunctions/diagnose/index.js:211-219`
- **现象**：`where().remove()` 单次最多删 20 条（CloudBase 云函数端限制）；9 张照片 × 每张 4 题 = 36 题场景下，二次诊断只清理 20 条，残留 16 条旧 questions 与对应 mastery_logs
- **影响**：重试/重新诊断后报告页混合新旧数据，mastery_logs 出现孤儿记录
- **修复方案**：循环删除直至无剩余：
  ```js
  while (true) {
    const res = await db.collection('questions').where({ batchId, userId: openid }).limit(20).remove();
    if (!res.stats.removed) break;
  }
  ```

### P1-2｜失败占位题仍开放「我觉得不对」异议入口

- **位置**：`miniprogram/pages/report/report.wxml:67`（dispute-btn 无 wx:if 排除失败题）
- **现象**：失败题（`isCorrect===null && questionText===''`）同样渲染异议按钮；用户可对空题发起异议 → dispute 以空题干重诊 → 模型在无上下文下乱判，产生垃圾判定
- **修复方案**：异议按钮加条件排除失败题：
  ```html
  <view class="dispute-btn" wx:if="{{item.isCorrect !== null || item.questionText}}" ...>
  ```

### P1-3｜dispute questionType 缺省链与 diagnose 不一致（缺省「解答」）

- **位置**：`cloudfunctions/dispute/index.js:140`（`question.questionType || '解答'`）vs diagnose `questionType || '其他'`（P1-⑦ 已明确缺省非解答，防 η 误判）
- **现象**：questionType 缺失的题目（含失败占位题）在 dispute 中被按解答题处理，η 语义错误
- **修复方案**：dispute 缺省对齐 diagnose：`question.questionType || '其他'`

---

## 维度 3：安全漏洞扫描

- ✅ openid 隔离：photoUpload（fileId 归属校验 P1-A）、diagnose（batch 归属 + fileId 二次校验）、dispute（question 归属）、graphService/getReport（batch 归属 + questions 按 userId 过滤）全部校验
- ✅ API key：QWEN/DEEPSEEK/EMBEDDING key 全部走 `process.env`，不落代码/前端
- ✅ 图谱数据公开可读（无学生数据）
- ✅ 云函数写入均手动带 `_openid`，与安全规则 `doc._openid == auth.openid` 兼容
- ⚠️ P2：前端 `wx.cloud.uploadFile` 的 cloudPath 由前端拼接（`photos/${uid}/...`），用户可构造任意路径字符串；photoUpload 仅校验 `id.includes('/photos/{openid}/')` 前缀，无法验证文件真实归属（越权写需知道他人 openid，风险低，可加云存储安全规则限定 `photos/{openid}/` 前缀）
- ⚠️ P2：diagnose 幂等检查（status==='pending'）非原子，极端并发下双跑产生双份数据（低概率，可延后）

---

## 维度 4：性能反模式

- ✅ RAG 轻量自建（200 条线性 cosine）符合技术选型；embedding 失败降级不阻塞
- ✅ 照片 vision 并行（Promise.all）
- ⚠️ 已知待办 #1：diagnose 同步编排 9 张场景超 120s（异步任务化）——已列入审查包待办，未在本报告重复定级
- ⚠️ 已知待办 #5：graphService getGraph childCount N+1 查询——已列入审查包待办
- ⚠️ P2：getReport 的 questions 查询未显式 `.limit()`，依赖云函数默认 limit（100），一图多题大场景有截断风险

---

## 维度 5：可维护性评估

- ✅ 代码结构清晰：配置/响应/RUBRIC/LR/网络调用/RAG/主入口分层明确
- ⚠️ 已知待办 #6：diagnose/dispute 重复代码（RUBRIC/LR/clampParams/postJSON）未抽取——已列入审查包待办
- ⚠️ P2：dispute 中 `_.push([revision])` 使用 push 旧版签名（数组展开追加），新版语义为 `_.push({each:[...]})`；当前行为正确但建议显式 `{each}` 提升可读性
- ⚠️ P2：report.js submitDispute 后未刷新 questionCategory/errorAttribution（dispute 后端已更新，前端仍显示旧值）
- ⚠️ P2：异议弹层仅回显作答，未按设计回显题目文本/难度档位
- ⚠️ P2：batchId 无效/为空时仅 Toast，未按设计「返回首页」
- ⚠️ P2：report 汇总「成功诊断」= `questions.length - failedCount`，filteredCount（越权过滤）计入 failedCount 但无对应 questions 占位，统计有偏差
- ⚠️ P2：index.js 硬编码 mastery/suggestion/mock 数据（既有问题，非本批次引入；本批次仅新增拍照诊断入口）

---

## 问题清单汇总

| 编号 | 等级 | 模块 | 问题 | 状态 |
|------|------|------|------|------|
| P0-1 | P0 | diagnose/dispute | clampParams 字段名与 DeepSeek 输出断裂，D/P/η 全部失真 | ❌ 待修复 |
| P1-1 | P1 | diagnose | where().remove() 20 条限制，重诊残留旧数据 | ❌ 待修复 |
| P1-2 | P1 | report.wxml | 失败题仍开放异议入口，空题乱判 | ❌ 待修复 |
| P1-3 | P1 | dispute | questionType 缺省「解答」与 diagnose 不一致 | ❌ 待修复 |
| P2-1 | P2 | 契约 | failedItems[] 契约漂移（实现改为 questions 内嵌失败占位） | 文档同步 |
| P2-2 | P2 | 契约 | photoUpload 接口形态（files vs fileIds）与设计文档不一致 | 文档同步 |
| P2-3 | P2 | diagnose | 幂等检查非原子，并发双跑 | 可延后 |
| P2-4 | P2 | photo | cloudPath 前端可构造，无云存储路径安全规则 | 建议加固 |
| P2-5 | P2 | graphService | getReport 无显式 limit，潜在截断 | 可延后 |
| P2-6 | P2 | 脚本 | import-knowledge-graph 输出 subject/stage 幽灵字段 | 待修复 |
| P2-7 | P2 | dispute | push 旧版签名，建议 {each} | 可延后 |
| P2-8 | P2 | report.js | 异议后未刷新 questionCategory/errorAttribution | 待修复 |
| P2-9 | P2 | report 弹层 | 异议弹层未回显题目文本/难度档位 | 待修复 |
| P2-10 | P2 | report | batchId 无效未返回首页；汇总统计偏差；index 硬编码 | 备注 |

## 审查包（编码审查包-P0最小闭环.md）准确性核验

| 审查包声明 | 核验结果 |
|-----------|---------|
| 审查对象文件路径 | ✅ 全部存在（4 云函数 + 3 页面四件套 + app.json + 脚本） |
| 部署前提：engines node>=18 | ✅ 4 个云函数 package.json 均声明 `"node": ">=18.0.0"` |
| 环境变量清单 | ✅ 与代码 process.env 读取一致（QWEN/DEEPSEEK/EMBEDDING 等） |
| 集合索引声明 | ⚠️ questions 复合 `batchId+userId` / `userId+createdAt`(降) 与 getReport `where({batchId,userId}).orderBy('createdAt','asc')` 匹配性需部署时确认（orderBy asc 与索引降序的兼容性） |
| 已知待办 1/2/3/4/5/6 | ✅ 均在代码中核实存在（超时/图谱数据源/导入未执行/孤儿文件/N+1/重复代码） |
| 「不包含历史修复记录」 | ✅ 符合，本报告从零通读，P0-1 为独立发现（历史多轮审查均未覆盖此字段断裂） |

---

## 修复优先级建议

1. **P0-1 必须立即修复**（字段名对齐，两处同步 + 回归验证）
2. P1-1/P1-2/P1-3 随 P0-1 一并修复（一次修复所有同类问题）
3. P2 项按上表顺序处理，其中 P2-6/P2-8 建议本轮顺手修复

修复完成后再触发 code-reviewer 重新评审（多轮评审模式，输出 `_R2` 报告）。
