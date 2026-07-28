#!/bin/bash
# test-1.3.sh — 1.3 节三 Agent 全自动管线测试
# 用法：bash scripts/test-1.3.sh

set -e
SECTION="math_10_ch1_s3"
PROJECT="/Users/apple/Desktop/ai-learning-system"
SECTION_FILE="${PROJECT}/output/sections/math_10_ch1_s3_1.3_集合的基本运算.txt"
LOG="${PROJECT}/output/_test_1.3.log"
mkdir -p "${PROJECT}/output/agent1_layout"
mkdir -p "${PROJECT}/output/agent2_extraction/nodes"

echo "=========================================" | tee "$LOG"
echo "  1.3 全自动管线测试" | tee -a "$LOG"
echo "  $(date '+%Y-%m-%d %H:%M:%S')" | tee -a "$LOG"
echo "=========================================" | tee -a "$LOG"

# ─── Agent 1 ───
echo "" | tee -a "$LOG"
echo "▶️  Agent 1 版面分析..." | tee -a "$LOG"
START=$(date +%s)
qwenpaw agent chat \
  --from-agent default \
  --to-agent ai-learning-system-math-banmianfenxi-agent \
  --text "处理章节 ${SECTION}，输入 ${SECTION_FILE}，输出到 ${PROJECT}/output/agent1_layout/" \
  2>&1 | tee -a "$LOG"
RC1=$?
DUR1=$(( $(date +%s) - START ))
if [ $RC1 -ne 0 ]; then
  echo "❌ Agent 1 失败（${DUR1}秒）" | tee -a "$LOG"
  exit 1
fi
echo "✅ Agent 1 完成，耗时 ${DUR1} 秒" | tee -a "$LOG"

# ─── Agent 2 ───
echo "" | tee -a "$LOG"
echo "▶️  Agent 2 知识点提取..." | tee -a "$LOG"
START=$(date +%s)
qwenpaw agent chat \
  --from-agent default \
  --to-agent ai-learning-system-math-jiegouzhuanhua-agent \
  --text "从 ${PROJECT}/output/agent1_layout/${SECTION}.md 提取知识点，输出到 ${PROJECT}/output/agent2_extraction/nodes/" \
  2>&1 | tee -a "$LOG"
RC2=$?
DUR2=$(( $(date +%s) - START ))
if [ $RC2 -ne 0 ]; then
  echo "❌ Agent 2 失败（${DUR2}秒）" | tee -a "$LOG"
  exit 1
fi
echo "✅ Agent 2 完成，耗时 ${DUR2} 秒" | tee -a "$LOG"

# ─── Agent 3 ───
echo "" | tee -a "$LOG"
echo "▶️  Agent 3 质检..." | tee -a "$LOG"
START=$(date +%s)
qwenpaw agent chat \
  --from-agent default \
  --to-agent ai-learning-system-math-zhiliangjianyan-agent \
  --text "审查 ${SECTION} 的知识点提取质量" \
  2>&1 | tee -a "$LOG"
RC3=$?
DUR3=$(( $(date +%s) - START ))
if [ $RC3 -ne 0 ]; then
  echo "❌ Agent 3 失败（${DUR3}秒）" | tee -a "$LOG"
  exit 1
fi
echo "✅ Agent 3 完成，耗时 ${DUR3} 秒" | tee -a "$LOG"

# ─── 检查质检结果 ───
echo "" | tee -a "$LOG"
echo "📊 质检结果：" | tee -a "$LOG"
python3 -c "
import json,sys
try:
    r=json.load(open('${PROJECT}/output/agent3_quality/quality_report.json'))
    rep=r['report']
    print(f'  通过: {rep[\"passed\"]}')
    if not rep['passed']:
        for b in rep.get('blocking_issues',[]): print(f'  🔴 {b}')
    for w in rep.get('warnings',[]): print(f'  🟡 {w}')
    print(f'  {rep.get(\"summary\",\"\")}')
except Exception as e: print(f'  ⚠️ 无法读取质检报告: {e}')
" 2>&1 | tee -a "$LOG"

echo "" | tee -a "$LOG"
echo "========================================="  | tee -a "$LOG"
echo "  总耗时: $(( DUR1 + DUR2 + DUR3 )) 秒" | tee -a "$LOG"
echo "  日志: $LOG" | tee -a "$LOG"
echo "=========================================" | tee -a "$LOG"
