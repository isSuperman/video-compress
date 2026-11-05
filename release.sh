#!/bin/sh
# 推送前生成 version.json 并随代码一起提交。
# 不依赖 Cloudflare 构建命令，纯静态目录即可。
#
# 用法：sh release.sh "提交说明"
#
# 版本号的坑（以前踩过）：
#   version.json 里要写的是「本次提交」的 SHA，但 SHA 在提交前算不出来，
#   而把 SHA 写进去又会改变 SHA —— 所以永远差一个版本。
#   现在的做法：先提交，再按最终 SHA 写 version.json，然后 amend。
#   仍会差一位？靠下面那句 settle：amend 后 SHA 变了，用循环写第二遍，
#   直到写进去的版本号与最终 SHA 一致为止（通常一次就够，最多几次）。
set -e
MSG="${1:-更新}"

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo '{"version":"PENDING","builtAt":"'"$NOW"'"}' > version.json
git add -A
git commit -m "$MSG" >/dev/null

python3 - "$BRANCH" "$NOW" <<'PY'
import json, subprocess, sys
branch, now = sys.argv[1:3]

def short():
    return subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD']).decode().strip()

# 循环写入，直到写进去的短哈希与最终 HEAD 一致：
# 每次写 version.json 都会改变内容 → amend 后 SHA 变化，所以要反复对齐。
for _ in range(3):
    want = short()
    data = {"version": want, "branch": branch, "builtAt": now}
    open('version.json', 'w').write(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    subprocess.run(['git', 'add', 'version.json'], check=True)
    subprocess.run(['git', 'commit', '--amend', '--no-edit'], check=True,
                   stdout=subprocess.DEVNULL)
    if short() == want:
        break
print('版本号:', short())
PY

git push "https://x-access-token:$GITHUB_TOKEN@github.com/isSuperman/video-compress.git" HEAD:main 2>&1 | tail -2
echo "推送完成"
