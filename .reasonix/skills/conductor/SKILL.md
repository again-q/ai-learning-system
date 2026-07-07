---
name: conductor
description: 管道指挥家。一次调用自动走完五阶段全过程，无需用户逐阶段干预。
runAs: inline
---
# Conductor — 管道指挥家

你是五阶段管道的**全自动编排者**。用户调用你一次，你负责完整跑完 `PRD → 架构 → 详细设计 → 编码 → 代码评审` 全流程。

**禁止在步骤之间询问用户"是否继续"。** 只有遇到阻断和**人肉评审门**才停下来报告用户。

---

## 人肉评审门原则

每个文档阶段（PRD / 架构 / 详细设计），在 review-expert 归零后、`gate.sh pass` 之前，必须插入人肉评审门。

评审门**不是**让用户通读全文，而是展示以下三层信息：

| 层 | 内容 | 目的 |
|----|------|------|
| ① **你的需求原文 vs 我的解读** | 你原始说的话 → PRD 理解成什么 | 让偏差浮出水面 |
| ② **关键决策点** | 3~5 个需要你拍板的选择 | 你不是被动"确认"，而是在做决定 |
| ③ **PRD 做的假设** | 文档里隐含的、你没明确说的前提 | 发现"我以为你知道"的坑 |

**人肉评审门的流程：**
```
展示对照摘要 → ask() 询问 "需要调整吗？"
    ├─ "没问题，继续" → gate.sh pass <阶段>
    ├─ "第 X 点不对" → 定位具体决策点 → 返回对应 skill 修复 → 重新 review → 再次展示
    └─ "我有个新想法" → 记录决策 → 回到 skill 更新 → 重新 review → 再次展示
```

> ⚠️ 人肉评审门全程使用 `ask()` 工具向用户展示选项，不要只发一段文字等用户打字回复。
> `ask()` 的 question 要具体，每个选项要有明确含义，不是 "y/N"。

---

## 启动

```bash
run_skill({ name: "conductor", arguments: "module=<模块名> task=<任务描述>" })
```

第一步：

```python
# 1. 恢复上下文（查之前跑到哪了）
memory_init_session(project_name="当前项目")
memory_search_summaries(query="conductor <模块>", tags="conductor, pipeline")

# 2. 看当前管道状态
bash gate.sh status
```

**如果搜索结果中有 status=in_progress 的记录** → 从记录的 `next_steps` 描述的阶段继续。
**如果没有** → 从 PRD 开始全新的管道。

---

## 管道状态管理

用一个**全局管道会话**来追踪进度。每完成一个阶段就更新状态，这样即使中途中断，下次也能恢复。

### 创建一个新的管道记录

```python
memory_save_summary(
    session_id="pipeline-<模块>-<日期>",
    task_title="Conductor: <模块>: <任务>",
    summary_content="管道当前阶段：PRD",
    file_paths="doc/prd/,doc/arch/,doc/detailed/,src/,doc/review/",
    project_name="当前项目",
    status="in_progress",
    next_steps="开始 PRD 阶段",
    tags="conductor, pipeline, <模块>",
    module="<模块>"
)
```

### 每阶段完成后更新

```python
memory_update_summary(
    session_id="pipeline-<模块>-<日期>",
    new_status="in_progress",
    updated_content="PRD 阶段已完成。下一阶段：架构"
)
```

### 全部完成后

```python
memory_update_summary(
    session_id="pipeline-<模块>-<日期>",
    new_status="completed",
    updated_content="五阶段全部完成"
)
```

---

## 各阶段执行流程

### PRD 阶段

```python
memory_init_session(project_name="当前项目")
memory_search_summaries(query="PRD <模块>", tags="prd, <模块>")
# ↑ 查之前有没有写过 PRD，避免重复

run("bash gate.sh check prd")

# 写 → 评审 → 修复 → 归零（循环）
while True:
    run_skill({ name: "prd-writer", arguments: "module=<模块> task=<任务>" })
    run_skill({ name: "review-expert", arguments: "评审 <模块> 的 PRD 文档" })
    if review_expert_passed():
        break
    memory_add_decision(
        session_id="pipeline-<模块>-<日期>",
        description="<review-expert 发现的问题和修复方案>",
        decision_type="需求变更"
    )
    # prd-writer 修复 → 继续循环

# ===== 人肉评审门：PRD =====
# 归零后，在 pass 之前展示 PRD 关键决策等你确认

memory_save_summary(
    session_id="session-<日期>-prd-<模块>",
    task_title="PRD: <模块>",
    summary_content="PRD 文档已完成，review-expert 评审归零",
    file_paths="doc/prd/<模块>_PRD.md",
    project_name="当前项目",
    status="in_review",   # ← 状态改为 in_review，表示等待人肉确认
    tags="prd, <模块>, 需求",
    module="<模块>"
)

# 从 doc/prd/ 读取 PRD，提取关键决策点
prd_summary = extract_prd_summary("doc/prd/<模块>_PRD.md")
# extract_prd_summary() 应提取以下内容：
#   - 1. 一句话定义（第 1 节执行摘要）
#   - 2. 目标用户画像（第 3 节用户角色）
#   - 3. 核心功能列表（第 4 节功能需求）
#   - 4. 优先级排序（必有/应有/可有）
#   - 5. 成功指标（第 1 节 OKR）
#   - 6. 假设列表：PRD 中隐含的 "默认" 前提

print(f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 人肉评审门 — PRD 阶段
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【你的原始需求】
  {task}

【PRD 的理解 — 请逐条核对】

  ① 一句话定义
     → {prd_summary.one_liner}

  ② 目标用户
     → {prd_summary.target_users}

  ③ 核心功能（按优先级）
     {prd_summary.features}

  ④ 成功指标
     {prd_summary.metrics}

【PRD 做的假设（你没明确说，但 PRD 当成前提了）】
  {prd_summary.assumptions}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
""")

human_decision = ask(
    header="PRD 确认",
    question="以上 PRD 的关键决策是否符合你的想法？",
    options=[
        { "label": "✅ 没问题，继续", "description": "PRD 准确反映了我的需求" },
        { "label": "🔧 第①条需要调整", "description": "一句话定义不准确" },
        { "label": "🔧 第②条需要调整", "description": "目标用户描述不对" },
        { "label": "🔧 第③条需要调整", "description": "功能列表或优先级不对" },
        { "label": "🔧 第④条需要调整", "description": "成功指标不准确" },
        { "label": "📝 我有其他想法", "description": "以上都没覆盖到，我来补充" },
    ]
)

if human_decision == "✅ 没问题，继续":
    # 人肉确认通过，标记完成
    memory_update_summary(
        session_id="session-<日期>-prd-<模块>",
        new_status="completed",
        updated_content="PRD 已通过人肉评审"
    )
    memory_update_summary(
        session_id="pipeline-<模块>-<日期>",
        new_status="in_progress",
        updated_content="PRD 完成，进入架构阶段"
    )
    run("bash gate.sh pass prd")

elif human_decision == "📝 我有其他想法":
    # 记录新需求，回到 prd-writer 修改
    memory_add_decision(
        session_id="pipeline-<模块>-<日期>",
        description="用户提出了 PRD 未覆盖的新想法：<用户输入>",
        decision_type="需求补充"
    )
    # 回到 prd-writer 修复循环
    continue  # 回到 while True 开头

else:
    # 具体哪条不对 → 记录偏差 → 回到 prd-writer 修复
    memory_add_decision(
        session_id="pipeline-<模块>-<日期>",
        description="人肉评审发现偏差：{human_decision}",
        decision_type="需求修正"
    )
    # 回到 prd-writer 修复循环
    continue  # 回到 while True 开头
```

### 架构阶段

```python
memory_init_session(project_name="当前项目")
memory_search_summaries(query="架构 <模块>", tags="arch, <模块>")

run("bash gate.sh check arch")

# 写 → 评审 → 修复 → 归零（循环）
while True:
    run_skill({ name: "system-architect", arguments: "module=<模块>" })
    run_skill({ name: "review-expert", arguments: "评审 <模块> 的架构文档" })
    if review_expert_passed():
        break
    memory_add_decision(...)

# ===== 人肉评审门：架构 =====
# 向用户展示技术选型和架构决策，用大白话不用术语

memory_save_summary(
    session_id="session-<日期>-arch-<模块>",
    task_title="架构: <模块>",
    file_paths="doc/arch/<模块>_SAD.md",
    project_name="当前项目",
    status="in_review",
    tags="arch, <模块>, 架构",
    module="<模块>"
)

arch_summary = extract_arch_summary("doc/arch/<模块>_SAD.md")
# extract_arch_summary() 应提取：
#   - 1. 技术方案一句话："我们用 X 技术实现"
#   - 2. 数据流："用户操作 → ... → 返回结果"
#   - 3. 关键决策点（选 A 不选 B 的理由）
#   - 4. 涉及哪些云资源（云函数个数、数据库表、存储桶等）

print(f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 人肉评审门 — 架构阶段
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【整体方案 — 一句话说明】
  {arch_summary.one_liner}

【数据怎么流动的】
  {arch_summary.data_flow}

【关键决策（你可能关心的）】
  {arch_summary.key_decisions}

【会用到的云资源】
  {arch_summary.cloud_resources}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
""")

human_decision = ask(
    header="架构方案确认",
    question="以上技术方案是否符合你的预期？",
    options=[
        { "label": "✅ 可以，继续", "description": "方案合理，没有疑虑" },
        { "label": "❓ 有个疑问", "description": "某个决策不太理解，想先搞清楚" },
        { "label": "🔄 换个方案", "description": "我倾向另一种方式（如不用云函数而用云托管）" },
    ]
)

if human_decision == "✅ 可以，继续":
    memory_update_summary(
        session_id="session-<日期>-arch-<模块>",
        new_status="completed",
        updated_content="架构已通过人肉评审"
    )
    memory_update_summary(
        session_id="pipeline-<模块>-<日期>",
        new_status="in_progress",
        updated_content="架构完成，进入详细设计阶段"
    )
    run("bash gate.sh pass arch")

else:
    memory_add_decision(
        session_id="pipeline-<模块>-<日期>",
        description="人肉评审架构时提出：{human_decision}",
        decision_type="架构变更"
    )
    continue  # 回到 system-architect 修复
```

### 详细设计阶段

```python
memory_init_session(project_name="当前项目")
memory_search_summaries(query="详细设计 <模块>", tags="detailed, <模块>")

run("bash gate.sh check detailed")

while True:
    run_skill({ name: "task-decomposer", arguments: "module=<模块>" })
    run_skill({ name: "review-expert", arguments: "评审 <模块> 的详细设计文档" })
    if review_expert_passed():
        break
    memory_add_decision(...)

# ===== 人肉评审门：详细设计 =====
# 展示给用户看的是：长什么样子、怎么操作、数据存了什么

memory_save_summary(
    session_id="session-<日期>-detailed-<模块>",
    task_title="详细设计: <模块>",
    file_paths="doc/detailed/<模块>_详细设计.md",
    project_name="当前项目",
    status="in_review",
    tags="detailed, <模块>, 详细设计",
    module="<模块>"
)

detailed_summary = extract_detailed_summary("doc/detailed/<模块>_详细设计.md")
# extract_detailed_summary() 应提取：
#   - 1. 有哪些页面/界面（页面名称、用途）
#   - 2. 核心交互流程（用户点哪里 → 发生什么）
#   - 3. 需要存什么数据（表格名称、存了什么）
#   - 4. 需要你准备的资源（API key、图片素材等）

print(f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 人肉评审门 — 详细设计阶段
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【页面/界面】
  {detailed_summary.pages}

【用户怎么用 — 核心流程】
  {detailed_summary.user_flow}

【要存什么数据】
  {detailed_summary.data_model}

【你需要准备的东西】
  {detailed_summary.prerequisites}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
""")

human_decision = ask(
    header="详细设计确认",
    question="以上设计是否符合你的预期？这是编码前的最后一道确认了。",
    options=[
        { "label": "✅ 没问题，开始编码", "description": "设计没问题，进入编码阶段" },
        { "label": "🔧 页面/交互需要调整", "description": "界面或操作流程需要改" },
        { "label": "🔧 数据存储需要调整", "description": "存什么数据需要补充或修改" },
        { "label": "🛑 先停一下", "description": "我还有些想法没说完，先不编码" },
    ]
)

if human_decision == "✅ 没问题，开始编码":
    memory_update_summary(
        session_id="session-<日期>-detailed-<模块>",
        new_status="completed",
        updated_content="详细设计已通过人肉评审"
    )
    memory_update_summary(
        session_id="pipeline-<模块>-<日期>",
        new_status="in_progress",
        updated_content="详细设计完成，进入编码阶段"
    )
    run("bash gate.sh pass detailed")

else:
    memory_add_decision(
        session_id="pipeline-<模块>-<日期>",
        description="人肉评审详细设计时提出：{human_decision}",
        decision_type="设计变更"
    )
    continue  # 回到 task-decomposer 修复
```

### 编码阶段

```python
memory_init_session(project_name="当前项目")
memory_search_summaries(query="编码 <模块>", tags="code, <模块>")

run("bash gate.sh pre <模块> doc/detailed/<模块>*.md")

# 编码 → code-reviewer → 修复 → 归零（循环）
while True:
    run_skill({ name: "gatekeeper", arguments: "module=<模块> task=<任务> docs=doc/detailed/<模块>*.md" })
    run_skill({ name: "code-reviewer", arguments: "审查 <模块> 的代码" })
    if code_reviewer_passed():
        break
    memory_add_decision(
        session_id="pipeline-<模块>-<日期>",
        description="<code-reviewer 发现的问题和修复方案>",
        decision_type="代码修复"
    )

run("bash gate.sh post <模块> 'biz=ok urls=ok params=ok entity=ok no-drift=yes'")

memory_save_summary(
    session_id="session-<日期>-code-<模块>",
    task_title="编码: <模块>",
    file_paths="src/",
    project_name="当前项目",
    status="completed",
    tags="code, <模块>, 编码",
    module="<模块>"
)

memory_update_summary(
    session_id="pipeline-<模块>-<日期>",
    new_status="in_progress",
    updated_content="编码完成，进入代码评审阶段"
)
```

### 代码评审阶段

```python
memory_init_session(project_name="当前项目")
memory_search_summaries(query="代码评审 <模块>", tags="review, <模块>")

while True:
    run_skill({ name: "code-reviewer", arguments: "审查 <模块> 的代码" })
    if code_reviewer_passed():
        break
    run_skill({ name: "gatekeeper", arguments: "module=<模块> task=修复 code-reviewer 指出的问题" })
    memory_add_decision(...)

run("bash gate.sh pass review")

memory_save_summary(
    session_id="session-<日期>-review-<模块>",
    task_title="代码评审: <模块>",
    file_paths="src/",
    project_name="当前项目",
    status="completed",
    tags="review, <模块>, 代码评审",
    module="<模块>"
)

memory_update_summary(
    session_id="pipeline-<模块>-<日期>",
    new_status="completed",
    updated_content="五阶段全部完成：PRD → 架构 → 详细设计 → 编码 → 代码评审"
)
```

---

## 评审归零判断

```python
def review_expert_passed():
    """检查 doc/review/ 下最新评审报告的结论"""
    # review-expert 输出评审报告 → 读结论
    # 结论是"通过" → 归零
    # 否则 → 未归零，继续修复

def code_reviewer_passed():
    """检查 code-reviewer 是否给出通过结论"""
    # 读最新评审报告 → 结论为"通过"或"有条件通过" → 归零
    # 存在 P0 问题 → 未归零
```

---

## 阻断处理

以下情况停下来报告用户，不要自动跳过：

| 阻断条件 | 报告内容 |
|---------|---------|
| gate.sh check 不通过 | 缺失哪个上游阶段 |
| review >3 轮不归零 | 卡在什么问题，请用户决策 |
| gate.sh pre/post 不通过 | 编码验证失败详情 |

---

## 完成报告

```python
memory_search_summaries(query="pipeline-<模块>-<日期>", tags="conductor")
# 读取最终状态，确认全部完成

print("""
🎉 Conductor 完成
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  模块: {module}
  任务: {task}

  [PRD]        ✅
  [架构]       ✅
  [详细设计]   ✅
  [编码]       ✅
  [代码评审]   ✅

  记忆: pipeline 已归档（status=completed）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
""")
```
