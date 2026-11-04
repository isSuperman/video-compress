#!/usr/bin/env python3
"""
拆分 index.html 里的内联 CSS / JS 为独立文件，并生成带内容指纹的文件名。

为什么这么做：
  index.html 是 max-age=0,must-revalidate，每次都回源；里面内联的 23KB CSS
  和 19KB JS 因此每次都要重新下载。拆出去后 HTML 只剩骨架（约 1-2KB），
  样式和脚本带指纹文件名 + 一年长缓存，重复访问几乎零成本。

为什么用指纹文件名：
  如果 app.js 固定名字又长缓存，改了代码后用户浏览器还拿着旧的 JS，
  和新的 HTML 对不上就会白屏 / 行为错乱。指纹文件名保证内容一变 URL 就变。

用法：python3 tools/split.py     （在仓库根目录运行，或任意目录均可）
产物：assets/app.<hash>.js、assets/style.<hash>.css，并改写 index.html
"""
import hashlib
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(ROOT, 'index.html')
ASSETS = os.path.join(ROOT, 'assets')

MARK = '/* ==SPLIT-MARKER== */'


def main():
    html = open(INDEX, encoding='utf-8').read()

    # 只处理「最后一个」内联 style/script 块：页面只有一份应用代码和一份样式，
    # 但内联 <style> 可能被后续若干净化再拆。这里要求各恰好一块，多或少都报错。
    styles = re.findall(r'<style>(.*?)</style>', html, re.S)
    scripts = re.findall(r'<script>(.*?)</script>', html, re.S)
    if len(styles) != 1:
        sys.exit(f'期望恰好 1 个内联 <style>，实际 {len(styles)} 个。若已拆分过，请先 git checkout index.html')
    if len(scripts) != 1:
        sys.exit(f'期望恰好 1 个内联 <script>，实际 {len(scripts)} 个')

    css = styles[0]
    js = scripts[0]

    os.makedirs(ASSETS, exist_ok=True)

    css_hash = hashlib.sha256(css.encode()).hexdigest()[:10]
    js_hash = hashlib.sha256(js.encode()).hexdigest()[:10]
    css_name = f'assets/style.{css_hash}.css'
    js_name = f'assets/app.{js_hash}.js'

    open(os.path.join(ROOT, css_name), 'w', encoding='utf-8').write(css)
    open(os.path.join(ROOT, js_name), 'w', encoding='utf-8').write(js)

    # 把内联块换成外链。CSS 用普通 <link>（首屏关键样式，不能等）。
    # JS 用 type="module"：模块脚本天生是 defer 语义，解析完才执行，
    # 这样脚本顶层的 $('drop') 之类 DOM 取值依然能拿到元素。
    # （普通的 defer 也行，但 module 还能防止以后误加 var 污染全局。）
    html = html.replace(
        '<style>' + css + '</style>',
        f'<link rel="stylesheet" href="./{css_name}">'
    )
    html = html.replace(
        '<script>' + js + '</script>',
        f'<script type="module" src="./{js_name}"></script>'
    )

    open(INDEX, 'w', encoding='utf-8').write(html)

    # 清理上一版带指纹的产物，避免 assets 目录无限增长
    for f in os.listdir(ASSETS):
        full = os.path.join(ASSETS, f)
        if f == os.path.basename(css_name) or f == os.path.basename(js_name):
            continue
        if re.match(r'^(style|app)\.[0-9a-f]{10}\.(css|js)$', f):
            os.remove(full)
            print(f'清理旧产物: assets/{f}')

    print(f'CSS -> {css_name} ({len(css.encode())} bytes)')
    print(f'JS  -> {js_name} ({len(js.encode())} bytes)')
    print(f'index.html -> {len(html.encode())} bytes')


if __name__ == '__main__':
    main()
