/**
 * 浏览器自动化取凭证
 *
 * 背景：
 *   ima 没有开放第三方 OAuth，网页上拿 API Key 的接口是
 *   POST /cgi-bin/openapi_auth/app_query —— 它认的是 ima 的网页登录态（cookie）。
 *   从 DSH 页面（localhost）跨域调不了，所以由宿主进程来做。
 *
 * 做法：
 *   宿主用自己的独立 profile 起一个 Chrome/Edge，打开 ima 授权页。
 *   用户在那个窗口登录 ima（只用做这一次），
 *   我们在页面语境里同源调 app_query 拿到 Client ID + API Key，直接存下来。
 *   用户除了登录，不需要做任何操作 —— 不用复制、不用粘贴、不用切窗口。
 *
 * 用 CDP（Chrome DevTools Protocol）实现，Node 22 自带 WebSocket，零额外依赖。
 */

const { spawn } = require('child_process')
const http = require('http')
const fs = require('fs')
const os = require('os')
const path = require('path')

const DEBUG_PORT = 9333
const IMA_PAGE = 'https://ima.qq.com/agent-interface'
const QUERY_PATH = '/cgi-bin/openapi_auth/app_query'
const WAIT_TIMEOUT_MS = 3 * 60 * 1000   // 给用户 3 分钟登录
const POLL_INTERVAL_MS = 2000

// ── 找浏览器 ─────────────────────────────────────────────
const CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
]

function findBrowser() {
  for (const p of CANDIDATES) {
    try { if (fs.existsSync(p)) return p } catch { /* 继续找 */ }
  }
  return null
}

function profileDir() {
  const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  return path.join(dshHome, 'storages', 'dsh-ima', 'browser-profile')
}

// ── 小工具 ───────────────────────────────────────────────
function getJson(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let d = ''
      res.on('data', (c) => (d += c))
      res.on('end', () => { try { resolve(JSON.parse(d)) } catch (e) { reject(e) } })
    })
    req.on('error', reject)
    req.setTimeout(timeoutMs || 3000, () => { req.destroy(new Error('timeout')) })
  })
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── CDP 会话 ─────────────────────────────────────────────
class Cdp {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    ws.addEventListener('message', (ev) => {
      let m
      try { m = JSON.parse(ev.data) } catch { return }
      if (m.id && this.pending.has(m.id)) {
        this.pending.get(m.id)(m)
        this.pending.delete(m.id)
      }
    })
  }
  send(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++this.id
      const timer = setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('CDP 超时: ' + method)) }
      }, 15000)
      this.pending.set(id, (m) => { clearTimeout(timer); resolve(m) })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true,
    })
    if (r.result && r.result.exceptionDetails) {
      throw new Error(r.result.exceptionDetails.text || '页面脚本异常')
    }
    return r.result && r.result.result ? r.result.result.value : undefined
  }
  close() { try { this.ws.close() } catch {} }
}

// ── 主流程 ───────────────────────────────────────────────
/** 把页面语境里查到的 {code,msg,data} 解析成凭证 */
function parseQueryResult(raw) {
  let outer
  try { outer = JSON.parse(raw) } catch { return { err: '无法解析页面返回' } }
  if (outer.error) return { err: outer.error }
  const body = outer.body
  if (!body) return { err: '页面没有返回内容' }
  if (body.code !== 0) {
    // 41 = 未登录，属正常等待状态
    return { loggedIn: false, code: body.code, msg: body.msg || body.message }
  }
  const d = body.data || {}
  const apiKey = d.apiKey || d.api_key
  const clientId = d.clientId || d.client_id
  const validTime = d.validTime || d.valid_time
  if (!clientId || !apiKey) return { loggedIn: true, empty: true, msg: '这个 ima 账号还没有 API Key' }
  return { loggedIn: true, clientId, apiKey, validTime }
}

/**
 * 跑一次完整的取凭证流程。
 * @param {(s:{state:string,message?:string})=>void} onState 状态回调，供界面显示
 * @returns {Promise<{clientId:string,apiKey:string}|{error:string}>}
 */
async function acquire(onState) {
  const say = (state, message) => { try { onState && onState({ state, message }) } catch {} }

  const browser = findBrowser()
  if (!browser) {
    return { error: 'nobrowser', message: '没找到 Chrome 或 Edge。请安装任一浏览器，或改用手动粘贴凭证。' }
  }

  const profile = profileDir()
  try { fs.mkdirSync(profile, { recursive: true, mode: 0o700 }) } catch {}

  say('launching', '正在打开浏览器…')
  let proc
  try {
    proc = spawn(browser, [
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=Translate',
      IMA_PAGE,
    ], { detached: false, stdio: 'ignore' })
  } catch (e) {
    return { error: 'launchfail', message: '浏览器启动失败：' + e.message }
  }

  let cdp = null
  const cleanup = () => {
    if (cdp) { cdp.close(); cdp = null }
    try { if (proc) proc.kill() } catch {}
  }

  try {
    // 等调试端口
    say('launching', '正在打开浏览器…')
    let ver = null
    for (let i = 0; i < 40 && !ver; i++) {
      await sleep(500)
      try { ver = await getJson(`http://127.0.0.1:${DEBUG_PORT}/json/version`) } catch {}
    }
    if (!ver) return { error: 'nodevtools', message: '浏览器没能开启调试端口，可能被安全软件拦了。' }

    // 找 ima 页面
    say('waiting', '请在弹出的窗口里登录 ima')
    let page = null
    for (let i = 0; i < 20 && !page; i++) {
      try {
        const tabs = await getJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`)
        page = (tabs || []).find((t) => t.type === 'page' && /ima\.qq\.com/.test(t.url || ''))
      } catch {}
      if (!page) await sleep(500)
    }
    if (!page) return { error: 'nopage', message: '没能打开 ima 页面。' }

    const ws = new WebSocket(page.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('连接浏览器超时')), 10000)
      ws.addEventListener('open', () => { clearTimeout(t); resolve() })
      ws.addEventListener('error', () => { clearTimeout(t); reject(new Error('连接浏览器失败')) })
    })
    cdp = new Cdp(ws)
    await cdp.send('Runtime.enable')

    // 轮询：登录前返回 41，登录后就能拿到 key
    const expr = `
      (async () => {
        try {
          const r = await fetch(${JSON.stringify(QUERY_PATH)}, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: '{}'
          });
          return JSON.stringify({ status: r.status, body: await r.json() });
        } catch (e) { return JSON.stringify({ error: String(e) }) }
      })()
    `

    const deadline = Date.now() + WAIT_TIMEOUT_MS
    let lastMsg = ''
    let sawLogin = false

    while (Date.now() < deadline) {
      // 浏览器被关掉了就结束
      if (proc.exitCode !== null) {
        return { error: 'closed', message: '浏览器被关闭了，授权没完成。' }
      }
      let raw
      try {
        raw = await cdp.eval(expr)
      } catch (e) {
        // 页面刷新/跳转会短暂失败，继续等
        await sleep(POLL_INTERVAL_MS)
        continue
      }
      const r = parseQueryResult(raw)
      if (r.err) { await sleep(POLL_INTERVAL_MS); continue }

      if (r.loggedIn && r.clientId && r.apiKey) {
        say('ok', '已获取凭证')
        return { clientId: r.clientId, apiKey: r.apiKey }
      }
      if (r.loggedIn && r.empty) {
        say('needkey', '已登录，但这个 ima 账号还没有 API Key')
        lastMsg = r.msg
      } else {
        if (!sawLogin) sawLogin = false
        say('waiting', '请在窗口里完成登录')
      }
      await sleep(POLL_INTERVAL_MS)
    }
    return { error: 'timeout', message: '等待超时（3 分钟）。可以再试一次，或改用手动粘贴。' }
  } catch (e) {
    return { error: 'unknown', message: e.message }
  } finally {
    cleanup()
  }
}

module.exports = { acquire, findBrowser, DEBUG_PORT, profileDir }
