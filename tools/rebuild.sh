#!/bin/sh
# 一键重建：内联 → 加工 → 拆分。用法：sh tools/rebuild.sh
#
# 约定：
#   · 源是「内联单文件」形态的 index.html（<style>…</style> + <script>…</script>）。
#   · 如果 index.html 是拆分形态（外链 assets/），先从 git 或工作区读出内容内联回来。
#   · 每一步都必须幂等，可以反复运行。
set -e
cd "$(dirname "$0")/.."

python3 - <<'PY'
import os
import re
import subprocess

HTML = 'index.html'
html = open(HTML, encoding='utf-8').read()


def load(path):
    """优先读工作区文件，没有再从 git 取。"""
    if os.path.exists(path):
        return open(path, encoding='utf-8').read()
    return subprocess.check_output(['git', 'show', 'HEAD:' + path]).decode()


# 拆分形态 → 内联形态
if '<style>' not in html:
    css_rel = re.search(r'<link rel="stylesheet" href="\./(assets/style\.[0-9a-f]+\.css)">', html)
    js_rel = re.search(r'<script type="module" src="\./(assets/app\.[0-9a-f]+\.js)"></script>', html)
    if not css_rel or not js_rel:
        raise SystemExit('index.html 既不是内联形态，也找不到外链资源')
    css = load(css_rel.group(1))
    js = load(js_rel.group(1))
    html = html.replace(css_rel.group(0), '<style>\n' + css + '\n</style>')
    html = html.replace(js_rel.group(0), '<script>\n' + js + '\n</script>')
    open(HTML, 'w', encoding='utf-8').write(html)
    print('  已内联：', css_rel.group(1), js_rel.group(1))
else:
    print('  已是内联形态')
PY

python3 tools/apply_glass.py
python3 tools/apply_light_theme.py
python3 tools/inject_glass_loader.py
python3 tools/apply_patches.py
rm -f assets/*.js assets/*.css
python3 tools/split.py
