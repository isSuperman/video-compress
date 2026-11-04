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
frag = open(FRAG, encoding='utf-8').read()
START = '/* ---------- 液态玻璃（渐进增强'
END = '/* ---------- 环境检测 ---------- */'

i, j = s.find(START), s.find(END)
if i >= 0 and j > i:
    # 已有加载模块：整段替换成最新版本（避免旧版残留）
    body = s[i:j]
    if frag.strip() in body:
        print('  loader 已是最新，跳过')
        sys.exit(0)
    s = s[:i] + frag + '\n' + s[j:]
else:
    if s.count(END) != 1:
        sys.exit('环境检测锚点不唯一，无法插入玻璃加载模块')
    s = s.replace(END, frag + '\n' + END)

open(P, 'w', encoding='utf-8').write(s)
print('  loader 已写入 (%d 字节)' % len(frag))
