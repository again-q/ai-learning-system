#!/bin/bash
# 根目录兼容入口 — 转发到 scripts/uploadCloudFunction.sh
exec "$(cd "$(dirname "$0")" && pwd)/scripts/uploadCloudFunction.sh" "$@"
