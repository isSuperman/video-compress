// GooseHyperGlass 适配层（在 liquid-glass.js 加载完之后执行）
//
// 这个库的"玻璃"只折射它自己的壁纸（wallpaper 属性），不会去抓页面背景。
// 所以要让它融入页面，得给每块玻璃喂一张"跟它所在位置页面背景一模一样"的壁纸：
// 页面背景 = 底色 + 三团径向光晕（body::before）+ 44px 网格（body::after）。
// 这里用 Canvas2D 按同样的参数、在组件的局部坐标系里重绘一遍。
//
// 两个坑：
//   1. 组件靠 ResizeObserver 首次测量，尺寸为 0 时永远不画 → 挂载后手动补一次；
//   2. 画布必须溢满宿主盒；只给它 auto 尺寸会量出 0。
(function () {
  'use strict';

  var HOSTS = '.lgHost';
  var CARDS = '.card';
  // 主题由 <html data-theme="light|dark"> 决定（首帧前由内联脚本写入，
  // 按钮切换后写回 localStorage），组件跟着它走。
  var darkMQ = window.matchMedia('(prefers-color-scheme: dark)');

  function currentTheme() {
    var t = document.documentElement.getAttribute('data-theme');
    return t === 'light' || t === 'dark' ? t : (darkMQ.matches ? 'dark' : 'light');
  }
  function isDark() { return currentTheme() === 'dark'; }
  function list(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  /* ---------- 与页面同款的壁纸 ---------- */
  // 取 CSS 里定义的光晕色（--g1/--g2/--g3）与网格间距，保证玻璃内外一致
  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function makeWallpaper(w, h, top) {
    // 壁纸只承载大块光晕和网格线，按 0.75 缩小就够用，
    // 能显著减小 data URL 体积（每块玻璃都会内联一份）
    var S = 0.75;
    var c = document.createElement('canvas');
    c.width = Math.max(2, Math.round(w * S));
    c.height = Math.max(2, Math.round(h * S));
    var g = c.getContext('2d');
    g.setTransform(S, 0, 0, S, 0, 0);   // 之后的坐标都用 CSS 像素
    var W = w, H = h;
    var dark = isDark();

    g.fillStyle = dark ? cssVar('--bg', '#05060a') : cssVar('--bg', '#eef1f7');
    g.fillRect(0, 0, W, H);

    // body::before：inset:-20% -20% auto -20%; height:80vh，三团径向渐变
    var vw = document.documentElement.clientWidth;
    var vh = window.innerHeight;
    var bw = vw * 1.4, bh = vh * 0.8, bx = -0.2 * vw, by = -0.2 * vh;
    // 壁纸会被玻璃内部做亮度/饱和度处理，直接用 CSS 原色会暗成一片，
    // 这里把光晕加强 1.8 倍，透过玻璃后才是页面上看到的那种淡色光斑。
    var blobs = dark
      ? [[0.22, 0.08, 0.62, 0.55, 'rgba(63,216,255,0.55)'],
         [0.84, 0.16, 0.60, 0.52, 'rgba(157,107,255,0.50)'],
         [0.50, 0.46, 0.72, 0.56, 'rgba(79,124,255,0.34)']]
      : [[0.22, 0.08, 0.62, 0.55, 'rgba(63,200,255,0.55)'],
         [0.84, 0.16, 0.60, 0.52, 'rgba(157,107,255,0.45)'],
         [0.50, 0.46, 0.72, 0.56, 'rgba(79,124,255,0.30)']];

    blobs.forEach(function (b) {
      var cx = bx + b[0] * bw;
      var cy = by + b[1] * bh + top;      // top = 组件在页面坐标系里的绝对位置
      var rx = b[2] * bw / 2, ry = b[3] * bh / 2;
      if (rx <= 0 || ry <= 0) return;
      g.save();
      g.translate(cx, cy);
      g.scale(1, ry / rx);
      var grad = g.createRadialGradient(0, 0, 0, 0, 0, rx);
      grad.addColorStop(0, b[4]);
      grad.addColorStop(0.68, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(-rx, -rx * 1.6, rx * 2, rx * 3.2);
      g.restore();
    });

    // body::after：44px 网格，随视口固定
    g.strokeStyle = cssVar('--grid', dark ? 'rgba(255,255,255,.022)' : 'rgba(20,30,60,.05)');
    g.lineWidth = 1;
    for (var x = 16; x < W + 44; x += 44) {
      g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); g.stroke();
    }
    var first = ((-top % 44) - 44) % 44;
    for (var y = first; y < H + 44; y += 44) {
      g.beginPath(); g.moveTo(0, Math.round(y) + 0.5); g.lineTo(W, Math.round(y) + 0.5); g.stroke();
    }
    return c;
  }

  var WP_CACHE = new Map();

  function paint(el, host) {
    var r = host.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    var top = r.top + window.scrollY;
    var key = [Math.round(r.width), Math.round(r.height), Math.round(top / 4), isDark() ? 'd' : 'l'].join('|');
    var url = WP_CACHE.get(key);
    if (!url) {
      url = makeWallpaper(r.width, r.height, top).toDataURL('image/png');
      WP_CACHE.set(key, url);
      if (WP_CACHE.size > 40) WP_CACHE.delete(WP_CACHE.keys().next().value);
    }
    if (!el.__lgOpacity) {
      // 画布是"玻璃膜"：不透明才能盖住背景做折射，整体再降一档透明度透出一点底
      var c = el.shadowRoot && el.shadowRoot.querySelector('canvas');
      if (c) {
        // 画布是"玻璃面"：略微收进边缘，避免盖住内容的像素；
        // 透明度再降一档，下面的文字才能真正透出来
        // 卡片玻璃往里收一圈，让卡片自带的标签与正文能从边缘透出来
        var inset = host.hasAttribute('data-lg-panel') ? '22px' : '1px';
        c.style.inset = inset;
        c.style.width = 'calc(100% - ' + (parseInt(inset) * 2) + 'px)';
        c.style.height = 'calc(100% - ' + (parseInt(inset) * 2) + 'px)';
        c.style.opacity = host.getAttribute('data-lg-opacity')
          || (host.hasAttribute('data-lg-panel') ? '0.5' : '0.72');
      }
      el.__lgOpacity = true;
    }
    if (el.__lgWp !== url) {
      el.__wpPending = true;
      el.__lgWp = url;
      el.setAttribute('wallpaper', url);
      el._gradientLoaded = false;
    }
    return true;
  }

  /* ---------- 渲染补帧 ---------- */
  // 组件内部靠 ResizeObserver 首次测量；某些环境（无头/隐藏标签）回调不触发，
  // 这里主动量一次尺寸再画一帧。真机上重复绘制只是同一帧，没有副作用。
  function kick(el) {
    if (!el._renderer) return;
    if (!el._w || !el._h) el._resize();
    if (!el._w || !el._h) return;
    try {
      el._maybeLoadGradient();
      el._rebuild();
      el._renderer.gooseReqRender();
      el._renderer.gooseRender();
    } catch (e) { /* 组件内部异常不影响页面 */ }
  }

  /* ---------- 叠放与尺寸 ---------- */
  function styleHost(host) {
    var el = host.querySelector('liquid-glass');
    if (!el) {
      // 宿主在 HTML 里是空的（组件由 JS 建），缺了要补上
      el = document.createElement('liquid-glass');
      if (host.getAttribute('data-lg-control')) {
        // 控件类宿主：mode 必须挂载前就设好，否则会先按默认值画一帧
        el.setAttribute('mode', host.getAttribute('data-lg') === 'q' ? 'single-slider' : 'buttons');
      } else {
        el.setAttribute('mode', 'scroll-container');
      }
      host.appendChild(el);
    }
    // 覆盖式宿主不是控件，用"单开关"的首层来做纯玻璃（其余层是空白，不会多画东西）
    if (!host.getAttribute('data-lg-control')) {
      // 卡片玻璃与覆盖式玻璃都用 scroll-container：它只画玻璃卡片，
      // 不会像开关/滑块那样顺带画出自己的控件
      if (el.getAttribute('mode') !== 'scroll-container') el.setAttribute('mode', 'scroll-container');
    }
    var mode = (el.getAttribute('mode') || 'bottom-tabs').toLowerCase();
    if (host.dataset.lgMode !== mode) host.dataset.lgMode = mode;
    return el;
  }

  // 覆盖式宿主（选择区 / 压缩按钮）高度必须由实测像素决定：
  // 高度为 auto 时绝对定位的子元素会量出 0，组件就永远不画。
  function placeOverlayHosts() {
    // 覆盖式宿主的高度必须用实测像素写死：WebGL 画布在尺寸为 0 时不会绘制。
    // start 的宿主在按钮内部（inset:0 定位），高度取按钮自身。
    var map = { drop: '#drop', start: '#start' };
    Object.keys(map).forEach(function (k) {
      var host = document.querySelector('.lgHost[data-lg="' + k + '"]');
      var target = document.querySelector(map[k]);
      if (!host || !target) return;
      var h = Math.round(target.offsetHeight);
      if (h > 0 && host.style.height !== h + 'px') host.style.height = h + 'px';
    });
  }

  /* ---------- 卡片：内容外面垫一层同尺寸玻璃 ---------- */
  function syncPanels() {
    list(CARDS).forEach(function (card) {
      var g = card.querySelector('.lgHost[data-lg-panel]');
      if (!g) {
        g = document.createElement('div');
        g.className = 'lgHost lgPanelHost';
        g.setAttribute('data-lg-panel', '1');
        g.appendChild(document.createElement('liquid-glass'));
        card.insertBefore(g, card.firstChild);
      }
      g.style.height = card.offsetHeight + 'px';
      wire(g);
    });
  }

  /* ---------- 主题 ---------- */
  function syncTheme() {
    var dark = isDark();
    document.documentElement.classList.toggle('dark', dark);
    var btn = document.getElementById('lgThemeBtn');
    if (btn) btn.setAttribute('data-theme', dark ? 'dark' : 'light');
    list(HOSTS).forEach(function (h) {
      var el = h.querySelector('liquid-glass');
      if (el && el.hasAttribute('dark') !== dark) {
        if (dark) el.setAttribute('dark', ''); else el.removeAttribute('dark');
        el.__lgWp = null; // 主题变了，壁纸要重画
      }
    });
    WP_CACHE.clear();
    scan();
  }

  function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('vmc-theme', t); } catch (e) {}
    var btn = document.getElementById('lgThemeBtn');
    if (btn) btn.setAttribute('data-theme', t);
    syncTheme();
  }

  // 用户没手动选过时跟随系统；手动选过就以 data-theme 为准
  if (darkMQ.addEventListener) {
    darkMQ.addEventListener('change', function () { syncTheme(); });
  }
  // 任何地方改了 data-theme（按钮、外部脚本）都同步重绘玻璃
  new MutationObserver(function () { syncTheme(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  /* ---------- 交互转发 ---------- */
  function flash(t) {
    if (!t) return;
    t.classList.add('lgPress');
    setTimeout(function () { t.classList.remove('lgPress'); }, 220);
  }
  function forward(e) {
    if (!e.target.closest) return;
    var host = e.target.closest(HOSTS);
    if (!host || !host.__lgTarget) return;
    if (e.target.tagName === 'CANVAS') return; // 组件自己的手势
    if (e.type === 'pointerdown') flash(host.__lgTarget);
    host.__lgTarget.click();
  }

  function wire(host) {
    var el = styleHost(host);
    if (!el) return;
    if (!paint(el, host)) return;   // 尺寸为 0（卡片还没展开）等 ResizeObserver
    kick(el);
    if (!host.__lgWired) {
      host.__lgWired = true;
      host.addEventListener('pointerdown', forward, { passive: true });
    }
  }

  function scan() {
    placeOverlayHosts();
    list(HOSTS).forEach(wire);
  }

  /* ---------- 启动 ---------- */
  function boot() {
    if (!customElements.get('liquid-glass')) return;
    document.documentElement.classList.add('lg-on');
    syncTheme();
    syncPanels();
    scan();

    // 新出现的玻璃宿主（压缩完成换卡、控件重建）自动接线
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        if (muts[i].addedNodes.length) { setTimeout(scan, 0); return; }
      }
    }).observe(document.body, { childList: true, subtree: true });

    // 卡片高度随流程变化（收起/展开）→ 同步玻璃高度
    if ('ResizeObserver' in window) {
      var ro = new ResizeObserver(function (entries) {
        entries.forEach(function (en) {
          var g = en.target.querySelector('.lgHost[data-lg-panel]');
          var h = en.target.offsetHeight;
          if (g && h && g.style.height !== h + 'px') { g.style.height = h + 'px'; wire(g); }
        });
      });
      list(CARDS).forEach(function (c) { ro.observe(c); });
    }

    window.addEventListener('resize', function () {
      WP_CACHE.clear();
      setTimeout(scan, 80);
    }, { passive: true });

    var st = null;
    window.addEventListener('scroll', function () {
      clearTimeout(st);
      st = setTimeout(function () { WP_CACHE.clear(); scan(); }, 300);
    }, { passive: true });
  }

  // 调试用：把画布内联样式清掉，看文字是否能透出来
  window.LG_resetCanvas = function () {
    list(HOSTS).forEach(function (h) {
      var el = h.querySelector('liquid-glass');
      if (el) el.__lgOpacity = false;
    });
  };

  window.LG = {
    boot: boot,
    scan: scan,
    syncPanels: syncPanels,
    theme: currentTheme,
    setTheme: setTheme
  };

  boot();
})();

// 上面全部就绪后，按顺序注入本站接线层（lg-app.js）。
// 它直接用 LG.syncPanels / LG.setTheme，必须等 window.LG 定义好。
// 路径由 tools/split.py 在构建时填入。
const UI_SCRIPTS = ['./assets/lg-app.c4fc50ece8.js'];
(function loadWiring() {
  var files = UI_SCRIPTS.slice();
  (function next() {
    var src = files.shift();
    if (!src) { window.dispatchEvent(new Event('lg-ready')); return; }
    var s = document.createElement('script');
    s.src = src;
    s.onload = next;
    s.onerror = next;
    document.head.appendChild(s);
  })();
})();
