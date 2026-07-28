#!/bin/bash
# pipeline-all.sh — 整本教材三 Agent 全自动管线
# 用法：bash scripts/pipeline-all.sh
# 失败/警告自动跳过，已完成的跳过去，一键跑完整本

set +e

PROJECT="/Users/apple/Desktop/ai-learning-system"
INDEX="${PROJECT}/output/agent2_extraction/knowledge_index.json"
FAILED="${PROJECT}/output/_failed.log"
REVIEW="${PROJECT}/output/_needs_review.log"

mkdir -p "${PROJECT}/output/agent1_layout" "${PROJECT}/output/agent2_extraction/nodes"

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

for F in "${PROJECT}"/output/sections/math_10_ch*.txt; do
    [ -f "$F" ] || continue
    B=$(basename "$F" .txt)
    
    # 从文件名解析 section_id：math_10_ch1_4 → 把最后的 _数字 改成 _s数字
    # 已OCR格式: math_10_ch1_s1, math_10_ch1_4
    SID=$(echo "$B" | sed -E 's/_([0-9]+)$/_s\1/')
    
    # 跳过已完成
    if grep -q "^${SID}$" /tmp/_done.txt 2>/dev/null; then
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
    
    # Agent 1
    echo "▶️  Agent 1 版面..."
    T1=$(date +%s)
    qwenpaw agent chat \
      --from-agent default \
      --to-agent ai-learning-system-math-banmianfenxi-agent \
      --text "处理章节 ${SID}，输入 ${F}，输出到 ${PROJECT}/output/agent1_layout/" \
      2>&1 || true
    D1=$(( $(date +%s) - T1 ))
    if [ ${PIPESTATUS[0]} -ne 0 ]; then
        echo "❌ Agent 1 失败 (${D1}s)"; echo "${SID} agent1" >> "${FAILED}"; ((fail++)); continue
    fi
    echo "   ✅ (${D1}s)"
    
    # Agent 2
    echo "▶️  Agent 2 提取..."
    T2=$(date +%s)
    qwenpaw agent chat \
      --from-agent default \
      --to-agent ai-learning-system-math-jiegouzhuanhua-agent \
      --text "从 ${PROJECT}/output/agent1_layout/${SID}.md 提取知识点，输出到 ${PROJECT}/output/agent2_extraction/nodes/" \
      2>&1 || true
    D2=$(( $(date +%s) - T2 ))
    if [ ${PIPESTATUS[0]} -ne 0 ]; then
        echo "❌ Agent 2 失败 (${D2}s)"; echo "${SID} agent2" >> "${FAILED}"; ((fail++)); continue
    fi
    echo "   ✅ (${D2}s)"
    
    # Agent 3
    echo "▶️  Agent 3 质检..."
    T3=$(date +%s)
    qwenpaw agent chat \
      --from-agent default \
      --to-agent ai-learning-system-math-zhiliangjianyan-agent \
      --text "审查 ${SID} 的知识点提取质量" \
      2>&1 || true
    D3=$(( $(date +%s) - T3 ))
    if [ ${PIPESTATUS[0]} -ne 0 ]; then
        echo "❌ Agent 3 失败 (${D3}s)"; echo "${SID} agent3" >> "${FAILED}"; ((fail++)); continue
    fi
    echo "   ✅ (${D3}s)"
    
    # 看质检结果
    PASSED=$(python3 -c "
import json
r=json.load(open('${PROJECT}/output/agent3_quality/quality_report.json'))
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
r=json.load(open('${PROJECT}/output/agent3_quality/quality_report.json'))
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
