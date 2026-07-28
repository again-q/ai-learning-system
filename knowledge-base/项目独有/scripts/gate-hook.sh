#!/bin/bash
# ============================================================
# Gatekeeper PreToolUse Hook — v2 (硬化的)
#
# 被 Reasonix 的 PreToolUse 生命周期钩子调用。
# 在每次 edit_file / write_file / bash（含写入操作）执行前检查阶段门禁。
#
# 工作方式：
#   1. 从 stdin 读取 JSON 事件（toolName, toolArgs, cwd）
#   2. edit_file / write_file → 直接检查门禁
#   3. bash → 解析 command，检测是否含写入操作
#      - 写入特征：> >> tee python3写模式 sed -i cp mv 等
#      - 只读命令（ls/grep/find/echo head 等）直接放行
#   4. 其他工具始终放行
#
# AI 无法绕过——即使通过 bash 调 python 写文件，也会被检测并阻断。
# ============================================================

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('toolName', ''))
" 2>/dev/null)

BASH_COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
args = data.get('toolArgs', {})
if isinstance(args, dict):
    print(args.get('command', ''))
else:
    print('')
" 2>/dev/null)


# ---- 判断是否要检查门禁 ----
SHOULD_CHECK=false

if [ "$TOOL_NAME" = "edit_file" ] || [ "$TOOL_NAME" = "write_file" ]; then
    SHOULD_CHECK=true
elif [ "$TOOL_NAME" = "bash" ]; then
    # 检测 bash 命令是否包含文件写入操作
    if echo "$BASH_COMMAND" | grep -qE '(^|[;&|])\s*(cat|echo|printf|tee|python3|python)\s+.*(>|>>)'; then
        SHOULD_CHECK=true
    elif echo "$BASH_COMMAND" | grep -qE '(^|[;&|])\s*sed\s+-i'; then
        SHOULD_CHECK=true
    elif echo "$BASH_COMMAND" | grep -qE '(^|[;&|])\s*(dd|truncate|install|cp)\s+'; then
        SHOULD_CHECK=true
    elif echo "$BASH_COMMAND" | grep -qE '>>?\s+/[A-Za-z]'; then
        SHOULD_CHECK=true
    elif echo "$BASH_COMMAND" | grep -qE "(python3|python)[^\"']*['\"]w['\"]|\.write\(|open\(.*['\"]w['\"]"; then
        SHOULD_CHECK=true
    elif echo "$BASH_COMMAND" | grep -qE '\\bmv\\b'; then
        SHOULD_CHECK=true
    # v3: 拦截对 doc/.gate/ 的操作（防 AI 自建门禁标记）
    elif echo "$BASH_COMMAND" | grep -qE 'gate'; then
        SHOULD_CHECK=true
    fi
fi

if [ "$SHOULD_CHECK" = false ]; then
    exit 0
fi

# ---- 获取项目根目录 ----
PROJECT_ROOT=$(echo "$INPUT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data.get('cwd', '.'))
" 2>/dev/null)

# ---- 检查 allow-write 令牌（优先于阶段门禁） ----
ALLOW_WRITE_FILE="$PROJECT_ROOT/doc/.gate/allow-write.token"
ALLOW_WRITE_VALID=false
if [ -f "$ALLOW_WRITE_FILE" ]; then
    USES=$(grep '^USES:' "$ALLOW_WRITE_FILE" 2>/dev/null | cut -d: -f2)
    if [ -n "$USES" ] && [ "$USES" -ge 1 ] 2>/dev/null; then
        ALLOW_WRITE_VALID=true
    else
        rm -f "$ALLOW_WRITE_FILE" 2>/dev/null
    fi
fi

if [ "$ALLOW_WRITE_VALID" = true ]; then
    # 递减剩余次数，归零则销毁
    USES=$(grep '^USES:' "$ALLOW_WRITE_FILE" 2>/dev/null | cut -d: -f2)
    if [ -z "$USES" ] || [ "$USES" -le 1 ] 2>/dev/null; then
        rm -f "$ALLOW_WRITE_FILE"
    else
        REMAIN=$((USES - 1))
        # 原地更新 USES 值
        sed -i '' "s/^USES:$USES\$/USES:$REMAIN/" "$ALLOW_WRITE_FILE" 2>/dev/null
    fi
    exit 0
fi

# ---- 检查上游阶段门禁 ----

ALL_PASSED=true
MISSING_STAGES=""

for stage in prd arch detailed; do
    pass_file="$PROJECT_ROOT/doc/.gate/$stage.pass"
    # v3: 不再只检查文件存在，要求文件内容包含 ACK 签名
    if [ ! -f "$pass_file" ] || ! grep -q '^ACK:YES$' "$pass_file" 2>/dev/null; then
        ALL_PASSED=false
        MISSING_STAGES="$MISSING_STAGES  [$stage] ❌ 未完成\n"
    fi
done

UNDERSTANDING_FILE="$PROJECT_ROOT/doc/.gate/understanding.confirmed"
UNDERSTANDING_CONFIRMED=false
if [ -f "$UNDERSTANDING_FILE" ] && grep -q '^ACK:YES$' "$UNDERSTANDING_FILE" 2>/dev/null; then
    UNDERSTANDING_CONFIRMED=true
fi

if [ "$ALL_PASSED" = true ] && [ "$UNDERSTANDING_CONFIRMED" = true ]; then
    exit 0
fi

# === 阻断 ===
STAGE_STATUS=""
for stage in prd arch detailed code review; do
    pass_file="$PROJECT_ROOT/doc/.gate/$stage.pass"
    if [ -f "$pass_file" ]; then
        STAGE_STATUS="$STAGE_STATUS  [$stage] ✅ 通过\n"
    else
        STAGE_STATUS="$STAGE_STATUS  [$stage] ❌ 未完成\n"
    fi
done

UNDERSTANDING_STATUS=""
if [ "$UNDERSTANDING_CONFIRMED" = false ]; then
    UNDERSTANDING_STATUS="  🧠 理解确认: ❌ 未确认 — 请先复述需求并执行 bash gate.sh confirm-understanding\n"
fi

echo ""
echo "╔════════════════════════════════════════════════════╗"
echo "║  ❌ 编码门禁阻断 — 条件不满足                      ║"
echo "╚════════════════════════════════════════════════════╝"
echo ""
echo -e "📋 门禁状态:\n$STAGE_STATUS"
echo -e "$UNDERSTANDING_STATUS"
if [ -n "$MISSING_STAGES" ]; then
    echo -e "⚠️  缺少上游阶段:\n$MISSING_STAGES"
fi
echo ""
echo "💡 处理步骤:"
echo "  ① 先请用户用 ask() 弹窗确认是否批准放行"
echo "  ② 用户批准后，在终端复制粘贴下面命令运行（不用 cd）："
echo ""
echo "     bash $PROJECT_ROOT/scripts/gate.sh allow-write"
echo ""
echo "  ③ 在终端提示符 > 后面输入 yes 按回车"
echo "  ④ 通知 AI 重新尝试被拦的操作"
echo ""
echo "🔒 绝对门禁：所有阶段必须完成才能编辑。无例外。"
exit 2
