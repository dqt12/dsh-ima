/**
 * 构建脚本：把预览引擎 + 插件逻辑合成一份 lib/client.js
 *
 * 产物格式必须是 DSH 的闭包工厂：
 *   window.__ModuleLoader__.load({ id, factory: (require) => { ...; exports.apply / exports.inject } })
 *
 * 用法：node build/build.mjs
 */
import { build } from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')

/**
 * 把 Node 内置模块替换成空桩。
 * 部分渲染库在代码里写了 `require('fs')` 之类的分支（只在 Node 端走到），
 * 浏览器打包时不必真的实现，给个空对象即可。
 */
function nodeBuiltinStub() {
  const BUILTINS = new Set([
    'fs', 'path', 'os', 'util', 'stream', 'buffer', 'url', 'http', 'https',
    'zlib', 'crypto', 'events', 'assert', 'querystring', 'child_process',
    'node:fs', 'node:path', 'node:os', 'node:util', 'node:stream',
    'node:buffer', 'node:url', 'node:http', 'node:https', 'node:zlib',
    'node:crypto', 'node:events', 'node:assert',
  ])
  // 浏览器里用不到的 Node 原生产物，直接置空
  const NATIVE_STUBS = /^(@napi-rs\/canvas|canvas|sharp|skia-canvas)/
  return {
    name: 'node-builtin-stub',
    setup(b) {
      const filter = /^(node:)?(fs|path|os|util|stream|buffer|url|http|https|zlib|crypto|events|assert|querystring|child_process)$/
      b.onResolve({ filter }, (args) => {
        if (BUILTINS.has(args.path)) return { path: args.path, namespace: 'node-stub' }
        return null
      })
      b.onResolve({ filter: NATIVE_STUBS }, (args) => ({ path: args.path, namespace: 'node-stub' }))
      // .node 原生二进制一律置空
      b.onResolve({ filter: /\.node$/ }, (args) => ({ path: args.path, namespace: 'node-stub' }))
      b.onLoad({ filter: /.*/, namespace: 'node-stub' }, () => ({
        contents: 'export default {}; export const promises = {}; export const createCanvas = () => null;',
        loader: 'js',
      }))
    },
  }
}

console.log('[build] 打包预览引擎…')

const result = await build({
  entryPoints: [path.join(here, 'viewer.src.js')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome100', 'firefox100', 'safari15'],
  minify: true,
  write: false,
  legalComments: 'none',
  loader: { '.css': 'text' },
  // 有些渲染库会顺手 require Node 内置模块（只在 Node 环境用得到），
  // 浏览器包里给它们空桩，否则打包失败
  plugins: [nodeBuiltinStub()],
  logLevel: 'warning',
})

console.log('[build] 产物清单:')
result.outputFiles.forEach((f) => console.log(`  ${path.basename(f.path)}  ${(f.text.length / 1024).toFixed(0)} KB`))

// esbuild 在 write:false 时按扩展名产出，稳一点：CSS 认 .css，JS 取剩下的最大那份
const cssFile = result.outputFiles.find((f) => f.path.endsWith('.css'))
const jsFiles = result.outputFiles.filter((f) => !f.path.endsWith('.css'))
const viewerCss = cssFile ? cssFile.text : ''
const viewerCode = jsFiles.sort((a, b) => b.text.length - a.text.length).map((f) => f.text).join('\n')

if (!viewerCode) throw new Error('构建失败：没有产出 JS')
console.log(`[build] 引擎: ${(viewerCode.length / 1024).toFixed(0)} KB, 样式: ${(viewerCss.length / 1024).toFixed(0)} KB`)

const clientSrc = fs.readFileSync(path.join(here, 'client.src.js'), 'utf8')

/** 缩进，让它嵌进 factory 里也好看 */
const indent = (s, n) => s.split('\n').map((l) => (l ? ' '.repeat(n) + l : l)).join('\n')

const out = `/* 自动生成，请勿直接编辑。源码：build/client.src.js + build/viewer.src.js */
/* 重新构建：node build/build.mjs */
window.__ModuleLoader__.load({
  id: 'dsh-ima',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    var __VIEWER_CSS__ = ${JSON.stringify(viewerCss)}

${indent(viewerCode, 4)}

${indent(clientSrc, 4)}

    return module.exports
  },
})
`

const outFile = path.join(root, 'lib', 'client.js')
fs.writeFileSync(outFile, out)
console.log(`[build] 产出 ${outFile} (${(out.length / 1024).toFixed(0)} KB)`)
