#!/bin/bash
# retry-1.3-buji.sh — 重跑§1.3补集修复
# OCR已追加第19页(补集定义+例5+例6)
# 用法：bash scripts/retry-1.3-buji.sh

PROJECT="/Users/apple/Desktop/ai-learning-system"
SID="math_10_ch1_s3"
OCRFILE=$(ls "${PROJECT}/output/sections/${SID}"*.txt 2>/dev/null | head -1)
BASENAME=$(basename "$OCRFILE" .txt)
LAYOUT="${PROJECT}/output/agent1_layout/${BASENAME}.md"

echo "========================================="
echo "  重跑 1.3 集合的基本运算（补集修复）"
echo "========================================="

rm -f "$LAYOUT"
rm -f "${PROJECT}/output/agent2_extraction/nodes/${SID}"*.json

echo "▶️  A1..."
T1=$(date +%s)
qwenpaw agent chat --from-agent default \
  --to-agent ai-learning-system-math-banmianfenxi-agent \
  --text "处理章节 ${SID}，输入 ${OCRFILE}，输出 ${LAYOUT}" 2>&1 || true
D1=$(( $(date +%s) - T1 ))
[ ! -f "$LAYOUT" ] && echo "❌ A1" && exit 1
echo "   ✅ A1 ${D1}s"

echo "▶️  A2..."
T2=$(date +%s)
qwenpaw agent chat --from-agent default \
  --to-agent ai-learning-system-math-jiegouzhuanhua-agent \
  --text "从 ${LAYOUT} 提取知识点，section_id=${SID}，输出到 ${PROJECT}/output/agent2_extraction/nodes/" 2>&1 || true
D2=$(( $(date +%s) - T2 ))
NF=$(ls -t "${PROJECT}/output/agent2_extraction/nodes/${SID}"*.json 2>/dev/null | head -1)
[ -z "$NF" ] && echo "❌ A2" && exit 1
echo "   ✅ A2 ${D2}s"

echo "▶️  A3..."
T3=$(date +%s)
qwenpaw agent chat --from-agent default \
  --to-agent ai-learning-system-math-zhiliangjianyan-agent \
  --text "审查 ${SID}（含补集），节点文件在 ${NF}" 2>&1 || true
D3=$(( $(date +%s) - T3 ))
echo "   ✅ A3 ${D3}s"

# 复制到 knowledge-graph
cp "$NF" "${PROJECT}/knowledge-graph/nodes/"
python3 -c "
import json
i=json.load(open('${PROJECT}/knowledge-graph/knowledge_index.json'))
d=json.load(open('${NF}'))
ns=d['nodes'] if isinstance(d,dict) and 'nodes' in d else (d if isinstance(d,list) else [])
ids=[n.get('knowledge_id','') or n.get('id','') for n in ns]
for s in i['sections']:
    if s['section_id']=='${SID}':
        s['node_ids']=ids; break
i['total_nodes']=sum(len(s['node_ids']) for s in i['sections'])
json.dump(i, open('${PROJECT}/knowledge-graph/knowledge_index.json','w'), ensure_ascii=False, indent=2)
print(f'✅ 索引更新: {len(ids)}节点')
"

echo ""
echo "🎉 完成! $((D1+D2+D3))s"
