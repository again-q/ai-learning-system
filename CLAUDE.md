# CLAUDE.md

## 🛑 最高规则（禁止以任何理由违反）

**未经用户明确许可，不得修改本文件（CLAUDE.md）。** 无论执行什么任务，无论出于什么原因，未经许可绝对不能修改。这条规则的优先级高于本项目中的一切其他规则。

## 🔒 编码强制规则（禁止以任何理由跳过）

### 规则 0：被门禁拦住时必须问用户

Hook 阻断编辑时，**必须用 `ask()` 问用户是否批准**。禁止自行创建 `.pass` 文件、修改门禁脚本或采取任何绕过措施。用户批准后按用户指示的流程走。这条规则优先级高于一切。

### 核心流程：五阶段

```
PRD → 架构 → 详细设计 → 编码 → 代码评审
```

每个阶段统一模式（编码和评审除外）：**skill → review-expert 评审 → 修复归零 → pass**

### 各阶段对照

| 阶段 | 产出 Skill | 评审 Skill | 归零后 |
|------|-----------|-----------|--------|
| PRD | `prd-writer` | `review-expert` | `gate.sh pass prd` |
| 架构 | `system-architect` | `review-expert` | `gate.sh pass arch` |
| 详细设计 | `task-decomposer` | `review-expert` | `gate.sh pass detailed` |
| 编码 | `gatekeeper` | `code-reviewer` → `gatekeeper` 修复 → 归零 | `gate.sh post` |
| 代码评审 | `code-reviewer` → `gatekeeper` 修复 → 归零 | — | `gate.sh pass review` |

**第一步永远是：** `bash gate.sh status`（查看阶段状态 + 理解确认状态）。

### 管道自动推进规则

**禁止在步骤之间询问"是否继续"。** 自动执行完当前阶段全部步骤，然后自动进入下一阶段。
**人肉评审门例外**：每个文档阶段（PRD/架构/详细设计）归零后，必须用 `ask()` 向用户展示关键决策摘要，等待确认后再 `gate.sh pass`。
只有遇到阻断（门禁不通过 / 评审无法归零 / 验证失败 / 人肉评审不通过）才停下来报告用户。

### ai_memory 记忆集成

项目集成了 `ai_memory` MCP 工具，在每个阶段的开始和结束时自动管理上下文：
- **阶段开始** → `init_session` + `search_summaries` 恢复上下文
- **评审发现问题** → `add_decision` 记录决策，并同步更新 `doc/decision-log.md`
- **阶段完成** → `save_summary` 存档产出

详见 `coding-rules.md` 中各阶段的详细流程。

### 三层防线

**第 1 层：PreToolUse Hook（基础设施级强制，AI 无法绕过）**
`.reasonix/settings.json` → `scripts/gate-hook.sh` 在每次 edit_file/write_file 前检查 prd/arch/detailed 三个阶段是否全部通过，任一缺失则 `exit 2` 阻断。

**被拦了怎么办：** 用 `ask()` 问用户是否批准跳过。用户批准后，让用户在终端执行 `bash /Users/apple/Desktop/ai-learning-system/scripts/gate.sh allow-write` 并输入 `yes`，然后重试被拦的操作（令牌单次使用，用完即焚）。完成后可运行 `bash gate.sh revoke-write` 手动撤销。

**第 2 层：Conductor Skill（推荐一站式全流程）**
`run_skill({ name: "conductor", arguments: "module=... task=..." })` — 一次调用自动走完五阶段。

**第 3 层：Gatekeeper Skill（编码专用）**
`run_skill({ name: "gatekeeper", arguments: "module=... task=..." })`

**第 3 层：编码验证脚本**
`gate.sh pre` → 编码 → `gate.sh post`

---

### 行为强制规则（与五阶段流程同级，禁止以任何理由跳过）

#### 规则 A：先理解再动手
**禁止在未确认理解之前就开始输出方案。**

收到需求后必须按以下顺序执行：
```
① 用自己的话复述需求
② 逐一排查需求深挖清单（见下方）
③ 对模糊点提出具体问题
④ 用 ask() 工具展示理解摘要，给出两个选项：     ← ⚠️ 必须使用 ask()
   「✅ 理解正确，开始方案设计」
   「🔄 理解有偏差，需要修正」
⑤ 用户选「✅ 理解正确」→ 执行 bash gate.sh confirm-understanding
   用户选「🔄 需要修正」→ 根据反馈修正后回到 ①
⑥ 开始方案设计
```

**⚠️ 禁止跳过 ask() 直接执行 gate.sh confirm-understanding。ask() 结果是创建标记的唯一凭证。**

**需求深挖清单（默认逐条深挖。你觉得不用问那么细，说一句我就浅挖）：**

```
□ 目标：这个改动解决什么问题？成功标准是什么？
□ 范围：涉及哪些页面/组件/云函数？明确不改什么。
□ 边界：空数据时、加载中、出错时分别怎么表现？
□ 依赖：改了这个，哪些现有功能可能受影响？（必须 grep 调用链确认）
□ 数据：数据从哪里来？格式是什么？谁提供？
□ 用户：谁在用这个功能？操作流程是什么？
```

**不得跳过此清单直接写方案。对于已有明确答案的条目，在清单旁标注"已明确"即可。**

**理解偏差是后续所有问题的根源。确认理解前，不动笔。不执行 `gate.sh confirm-understanding`，PreToolUse Hook 会阻断所有编辑操作。**

#### 规则 B：不得越界（5 条红线）

**AI 只能做明确要求的——每行代码、每个决策必须能追溯到用户的明确要求。**

| 红线 | 示例 | 正确做法 |
|------|------|---------|
| ❌ 擅自选技术 | "我决定用 Vue 3 + Vite" | 停下来问用户技术偏好 |
| ❌ 加我没要的功能 | "顺便加了个搜索功能" | 只做任务明确要求的 |
| ❌ 私自重构/优化 | "顺手重构了数据层" | 不动不相关代码 |
| ❌ 改错了文件 | 改了不该改的模块 | 确认改动范围再动手 |
| ❌ 假设错了方向 | "我猜你想要的是..." | 说出来让用户确认 |

#### 规则 C：编码守则

**编码前：**
- 找出要改文件的完整上下文（数据流、依赖、调用链）
- 确认改动不会破坏其他功能
- 不理解的地方先问，不要猜

**编码中：**
- 缩进、命名、注释风格和项目保持一致
- 不引入新的代码模式（除非任务明确要求）
- 不添加"以防万一"的防御代码
- **遇到任何需要决策的地方（变量名、数据格式、样式取值、异常处理方式等），不确定就先用 ask() 问你，不要自己猜了决定**

**编码后自检清单：**
```
□ 只改了任务要求的文件？
□ 没有破坏其他功能？
□ 代码风格与项目一致？
□ 没有硬编码/遗留调试代码？
□ 边界情况有处理？
```

**评审修复：**
有问题后→ 理解问题本质 → 一次修复所有同类问题 → 自检是否引入新问题 → 再提交

#### 规则 D：出错必记录（2026-08-11 用户要求）

**每次开发/调试中出现的任何错误——无论是否已修复——必须记录到 `doc/standards/开发经验.md`（或对应专项经验文档，如前端经验）。**

```
记录格式：现象 / 根因 / 修复 / 教训
覆盖范围：bug 根因、踩坑、试错结论、被否决的方案（含为什么否决）
触发时机：修复完成后立即记，不等收尾
```

**目的**：防重复踩坑，沉淀项目经验——每一个错误都是项目资产，不许丢失。

---

**详细参考见 `AI协作手册.md`（位于项目根目录，新 AI 应首先阅读）。**

---

**允许直接编辑的理由个数 = 0。**

具体编码流程见 `coding-rules.md`，已注入系统提示。

---

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. No exceptions to the coding enforcement rules above.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
