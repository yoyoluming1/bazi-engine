#!/usr/bin/env bash
# 一键部署到云服务器：打包本机代码 → scp 直传 → 重启服务 → 看状态
# 用法：./deploy.sh "这次改了什么"
# 说明：不走「服务器 git pull」，因为这台服务器到 GitHub 的链路不可靠（实测经常超时）
set -euo pipefail

MSG="${1:-update}"
HOST="${BAZI_HOST:-root@120.53.2.49}"
PORT="${BAZI_PORT:-80}"
DIR="${BAZI_DIR:-/root/bazi-engine}"

cd "$(dirname "$0")"

if [ -n "$(git status --porcelain)" ]; then
  git add -A
  git commit -m "$MSG"
  git push -q || echo "[deploy] 推送 GitHub 失败（不影响部署，稍后可重试）"
else
  echo "[deploy] 没有未提交的改动"
fi

echo "[deploy] 传代码"
COPYFILE_DISABLE=1 tar czf - --exclude ./.git --exclude ./node_modules --exclude ./web/config.json . \
  | ssh -p "$PORT" "$HOST" "mkdir -p $DIR && tar xzf - -C $DIR"

echo "[deploy] 重启服务"
ssh -p "$PORT" "$HOST" "systemctl restart bazi-web && sleep 2 && systemctl is-active bazi-web && curl -s -o /dev/null -w 'health %{http_code}\n' http://127.0.0.1:8080/api/health"
