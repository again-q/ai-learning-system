#!/bin/bash
# ============================================================
# 统一门禁 CLI — 五个阶段的一站式管理
# 合并 doc-gate.sh（阶段门禁）和 verify-coding.sh（编码验证）
#
# 用法:
#   bash gate.sh check <stage>          检查能否进入阶段
#   bash gate.sh unpass <stage> [原因]  撤销通过标记
#   bash gate.sh pass <stage>           标记阶段完成
#   bash gate.sh status                 查看全阶段状态
#   bash gate.sh pre <模块> [文档...]   编码前验证
#   bash gate.sh post <模块> <报告>     编码后验证
#   bash gate.sh clean <模块>           清除验证记录
# ============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

usage() {
    cat <<'USAGE'
用法: bash gate.sh <命令> [参数...]

用户命令（阶段门禁）:
  check <stage>          检查能否进入某阶段
  unpass <stage> [原因]  撤销阶段通过标记（评审未通过时）
  pass <stage> [--force] 标记阶段完成（--force 跳过评审提醒）
  status                 查看全阶段状态

新会话验证:
  verify                  完整性验证（新 AI 的第一件事）

理解确认命令:
  confirm-understanding  标记 AI 已复述需求并获得用户确认
  revoke-understanding   撤销理解确认标记

绕过命令（仅限人工终端操作，AI 无法绕过）:
  allow-write            【交互式】提示用户在终端输入 yes，临时放行写操作（60分钟有效）
  revoke-write           撤销 allow-write 放行

编码命令（gatekeeper 内部使用）:
  pre <模块> [文档...]    编码前验证
  post <模块> <核对报告>  编码后验证（支持 --project/--title/--files/--tags）
  clean <模块>            清除验证记录

阶段: prd arch detailed code review
USAGE
    exit 1
}

CMD="${1:-}"
[ -z "$CMD" ] && usage
shift

# ---- allow-write / revoke-write（用户交互式确认，AI 无法绕过） ----
if [ "$CMD" = "allow-write" ] || [ "$CMD" = "revoke-write" ]; then
    SCRIPT_DIR_ABS="$(cd "$SCRIPT_DIR" && pwd)"
    PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
    GATE_DIR="$PROJECT_ROOT/doc/.gate"
    mkdir -p "$GATE_DIR"

    if [ "$CMD" = "allow-write" ]; then
        # 支持 allow-write N（N 次放行），默认 1 次
        USES="${1:-1}"
        # 校验 N 是否为正整数
        if ! echo "$USES" | grep -qE '^[1-9][0-9]*$'; then
            echo "用法: bash gate.sh allow-write [次数]"
            echo "  次数: 正整数，默认 1"
            exit 1
        fi
        echo ""
        echo "╔════════════════════════════════════════════════════╗"
        echo "║  🔓 临时放行写操作                                ║"
        echo "╚════════════════════════════════════════════════════╝"
        echo ""
        echo "AI 请求 $USES 次放行，次数用完自动销毁。"
        echo "请在下方输入 yes 确认："
        echo ""
        /bin/echo -n "> "
        read USER_INPUT < /dev/tty
        if [ "$USER_INPUT" = "yes" ]; then
            {
                echo "ACK:YES"
                echo "USES:$USES"
            } > "$GATE_DIR/allow-write.token"
            echo ""
            echo "✅ 已放行 $USES 次，用完即焚。"
            echo "完成后可运行：bash $SCRIPT_DIR_ABS/gate.sh revoke-write"
        else
            echo ""
            echo "❌ 已取消。"
            exit 1
        fi
    elif [ "$CMD" = "revoke-write" ]; then
        rm -f "$GATE_DIR/allow-write.token"
        echo "✅ allow-write 已撤销。"
    fi
    exit 0
fi

# 在子 shell 中执行，防止旧脚本的 exit 退出当前 shell
case "$CMD" in
    check|unpass|pass|status)
        source "$SCRIPT_DIR/doc-gate.sh"
        ("do_${CMD}" "$@")
        ;;
    pre|post|clean)
        source "$SCRIPT_DIR/verify-coding.sh"
        ("do_${CMD}" "$@")
        ;;
    confirm-understanding)
        source "$SCRIPT_DIR/doc-gate.sh"
        do_confirm_understanding
        ;;
    revoke-understanding)
        source "$SCRIPT_DIR/doc-gate.sh"
        do_revoke_understanding
        ;;
    verify)
        source "$SCRIPT_DIR/doc-gate.sh"
        do_verify
        ;;
    *)
        usage
        ;;
esac
