#!/usr/bin/env python3
"""对 app.js 主体的补丁集合（幂等，可重复执行）。

放在脚本里而不是手改产物：rebuild.sh 每次都从 git 的 index.html 重新内联，
手改的产物会被覆盖。
"""
import sys

ROOT = '/var/minis/workspace/vc-git/'
P = ROOT + 'index.html'


def patch(s, old, new, label):
    if new.strip().splitlines()[0].strip() in s:
        return s, False
    if old not in s:
        sys.exit('补丁锚点缺失：%s' % label)
    return s.replace(old, new, 1), True


s = open(P, encoding='utf-8').read()
report = []

# ---- 1. 压缩防重入 ----
s, ch = patch(s, """async function startConvert() {
  if (!srcFile || !srcInfo || $('start').classList.contains('disabled')) return;

  setBtnState('busy', '准备中');""", """// 压缩进行中的硬开关。
// 以前只拦 disabled，busy 状态没拦——连点两次会并行跑两个 conversion，
// 两个 onProgress 交替写进度条和百分比，界面上出现重影/跳动的进度文本。
let converting = false;

async function startConvert() {
  if (converting) return;                       // 已在压缩，忽略重复触发
  if (!srcFile || !srcInfo) return;
  if ($('start').classList.contains('disabled')) return;

  converting = true;
  setBtnState('busy', '准备中');""", 'startConvert 入口')
report.append(('防重入入口', ch))

# ---- 2. 结束释放锁 ----
s, ch = patch(s, """  } finally {
    // 失败时按钮要回到可点状态；成功时卡片已隐藏，无需处理
    const b = $('start');""", """  } finally {
    converting = false;
    // 失败时按钮要回到可点状态；成功时卡片已隐藏，无需处理
    const b = $('start');""", 'startConvert finally')
report.append(('释放锁', ch))

# ---- 3. 压缩中禁用交互 ----
s, ch = patch(s, "  b.classList.toggle('busy', state === 'busy');",
              "  b.classList.toggle('busy', state === 'busy');\n"
              "  // 压缩中彻底关掉交互：连点在视觉和事件两层都拿不到反馈\n"
              "  b.setAttribute('aria-disabled', state === 'busy' || state === 'disabled' ? 'true' : 'false');",
              'setBtnState')
report.append(('aria-disabled', ch))

open(P, 'w', encoding='utf-8').write(s)
for name, ch in report:
    print('  %s：%s' % (name, '已应用' if ch else '已存在'))
