#!/bin/bash
# 门禁 CLI 入口 — 转发到 scripts/gate.sh
exec "$(cd "$(dirname "$0")" && pwd)/scripts/gate.sh" "$@"
