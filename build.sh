#!/bin/sh
# 生成 version.json —— 页脚显示的部署版本号。
# 由 release.sh 在推送前自动调用，也可手动执行。
#
# Cloudflare 构建时若有这些环境变量会用上：
#   CF_PAGES_COMMIT_SHA / CF_PAGES_BRANCH
# 本地则退回 git 信息。

SHA="${CF_PAGES_COMMIT_SHA:-$(git rev-parse HEAD 2>/dev/null || echo unknown)}"
SHORT=$(echo "$SHA" | cut -c1-7)
BRANCH="${CF_PAGES_BRANCH:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo local)}"
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cat > version.json <<EOF
{
  "version": "$SHORT",
  "commit": "$SHA",
  "branch": "$BRANCH",
  "builtAt": "$NOW"
}
EOF

echo "version.json: $SHORT ($BRANCH) @ $NOW"
