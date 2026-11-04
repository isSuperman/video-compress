#!/bin/sh
# 一键把 index.html 的内联形态改造成带液态玻璃的形态，然后构建。
# 用法：sh tools/rebuild.sh
set -e
cd "$(dirname "$0")/.."

git checkout -- index.html assets 2>/dev/null || true

python3 - <<'PY'
import re
ROOT = './'
s = open(ROOT + 'index.html', encoding='utf-8').read()
css = open(ROOT + 'assets/style.e7f3896645.css', encoding='utf-8').read()
js = open(ROOT + 'assets/app.58c77a1376.js', encoding='utf-8').read()
s = s.replace('<link rel="stylesheet" href="./assets/style.e7f3896645.css">', '<style>\n' + css + '\n</style>')
s = re.sub(r'<script type="module" src="\./assets/app\.[0-9a-f]+\.js"></script>',
           lambda m: '<script>\n' + js + '\n</script>', s, count=1)
open(ROOT + 'index.html', 'w', encoding='utf-8').write(s)
PY

python3 tools/apply_glass.py
python3 tools/apply_light_theme.py
python3 tools/inject_glass_loader.py
rm -f assets/*
python3 tools/split.py
