# liquid-glass.js

本目录的 `liquid-glass.js` 是第三方库的构建产物，**未做任何修改**，直接原样托管以便与站点同源（页面启用了
COOP/COEP，跨域脚本容易受限）。

- 项目：GooseHyperGlassCDN
- 仓库：https://github.com/Minecraftgoose/GooseHyperGlassCDN
- CDN 源：https://glass.goose.cc.cd/liquid-glass.js
- 版本：2.5（构建于 2026-10-03，文件 417,296 字节）
- 许可：Apache License 2.0（https://www.apache.org/licenses/LICENSE-2.0）

上游依赖（见项目 README）：
- Kyant0/AndroidLiquidGlass — 原始设计（Kotlin）
- martin65536/liquid-glass-webgl — WebGL 移植
- aaaa-zhen/siri-glsl — siri-wave / 搜索框（MIT）

## 升级方式

```sh
curl -o lib/liquid-glass.js https://glass.goose.cc.cd/liquid-glass.js
```

升级后请检查 `assets/app.js` 里 `setupGlass()` 的两处用法是否仍然成立：

1. 组件对外 API：`setButtons` / `setScroll` / `setState` / `lg-statechange`；
2. 组件内部状态字段名：`sliderValue`（0-100）、`scrollY`（卡片滚动偏移 px）。

页面只通过这两个字段驱动滚动和读回滑块值，其余全部走官方接口。
