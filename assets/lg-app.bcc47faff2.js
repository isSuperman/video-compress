// 把页面里现有的 HTML 控件接上液态玻璃（渐进增强，库不在时页面照常可用）
//
// 位置：库加载完成之后才执行（由 app.js 的 loadGlass 注入）。
// 参数：window.VC_UI_HOOKS —— app.js 暴露的动作钩子，用来同步页面内部状态，
//       这里不直接读写 app.js 的模块作用域变量。
(function () {
  'use strict';

  var hooks = window.VC_UI_HOOKS;
  if (!hooks || !window.LG || !customElements.get('liquid-glass')) return;

  var RES_LABEL = { '1080': '1080p', '720': '720p', '480': '480p' };

  // 画质滑块的 0-100 → 三档（小 / 标准 / 高）
  function qualityOf(v) {
    if (v < 34) return { idx: 0, label: '2 Mbps' };
    if (v < 67) return { idx: 1, label: '4 Mbps' };
    return { idx: 2, label: '8 Mbps' };
  }
  var qValue = 50, lastQ = 50;

  function host(name, mode, height, corner) {
    var h = document.querySelector('.lgHost[data-lg="' + name + '"]');
    if (!h) return null;
    var el = h.querySelector('liquid-glass');
    if (!el) {
      // 适配层还没来得及建：先自己建好并写入 mode，再去触发接线
      el = document.createElement('liquid-glass');
      h.appendChild(el);
    }
    // 注意：mode 必须在这里（重新挂载前）设好。组件默认 mode 是 bottom-tabs，
    // 如果等挂载后才改，会先画出一排 Tab 再闪成目标控件。
    el.setAttribute('mode', mode);
    el.setAttribute('dpr', '2');
    if (corner) el.setAttribute('corner-style', corner);
    h.style.height = height + 'px';
    return { host: h, el: el };
  }

  /* ---------- 分辨率：按钮组 ---------- */
  // 按钮组没有"选中项"API：选中的那档用库自带的蓝色填充（style:'blue'），
  // 其余用玻璃面（'surface'）。切换时一次性重设整组，只重建一次不闪。
  var res = host('res', 'buttons', 3 * 52, '1');
  if (res) {
    var ids = hooks.resolutions.map(function (t) { return t.id; });
    var active = hooks.currentRes();

    var apply = function (id) {
      active = id;
      res.el.setButtons(hooks.resolutions.map(function (t) {
        return { id: t.id, label: t.label, style: t.id === id ? 'blue' : 'surface' };
      }));
      var out = document.getElementById('lgResVal');
      if (out) out.textContent = RES_LABEL[id] || id;
    };

    setTimeout(function () { apply(active); }, 120);

    document.addEventListener('lg-buttontap', function (e) {
      if (!res.host.contains(e.target)) return;
      var id = e.detail && e.detail.id;
      if (ids.indexOf(id) < 0 || id === active) return;
      hooks.onRes(id);
      apply(id);
    });
  }

  /* ---------- 画质：滑块 ---------- */
  var q = host('q', 'single-slider', 132, '1');
  if (q) {
    // 组件默认 sliderValue 是 50，正好是"标准"档
    setTimeout(function () { q.el.setState({ sliderValue: qValue }); }, 120);
    var out0 = document.getElementById('lgQVal');
    if (out0) out0.textContent = qualityOf(qValue).label;

    document.addEventListener('lg-statechange', function (e) {
      if (!q.host.contains(e.target)) return;
      var v = e.detail && e.detail.sliderValue;
      // 拖拽过程会持续派发，值没变就不重复处理
      if (typeof v !== 'number' || v === lastQ) return;
      lastQ = v;
      var lv = qualityOf(v);
      hooks.onQuality(lv.idx);
      var out = document.getElementById('lgQVal');
      if (out) out.textContent = lv.label;
    });
  }

  /* ---------- 主题按钮（页面右上角） ---------- */
  var tb = document.getElementById('lgThemeBtn');
  if (tb) {
    tb.hidden = false;
    tb.addEventListener('click', function () {
      LG.setTheme(LG.theme() === 'dark' ? 'light' : 'dark');
    });
  }

  /* ---------- 玻璃占位 → 真实控件的点击转发 ---------- */
  var map = { drop: 'drop', start: 'start' };
  Object.keys(map).forEach(function (k) {
    var h = document.querySelector('.lgHost[data-lg="' + k + '"]');
    var t = document.getElementById(map[k]);
    if (h && t) h.__lgTarget = t;
  });

  // 卡片类面板的高度跟随内容（玻璃画布必须有确定的 CSS 尺寸才会渲染）
  LG.syncPanels();

  window.dispatchEvent(new Event('lg-wired'));
})();
