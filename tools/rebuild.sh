#!/bin/sh
# 一键重建：内联 → 加玻璃 → 主题 → 加载模块 → 打补丁 → 拆分。
# 用法：sh tools/rebuild.sh
#
# 约定：
#   · 唯一的「源」是 git 里的 index.html（外链 + assets/ 指纹文件）。
#   · 每次先把外链资源内联回单文件，改造脚本永远面对同一种结构，可重复执行。
#   · 内联内容一律从 git 的 HEAD 读，避免工作区里的旧文件干扰。
set -e
cd "$(dirname "$0")/.."

rm -f assets/*.js assets/*.css 2>/dev/null || true
git checkout -- index.html 2>/dev/null || true

python3 - <<'PY'
import re
import subprocess

html = open('index.html', encoding='utf-8').read()


def from_git(path):
    return subprocess.check_output(['git', 'show', 'HEAD:' + path]).decode()


css_rel = re.search(r'<link rel="stylesheet" href="\./(assets/style\.[0-9a-f]+\.css)">', html)
js_rel = re.search(r'<script type="module" src="\./(assets/app\.[0-9a-f]+\.js)"></script>', html)
if not css_rel or not js_rel:
    raise SystemExit('index.html 里找不到外链的 style/app，无法内联')

css = from_git(css_rel.group(1))
js = from_git(js_rel.group(1))
html = html.replace(css_rel.group(0), '<style>\n' + css + '\n</style>')
html = html.replace(js_rel.group(0), '<script>\n' + js + '\n</script>')
open('index.html', 'w', encoding='utf-8').write(html)
print('  已内联：', css_rel.group(1), js_rel.group(1))
PY

python3 tools/apply_glass.py
python3 tools/apply_light_theme.py
python3 tools/inject_glass_loader.py
python3 tools/apply_patches.py
rm -f assets/*.js assets/*.css
python3 tools/split.py
