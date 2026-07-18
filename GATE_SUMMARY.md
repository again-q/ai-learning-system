# 编码门禁系统（给新 AI 的快速入门）

## 一句话

这是一个 Reasonix 项目，有一套五阶段编码门禁系统。**不跑通门禁就不能编辑代码。**

## 五阶段流程

```
PRD → 架构 → 详细设计 → 编码 → 代码评审
```

阶段之间自动推进，不允许跳步。

## 第一步

```bash
bash gate.sh status
```

查看当前处于哪个阶段。

## 各阶段操作

| 阶段 | 产出 Skill | 评审 | 通过命令 |
|------|-----------|------|---------|
| PRD | `prd-writer` | `review-expert` | `gate.sh pass prd` |
| 架构 | `system-architect` | `review-expert` | `gate.sh pass arch` |
| 详细设计 | `task-decomposer` | `review-expert` | `gate.sh pass detailed` |
| 编码 | `gatekeeper` | `code-reviewer` | `gate.sh post` |
| 代码评审 | `code-reviewer` | gatekeeper修复 | `gate.sh pass review` |

## 人肉评审门

PRD/架构/详细设计 三个文档阶段完成后，**必须用 `ask()` 向用户展示关键决策摘要，等用户确认后才能 `gate.sh pass`**。不自动通过。

## 三层防线（AI 无法绕过的）

1. **PreToolUse Hook** — `.reasonix/settings.json` 配置，每次 `edit_file`/`write_file` 前检查上游阶段是否全通过，不通过直接 `exit 2` 阻断
2. **Conductor Skill** — `run_skill("conductor", "module=... task=...")` 一次走完五阶段
3. **Gatekeeper Skill** — `run_skill("gatekeeper", "module=... task=...")` 编码专用

## 关键文件

| 文件 | 作用 |
|------|------|
| `CLAUDE.md` | AI 行为规则（必读） |
| `coding-rules.md` | 各阶段详细执行流程 |
| `scripts/gate.sh` | 门禁 CLI |
| `scripts/gate-hook.sh` | PreToolUse Hook |
| `scripts/doc-gate.sh` | 阶段状态管理 |
| `scripts/verify-coding.sh` | 编码验证 |
| `.reasonix/settings.json` | Hook 配置 |
