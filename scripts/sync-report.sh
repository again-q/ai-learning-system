#!/bin/bash
# ============================================================
# 知识库同步报告生成器 v1.0
#
# 用途：当你在本项目中修改文件后，运行此脚本生成一份
#       清晰的同步报告，告诉你：
#       - 哪些文件有变更
#       - 变更摘要
#       - 哪些需要同步到 knowledge-base/
#       - 哪些需要同步到外部知识库平台
#
# 用法:
#   bash scripts/sync-report.sh               生成同步报告
#   bash scripts/sync-report.sh --help        查看帮助
#   bash scripts/sync-report.sh --apply       同时更新 knowledge-base/
# ============================================================
set -e

show_help() {
    echo "用法: bash scripts/sync-report.sh [选项]"
    echo ""
    echo "选项:"
    echo "  --help       显示帮助"
    echo "  --apply      将变更文件同步到 knowledge-base/"
    echo ""
    echo "输出: 一份 Markdown 同步报告"
    exit 0
}

for arg in "$@"; do
    [ "$arg" = "--help" ] && show_help
done

APPLY_ARG="false"
for arg in "$@"; do
    [ "$arg" = "--apply" ] && APPLY_ARG="true"
done

# 生成一个临时 Python 脚本，避免引号嵌套问题
TMP_PY=$(mktemp /tmp/sync-report-$$.XXXXXX.py)
trap 'rm -f "$TMP_PY"' EXIT

cat > "$TMP_PY" << 'PYEOF'
import json, os, subprocess, sys

config_path = "config/sync-config.json"
if not os.path.exists(config_path):
    config_path = "sync-config.json"  # 兼容旧路径
kb_dir = "knowledge-base"
apply = "--apply" in sys.argv

if not os.path.exists(config_path):
    print("ERROR: 未找到 config/sync-config.json，请确保运行在项目根目录")
    sys.exit(1)

with open(config_path, encoding="utf-8") as f:
    config = json.load(f)

def get_changed():
    r1 = subprocess.run(["git", "diff", "--name-only", "HEAD"], capture_output=True, text=True)
    r2 = subprocess.run(["git", "diff", "--name-only", "--cached"], capture_output=True, text=True)
    files = set()
    for line in (r1.stdout + r2.stdout).split("\n"):
        line = line.strip()
        if line:
            files.add(line)
    return sorted(files)

def get_diff(filepath):
    r1 = subprocess.run(["git", "diff", "HEAD", "--", filepath], capture_output=True, text=True)
    r2 = subprocess.run(["git", "diff", "--cached", "--", filepath], capture_output=True, text=True)
    diff = r1.stdout + r2.stdout
    added = sum(1 for l in diff.split("\n") if l.startswith("+") and not l.startswith("+++"))
    removed = sum(1 for l in diff.split("\n") if l.startswith("-") and not l.startswith("---"))
    return added, removed, diff

changed = get_changed()

# 构建映射
source_map = {}
for gk, gv in config.get("groups", {}).items():
    for f in gv.get("files", []):
        s = f["source"]
        cat = f["category"]
        kb_path = os.path.join(kb_dir, cat, os.path.basename(s))
        source_map[s] = {
            "kb_path": kb_path,
            "external": f.get("external", s),
            "group_label": gv.get("label", ""),
            "group_key": gk,
        }

# 匹配变更
matched, unmatched = [], []
for cf in changed:
    if cf in source_map:
        matched.append(cf)
    else:
        bn = os.path.basename(cf)
        found = False
        for src in source_map:
            if os.path.basename(src) == bn:
                matched.append(src)
                found = True
                break
        if not found:
            unmatched.append(cf)

output = []
def o(s=""):
    output.append(s)

o()
o("╔════════════════════════════════════════════════════╗")
o("║  📋 知识库同步报告                                 ║")
o("╚════════════════════════════════════════════════════╝")
o()
o("项目: " + os.path.basename(os.getcwd()))
o("范围: 未提交的变更（working tree + staged）")
o("时间: " + __import__("datetime").datetime.now().strftime("%Y-%m-%d %H:%M"))
o()
o("### 📊 变更摘要")
o()
o("| 指标 | 数量 |")
o("|------|------|")
o("| 同步配置中映射的文件总数 | %d |" % len(source_map))
o("| 本次有变更的映射文件 | **%d** |" % len(matched))
o("| 有变更但不在映射中 | %d |" % len(unmatched))
o()

if len(matched) == 0 and len(unmatched) == 0:
    o("✅ **没有检测到任何变更，知识库已是最新。**")
    print("\n".join(output))
    sys.exit(0)

if matched:
    o("---")
    o("## 🔄 需要同步的变更")
    o()

    by_group = {}
    for cf in matched:
        by_group.setdefault(source_map[cf]["group_key"], []).append(cf)

    for gk, gv in config.get("groups", {}).items():
        if gk not in by_group:
            continue
        flist = by_group[gk]
        o("### " + gv["label"])
        o()

        for cf in flist:
            info = source_map[cf]
            added, removed, diff = get_diff(cf)

            if added > 0 and removed == 0:
                icon = "🟢 纯新增"
            elif removed > 0 and added == 0:
                icon = "🔴 纯删除"
            else:
                icon = "🟡 修改"

            kb_path = info["kb_path"]
            kb_exists = os.path.exists(kb_path)

            o("#### 📄 " + cf)
            o()
            o("- **变更**: " + icon + " +%d/-%d 行" % (added, removed))
            o("- **knowledge-base/**: `%s` %s" % (kb_path, "✅ 存在" if kb_exists else "❌ 缺失"))
            o("- **外部知识库**: " + info["external"])
            o()

            if diff.strip():
                diff_lines = diff.split("\n")
                for i, dl in enumerate(diff_lines):
                    if len(dl) > 300:
                        diff_lines[i] = dl[:300] + "..."
                diff_text = "\n".join(diff_lines)

                o("<details>")
                o("<summary>📝 变更内容（%d 新增 / %d 删除）</summary>" % (added, removed))
                o()
                o("```diff")
                o(diff_text)
                o("```")
                o("</details>")
                o()

    if apply:
        synced = []
        o("---")
        o("### ✅ knowledge-base/ 同步结果")
        o()
        for cf in matched:
            info = source_map[cf]
            src_path = cf
            dst = info["kb_path"]
            if os.path.exists(src_path):
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                subprocess.run(["cp", src_path, dst], check=True)
                synced.append(cf)
                o("- ✅ `%s` → `%s`" % (cf, dst))
            else:
                o("- ⚠️  `%s` 源文件不存在，跳过" % cf)
        o()
        o("共同步 **%d** 个文件到 knowledge-base/" % len(synced))

if unmatched:
    o("---")
    o("### ⚠️ 未映射的变更文件")
    o()
    o("以下文件有变更但不在 `sync-config.json` 映射中。如需同步请更新 `sync-config.json`。")
    o()
    for f in unmatched:
        o("- `%s`" % f)
    o()

if matched:
    o("---")
    o("## 📤 外部知识库同步步骤")
    o()
    o("请按以下步骤更新您的 Notion/飞书/语雀等外部平台：")
    o()
    for cf in matched:
        info = source_map[cf]
        o("1. **" + info["external"] + "**")
        o("   - 源文件: `" + cf + "`")
        o("   - 点开上方 <details> 查看变更内容")
    o()

print("\n".join(output))
PYEOF

# 执行 Python 脚本，传递 apply 参数
PY_ARGS=""
[ "$APPLY_ARG" = "true" ] && PY_ARGS="--apply"
exec python3 "$TMP_PY" $PY_ARGS