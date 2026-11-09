#!/bin/sh
# 生成 version.json 并提交；推送需要显式加 --push。
#
# 用法：
#   sh release.sh "提交说明"          # 只提交到本地
#   sh release.sh "提交说明" --push   # 提交并推送 main
#
# 版本号语义（重要，以前理解错了）：
#   version.json 里的 version 记录的是「本次发布对应的功能提交」的短 SHA，
#   不是 version.json 所在那条提交的 SHA。
#
#   原因：写 version.json 会改变提交内容 → 提交 SHA 变化 → 写进去的 SHA
#   必然不等于自己所在提交的 SHA。旧版 release.sh 想用循环 amend 对齐，
#   这在逻辑上不可能成功（每次 amend 都会重新生成 SHA），所以会白跑三轮。
#
#   这个语义对页脚足够：它的用途是「确认线上刷到了哪一版功能」。
set -e

PUSH=0
MSG=""
for a in "$@"; do
  case "$a" in
    --push) PUSH=1 ;;
    *) MSG="$a" ;;
  esac
done
[ -n "$MSG" ] || MSG="更新"

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# 有未提交改动 → 先正常提交，这条就是「功能提交」
if ! git diff --cached --quiet || ! git diff --quiet; then
  git add -A
  git commit -m "$MSG" >/dev/null
fi

# 取最新一条提交作为版本号（若上一步没提交，就是现有 HEAD）
SHA=$(git rev-parse HEAD)
SHORT=$(git rev-parse --short HEAD)

printf '{\n  "version": "%s",\n  "commit": "%s",\n  "branch": "%s",\n  "builtAt": "%s"\n}\n' \
  "$SHORT" "$SHA" "$BRANCH" "$NOW" > version.json
echo "版本号: $SHORT ($BRANCH) @ $NOW"

# 版本文件单独提交（只在内容确实变化时）
if ! git diff --quiet -- version.json; then
  git add version.json
  git commit -m "chore: 更新版本号为 $SHORT" >/dev/null
  echo "已提交 version.json"
fi

if [ "$PUSH" -eq 1 ]; then
  if [ -z "$GITHUB_TOKEN" ]; then
    echo "错误：GITHUB_TOKEN 未设置，无法推送" >&2
    exit 1
  fi
  # 用 http.extraheader 传凭据，token 不进 URL、不落 reflog
  AUTH=$(printf 'x-access-token:%s' "$GITHUB_TOKEN" | base64 | tr -d '\n')
  git -c http.extraheader="Authorization: Basic $AUTH" \
      push "https://github.com/isSuperman/video-compress.git" "HEAD:$BRANCH" 2>&1 | tail -2
  echo "推送完成 ($BRANCH)"
else
  echo "仅提交到本地。确认后加 --push 推送。"
fi
