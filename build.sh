#!/bin/sh
# Cloudflare Pages 构建时自动生成 version.json
# CF 提供的环境变量：
#   CF_PAGES_COMMIT_SHA     完整 commit hash
#   CF_PAGES_BRANCH         分支名
#   CF_PAGES_URL            部署 URL
# 本地执行时退回用 git 信息

SHA="${CF_PAGES_COMMIT_SHA:-$(git rev-parse HEAD 2>/dev/null || echo unknown)}"
SHORT=$(echo "$SHA" | cut -c1-7)
BRANCH="${CF_PAGES_BRANCH:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo local)}"
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cat > version.json <<EOF
{
  "version": "$SHORT",
  "commit": "$SHA",
  "branch": "$BRANCH",
  "builtAt": "$NOW",
  "buildId": "${CF_PAGES_BUILD_ID:-local}"
}
EOF

echo "version.json 已生成: $SHORT ($BRANCH)"
cat version.json
