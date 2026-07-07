#!/bin/bash
# ============================================================
# 文档阶段门禁
# 管理五个阶段的进入条件和完成标记
# 用法:
#   bash doc-gate.sh check <stage>     检查能否进入阶段
#   bash doc-gate.sh unpass <stage>    撤销通过标记（评审未通过时）
#   bash doc-gate.sh pass <stage>      标记阶段完成
#   bash doc-gate.sh status            查看全阶段状态
# ============================================================
set -e

GATE_DIR="doc/.gate"
DOC_DIR="doc"

ensure_gate_dir() {
    mkdir -p "$GATE_DIR"
}

# ---- 阶段定义（兼容 bash 3.2，macOS 默认） ----
_upstream_of() {
    case "$1" in
        prd)     echo "" ;;
        arch)    echo "prd" ;;
        detailed) echo "arch" ;;
        code)    echo "detailed" ;;
        review)  echo "code" ;;
        *)       echo "" ;;
    esac
}
_output_of() {
    case "$1" in
        prd)     echo "$DOC_DIR/prd/*.md" ;;
        arch)    echo "$DOC_DIR/arch/*.md" ;;
        detailed) echo "$DOC_DIR/detailed/*.md" ;;
        code)    echo "src/" ;;
        review)  echo "$DOC_DIR/review/*_代码评审报告.md" ;;
        *)       echo "" ;;
    esac
}

# ---- check ----
do_check() {
    local stage="$1"

    if [ -z "$stage" ]; then
        echo "用法: bash doc-gate.sh check <stage>"
        echo "阶段: prd arch detailed code review"
        exit 1
    fi

    local upstream
    upstream=$(_upstream_of "$stage")
    local output_pattern
    output_pattern=$(_output_of "$stage")

    echo "=========================================="
    echo " 🔍 [阶段门禁] 检查: $stage"
    echo "=========================================="

    # 查上游是否通过
    if [ -n "$upstream" ]; then
        local upstream_gate="$GATE_DIR/${upstream}.pass"
        if [ ! -f "$upstream_gate" ]; then
            echo "  ❌ 上游阶段 [$upstream] 未完成"
            echo "     缺少: $upstream_gate"
            echo "     请先完成 $upstream 阶段并通过评审"
            exit 1
        fi
        echo "  ✅ 上游 [$upstream] 已通过"
    fi

    # 查当前阶段是否被阻塞（评审未通过）
    local blocked_file="$GATE_DIR/${stage}.blocked"
    if [ -f "$blocked_file" ]; then
        echo "  🔴 本阶段已被阻断"
        echo "     原因: $(cat "$blocked_file")"
        echo "     请先修复问题，然后执行: bash doc-gate.sh pass $stage"
        exit 1
    fi

    # 查下游阶段是否存在已完成的（防止倒退）
    local downstream_blocked=false
    for s in prd arch detailed code review; do
        local g="$GATE_DIR/${s}.pass"
        if [ "$s" = "$stage" ]; then
            break
        fi
        if [ -f "$g" ]; then
            echo "  ⚠️  下游 [$s] 已完成，不能倒退修改"
            downstream_blocked=true
        fi
    done

    echo ""
    echo "  ✅ 可以进入 [$stage] 阶段"
}

# ---- unpass ----
do_unpass() {
    local stage="$1"
    shift
    local reason="$*"

    if [ -z "$stage" ]; then
        echo "用法: bash doc-gate.sh unpass <stage> [原因...]"
        echo "阶段: prd arch detailed code review"
        exit 1
    fi

    ensure_gate_dir

    local gate_file="$GATE_DIR/${stage}.pass"
    if [ ! -f "$gate_file" ]; then
        echo "  ⏭️  [$stage] 尚未通过，无需撤销"
        exit 0
    fi

    # 记录阻断原因
    local ts
    ts=$(date '+%Y-%m-%d %H:%M:%S')
    echo "$ts | $reason" > "$GATE_DIR/${stage}.blocked"

    # 删除通过标记
    rm "$gate_file"

    echo "  🔄 [$stage] 已撤销通过标记"
    echo "    原因: ${reason:-未指定}"
    echo ""
    echo "  请修复问题后重新:"
    echo "    bash doc-gate.sh pass $stage"
}

# ---- 下一阶段提示 ----
next_stage_hint() {
    case "$1" in
        prd)     echo "bash gate.sh check arch → 使用 system-architect 写架构文档" ;;
        arch)    echo "bash gate.sh check detailed → 使用 task-decomposer 写详细设计" ;;
        detailed) echo "bash gate.sh check code → 使用 gatekeeper skill 编码（需 gate.sh pre 开始）" ;;
        review) echo "🎉 所有阶段已完成，管道结束" ;;
        *)       echo "未知阶段" ;;
    esac
}

# ---- pass ----
do_pass() {
    local stage="$1"
    local force="$2"  # --force 跳过评审提醒

    if [ -z "$stage" ]; then
        echo "用法: bash doc-gate.sh pass <stage> [--force]"
        echo "阶段: prd arch detailed review"
        exit 1
    fi

    # code 阶段由 verify-coding.sh 管理，不走 doc-gate pass
    if [ "$stage" = "code" ]; then
        echo "⏭️  code 阶段由 verify-coding.sh post 管理，无需手动标记"
        exit 0
    fi

    # 检查是否已完成 review-expert 评审
    local review_pattern=""
    case "$stage" in
        prd)     review_pattern="*需求评审报告*" ;;
        arch)    review_pattern="*架构评审报告*" ;;
        detailed) review_pattern="*详设评审报告*" ;;
        review)  review_pattern="*代码评审报告*" ;;
    esac
    if [ -n "$review_pattern" ]; then
        if ! ls $DOC_DIR/review/$review_pattern 2>/dev/null | grep -q .; then
            echo "  ⚠️  未在 doc/review/ 找到对应的评审报告"
            echo "    期望: doc/review/$review_pattern"
            echo "    建议先使用 review-expert 完成评审，或用 --force 跳过此提醒"
            echo ""
            # 询问是否强制通过
            if [ "$force" != "--force" ]; then
                echo "  使用 bash gate.sh pass $stage --force 可跳过评审提醒"
                echo "  是否继续? (y/N): "
                read -r confirm
                if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
                    echo "  ⏹️  已取消"
                    exit 1
                fi
            fi
        fi
    fi

    ensure_gate_dir

    local gate_file="$GATE_DIR/${stage}.pass"
    if [ -f "$gate_file" ]; then
        echo "  ⏭️  [$stage] 已完成，跳过"
        exit 0
    fi

    # 产出物检查
    local output_pattern
    output_pattern=$(_output_of "$stage")
    local has_output=false
    case "$stage" in
        prd|arch|detailed)
            if ls $output_pattern 2>/dev/null | grep -q .; then
                has_output=true
            fi
            ;;
        review)
            if ls $output_pattern 2>/dev/null | grep -q .; then
                has_output=true
            fi
            ;;
    esac

    if [ "$has_output" = false ]; then
        echo "  ❌ 未找到 [$stage] 阶段的产出物"
        echo "     期望: $output_pattern"
        exit 1
    fi

    # 清除阻断记录（如果有）
    rm -f "$GATE_DIR/${stage}.blocked"

    echo "$(date '+%Y-%m-%d %H:%M:%S')" > "$gate_file"
    echo "  ✅ [$stage] 阶段通过，已标记完成"
    echo ""
    echo "  下一阶段: $(next_stage_hint $stage)"
}

# ---- status ----
do_status() {
    ensure_gate_dir

    echo "=========================================="
    echo " 📋 阶段门禁状态"
    echo "=========================================="
    echo ""

    local all_done=true
    for s in prd arch detailed code review; do
        local gate_file="$GATE_DIR/${s}.pass"
        local output_pattern
        output_pattern=$(_output_of "$s")
        local has_output=false

        case "$s" in
            prd|arch|detailed)
                if ls $output_pattern 2>/dev/null | grep -q .; then
                    has_output=true
                fi
                ;;
            review)
                if ls $output_pattern 2>/dev/null | grep -q .; then
                    has_output=true
                fi
                ;;
            code)
                if [ -d "src" ]; then
                    has_output=true
                fi
                ;;
        esac

        local gate_status
        local blocked_file="$GATE_DIR/${s}.blocked"
        if [ -f "$gate_file" ]; then
            gate_status="✅ 通过 ($(cat "$gate_file"))"
        elif [ -f "$blocked_file" ]; then
            gate_status="🔴 阻断 ($(cat "$blocked_file"))"
            all_done=false
        else
            gate_status="⏳ 未完成"
            all_done=false
        fi

        printf "  %-10s  产出: %-5s  门禁: %s\n" "[$s]" "$( $has_output && echo '有' || echo '无' )" "$gate_status"
    done

    echo ""
    if [ "$all_done" = true ]; then
        echo " 🎉 所有阶段已完成"
    else
        echo " 💡 仍有阶段未完成"
    fi
}

# ---- main (仅在直接执行时触发，source 时不触发) ----
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
case "${1:-}" in
    check)
        shift; do_check "$@"
        ;;
    unpass)
        shift; do_unpass "$@"
        ;;
    pass)
        shift; do_pass "$@"
        ;;
    status)
        do_status
        ;;
    *)
        echo "用法:"
        echo "  bash doc-gate.sh check <stage>     检查能否进入阶段"
        echo "  bash doc-gate.sh unpass <stage>    撤销通过标记（评审未通过时）"
        echo "  bash doc-gate.sh pass <stage>      标记阶段完成"
        echo "  bash doc-gate.sh status            查看全阶段状态"
        echo ""
        echo "阶段: prd arch detailed code review"
        echo ""
        echo "示例:"
        echo "  bash doc-gate.sh unpass detailed \"P0:字段类型与DDL不一致\""
        exit 1
        ;;
esac
fi
