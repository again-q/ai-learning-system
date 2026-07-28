#!/bin/bash
# CloudBase 云函数批量上传脚本
# 部署所有业务云函数
set -e

ENV_ID="${envId:-cloud1-d8g0ty39wd73f430a}"

echo "=========================================="
echo " ☁️  部署云函数到环境: $ENV_ID"
echo "=========================================="

# userLogin — 用户登录/注册
echo ""
echo "→ 部署 userLogin ..."
${installPath} cloud functions deploy --e "$ENV_ID" --n userLogin --r --project "${projectPath}"

# manageKnowledge — 知识库管理
echo ""
echo "→ 部署 manageKnowledge ..."
${installPath} cloud functions deploy --e "$ENV_ID" --n manageKnowledge --r --project "${projectPath}"

# quickstartFunctions — 示例函数
echo ""
echo "→ 部署 quickstartFunctions ..."
${installPath} cloud functions deploy --e "$ENV_ID" --n quickstartFunctions --r --project "${projectPath}"

echo ""
echo "✅ 全部部署完成"
