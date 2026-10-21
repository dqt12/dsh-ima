/**
 * 插件主逻辑（被 build.mjs 嵌进 DSH 的闭包工厂里）
 *
 * 可用变量：
 *   require            DSH 模块加载器
 *   __VIEWER_CSS__     预览引擎的样式（构建时注入的 JSON 字符串）
 *   window.__DSH_IMA_VIEWER__  预览引擎（构建时注入的 IIFE 设置）
 *
 * ⚠️ sidebar.panellist 注册的组件只能是「图标」：
 *    侧边栏自己渲染 <button aria-label={label}><span class=glyph>{组件}</span><span class=title>{label}</span></button>
 *    组件里再写文字会重复出现。
 */

var react = require('react')
var React = react
var h = react.createElement

var PANEL_ID = 'dsh-ima'
var API = '/api/ima'

// ── 样式 ─────────────────────────────────────────────────
var CSS = [
  '.dsh-ima-root{display:flex;flex-direction:column;height:100%;font-size:var(--dsw-font-base-font-size,14px);line-height:1.65;color:var(--dsw-alias-label-primary,#1a1a1a);background:var(--dsw-alias-bg-primary,#fff);font-family:var(--dsw-font-family,inherit)}',
  '.dsh-ima-head{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-secondary,rgba(0,0,0,.08));flex-shrink:0}',
  '.dsh-ima-title{font-size:1.08em;font-weight:500}',
  '.dsh-ima-spacer{flex:1;min-width:0}',
  '.dsh-ima-badge{font-size:.88em;color:var(--dsw-alias-label-secondary,#666)}',
  '.dsh-ima-stamp{font-size:.85em;color:var(--dsw-alias-label-tertiary,#999);white-space:nowrap}',
  '.dsh-ima-btn{display:inline-flex;align-items:center;gap:5px;font-size:.92em;padding:5px 11px;border-radius:6px;border:1px solid var(--dsw-alias-border-secondary,rgba(0,0,0,.12));background:transparent;color:var(--dsw-alias-label-primary,#1a1a1a);cursor:pointer;font-family:inherit;line-height:1.45;white-space:nowrap;text-decoration:none}',
  // ⚠️ 主按钮必须单独写 hover：.dsh-ima-btn:hover 的优先级高于 .dsh-ima-btn-p，
  //    不覆盖的话悬停时蓝底会被换成浅色，而文字仍是白色 → 白字白底看不见
  '.dsh-ima-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}',
  '.dsh-ima-btn-p{background:var(--dsw-alias-interactive-bg-primary,#3b6cf6);border-color:var(--dsw-alias-interactive-bg-primary,#3b6cf6);color:#fff}',
  '.dsh-ima-btn-p:hover{background:var(--dsw-alias-interactive-bg-primary,#3b6cf6);border-color:var(--dsw-alias-interactive-bg-primary,#3b6cf6);color:#fff;filter:brightness(.9)}',
  '.dsh-ima-btn-p:active{filter:brightness(.82)}',
  '.dsh-ima-btn-d{color:var(--dsw-alias-status-danger,#d93838)}',
  '.dsh-ima-btn-d:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));color:var(--dsw-alias-status-danger,#d93838)}',
  '.dsh-ima-btn:disabled{opacity:.45;cursor:default;filter:none}',
  '.dsh-ima-btn-p:disabled{background:var(--dsw-alias-interactive-bg-primary,#3b6cf6);color:#fff}',
  '.dsh-ima-ibtn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#666);cursor:pointer;flex-shrink:0}',
  '.dsh-ima-ibtn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}',
  '.dsh-ima-body{flex:1;display:flex;min-height:0}',
  '.dsh-ima-kbs{width:230px;border-right:1px solid var(--dsw-alias-border-secondary,rgba(0,0,0,.08));overflow:auto;padding:10px;flex-shrink:0}',
  '.dsh-ima-kb{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:6px;cursor:pointer;margin-bottom:2px}',
  '.dsh-ima-kb:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}',
  '.dsh-ima-kb-on{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}',
  '.dsh-ima-kb-name{flex:1;font-size:1em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.dsh-ima-tag{font-size:.8em;padding:2px 6px;border-radius:4px;flex-shrink:0}',
  '.dsh-ima-tag-s{background:#e1f5ee;color:#085041}',
  '.dsh-ima-tag-m{background:#e6f1fb;color:#0c447c}',
  '.dsh-ima-main{flex:1;overflow:auto;padding:14px 18px;min-width:0;display:flex;flex-direction:column}',
  '.dsh-ima-center{flex:1;display:flex;align-items:center;justify-content:center;padding:24px;overflow:auto}',
  '.dsh-ima-dlg{width:460px;max-width:100%;box-sizing:border-box;background:var(--dsw-alias-bg-primary,#fff);border:1px solid var(--dsw-alias-border-secondary,rgba(0,0,0,.1));border-radius:12px;padding:24px;box-shadow:0 8px 32px rgba(0,0,0,.10);font-size:var(--dsw-font-base-font-size,14px)}',
  '.dsh-ima-crumb{font-size:1em;color:var(--dsw-alias-label-secondary,#666);margin-bottom:12px;display:flex;align-items:center;gap:8px;min-width:0;flex-shrink:0}',
  '.dsh-ima-crumb a{color:inherit;cursor:pointer;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.dsh-ima-crumb a:hover{text-decoration:underline}',
  '.dsh-ima-item{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:6px;cursor:pointer;flex-shrink:0}',
  // 左侧分组（对齐 ima 自己的「个人知识库 / 共享知识库」折叠分组）
  '.dsh-ima-kbsec{margin-bottom:4px}',
  '.dsh-ima-kbsec-h{display:flex;align-items:center;gap:5px;padding:6px 6px 4px;font-size:.92em;color:var(--dsw-alias-label-secondary,#666);cursor:pointer;user-select:none;border-radius:6px}',
  '.dsh-ima-kbsec-h:hover{color:var(--dsw-alias-label-primary,#1a1a1a)}',
  '.dsh-ima-kbsec-t{font-weight:500}',
  '.dsh-ima-chev{display:inline-flex;color:var(--dsw-alias-label-tertiary,#999);transition:transform .15s ease}',
  '.dsh-ima-chev-off{transform:rotate(-90deg)}',
  '.dsh-ima-kbsec-add{width:20px;height:20px;padding:0;border:none;background:transparent;color:var(--dsw-alias-label-tertiary,#999);font-size:1.15em;line-height:1;border-radius:5px;cursor:pointer;font-family:inherit}',
  '.dsh-ima-kbsec-add:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,#1a1a1a)}',
  '.dsh-ima-item:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}',
  '.dsh-ima-item-t{flex:1;font-size:1em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}',
  '.dsh-ima-item-y{font-size:.85em;color:var(--dsw-alias-label-tertiary,#999);flex-shrink:0}',
  // 行内操作：图标+文字，常驻显示（之前只显示图标且要悬停才出现，太不显眼）
  '.dsh-ima-act{display:flex;gap:6px;flex-shrink:0;margin-left:6px}',
  '.dsh-ima-actbtn{display:inline-flex;align-items:center;gap:5px;font-size:.86em;padding:4px 10px;border-radius:6px;border:1px solid var(--dsw-alias-border-secondary,rgba(0,0,0,.14));background:transparent;color:var(--dsw-alias-label-secondary,#666);cursor:pointer;font-family:inherit;line-height:1.45;white-space:nowrap}',
  '.dsh-ima-actbtn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));color:var(--dsw-alias-label-primary,#1a1a1a)}',
  '.dsh-ima-actbtn-p{color:var(--dsw-alias-interactive-bg-primary,#3b6cf6);border-color:var(--dsw-alias-interactive-bg-primary,#3b6cf6);font-weight:500}',
  '.dsh-ima-actbtn-p:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));color:var(--dsw-alias-interactive-bg-primary,#3b6cf6)}',
  '.dsh-ima-empty{padding:48px 20px;text-align:center;color:var(--dsw-alias-label-tertiary,#999);font-size:1em}',
  '.dsh-ima-err{font-size:.92em;color:var(--dsw-alias-status-danger,#d93838);padding:10px 16px;line-height:1.6;flex-shrink:0}',
  '.dsh-ima-pre{white-space:pre-wrap;word-break:break-word;font-size:1em;line-height:1.75;background:var(--dsw-alias-bg-secondary,#f5f5f5);border-radius:8px;padding:16px;margin-top:12px;overflow:auto;font-family:var(--dsw-font-family,inherit)}',
  '.dsh-ima-vbox{margin-top:12px;border-radius:8px;overflow:hidden;background:var(--dsw-alias-bg-secondary,#f5f5f5)}',
  '.dsh-ima-vbox>div{height:100%}',
  '.dsh-ima-md h1{font-size:1.45em;font-weight:500;margin:1em 0 .5em}',
  '.dsh-ima-md h2{font-size:1.25em;font-weight:500;margin:1em 0 .5em}',
  '.dsh-ima-md h3{font-size:1.1em;font-weight:500;margin:.9em 0 .5em}',
  '.dsh-ima-md h4,.dsh-ima-md h5,.dsh-ima-md h6{font-size:1em;font-weight:500;margin:.8em 0 .4em}',
  '.dsh-ima-md p{margin:.55em 0}',
  '.dsh-ima-md code{font-size:.92em;background:var(--dsw-alias-bg-tertiary,rgba(0,0,0,.06));padding:1px 5px;border-radius:4px;font-family:ui-monospace,Menlo,Consolas,monospace}',
  '.dsh-ima-md pre{background:var(--dsw-alias-bg-tertiary,rgba(0,0,0,.06));border-radius:6px;padding:10px 12px;overflow:auto;margin:.6em 0}',
  '.dsh-ima-md pre code{background:none;padding:0}',
  '.dsh-ima-md strong{font-weight:500}',
  '.dsh-ima-md em{font-style:italic}',
  '.dsh-ima-md ul,.dsh-ima-md ol{padding-left:1.5em;margin:.5em 0}',
  '.dsh-ima-md li{margin:.22em 0}',
  '.dsh-ima-md a{color:var(--dsw-alias-interactive-bg-primary,#3b6cf6);text-decoration:none;word-break:break-all}',
  '.dsh-ima-md a:hover{text-decoration:underline}',
  '.dsh-ima-md hr{border:none;border-top:1px solid var(--dsw-alias-border-secondary,rgba(0,0,0,.12));margin:1em 0}',
  '.dsh-ima-md blockquote{margin:.6em 0;padding:.1em 0 .1em .9em;border-left:2px solid var(--dsw-alias-border-secondary,rgba(0,0,0,.16));color:var(--dsw-alias-label-secondary,#666)}',
  // 会议听记的发言人行（ima 听记类笔记展平后靠「发言人N 时间戳」还原）
  '.dsh-ima-spk{display:inline-block;margin:.9em 0 .15em;padding:1px 8px;border-radius:5px;background:var(--dsw-alias-bg-tertiary,rgba(0,0,0,.06));color:var(--dsw-alias-label-secondary,#666);font-size:.88em;line-height:1.6;font-variant-numeric:tabular-nums}',
  '.dsh-ima-md>:first-child{margin-top:0}',
  '.dsh-ima-md>:last-child{margin-bottom:0}',
  '.dsh-ima-rawhint{font-size:.85em;color:var(--dsw-alias-label-tertiary,#999);line-height:1.7;margin-top:10px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-secondary,rgba(0,0,0,.08))}',
  '.dsh-ima-dlg h3{margin:0 0 8px;font-size:1.12em;font-weight:500}',
  '.dsh-ima-f{margin-top:14px}',
  '.dsh-ima-f label{display:block;font-size:.92em;color:var(--dsw-alias-label-secondary,#666);margin-bottom:6px}',
  '.dsh-ima-f input{width:100%;box-sizing:border-box;font-size:.95em;padding:9px 11px;border-radius:6px;border:1px solid var(--dsw-alias-border-secondary,rgba(0,0,0,.12));background:var(--dsw-alias-bg-primary,#fff);color:var(--dsw-alias-label-primary,#1a1a1a);font-family:inherit}',
  '.dsh-ima-acts{display:flex;gap:8px;justify-content:flex-end;align-items:center;margin-top:20px}',
  '.dsh-ima-link{background:none;border:none;padding:0;font-size:.88em;color:var(--dsw-alias-label-tertiary,#999);cursor:pointer;font-family:inherit;text-decoration:underline;text-underline-offset:2px}',
  '.dsh-ima-link:hover{color:var(--dsw-alias-label-secondary,#666)}',
  '.dsh-ima-step{display:flex;gap:10px;margin-top:16px;align-items:flex-start}',
  '.dsh-ima-stepno{flex-shrink:0;width:20px;height:20px;border-radius:50%;background:var(--dsw-alias-bg-secondary,#f0f0f0);color:var(--dsw-alias-label-secondary,#666);font-size:.85em;display:inline-flex;align-items:center;justify-content:center;margin-top:2px}',
  '.dsh-ima-tip2{font-size:.9em;color:var(--dsw-alias-status-success,#1a9e6a);background:var(--dsw-alias-bg-secondary,#f5f5f5);border-radius:6px;padding:8px 12px;margin-top:14px;line-height:1.6}',
  '.dsh-ima-big{width:100%;box-sizing:border-box;padding:12px;font-size:1.05em;margin-top:18px;border-radius:8px}',
  '.dsh-ima-waitbar{display:flex;align-items:center;gap:8px;font-size:.92em;color:var(--dsw-alias-label-secondary,#666);margin-top:14px}',
  '.dsh-ima-spin{display:inline-block;width:13px;height:13px;border:2px solid var(--dsw-alias-border-secondary,rgba(0,0,0,.15));border-top-color:var(--dsw-alias-interactive-bg-primary,#3b6cf6);border-radius:50%;animation:dsh-ima-rot .8s linear infinite}',
  '@keyframes dsh-ima-rot{to{transform:rotate(360deg)}}',
  '.dsh-ima-filled{font-size:.9em;color:var(--dsw-alias-label-secondary,#666);background:var(--dsw-alias-bg-secondary,#f5f5f5);border-radius:6px;padding:10px 12px;margin-top:14px;line-height:1.9;font-family:ui-monospace,Menlo,Consolas,monospace}',
  '.dsh-ima-note{font-size:.92em;color:var(--dsw-alias-label-secondary,#666);line-height:1.7}',
  '.dsh-ima-toast{position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.82);color:#fff;font-size:.92em;padding:9px 18px;border-radius:8px;z-index:3000;pointer-events:none}',
].join('')

// ── 深色配色（自管，不依赖主文档令牌有没有下沉到面板）────────────
// 在插件根节点 .dsh-ima-root 上重新定义一套深色 --dsw-alias-* 变量。
// 变量定义在元素自身，优先级高于祖先 body 上的 DSH 令牌，因此面板
// 无论是否继承到主文档令牌，都会按自己的 data-theme 走深色。
// 深色令牌：两套选择器都写，保证覆盖各种主题信号
//  1. @media (prefers-color-scheme: dark) —— 桌面端原生深色由 nativeTheme 驱动，
//     会同步到渲染进程的 prefers-color-scheme；web 端 system 跟随系统也走这条。
//     这是最稳的兜底，不依赖任何 DSH 属性是否下沉到面板文档。
//  2. :root[data-theme="dark"] —— 由 installThemeWatcher 显式写入，覆盖 web 端
//     手动切 dark（DSH 在 html 上挂 data-ds-theme-source=dark）的情况。
var CSS_DARK = [
  '@media (prefers-color-scheme: dark){',
    '.dsh-ima-root{',
      '--dsw-alias-bg-primary:#1a1b1e;',
      '--dsw-alias-bg-secondary:#232427;',
      '--dsw-alias-bg-tertiary:rgba(255,255,255,.08);',
      '--dsw-alias-label-primary:#e6e6e6;',
      '--dsw-alias-label-secondary:#a0a0a0;',
      '--dsw-alias-label-tertiary:#777;',
      '--dsw-alias-border-secondary:rgba(255,255,255,.12);',
      '--dsw-alias-interactive-bg-hover:rgba(255,255,255,.08);',
      '--dsw-alias-interactive-bg-primary:#3b6cf6;',
      '--dsw-alias-status-danger:#ff6b6b;',
      '--dsw-alias-status-success:#4ec98f;',
    '}',
    '.dsh-ima-tag-s{background:rgba(46,204,113,.18);color:#7ee2b8}',
    '.dsh-ima-tag-m{background:rgba(59,108,246,.18);color:#8fb4ff}',
    '.dsh-ima-stepno{background:#2a2b2f;color:#a0a0a0}',
  '}',
  ':root[data-theme="dark"] .dsh-ima-root{',
    '--dsw-alias-bg-primary:#1a1b1e;',
    '--dsw-alias-bg-secondary:#232427;',
    '--dsw-alias-bg-tertiary:rgba(255,255,255,.08);',
    '--dsw-alias-label-primary:#e6e6e6;',
    '--dsw-alias-label-secondary:#a0a0a0;',
    '--dsw-alias-label-tertiary:#777;',
    '--dsw-alias-border-secondary:rgba(255,255,255,.12);',
    '--dsw-alias-interactive-bg-hover:rgba(255,255,255,.08);',
    '--dsw-alias-interactive-bg-primary:#3b6cf6;',
    '--dsw-alias-status-danger:#ff6b6b;',
    '--dsw-alias-status-success:#4ec98f;',
  '}',
  ':root[data-theme="dark"] .dsh-ima-tag-s{background:rgba(46,204,113,.18);color:#7ee2b8}',
  ':root[data-theme="dark"] .dsh-ima-tag-m{background:rgba(59,108,246,.18);color:#8fb4ff}',
  ':root[data-theme="dark"] .dsh-ima-stepno{background:#2a2b2f;color:#a0a0a0}',
].join('')

var CSS_TAG_ID = 'dsh-ima/panel.css'
function injectStyle(tagId, css, plugin) {
  if (typeof document === 'undefined' || !css) return
  if (document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']')) return
  var tag = document.createElement('style')
  tag.dataset.plugin = plugin
  tag.dataset.pluginCss = tagId
  tag.textContent = css
  document.head.appendChild(tag)
}
function injectCss() {
  injectStyle(CSS_TAG_ID, CSS, 'dsh-ima')
  injectStyle('dsh-ima/viewer.css', window.__DSH_IMA_VIEWER_CSS__, 'dsh-ima')
  injectStyle('dsh-ima/dark.css', CSS_DARK, 'dsh-ima')
}

// ── 主题跟随（让面板跟着主界面的深色/浅色切换）──────────────────
// 监听三类信号，取 OR：
//   1. <body> 上的 data-ds-dark-theme（DSH 桌面端切深色时直接挂在 body 上，值恒为 ""）
//   2. <html> 上的 data-ds-theme-source（web 端手动切 dark 时挂 "dark"，
//      system 时挂 "system"，light 时挂 "light"）
//   3. prefers-color-scheme: dark（桌面端 nativeTheme 驱动、web 端 system 跟随系统均触发）
// 任一判定深色 → 给 <html> 加 data-theme="dark"（CSS_DARK 的 :root[...] 分支生效）；
// 另有纯 CSS 的 @media (prefers-color-scheme: dark) 分支不依赖此属性，双保险。
function installThemeWatcher() {
  if (typeof document === 'undefined') return
  var html = document.documentElement
  var body = document.body
  var mq = null
  try { mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)') } catch (e) {}

  function dsExplicitDark() {
    if (body && body.getAttribute('data-ds-dark-theme') != null) return true
    var src = html.getAttribute('data-ds-theme-source')
    if (src === 'dark') return true
    if (src === 'light') return false
    return null // 'system' 或没有该属性 → 交给系统偏好
  }

  function applyTheme() {
    var ds = dsExplicitDark()
    var dark = ds === true ? true : ds === false ? false : !!(mq && mq.matches)
    if (dark) html.setAttribute('data-theme', 'dark')
    else html.removeAttribute('data-theme')
  }

  applyTheme()
  if (mq && mq.addEventListener) mq.addEventListener('change', applyTheme)
  else if (mq && mq.addListener) mq.addListener(applyTheme) // 旧浏览器兜底

  if (typeof MutationObserver !== 'undefined') {
    var mo = new MutationObserver(applyTheme)
    if (body) mo.observe(body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
    mo.observe(html, { attributes: true, attributeFilter: ['data-ds-theme-source'] })
  }
}

// ── 图标（macOS 系统风格，全部内联 SVG，零外部依赖） ──────
// 文件夹画成访达同款蓝色立体文件夹；文件画成 Big Sur 风格的圆角方块
// （纵向渐变 + 顶部高光 + 白色符号）。
//   · 文件列表：按类型上色（PDF 红 / Word 蓝 / Excel 绿 …），便于一眼分辨
//   · 左侧知识库：统一用单色 macOS 文件夹（早期按库 id 哈希上色，五颜六色太乱，已废弃）

var TYPE_STYLE = {
  1:  { c1: '#ff7b72', c2: '#e5484d', label: 'PDF', small: 1 },
  2:  { c1: '#4aa8f0', c2: '#1e7fe0', globe: 1 },
  3:  { c1: '#6a99e8', c2: '#2b579a', label: 'W' },
  4:  { c1: '#f58254', c2: '#d24726', label: 'P' },
  5:  { c1: '#43b97a', c2: '#217346', label: 'X' },
  6:  { c1: '#35e08e', c2: '#07c160', wechat: 1 },
  7:  { c1: '#9aa8b8', c2: '#5b6b7c', label: 'M' },
  8:  { c1: '#39cdbd', c2: '#0f9b8e', image: 1 },
  9:  { c1: '#ffd34d', c2: '#e0a300', note: 1 },
  10: { c1: '#a3b2c2', c2: '#64748b', chat: 1 },
  11: { c1: '#b9bfc9', c2: '#8a8f98', label: 'T' },
  12: { c1: '#b18cfa', c2: '#7c5cff', mind: 1 },
  13: { c1: '#c88ae0', c2: '#9b59b6', mic: 1 },
  14: { c1: '#ff9c66', c2: '#ff6b35', play: 1 },
  15: { c1: '#f27ab5', c2: '#e0518f', mic: 1 },
}

var _icoSeq = 0
function gradId(prefix) { return prefix + (++_icoSeq) }

function icoSvg(size, kids) {
  return h('svg', { width: size, height: size, viewBox: '0 0 32 32', style: { flexShrink: 0, display: 'block' } }, kids)
}

var ICON_FONT = '-apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'

/** 圆角方块里的白色符号（每种类型一个手绘小图形） */
function glyphFor(st, key) {
  if (st.label) {
    return h('text', { key: key, x: 16, y: 16.5, textAnchor: 'middle', dominantBaseline: 'central',
      fill: '#fff', fontWeight: 600, fontSize: st.small ? 9 : 14,
      fontFamily: ICON_FONT, letterSpacing: 0.5 }, st.label)
  }
  if (st.globe) {
    return h('g', { key: key },
      h('circle', { cx: 16, cy: 16, r: 8.5, fill: 'none', stroke: '#fff', strokeWidth: 1.8 }),
      h('ellipse', { cx: 16, cy: 16, rx: 3.8, ry: 8.5, fill: 'none', stroke: '#fff', strokeWidth: 1.3 }),
      h('path', { d: 'M8 13.2h16M8 18.8h16', stroke: '#fff', strokeWidth: 1.3, fill: 'none', strokeLinecap: 'round' }))
  }
  if (st.wechat) {
    return h('path', { key: key, d: 'M16 7.5c-5 0-9 3.1-9 7 0 2.3 1.3 4.3 3.3 5.6l-.7 3.4 3.8-1.9c.8.2 1.7.3 2.6.3 5 0 9-3.1 9-7.1s-4-7.3-9-7.3z', fill: '#fff' })
  }
  if (st.image) {
    return h('g', { key: key },
      h('circle', { cx: 11.5, cy: 11.5, r: 2, fill: '#fff' }),
      h('path', { d: 'M7 23.5l6-7 4 4.5 3.5-3.5 4.5 6', stroke: '#fff', strokeWidth: 2, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }))
  }
  if (st.note) {
    return h('path', { key: key, d: 'M10 22l1-3.6 8.2-8.2a1.7 1.7 0 012.4 0l.2.2a1.7 1.7 0 010 2.4L13.6 21z', fill: '#fff' })
  }
  if (st.chat) {
    return h('g', { key: key },
      h('path', { d: 'M8 10.5A3.5 3.5 0 0111.5 7h9A3.5 3.5 0 0124 10.5v5a3.5 3.5 0 01-3.5 3.5H14l-4 3.5v-3.5h-.5A3.5 3.5 0 016 15.5z', fill: '#fff' }),
      h('circle', { cx: 12.5, cy: 13, r: 1.1, fill: st.c2, key: 'd1' }),
      h('circle', { cx: 16, cy: 13, r: 1.1, fill: st.c2, key: 'd2' }),
      h('circle', { cx: 19.5, cy: 13, r: 1.1, fill: st.c2, key: 'd3' }))
  }
  if (st.mind) {
    return h('g', { key: key },
      h('circle', { cx: 10.5, cy: 16, r: 2.6, fill: '#fff' }),
      h('path', { d: 'M13 14.5L20 10M13.5 17.5l7 4.5M13.5 16h7', stroke: '#fff', strokeWidth: 1.6, fill: 'none', strokeLinecap: 'round' }),
      h('circle', { cx: 22.5, cy: 9.5, r: 2, fill: '#fff', key: 'm1' }),
      h('circle', { cx: 22.5, cy: 22.5, r: 2, fill: '#fff', key: 'm2' }),
      h('circle', { cx: 23.5, cy: 16, r: 2, fill: '#fff', key: 'm3' }))
  }
  if (st.mic) {
    return h('g', { key: key },
      h('rect', { x: 12.8, y: 7.5, width: 6.4, height: 11, rx: 3.2, fill: '#fff' }),
      h('path', { d: 'M9.5 15.5a6.5 6.5 0 0013 0M16 22v3M12.5 25.2h7', stroke: '#fff', strokeWidth: 1.8, fill: 'none', strokeLinecap: 'round' }))
  }
  if (st.play) {
    return h('path', { key: key, d: 'M12.5 9.8l10 6.2-10 6.2z', fill: '#fff' })
  }
  return h('path', { key: key, d: 'M10 6.5h8L23 11v14a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 019 25V8a1.5 1.5 0 011-1.5z', fill: '#fff' })
}

/** 文件类型图标（macOS Big Sur 风格的渐变圆角方块） */
function FileTypeIcon(props) {
  var size = (props && props.size) || 22
  var st = TYPE_STYLE[props.type]
  if (!st) {
    var id0 = gradId('digu')
    return icoSvg(size, [
      h('defs', { key: 'd' }, h('linearGradient', { id: id0, x1: 0, y1: 0, x2: 0, y2: 1 },
        h('stop', { offset: 0, stopColor: '#c3c9d1' }), h('stop', { offset: 1, stopColor: '#9aa2ad' }))),
      h('rect', { key: 'r', x: 2, y: 2, width: 28, height: 28, rx: 7.5, fill: 'url(#' + id0 + ')' }),
      h('path', { key: 'g', d: 'M11 9h7l4 4v10.5a1 1 0 01-1 1H11a1 1 0 01-1-1V10a1 1 0 011-1z', fill: '#fff', opacity: 0.92 }),
    ])
  }
  var id = gradId('dig')
  return icoSvg(size, [
    h('defs', { key: 'd' }, h('linearGradient', { id: id, x1: 0, y1: 0, x2: 0, y2: 1 },
      h('stop', { offset: 0, stopColor: st.c1 }), h('stop', { offset: 1, stopColor: st.c2 }))),
    h('rect', { key: 'r', x: 2, y: 2, width: 28, height: 28, rx: 7.5, fill: 'url(#' + id + ')' }),
    h('rect', { key: 'h', x: 2, y: 2, width: 28, height: 15, rx: 7.5, fill: '#fff', opacity: 0.16 }),
    glyphFor(st, 'g'),
  ])
}

/** 文件夹图标（访达同款蓝色立体文件夹） */
function MacFolderIcon(props) {
  var s = (props && props.size) || 20
  var id = gradId('dif')
  return h('svg', { width: s, height: s, viewBox: '0 0 48 48', style: { flexShrink: 0, display: 'block' } },
    h('defs', null, h('linearGradient', { id: id, x1: 0, y1: 0, x2: 0, y2: 1 },
      h('stop', { offset: 0, stopColor: '#7db9f2' }), h('stop', { offset: 1, stopColor: '#3f8ef7' }))),
    h('path', { d: 'M5 12a4 4 0 014-4h9.4c1 0 2 .4 2.7 1.1l3.2 3.4H39a4 4 0 014 4v3.5H5z', fill: '#2e7cd6' }),
    h('rect', { x: 5, y: 15, width: 38, height: 25, rx: 4.5, fill: 'url(#' + id + ')' }),
    h('rect', { x: 5, y: 15, width: 38, height: 12, rx: 4.5, fill: '#fff', opacity: 0.18 }),
  )
}

/**
 * 知识库图标：统一用 macOS 访达同款蓝色文件夹。
 * 之前给每个库按名称哈希配色 + 首字，颜色太杂反而干扰识别；
 * 分组标题已经说明「个人/共享」，这里统一单色更干净。
 */
function KbIcon(props) {
  return h(MacFolderIcon, { size: (props && props.size) || 18 })
}

function ChevGlyph() {
  return h('svg', { width: 10, height: 10, viewBox: '0 0 10 10', fill: 'none' },
    h('path', { d: 'M2.5 3.8L5 6.3l2.5-2.5', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' }))
}

/** 类型兜底扩展名：标题没有扩展名时，用类型推断出来喂给预览引擎 */
var TYPE_EXT = {
  1: 'pdf', 3: 'docx', 4: 'pptx', 5: 'xlsx', 7: 'md', 8: 'png',
  11: 'txt', 12: 'xmind', 13: 'txt', 14: 'mp4', 15: 'm4a',
}
/** 直接打开原链接、不进详情页的类型 */
var OPEN_URL_TYPES = { 2: 1, 6: 1 }

/**
 * 给预览引擎一个带扩展名的文件名。
 * ima 的标题常常没有扩展名（比如播客「xxx宣讲_260811170025」），
 * 引擎认不出格式就会显示"不支持预览" —— 实际上文件是好的。
 * 优先从 URL 路径取扩展名，取不到再用类型兜底。
 */
function fileNameFor(title, url, mediaType) {
  var t = String(title || '')
  if (/\.[A-Za-z0-9]{2,5}$/.test(t)) return t
  try {
    var m = new URL(url).pathname.match(/\.([A-Za-z0-9]{2,5})$/)
    if (m) return t + '.' + m[1].toLowerCase()
  } catch (e) {}
  var ext = TYPE_EXT[mediaType]
  return ext ? t + '.' + ext : t
}

function FolderGlyph(props) {
  var s = (props && props.size) || 18
  return h('svg', { width: s, height: s, viewBox: '0 0 20 20', fill: 'none' },
    h('path', {
      d: 'M2.5 5A1.8 1.8 0 014.3 3.2h3.1c.5 0 .9.2 1.2.6l1 1.3c.3.4.7.6 1.2.6h4.9A1.8 1.8 0 0117.5 7.5v7.7a1.8 1.8 0 01-1.8 1.8H4.3a1.8 1.8 0 01-1.8-1.8V5z',
      stroke: 'currentColor', strokeWidth: 1.45,
    }),
  )
}
function RefreshIcon(props) {
  var s = (props && props.size) || 15
  return h('svg', { width: s, height: s, viewBox: '0 0 16 16', fill: 'none' },
    h('path', {
      d: 'M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2v3.2h-3.2',
      stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round',
    }),
  )
}
function CopyGlyph() {
  return h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none' },
    h('rect', { x: 5.5, y: 5.5, width: 8, height: 8, rx: 1.5, stroke: 'currentColor', strokeWidth: 1.1 }),
    h('path', { d: 'M10.5 3.5H4a1.5 1.5 0 00-1.5 1.5v6.5', stroke: 'currentColor', strokeWidth: 1.1 }),
  )
}
function QuoteGlyph() {
  return h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none' },
    h('path', {
      d: 'M6 9.5L10 5.5M6.8 4.2l1.5-1.5a2.6 2.6 0 013.7 3.7l-1.5 1.5M9.2 11.8l-1.5 1.5a2.6 2.6 0 01-3.7-3.7l1.5-1.5',
      stroke: 'currentColor', strokeWidth: 1.1, strokeLinecap: 'round',
    }),
  )
}
function ExternalGlyph() {
  return h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none' },
    h('path', {
      d: 'M9.5 2.5h4v4M13.5 2.5L7.5 8.5M12 9.5v3a1.5 1.5 0 01-1.5 1.5h-6A1.5 1.5 0 013 12.5v-6A1.5 1.5 0 014.5 5h3',
      stroke: 'currentColor', strokeWidth: 1.1, strokeLinecap: 'round', strokeLinejoin: 'round',
    }),
  )
}

// ── 工具 ─────────────────────────────────────────────────
function api(path, opts) {
  return fetch(API + path, opts).then(function (r) { return r.json() })
}
function fmtTime(d) {
  if (!d) return ''
  var p = function (n) { return String(n).padStart(2, '0') }
  return p(d.getHours()) + ':' + p(d.getMinutes())
}
/** 文件最后更新时间：有就显示（今年省略年份），没有就留空 —— 绝不造假数据 */
function fmtDate(v) {
  if (!v) return ''
  var n = Number(v)
  var d = isNaN(n) || v === '' ? new Date(v) : new Date(n > 1e12 ? n : n * 1000)
  if (isNaN(d.getTime())) return ''
  var p = function (x) { return String(x).padStart(2, '0') }
  var now = new Date()
  return d.getFullYear() === now.getFullYear()
    ? p(d.getMonth() + 1) + '-' + p(d.getDate())
    : d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
}
function toast(msg) {
  try {
    var el = document.createElement('div')
    el.className = 'dsh-ima-toast'
    el.textContent = msg
    document.body.appendChild(el)
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el) }, 1800)
  } catch (e) {}
}
/**
 * 复制到剪贴板。
 * @param {boolean} silent 静默模式：不弹「已复制」提示。
 *        调用方自己会弹更具体的提示时用它，避免两个 toast 叠在一起糊成一团。
 */
function copyText(text, silent) {
  var onOk = function () { if (!silent) toast('已复制') }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(onOk, function () { fallbackCopy(text, silent) })
      return
    }
  } catch (e) {}
  fallbackCopy(text, silent)
}
function fallbackCopy(text, silent) {
  try {
    var ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    if (!silent) toast('已复制')
  } catch (e) { toast('复制失败，请手动选中') }
}
function sendToConversation(text) {
  try {
    var el = document.querySelector('textarea[placeholder]') ||
             document.querySelector('[contenteditable="true"]')
    if (el) {
      if (el.tagName === 'TEXTAREA') {
        var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
        setter.call(el, text)
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.focus()
        toast('已填入对话框')
        return true
      }
      if (el.isContentEditable) {
        el.focus()
        document.execCommand('insertText', false, text)
        toast('已填入对话框')
        return true
      }
    }
  } catch (e) {}
  // 兜底：放进剪贴板。这里用静默复制，只弹下面这一条提示
  copyText(text, true)
  toast('已复制，粘贴到对话框即可')
  return false
}

/** 极简 Markdown 渲染（笔记/纯文本兜底用） */
function renderMarkdown(src) {
  var lines = String(src).split('\n')
  var out = []
  var listBuf = []
  var key = 0

  var URL_RE = /https?:\/\/[A-Za-z0-9\-._~:\/?#\[\]@!$&'()*+,;=%]+/g
  // 段落开头的序号/小标题标记 —— 保留原样并加粗。
  // ⚠️ 故意不把「1.」「（一）」转成 <ol>：相邻的「（一）…」和「1.…」会被浏览器
  //    当成同一个列表重新编号，原来的 1. 会被显示成 2.，那是篡改语义。
  var LEAD_MARK = /^([（(][0-9一二三四五六七八九十]{1,3}[）)]|[一二三四五六七八九十]{1,3}、|[0-9]{1,3}[.、](?=[\u3400-\u4dbf\u4e00-\u9fff])|【[^】\n]{1,40}】)/

  function inline(t) {
    // 先把 **加粗** / `代码` / [文字](链接) / 裸链接 抠出来
    var re = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]*\]\([^)\s]+\))/g
    var parts = []
    var last = 0
    var m
    function plain(chunk) {
      // 裸链接：笔记里经常直接贴 URL（实测有些还和前后汉字粘在一起，只能尽力切）
      URL_RE.lastIndex = 0
      var cut = 0
      var mm
      while ((mm = URL_RE.exec(chunk))) {
        if (mm.index > cut) parts.push(chunk.slice(cut, mm.index))
        parts.push(h('a', { key: 'a' + (key++), href: mm[0], target: '_blank', rel: 'noreferrer' }, mm[0]))
        cut = mm.index + mm[0].length
      }
      if (cut < chunk.length) parts.push(chunk.slice(cut))
    }
    while ((m = re.exec(t))) {
      if (m.index > last) plain(t.slice(last, m.index))
      var tok = m[0]
      if (tok.slice(0, 2) === '**') parts.push(h('strong', { key: 'b' + (key++) }, tok.slice(2, -2)))
      else if (tok.charAt(0) === '`') parts.push(h('code', { key: 'c' + (key++) }, tok.slice(1, -1)))
      else {
        var mm2 = /^\[([^\]]*)\]\(([^)\s]+)\)$/.exec(tok)
        parts.push(h('a', { key: 'k' + (key++), href: mm2[2], target: '_blank', rel: 'noreferrer' }, mm2[1] || mm2[2]))
      }
      last = m.index + tok.length
    }
    if (last < t.length) plain(t.slice(last))
    if (!parts.length) return t
    // 过滤掉纯文本里的 '\n' 不该出现（行已切分），但保留以兼容异常输入
    return parts
  }

  function flushList() {
    if (!listBuf.length) return
    out.push(h('ul', { key: 'u' + (key++) },
      listBuf.map(function (t, i) { return h('li', { key: i }, inline(t)) })))
    listBuf = []
  }

  /** 段首的序号标记加粗，其余照旧 */
  function para(line) {
    var m = LEAD_MARK.exec(line)
    if (!m) return inline(line)
    var rest = line.slice(m[0].length)
    return [h('strong', { key: 'm' + (key++) }, m[0])].concat(rest ? inline(rest) : [])
  }

  lines.forEach(function (line) {
    var m
    if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) {
      flushList()
      out.push(h('h' + m[1].length, { key: 'h' + (key++) }, inline(m[2])))
    } else if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushList()
      out.push(h('hr', { key: 'r' + (key++) }))
    } else if ((m = /^>\s?(.*)$/.exec(line))) {
      flushList()
      out.push(h('blockquote', { key: 'q' + (key++) }, inline(m[1])))
    } else if (/^(发言人|说话人|说话者|Speaker)\s*\d{1,2}\s+\d{1,2}:\d{2}$/i.test(line.trim())) {
      flushList()
      out.push(h('div', { key: 's' + (key++) }, h('span', { className: 'dsh-ima-spk' }, line.trim())))
    } else if ((m = /^\s*[-*+]\s+(.*)$/.exec(line))) {
      // 真 Markdown 的项目符号（.md 类文件才有，展平后的笔记不会有）
      listBuf.push(m[1])
    } else if (line.trim() === '') {
      flushList()
    } else {
      flushList()
      out.push(h('p', { key: 'p' + (key++) }, para(line)))
    }
  })
  flushList()
  return h('div', { className: 'dsh-ima-md' }, out)
}

// ── 笔记正文重排（2026-10-16 实测，别再试图「修好」它）──────────────────
// ima 的笔记接口 openapi/note/v1/get_doc_content 只返回一个**已被服务端展平的
// 纯文本 content 字段**，段落边界是在 ima 那一侧丢掉的：
//   · data 顶层只有 content 一个键；format / content_type / with_blocks / rich / type
//     这些参数传什么都一样，返回字节完全一致（md5 相同）
//   · 另探 8 个更「结构化」的候选接口（get_doc_blocks / get_doc_content_v2 /
//     get_doc_detail / list_doc_blocks / get_doc_markdown …）全部 HTTP 404
//   · 6 个真实样本里零宽空格、BOM、\r、\t、全角空格、U+2028 的数量**全部为 0**
//   · 一份 28868 字的会议记录，\n 的数量是 0
// 所以「无损还原」不可能做到。这里退一步：只用**实测出现过、且不会误伤**的
// 高置信锚点做「有损但可读」的段落重排；界面上留了「原文」按钮可随时对照。
var NOTE_CJK = /[\u3400-\u4dbf\u4e00-\u9fff]/
var NOTE_SENT_END = '。！？；：!?;:…）)」』】"”'
// 这些字后面的「X、」不是标题而是量词/序数（如「二十届二中、三中全会」）
var NOTE_NO_BREAK_AFTER = '第届中月日号年十百千万亿期时分秒'

function isCjk(ch) { return !!ch && NOTE_CJK.test(ch) }
function isSentEnd(ch) { return !!ch && NOTE_SENT_END.indexOf(ch) >= 0 }

/** 如果正文开头就是标题原样重复（实测 6 个样本里 5 个如此），去掉这一段 */
function stripLeadingTitle(s, title) {
  var t = String(title == null ? '' : title).trim()
  if (!t || t.length < 4) return s
  var k = 0
  var i = 0
  while (k < t.length && i < s.length) {
    if (/\s/.test(t.charAt(k))) { k++; continue }
    if (/\s/.test(s.charAt(i))) { i++; continue }
    if (t.charAt(k) !== s.charAt(i)) break
    k++; i++
  }
  if (k < t.length) return s
  return s.slice(i).replace(/^[\s:：\-—|·]+/, '')
}

/**
 * 把 ima 展平后的正文按高置信锚点重排成有段落的样子。
 * 有损、但**不改一个字**：只在锚点前面插入换行，不增删任何原文内容。
 */
function beautifyNoteText(raw, title) {
  var s = String(raw == null ? '' : raw)
  if (!s.trim()) return s
  s = s.replace(/\r\n?/g, '\n')
  s = stripLeadingTitle(s, title)

  // ① 会议听记：把「发言人1 00:24」提成独立一行（实测单文件出现 414 次，收益最大）
  s = s.replace(/(发言人|说话人|说话者|Speaker)\s*(\d{1,2})\s*(\d{1,2}:\d{2})/gi,
    function (_, who, n, ts) { return '\n\n' + who + n + ' ' + ts + '\n' })

  // ②~⑥ 收集「应在该下标之前换行」的位置，level 2 = 空行分段，1 = 仅换行
  var marks = Object.create(null)
  function mark(i, lv) {
    if (i > 0 && (!marks[i] || marks[i] < lv)) marks[i] = lv
  }
  var m

  // ② 【…】小标题
  var reA = /【[^】\n]{1,40}】/g
  while ((m = reA.exec(s))) mark(m.index, 2)

  // ③ 旧版- / 新版-
  var reB = /(?:旧版|新版)\s*[-—－]/g
  while ((m = reB.exec(s))) mark(m.index, 2)

  // ④ （一）（二）式中文序号（全角/半角括号都认）
  var reC = /[（(][一二三四五六七八九十]{1,3}[）)]/g
  while ((m = reC.exec(s))) mark(m.index, 2)

  // ④b （1）（2）式阿拉伯序号
  var reF = /[（(][0-9]{1,3}[）)]/g
  while ((m = reF.exec(s))) mark(m.index, 2)

  // ⑤ 一、二、三、式章节标题（最容易误伤，条件最严）
  var reD = /[一二三四五六七八九十]{1,3}、/g
  while ((m = reD.exec(s))) {
    var p = s.charAt(m.index - 1)
    var nx = s.charAt(m.index + m[0].length)
    // 前一字必须是段首/换行/句末，且不能是量词 —— 否则「二中、」会被误切
    var okPrev = m.index === 0 || p === '\n' || isSentEnd(p)
    if (okPrev && NOTE_NO_BREAK_AFTER.indexOf(p) < 0 && isCjk(nx)) mark(m.index, 2)
  }

  // ⑥ 1. / 1、式列表项 —— 必须同时躲开 URL、小数、版本号
  var reE = /[0-9]{1,2}[.、]/g
  while ((m = reE.exec(s))) {
    var pi = m.index - 1
    var p2 = s.charAt(pi)
    var n2 = s.charAt(m.index + m[0].length)
    // 前一字符是字母/数字/点/斜杠等 → 一定是 URL、小数、版本号（agnes-2.5-flash、…-20230901）
    if (/[0-9A-Za-z./%\-_]/.test(p2)) continue
    // 后面必须紧跟中文，否则不是列表项（"480p"、"2024 年"、"2.5 万"都被这条挡住）
    if (!isCjk(n2)) continue
    // 前面必须是段首/换行/句末/右括号/中文（"（一）政务服务类1.智能问答" 这种就是前面接中文）
    if (!(m.index === 0 || p2 === '\n' || isSentEnd(p2) || p2 === '）' || p2 === ')' || isCjk(p2))) continue
    mark(m.index, 1)
  }

  // ⑦ 裸链接另起一行（笔记里经常直接把一堆 URL 堆在一起）
  var reU = /https?:\/\//g
  while ((m = reU.exec(s))) {
    var pu = s.charAt(m.index - 1)
    if (pu === '(' || pu === '<' || pu === '"' || pu === '=' || pu === '\n') continue
    mark(m.index, 1)
  }

  var idx = Object.keys(marks).map(Number).sort(function (a, b) { return a - b })
  if (!idx.length) return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '')

  var out = ''
  var last = 0
  idx.forEach(function (i) {
    if (i <= last) return
    out += s.slice(last, i)
    out += marks[i] >= 2 ? '\n\n' : '\n'
    last = i
  })
  out += s.slice(last)
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '')
}

// ── 预览挂载器（真正用 open-file-viewer 渲染） ────────────
// 引擎认不出的格式（比如 PDF —— 我们没打 pdfPlugin，它有 Node 原生依赖）
// 自动退回浏览器原生 iframe，不让用户看到空白
function ViewerBox(props) {
  var ref = React.useRef(null)
  var instRef = React.useRef(null)
  var fs = React.useState(false)
  var fallback = fs[0], setFallback = fs[1]

  React.useEffect(function () { setFallback(false) }, [props.source])

  React.useEffect(function () {
    var V = window.__DSH_IMA_VIEWER__
    if (fallback || !ref.current || !V) return
    var destroyed = false

    try {
      if (instRef.current) { try { instRef.current.destroy() } catch (e) {} instRef.current = null }
      instRef.current = V.createViewer({
        container: ref.current,
        file: props.source,
        fileName: props.fileName,
        height: '100%',
        width: '100%',
        fit: 'contain',
        toolbar: true,
        theme: 'auto',
        plugins: V.makePlugins(),
        onUnsupported: function () { if (!destroyed) setFallback(true) },
        onError: function () { if (!destroyed) setFallback(true) },
      })
    } catch (e) {
      setFallback(true)
    }

    return function () {
      destroyed = true
      if (instRef.current) { try { instRef.current.destroy() } catch (e) {} instRef.current = null }
    }
  }, [props.source, props.fileName, fallback])

  if (fallback) {
    // 原生兜底：PDF / 图片 / 音视频浏览器都能直接渲染
    var ext = String(props.fileName || '').split('.').pop().toLowerCase()
    if (ext === 'pdf') {
      return h('iframe', {
        className: 'dsh-ima-frame',
        src: props.source,
        title: props.fileName,
        style: { flex: 1, minHeight: '60vh' },
      })
    }
    if (/^(png|jpe?g|gif|webp|bmp|svg|avif|ico)$/.test(ext)) {
      return h('img', { className: 'dsh-ima-media', src: props.source, alt: props.fileName })
    }
    if (/^(mp4|webm|mov|m4v)$/.test(ext)) {
      return h('video', { className: 'dsh-ima-media', src: props.source, controls: true })
    }
    if (/^(mp3|wav|m4a|ogg|aac|flac)$/.test(ext)) {
      return h('audio', { className: 'dsh-ima-media', src: props.source, controls: true })
    }
    return h('div', { className: 'dsh-ima-note', style: { marginTop: '12px' } },
      '这个格式没法内联预览，点右上角「下载」拿原文件。')
  }

  return h('div', { ref: ref, className: 'dsh-ima-vbox', style: { flex: 1, minHeight: '60vh' } })
}

// ── 侧边栏入口（⚠️ 只返回图标） ──────────────────────────
function PanelGlyph(props) {
  return h(FolderGlyph, { size: (props && props.size) || 18 })
}

// ── 主面板 ───────────────────────────────────────────────
/**
 * 错误边界：界面渲染出错时显示原因，而不是让整个面板变成一片空白。
 * 空白面板是最糟的失败方式 —— 用户看不到任何线索，也没法自助。
 */
class PanelBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { err: null }
  }
  static getDerivedStateFromError(err) { return { err } }
  componentDidCatch(err) {
    console.error('[dsh-ima] 界面渲染出错：', err)
  }
  render() {
    if (this.state.err) {
      return h('div', { className: 'dsh-ima-root' },
        h('div', { className: 'dsh-ima-head' }, h('span', { className: 'dsh-ima-title' }, '知识库 ima')),
        h('div', { className: 'dsh-ima-main' },
          h('div', { className: 'dsh-ima-err' },
            '界面出了点问题：' + String((this.state.err && this.state.err.message) || this.state.err)),
          h('div', { className: 'dsh-ima-note', style: { marginTop: '10px' } },
            '可以点下面的按钮重试；如果反复出现，重启 DSH 再看看。'),
          h('button', {
            className: 'dsh-ima-btn dsh-ima-btn-p', style: { marginTop: '14px' },
            onClick: function () { this.setState({ err: null }) }.bind(this),
          }, '重试'),
        ),
      )
    }
    return this.props.children
  }
}

function ImaPage(props) {
  // 面板可见时才需要读剪贴板；DSH 会把 active 传进来，拿不到就默认可读
  var panelActive = !props || props.active !== false
  var st = React.useState(null); var status = st[0], setStatus = st[1]
  var ks = React.useState([]); var kbs = ks[0], setKbs = ks[1]
  var os = React.useState({ mine: true, shared: true }); var secOpen = os[0], setSecOpen = os[1]
  var cs = React.useState(null); var curKb = cs[0], setCurKb = cs[1]
  var is = React.useState([]); var items = is[0], setItems = is[1]
  var ps = React.useState([]); var path = ps[0], setPath = ps[1]
  var ls = React.useState(false); var loading = ls[0], setLoading = ls[1]
  var es = React.useState(''); var error = es[0], setError = es[1]
  var vs = React.useState(null); var preview = vs[0], setPreview = vs[1]
  var bs = React.useState(false); var showBind = bs[0], setShowBind = bs[1]
  var us = React.useState(null); var updatedAt = us[0], setUpdatedAt = us[1]
  var cus = React.useState(false); var confirmUnbind = cus[0], setConfirmUnbind = cus[1]
  // 笔记正文是 ima 展平过的，「还原排版」只是尽力重排，保留一个「原文」视角便于对照
  var rms = React.useState(false); var rawMode = rms[0], setRawMode = rms[1]

  var msg = function (e) { return String((e && e.message) || e) }

  var refreshStatus = function () {
    return api('/status').then(function (s) {
      setStatus(s)
      if (!s.bound) { setKbs([]); setCurKb(null); setItems([]); setPreview(null) }
      return s
    }).catch(function (e) { setError(msg(e)) })
  }
  var loadKbs = function () {
    setLoading(true); setError('')
    return api('/knowledgeBases?type=all').then(function (r) {
      if (!r.ok) {
        if (r.needRebind) { setStatus({ bound: false }); setShowBind(true) }
        setError(r.message); return
      }
      setKbs(r.knowledgeBases); setUpdatedAt(new Date())
    }).catch(function (e) { setError(msg(e)) })
      .then(function () { setLoading(false) })
  }
  var loadMedia = function (kb, folderId) {
    if (!kb) return
    setLoading(true); setError(''); setPreview(null)
    return api('/media?kb=' + encodeURIComponent(kb.id) + '&folder=' + encodeURIComponent(folderId || '')).then(function (r) {
      if (!r.ok) { setError(r.message); return }
      setItems(r.items); setPath(r.currentPath); setUpdatedAt(new Date())
    }).catch(function (e) { setError(msg(e)) })
      .then(function () { setLoading(false) })
  }

  React.useEffect(function () { refreshStatus() }, [])
  React.useEffect(function () {
    if (status && status.bound) loadKbs()
  }, [status && status.bound])

  var onBind = function (clientId, apiKey) {
    setError('')
    return api('/bind', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId: clientId, apiKey: apiKey }),
    }).then(function (r) {
      if (r.ok) {
        setShowBind(false)
        return refreshStatus().then(function () { return loadKbs() }).then(function () { return true })
      }
      setError(r.message)
      return false
    }).catch(function (e) { setError(msg(e)); return false })
  }

  var onUnbind = function () {
    if (!confirmUnbind) {
      setConfirmUnbind(true)
      setTimeout(function () { setConfirmUnbind(false) }, 4000)
      return
    }
    setConfirmUnbind(false)
    setError('')
    return api('/unbind', { method: 'POST' }).then(function (r) {
      if (!r || !r.ok) { setError((r && r.message) || '解绑失败，请重试'); return }
      toast('已解绑')
      return refreshStatus()
    }).then(function () {
      setKbs([]); setCurKb(null); setItems([]); setPath([]); setPreview(null)
    }).catch(function (e) { setError(msg(e)) })
  }

  /** 网页 / 微信文章：不进详情页，直接在新窗口打开原始链接 */
  var openOriginal = function (item) {
    setLoading(true); setError('')
    return api('/mediaContent?id=' + encodeURIComponent(item.mediaId)).then(function (r) {
      if (r.ok && r.url) {
        try { window.open(r.url, '_blank', 'noopener') } catch (e) {}
        return
      }
      setError((r && r.message) || '没能取到这个网页的原始链接')
    }).catch(function (e) { setError(msg(e)) })
      .then(function () { setLoading(false) })
  }

  var onItemClick = function (item) {
    if (item.isFolder) { loadMedia(curKb, item.mediaId); return }
    // 这两类本质是链接，给个详情页反而多一层，直接跳原站更合理
    if (OPEN_URL_TYPES[item.mediaType]) { openOriginal(item); return }
    setLoading(true); setError(''); setRawMode(false)
    return api('/mediaContent?id=' + encodeURIComponent(item.mediaId)).then(function (r) {
      if (!r.ok) { setError(r.message); return }
      setPreview({
        title: item.title,
        mediaType: r.mediaType,
        url: r.url || '',
        content: r.content || '',
        noteId: r.noteId || '',
        bytes: r.bytes,
        truncated: r.truncated,
        reason: r.reason,
        binary: !!r.binary,
      })
    }).catch(function (e) { setError(msg(e)) })
      .then(function () { setLoading(false) })
  }

  var goCrumb = function (idx) {
    var p = path[idx]
    loadMedia(curKb, p && p.folderId ? p.folderId : '')
  }
  var refText = function (item) {
    return '请读取我 ima 知识库中的文件：' + item.title + '（media_id: ' + item.mediaId + '）'
  }

  var toggleSec = function (key) {
    var n = {}
    for (var k in secOpen) n[k] = secOpen[k]
    n[key] = !n[key]
    setSecOpen(n)
  }
  /** 左侧分组：对齐 ima 自己的「个人知识库 / 共享知识库」折叠分组 */
  var renderSection = function (key, title, list) {
    if (!list.length) return null
    var open = secOpen[key] !== false
    return h('div', { key: key, className: 'dsh-ima-kbsec' },
      h('div', {
        className: 'dsh-ima-kbsec-h',
        onClick: function () { toggleSec(key) },
      },
        h('span', { className: 'dsh-ima-chev' + (open ? '' : ' dsh-ima-chev-off') }, h(ChevGlyph)),
        h('span', { className: 'dsh-ima-kbsec-t' }, title),
        h('span', { className: 'dsh-ima-spacer' }),
        h('button', {
          className: 'dsh-ima-kbsec-add',
          title: '在 ima 里新建知识库（打开 ima 网页版）',
          onClick: function (e) {
            e.stopPropagation()
            try { window.open('https://ima.qq.com', '_blank', 'noopener') } catch (err) {}
          },
        }, '+'),
      ),
      open ? list.map(function (kb) {
        return h('div', {
          key: kb.id,
          className: 'dsh-ima-kb' + (curKb && curKb.id === kb.id ? ' dsh-ima-kb-on' : ''),
          title: (kb.description ? kb.description + '\n' : '') + (kb.contentCount || 0) + ' 个内容',
          onClick: function () { setCurKb(kb); loadMedia(kb, '') },
        },
          h(KbIcon, { size: 18 }),
          h('span', { className: 'dsh-ima-kb-name' }, kb.name),
        )
      }) : null,
    )
  }

  // ── 未绑定 ──
  if (!status || !status.bound) {
    return h('div', { className: 'dsh-ima-root' },
      h('div', { className: 'dsh-ima-head' }, h('span', { className: 'dsh-ima-title' }, '知识库 ima')),
      h('div', { className: 'dsh-ima-body' },
        h('div', { className: 'dsh-ima-center' },
          showBind
            ? h(BindDialog, {
                onBind: onBind,
                error: error,
                active: panelActive,
                onCancel: function () { setShowBind(false); setError('') },
                onBound: function () { setShowBind(false); setError(''); refreshStatus().then(function () { return loadKbs() }) },
              })
            : h('div', { className: 'dsh-ima-empty' },
                h('div', { style: { marginBottom: '8px' } }, '尚未绑定 ima 账号'),
                h('div', { className: 'dsh-ima-note', style: { marginBottom: '16px' } }, '绑定后即可浏览知识库，并让 agent 直接调用其中的文件'),
                h('button', { className: 'dsh-ima-btn dsh-ima-btn-p', onClick: function () { setShowBind(true) } }, '立即绑定'),
              ),
        ),
      ),
    )
  }

  var curFolder = path.length > 1 ? path[path.length - 1].folderId : ''

  // ── 预览区 ──
  var previewBody = null
  // 正文是否是「被 ima 展平过的笔记」：接口只回一个 content 字符串，
  // 段落边界在 ima 那侧就没了，这里按锚点尽力还原（详见 beautifyNoteText 的注释）
  var isFlatText = !!(preview && !preview.url && preview.content)
  var prettyText = ''
  if (isFlatText) prettyText = beautifyNoteText(preview.content, preview.title)
  var textChanged = isFlatText && prettyText !== String(preview.content)

  if (preview) {
    var V = window.__DSH_IMA_VIEWER__
    if (V && preview.url) {
      // 有直链就让预览引擎处理（COS 带 ACAO:*，浏览器可直接取）
      // ⚠️ 必须传带扩展名的文件名：ima 的标题常常没有扩展名，
      //    引擎认不出格式就会显示"不支持预览"（播客/录音就是栽在这）
      previewBody = h(ViewerBox, {
        source: preview.url,
        fileName: fileNameFor(preview.title, preview.url, preview.mediaType),
        onError: function () { /* 引擎自己会显示错误态 */ },
      })
    } else if (preview.content) {
      previewBody = h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } },
        h('div', { className: 'dsh-ima-pre' },
          renderMarkdown(rawMode ? preview.content : prettyText),
          textChanged
            ? h('div', { className: 'dsh-ima-rawhint' },
                rawMode
                  ? '↑ 这是 ima 接口返回的原文（未做任何处理）。'
                  : '↑ 段落是按标点、序号、「发言人 + 时间戳」等可见锚点还原的，仅供阅读。',
                'ima 的笔记接口只返回一段已展平的纯文本，原始段落结构在 ima 服务端就丢失了，'
                + '插件无法无损还原，原文一个字都没有改动。',
              )
            : null,
        ),
      )
    } else {
      previewBody = h('div', { className: 'dsh-ima-note', style: { marginTop: '12px' } },
        preview.reason || '这个文件没有办法内联预览，点右上角下载原文件。')
    }
  }

  return h('div', { className: 'dsh-ima-root' },
    h('div', { className: 'dsh-ima-head' },
      h('span', { className: 'dsh-ima-title' }, '知识库 ima'),
      h('span', { className: 'dsh-ima-badge' }, '已绑定 ima 知识库'),
      h('span', { className: 'dsh-ima-spacer' }),
      updatedAt ? h('span', { className: 'dsh-ima-stamp', title: 'ima 不支持增量同步，这里显示上次从 ima 获取数据的时间' }, '更新于 ' + fmtTime(updatedAt)) : null,
      h('button', { className: 'dsh-ima-ibtn', onClick: function () { loadKbs() }, title: '重新获取知识库列表' }, h(RefreshIcon)),
      h('button', { className: 'dsh-ima-btn dsh-ima-btn-d', onClick: onUnbind }, confirmUnbind ? '再点一次确认' : '解绑'),
    ),
    error ? h('div', { className: 'dsh-ima-err' }, error) : null,
    h('div', { className: 'dsh-ima-body' },
      h('div', { className: 'dsh-ima-kbs' },
        kbs.length === 0 && !loading ? h('div', { className: 'dsh-ima-note' }, '没有知识库') : null,
        renderSection('mine', '个人知识库', kbs.filter(function (k) { return k.baseType !== '共享知识库' })),
        renderSection('shared', '共享知识库', kbs.filter(function (k) { return k.baseType === '共享知识库' })),
      ),
      h('div', { className: 'dsh-ima-main' },
        !curKb
          ? h('div', { className: 'dsh-ima-empty' }, '从左侧选择一个知识库')
          : [
              h('div', { key: 'crumb', className: 'dsh-ima-crumb' },
                h('a', { onClick: function () { goCrumb(0) } }, curKb.name),
                path.slice(1).map(function (p, i) {
                  return h('span', { key: p.folderId || i, style: { flexShrink: 0 } }, ' / ',
                    h('a', { onClick: function () { goCrumb(i + 1) } }, p.name))
                }),
                h('span', { className: 'dsh-ima-spacer' }),
                h('button', { className: 'dsh-ima-ibtn', onClick: function () { loadMedia(curKb, curFolder) }, title: '重新获取文件列表' }, h(RefreshIcon, { size: 14 })),
              ),
              preview
                ? h('div', { key: 'pv', style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } },
                    h('div', { className: 'dsh-ima-crumb' },
                      h('button', { className: 'dsh-ima-btn', onClick: function () { setPreview(null) } }, '返回列表'),
                      h('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500, minWidth: 0 } }, preview.title),
                      // 只有「确实重排过」才给对照开关，没事不加按钮
                      textChanged
                        ? h('button', {
                            className: 'dsh-ima-btn',
                            title: '在「尽力还原的排版」和「ima 返回的原始文本」之间切换，便于核对',
                            onClick: function () { setRawMode(!rawMode) },
                          }, rawMode ? '恢复排版' : '看原文')
                        : null,
                      preview.url ? h('a', { className: 'dsh-ima-btn', href: preview.url, target: '_blank', rel: 'noreferrer' }, '下载') : null,
                      h('button', { className: 'dsh-ima-btn', onClick: function () { copyText(preview.title) } }, '复制名称'),
                      // 主操作放最后、用主色实心，最显眼
                      h('button', {
                        className: 'dsh-ima-btn dsh-ima-btn-p',
                        title: '把它交给对话里的 agent 读取',
                        onClick: function () { sendToConversation('请读取我 ima 知识库中的文件：' + preview.title) },
                      }, h(QuoteGlyph), '引用到对话'),
                    ),
                    previewBody,
                    preview.truncated ? h('div', { className: 'dsh-ima-stamp', style: { marginTop: '8px' } }, '（内容过长，已截断）') : null,
                  )
                : items.length === 0
                  ? h('div', { key: 'e', className: 'dsh-ima-empty' }, loading ? '加载中…' : '这个目录是空的')
                  : items.map(function (it) {
                      var isLink = !it.isFolder && !!OPEN_URL_TYPES[it.mediaType]
                      return h('div', {
                        key: it.mediaId,
                        className: 'dsh-ima-item',
                        title: (isLink ? '在新窗口打开原链接' : '点击预览') + ' · ' + (it.typeLabel || ''),
                        onClick: function () { onItemClick(it) },
                      },
                        it.isFolder ? h(MacFolderIcon, { size: 20 }) : h(FileTypeIcon, { type: it.mediaType, size: 22 }),
                        h('span', { className: 'dsh-ima-item-t' }, it.title),
                        // 最后更新时间：ima 的 OpenAPI 目前（2026-10-16）不返回任何时间字段，
                        // 这里只在拿得到的时候显示，拿不到就留空，绝不造假数据
                        it.updateTime ? h('span', { className: 'dsh-ima-item-y' }, fmtDate(it.updateTime)) : null,
                        it.isFolder
                          ? null
                          : h('span', { className: 'dsh-ima-act' },
                              isLink
                                ? h('button', {
                                    className: 'dsh-ima-actbtn dsh-ima-actbtn-p',
                                    title: '在新窗口打开原始链接',
                                    onClick: function (e) { e.stopPropagation(); openOriginal(it) },
                                  }, h(ExternalGlyph), '打开原文')
                                : h('button', {
                                    className: 'dsh-ima-actbtn dsh-ima-actbtn-p',
                                    title: '把它交给对话里的 agent 读取',
                                    onClick: function (e) { e.stopPropagation(); sendToConversation(refText(it)) },
                                  }, h(QuoteGlyph), '引用到对话'),
                              h('button', {
                                className: 'dsh-ima-actbtn',
                                title: '复制文件名',
                                onClick: function (e) { e.stopPropagation(); copyText(it.title) },
                              }, h(CopyGlyph), '复制名称'),
                            ),
                      )
                    }),
            ],
      ),
    ),
  )
}

// ── 绑定弹窗 ─────────────────────────────────────────────
// 产品原则（对着「系统1/系统2」来的）：
//   绑定不该让用户做判断、做选择、做校对。所以整个流程只有一件事要用户做：登录。
//   其余（开浏览器、取密钥、存下来、刷新界面）全部程序化完成。
//
//   主路径：点「开始」→ 弹出浏览器 → 用户登录 → 自动绑好（用户到此为止）
//   备选一：本机已有 ima 技能凭证 → 直接收编，连登录都不用
//   备选二：剪贴板里已有凭证 → 自动识别填入
//   备选三：手动粘贴（给前面都走不通的情况兜底）
function parseCreds(text) {
  var s = String(text || '')
  if (!s.trim()) return {}
  var out = {}
  var cid = (s.match(/client[_\s-]?id["'\s:=]+([0-9a-fA-F]{32})/i) || [])[1] ||
            (s.match(/\b([0-9a-fA-F]{32})\b/) || [])[1]
  if (cid) out.clientId = cid
  var k = (s.match(/api[_\s-]?key["'\s:=]+([A-Za-z0-9+/=_-]{40,200})/i) || [])[1]
  if (!k) {
    var cands = (s.match(/[A-Za-z0-9+/=_-]{50,200}/g) || []).filter(function (c) { return c !== cid })
    cands.sort(function (a, b) { return b.length - a.length })
    if (cands.length) k = cands[0]
  }
  if (k) out.apiKey = k
  return out
}

function BindDialog(props) {
  var ms = React.useState('idle'); var mode = ms[0], setMode = ms[1]
  var ss = React.useState(''); var stepText = ss[0], setStepText = ss[1]
  var er = React.useState(''); var errMsg = er[0], setErrMsg = er[1]
  var cs = React.useState(''); var clientId = cs[0], setClientId = cs[1]
  var ks = React.useState(''); var apiKey = ks[0], setApiKey = ks[1]
  var ls = React.useState(null); var local = ls[0], setLocal = ls[1]
  var bs = React.useState(false); var busy = bs[0], setBusy = bs[1]

  // 进来看一眼本机有没有现成凭证（有就直接收编，最省事）
  // 顺带确认宿主半是不是新版：旧版没有 acquire 接口，点了会白跑一趟
  var hs = React.useState(false); var hostStale = hs[0], setHostStale = hs[1]
  React.useEffect(function () {
    api('/status').then(function (s) {
      if (s && s.caps && s.caps.indexOf('acquire') === -1) setHostStale(true)
    }).catch(function () {})
    api('/detectLocal').then(function (r) {
      if (r && r.available && !r.alreadyBound) setLocal(r)
    }).catch(function () {})
  }, [])

  var finish = function () { props.onBound && props.onBound() }

  var adopt = function () {
    setBusy(true); setErrMsg('')
    api('/adoptLocal', { method: 'POST' }).then(function (r) {
      if (r && r.ok) { finish(); return }
      // 本机没现成凭证（或它失效了）→ 才去开浏览器自动授权
      setLocal(null)
      startAcquire()
    }).catch(function (e) { setErrMsg(String(e.message || e)); setMode('idle') })
      .then(function () { setBusy(false) })
  }

  /** 主路径：起浏览器自动取凭证 */
  var startAcquire = function () {
    setMode('acquiring'); setErrMsg(''); setStepText('正在打开浏览器…')
    api('/acquire', { method: 'POST' }).then(function (r) {
      if (r && r.ok) return
      // 宿主半没这个接口 → 多半是插件更新后 DSH 还没重启
      if (r && r.error === 'unknown_action') {
        setMode('pagewait')
        setErrMsg('检测到插件更新后 DSH 还没重启，本次先用备用方式。重启 DSH 后即可自动打开浏览器。')
        openImaPage()
        return
      }
      if (r && r.error === 'nobrowser') {
        setMode('pagewait')
        setErrMsg((r && r.message) || '这台电脑没装 Chrome/Edge，先用备用方式。')
        openImaPage()
        return
      }
      setMode('idle')
      setErrMsg((r && r.message) || '自动授权没能启动')
    }).catch(function (e) {
      // 请求本身失败也降级
      setMode('pagewait')
      setErrMsg('连不上本地服务，改用备用方式。')
      openImaPage()
    })
  }

  var openImaPage = function () {
    try { window.open('https://ima.qq.com/agent-interface', '_blank', 'noopener') } catch (e) {}
  }

  // 主按钮：永远先问后端「有没有现成凭证能用」。
  // 不看前端缓存的那个 local 状态 —— 否则用户点太快（detectLocal 还没回来）
  // 就会跳过收编、直接去开浏览器，白等一趟。
  var primary = function () {
    adopt()
  }

  // 授权中：轮询进度，成功就自动收工
  React.useEffect(function () {
    if (mode !== 'acquiring') return
    var stopped = false
    var timer = setInterval(function () {
      api('/acquireStatus').then(function (r) {
        if (stopped || !r) return
        if (r.message) setStepText(r.message)
        if (r.state === 'ok') { stopped = true; clearInterval(timer); finish() }
        else if (r.state === 'error') {
          stopped = true; clearInterval(timer)
          setMode('idle')
          setErrMsg(r.message || '授权没完成')
        }
      }).catch(function () {})
    }, 1500)
    return function () { stopped = true; clearInterval(timer) }
  }, [mode])

  // ── 授权中 ──
  if (mode === 'acquiring') {
    return h('div', { className: 'dsh-ima-dlg' },
      h('h3', null, '正在打开浏览器…'),
      h('div', { className: 'dsh-ima-note', style: { marginTop: '10px' } },
        '我们会单独开一个浏览器窗口打开 ima 授权页。第一次打开可能要十几秒，请稍等。'),

      h('div', { className: 'dsh-ima-step' },
        h('span', { className: 'dsh-ima-stepno' }, '1'),
        h('div', null, '在弹出的窗口里登录 ima'),
      ),
      h('div', { className: 'dsh-ima-step' },
        h('span', { className: 'dsh-ima-stepno' }, '2'),
        h('div', null, '登完什么都不用做 —— 这里会自动绑定，并把那个窗口关掉'),
      ),

      h('div', { className: 'dsh-ima-waitbar', style: { marginTop: '18px' } },
        h('span', { className: 'dsh-ima-spin' }),
        h('span', null, stepText || '准备中…'),
      ),

      errMsg ? h('div', { className: 'dsh-ima-err', style: { padding: '10px 0 0' } }, errMsg) : null,

      h('div', { className: 'dsh-ima-acts' },
        h('button', { className: 'dsh-ima-btn', onClick: props.onCancel }, '取消'),
        h('button', { className: 'dsh-ima-link', onClick: function () { setMode('manual') } }, '改用自己填'),
      ),
    )
  }

  // 备用方式：默认浏览器打开 ima 页面，用户复制，这里自动识别并绑定
  var credRef = React.useRef({ clientId: '', apiKey: '' })
  credRef.current = { clientId: clientId, apiKey: apiKey }
  var afs = React.useState(false); var autoFailed = afs[0], setAutoFailed = afs[1]
  var triedRef = React.useRef('')

  var tryClipboard = function () {
    if (busy || autoFailed) return
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) return
      navigator.clipboard.readText().then(function (text) {
        var r = parseCreds(text)
        if (!r.clientId && !r.apiKey) return
        var cur = credRef.current
        var c = r.clientId || cur.clientId
        var k = r.apiKey || cur.apiKey
        if (r.clientId) setClientId(r.clientId)
        if (r.apiKey) setApiKey(r.apiKey)
        if (!c || !k) return
        var sig = c + '|' + k
        if (triedRef.current === sig) return
        triedRef.current = sig
        setBusy(true)
        props.onBind(c, k).then(function (ok) {
          if (ok) { finish(); return }
          setAutoFailed(true)
          setErrMsg('识别到的凭证没通过验证。点「改用自己填」检查，或重新打开 ima 页面复制一次。')
        }).catch(function () {}).then(function () { setBusy(false) })
      }, function () { /* 没焦点/没授权，静默 */ })
    } catch (e) {}
  }

  React.useEffect(function () {
    if (mode !== 'pagewait' || autoFailed) return
    var onFocus = function () { tryClipboard() }
    window.addEventListener('focus', onFocus)
    var timer = setInterval(function () { if (document.hasFocus()) tryClipboard() }, 1500)
    tryClipboard()
    return function () {
      window.removeEventListener('focus', onFocus)
      clearInterval(timer)
    }
  }, [mode, autoFailed, busy])

  // ── 备用方式：自己去 ima 页面复制，回来自动识别 ──
  if (mode === 'pagewait') {
    return h('div', { className: 'dsh-ima-dlg' },
      h('h3', null, '绑定 ima 账号'),
      h('div', { className: 'dsh-ima-note', style: { marginTop: '10px' } },
        '已在浏览器打开 ima 授权页。'),

      h('div', { className: 'dsh-ima-step' },
        h('span', { className: 'dsh-ima-stepno' }, '1'),
        h('div', null, '在 ima 页面登录'),
      ),
      h('div', { className: 'dsh-ima-step' },
        h('span', { className: 'dsh-ima-stepno' }, '2'),
        h('div', null,
          h('div', null, '点第 1 步那个「一键复制」按钮'),
          h('div', { style: { color: 'var(--dsw-alias-label-tertiary,#999)', fontSize: '.88em', marginTop: '2px' } },
            '（API Key 不在页面上显示，就在这段复制出来的文字里）'),
        ),
      ),
      h('div', { className: 'dsh-ima-step' },
        h('span', { className: 'dsh-ima-stepno' }, '3'),
        h('div', null, '切回这里 —— 会自动识别并绑好，不用粘贴'),
      ),

      (clientId || apiKey)
        ? h('div', { className: 'dsh-ima-filled' },
            h('div', null, 'Client ID：' + (clientId ? clientId.slice(0, 4) + '****' + clientId.slice(-4) : '待识别')),
            h('div', null, 'API Key：' + (apiKey ? '已识别（' + apiKey.length + ' 位）' : '待识别')),
          )
        : null,

      busy ? h('div', { className: 'dsh-ima-waitbar' }, h('span', { className: 'dsh-ima-spin' }), '正在验证凭证…') : null,
      errMsg ? h('div', { className: 'dsh-ima-err', style: { padding: '10px 0 0', fontSize: '.88em' } }, errMsg) : null,

      h('div', { className: 'dsh-ima-acts' },
        h('button', { className: 'dsh-ima-btn', onClick: props.onCancel }, '取消'),
        h('button', { className: 'dsh-ima-btn', onClick: openImaPage }, '重开 ima 页面'),
        h('button', { className: 'dsh-ima-link', onClick: function () { setMode('manual') } }, '改用自己填'),
      ),
    )
  }

  // ── 手动填写（最后兜底，但必须自己讲清楚每一步） ──
  if (mode === 'manual') {
    var submit = function () {
      setBusy(true); setErrMsg('')
      props.onBind(clientId, apiKey).then(function (ok) {
        if (ok) finish()
        else setErrMsg('这两串码没通过验证。多半是没复制全，或者混进了空格。重新复制一次试试。')
      }).catch(function () {}).then(function () { setBusy(false) })
    }
    var fromClip = function () {
      setErrMsg('')
      try {
        navigator.clipboard.readText().then(function (t) {
          var r = parseCreds(t)
          if (r.clientId) setClientId(r.clientId)
          if (r.apiKey) setApiKey(r.apiKey)
          if (r.clientId && r.apiKey) setErrMsg('')
          else if (!r.clientId && !r.apiKey) setErrMsg('剪贴板里没找到那两串码。请先在 ima 页面点复制。')
          else setErrMsg('只找到一半，另一串再复制一次。')
        }, function () { setErrMsg('浏览器不允许读剪贴板，只能在下面手动粘贴了。') })
      } catch (e) { setErrMsg('这个环境读不到剪贴板，只能在下面手动粘贴了。') }
    }
    return h('div', { className: 'dsh-ima-dlg' },
      h('h3', null, '自己填（最后兜底方式）'),
      h('div', { className: 'dsh-ima-note', style: { marginTop: '10px' } },
        '这个方式要你手动复制两串码，比较麻烦。如果前面的「一键绑定」还能用，建议退回去用它。'),

      h('div', { className: 'dsh-ima-step' },
        h('span', { className: 'dsh-ima-stepno' }, '1'),
        h('div', null,
          h('div', null, '打开 ima 授权页并登录'),
          h('button', { className: 'dsh-ima-btn', style: { marginTop: '8px' }, onClick: openImaPage },
            '打开 ima 页面'),
        ),
      ),
      h('div', { className: 'dsh-ima-step' },
        h('span', { className: 'dsh-ima-stepno' }, '2'),
        h('div', null,
          h('div', null, '点第 1 步那个「一键复制」按钮'),
          h('button', { className: 'dsh-ima-btn dsh-ima-btn-p', style: { marginTop: '8px' }, onClick: fromClip },
            '从剪贴板自动填入'),
        ),
      ),

      h('div', { className: 'dsh-ima-filled', style: { marginTop: '16px' } },
        h('div', { style: { marginBottom: '6px', color: 'var(--dsw-alias-label-primary,#1a1a1a)' } },
          '⚠️ 注意：API Key 不在页面上显示'),
        h('div', null, 'ima 页面上只能看到 Client ID。API Key 藏在第 1 步「一键复制」复制出来的那段文字里 —— 点一下那个按钮，两个值就都在剪贴板了。'),
        h('div', { style: { marginTop: '6px' } }, '这两串码只存在你这台电脑上，不会上传到别处。'),
      ),

      h('div', { className: 'dsh-ima-f' },
        h('label', null, 'Client ID ', h('span', { style: { fontWeight: 400 } }, '— 页面上能看到，32 位字母数字')),
        h('input', { value: clientId, onChange: function (e) { setClientId(e.target.value) }, placeholder: '例如 a1b2c3d4e5f6789012345678abcd1234', spellCheck: false }),
      ),
      h('div', { className: 'dsh-ima-f' },
        h('label', null, 'API Key ', h('span', { style: { fontWeight: 400 } }, '— 从「一键复制」的内容里取，约 76 位')),
        h('input', { value: apiKey, onChange: function (e) { setApiKey(e.target.value) }, placeholder: '粘贴 API Key', type: 'password', spellCheck: false }),
      ),

      errMsg ? h('div', { className: 'dsh-ima-err', style: { padding: '10px 0 0' } }, errMsg) : null,

      h('div', { className: 'dsh-ima-acts' },
        h('button', { className: 'dsh-ima-btn', onClick: function () { setMode('pagewait'); setErrMsg(''); openImaPage() } },
          '回到自动方式'),
        h('button', {
          className: 'dsh-ima-btn dsh-ima-btn-p',
          disabled: busy || !clientId.trim() || !apiKey.trim(),
          onClick: submit,
        }, busy ? '验证中…' : '绑定'),
      ),
    )
  }

  // ── 起点：一个大按钮 ──
  return h('div', { className: 'dsh-ima-dlg' },
    h('h3', null, '绑定 ima 账号'),
    h('div', { className: 'dsh-ima-note', style: { marginTop: '10px' } },
      local && local.available
        ? '检测到这台电脑上已经有 ima 凭证，点一下就绑好。'
        : '点下面的按钮就开始，接下来只需要登录 ima —— 不用复制粘贴。'),

    hostStale
      ? h('div', { className: 'dsh-ima-tip2', style: { color: 'var(--dsw-alias-status-warning,#b26a00)' } },
          '提示：插件更新过但 DSH 还没重启，自动打开浏览器可能用不了。重启 DSH 后即可。')
      : null,

    h('button', {
      className: 'dsh-ima-btn dsh-ima-btn-p dsh-ima-big',
      disabled: busy,
      onClick: primary,
    }, busy ? '处理中…' : '一键绑定 ima 账号'),

    errMsg ? h('div', { className: 'dsh-ima-err', style: { padding: '10px 0 0' } }, errMsg) : null,

    h('div', { className: 'dsh-ima-acts' },
      h('button', { className: 'dsh-ima-btn', onClick: props.onCancel }, '取消'),
      // 手动填是最后兜底，做成文字链接，别让新用户第一眼就被引到难路上
      h('button', {
        className: 'dsh-ima-link',
        onClick: function () { setMode('manual') },
      }, '都试过了还是不行？'),
    ),
  )
}

// ── 插件入口 ─────────────────────────────────────────────
var inject = ['slots']
var applied = false

function apply(ctx) {
  if (applied) {
    console.log('[dsh-ima] apply 已执行过，跳过重复注册')
    return
  }
  applied = true
  injectCss()
  installThemeWatcher()
  console.log('[dsh-ima] 浏览器半初始化，预览引擎:', window.__DSH_IMA_VIEWER__ ? '已加载' : '缺失')

  ctx.slots.inject('sidebar.panellist', function () {
    return ctx.slots.register({
      name: 'sidebar.panellist',
      id: PANEL_ID,
      order: 0,
      label: '知识库 ima',
    }, PanelGlyph)
  })

  ctx.slots.inject('main', function () {
    return ctx.slots.register({
      name: 'main',
      key: PANEL_ID,
    }, function ImaPageGuarded(props) {
      return h(PanelBoundary, null, h(ImaPage, props))
    })
  })

  console.log('[dsh-ima] UI 注册完成：sidebar.panellist + main[' + PANEL_ID + ']')
  ctx.effect(function () { return function () { console.log('[dsh-ima] 浏览器半卸载') } })
}

exports.apply = apply
exports.inject = inject
