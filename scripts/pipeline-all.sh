#!/bin/bash
# pipeline-all.sh — 整本教材三 Agent 全自动管线
# 用法：bash scripts/pipeline-all.sh
# 失败/警告自动跳过，已完成的跳过去，一键跑完整本

set +e

PROJECT="$(cd "$(dirname "$0")/.." && pwd)"
INDEX="${PROJECT}/data/pipeline/agent2_extraction/knowledge_index.json"
FAILED="${PROJECT}/data/pipeline/_failed.log"
REVIEW="${PROJECT}/data/pipeline/_needs_review.log"

mkdir -p "${PROJECT}/data/pipeline/agent1_layout" "${PROJECT}/data/pipeline/agent2_extraction/nodes"

# 已完成的节
python3 -c "
import json
try:
    idx=json.load(open('${INDEX}'))
    for s in idx.get('sections',[]): print(s['section_id'])
except: pass
" > /tmp/_done.txt 2>/dev/null

echo "========================================="
echo "  教材知识图谱全自动管线"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================="

total=0 ok=0 skip_done=0 skip_fail=0 review=0 fail=0

for F in "${PROJECT}"/data/pipeline/sections/math_10_ch*.txt; do
    [ -f "$F" ] || continue
    BASENAME=$(basename "$F" .txt)
    
    # 从文件名提取 section_id：文件名去掉后缀就是，如 math_10_ch1_4
    SID=$(echo "$BASENAME" | cut -d"_" -f1-4)
    
    # 跳过已完成（用索引里的 node_ids 判断）
    if grep -q "\"${SID}\"" "${INDEX}" 2>/dev/null; then
        ((skip_done++)); continue
    fi
    # 跳过已失败
    if grep -q "^${SID} " "${FAILED}" 2>/dev/null; then
        ((skip_fail++)); continue
    fi
    
    total=$((total + 1))
    TITLE=$(head -2 "$F" | tail -1 | sed 's/^[0-9.]* //')
    
    echo ""
    echo "━━━ [${total}] ${SID} ${TITLE} ━━━"
    
    # Agent 1 — 如果已有版面文件就跳过
    echo "▶️  Agent 1 版面..."
    T1=$(date +%s)
    LAYOUT_FILE="${PROJECT}/data/pipeline/agent1_layout/${BASENAME}.md"
    if [ -f "$LAYOUT_FILE" ]; then
        echo "   ⏭️  已有，跳过"
        D1=0
    else
        qwenpaw agent chat \
          --from-agent default \
          --to-agent ai-learning-system-math-banmianfenxi-agent \
          --text "处理章节 ${SID}，输入 ${F}，输出到 ${PROJECT}/data/pipeline/agent1_layout/${BASENAME}.md" \
          2>&1 || true
        D1=$(( $(date +%s) - T1 ))
        if [ ! -f "$LAYOUT_FILE" ]; then
            echo "❌ Agent 1 失败 (${D1}s)"
            echo "${SID} agent1" >> "${FAILED}"
            ((fail++))
            continue
        fi
        echo "   ✅ (${D1}s)"
    fi
    
    # Agent 2 — 如果已有节点文件就跳过
    echo "▶️  Agent 2 提取..."
    T2=$(date +%s)
    NODE_FILE=$(ls -t "${PROJECT}/data/pipeline/agent2_extraction/nodes/${SID}"*.json 2>/dev/null | head -1)
    if [ -n "$NODE_FILE" ]; then
        echo "   ⏭️  已有，跳过"
        D2=0
    else
        qwenpaw agent chat \
          --from-agent default \
          --to-agent ai-learning-system-math-jiegouzhuanhua-agent \
          --text "从 ${LAYOUT_FILE} 提取知识点，section_id=${SID}，输出到 ${PROJECT}/data/pipeline/agent2_extraction/nodes/" \
          2>&1 || true
        D2=$(( $(date +%s) - T2 ))
        NODE_FILE=$(ls -t "${PROJECT}/data/pipeline/agent2_extraction/nodes/${SID}"*.json 2>/dev/null | head -1)
        if [ -z "$NODE_FILE" ]; then
            echo "❌ Agent 2 失败 (${D2}s)"
            echo "${SID} agent2" >> "${FAILED}"
            ((fail++))
            continue
        fi
        echo "   ✅ (${D2}s)"
    fi
    
    # Agent 3
    echo "▶️  Agent 3 质检..."
    T3=$(date +%s)
    qwenpaw agent chat \
      --from-agent default \
      --to-agent ai-learning-system-math-zhiliangjianyan-agent \
      --text "审查 ${SID} 的知识点提取质量，节点文件在 ${NODE_FILE}" \
      2>&1 || true
    D3=$(( $(date +%s) - T3 ))
    echo "   ✅ (${D3}s)"
    
    # 看质检结果
    PASSED=$(python3 -c "
import json
r=json.load(open('${PROJECT}/data/pipeline/agent3_quality/quality_report.json'))
print(r['report']['passed'])
" 2>/dev/null)
    
    if [ "$PASSED" = "True" ]; then
        echo "   🎉 通过 (${D1}+${D2}+${D3}=$((D1+D2+D3))s)"
        ((ok++))
    else
        echo "   ⚠️  需复核 → ${REVIEW}"
        echo "${SID} ${TITLE}" >> "${REVIEW}"
        python3 -c "
import json
r=json.load(open('${PROJECT}/data/pipeline/agent3_quality/quality_report.json'))
rep=r['report']
for b in rep.get('blocking_issues',[]): print(f'     🔴 {b}')
for w in rep.get('warnings',[]): print(f'     🟡 {w.get(\"detail\",w)}')
" 2>/dev/null
        ((review++))
    fi
done

rm -f /tmp/_done.txt

echo ""
echo "========================================="
echo "  完成: $(date '+%Y-%m-%d %H:%M:%S')"
echo "  新处理 ${total} | 通过 ${ok} | 复核 ${review} | 失败 ${fail}"
echo "  跳过(已完成) ${skip_done} | 跳过(已失败) ${skip_fail}"
[ -f "${FAILED}" ] && echo "  失败: $(cat ${FAILED})"
[ -f "${REVIEW}" ] && echo "  复核: $(cat ${REVIEW})"
echo "========================================="
