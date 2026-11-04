#!/usr/bin/env python3
"""
拆分 index.html 里的内联 CSS / JS 为独立文件，并生成带内容指纹的文件名。

为什么这么做：
  index.html 是 max-age=0,must-revalidate，每次都回源；里面内联的 20KB+ CSS
  和 20KB+ JS 因此每次都要重新下载。拆出去后 HTML 只剩骨架，样式和脚本带
  指纹文件名 + 一年长缓存，重复访问几乎零成本。

为什么用指纹文件名：
  如果 app.js 固定名字又长缓存，改了代码后用户浏览器还拿着旧的 JS，
  和新的 HTML 对不上就会白屏 / 行为错乱。指纹文件名保证内容一变 URL 就变。

液态玻璃层（glass/）：
  glass/*.css、glass/*.js 是对外源目录，同样复制成 assets/ 下的指纹文件；
  CSS 由 <!--GLASS--> 标记处插入 <link>，JS 的路径写进 app.js 的 UI_SCRIPTS
  数组（库加载完才按需注入，所以首屏不执行它们）。

用法：python3 tools/split.py     （在仓库根目录运行，或任意目录均可）
"""
import hashlib
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(ROOT, 'index.html')
ASSETS = os.path.join(ROOT, 'assets')
GLASS = os.path.join(ROOT, 'glass')

CSS_LINK_MARK = '<!--CSS-->'
JS_LINK_MARK = '<!--APPJS-->'
GLASS_MARK = '<!--GLASS-->'
UI_MARK = '/*UI_SCRIPTS*/[]/*/UI_SCRIPTS*/'
UI_MARK_CLIENT = UI_MARK


def digest(text):
    return hashlib.sha256(text.encode()).hexdigest()[:10]


def emit(name, content, kind):
    """写 assets/<name>.<hash>.<kind>，返回相对路径。"""
    rel = 'assets/%s.%s.%s' % (name, digest(content), kind)
    open(os.path.join(ROOT, rel), 'w', encoding='utf-8').write(content)
    return rel


def one_inline(html, tag):
    blocks = re.findall(r'<%s>(.*?)</%s>' % (tag, tag), html, re.S)
    if len(blocks) != 1:
        sys.exit('期望恰好 1 个内联 <%s>，实际 %d 个。'
                 '若已拆分过，请先 git checkout index.html' % (tag, len(blocks)))
    return blocks[0]


def one_has(html, tag):
    return bool(re.search(r'<%s>(.*?)</%s>' % (tag, tag), html, re.S))


def main():
    html = open(INDEX, encoding='utf-8').read()

    # 已是拆分形态（外链指纹文件）→ 从上次产物取回内容，支持反复构建
    split = not one_has(html, 'style')
    if split:
        css_rel = re.search(r'href="\./(assets/style\.[0-9a-f]+\.css)"', html)
        js_rel = re.search(r'src="\./(assets/app\.[0-9a-f]+\.js)"', html)
        if css_rel and js_rel:
            css = open(os.path.join(ROOT, css_rel.group(1)), encoding='utf-8').read()
            js = open(os.path.join(ROOT, js_rel.group(1)), encoding='utf-8').read()
            base = html
            base = re.sub(r'<link rel="stylesheet" href="\./' + re.escape(css_rel.group(1)) + r'">',
                          CSS_LINK_MARK, base)
            base = re.sub(r'<script type="module" src="\./' + re.escape(js_rel.group(1)) + r'"></script>',
                          JS_LINK_MARK, base)
        else:
            sys.exit('index.html 已拆分但找不到指纹文件引用，请 git checkout index.html')
    else:
        css = one_inline(html, 'style')
        # 页面里可能还有别的小内联脚本（如首帧主题引导），只取最长的那个当应用主体
        blocks = re.findall(r'<script>(.*?)</script>', html, re.S)
        if not blocks:
            sys.exit('没找到内联 <script>')
        js = max(blocks, key=len)
        base = html.replace('<style>' + css + '</style>', CSS_LINK_MARK)
        base = base.replace('<script>' + js + '</script>', JS_LINK_MARK, 1)

    os.makedirs(ASSETS, exist_ok=True)
    old_files = {fn: os.path.getmtime(os.path.join(ASSETS, fn)) for fn in os.listdir(ASSETS)}

    # 玻璃层：CSS 并进 style 表走同一个 <link>；
    # JS 由 lg-boot 按顺序注入（先它自己，再接线层）
    boot_src, boot_rel = None, None
    wiring = []
    if os.path.isdir(GLASS):
        for fn in sorted(os.listdir(GLASS)):
            body = open(os.path.join(GLASS, fn), encoding='utf-8').read()
            if fn.endswith('.css'):
                css = css.rstrip() + '\n\n' + body
            elif fn.endswith('.js') and fn != 'lg-boot.js':
                wiring.append('./' + emit(fn[:-3], body, 'js'))
    boot_body = open(os.path.join(GLASS, 'lg-boot.js'), encoding='utf-8').read()
    boot_body = boot_body.replace(UI_MARK, '[' + ', '.join(repr(x) for x in wiring) + ']')
    boot_rel = 'assets/lg-boot.%s.js' % digest(boot_body)
    print('   lg-boot 内联的接线层:', wiring)
    open(os.path.join(ROOT, boot_rel), 'w', encoding='utf-8').write(boot_body)
    js = js.replace(UI_MARK, '[]')
    # 页面先注入适配层（lg-boot），接线层由它在末尾自己按序加载
    js = re.sub(r'/\*GLASS_BOOT\*/[\s\S]*?/\*/GLASS_BOOT\*/',
                lambda m: repr('./' + boot_rel), js)
    base = base.replace(GLASS_MARK, '')

    css_name = emit('style', css, 'css')
    js_name = emit('app', js, 'js')

    # CSS 用普通 <link>（首屏关键样式，不能等）。
    # JS 用 type="module"：模块脚本天生是 defer 语义，解析完才执行，
    # 这样脚本顶层的 $('drop') 之类 DOM 取值依然能拿到元素。
    out = base.replace(CSS_LINK_MARK, '<link rel="stylesheet" href="./%s">' % css_name)
    out = out.replace(JS_LINK_MARK, '<script type="module" src="./%s"></script>' % js_name)

    open(INDEX, 'w', encoding='utf-8').write(out)

    # 清理：assets/ 里不再被引用的旧指纹文件
    keep = {p.rsplit('/', 1)[-1] for p in re.findall(r'\./(assets/[^"\'?>]+)', out)}
    for fn in old_files:
        path = os.path.join(ASSETS, fn)
        if fn not in keep and os.path.exists(path):
            os.remove(path)
            print('  移除旧产物', fn)

    print('  ' + css_name)
    print('  ' + js_name)
    for p in [boot_rel] + wiring:
        print('  ' + re.sub(r'^\./', '', p).split('"')[0])
    print('  index.html %d 字节' % len(out.encode()))


if __name__ == '__main__':
    main()
