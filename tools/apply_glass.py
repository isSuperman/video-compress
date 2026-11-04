#!/usr/bin/env python3
"""把液态玻璃改造应用到 index.html（内联形态）。幂等，可重复执行。"""
import sys

ROOT = '/var/minis/workspace/vc-git/'
P = ROOT + 'index.html'
s = open(P, encoding='utf-8').read()
done = []


def once(a, b, why):
    """把 a 换成 b，且只做一次。

    判重用 b 的首行作为「已插入标记」。不能用「a 不存在」判断：
    b 往往以 a 的片段开头，会永远误判成没改过，导致重复插入
    （之前 start 宿主被插成 4 份就是这么来的）。
    """
    global s
    marker = b.strip().splitlines()[0].strip()
    if marker and marker in s:
        return False
    if s.count(a) != 1:
        sys.exit('锚点不唯一(%d): %s' % (s.count(a), why))
    s = s.replace(a, b)
    return True


# 1. 主题按钮 + 选择区外壳
done.append(('主题按钮+选择区', once('</header>\n\n<div class="drop" id="drop">',
    '</header>\n\n'
    '<button class="lgThemeBtn" id="lgThemeBtn" type="button" aria-label="切换深色/浅色" hidden>\n'
    '  <svg class="iMoon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg>\n'
    '  <svg class="iSun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/></svg>\n'
    '</button>\n\n'
    '<!-- 选择视频：原交互区保留（点击/拖拽/无障碍），玻璃垫在后面 -->\n'
    '<div class="dropWrap">\n'
    '  <div class="lgHost" data-lg="drop"></div>\n'
    '  <div class="drop" id="drop">', 'theme btn')))

done.append(('选择区收尾', once('<input type="file" id="file" accept="video/*">\n</div>',
    '<input type="file" id="file" accept="video/*">\n  </div>\n</div>', 'drop close')))

# 2. 分辨率 / 画质：玻璃控件 + 原 HTML 控件（降级）
done.append(('分辨率玻璃', once('<div class="optRow">\n    <span class="optKey">分辨率</span>',
    '<div class="lgRowHead lgBlock"><span class="k">分辨率</span><span class="v" id="lgResVal">1080p</span></div>\n'
    '  <!-- 液态玻璃按钮组：库不可用时（html 上没有 .lg-on）自动退回下面的 HTML 胶囊 -->\n'
    '  <div class="lgHost lgBlock" data-lg="res" data-lg-control="1"></div>\n'
    '  <div class="optRow lgReplaced" id="resRow">\n'
    '    <span class="optKey">分辨率</span>', 'res row')))

done.append(('画质玻璃', once('<div class="optRow">\n    <span class="optKey">画质</span>',
    '<div class="lgRowHead lgBlock"><span class="k">画质</span><span class="v" id="lgQVal">4 Mbps</span></div>\n'
    '  <div class="lgHost lgBlock" data-lg="q" data-lg-control="1"></div>\n'
    '  <div class="optRow lgReplaced">\n'
    '    <span class="optKey">画质</span>', 'q row')))

# 3. 压缩按钮：玻璃宿主放进按钮「内部」第一个子元素。
#    放外面时要靠绝对定位去对齐按钮，位置受各种上边距影响容易错位；
#    放进内部后 inset:0 就是按钮本身，天然严丝合缝。
START_HOST = '<div class="lgHost" data-lg="start"></div>'
if START_HOST not in s:
    a = '  <div class="actBtn" id="start" role="button" tabindex="0">'
    if s.count(a) != 1:
        sys.exit('压缩按钮锚点不唯一')
    s = s.replace(a, a + '\n    ' + START_HOST)
    done.append(('压缩按钮玻璃', True))
else:
    done.append(('压缩按钮玻璃', False))

# 4. 状态钩子
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
    done.append(('状态钩子', True))
else:
    done.append(('状态钩子', False))

open(P, 'w', encoding='utf-8').write(s)
for name, ch in done:
    print('  %s：%s' % (name, '已应用' if ch else '已存在'))
print('  start 宿主数：%d' % s.count('data-lg="start"'))
