# 视频压缩工具

浏览器端视频压缩，使用 **WebCodecs 硬件编码**，文件不离开设备。

同 rotato.app/compress 一样在本地跑（他们的主要是 FFmpeg.wasm + libx264），
但本项目走 WebCodecs，直接调用系统硬件编码器（Apple VideoToolbox / NVENC / QuickSync），
速度更快、画质更好、也不受 WASM 内存上限限制。

## 结构

```
index.html                  页面（无构建步骤，纯静态）
lib/mediabunny.bundle.js    mediabunny 打包成的单文件（IIFE，全局变量 Mediabunny）
_headers                    Cloudflare Pages 响应头配置
```

## 部署到 Cloudflare Pages

纯静态站点，不需要构建命令。

**方式一：直接上传（最简单）**

1. 打开 Cloudflare 控制台 → Workers & Pages → 创建 → Pages → 上传资产
2. 把整个目录拖进去（或打包成 zip 上传）
3. 完成，得到 `xxx.pages.dev` 域名

**方式二：连 Git 仓库**

- 构建命令：留空
- 输出目录：`/`（仓库根目录）
- 框架预设：None

**方式三：Wrangler CLI**

```bash
npx wrangler pages deploy . --project-name=video-compress
```

## 本地预览

因为用了相对路径加载 JS，必须通过 HTTP 访问，不能直接双击打开文件：

```bash
python3 -m http.server 8080
# 然后浏览器打开 http://localhost:8080
```

## 关于 `_headers`

配置了 `Cross-Origin-Opener-Policy` 和 `Cross-Origin-Embedder-Policy`，
作用是开启 `crossOriginIsolated`。当前实现是单线程的，不加也能用；
但加上之后如果将来接入多线程编码器或 FFmpeg.wasm 多线程版，可以直接受益。
如果部署后发现某些外部资源加载不了，把这两个头去掉即可。

## 浏览器要求

| 能力 | 要求 |
|---|---|
| WebCodecs | Safari 16.4+ / Chrome 94+ / Edge 94+ |
| H.264 编码 | 上述浏览器基本都支持（走硬件） |
| HEVC 解码 | Safari 原生支持；Chrome 视平台而定 |

Firefox 目前对 WebCodecs 的 H.264 编码支持仍不完整。

## 已知限制

- **源文件编码必须是浏览器能解码的**：H.264、HEVC、VP8/VP9、AV1。MPEG-4 Part 2（mp4v）这类老旧编码浏览器解不了，页面会给出明确提示
- 输出统一为 **MP4（H.264 + AAC）**，兼容性最好
- 长视频注意内存占用：输出先放内存再生成 Blob，4K 大文件可能吃紧
- iOS Safari 后台切换会导致页面挂起，压缩期间请保持前台

## 参数说明

压缩使用可变码率（VBR），码率按输出像素数自动缩放：

```
实际码率 = 所选档位 × max(0.3, (宽 × 高) / (1920 × 1080))
```

所以 720p 选「标准 2.5 Mbps」时，实际约 1.35 Mbps —— 同样清晰度下体积更合理。

## 重新生成 lib/mediabunny.bundle.js

```bash
# 下载源码
mkdir -p mediabunny shared
# 从 https://cdn.jsdelivr.net/npm/mediabunny@1.65.1/dist/modules/ 递归拉取
# 注意 shared/ 在 dist/modules/ 这一级，不在 src/ 里面

# 打包
esbuild mediabunny/index.js --bundle --format=iife \
  --global-name=Mediabunny --minify --target=es2020 --platform=browser \
  "--alias:node:fs/promises=./empty.js" --outfile=mediabunny.bundle.js

# empty.js 内容：export {};
```
