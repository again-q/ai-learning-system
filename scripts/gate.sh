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
    *)
        usage
        ;;
esac
