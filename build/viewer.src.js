/**
 * 预览引擎入口：把 @open-file-viewer/core 及其插件暴露到 window，供 client.src.js 使用。
 * 由 build.mjs 用 esbuild 打成 IIFE。
 *
 * 插件取舍原则：只收「纯前端能渲染、且不拖入巨大/不可打包依赖」的。
 *   · 不含 pdfPlugin：peer 依赖 pdfjs-dist v6 会拖入 @napi-rs/canvas（Node 原生模块，
 *     浏览器打不了包）。PDF 交给浏览器原生 iframe 渲染，效果一样且零成本。
 *   · 不含 model3dPlugin（three.js ~1MB）、gisPlugin（leaflet）、cadPlugin（需 GPL peer）、
 *     assetPlugin、drawingPlugin（拖 mermaid）、archivePlugin、emailPlugin
 *     —— 都是用户场景里几乎用不到的重量级插件
 *   · officePlugin 自带 docx-preview / mammoth / xlsx，纯前端渲染，
 *     不依赖微软在线服务（国内连不上，这是上一版预览失败的主因）
 */
import {
  createViewer,
  isPreviewSupported,
  imagePlugin,
  officePlugin,
  xmindPlugin,
  audioPlugin,
  videoPlugin,
  textPlugin,
} from '@open-file-viewer/core'

// ⚠️ 必须把样式作为值取出来挂到 window：
//    只写 `import '@x/style.css'` 的话，在 loader 为 text 时会被当成未使用的字符串剔除掉
import viewerCss from '@open-file-viewer/core/style.css'

window.__DSH_IMA_VIEWER_CSS__ = viewerCss

window.__DSH_IMA_VIEWER__ = {
  createViewer,
  isPreviewSupported,
  version: '1.0.0',
  // 顺序有讲究：专用插件在前，textPlugin 兜底放最后
  makePlugins: () => [
    imagePlugin(),
    audioPlugin(),
    videoPlugin(),
    officePlugin(),
    xmindPlugin(),
    textPlugin(),
  ],
}
