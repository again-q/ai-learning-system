#!/usr/bin/env bash
# 部署云函数 —— 走 miniprogram-ci 的 cloud.uploadFunction
#   为什么不用 tcb：① 默认 COS 直传有 60 秒硬超时（跨境必挂）② --deployMode zip 有 1.5MB 上限（依赖会被打包进去）
#   本机实测：uploadFunction 上传包仅 20KB（3 文件），云端装依赖，status: Updating → Active ✅
# 需要 env：WECHAT_APPID / WECHAT_PRIVATE_KEY / ENV_ID / [FUNCTIONS] / [COMMIT_MSG] / GH_TOKEN / REPO
set -uo pipefail

log() { printf '%s\n' "$*"; }
fail() { log "::error::$*"; exit 1; }

[ -n "${WECHAT_PRIVATE_KEY:-}" ] || fail "缺少 WECHAT_PRIVATE_KEY（Settings → Secrets and variables → Actions 里添加）"
[ -n "${ENV_ID:-}" ] || fail "缺少 ENV_ID（云开发环境 ID）"

# ① commit message 里写 [deploy:函数名,函数名] → 以它为准
if [[ "${COMMIT_MSG:-}" =~ \[deploy:([^]]+)\] ]]; then
  FUNCTIONS="${BASH_REMATCH[1]}"
fi
# ② 手动触发时填的 functions 输入；③ 否则按 git diff，只部署这次改动过的云函数
if [ -n "${FUNCTIONS:-}" ]; then
  LIST="${FUNCTIONS//,/ }"
else
  LIST="$(git diff --name-only HEAD^ HEAD -- cloudfunctions/ | cut -d/ -f2 | sort -u | tr '\n' ' ')"
fi
log "本次要部署：${LIST:-（无）}"
[ -n "${LIST:-}" ] || { log "本次提交没有改动云函数 → 跳过部署"; exit 0; }

LOG="$(mktemp)"
post_issue() {
  [ -n "${GH_TOKEN:-}" ] || return 0
  local body n
  body="$1"$'\n\n'"部署日志尾部："$'\n\n'"\`\`\`"$'\n'"$(tail -25 "$LOG")"$'\n'"\`\`\`"
  n="$(gh issue list --repo "$REPO" --search '最新预览二维码 in:title' --limit 1 --json number -q '.[0].number' 2>/dev/null || true)"
  if [ -n "$n" ]; then
    gh issue comment "$n" --repo "$REPO" --body "$body" >/dev/null 2>&1 || true
  else
    gh issue create --repo "$REPO" --title "云函数部署失败" --body "$body" >/dev/null 2>&1 || true
  fi
}

for fn in $LIST; do
  log "→ 部署 $fn（miniprogram-ci cloud.uploadFunction，云端装依赖）"
  if ! timeout 300 node .github/ci/upload-functions.cjs "$fn" >"$LOG" 2>&1; then
    tail -25 "$LOG"
    post_issue "❌ **云函数部署失败：\`$fn\`**（miniprogram-ci cloud.uploadFunction）"
    fail "部署 $fn 失败（原因见上方日志 / issue 评论）"
  fi
  tail -3 "$LOG"
done
log "✅ 全部部署完成：$LIST"
