#!/usr/bin/env python3
"""主题系统：跟随系统 + 手动切换（幂等，可重复执行）。

设计：
  · 唯一状态是 <html data-applied="light|dark">，由首帧前的内联脚本算好写入；
  · localStorage['vmc-theme'] = 'light'/'dark' 表示用户手动锁定，
    没有这个键 = 跟随系统；
  · CSS 里浅色变量同时挂在 html[data-applied="light"] 和
    @media (prefers-color-scheme: light){html:not([data-applied])} 上，
    后者仅在 JS 未执行时兜底，避免首帧闪烁。
"""
import re
import sys

ROOT = '/var/minis/workspace/vc-git/'
P = ROOT + 'index.html'

s = open(P, encoding='utf-8').read()

# ---------------------------------------------------------------- 1. CSS
if 'data-applied="light"' not in s:
    # 先从 @media 里把浅色变量抠出来
    m = re.search(r'@media \(prefers-color-scheme: light\)\{\s*:root\{(.*?)\}\s*\}', s, re.S)
    if m:
        start, end, vars_src = m.start(), m.end(), m.group(1)
    else:
        # 已被旧版改造成的形态：html[data-theme="light"]{ ... }
        m2 = re.search(r':root\[data-theme="light"\],\s*\n?\s*html\[data-theme="light"\]\{(.*?)\n\}', s, re.S)
        if not m2:
            sys.exit('找不到浅色变量块')
        start, end, vars_src = m2.start(), m2.end(), m2.group(1)

    block = (
        '/* ── 浅色模式 ──\n'
        '   实际主题由 JS 在首帧前写到 <html data-applied>（防闪烁）：\n'
        '   · "light" → 手动选浅色，或系统是浅色（未手动锁定）\n'
        '   · "dark"  → 手动选深色，或系统是深色\n'
        '   系统浅色时也要能被手动切回深色，所以两份选择器都要在。 */\n'
        'html[data-applied="light"]{' + vars_src + '}\n'
        '/* JS 未执行时的兜底：系统浅色即浅色 */\n'
        '@media (prefers-color-scheme: light){\n'
        '  html:not([data-applied]){' + vars_src + '}\n'
        '}\n'
    )
    s = s[:start] + block + s[end:]

# ------------------------------------------------------- 2. 首帧主题脚本
if 'id="theme-boot"' not in s:
    boot = '''<script id="theme-boot">
/* 主题三态：跟随系统 / 手动深色 / 手动浅色。
   在首个样式表之前执行，把实际主题写到 data-applied，避免首帧闪一下。 */
(function () {
  var d = document.documentElement;
  var saved = null;
  try { saved = localStorage.getItem('vmc-theme'); } catch (e) {}
  var sysLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  var theme = (saved === 'light' || saved === 'dark') ? saved : (sysLight ? 'light' : 'dark');
  d.setAttribute('data-applied', theme);
  d.setAttribute('data-theme', theme);   /* 玻璃层读这个 */
})();
</script>
'''
    anchor = '<link rel="stylesheet" href="./assets/'
    if anchor in s:
        s = s.replace(anchor, boot + anchor, 1)
    else:
        s = s.replace('</head>', boot + '</head>', 1)

open(P, 'w', encoding='utf-8').write(s)
print('  主题：跟随系统 + 手动切换')
