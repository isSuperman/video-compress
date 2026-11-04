#!/usr/bin/env python3
"""把液态玻璃改造应用到 index.html（内联形态）。可重复执行。"""
import re
import sys

ROOT = '/var/minis/workspace/vc-git/'
P = ROOT + 'index.html'
s = open(P, encoding='utf-8').read()

def once(a, b, why):
    """把 a 换成 b，且只做一次。

    用 b 的首行作为「已插入标记」判重。不能用「a 不存在」来判断：
    b 往往以 a 的片段开头，那样会永远误判成没改过，导致重复插入
    （之前 start 宿主被插成 4 份就是这么来的）。
    """
    global s
    marker = b.strip().splitlines()[0].strip()
    if marker and marker in s:
        return
    if s.count(a) != 1:
        sys.exit('锚点不唯一(%d): %s' % (s.count(a), why))
    s = s.replace(a, b)

# 1. 预热连接
once('<link rel="prefetch" href="./lib/mediabunny.bundle.js" as="script">',
     '<link rel="prefetch" href="./lib/mediabunny.bundle.js" as="script">\n\n'
     '<!-- 液态玻璃：库文件在本站 lib/ 下，页面 load 后才注入（见 JS 里的 loadGlass） -->', 'marker')

# 2. 主题按钮 + 选择区外壳
once('</header>\n\n<div class="drop" id="drop">',
     '</header>\n\n'
     '<button class="lgThemeBtn" id="lgThemeBtn" type="button" aria-label="切换深色/浅色" hidden>\n'
     '  <svg class="iMoon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg>\n'
     '  <svg class="iSun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/></svg>\n'
     '</button>\n\n'
     '<!-- 选择视频：原交互区保留（点击/拖拽/无障碍），玻璃垫在它后面 -->\n'
     '<div class="dropWrap">\n'
     '  <div class="lgHost" data-lg="drop"></div>\n'
     '  <div class="drop" id="drop">', 'theme btn')

once('<input type="file" id="file" accept="video/*">\n</div>',
     '<input type="file" id="file" accept="video/*">\n  </div>\n</div>', 'drop close')

# 3. 分辨率 / 画质：玻璃控件 + 原来的 HTML 控件（降级用）
once('<div class="optRow">\n    <span class="optKey">分辨率</span>',
     '<div class="lgRowHead lgBlock"><span class="k">分辨率</span><span class="v" id="lgResVal">1080p</span></div>\n'
     '  <!-- 液态玻璃按钮组：库不可用时（html 上没有 .lg-on）自动退回下面的 HTML 胶囊 -->\n'
     '  <div class="lgHost lgBlock" data-lg="res" data-lg-control="1"></div>\n'
     '  <div class="optRow lgReplaced" id="resRow">\n'
     '    <span class="optKey">分辨率</span>', 'res row')

once('<div class="optRow">\n    <span class="optKey">画质</span>',
     '<div class="lgRowHead lgBlock"><span class="k">画质</span><span class="v" id="lgQVal">4 Mbps</span></div>\n'
     '  <div class="lgHost lgBlock" data-lg="q" data-lg-control="1"></div>\n'
     '  <div class="optRow lgReplaced">\n'
     '    <span class="optKey">画质</span>', 'q row')

# 4. 压缩按钮下的玻璃
once('  <div class="actBtn" id="start" role="button" tabindex="0">',
     '  <div class="lgHost" data-lg="start"></div>\n'
     '  <div class="actBtn" id="start" role="button" tabindex="0">', 'start glass')

# 5. JS：玻璃加载模块 + 状态钩子
if 'loadGlass' not in s:
    glass = open('/tmp/glass_parts/glass.js', encoding='utf-8').read()
    glass = glass.replace('const UI_SCRIPTS = [];', 'const UI_SCRIPTS = [];  // 由 lg-boot.js 按序注入接线脚本')
    mark = '/* ---------- 环境检测 ---------- */'
    if s.count(mark) != 1:
        sys.exit('环境检测锚点不唯一')
    s = s.replace(mark, glass + mark)

hooks = '''// ---- 给液态玻璃层用的状态钩子 ----
// 玻璃控件（glass/lg-app.js）不直接读本模块作用域里的变量，而是通过这里
// 取当前状态，并通过 onRes / onQuality 把用户的选择写回来。
window.VC_UI_HOOKS = {
  resolutions: [
    { id: '1080', label: '1080p' },
    { id: '720', label: '720p' },
    { id: '480', label: '480p' }
  ],
  currentRes: () => String(selRes),
  onRes: id => { selRes = +id; },
  onQuality: idx => { selQ = (Q_LEVELS[idx] || Q_LEVELS[1]).q; }
};

'''
if 'VC_UI_HOOKS' not in s:
    a = '/* ---------- 开始压缩 ---------- */'
    if s.count(a) != 1:
        sys.exit('开始压缩锚点不唯一')
    s = s.replace(a, hooks + a)

open(P, 'w', encoding='utf-8').write(s)
print('ok', len(s))
