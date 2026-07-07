# CLAUDE.md

## 🔒 编码强制规则（禁止以任何理由跳过）

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

**第一步永远是：** `bash gate.sh status`。

### 管道自动推进规则

**禁止在步骤之间询问"是否继续"。** 自动执行完当前阶段全部步骤，然后自动进入下一阶段。
**人肉评审门例外**：每个文档阶段（PRD/架构/详细设计）归零后，必须用 `ask()` 向用户展示关键决策摘要，等待确认后再 `gate.sh pass`。
只有遇到阻断（门禁不通过 / 评审无法归零 / 验证失败 / 人肉评审不通过）才停下来报告用户。

### ai_memory 记忆集成

项目集成了 `ai_memory` MCP 工具，在每个阶段的开始和结束时自动管理上下文：
- **阶段开始** → `init_session` + `search_summaries` 恢复上下文
- **评审发现问题** → `add_decision` 记录决策
- **阶段完成** → `save_summary` 存档产出

详见 `coding-rules.md` 中各阶段的详细流程。

### 三层防线

**第 1 层：PreToolUse Hook（基础设施级强制，AI 无法绕过）**
`.reasonix/settings.json` → `scripts/gate-hook.sh` 在每次 edit_file/write_file 前检查 prd/arch/detailed 三个阶段是否全部通过，任一缺失则 `exit 2` 阻断。

**第 2 层：Conductor Skill（推荐一站式全流程）**
`run_skill({ name: "conductor", arguments: "module=... task=..." })` — 一次调用自动走完五阶段。

**第 3 层：Gatekeeper Skill（编码专用）**
`run_skill({ name: "gatekeeper", arguments: "module=... task=..." })`

**第 3 层：编码验证脚本**
`gate.sh pre` → 编码 → `gate.sh post`

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
