












const $ = id => document.getElementById(id);

/* ---------- 懒加载 mediabunny ---------- */
// 这个包压缩后约 190KB，之前用同步 <script> 放在页面前面，会阻塞首屏渲染。
// 现在改成用户选了视频（或即将压缩）时才注入，首屏只付 HTML+CSS 的成本。
//
// 预取策略：解析 <head> 里的 prefetch 只写进 HTTP 缓存，脚本还是要等注入那一刻
// 才真正执行。所以这里在首屏 load 之后（此时 <head> 的 prefetch 多半已经下完）
// 直接把同一个 URL 的脚本注入执行——命中缓存，几乎瞬时完成。
// 这样用户点「选择视频」→ 从相册里挑片子（通常好几秒）的这段时间里，
// 编码库早就编译好了，选完立刻就能出预览，不必再等它下载+解析。
// 代价只是首屏之后多解析一个 190KB 的脚本，不影响首屏任何指标。
let mbPromise = null;
let mbPreloaded = false;
function loadMB() {
  if (window.Mediabunny) return Promise.resolve(window.Mediabunny);
  if (!mbPromise) {
    mbPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = './lib/mediabunny.bundle.js';
      s.async = true;
      s.onload = () => window.Mediabunny
        ? resolve(window.Mediabunny)
        : reject(new Error('MEDIABUNNY_MISSING'));
      s.onerror = () => reject(new Error('MEDIABUNNY_LOAD_FAILED'));
      document.head.appendChild(s);
    }).catch(e => { mbPromise = null; throw e; });
  }
  return mbPromise;
}

// 首屏彻底空闲后再预加载，失败静默（真正需要时 loadMB 会重试）
function preloadMBWhenIdle() {
  if (mbPreloaded || window.Mediabunny) return;
  mbPreloaded = true;
  const go = () => {
    const conn = navigator.connection;
    // 省流模式下不动，避免无谓消耗
    if (conn && conn.saveData) return;
    loadMB().catch(() => {});
  };
  if ('requestIdleCallback' in window) {
    requestIdleCallback(go, { timeout: 3000 });
  } else {
    setTimeout(go, 1200);
  }
}
window.addEventListener('load', () => setTimeout(preloadMBWhenIdle, 600));

let srcFile = null, srcInfo = null, lastBlob = null, lastName = '';
let selRes = 1080, selQ = 4;

/* ---------- 版本号 ---------- */
// 读取 version.json（构建时由 build.sh 生成）。
// 顺便对比缓存版本：如果服务器版本比当前页面新，说明有未刷新的更新。
const APP_VERSION = (() => {
  const el = document.getElementById('verText');
  const box = document.getElementById('verLine');
  let current = null;

  async function fetchVersion(bust) {
    const url = './version.json' + (bust ? '?t=' + Date.now() : '');
    const r = await fetch(url, bust ? { cache: 'no-store' } : undefined);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    // 若站点没有 version.json，Pages 会回退返回 index.html，
    // 这里按 content-type 判断，避免把 HTML 当 JSON 解析后报错
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('json')) throw new Error('NO_VERSION_FILE');
    return r.json();
  }

  async function init() {
    try {
      const v = await fetchVersion(false);
      current = v;
      const when = fmtBuildTime(v.builtAt);
      el.textContent = [v.version, when].filter(Boolean).join(' · ');
      box.className = 'ver ok';
      box.title = '点击检查更新';
    } catch (e) {
      el.textContent = e.message === 'NO_VERSION_FILE' ? '未部署版本文件' : '版本未知';
      box.className = 'ver err';
    }
  }

  // 构建时间格式化为本地时间（MM/DD HH:mm）
  function fmtBuildTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  // 点击手动检查更新
  box.addEventListener('click', async () => {
    el.textContent = '检查中…';
    box.className = 'ver';
    try {
      const v = await fetchVersion(true);
      if (current && v.version !== current.version) {
        el.textContent = `有新版本 ${v.version} · 点击刷新`;
        box.className = 'ver stale';
        box.onclick = () => location.reload(true);
        return;
      }
      el.textContent = `${v.version} · 已是最新`;
      box.className = 'ver ok';
    } catch (e) {
      el.textContent = '连接失败';
      box.className = 'ver err';
    }
  });

  init();
  return { get current() { return current; } };
})();

/* ---------- 卡片显示 ---------- */
// 不使用 opacity 过渡（见 CSS 注释），直接切换显隐，保证任何环境下都可见。
// 卡片显隐。
// 不能用 opacity 过渡：本环境（iOS WebView）里 transition 常卡在初始帧。
// 改为固定高度 + 透明度，用 Web Animations API 播放，结束时再落到最终态，
// 即使动画不推进也能正确收尾（finish 会强制跳到末帧）。
function showCard(id){
  const el = $(id);
  el.classList.remove('hide');
  el.classList.remove('enter');

  // 入场：与折叠同思路，用定时器分步写样式，保证在本环境也能看到效果。
  const STEPS = 7;
  const DUR = 240;
  let i = 0;
  el.style.opacity = '0';
  el.style.transform = 'translateY(8px)';

  const tick = () => {
    i++;
    const t = i / STEPS;
    const e = 1 - Math.pow(1 - t, 3);
    el.style.opacity = String(e);
    el.style.transform = `translateY(${(8 * (1 - e)).toFixed(2)}px)`;
    if (i < STEPS) {
      setTimeout(tick, DUR / STEPS);
    } else {
      el.style.opacity = '';
      el.style.transform = '';
    }
  };
  setTimeout(tick, DUR / STEPS);
}

function hideCard(id, animate = true, onDone){
  const el = $(id);
  const finish = () => { if (typeof onDone === 'function') onDone(); };
  if (!animate || el.classList.contains('hide')) {
    el.classList.add('hide');
    finish();
    return;
  }

  // 折叠：分步改高度。
  // 本环境的 rAF / Web Animations / CSS transition 都可能不推进（合成器时间冻结），
  // 因此这里用定时器逐帧写样式，只要 JS 计时器在跑就一定能平滑收起。
  const h = el.offsetHeight;
  const mb = parseFloat(getComputedStyle(el).marginBottom) || 0;
  const STEPS = 7;
  const DUR = 210;

  el.style.overflow = 'hidden';
  el.classList.add('collapsing');

  let i = 0;
  const tick = () => {
    i++;
    const t = i / STEPS;
    // ease-out：起步快、收尾缓
    const e = 1 - Math.pow(1 - t, 3);
    el.style.height = Math.round(h * (1 - e)) + 'px';
    el.style.marginBottom = Math.round(mb * (1 - e)) + 'px';
    el.style.opacity = String(1 - e * 0.9);

    if (i < STEPS) {
      setTimeout(tick, DUR / STEPS);
    } else {
      el.classList.remove('collapsing');
      el.classList.add('hide');
      el.style.height = '';
      el.style.marginBottom = '';
      el.style.overflow = '';
      el.style.opacity = '';
      finish();
    }
  };
  el.style.height = h + 'px';
  el.style.marginBottom = mb + 'px';
  setTimeout(tick, DUR / STEPS);
}
// 进度区不是 .card，单独显隐
// 一体化按钮的三种状态：可用 / 进行中 / 不可用
function setBtnState(state, label) {
  const b = $('start');
  b.classList.toggle('disabled', state === 'disabled');
  b.classList.toggle('busy', state === 'busy');
  // 压缩进行中彻底关掉交互：连点在视觉和事件两层面都拿不到反馈
  b.setAttribute('aria-disabled', state === 'busy' || state === 'disabled' ? 'true' : 'false');
  if (label != null) $('actLabel').textContent = label;
  if (state === 'idle') {
    $('bar').style.width = '0%';
    $('actPct').textContent = '';
  }
}

/* ---------- 液态玻璃（渐进增强，失败不影响主流程） ---------- */
// 组件库约 417KB（br 后约 100KB），首屏用不上，所以放在页面 load 之后的
// 空闲时段才注入，再挂本站的适配层。任何环节失败都只是退回原来的 HTML 控件。
//
// 必须走本站 ./lib/ 而不是 CDN：线上页面带 COEP: require-corp
// （WebCodecs 多线程需要），而 CDN 的 liquid-glass.js 没有
// Cross-Origin-Resource-Policy 头，浏览器会直接拒载，组件永远注册不上。
const GLASS_SRC = './lib/liquid-glass.js?v=2.5';
let glassPromise = null;

function loadGlass() {
  if (glassPromise) return glassPromise;
  glassPromise = new Promise(resolve => {
    if (navigator.connection && navigator.connection.saveData) return resolve(false);
    if (customElements.get('liquid-glass')) return mountGlass(resolve);

    const s = document.createElement('script');
    s.src = GLASS_SRC;
    s.onload = () => mountGlass(resolve);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  return glassPromise;
}

// 库就绪后挂适配层：给每块玻璃喂背景壁纸、补渲染，并在末尾注入接线层。
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
  if ('requestIdleCallback' in window) requestIdleCallback(bootGlass, { timeout: 2500 });
  else setTimeout(bootGlass, 800);
}, 400));

// 适配层路径由 tools/split.py 在构建时填入
const GLASS_BOOT = './assets/lg-boot.a4d4b6269d.js';


/* ---------- 环境检测 ---------- */
const HAS_WC = typeof VideoEncoder !== 'undefined' && typeof VideoDecoder !== 'undefined';

/* ---------- 文件选择 ---------- */
const drop = $('drop'), fileInput = $('file');
drop.addEventListener('click', () => fileInput.click());
['dragover','dragenter'].forEach(e => drop.addEventListener(e, ev => {
  ev.preventDefault(); drop.classList.add('over');
}));
['dragleave','drop'].forEach(e => drop.addEventListener(e, ev => {
  ev.preventDefault(); drop.classList.remove('over');
}));
drop.addEventListener('drop', ev => {
  const f = ev.dataTransfer.files[0];
  if (f) loadFile(f);
});
fileInput.addEventListener('change', e => {
  const f = e.target.files[0];
  if (f) loadFile(f);
});

// 一点击选择区就开始预取编码库，等文件选完时通常已就绪（失败静默，loadFile 里会重试并报错）
['pointerdown', 'focus'].forEach(t =>
  fileInput.addEventListener(t, () => { loadMB().catch(() => {}); }, { once: true }));

/* ---------- 源视频可解码性 ---------- */
// 只读取轨道首帧的解码配置，判断浏览器能否直接解码；
// 不做整轨扫描，因此大文件/长视频的门槛成本恒定在几十毫秒内。
async function sourceDecodable() {
  const cfg = await srcInfo.vTrack.getDecoderConfig();
  if (!cfg || !cfg.codec) return { ok: true, unknown: true };
  try {
    const r = await VideoDecoder.isConfigSupported(cfg);
    return { ok: !!r.supported };
  } catch (e) {
    // 配置本身描述不出来时，交给真正的压缩流程去报错，避免误伤
    return { ok: true, unknown: true };
  }
}

function fmtTime(s) {
  const m = Math.floor(s/60), sec = Math.floor(s%60);
  return `${m}:${String(sec).padStart(2,'0')}`;
}
function mbStr(bytes) {
  return (bytes/1048576).toFixed(bytes > 10485760 ? 1 : 2) + ' MB';
}

async function loadFile(f) {
  srcFile = f;
  // 选中文件后收起选择区，避免占着屏幕第一屏
  $('drop').classList.add('collapsed');
  lastBlob = null;
  hideCard('resultCard');
  setBtnState('disabled', '开始压缩');
  $('status').textContent = '';
  $('status').className = 'status';
  $('srcWarn').textContent = '';
  $('codecWarn').textContent = '';
  setBtnState('disabled');

  if (!HAS_WC) {
    $('meta').textContent = '';
    showCard('infoCard');
    $('srcWarn').textContent =
      '当前浏览器不支持 WebCodecs，无法进行硬件编码。请使用 Safari（iOS 16.4+）或其他新版浏览器打开。';
    $('drop').classList.remove('collapsed');
    return;
  }

  try {
    // 首次选片时才拉取编码库（约 190KB 压缩后），并给出明确反馈
    if (!window.Mediabunny) {
      $('status').textContent = '正在加载编码引擎…';
      $('status').className = 'status on';
    }
    const mb = await loadMB();
    $('status').textContent = '';
    $('status').className = 'status';

    const input = new mb.Input({
      formats: mb.ALL_FORMATS,
      source: new mb.BlobSource(f)
    });
    const vTrack = await input.getPrimaryVideoTrack();
    const aTrack = await input.getPrimaryAudioTrack();

    if (!vTrack) throw new Error('文件中没有找到视频轨道');

    srcInfo = {
      input, vTrack, aTrack,
      width: vTrack.displayWidth || vTrack.codedWidth,
      height: vTrack.displayHeight || vTrack.codedHeight,
      duration: await input.computeDuration(),
      hasAudio: !!aTrack,
      codec: vTrack.codec
    };

    // mediabunny 的 displayWidth / displayHeight 已经应用了旋转矩阵
    // （例如 iPhone 竖屏视频：coded 1920×1080 + rotation 90 → display 1080×1920），
    // 所以直接用 display 尺寸，不需要自己再对调，否则方向反而会错。
    srcInfo.displayW = srcInfo.width;
    srcInfo.displayH = srcInfo.height;

    $('meta').innerHTML =
      `<b>${f.name}</b><br>` +
      `${srcInfo.displayW} × ${srcInfo.displayH} · ${fmtTime(srcInfo.duration)} · ${mbStr(f.size)}<br>` +
      `编码 <b>${String(srcInfo.codec || '未知').toUpperCase()}</b>` +
      (srcInfo.hasAudio ? ' · 含音轨' : ' · <b>无音轨</b>');

    showCard('infoCard');

    if (!srcInfo.hasAudio) {
      $('srcWarn').textContent = '该视频没有音轨，压缩后的文件也不会有声音。';
    }

    // 可解码性检查。
    // 以前这里跑一次完整 Conversion.init 做预检，但 init 会遍历整条轨道的
    // packet 索引（为了算 maximumPacketCount 之类），视频越长越慢：
    // 长片/大文件在选片阶段要多等好几秒，而这些信息真正压缩时还会再算一遍。
    // 现在只问浏览器要轨道首帧的解码配置（getDecoderConfig 只做一次寻址），
    // 再用 VideoDecoder.isConfigSupported() 判断——耗时与视频长度、体积都无关。
    const check = await sourceDecodable();
    if (!check.ok) {
      $('srcWarn').textContent =
        `此视频的编码（${String(srcInfo.codec).toUpperCase()}）无法被浏览器直接解码。` +
        `请换用手机原始拍摄的视频，或先用其他工具转成 H.264 / HEVC 再试。`;
      return;
    }

    setBtnState('idle', '开始压缩');
  } catch (e) {
    console.error(e);
    $('meta').textContent = '';
    showCard('infoCard');
    // 加载失败是网络问题，别让用户误以为是视频格式的锅
    const code = String(e.message || '');
    $('srcWarn').textContent =
      code === 'MEDIABUNNY_LOAD_FAILED' || code === 'MEDIABUNNY_MISSING'
        ? '编码引擎加载失败，请检查网络后重新选择视频。'
        : '读取失败：' + e.message;
    $('drop').classList.remove('collapsed');
    setBtnState('disabled');
  }
}

/* ---------- 选项 ---------- */
// 分辨率：胶囊按钮
$('resOpts').addEventListener('click', e => {
  const b = e.target.closest('.chip'); if (!b) return;
  [...$('resOpts').children].forEach(x => x.classList.remove('on'));
  b.classList.add('on'); selRes = +b.dataset.res;
});

// 画质：滑杆，0=小(2Mbps) 1=标准(4Mbps) 2=高(8Mbps)
const Q_LEVELS = [
  { q: 2, label: '2 Mbps' },
  { q: 4, label: '4 Mbps' },
  { q: 8, label: '8 Mbps' }
];
$('qRange').addEventListener('input', e => {
  const lv = Q_LEVELS[+e.target.value] || Q_LEVELS[1];
  selQ = lv.q;
  $('qVal').textContent = lv.label;
});

/* ---------- 计算目标尺寸 ---------- */
// displayW/H 已带旋转（竖屏是 1080×1920），但 mediabunny 的 width/height 参数
// 作用于 coded 尺寸，所以这里按 coded 尺寸比例缩放，再按显示方向返回。
function targetSize(w, h, maxDim) {
  const longSide = Math.max(w, h);
  const scale = Math.min(1, maxDim / longSide);
  return [
    Math.max(2, Math.round(w * scale / 2) * 2),
    Math.max(2, Math.round(h * scale / 2) * 2)
  ];
}

// ---- 给液态玻璃层用的状态钩子 ----
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

/* ---------- 开始压缩 ---------- */
$('start').addEventListener('click', startConvert);
// div 模拟按钮，补上键盘触发
$('start').addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    $('start').click();
  }
});

// 压缩进行中的硬开关。
// 以前这里只拦 disabled，busy 状态没拦——连点两次会并行跑两个 conversion，
// 两个 onProgress 交替写进度条和百分比，界面上就出现重影/跳动的进度文本。
let converting = false;

async function startConvert() {
  if (converting) return;                       // 已在压缩，忽略重复触发
  if (!srcFile || !srcInfo) return;
  if ($('start').classList.contains('disabled')) return;

  converting = true;
  setBtnState('busy', '准备中');
  $('bar').style.width = '0%';
  $('status').className = 'status';
  $('status').textContent = '';

  try {
    // 缩放基准用「短边」判断清晰度档位：1080p 指短边 1080。
    // 竖屏 1080×1920 与横屏 1920×1080 都应落在 1080p 档，不被缩小。
    const shortSide = Math.min(srcInfo.displayW, srcInfo.displayH);
    const scale = Math.min(1, selRes / shortSide);
    const tw = Math.max(2, Math.round(srcInfo.displayW * scale / 2) * 2);
    const th = Math.max(2, Math.round(srcInfo.displayH * scale / 2) * 2);

    // 码率按实际像素数缩放（以 1080p 为基准）
    const ratio = Math.max(0.3, (tw * th) / (1920 * 1080));
    const bitrate = Math.round(selQ * 1e6 * ratio);

    const mb = await loadMB();
    const output = new mb.Output({
      format: new mb.Mp4OutputFormat(),
      target: new mb.BufferTarget()
    });

    const conversion = await mb.Conversion.init({
      input: srcInfo.input,
      output,
      video: {
        width: tw, height: th,
        fit: 'contain',
        codec: 'avc',
        bitrate,
        keyFrameInterval: 2,
        // 关键：allowRotationMetadata 让 mediabunny 用旋转标记表达方向，
        // 而不是把像素转置。否则竖屏视频会被压成横屏或尺寸错乱。
        allowRotationMetadata: true,
        hardwareAcceleration: 'prefer-hardware'
      },
      audio: srcInfo.hasAudio
        ? { codec: 'aac', bitrate: 128000, numberOfChannels: 2, sampleRate: 48000 }
        : { discard: true }
    });

    if (!conversion.isValid) {
      const why = (conversion.discardedTracks || []).map(t => t.reason).join(', ');
      // 源编码解不了是这里最常见的失败原因，给出可操作的建议
      const undecodable = String(why).includes('decodable');
      throw new Error(undecodable
        ? '当前浏览器无法解码这段视频的编码，请换用手机直接拍摄的视频，或先转成 H.264 / HEVC'
        : '无法配置此转换：' + (why || '未知原因'));
    }

    conversion.onProgress = p => {
      const pct = Math.min(100, Math.round(p * 100));
      $('bar').style.width = pct + '%';
      $('actLabel').textContent = '压缩中';
      $('actPct').textContent = pct + '%';
    };

    const t0 = performance.now();
    await conversion.execute();
    const elapsed = (performance.now() - t0) / 1000;

    const buf = output.target.buffer;
    if (!buf || !buf.byteLength) throw new Error('输出为空，编码可能失败');

    lastBlob = new Blob([buf], { type: 'video/mp4' });
    lastName = srcFile.name.replace(/\.[^.]+$/, '') + '_compressed.mp4';

    const saved = Math.round((1 - lastBlob.size / srcFile.size) * 100);

    // 完成后整张源文件卡（含压缩按钮与输出设置）收起，只留结果卡
    $('status').textContent = '';

    $('rOrig').textContent = mbStr(srcFile.size);
    $('rNew').textContent = mbStr(lastBlob.size);
    $('rSave').textContent = saved > 0 ? saved + '%' : '—';

    const tag = $('saveTag');
    if (saved > 0) {
      tag.textContent = `节省 ${saved}%`;
      tag.style.display = '';
    } else {
      tag.textContent = '体积略增';
      tag.style.background = 'linear-gradient(96deg,#ffb340,#ff8a4c)';
    }

    $('result').innerHTML =
      `H.264 · ${tw} × ${th} · ${(bitrate/1e6).toFixed(1)} Mbps · AAC 128k` +
      (saved <= 0
        ? '<br><b style="color:var(--warn)">原视频已高度压缩，再压体积反而变大，建议直接用原文件。</b>'
        : '');

    // 耗时放在成果栏
    $('rTime').textContent = `用时 ${elapsed.toFixed(1)} 秒`;
    $('status').textContent = '';

    // 交接改为串行：先把源文件卡折叠收起，腾出空间后再展开结果卡。
    // 两件事同时做会让布局连跳两次，看起来生硬。
    // 注意：本环境 requestAnimationFrame 不触发，只能用定时器。
    hideCard('infoCard', true, () => {
      showCard('resultCard');
      setTimeout(() => {
        try {
          $('resultCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } catch (e) {}
      }, 160);
    });
  } catch (e) {
    console.error(e);
    setBtnState('idle', '重新压缩');
    $('status').className = 'status';
    $('status').style.color = 'var(--err)';
    $('status').classList.remove('hide');
    $('status').textContent = '失败：' + (e && e.message ? e.message : String(e));
  } finally {
    converting = false;
    // 失败时按钮要回到可点状态；成功时卡片已隐藏，无需处理
    const b = $('start');
    if (b.classList.contains('busy')) {
      setBtnState('idle', '开始压缩');
    }
  }
}

/* ---------- 保存 ---------- */
// iOS Safari 不允许网页直接写入相册，唯一合法途径是系统分享面板里的「存储到照片」。
// 因此优先调用 Web Share API 直接唤起分享面板，用户一步就能存进相册。
function saveFile() {
  if (!lastBlob) return;
  const file = new File([lastBlob], lastName, { type: 'video/mp4' });

  // 支持分享文件时，直接弹出系统面板（含「存储到照片」）
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({
      files: [file],
      title: lastName
    }).then(() => {
      $('saveHint').textContent = '已保存。若没看到视频，请到相册的「最近项目」查看。';
    }).catch(err => {
      // 用户取消不提示
      if (err && err.name === 'AbortError') return;
      downloadFallback();
    });
    return;
  }

  downloadFallback();
}

// 兜底：走浏览器下载（存到「文件」App）
function downloadFallback() {
  const url = URL.createObjectURL(lastBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = lastName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);

  $('saveHint').textContent =
    '当前浏览器不支持直接分享。文件已下载到「文件」App，可在相册里用「导入」加入照片。';
}

$('download').addEventListener('click', saveFile);

/* ---------- 重置 ---------- */
$('again').addEventListener('click', () => {
  srcFile = srcInfo = lastBlob = null;
  fileInput.value = '';
  hideCard('infoCard');
  hideCard('resultCard');
  $('drop').classList.remove('collapsed');
  $('saveHint').textContent = '';
  $('rTime').textContent = '';
  $('status').style.color = '';
  $('saveTag').style.background = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
});












