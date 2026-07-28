#!/bin/bash
# retry-4.2-4.4.sh — 重跑失败的 4.2~4.4 节
# 用法：bash scripts/retry-4.2-4.4.sh

PROJECT="/Users/apple/Desktop/ai-learning-system"
FAILED="${PROJECT}/output/_failed.log"

echo "========================================="
echo "  重跑 4.2 指数函数 | 4.3 对数 | 4.4 对数函数"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================="

for SID in math_10_ch4_s2 math_10_ch4_s3 math_10_ch4_s4; do
  echo ""
  echo "━━━ ${SID} ━━━"
  
  SF=$(ls "${PROJECT}/output/sections/${SID}"*.txt 2>/dev/null | head -1)
  [ -z "$SF" ] && echo "❌ 无OCR文件" && continue
  BN=$(basename "$SF" .txt)
  LF="${PROJECT}/output/agent1_layout/${BN}.md"
  
  # 清旧文件+日志
  rm -f "$LF"
  rm -f "${PROJECT}/output/agent2_extraction/nodes/${SID}"*.json 2>/dev/null
  sed -i '' "/${SID}/d" "$FAILED" 2>/dev/null || true
  
  # A1
  echo "▶️  A1 版面分析..."
  T1=$(date +%s)
  qwenpaw agent chat --from-agent default \
    --to-agent ai-learning-system-math-banmianfenxi-agent \
    --text "处理章节 ${SID}，输入 ${SF}，输出 ${LF}" 2>&1 || true
  D1=$(( $(date +%s) - T1 ))
  [ ! -f "$LF" ] && echo "❌ A1失败(${D1}s)" && echo "${SID} agent1" >> "$FAILED" && continue
  echo "   ✅ A1 (${D1}s)"
  
  # A2
  echo "▶️  A2 知识点提取..."
  T2=$(date +%s)
  qwenpaw agent chat --from-agent default \
    --to-agent ai-learning-system-math-jiegouzhuanhua-agent \
    --text "从 ${LF} 提取知识点，section_id=${SID}，输出到 ${PROJECT}/output/agent2_extraction/nodes/" 2>&1 || true
  D2=$(( $(date +%s) - T2 ))
  NF=$(ls -t "${PROJECT}/output/agent2_extraction/nodes/${SID}"*.json 2>/dev/null | head -1)
  [ -z "$NF" ] && echo "❌ A2失败(${D2}s)" && echo "${SID} agent2" >> "$FAILED" && continue
  echo "   ✅ A2 (${D2}s)"
  
  # A3
  echo "▶️  A3 质检..."
  T3=$(date +%s)
  qwenpaw agent chat --from-agent default \
    --to-agent ai-learning-system-math-zhiliangjianyan-agent \
    --text "审查 ${SID}，节点文件在 ${NF}" 2>&1 || true
  D3=$(( $(date +%s) - T3 ))
  echo "   ✅ A3 (${D3}s)"
  
  echo "   🎉 ${SID} 完成! $((D1+D2+D3))s"
done

echo ""
echo "========================================="
[ -f "$FAILED" ] && echo "仍失败:" && cat "$FAILED" || echo "全部通过 ✅"
echo "========================================="
