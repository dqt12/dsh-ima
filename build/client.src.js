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
  // 类型徽章：不同颜色 + 短标签，比统一的灰色文件图标好认
  '.dsh-ima-fico{flex-shrink:0;width:26px;height:26px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;font-size:.6em;font-weight:600;color:#fff;line-height:1;font-family:inherit;letter-spacing:-.02em;box-sizing:border-box;overflow:hidden}',
  '.dsh-ima-fico-plain{background:transparent;color:var(--dsw-alias-label-secondary,#666);width:22px}',
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
  '.dsh-ima-md h3{font-size:1.1em;font-weight:500;margin:.9em 0 .4em}',
  '.dsh-ima-md code{font-size:.92em;background:var(--dsw-alias-bg-tertiary,rgba(0,0,0,.06));padding:1px 5px;border-radius:4px;font-family:ui-monospace,Menlo,Consolas,monospace}',
  '.dsh-ima-md strong{font-weight:500}',
  '.dsh-ima-md ul{padding-left:1.4em;margin:.5em 0}',
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
}

// ── 图标 ─────────────────────────────────────────────────
// 按文件类型给不同颜色的小徽章，比统一的灰色文件图标更容易一眼认出
var TYPE_BADGE = {
  1: { t: 'PDF', c: '#e5484d' },   // PDF
  2: { t: '网', c: '#2b7fd4' },    // 网页
  3: { t: 'W', c: '#2b579a' },     // Word
  4: { t: 'P', c: '#d24726' },     // PPT
  5: { t: 'X', c: '#217346' },     // Excel
  6: { t: '微', c: '#07c160' },    // 微信文章
  7: { t: 'MD', c: '#5b6b7c' },    // Markdown
  8: { t: '图', c: '#0f9b8e' },    // 图片
  9: { t: '记', c: '#d9a300' },    // 笔记
  10: { t: '话', c: '#6b7a8f' },   // 会话
  11: { t: 'TXT', c: '#8a8f98' },  // 文本
  12: { t: '思', c: '#7c5cff' },   // XMind 思维导图
  13: { t: '录', c: '#9b59b6' },   // 录音
  14: { t: '视', c: '#ff6b35' },   // 视频
  15: { t: '播', c: '#e0518f' },   // 播客
}
/** 类型兜底扩展名：标题没有扩展名时，用类型推断出来喂给预览引擎 */
var TYPE_EXT = {
  1: 'pdf', 3: 'docx', 4: 'pptx', 5: 'xlsx', 7: 'md', 8: 'png',
  11: 'txt', 12: 'xmind', 13: 'txt', 14: 'mp4', 15: 'm4a',
}
/** 直接打开原链接、不进详情页的类型 */
var OPEN_URL_TYPES = { 2: 1, 6: 1 }

function TypeBadge(props) {
  var b = TYPE_BADGE[props.type]
  if (!b) return h('span', { className: 'dsh-ima-fico dsh-ima-fico-plain' }, h(FileGlyph))
  return h('span', {
    className: 'dsh-ima-fico',
    style: { background: b.c },
    title: props.typeLabel || '',
  }, b.t)
}

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
function FileGlyph() {
  return h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', style: { flexShrink: 0, color: 'var(--dsw-alias-label-secondary,#666)' } },
    h('path', { d: 'M4 1.5h4.6L11 4v10a.5.5 0 01-.5.5h-7A.5.5 0 013 14V2a.5.5 0 01.5-.5z', stroke: 'currentColor', strokeWidth: 1.1 }),
    h('path', { d: 'M8.4 1.7V4H11', stroke: 'currentColor', strokeWidth: 1.1 }),
  )
}
function FolderGlyphSm() {
  return h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', style: { flexShrink: 0, color: 'var(--dsw-alias-label-secondary,#666)' } },
    h('path', { d: 'M2 4.5A1.5 1.5 0 013.5 3h2.6c.4 0 .8.2 1 .5l.9 1.2c.2.3.6.5 1 .5h3.5A1.5 1.5 0 0114 6.7v5.8a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 12.5v-8z', stroke: 'currentColor', strokeWidth: 1.1 }),
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
  function inline(t) {
    var parts = []
    var re = /(\*\*[^*]+\*\*|`[^`]+`)/g
    var last = 0, m
    while ((m = re.exec(t))) {
      if (m.index > last) parts.push(t.slice(last, m.index))
      var tok = m[0]
      if (tok.slice(0, 2) === '**') parts.push(h('strong', { key: 'b' + (key++) }, tok.slice(2, -2)))
      else parts.push(h('code', { key: 'c' + (key++) }, tok.slice(1, -1)))
      last = m.index + tok.length
    }
    if (last < t.length) parts.push(t.slice(last))
    return parts.length ? parts : t
  }
  function flushList() {
    if (!listBuf.length) return
    out.push(h('ul', { key: 'u' + (key++) }, listBuf.map(function (t, i) { return h('li', { key: i }, inline(t)) })))
    listBuf = []
  }
  lines.forEach(function (line) {
    var m
    if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) {
      flushList()
      out.push(h('h' + m[1].length, { key: 'h' + (key++) }, inline(m[2])))
    } else if ((m = /^\s*[-*]\s+(.*)$/.exec(line))) {
      listBuf.push(m[1])
    } else if (line.trim() === '') {
      flushList()
    } else {
      flushList()
      out.push(h('p', { key: 'p' + (key++), style: { margin: '.5em 0' } }, inline(line)))
    }
  })
  flushList()
  return h('div', { className: 'dsh-ima-md' }, out)
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
  var ts = React.useState('all'); var kbType = ts[0], setKbType = ts[1]
  var cs = React.useState(null); var curKb = cs[0], setCurKb = cs[1]
  var is = React.useState([]); var items = is[0], setItems = is[1]
  var ps = React.useState([]); var path = ps[0], setPath = ps[1]
  var ls = React.useState(false); var loading = ls[0], setLoading = ls[1]
  var es = React.useState(''); var error = es[0], setError = es[1]
  var vs = React.useState(null); var preview = vs[0], setPreview = vs[1]
  var bs = React.useState(false); var showBind = bs[0], setShowBind = bs[1]
  var us = React.useState(null); var updatedAt = us[0], setUpdatedAt = us[1]
  var cus = React.useState(false); var confirmUnbind = cus[0], setConfirmUnbind = cus[1]

  var msg = function (e) { return String((e && e.message) || e) }

  var refreshStatus = function () {
    return api('/status').then(function (s) {
      setStatus(s)
      if (!s.bound) { setKbs([]); setCurKb(null); setItems([]); setPreview(null) }
      return s
    }).catch(function (e) { setError(msg(e)) })
  }
  var loadKbs = function (t) {
    setLoading(true); setError('')
    return api('/knowledgeBases?type=' + (t || kbType)).then(function (r) {
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
    if (status && status.bound) loadKbs(kbType)
  }, [status && status.bound, kbType])

  var onBind = function (clientId, apiKey) {
    setError('')
    return api('/bind', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId: clientId, apiKey: apiKey }),
    }).then(function (r) {
      if (r.ok) {
        setShowBind(false)
        return refreshStatus().then(function () { return loadKbs('all') }).then(function () { setKbType('all') })
          .then(function () { return true })
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
    setLoading(true); setError('')
    return api('/mediaContent?id=' + encodeURIComponent(item.mediaId)).then(function (r) {
      if (!r.ok) { setError(r.message); return }
      setPreview({
        title: item.title,
        mediaType: r.mediaType,
        url: r.url || '',
        content: r.content || '',
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
                onBound: function () { setShowBind(false); setError(''); refreshStatus().then(function () { return loadKbs('all') }) },
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
      previewBody = h('div', { className: 'dsh-ima-pre' }, renderMarkdown(preview.content))
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
      h('button', { className: 'dsh-ima-ibtn', onClick: function () { loadKbs(kbType) }, title: '重新获取知识库列表' }, h(RefreshIcon)),
      h('button', { className: 'dsh-ima-btn dsh-ima-btn-d', onClick: onUnbind }, confirmUnbind ? '再点一次确认' : '解绑'),
    ),
    error ? h('div', { className: 'dsh-ima-err' }, error) : null,
    h('div', { className: 'dsh-ima-body' },
      h('div', { className: 'dsh-ima-kbs' },
        h('div', { style: { display: 'flex', gap: '4px', marginBottom: '10px', flexWrap: 'wrap' } },
          [['all', '全部'], ['shared', '共享'], ['mine', '个人']].map(function (pair) {
            return h('button', {
              key: pair[0],
              className: 'dsh-ima-btn' + (kbType === pair[0] ? ' dsh-ima-btn-p' : ''),
              style: { padding: '3px 10px', fontSize: '.88em' },
              onClick: function () { setKbType(pair[0]); setCurKb(null); setItems([]); setPath([]); setPreview(null) },
            }, pair[1])
          }),
        ),
        kbs.length === 0 && !loading ? h('div', { className: 'dsh-ima-note' }, '没有知识库') : null,
        kbs.map(function (kb) {
          return h('div', {
            key: kb.id,
            className: 'dsh-ima-kb' + (curKb && curKb.id === kb.id ? ' dsh-ima-kb-on' : ''),
            onClick: function () { setCurKb(kb); loadMedia(kb, '') },
          },
            h('span', { className: 'dsh-ima-kb-name' }, kb.name),
            h('span', { className: 'dsh-ima-tag ' + (kb.baseType === '共享知识库' ? 'dsh-ima-tag-s' : 'dsh-ima-tag-m') },
              kb.baseType === '共享知识库' ? '共享' : '个人'),
          )
        }),
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
                        title: isLink ? '在新窗口打开原链接' : '点击预览',
                        onClick: function () { onItemClick(it) },
                      },
                        it.isFolder ? h(FolderGlyphSm) : h(TypeBadge, { type: it.mediaType, typeLabel: it.typeLabel }),
                        h('span', { className: 'dsh-ima-item-t' }, it.title),
                        h('span', { className: 'dsh-ima-item-y' }, isLink ? '打开链接' : it.typeLabel),
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
