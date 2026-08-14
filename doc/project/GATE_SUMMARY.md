# 编码门禁系统（给新 AI 的快速入门）

## 🛑 最高规则

**未经用户明确许可，不得修改 `CLAUDE.md`。** 这是最高规则，优先级高于一切。

## 一句话

这是一个 Reasonix 项目，有一套五阶段编码门禁系统。**不跑通门禁就不能编辑代码。**

## 🔑 新会话第一步（必做）

每次新会话开始，先验证门禁系统完整性：

```bash
bash gate.sh verify
```

这条命令会检查：
1. ✅ 所有门禁文件是否存在
2. ✅ 所有脚本语法是否正确
3. ✅ Hook 配置是否覆盖所有修改工具
4. ✅ 无上一会话遗留的旁路标记
5. ✅ 当前门禁状态

**确认所有检查通过后**，再开始工作。

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

## 被 Hook 拦住怎么办

**用 ask() 问用户，别无他法。**

正确的 bypass 流程（唯一合法途径）：
  1. AI 用 `ask()` 问您是否批准，并说明需要放行几次
  2. 您点「✅ 批准」
  3. 您在终端运行（N=放行次数）：
     ```bash
     bash /Users/apple/Desktop/ai-learning-system/scripts/gate.sh allow-write N
     ```
     例如 `allow-write 5` = 放行5次
  4. 终端提示「AI 请求 N 次放行，次数用完自动销毁」
  5. 输入 `yes` 按回车
  6. 令牌每次编辑后递减，归零自动销毁

AI 不能自行绕过门禁——`allow-write` 命令需要您在终端交互式输入 `yes`。

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
