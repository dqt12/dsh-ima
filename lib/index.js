/**
 * dsh-ima — Host 半（DSH 0.2.0-rc.1 API）
 *
 * 同时做两件事：
 *   1. 注册 4 个 agent 工具（inject: ['tools'] + ctx.tools.register）
 *   2. 注册 /api/ima/* HTTP 路由（inject: ['webServer'] + ctx.webServer.register）
 *      —— 浏览器半通过同源 fetch 调这些路由，绕开 ima 的 CORS 限制
 *
 * API 依据本机官方实现：
 *   · 工具：@deepseek-ai/dsh-tool-fs/lib/index.js
 *   · 路由：@deepseek-ai/dsh-host-frontend-static/lib/index.js
 */

const path = require('path')
const ima = require('./ima-client')
const imaBrowser = require('./ima-browser')

// 浏览器授权流程的状态（全局单例，同一时间只跑一个）
let acquireState = { state: 'idle', message: '', startedAt: 0 }

// ── defineTool 加载 ──────────────────────────────────────
function loadDefineTool() {
  const candidates = [
    '@deepseek-ai/dsh-tools',
    path.join(
      process.env.APPDATA || '',
      'npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-tools'
    ),
  ]
  for (const c of candidates) {
    try {
      const m = require(c)
      if (m && typeof m.defineTool === 'function') {
        console.log('[dsh-ima] 使用框架自带 defineTool')
        return m.defineTool
      }
    } catch { /* 试下一个 */ }
  }
  console.log('[dsh-ima] 未找到框架 defineTool，使用本地等价实现')
  return localDefineTool
}

/**
 * 加载框架的消息构造器（用来往对话里注入上下文）。
 * 拿不到就退回本地等价实现 —— 结构就是 createUserMessage 产出的那个形状。
 */
function loadCreateUserMessage() {
  const candidates = [
    '@deepseek-ai/dsh-llm',
    path.join(
      process.env.APPDATA || '',
      'npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-llm'
    ),
  ]
  for (const c of candidates) {
    try {
      const m = require(c)
      if (m && typeof m.createUserMessage === 'function') {
        console.log('[dsh-ima] 使用框架自带 createUserMessage')
        return m.createUserMessage
      }
    } catch { /* 试下一个 */ }
  }
  console.log('[dsh-ima] 未找到框架 createUserMessage，使用本地等价实现')
  return function localCreateUserMessage(options) {
    return {
      role: 'user',
      content: options.content,
      source: options.source,
      id: 'ima-ctx-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    }
  }
}

/** 本地等价实现：产出与框架 defineTool 相同的定义对象 */
function localDefineTool(options) {
  const properties = {}
  const required = []
  for (const [key, spec] of Object.entries(options.parameters || {})) {
    if (!spec || typeof spec !== 'object') continue
    const prop = { type: spec.type === 'integer' ? 'integer' : spec.type }
    if (spec.description) prop.description = spec.description
    properties[key] = prop
    if (spec.required) required.push(key)
  }
  return {
    name: options.name,
    description: options.description,
    parameters: { type: 'object', properties, ...(required.length ? { required } : {}) },
    output: { schema: options.output.schema, render: options.output.render },
    ...(typeof options.execute === 'function' ? { execute: options.execute } : {}),
  }
}

// ── 工具输出格式 ─────────────────────────────────────────
function textOutput() {
  return {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: { text: { type: 'string', required: true } },
    },
    render: (_args, value) => [{ type: 'text', text: value.text }],
  }
}

function jsonText(obj) {
  return { text: JSON.stringify(obj, null, 2) }
}

// ── 凭证缓存 ─────────────────────────────────────────────
let cached = null
let cacheAt = 0
const CACHE_TTL = 30 * 1000

function getCred() {
  const now = Date.now()
  if (cached && now - cacheAt < CACHE_TTL) return cached
  cached = ima.loadCredentials()
  cacheAt = now
  return cached
}

function invalidateCred() {
  cached = null
  cacheAt = 0
}

function mask(s) {
  if (!s) return ''
  return s.length <= 8 ? s.slice(0, 2) + '****' : s.slice(0, 4) + '****' + s.slice(-4)
}

function notBound() {
  return jsonText({
    bound: false,
    message: '用户尚未绑定 ima 账号。请引导其在「知识库 ima」面板完成绑定，'
      + '或在 ~/.config/ima/ 放置 client_id 与 api_key 两个文件。',
  })
}

function fail(e) {
  return jsonText({ error: e.message, code: e.code || 'unknown' })
}

// ── HTTP 路由辅助 ────────────────────────────────────────
function sendJson(res, obj, status) {
  res.writeHead(status || 200, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(obj))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (c) => {
      raw += c
      if (raw.length > 1024 * 1024) { reject(new Error('请求体过大')); req.destroy() }
    })
    req.on('end', () => {
      if (!raw) return resolve({})
      try { resolve(JSON.parse(raw)) } catch { reject(new Error('请求体不是合法 JSON')) }
    })
    req.on('error', reject)
  })
}

// ── 插件主体 ─────────────────────────────────────────────

module.exports = {
  name: 'dsh-ima',
  // ⚠️ 这里故意【不】声明 webServer：
  //    工具和上下文注入在任何环境都该能用（headless / tui 里没有网页服务）。
  //    依赖网页服务的部分改用 ctx.inject(['webServer'], ...) 嵌套注入，
  //    没有 webServer 时就只跳过那一段，不会让整个插件卡在 pending。
  inject: ['tools', 'agents'],

  apply(ctx) {
    // ── 一、agent 工具 ──────────────────────────────────
    const defineTool = loadDefineTool()
    const register = (def) => ctx.tools.register(defineTool(def))

    const cred0 = getCred()
    if (cred0) {
      console.log(`[dsh-ima] 已找到 ima 凭证（来源：${cred0.source}）`)
    } else {
      console.log('[dsh-ima] 未找到 ima 凭证')
    }

    register({
      name: 'ima_list_knowledge_bases',
      description: '列出 ima 账号下的知识库。type 可传 all（全部）/ shared（共享知识库）/ mine（个人知识库）。用户问"我的知识库有哪些""共享库"时使用。订阅知识库不返回。',
      parameters: {
        type: { type: 'string', description: '知识库类型筛选：all / shared / mine，默认 all' },
      },
      output: textOutput(),
      async execute(args) {
        try {
          const c = getCred()
          if (!c) return notBound()
          const r = await ima.listKnowledgeBases(c, { type: (args && args.type) || 'all' })
          return jsonText({
            bound: true, count: r.total,
            knowledgeBases: r.knowledgeBases.map(k => ({
              id: k.id, name: k.name, baseType: k.baseType,
              creator: k.creator, contentCount: k.contentCount,
              description: k.description.slice(0, 200),
            })),
          })
        } catch (e) { return fail(e) }
      },
    })

    register({
      name: 'ima_list_kb_files',
      description: '列出某个 ima 知识库下的文件和文件夹。knowledge_base_id 必须来自 ima_list_knowledge_bases 的返回。传 folder_id 可进入子目录，folder_id 必须是列表返回里的完整值（形如 folder_7451432378726676）。',
      parameters: {
        knowledge_base_id: { type: 'string', required: true, description: '知识库 ID' },
        folder_id: { type: 'string', description: '文件夹 ID，空串或不传表示库根目录' },
      },
      output: textOutput(),
      async execute(args) {
        try {
          const c = getCred()
          if (!c) return notBound()
          if (!args || !args.knowledge_base_id) {
            return jsonText({ error: '缺少 knowledge_base_id，请先调 ima_list_knowledge_bases' })
          }
          const r = await ima.listMedia(c, args.knowledge_base_id, {
            folderId: args.folder_id || '', limit: 50,
          })
          return jsonText({
            bound: true,
            currentPath: r.currentPath.map(p => p.name).join(' / '),
            count: r.items.length, isEnd: r.isEnd,
            items: r.items.map(i => ({
              title: i.title, type: i.typeLabel, isFolder: i.isFolder,
              mediaId: i.mediaId, ...(i.isFolder ? { folderId: i.mediaId } : {}),
            })),
          })
        } catch (e) { return fail(e) }
      },
    })

    register({
      name: 'ima_read_file',
      description: '读取 ima 知识库中某个文件的正文。media_id 必须来自 ima_list_kb_files 的返回。Markdown/文本/笔记直接返回正文；PDF、Word、图片等返回下载直链。订阅知识库的文件受 ima 策略保护读不到。',
      parameters: {
        media_id: { type: 'string', required: true, description: '文件 media ID' },
      },
      output: textOutput(),
      async execute(args) {
        try {
          const c = getCred()
          if (!c) return notBound()
          if (!args || !args.media_id) {
            return jsonText({ error: '缺少 media_id，请先调 ima_list_kb_files' })
          }
          const r = await ima.readMedia(c, args.media_id, { maxBytes: 512 * 1024 })
          if (r.binary) return jsonText({ binary: true, url: r.url, message: r.reason })
          return jsonText({
            binary: false, title: r.fileName, bytes: r.bytes,
            truncated: r.truncated, content: r.content,
          })
        } catch (e) { return fail(e) }
      },
    })

    register({
      name: 'ima_search_knowledge_bases',
      description: '按关键词搜索 ima 知识库（匹配库名、描述、创建者昵称）。用户说"找一下我那个XX库"时使用。',
      parameters: {
        query: { type: 'string', required: true, description: '搜索关键词' },
      },
      output: textOutput(),
      async execute(args) {
        try {
          const c = getCred()
          if (!c) return notBound()
          if (!args || !args.query) return jsonText({ error: '缺少 query' })
          const r = await ima.searchKnowledgeBases(c, args.query)
          return jsonText({
            bound: true, count: r.total,
            knowledgeBases: r.knowledgeBases.map(k => ({
              id: k.id, name: k.name, baseType: k.baseType, creator: k.creator,
            })),
          })
        } catch (e) { return fail(e) }
      },
    })

    // 按内容搜索文件 —— agent 真正"查资料"的主力工具
    register({
      name: 'ima_search_files',
      description: '在 ima 知识库里按**内容**搜索文件（搜正文，不只是文件名）。'
        + '当用户问"我的资料里有没有提到 XX""找找跟 XX 相关的文档"，'
        + '或者不确定文件叫什么名字时，用这个。'
        + '返回命中的文件名、所在知识库、以及命中的那段原文片段；'
        + '拿到 media_id 后可用 ima_read_file 读全文。',
      parameters: {
        query: { type: 'string', required: true, description: '搜索关键词（搜正文内容）' },
        knowledge_base_id: { type: 'string', description: '限定只搜某个知识库；不传则搜索全部知识库' },
      },
      output: textOutput(),
      async execute(args) {
        try {
          const c = getCred()
          if (!c) return notBound()
          const q = String((args && args.query) || '').trim()
          if (!q) return jsonText({ error: '缺少 query' })

          if (args.knowledge_base_id) {
            const items = await ima.searchKnowledge(c, args.knowledge_base_id, q)
            return jsonText({
              bound: true, query: q, scope: 'single-kb',
              matched: items.length,
              results: items.map(it => ({
                title: it.title, type: it.typeLabel, mediaId: it.mediaId,
                highlight: (it.highlight || '').slice(0, 300),
              })),
            })
          }

          const r = await ima.searchAllKnowledge(c, q)
          return jsonText({
            bound: true, query: q, scope: 'all-kb',
            scannedKnowledgeBases: r.scannedKbCount,
            matched: r.items.length,
            results: r.items.map(it => ({
              title: it.title, type: it.typeLabel,
              knowledgeBase: it.kbName, mediaId: it.mediaId,
              highlight: (it.highlight || '').slice(0, 300),
            })),
          })
        } catch (e) { return fail(e) }
      },
    })

    console.log('[dsh-ima] 5 个 agent 工具注册完成（含按内容搜索的 ima_search_files）')

    // ── 一点五、让 agent 知道「这里有知识库」 ────────────
    //
    // 只注册工具是不够的：agent 不知道有这么个库存在，就不会主动去查。
    // 所以每轮对话开头往上下文里注入一小段说明（库名清单 + 什么时候该用哪个工具）。
    // 用 ctx.on('agent/pre-step') 追加一条 user 消息 —— 这和框架自带的
    // dsh-time-context 注入"当前时间"是同一套做法。
    const createUserMessage = loadCreateUserMessage()
    const CONTEXT_KIND = 'dsh-ima-context'
    const CONTEXT_REFRESH_MS = 10 * 60 * 1000   // 同一段说明最多每 10 分钟重复注入一次

    let kbCache = { at: 0, text: null }
    let lastInjectedAt = 0
    let kbCount = 0

    /**
     * 拼给模型看的说明。库列表带 5 分钟缓存 —— 每轮都调 ima 接口太慢。
     * @returns {Promise<string|null>} 未绑定或无库时返回 null（不注入）
     */
    async function buildKnowledgeContext() {
      const c = getCred()
      if (!c) return null

      const now = Date.now()
      if (kbCache.text && now - kbCache.at < 5 * 60 * 1000) return kbCache.text

      let list
      try {
        const r = await ima.listKnowledgeBases(c, { type: 'all' })
        list = r.knowledgeBases || []
      } catch {
        return kbCache.text   // 拉不到就用旧的；没有就这轮不注入
      }
      if (!list.length) { kbCache = { at: now, text: null }; return null }

      const shown = list.slice(0, 15)
      const lines = shown.map((kb) => {
        const kind = kb.baseType === '共享知识库' ? '共享' : '个人'
        return '· ' + kb.name + '（' + kind + '）'
      })
      if (list.length > shown.length) lines.push('· …… 等共 ' + list.length + ' 个')

      const text = [
        '[ima 知识库] 用户已连接 ima 知识库，用户可以查。下面这些库可以直接搜，不用问用户要文件：',
        ...lines,
        '',
        '需要用户的资料、文档、笔记、会议记录时，先去这些库里找，别凭空猜、也别直接说"我看不到"：',
        '· 找"哪份资料提到过 X" → ima_search_files（按正文内容搜，这是最常用的一步）',
        '· 不确定在哪个库 → ima_search_files 直接全局搜；或 ima_list_knowledge_bases 列全部库',
        '· 想浏览某个库里有啥 → ima_list_kb_files',
        '· 拿到 media_id 后读全文 → ima_read_file',
        '注：订阅类知识库 ima 不开放读取，不在上面的清单里，也搜不到。',
      ].join('\n')

      kbCache = { at: now, text }
      kbCount = list.length
      return text
    }

    /** 用户手动刷新过知识库列表时，让缓存失效，下一轮拿到最新的 */
    function invalidateKbCache() { kbCache = { at: 0, text: null } }

    ctx.on('agent/pre-step', async (payload, next) => {
      const decision = await next()
      try {
        if (!decision || decision.kind === 'reject') return decision
        if (payload && payload.signal && payload.signal.aborted) return decision
        // 只在每轮对话的第一步注入，不然每一步都塞一遍太费 token
        if (payload && payload.step !== 1) return decision
        const now = Date.now()
        if (lastInjectedAt && now - lastInjectedAt < CONTEXT_REFRESH_MS) return decision

        const text = await buildKnowledgeContext()
        if (!text) return decision

        lastInjectedAt = now
        console.log('[dsh-ima] 已把知识库说明注入本轮对话（' + kbCount + ' 个库）')
        return {
          ...decision,
          messages: [
            ...decision.messages,
            createUserMessage({
              content: [{ type: 'text', text }],
              source: {
                kind: CONTEXT_KIND,
                form: 'snapshot',
                sections: [{ name: CONTEXT_KIND, text }],
              },
            }),
          ],
        }
      } catch (e) {
        // 注入失败绝不能影响对话本身
        console.warn('[dsh-ima] 上下文注入失败：', e.message)
        return decision
      }
    }, { prepend: true })

    console.log('[dsh-ima] 已挂载 agent/pre-step 上下文注入（让 agent 知道知识库存在）')

    // ── 二、浏览器半用的 HTTP 路由 ──────────────────────
    // ima 服务端不回 Access-Control-Allow-Origin，浏览器直连会被 CORS 拦。
    // 所以由宿主半代理：浏览器同源 fetch /api/ima/* → 宿主调 ima。
    const routes = {
      // 状态
      '/api/ima/status': async () => {
        const c = getCred()
        // caps 让浏览器半能判断宿主半是不是旧版，避免"点了没反应还看不懂"
        const caps = ['bind', 'unbind', 'detectLocal', 'adoptLocal', 'acquire', 'acquireStatus', 'mediaContent']
        if (!c) return { bound: false, reason: 'no-credentials', caps }
        return {
          bound: true,
          clientIdHint: mask(c.clientId),
          source: c.source,
          boundAt: c.boundAt || null,
          storePath: ima.resolveStorePath(),
          caps,
        }
      },

        // 绑定（POST body: {clientId, apiKey}，或 {text} 由后端嗅探）
        '/api/ima/bind': async (req) => {
          const body = await readBody(req)
          let clientId = body && body.clientId
          let apiKey = body && body.apiKey
          if ((!clientId || !apiKey) && body && body.text) {
            const sniffed = ima.parseCredentialsFromText(body.text)
            clientId = clientId || sniffed.clientId
            apiKey = apiKey || sniffed.apiKey
          }
          if (!clientId || !apiKey) {
            return { ok: false, error: 'invalid', message: 'Client ID 和 API Key 都不能为空' }
          }
        const cred = { clientId: String(clientId).trim(), apiKey: String(apiKey).trim() }
        try {
          const v = await ima.validate(cred)
          ima.saveCredentials(cred.clientId, cred.apiKey)
          invalidateCred()
          console.log('[dsh-ima] 绑定成功：', mask(cred.clientId))
          return {
            ok: true, bound: true, clientIdHint: mask(cred.clientId),
            source: 'plugin-store', knowledgeBaseCount: v.knowledgeBaseCount,
          }
        } catch (e) {
          console.warn('[dsh-ima] 绑定失败：', e.message)
          if (e instanceof ima.ImaAuthError) {
            return { ok: false, error: 'auth', message: e.message, needRebind: true }
          }
          return { ok: false, error: e.code || 'unknown', message: e.message }
        }
      },

      // 解绑
      '/api/ima/unbind': async () => {
        const r = ima.clearCredentials()
        invalidateCred()
        console.log('[dsh-ima] 已解绑', JSON.stringify(r))
        return { ok: true, removed: r.removed, revoked: r.revoked, bound: false }
      },

      // 本机是否已有 ima 技能留下的凭证（有的话界面直接给「一键绑定」）
      '/api/ima/detectLocal': async () => {
        if (!ima.hasLegacyCredentials()) return { available: false }
        try {
          const legacy = ima.loadCredentials() // 可能已绑定，先看当前状态
          return { available: true, alreadyBound: !!(legacy && legacy.source === 'plugin-store') }
        } catch {
          return { available: true, alreadyBound: false }
        }
      },

      /**
       * 自动授权：起一个浏览器让用户登录 ima，登录完自动取回凭证。
       * 用户只需要登录，不用复制粘贴。
       */
      '/api/ima/acquire': async () => {
        if (acquireState.state === 'working') {
          return { ok: true, started: false, state: acquireState.state, message: acquireState.message }
        }
        if (!imaBrowser.findBrowser()) {
          return {
            ok: false, error: 'nobrowser',
            message: '没找到 Chrome 或 Edge 浏览器。可以装一个再来，或改用手动粘贴凭证。',
          }
        }

        acquireState = { state: 'working', message: '正在打开浏览器…', startedAt: Date.now() }

        // 后台跑，接口立刻返回，界面轮询 acquireStatus
        imaBrowser.acquire((s) => {
          acquireState = { ...acquireState, state: 'working', message: s.message || '' }
        }).then((r) => {
          if (r && r.clientId && r.apiKey) {
            try {
              ima.saveCredentials(r.clientId, r.apiKey)
              invalidateCred()
              acquireState = { state: 'ok', message: '已获取凭证并绑定', startedAt: acquireState.startedAt }
              console.log('[dsh-ima] 浏览器授权成功：', mask(r.clientId))
            } catch (e) {
              acquireState = { state: 'error', message: '存凭证失败：' + e.message }
            }
          } else {
            acquireState = {
              state: 'error',
              message: (r && r.message) || '授权没完成',
              code: r && r.error,
            }
          }
        }).catch((e) => {
          acquireState = { state: 'error', message: e.message }
        })

        return { ok: true, started: true, state: 'working' }
      },

      // 查询自动授权进度
      '/api/ima/acquireStatus': async () => {
        const s = acquireState
        const out = { state: s.state, message: s.message || '' }
        if (s.code) out.code = s.code
        if (s.state === 'ok') {
          const c = getCred()
          out.bound = !!c
          if (c) out.clientIdHint = mask(c.clientId)
        }
        return out
      },

      // 收编本机已有凭证（用户点「一键绑定」）
      '/api/ima/adoptLocal': async () => {
        try {
          const r = ima.adoptLegacyCredentials()
          if (!r) return { ok: false, error: 'notfound', message: '本机没有找到 ima 凭证' }
          invalidateCred()
          const v = await ima.validate({ clientId: r.clientId, apiKey: r.apiKey })
          console.log('[dsh-ima] 已收编本机凭证：', mask(r.clientId))
          return {
            ok: true, bound: true, clientIdHint: mask(r.clientId),
            source: 'plugin-store', knowledgeBaseCount: v.knowledgeBaseCount,
          }
        } catch (e) {
          if (e instanceof ima.ImaAuthError) {
            return { ok: false, error: 'auth', message: e.message, needRebind: true }
          }
          return { ok: false, error: e.code || 'unknown', message: e.message }
        }
      },

      // 知识库列表
      '/api/ima/knowledgeBases': async (req, url) => {
        const c = getCred()
        if (!c) return { ok: false, error: 'auth', message: '尚未绑定 ima 账号', needRebind: true }
        const r = await ima.listKnowledgeBases(c, {
          type: url.searchParams.get('type') || 'all',
        })
        // 用户在界面上手动拉过一次，说明想让数据是新的 —— 让注入缓存也失效
        invalidateKbCache()
        return { ok: true, ...r }
      },

      // 文件列表
      '/api/ima/media': async (req, url) => {
        const c = getCred()
        if (!c) return { ok: false, error: 'auth', message: '尚未绑定 ima 账号', needRebind: true }
        const kbId = url.searchParams.get('kb')
        if (!kbId) return { ok: false, error: 'invalid', message: '缺少 kb 参数' }
        const r = await ima.listMedia(c, kbId, {
          folderId: url.searchParams.get('folder') || '',
          limit: 50,
        })
        return { ok: true, ...r }
      },

      // 文件内容
      '/api/ima/mediaContent': async (req, url) => {
        const c = getCred()
        if (!c) return { ok: false, error: 'auth', message: '尚未绑定 ima 账号', needRebind: true }
        const mediaId = url.searchParams.get('id')
        if (!mediaId) return { ok: false, error: 'invalid', message: '缺少 id 参数' }
        const r = await ima.readMedia(c, mediaId, { maxBytes: 512 * 1024 })
        return { ok: true, ...r }
      },
    }

    // 网页服务的路由是可选能力：没有 webServer（headless / tui）就跳过这一段。
    // 工具和上下文注入不受影响。
    ctx.inject(['webServer'], (webCtx) => {
      webCtx.effect(() => webCtx.webServer.register({
      path: '/api/ima',
      handler: async (req, res) => {
        let url
        try { url = new URL(req.url || '/', 'http://x') } catch { return sendJson(res, { error: 'bad url' }, 400) }

        // 精确匹配优先，否则按前缀找（/api/ima/<action>）
        let action = url.pathname
        if (action.length > '/api/ima'.length && !routes[action]) {
          // /api/ima/kbs 这类别名归一化
          const tail = action.slice('/api/ima'.length)
          const alias = { '/kbs': '/api/ima/knowledgeBases' }[tail]
          action = alias || action
        }

        const fn = routes[action]
        if (!fn) {
          // 带上人能看懂的话：多半是宿主半没重启，而浏览器半已经是新版
          return sendJson(res, {
            ok: false,
            error: 'unknown_action',
            message: '这个接口不存在（' + url.pathname + '）。通常是插件更新后 DSH 还没重启，重启一下即可。',
            path: url.pathname,
          }, 404)
        }

        try {
          const result = await fn(req, url)
          return sendJson(res, result)
        } catch (e) {
          if (e instanceof ima.ImaAuthError) {
            return sendJson(res, { ok: false, error: 'auth', message: e.message, needRebind: true })
          }
          if (e instanceof ima.ImaPermissionError) {
            return sendJson(res, { ok: false, error: 'permission', message: e.message })
          }
          console.warn('[dsh-ima] 路由处理失败：', e.message)
          return sendJson(res, { ok: false, error: e.code || 'unknown', message: e.message })
        }
      },
      }), 'dsh-ima: /api/ima routes')

      console.log('[dsh-ima] HTTP 路由已注册：/api/ima/{status,bind,unbind,detectLocal,adoptLocal,acquire,acquireStatus,knowledgeBases,media,mediaContent}')
    })

    ctx.effect(() => {
      return () => {
        invalidateCred()
        console.log('[dsh-ima] 插件卸载')
      }
    })
  },
}
