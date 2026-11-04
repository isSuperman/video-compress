#!/usr/bin/env python3
"""让浅色模式可手动切换。

页面原本的浅色变量全部挂在 @media (prefers-color-scheme: light) 里，
只有系统是浅色时才生效——右上角按钮切不动。
这里把它改成「两份」：
  html[data-theme="light"]{...}                手动切浅色
  @media (prefers-color-scheme: light){html:not([data-theme="dark"]){...}}
                                               跟随系统（默认）
选择器特异度相同、后者在源码里靠后，所以系统深色时手动 light 依然生效。
"""
import re
import sys

ROOT = '/var/minis/workspace/vc-git/'
P = ROOT + 'index.html'
MARK = '/* ── 浅色模式 ── */'

s = open(P, encoding='utf-8').read()
if 'data-theme="light"' in s and 'html:not([data-theme="dark"])' in s:
    print('  浅色模式已是可切换形态，跳过')
    sys.exit(0)

i = s.find(MARK)
if i < 0:
    sys.exit('找不到「浅色模式」段落')
m = re.compile(r'@media \(prefers-color-scheme: light\)\{\s*:root\{(.*?)\}\s*\}', re.S).search(s, i)
if not m:
    sys.exit('浅色变量块结构不符合预期')
vars_src = m.group(1)

block = (
    '/* ── 浅色模式 ──\n'
    '   两套写法共用同一份变量：\n'
    '   · html[data-theme="light"]          → 右上角按钮手动切浅色\n'
    '   · 系统浅色时（未手动锁深色）         → 跟随系统\n'
    '   两份选择器特异度相同，后者靠后，所以系统深色下手动浅色仍然生效。 */\n'
    ':root[data-theme="light"],\n'
    'html[data-theme="light"]{\n' + vars_src + '}\n'
    '@media (prefers-color-scheme: light){\n'
    '  html:not([data-theme="dark"]):not([data-theme="light"]){\n' + vars_src + '}\n'
    '}\n'
)
s = s[:m.start()] + block + s[m.end():]
# 主题要在首帧前定下来，否则会先闪一下另一种配色
BOOT = '''<script>
/* 主题：在首帧前把上次选的主题写上，避免闪烁。
   没存过就跟随系统（不写 data-theme）。默认深色，和页面原本的版式一致。 */
(function () {
  try {
    var t = localStorage.getItem('vmc-theme');
    if (t !== 'light' && t !== 'dark') {
      t = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
</script>
'''
if 'vmc-theme' not in s:
    anchor = '<link rel="stylesheet" href="./assets/'
    if anchor in s:
        s = s.replace(anchor, BOOT + anchor, 1)
    else:
        s = s.replace('</head>', BOOT + '</head>', 1)

open(P, 'w', encoding='utf-8').write(s)
print('  浅色模式已改为可切换')
