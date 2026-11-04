#!/usr/bin/env python3
"""把玻璃加载模块插进 index.html 的内联脚本（app.js 源）。

单独拆出来的原因：这段代码要放在模块顶层（模块作用域），
而 tools/apply_glass.py 只改 HTML 结构，两者互不干扰。
"""
import sys

ROOT = '/var/minis/workspace/vc-git/'
P = ROOT + 'index.html'
FRAG = ROOT + 'glass/loader.js.frag'
MARK = '/* ---------- 环境检测 ---------- */'

s = open(P, encoding='utf-8').read()
if 'GLASS_SRC' in s:
    print('  loader 已在位，跳过')
    sys.exit(0)

if s.count(MARK) != 1:
    sys.exit('环境检测锚点不唯一，无法插入玻璃加载模块')

frag = open(FRAG, encoding='utf-8').read()
s = s.replace(MARK, frag + MARK)
open(P, 'w', encoding='utf-8').write(s)
print('  loader 已插入 (%d 字节)' % len(frag))
