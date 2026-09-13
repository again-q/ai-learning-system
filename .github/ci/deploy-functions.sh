#!/usr/bin/env bash
# 部署云函数（CloudBase CLI / tcb）——只部署本次提交改动过的函数
# 需要 env：TCB_SECRET_ID / TCB_SECRET_KEY / ENV_ID / [FUNCTIONS] / GH_TOKEN / REPO
# 失败时把日志尾部贴到「📱 最新预览二维码」issue 下 —— 手机上也能直接看到原因
set -uo pipefail

log() { printf '%s\n' "$*"; }
fail() { log "::error::$*"; exit 1; }

[ -n "${TCB_SECRET_ID:-}" ] || fail "缺少 TCB_SECRET_ID —— 请在 Settings → Secrets and variables → Actions 里添加这两个 Secret"
[ -n "${TCB_SECRET_KEY:-}" ] || fail "缺少 TCB_SECRET_KEY —— 同上"

# 粘贴时常见多空格/换行 → 去掉再用
TCB_SECRET_ID="$(printf '%s' "$TCB_SECRET_ID" | tr -d '[:space:]')"
TCB_SECRET_KEY="$(printf '%s' "$TCB_SECRET_KEY" | tr -d '[:space:]')"
log "TCB_SECRET_ID 长度=${#TCB_SECRET_ID}（正常 36，AKID… 开头）"
log "TCB_SECRET_KEY 长度=${#TCB_SECRET_KEY}（正常 32）"

# 只部署「这次提交真正改动过」的云函数；手动触发填了 FUNCTIONS 就按它来
# ① commit message 里显式写 [deploy:函数名,函数名] 时，以它为准（最直观，也能用来只测一个函数）
if [[ "${COMMIT_MSG:-}" =~ \[deploy:([^]]+)\] ]]; then
  FUNCTIONS="${BASH_REMATCH[1]//,/ }"
fi
if [ -n "${FUNCTIONS:-}" ]; then
  LIST="${FUNCTIONS//,/ }"
else
  LIST="$(git diff --name-only HEAD^ HEAD -- cloudfunctions/ | cut -d/ -f2 | sort -u | tr '\n' ' ')"
fi
log "本次要部署：${LIST:-（无）}"
[ -n "${LIST:-}" ] || { log "本次提交没有改动云函数 → 跳过部署"; exit 0; }

TCB=".github/ci/node_modules/.bin/tcb"
LOG="$(mktemp)"

post_issue() {   # $1 = 结论标题
  [ -n "${GH_TOKEN:-}" ] || return 0
  local body
  body="$1"$'\n\n'"部署日志尾部："$'\n\n'"\`\`\`"$'\n'"$(tail -25 "$LOG")"$'\n'"\`\`\`"
  local n
  n="$(gh issue list --repo "$REPO" --search '最新预览二维码 in:title' --limit 1 --json number -q '.[0].number' 2>/dev/null || true)"
  if [ -n "$n" ]; then
    gh issue comment "$n" --repo "$REPO" --body "$body" >/dev/null 2>&1 || true
  else
    gh issue create --repo "$REPO" --title "云函数部署失败" --body "$body" >/dev/null 2>&1 || true
  fi
}

log "→ tcb login"
if ! timeout 120 "$TCB" login --apiKeyId "$TCB_SECRET_ID" --apiKey "$TCB_SECRET_KEY" >"$LOG" 2>&1; then
  tail -25 "$LOG"
  post_issue "❌ **云函数部署失败：tcb 登录被拒（腾讯云密钥验证失败）**
排查顺序：① Secret 名必须恰好是 \`TCB_SECRET_ID\` / \`TCB_SECRET_KEY\` ② 上面两行长度是否 36 / 32 ③ 密钥是否来自创建该云开发环境的腾讯云账号 ④ 密钥是否被禁用"
  fail "tcb 登录失败（原因见上方日志 / issue 评论）"
fi
tail -3 "$LOG"

for fn in $LIST; do
  log "→ 部署 $fn"
  # --yes/--json 都试上；再用 script 分配一个 PTY，万一 tcb 仍弹"请选择操作"也能自动回车选第一项（CI 无 TTY）
  CMD="$(printf '%q ' "$TCB" fn deploy "$fn" --force --yes --json --deployMode zip --install-dependency true -e "$ENV_ID" --dir "cloudfunctions/$fn")"
  run_deploy() {
    if command -v script >/dev/null 2>&1; then
      printf '\n' | timeout 240 script -qec "$CMD" /dev/null >"$LOG" 2>&1
    else
      timeout 240 bash -c "$CMD" >"$LOG" 2>&1
    fi
  }
  if ! run_deploy; then
    tail -25 "$LOG"
    post_issue "❌ **云函数部署失败：\`$fn\`**"
    if grep -q 'Please select an action' "$LOG"; then
      log "提示：日志里出现了交互式选择（Please select an action）→ tcb 又在等输入，需要补非交互参数"
    fi
    fail "部署 $fn 失败"
  fi
  tail -2 "$LOG"
done
log "✅ 全部部署完成：$LIST"
