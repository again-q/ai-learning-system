#!/bin/bash
# ============================================================
# AI 编码验证门禁
# 强制 AI 在编码前后执行核对，不通过则阻断
# 弱模型也绕不过 —— 报错就是报错
# ============================================================
set -e

VERIFY_DIR=".verify"
DOC_DIR="doc"

usage() {
    echo "用法:"
    echo "  编码前验证:  $0 pre <模块名> [相关文档名...]"
    echo "  编码后验证:  $0 post <模块名> <核对报告> [memory 参数]"
    echo ""
    echo "示例:"
    echo "  $0 pre user-service doc/detailed/user_service.md"
    echo "  $0 post user-service 'biz=ok urls=ok params=ok entity=ok no-drift=yes'"
    echo "  $0 post user-service 'biz=ok urls=ok params=ok entity=ok no-drift=yes' \\"
    echo "       --project web-app --title '用户登录' --files 'src/a.py' --tags 'auth,jwt'"
    echo ""
    echo "核对报告格式（空格分隔的 key=value）:"
    echo "  biz=ok      业务逻辑与文档一致"
    echo "  urls=ok     接口 URL 与文档一致"
    echo "  params=ok   请求/响应参数与文档一致"
    echo "  entity=ok   实体与表结构字段对齐"
    echo "  no-drift=yes 无文档未定义的自由发挥代码"
    echo ""
    echo "Memory 参数（可选，通过后自动输出 memory_save_summary 调用模板）:"
    echo "  --project    项目名称"
    echo "  --title      任务标题"
    echo "  --files      修改的文件路径（逗号分隔）"
    echo "  --tags       标签（逗号分隔）"
    echo "  --module     模块名"
    exit 1
}

# ---------- 前置验证 ----------
do_pre() {
    local module="$1"
    shift
    local doc_files=("$@")

    if [ -z "$module" ]; then
        echo "❌ 必须指定模块名"
        usage
    fi

    echo "=========================================="
    echo " 🔍 [前置验证] 模块: $module"
    echo "=========================================="

    # 检查 doc/ 目录是否存在
    if [ ! -d "$DOC_DIR" ]; then
        echo "❌ 未找到 doc/ 目录，请确认设计文档已就位"
        exit 1
    fi

    # 检查指定的文档是否存在
    if [ ${#doc_files[@]} -eq 0 ]; then
        echo "⚠️  未指定相关文档，将搜索 doc/ 目录..."
        found=$(find "$DOC_DIR" -type f -name "*.md" | head -20)
        echo "找到以下文档:"
        echo "$found"
        echo ""
        echo "请在运行 post 验证前确认已阅读相关文档"
    else
        echo "检查指定文档..."
        for doc in "${doc_files[@]}"; do
            if [ -f "$doc" ]; then
                echo "  ✅ $doc"
            else
                echo "  ❌ 未找到: $doc"
                exit 1
            fi
        done
    fi

    mkdir -p "$VERIFY_DIR"
    echo "pre_verified=true" > "$VERIFY_DIR/$module.ini"
    echo "module=$module" >> "$VERIFY_DIR/$module.ini"
    echo "timestamp=$(date '+%Y-%m-%d %H:%M:%S')" >> "$VERIFY_DIR/$module.ini"
    echo ""
    echo "✅ 前置验证通过，可以开始编码"
    echo "   编码完成后请运行: $0 post $module '<核对报告>'"
}

# ---------- 后置验证 ----------
do_post() {
    local module="$1"
    local report="$2"
    shift 2

    # Parse optional memory fields
    local mem_project=""
    local mem_title=""
    local mem_files=""
    local mem_tags=""
    local mem_module=""
    while [ $# -gt 0 ]; do
        case "$1" in
            --project)    mem_project="$2";  shift 2 ;;
            --title)      mem_title="$2";    shift 2 ;;
            --files)      mem_files="$2";    shift 2 ;;
            --tags)       mem_tags="$2";     shift 2 ;;
            --module)     mem_module="$2";   shift 2 ;;
            *) shift ;;
        esac
    done

    if [ -z "$module" ] || [ -z "$report" ]; then
        echo "❌ 必须指定模块名和核对报告"
        usage
    fi

    if [ ! -f "$VERIFY_DIR/$module.ini" ]; then
        echo "❌ 未找到前置验证记录，请先运行: $0 pre $module"
        exit 1
    fi

    echo "=========================================="
    echo " ✅ [后置验证] 模块: $module"
    echo "=========================================="

    # 解析核对报告
    local checks=""
    for pair in $report; do
        checks="$checks $pair"
    done

    # 定义必须通过的维度
    required=("biz" "urls" "params" "entity" "no-drift")
    all_pass=true

    echo ""
    echo "--- 四维核对结果 ---"
    for check in "${required[@]}"; do
        # 从 checks 中提取该维度的值
        local val=""
        for pair in $checks; do
            key="${pair%%=*}"
            if [ "$key" = "$check" ]; then
                val="${pair#*=}"
                break
            fi
        done
        case "$check" in
            biz)     label="① 业务逻辑与文档一致" ;;
            urls)    label="② 接口 URL 与文档一致" ;;
            params)  label="③ 请求/响应参数与文档一致" ;;
            entity)  label="④ 实体与表结构字段对齐" ;;
            no-drift) label="⑤ 无文档未定义的自由发挥代码" ;;
        esac

        if [ "$val" = "ok" ] || [ "$val" = "yes" ]; then
            echo "  ✅ $label"
        elif [ -z "$val" ]; then
            echo "  ❌ $label —— 未确认"
            all_pass=false
        else
            echo "  ❌ $label —— $val"
            all_pass=false
        fi
    done

    echo ""
    if [ "$all_pass" = true ]; then
        local ts
        ts=$(date '+%Y-%m-%d %H:%M:%S')
        mkdir -p "$VERIFY_DIR"

        cat > "$VERIFY_DIR/$module.post.ini" <<EOF
post_passed=true
timestamp=$ts
mem_project=$mem_project
mem_title=$mem_title
mem_files=$mem_files
mem_tags=$mem_tags
mem_module=$mem_module
EOF

        # 清除 pre-check 记录，强制下轮编辑重新走 pre 验证
        rm -f "$VERIFY_DIR/$module.ini"

        echo "✅ 所有核对通过，编码完成。"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "  → 自动推进到 code-reviewer 审查代码"
        echo "  → 归零后: bash scripts/gate.sh pass review"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""

        # 如果提供了 memory 字段，输出 memory_save_summary 调用模板
        if [ -n "$mem_project" ] || [ -n "$mem_title" ]; then
            local session_id
            session_id="session-$(date '+%Y%m%d')-${module}-${mem_title:-task}"
            # Clean session_id: lowercase, replace non-alphanum with hyphen
            session_id=$(echo "$session_id" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//')

            echo "📝 保存编码记忆（调 ai_memory memory_save_summary）："
            echo "    session_id: $session_id"
            echo "    task_title: ${mem_title:-$module}"
            echo "    project_name: $mem_project"
            echo "    file_paths: $mem_files"
            echo "    tags: ${mem_tags:-coding}"
            echo "    module: ${mem_module:-$module}"
            echo "    status: completed"
        fi
    else
        echo "❌ 部分核对未通过，编码阻断。请修复后重新运行验证。"
        echo "   核对报告格式: biz=ok urls=ok params=ok entity=ok no-drift=yes"
        exit 1
    fi
}

# ---------- 清理 ----------
do_clean() {
    local module="$1"
    if [ -f "$VERIFY_DIR/$module.ini" ]; then
        rm "$VERIFY_DIR/$module.ini"
    fi
    if [ -f "$VERIFY_DIR/$module.post.ini" ]; then
        rm "$VERIFY_DIR/$module.post.ini"
    fi
    echo "已清除 $module 的验证记录"
}

# ---------- 主入口（仅在直接执行时触发，source 时不触发）----------
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
case "${1:-}" in
    pre)
        shift; do_pre "$@"
        ;;
    post)
        shift; do_post "$@"
        ;;
    clean)
        shift; do_clean "$@"
        ;;
    *)
        usage
        ;;
esac
fi
