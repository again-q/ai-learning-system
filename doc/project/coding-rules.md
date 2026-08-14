# AI 编码铁律 — 系统强制执行

## 一站式启动

最简方式（推荐）：

```bash
run_skill({ name: "conductor", arguments: "module=<模块名> task=<任务描述>" })
```

conductor 会自动走完五阶段全流程，无需逐阶段手动调用。

---

## 零号铁律：必须遵循五阶段流程

任何编码工作必须按以下阶段顺序进行，**不得跳步，不得越过当前阶段直接编码**：

```
PRD → 架构 → 详细设计 → 编码 → 代码评审
```

**每个阶段的标准模式（编码和评审阶段除外）：**

```
① init_session + search_summaries  ← 恢复项目上下文
② run_skill 调用阶段 Skill 生成文档
③ run_skill review-expert 评审文档
④ 发现问题 → 回到 ② 修复，add_decision 记录决策
⑤ 评审归零 → save_summary 存档 → bash gate.sh pass <阶段>
```

| 阶段 | 产出 Skill | 评审 Skill | 归零后 |
|------|-----------|-----------|--------|
| PRD | `prd-writer` | `review-expert` | `gate.sh pass prd` |
| 架构 | `system-architect` | `review-expert` | `gate.sh pass arch` |
| 详细设计 | `task-decomposer` | `review-expert` | `gate.sh pass detailed` |
| 编码 | `gatekeeper` | `code-reviewer` → `gatekeeper` 修复 → 归零 | `gate.sh post` |
| 代码评审 | `code-reviewer` → `gatekeeper` 修复 → 归零 | — | `gate.sh pass review` |

**第一步永远是：** `bash gate.sh status`，查看当前进度，从对应阶段开始。

### 管道自动推进规则（重要）

**禁止在步骤之间停下来问用户"是否继续"。** 一旦进入一个阶段，自动执行完该阶段的全部步骤：

```
check → skill 产出 → review → 修复循环 → save_summary(in_review) → 人肉评审门(ask) → pass
```

**人肉评审门**不在此限——每个文档阶段（PRD/架构/详细设计）归零后必须用 `ask()` 工具向用户展示关键决策摘要并等待确认。这是用户唯一在每个阶段都能介入决策的点。

完成后**自动进入下一个阶段**（除非遇到阻断或人肉评审未通过），不要问"下一步要做什么"。

只有以下情况才停下来报告用户：
- ⛔ 门禁检查不通过（gate.sh check 失败）
- ⛔ 评审无法归零（review-expert 反复发现问题但无法修复）
- ⛔ 编码验证不通过（gate.sh post 失败）

**阻断时输出清晰的阻断原因和解决方案，然后等待用户指示，不要自行跳过。**

非阻断情况下，**用户不需要参与流程推进。**

---

## ai_memory 记忆管理

项目集成了 `ai_memory` MCP 工具，在每个阶段的开始和结束时自动管理上下文：

| 时机 | 工具 | 作用 |
|------|------|------|
| 阶段开始 | `init_session(project)` → `search_summaries(tags=阶段)` | 恢复项目上下文和历史记录 |
| 评审发现问题 | `add_decision(description, type, reasoning)` | 记录为什么改、改了什么 |
| 阶段完成 | `save_summary(task_title, file_paths, tags, status)` | 存档阶段产出和状态 |

`save_summary` 的 session_id 格式：`session-{YYYYMMDD}-{阶段}-{模块}-{功能}`

---

## 各阶段详细流程

### PRD 阶段

```bash
# 恢复上下文
memory_init_session(project_name="<项目名>")
memory_search_summaries(query="PRD", tags="prd")

# 产出与评审
bash gate.sh check prd
run_skill({ name: "prd-writer", arguments: "..." })
run_skill({ name: "review-expert", arguments: "..." })

# 评审发现问题 → prd-writer 修复 → 重新 review-expert → 归零
# 发现问题时记录决策:
#   memory_add_decision(session_id="session-...", description="...",
#     decision_type="需求变更", reasoning="...")

# 归档并标记
memory_save_summary(session_id="session-<YYYYMMDD>-prd-<模块>",
  task_title="PRD: <模块>",
  file_paths="doc/prd/...",
  tags="prd, <模块>, 需求",
  module="<模块>",
  status="completed")
bash gate.sh pass prd
```

### 架构阶段

```bash
memory_init_session(project_name="<项目名>")
memory_search_summaries(query="架构", tags="arch, prd")

bash gate.sh check arch
run_skill({ name: "system-architect", arguments: "..." })
run_skill({ name: "review-expert", arguments: "..." })

# 评审发现问题 → system-architect 修复 → 重新 review-expert → 归零
# 发现问题时记录决策:
#   memory_add_decision(...)

memory_save_summary(session_id="session-<YYYYMMDD>-arch-<模块>",
  task_title="架构: <模块>",
  file_paths="doc/arch/...",
  tags="arch, <模块>, 架构",
  module="<模块>",
  status="completed")
bash gate.sh pass arch
```

### 详细设计阶段

```bash
memory_init_session(project_name="<项目名>")
memory_search_summaries(query="详细设计", tags="detailed")

bash gate.sh check detailed
run_skill({ name: "task-decomposer", arguments: "..." })
run_skill({ name: "review-expert", arguments: "..." })

# 评审发现问题 → task-decomposer 修复 → 重新 review-expert → 归零
# 发现问题时记录决策

memory_save_summary(session_id="session-<YYYYMMDD>-detailed-<模块>",
  task_title="详细设计: <模块>",
  file_paths="doc/detailed/...",
  tags="detailed, <模块>, 详细设计",
  module="<模块>",
  status="completed")
bash gate.sh pass detailed
```

### 编码阶段

```bash
memory_init_session(project_name="<项目名>")
memory_search_summaries(query="编码", tags="code, detailed")

bash gate.sh pre <模块名> <文档路径>
run_skill({ name: "gatekeeper", arguments: "module=... task=..." })
run_skill({ name: "code-reviewer", arguments: "..." })

# 代码审查发现问题 → gatekeeper 修复 → 重新 code-reviewer → 归零
# 修复时记录决策:
#   memory_add_decision(session_id="session-...",
#     description="修复 code-reviewer 指出的问题",
#     decision_type="bug修复", reasoning="...")

bash gate.sh post <模块名> 'biz=ok urls=ok params=ok entity=ok no-drift=yes'

memory_save_summary(session_id="session-<YYYYMMDD>-code-<模块>",
  task_title="编码: <模块>",
  file_paths="src/...",
  tags="code, <模块>, 编码",
  module="<模块>",
  status="completed")
```

### 代码评审阶段

```bash
memory_init_session(project_name="<项目名>")
memory_search_summaries(query="代码评审", tags="review")

run_skill({ name: "code-reviewer", arguments: "..." })
# ↑ 发现问题 → gatekeeper 修复 → 重新 code-reviewer → 归零
# 修复时记录决策:
#   memory_add_decision(session_id="session-...",
#     description="修复 code-reviewer 指出的问题",
#     decision_type="代码修复", reasoning="...")

bash gate.sh pass review

memory_save_summary(session_id="session-<YYYYMMDD>-review-<模块>",
  task_title="代码评审: <模块>",
  file_paths="src/...",
  tags="review, <模块>, 代码评审",
  module="<模块>",
  status="completed")
```

---

## 门禁强制机制

`PreToolUse` Hook（`.reasonix/settings.json`）在基础设施层自动拦截未经验证的编辑：
- 每次 `edit_file`/`write_file` 调用前触发
- 检查 **PRD + 架构 + 详细设计三个阶段是否全部通过**
（`doc/.gate/prd.pass`、`doc/.gate/arch.pass`、`doc/.gate/detailed.pass`）
- 任一缺失 → `exit 2` 阻断，AI 无法绕过

**Hook 是安全网，不是流程替代品。** 按 skill → review-expert 评审 → 修复归零 → pass 的循环推进就不会被拦。

---

## 端不对齐处理

```
发现端与端数据不一致
  └─→ 查 doc/ 下 API 契约和详细设计文档
       ├─ 文档有定义 → 以文档为准，改偏离的那一端
       └─ 文档没定义 → 停下来报告用户
```

## 一句话总结

**gate.sh status → memory_init → skill 产出 → 评审 → 修复归零 → save_summary → gate.sh pass。脚本没通过 = 工作没完成。**
