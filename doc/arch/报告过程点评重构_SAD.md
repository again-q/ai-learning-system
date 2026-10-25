# AI 学习助手 — 报告「过程点评」重构 架构设计

**文档编号**：ARCH-20261025-001
**版本**：v1.0.0
**状态**：🟡 草稿（待评审）
**创建日期**：2026-10-25
**上游**：`doc/prd/报告过程点评重构_PRD.md`（PRD-20261025-001）
**下游**：详细设计（待写）

---

## 0. 一句话架构

**判定层只负责「核对事实并落库」，报告层负责「组织成学生能读的三块」，前端只负责「按字段渲染」。**

新增的一切都遵守一条总原则（本轮新立）：

> **`questions` 存「可核验事实」；`reports` 快照存「它当时怎么说的」。**

存量报告快照**原样冻结、永不回填** —— 同一题在新旧报告里文案不同，学生能指出是哪一版说的。

---

## 1. 架构总览

```
┌─────────────────────────── 判定层（graphEngine） ───────────────────────────┐
│  N2 judgeAI ──► orchestrator.analyze()                                      │
│                  ├─ 解答题：拆解 → 逐单元核查 → 代码汇总  (已有)              │
│                  │     └─ results[{i,raw,chk,rejected}]  ← 本轮落库           │
│                  ├─ 选填题：选项分析 (已有)                                   │
│                  │     └─ choiceAnalysis{derivation,whyWrong,...} ← 本轮落库   │
│                  └─ ★新增 answerPath：AI 做法 + 更优判定（对/错都跑）        │
│  N3 normalize ──► buildQuestionPatch()   ← ★新增 steps / choiceAnalysis      │
│  N4 persistQuestion ──► questions（事实）                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────── 报告层（reportService） ──────────────────────────────┐
│  assemble()  ← 透出新字段                                                    │
│  generate()  ← ② 逐题并行：diagnosis(已有) + ★aiApproach(对题 AI 做法)       │
│              ← ★correctNote 模板句（纯代码，零 AI）                          │
│              ← ★masteryChange 完整收集 + 汇总（零 AI）                       │
│  reports.add({ report })  ← 快照冻结                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────── 前端（packageDiagnose/report） ─────────────────────────────┐
│  题卡三块：① 你的过程（steps 逐步） ② AI 的做法（referenceProcess+更优提示）│
│           ③ 这一问怎么想（★推测 guess/why/quote + ★自述 userCorrection）    │
│  记录块：掌握度（一位小数 + 汇总行）                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 数据流与存储分层

### 2.1 三层存储职责

| 层 | 集合/字段 | 存什么 | 是否可变 |
|---|---|---|---|
| **事实层** | `questions.steps` / `.choiceAnalysis` / `.referenceProcess` / `.moreEfficient` | 判定层核出来的原始事实（学生原话、应为、AI 做法） | 可重判覆盖 |
| **快照层** | `reports.report.questions[]` | 生成那一刻的呈现数据（含模板句、汇总、推测缓存引用） | **冻结** |
| **缓存层** | `sub_thinking`（已有） | 「这一问怎么想」的推测结果 | 可重生成（带版本号） |

### 2.2 为什么 `steps` 放判定层而不是报告层

- `steps` 来自**逐单元代码对照**（`compare()` 判断权在代码），属**事实**，不是文案 → 属事实层
- 同一题被重复生成报告时不用重算 → 零 token
- 若以后加「步骤异议」，改的是事实层，只需一处

### 2.3 为什么对题 AI 做法放报告层

- 对题不需要判定层再算一遍（判定已有结论「过程 OK」）
- 报告生成时**手里已有**：题干 + 学生全程 + 已有 `referenceProcess`（若判定层给过） → 一次调用搞定
- 判定层对题补跑 N2 会拖慢复核页（用户当场等结果），放报告层是后台生成，可容忍

---

## 3. 组件设计

### 3.1 判定层（`graphEngine`）

#### C1 · `normalize.buildQuestionPatch()` 扩展（只增字段）

```js
// 新增三个字段（不改任何已有字段语义）
steps:          Array<Step>,      // 逐单元核对结果；无过程/未编排 → []
choiceAnalysis: Object|null,      // 选填题选项分析；解答题 → null
```

**Step 结构**（来自 `orchestrator.results`，字段一一映射）：

| 字段 | 来源 | 说明 |
|---|---|---|
| `i` | `unit.i` | 单元序号（1 起） |
| `raw` | `unit.raw` | **学生原文**（逐字引用，禁止模型改写） |
| `status` | `cmp.status` | `ok` / `broken` / `no-computation` / `unknown` |
| `claim` | `cmp.claim` | 学生这一步声称的结果（仅 broken） |
| `correct` | `cmp.correct` | 应得结果（仅 broken） |
| `reason` | `cmp.reason` | 一句理由（仅 broken） |
| `rechecked` | `r.cmp`（重核后结论） | 与首判不一致时，**代码汇总取「两判都判 broken」为最终结论**，否则标 `unknown`（代码侧收敛，不新增模型） |

> ⚠️ **红线**：只做**字段白名单式映射**，不改变 `compare()` 的任何判定逻辑（决策 061 红线 3）。

> ⚠️ **核查更正（2026-10-25）**：编排层 `results` 里**没有** `rejected` 字段；重核结论 `chk2 / cmp2` 目前**只用于算 `unstable` 然后被丢弃**（`orchestrator.js:171-180`），首判的 `r.cmp` 也没被更新。本轮把重核结论**带出来**（新增 `rechecked`），由代码收敛「两判不一致 → 该步不定案」，避免给学生一个会翻案的结论。

#### C2 · `orchestrator` 新增 `answerPath`（AI 做法 + 更优判定）

- 新增纯函数 `answerPath({ call, questionText, work, referenceProcess, correct })`
- **触发**：**解答题**（有过程或有一方过程）即跑；选填题不跑
- **输入**：题干 + 学生过程 + 已有参考过程（可为空）
- **输出**：
  ```js
  { steps: [{step, content, note}],           // AI 的做法（3~8 步）
    moreEfficient: boolean,                   // AI 做法是否更优
    betterAt: number|null,                    // 学生第几步可替换（必须存在）
    whyBetter: string|null }                  // ≤40 字，必须落在「更少步骤/更少分类/更少计算」
  ```
- **失败降级**：调用失败 → `null`，**不阻塞判定**（与现有编排失败同款：记 `issues`）

#### C3 · 落库（`persistQuestion`）

- `buildQuestionPatch` 已含 `referenceProcess` → 由 `answerPath.steps` 覆盖（若存在且非空）
- 新增 `.moreEfficient` / `.betterAt` / `.whyBetter` 落 `questions`

### 3.2 报告层（`reportService`）

#### C4 · `assemble()` 透传

`allQuestions[]` 新增：`steps`、`choiceAnalysis`、`moreEfficient`、`betterAt`、`whyBetter`。

#### C5 · 三个新生成器（`generateV2.js`）

| 生成器 | 触发 | 输入 | 输出 | 新 prompt |
|---|---|---|---|---|
| ~~`correctNote()`~~ | **不用模型** | `knowledgeUsage` | 字符串 | 无（后端代码拼） |
| `aiApproach(q)` | 判定层**没给**参考过程的解答题（对题为主） | 题干 + 学生过程 | `{steps, moreEfficient, betterAt, whyBetter}` | `ai-approach.txt` |
| （沿用）`diagnosis(q)` | 非空白题 | 原有 | 原有 | 不改 |

> **为什么 `aiApproach` 放报告层而非判定层**：判定层已跑的 `answerPath` 结果会被 `assemble` 带出来 → 报告层**只在缺失时**调用，避免重复调用。

#### C6 · 更优提示的三条硬门槛（**代码守卫，不是 prompt 约束**）

```
展示优化提示  ⇔  moreEfficient === true
              ∧  betterAt ∈ [1, steps.length of 学生过程]
              ∧  whyBetter 命中 /步骤|分类|计算/ 且不含新方法词
              ∧  q.questionType === '解答'
```
不满足 → **整块不渲染**（连空占位都不给）。

#### C7 · 掌握度变化（纯代码）

```
for each knowledgeNodeId in mastery_logs(本批):
    before = 首次 oldMastery, after = 末次 newMastery
    若 before != after（浮点相等，**不再取整比较**）→ 进列表
汇总：{ ups, downs, flats, news }
「没记到」：knowledgeUsage 里有、但无 progress 记录的名字 → 单独计数
```
展示精度：`(v*100).toFixed(1)`。

### 3.3 前端（`packageDiagnose/report`）

#### C8 · 题卡三块结构

```
┌ 题头：第 N 题 · 题型 · 得分 · 全班正确率
├ 题干
├ ★A. 你的过程（steps）        ← 解答题
│    broken 时展开前 2 条；全 ok 折叠成一行
├ ★B. AI 的做法（referenceProcess）  ← 解答题，对/错都给
│    标题"AI 的做法"；更优时顶部一条提示
├ ★C. 这一问怎么想的（每小问入口）  ← 解答题
└ 选填错题：选项分析（choiceAnalysis）+ 原因说明
```

#### C9 · 「这一问怎么想」新形态

```
面板
├ 固定标注：AI 猜测 · 不是结论
├ 假设 1：「你写了：__quote__」→ AI 之所以这么猜：__why__ → 如果是这样：__guess__
├ 假设 2：（同上，互斥）
└ [ 我当时是这么想的：____ ]   ← 学生自述，写后优先展示
```

- 原「AI 独立解法」→ 折叠块 `另一种走法（AI 自己做一遍）`
- 缓存键：`questionId + subNo + PROMPT_VERSION`

---

## 4. 接口设计（云函数 action）

| 云函数 | action | 入参 | 出参（新增部分） | 状态 |
|---|---|---|---|---|
| `reportService` | 生成报告（默认） | `batchId` | `report.questions[].{steps, choiceAnalysis, correctNote, aiApproach, moreEfficient, betterAt, whyBetter}`；`report.masterySummary` | 改 |
| `reportService` | `subThinking` | `questionId, subNo` | `{ guesses: [{guess,why,quote}], otherWay: [...], userCorrection }` | 改 |
| `reportService` | `subSelfThought` | `questionId, subNo, text` | `{userCorrection}` | **新** |
| `graphEngine` | `judgeQuestion` | 不变 | 内部 `questions.steps` 落库 | 改（内部） |

> 异议相关 action **本轮不加**（F6 已移出，见 PRD §3.6）。

---

## 5. 关键设计决策（ADR）

| # | 决策 | 理由 | 备选/否决 |
|---|---|---|---|
| ADR-1 | **对题模板句用代码拼，不用模型** | 用户明确「甚至可以用那种模板化套话，都不用 AI 生成的」；0 成本、0 漂移 | 否决：让模型写 → 每批多 N 次调用且措辞不稳 |
| ADR-2 | **逐步点评用编排层 `results`，不新增模型调用** | 编排层已逐单元核过，结果被浪费在日志里 | 否决：报告层重新核对 → 重复算、还可能和判定层结论打架 |
| ADR-3 | **`steps` 从 `compare()` 而来，不用 `segments`** | `segments` 是模型主观分「通/断」；`steps` 是代码逐单元核对（含「应为 X」） | 否决：用 segments 当主轴 → 无法给「哪一步错、应该是什么」 |
| ADR-4 | **对题 AI 做法放在报告层，缺失才补** | 判定层已跑的不重复调用；报告层是后台生成可容忍延迟 | 否决：全放判定层 → 复核页等待变长 |
| ADR-5 | **更优提示由代码守卫三条门槛** | 用户只接受「AI 真的更优」才提示；prompt 约束不可靠 | 否决：纯靠 prompt 自律 → 满分题被说「可以更好」伤体验 |
| ADR-6 | **存量报告不重算** | 快照语义 + 用户能分辨版本；避免一次性重刷成本 | 否决：批量重算 → 33 份报告 × N 题调用，且破坏「当时怎么说的」 |
| ADR-7 | **掌握度只在显示层补全** | 用户拍板不传已定；改记账口径需动 K 口径（宪法级） | 否决：改 `updateMastery` 记账范围 → 破坏 052–055 口径，影响所有历史对拍 |
| ADR-8 | **推测强制三件套：标注「猜测」+引用原文+可自述** | 第一性原理：无证据心理断言不可核验；引用原文即可核验 | 否决：AI 直接断言「你想的是 X」→ 违反 `diagnosis.txt` 既有红线 |
| ADR-9 | **新字段全部可缺省、前端降级渲染** | 存量报告/旧题数据没有新字段 | 否决：强制迁移 → 需要全量刷库 |

---

## 6. 边界与失败处理

| 场景 | 行为 |
|---|---|
| 某题 `steps` 为空（旧数据/未编排） | 不渲染「你的过程」块，回退到现有 `segments` 展示 |
| `answerPath` 调用失败/超时 | 该题不渲染 AI 做法块（不留白框）；`issues` 记一条 |
| 对题 AI 做法生成失败 | 同上，不影响其他题 |
| `moreEfficient=true` 但 `betterAt` 越界 | 代码丢弃整条提示 |
| 选填题 | 不生成 AI 做法/更优提示；有 `choiceAnalysis` 则展示，否则显示真实原因 |
| 空白题 | 沿用现有 skip 逻辑（不做诊断） |
| 推测引用原文与学生实际文本不逐字一致 | **丢弃该条猜测**（防编造），只保留可核验的 |
| 旧报告打开 | 新字段缺失 → 前端按块条件渲染，不白屏 |
| 模型返回非 JSON | 各生成器已有兜底；新生成器同款 try/catch |

---

## 7. 成本与性能

| 项 | 现状 | 改动后 | 增量 |
|---|---|---|---|
| 判定层（每题） | 编排 N 次子调用 | +1 次 `answerPath`（解答题） | +1 调用/解答题 |
| 报告层（每题） | 1 次 diagnosis | +0~1 次 aiApproach（仅缺失时） | 0~1 调用/题 |
| 对题模板句 | — | 0 | 0 |
| 逐步点评 | — | 0 | 0 |
| 掌握度 | — | 0 | 0 |
| 「这一问」 | 点击时 1 次 | 点击时 1 次 | 0 |

**最坏情形**（20 题全解答题）：+20 次判定层调用 + ≤20 次报告层调用。建议 `answerPath` 与诊断**并行**，报告生成时间增幅控制在 40s 内（PRD §4）。

> 可调开关：`ANSWER_PATH=off` 环境变量停用（与既有 `ORCHESTRATOR=off` 同款），便于回滚。

---

## 8. 兼容性与迁移

- **不需要数据迁移**：新字段可缺省
- **不需要重刷报告**：存量快照不动
- **需要重新判定才会产生 `steps`**：旧题打开时无逐步点评（前端显示回退），新拍/重新判定的题才有
- 云函数部署：`[deploy:graphEngine,reportService]`

---

## 9. 与既有架构的关系

| 既有 | 本次影响 |
|---|---|
| 决策 061 档 2 编排 | **只消费其结果**，不改判定逻辑 |
| 决策 053 `knowledgeUsage` | 作为模板句的输入（不改其语义） |
| 决策 060 官方优先 | 对错/得分仍由官方决定，AI 只给过程层解释 |
| `systemV3` 规则 10（禁止数值能力指标） | **不冲突**：掌握度百分比是「记录」段既有展示，不是能力指标新增 |
| `diagnosis.txt` 红线（不猜心理） | **例外条款**：仅「这一问怎么想」允许推测，且必须标注+引用+可自述（ADR-8） |

---

## 10. 评审记录

| 日期 | 评审人 | 结论 | 备注 |
|---|---|---|---|
| — | — | 待评审 | |
