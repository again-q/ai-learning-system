#!/bin/bash
# ============================================================
# Gatekeeper PreToolUse Hook
#
# 被 Reasonix 的 PreToolUse 生命周期钩子调用。
# 在每次 edit_file / write_file 执行前检查阶段门禁。
#
# 工作方式：
#   1. 从 stdin 读取 JSON 事件（toolName, toolArgs, cwd）
#   2. 如果 tool 是 edit_file / write_file：
#      - 检查 doc/.gate/detailed.pass 是否存在
#      - 不存在 → exit 2 阻断
#      - 存在 → exit 0 放行
#   3. 其他工具始终放行
#
# AI 完全无法绕过此钩子——它在 Reasonix 基础设施层运行。
# ============================================================

# 读取 stdin JSON
INPUT=$(cat)

# 提取工具名称
TOOL_NAME=$(echo "$INPUT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('toolName', ''))
" 2>/dev/null)

# 只拦截 edit_file 和 write_file
if [ "$TOOL_NAME" != "edit_file" ] && [ "$TOOL_NAME" != "write_file" ]; then
    exit 0  # 放行非编辑工具
fi

# 获取项目根目录（从 cwd 字段）
PROJECT_ROOT=$(echo "$INPUT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('cwd', '.'))
" 2>/dev/null)

# ---- 检查上游阶段门禁 ----
# 编码必须通过 详细设计 → 架构 → PRD 逐级依赖
# 三个标记都齐了才放行，防止手动创建标记绕过
UPSTREAM_GATES=("prd" "arch" "detailed")
ALL_PASSED=true
MISSING_STAGES=""

for stage in prd arch detailed; do
    pass_file="$PROJECT_ROOT/doc/.gate/$stage.pass"
    if [ ! -f "$pass_file" ]; then
        ALL_PASSED=false
        MISSING_STAGES="$MISSING_STAGES  [$stage] ❌ 未完成\n"
    fi
done

if [ "$ALL_PASSED" = true ]; then
    exit 0  # 所有上游阶段通过，放行
fi

# === 阻断 ===
# 收集全量状态
STAGE_STATUS=""
for stage in prd arch detailed code review; do
    pass_file="$PROJECT_ROOT/doc/.gate/$stage.pass"
    if [ -f "$pass_file" ]; then
        STAGE_STATUS="$STAGE_STATUS  [$stage] ✅ 通过\n"
    else
        STAGE_STATUS="$STAGE_STATUS  [$stage] ❌ 未完成\n"
    fi
done

# 提取被编辑的文件路径
FILE_PATH=$(echo "$INPUT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
args = data.get('toolArgs', {})
print(args.get('path', args.get('filePath', '(unknown)')))
" 2>/dev/null")

# 输出阻断消息到 stderr（会被 Reasonix 捕获并展示给 AI）
cat >&2 <<BLOCKMSG

⛔ Gatekeeper Hook 阻断：上游设计阶段未全部完成
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  工具: $TOOL_NAME
  目标文件: $FILE_PATH

  当前管道进度：
$(echo -e "$STAGE_STATUS")

  缺失的上游阶段：
$(echo -e "$MISSING_STAGES")

  前置条件：PRD → 架构 → 详细设计 三个阶段全部通过后才能编码。

  每个阶段流程:
    1. run_skill <阶段 skill>
    2. run_skill review-expert 评审
    3. 修复问题 → 归零
    4. bash scripts/gate.sh pass <阶段名>

  三个阶段全部通过后，门禁将放行编辑。
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BLOCKMSG

exit 2  # exit 2 = 阻断
