#!/bin/sh
# 一键重建：还原 → 内联 → 加玻璃 → 浅色主题 → 加载模块 → 拆分。
# 用法：sh tools/rebuild.sh
#
# 「还原」的意思是：把 index.html 里外链的指纹资源重新内联回源文件，
# 这样后面的改造脚本始终面对着「单文件源码」形态，可以重复执行。
set -e
cd "$(dirname "$0")/.."

python3 - <<'PY'
import glob, re
s = open('index.html', encoding='utf-8').read()

css_files = re.findall(r'<link rel="stylesheet" href="\./(assets/style\.[0-9a-f]+\.css)">', s)
js_files = re.findall(r'<script type="module" src="\./(assets/app\.[0-9a-f]+\.js)"></script>', s)
if not css_files or not js_files:
    raise SystemExit('index.html 里找不到外链的 app/style，无法还原')

import os, subprocess
def read(path):
    if os.path.exists(path):
        return open(path, encoding='utf-8').read()
    return subprocess.check_output(['git', 'show', 'HEAD:' + path]).decode()

css = read(css_files[0])
js = read(js_files[0])
s = s.replace('<link rel="stylesheet" href="./%s">' % css_files[0], '<style>\n' + css + '\n</style>')
s = s.replace('<script type="module" src="./%s"></script>' % js_files[0], '<script>\n' + js + '\n</script>')
open('index.html', 'w', encoding='utf-8').write(s)
print('  已内联：', css_files[0], js_files[0])
PY

python3 tools/apply_glass.py
python3 tools/apply_light_theme.py
python3 tools/inject_glass_loader.py
rm -f assets/*
python3 tools/split.py
