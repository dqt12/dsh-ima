/**
 * ima-client.js — 腾讯 ima OpenAPI 客户端（独立模块，可单测）
 *
 * 仅依赖 Node 内置模块 + 全局 fetch（Node 18+）。
 * 凭证格式与 https://ima.qq.com/agent-interface 获取的一致：
 *   clientId  → 请求头 ima-openapi-clientid
 *   apiKey    → 请求头 ima-openapi-apikey
 *
 * 实测确认的接口（2026-10-15）：
 *   wiki/v1/search_knowledge_base   空 query 可当列表接口用
 *   wiki/v1/get_knowledge_list      folder_id 必须带 folder_ 前缀
 *   wiki/v1/get_media_info          返回带签名的 COS 直链
 *   note/v1/get_doc_content         仅 NOTE 类型需要，参数是 noteId
 */

const fs = require('fs')
const os = require('os')
const path = require('path')

const BASE_URL = 'https://ima.qq.com'
const SKILL_CTX = 'skill_version=dsh-ima/1.0.0'

// media_type 实测值（文档写的 16 是错的，文件夹实际是 99）
const MEDIA_TYPE = {
  PDF: 1,
  WEB: 2,
  WORD: 3,
  PPT: 4,
  EXCEL: 5,
  WECHAT_ARTICLE: 6,
  MARKDOWN: 7,
  IMG: 8,
  NOTE: 9,
  SESSION: 10,
  TXT: 11,
  XMIND: 12,
  SOUND_RECORDING: 13,
  WEB_VIDEO: 14,
  PODCAST: 15,
  FOLDER: 99,
}

const MEDIA_TYPE_LABEL = {
  1: 'PDF',
  2: '网页',
  3: 'Word',
  4: 'PPT',
  5: 'Excel',
  6: '微信文章',
  7: 'Markdown',
  8: '图片',
  9: '笔记',
  10: '会话',
  11: '文本',
  12: 'XMind',
  13: '录音',
  14: '视频',
  15: '播客',
  99: '文件夹',
}

// 可直接内联预览的类型
const PREVIEWABLE = new Set([7, 11, 9])

// 订阅知识库：内容受 ima 产品策略保护，skill 侧读不到（错误码 220030）。
// 留着只会变成"点了打不开"的死链，对用户无价值 —— 默认整体过滤。
const HIDDEN_BASE_TYPES = ['我加入的订阅知识库']

class ImaAuthError extends Error {
  constructor(msg) {
    super(msg)
    this.name = 'ImaAuthError'
    this.code = 'AUTH_FAILED'
  }
}

// 订阅知识库的文件受 ima 产品策略保护，skill 侧取不到（错误码 220030）
class ImaPermissionError extends Error {
  constructor(msg) {
    super(msg)
    this.name = 'ImaPermissionError'
    this.code = 'PERMISSION_DENIED'
  }
}

class ImaError extends Error {
  constructor(msg, code) {
    super(msg)
    this.name = 'ImaError'
    this.code = code || 'API_ERROR'
  }
}

/**
 * 凭证存储：优先 ~/.dsh/storages/dsh-ima/credentials.json（插件自己的位置），
 * 取不到则回退 ~/.config/ima/{client_id,api_key}（ima 技能的标准位置）。
 * 这样老用户不用重复绑定，新用户建一个文件也能用。
 *
 * ⚠️ 解绑为什么需要「撤销标记」：
 *    如果凭证是从 legacy 位置回退读到的，只删插件自己的文件毫无作用——
 *    下次读取又会回退到 legacy，看起来就是"点了解绑没反应"。
 *    所以我们不碰 ~/.config/ima/（那是 ima 技能的资产），改用一个标记文件
 *    让回退逻辑短路；重新绑定会清掉标记。
 */
function resolveStorePath(explicit) {
  if (explicit) return explicit
  const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  return path.join(dshHome, 'storages', 'dsh-ima', 'credentials.json')
}

function resolveRevokePath() {
  const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  return path.join(dshHome, 'storages', 'dsh-ima', 'revoked')
}

function isRevoked() {
  try { return fs.existsSync(resolveRevokePath()) } catch { return false }
}

function setRevoked(flag) {
  const f = resolveRevokePath()
  try {
    if (flag) {
      fs.mkdirSync(path.dirname(f), { recursive: true, mode: 0o700 })
      fs.writeFileSync(f, new Date().toISOString(), { mode: 0o600 })
    } else {
      fs.unlinkSync(f)
    }
  } catch { /* 标记写不上不致命 */ }
}

function loadFromLegacyConfig() {
  const dir = path.join(os.homedir(), '.config', 'ima')
  try {
    const clientId = fs.readFileSync(path.join(dir, 'client_id'), 'utf8').trim()
    const apiKey = fs.readFileSync(path.join(dir, 'api_key'), 'utf8').trim()
    if (clientId && apiKey) return { clientId, apiKey, source: 'legacy' }
  } catch { /* 没有就算了 */ }
  return null
}

/** 本机是否已有 ima 技能的凭证（暴露给界面做「一键绑定」） */
function hasLegacyCredentials() {
  return !!loadFromLegacyConfig()
}

/**
 * 从任意文本里嗅探凭证。
 * 用户从 ima 页面复制出来的东西形态不定：可能是两个值分别复制的，
 * 也可能是「Client ID: xxx」、「api_key=yyy」这类带标签的，或者干脆是整段提示词。
 * 所以按特征匹配，别要求格式。
 */
function parseCredentialsFromText(text) {
  const s = String(text || '')
  const out = {}

  // Client ID：32 位十六进制
  let m = s.match(/client[_\s-]?id["'\s:=]+([0-9a-fA-F]{32})/i)
  if (!m) m = s.match(/\b([0-9a-fA-F]{32})\b/)
  if (m) out.clientId = m[1]

  // API Key：通常 60~120 位的字母数字串（含 - _）
  m = s.match(/api[_\s-]?key["'\s:=]+([A-Za-z0-9_\-.=]{40,200})/i)
  if (!m) {
    // 退而求其次：找最长的字母数字串（排除已经是 clientId 的那个）
    const cands = s.match(/[A-Za-z0-9_\-.=]{50,200}/g) || []
    const filtered = cands.filter((c) => c !== out.clientId)
    if (filtered.length) {
      filtered.sort((a, b) => b.length - a.length)
      out.apiKey = filtered[0]
    }
  } else {
    out.apiKey = m[1]
  }

  // 兜底：32 位十六进制且不是 clientId 的，可能是 apiKey
  if (!out.apiKey) {
    const hex = s.match(/\b([0-9a-fA-F]{32})\b/g) || []
    const other = hex.find((x) => x !== out.clientId)
    if (other) out.apiKey = other
  }

  return out
}

/** 把本机已有的 ima 技能凭证收编为插件自己的（用户点「一键绑定」时用） */
function adoptLegacyCredentials() {
  const legacy = loadFromLegacyConfig()
  if (!legacy) return null
  saveCredentials(legacy.clientId, legacy.apiKey)
  return { clientId: legacy.clientId, apiKey: legacy.apiKey, source: 'plugin-store' }
}

/**
 * 在单个知识库内按内容搜索（搜正文，不只是文件名）。
 * 实测返回 info_list，每条含：media_id / title / parent_folder_id / highlight_content / media_type
 * 注意：请求体第二个参数就是 body（签名是 request(apiPath, body, cred, options)）。
 */
async function searchKnowledge(cred, kbId, query, options = {}) {
  const json = await request('openapi/wiki/v1/search_knowledge', {
    knowledge_base_id: kbId,
    query: String(query || ''),
    limit: Math.min(options.limit || 20, 50),
  }, cred, options)
  const list = ((json.data && json.data.info_list) || [])
  return list.map((it) => ({
    mediaId: it.media_id,
    title: it.title || '',
    folderId: it.parent_folder_id || '',
    highlight: it.highlight_content || '',
    mediaType: it.media_type,
    typeLabel: MEDIA_TYPE_LABEL[it.media_type] || '',
  }))
}

/**
 * 跨所有知识库按内容搜索 —— 这是「我资料里有没有提到 X」的正解。
 * 逐库并发查，某个库失败不影响其它库。
 */
async function searchAllKnowledge(cred, query, options = {}) {
  const kbs = await listKnowledgeBases(cred, { type: options.type || 'all' })
  const targets = kbs.knowledgeBases
  const perKb = Math.min(options.perKb || 8, 20)

  const settled = await Promise.all(targets.map(async (kb) => {
    try {
      const items = await searchKnowledge(cred, kb.id, query, { limit: perKb, ...options })
      return items.map((it) => ({ ...it, kbId: kb.id, kbName: kb.name, kbBaseType: kb.baseType }))
    } catch {
      return []   // 单个库查失败（如无权限）就当没命中
    }
  }))

  const merged = []
  for (const arr of settled) merged.push(...arr)
  // 按库去重展示：每个库最多留几条，避免一个库刷屏
  const perKbCap = options.perKbCap || 5
  const count = new Map()
  const out = []
  for (const it of merged) {
    const n = count.get(it.kbId) || 0
    if (n >= perKbCap) continue
    count.set(it.kbId, n + 1)
    out.push(it)
  }
  return { items: out.slice(0, options.limit || 30), scannedKbCount: targets.length }
}

function loadCredentials(storePath) {
  const file = resolveStorePath(storePath)
  try {
    const raw = fs.readFileSync(file, 'utf8')
    const data = JSON.parse(raw)
    if (!data || !data.clientId || !data.apiKey) return null
    if (!isRevoked()) {
      return {
        clientId: data.clientId,
        apiKey: data.apiKey,
        source: 'plugin-store',
        boundAt: data.boundAt || null,
        lastValidatedAt: data.lastValidatedAt || null,
      }
    }
  } catch { /* 往下走回退 */ }

  // 用户显式解绑过就不再回退，否则解绑看起来没生效
  if (isRevoked()) return null
  return loadFromLegacyConfig()
}

function saveCredentials(clientId, apiKey, storePath) {
  const file = resolveStorePath(storePath)
  const dir = path.dirname(file)
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  const payload = {
    clientId,
    apiKey,
    boundAt: new Date().toISOString(),
    lastValidatedAt: new Date().toISOString(),
  }
  // 先写临时文件再 rename，避免半截文件
  const tmp = file + '.tmp-' + process.pid
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), { mode: 0o600 })
  fs.renameSync(tmp, file)
  try { fs.chmodSync(file, 0o600) } catch {}
  setRevoked(false) // 重新绑定即解除撤销
  return payload
}

/**
 * 解绑：删插件自己的凭证 + 立撤销标记，让 legacy 回退也失效。
 * 返回 { removed, revoked }，两者任一为真即算解绑成功。
 */
function clearCredentials(storePath) {
  const file = resolveStorePath(storePath)
  let removed = false
  try { fs.unlinkSync(file); removed = true } catch { /* 本来就没有 */ }
  setRevoked(true)
  return { removed, revoked: isRevoked() }
}

/**
 * 把 ima 的原始错误码翻译成用户能看懂的话。
 * ima 的 msg 是给开发者看的（如 "skill auth failed"），不能直接甩给用户。
 */
function friendlyAuthMessage(raw) {
  const s = String(raw || '')
  if (/skill auth failed/i.test(s)) {
    return 'ima 凭证验证未通过。请检查 Client ID 和 API Key 是否复制完整，或到 ima 开放平台重新生成'
  }
  if (/clientID or apiKey is empty/i.test(s)) {
    return '请求缺少凭证，请重新绑定'
  }
  if (/empty access token/i.test(s)) {
    return 'ima 凭证已失效，请重新绑定'
  }
  return s || 'ima 凭证已失效，请重新绑定'
}

/**
 * 发起一次 OpenAPI 请求。
 * 返回 { ok, code, msg, data }，不抛业务错误；网络/解析错误抛 ImaError。
 */
async function request(apiPath, body, cred, options = {}) {
  if (!cred || !cred.clientId || !cred.apiKey) {
    throw new ImaAuthError('尚未绑定 ima 账号')
  }
  const url = `${options.baseUrl || BASE_URL}/${apiPath}`
  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ima-openapi-clientid': cred.clientId,
        'ima-openapi-apikey': cred.apiKey,
        'ima-openapi-ctx': options.skillCtx || SKILL_CTX,
      },
      body: JSON.stringify(body || {}),
      signal: options.signal,
    })
  } catch (e) {
    throw new ImaError(`网络请求失败：${e.message}`, 'NETWORK')
  }

  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new ImaError(`响应不是合法 JSON（HTTP ${res.status}）`, 'BAD_RESPONSE')
  }

  // 凭证失效：ima 用 200002 表示鉴权失败
  if (json.code === 200002) {
    throw new ImaAuthError(friendlyAuthMessage(json.msg))
  }
  // 订阅知识库内容受产品策略保护
  if (json.code === 220030) {
    throw new ImaPermissionError(json.msg || '订阅知识库内容暂不支持读取，请前往 ima 客户端查看')
  }
  if (json.code !== 0) {
    throw new ImaError(json.msg || `ima 接口返回错误码 ${json.code}`, String(json.code))
  }
  return json
}

// ── 业务方法 ──────────────────────────────────────────────

/**
 * 列知识库。type: 'all' | 'shared' | 'mine'
 * 订阅知识库默认过滤掉（ima 策略导致读不到，见 HIDDEN_BASE_TYPES）。
 * 空 query 的 search_knowledge_base 等价于全量列表。
 */
async function listKnowledgeBases(cred, options = {}) {
  const type = options.type || 'all'
  const json = await request('openapi/wiki/v1/search_knowledge_base', {
    query: '',
    // 实测服务端 limit 上限 20，超出报参数错误
    limit: Math.min(options.limit || 20, 20),
    cursor: options.cursor || '',
  }, cred, options)

  let list = ((json.data && json.data.info_list) || [])
    .filter(k => !HIDDEN_BASE_TYPES.includes(k.base_type))

  if (type === 'shared') list = list.filter(k => k.base_type === '共享知识库')
  else if (type === 'mine') list = list.filter(k => k.base_type === '个人知识库')

  return {
    total: list.length,
    knowledgeBases: list.map(k => ({
      id: k.kb_id,
      name: k.kb_name,
      description: k.description || '',
      coverUrl: k.cover_url || '',
      creator: k.creator || '',
      role: k.role_type || '',
      baseType: k.base_type || '',
      memberCount: Number(k.member_count) || 0,
      contentCount: Number(k.content_count) || 0,
    })),
  }
}

/** 按关键词搜知识库 */
async function searchKnowledgeBases(cred, query, options = {}) {
  const json = await request('openapi/wiki/v1/search_knowledge_base', {
    query: query || '',
    limit: Math.min(options.limit || 20, 20),
    cursor: options.cursor || '',
  }, cred, options)
  const list = (json.data && json.data.info_list) || []
  return {
    total: list.length,
    knowledgeBases: list.map(k => ({
      id: k.kb_id,
      name: k.kb_name,
      description: k.description || '',
      creator: k.creator || '',
      baseType: k.base_type || '',
      contentCount: Number(k.content_count) || 0,
    })),
  }
}

/**
 * 列文件。folderId 传空串 = 库根目录；进文件夹必须传完整 folder_<id>。
 */
async function listMedia(cred, knowledgeBaseId, options = {}) {
  const body = {
    knowledge_base_id: knowledgeBaseId,
    limit: options.limit || 50,
    cursor: options.cursor || '',
    folder_id: options.folderId || '',
  }
  const json = await request('openapi/wiki/v1/get_knowledge_list', body, cred, options)
  const d = json.data || {}
  const items = (d.knowledge_list || []).map(m => ({
    mediaId: m.media_id,
    title: m.title,
    mediaType: m.media_type,
    typeLabel: MEDIA_TYPE_LABEL[m.media_type] || '未知',
    isFolder: m.media_type === MEDIA_TYPE.FOLDER,
    parentFolderId: m.parent_folder_id || '',
    tags: m.tags || [],
    previewable: PREVIEWABLE.has(m.media_type),
  }))
  return {
    items,
    isEnd: !!d.is_end,
    nextCursor: d.next_cursor || '',
    currentPath: (d.current_path || []).map(p => ({
      folderId: p.folder_id,
      name: p.name,
      parentFolderId: p.parent_folder_id || '',
    })),
  }
}

/**
 * 取文件的签名直链。ima 不单独提供内容接口，正文就在这个 URL 里。
 */
async function getMediaUrl(cred, mediaId, options = {}) {
  const json = await request('openapi/wiki/v1/get_media_info', {
    media_id: mediaId,
  }, cred, options)
  const d = json.data || {}
  return {
    mediaId,
    mediaType: d.media_type,
    url: (d.url_info && d.url_info.url) || '',
    fileName: (d.url_info && d.url_info.file_name) || '',
    fileSize: (d.url_info && d.url_info.file_size) || 0,
  }
}

/**
 * 是否是可下载的 http(s) 地址。
 * 笔记类文件会返回 chrome://note?docid=xxx —— ima 桌面客户端内部协议，
 * 外部根本下载不了，必须改走 get_doc_content。
 */
function isHttpUrl(url) {
  return /^https?:\/\//i.test(String(url || ''))
}

/** 从 chrome://note?docid=123 里提取笔记 ID */
function extractNoteDocId(url) {
  const m = String(url || '').match(/[?&]docid=(\d+)/)
  return m ? m[1] : null
}

/**
 * 读取文件正文。
 * 两条路：
 *   1. 普通文件：get_media_info 给 http(s) 签名直链 → 下载
 *   2. 笔记：get_media_info 给 chrome://note?docid=xxx → 走 note/v1/get_doc_content
 * 二进制类型（PDF/图片等）返回 { binary: true, url } 让调用方下载。
 */
async function readMedia(cred, mediaId, options = {}) {
  const maxBytes = options.maxBytes || 512 * 1024
  const info = await getMediaUrl(cred, mediaId, options)
  if (!info.url) throw new ImaError('该条目没有可访问的文件地址', 'NO_URL')

  const noteDocId = extractNoteDocId(info.url)
  if (noteDocId) {
    return await readNote(cred, noteDocId, info, maxBytes, options)
  }

  if (!isHttpUrl(info.url)) {
    return { binary: true, ...info, reason: '该文件无法通过接口获取内容，请前往 ima 客户端查看' }
  }

  if (!PREVIEWABLE.has(info.mediaType)) {
    return { binary: true, ...info, reason: '非文本类型，请使用直链下载' }
  }

  let res
  try {
    res = await fetch(info.url, { signal: options.signal })
  } catch (e) {
    throw new ImaError(`下载文件失败：${e.message}`, 'DOWNLOAD')
  }
  if (!res.ok) throw new ImaError(`下载文件失败（HTTP ${res.status}）`, 'DOWNLOAD')

  const buf = Buffer.from(await res.arrayBuffer())
  let text = buf.toString('utf8')
  let truncated = false
  if (buf.length > maxBytes) {
    text = buf.toString('utf8', 0, maxBytes)
    truncated = true
  }
  return {
    binary: false,
    mediaId,
    mediaType: info.mediaType,
    fileName: info.fileName,
    url: info.url,
    content: text,
    bytes: buf.length,
    truncated,
  }
}

/** 笔记类内容读取：ima 的笔记不在 COS 上，得走专用接口 */
async function readNote(cred, noteDocId, info, maxBytes, options = {}) {
  const r = await request('openapi/note/v1/get_doc_content', {
    noteId: noteDocId,
  }, cred, options)

  const content = (r.data && r.data.content) || ''
  let text = content
  let truncated = false
  if (Buffer.byteLength(text, 'utf8') > maxBytes) {
    text = Buffer.from(text, 'utf8').toString('utf8', 0, maxBytes)
    truncated = true
  }
  return {
    binary: false,
    mediaId: info.mediaId,
    mediaType: info.mediaType,
    fileName: info.fileName,
    url: '',
    noteId: noteDocId,
    content: text,
    bytes: Buffer.byteLength(content, 'utf8'),
    truncated,
  }
}

/** 校验凭证是否有效（绑定流程用） */
async function validate(cred, options = {}) {
  // limit 用满一页，这样返回的 total 才是真实的库数量（ima 单页上限 20）
  const r = await listKnowledgeBases(cred, { limit: 20, ...options })
  return { valid: true, knowledgeBaseCount: r.total }
}

module.exports = {
  BASE_URL,
  MEDIA_TYPE,
  MEDIA_TYPE_LABEL,
  ImaAuthError,
  ImaPermissionError,
  ImaError,
  resolveStorePath,
  loadCredentials,
  saveCredentials,
  clearCredentials,
  hasLegacyCredentials,
  adoptLegacyCredentials,
  parseCredentialsFromText,
  request,
  listKnowledgeBases,
  searchKnowledgeBases,
  searchKnowledge,
  searchAllKnowledge,
  listMedia,
  getMediaUrl,
  readMedia,
  validate,
}
