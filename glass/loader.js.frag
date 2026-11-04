/* ---------- 液态玻璃（渐进增强，失败不影响主流程） ---------- */
// 组件库约 340KB（CDN 上 br 后约 100KB），首屏完全用不上，
// 所以放在页面 load 之后的下一个空闲时段才注入，再按需加载本站的接线脚本。
// 不允许主流程等它：任何环节失败都只是退回原来的 HTML 控件。
// 必须走本站域名：线上页面带 COEP: require-corp（WebCodecs 多线程需要），
// 而 CDN 的 liquid-glass.js 没有 Cross-Origin-Resource-Policy 头，浏览器会直接拒载。
// 文件在 lib/liquid-glass.js（v2.5，417KB），升级时替换它并改这里的版本号。
const GLASS_SRC = './lib/liquid-glass.js?v=2.5';
let glassPromise = null;

function loadGlass() {
  if (glassPromise) return glassPromise;
  glassPromise = new Promise(resolve => {
    // 省流模式下不拉额外资源，直接用轻量界面
    if (navigator.connection && navigator.connection.saveData) return resolve(false);

    if (customElements.get('liquid-glass')) return mountGlass(resolve);

    const s = document.createElement('script');
    s.src = GLASS_SRC;
    s.onload = () => mountGlass(resolve);
    // CDN 挂掉时不重试、不卡流程，页面维持原生外观
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  return glassPromise;
}

// 库就绪后再挂我们的适配层：它负责给每块玻璃喂背景壁纸、补渲染、
// 并在末尾按序注入接线层（lg-app）。
function mountGlass(resolve) {
  const s = document.createElement('script');
  s.src = GLASS_BOOT;
  s.onload = () => resolve(true);
  s.onerror = () => resolve(false);
  document.head.appendChild(s);
}

function bootGlass() {
  loadGlass().catch(() => {});
}
window.addEventListener('load', () => setTimeout(() => {
  // 放到空闲时段，和编码库预载错开，避免同时抢主线程
  if ('requestIdleCallback' in window) requestIdleCallback(bootGlass, { timeout: 2500 });
  else setTimeout(bootGlass, 800);
}, 400));

// 适配层脚本路径，由 tools/split.py 在构建时填入
const GLASS_BOOT = /*GLASS_BOOT*/''/*/GLASS_BOOT*/;

