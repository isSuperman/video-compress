#!/bin/sh
# 推送前生成 version.json 并随代码一起提交。
# 不依赖 Cloudflare 构建命令，纯静态目录即可。
#
# 用法：sh release.sh "提交说明"

set -e
MSG="${1:-更新}"

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# 关键：先放置所有改动，提交一次，拿到新 SHA，再回写版本号并 amend。
# amend 不改变内容之外的 SHA 计算基础，最终以 amend 后的 SHA 为准。
echo '{"version":"PENDING","builtAt":"'"$NOW"'"}' > version.json
git add -A
git commit -m "$MSG" >/dev/null

NEWSHA=$(git rev-parse HEAD)
SHORT=$(git rev-parse --short HEAD)

python3 - "$SHORT" "$NEWSHA" "$BRANCH" "$NOW" <<'PY'
import json, sys
short, full, branch, now = sys.argv[1:5]
json.dump({
    "version": short,
    "commit": full,
    "branch": branch,
    "builtAt": now
}, open('version.json', 'w'), ensure_ascii=False, indent=2)
PY

git add version.json
git commit --amend --no-edit >/dev/null
FINAL=$(git rev-parse --short HEAD)

# 补写最终 SHA（amend 后 SHA 变了，再 amend 一次会陷入循环，
# 因此版本号显示的是本次提交前的短哈希，足够用于区分新旧）
echo "版本号: $FINAL"

git push "https://x-access-token:$GITHUB_TOKEN@github.com/isSuperman/video-compress.git" HEAD:main 2>&1 | tail -2
echo "推送完成"
