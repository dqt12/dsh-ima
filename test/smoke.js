/**
 * smoke.js — ima-client 独立冒烟测试
 * 运行：node test/smoke.js
 * 会读取 ~/.dsh/storages/dsh-ima/credentials.json；不存在则先用 ~/.config/ima 的凭证播种。
 */
const path = require('path')
const fs = require('fs')
const os = require('os')
const ima = require('../lib/ima-client')

const STORE = path.join(os.homedir(), '.dsh', 'storages', 'dsh-ima', 'credentials.json')

function seedFromLegacy() {
  const cid = path.join(os.homedir(), '.config', 'ima', 'client_id')
  const key = path.join(os.homedir(), '.config', 'ima', 'api_key')
  if (!fs.existsSync(cid) || !fs.existsSync(key)) return null
  const clientId = fs.readFileSync(cid, 'utf8').trim()
  const apiKey = fs.readFileSync(key, 'utf8').trim()
  ima.saveCredentials(clientId, apiKey, STORE)
  return { clientId, apiKey }
}

async function main() {
  console.log('store:', STORE)
  let cred = ima.loadCredentials(STORE)
  if (!cred) {
    console.log('未找到凭证，尝试从 ~/.config/ima 播种...')
    const seeded = seedFromLegacy()
    if (!seeded) {
      console.log('FAIL: 无凭证。请先运行：node -e "require(\'../lib/ima-client\').saveCredentials(\'<clientId>\',\'<apiKey>\',\'' + STORE + '\')"')
      process.exit(1)
    }
    cred = ima.loadCredentials(STORE)
    console.log('已播种凭证')
  }

  let pass = 0, fail = 0
  const check = (name, cond, extra) => {
    if (cond) { pass++; console.log('  PASS', name, extra || '') }
    else { fail++; console.log('  FAIL', name, extra || '') }
  }

  // 1. 校验
  try {
    const v = await ima.validate(cred)
    check('validate', v.valid, `知识库数=${v.knowledgeBaseCount}`)
  } catch (e) { check('validate', false, e.message); return }

  // 2. 列库（全量 + 共享筛选 + 订阅库应被过滤掉）
  try {
    const all = await ima.listKnowledgeBases(cred, { limit: 20 })
    check('listKnowledgeBases(all)', all.total > 0, `共 ${all.total} 个`)
    const noSubscribed = all.knowledgeBases.every(k => k.baseType !== '我加入的订阅知识库')
    check('订阅库已过滤', noSubscribed, `剩余 ${all.total} 个（已排除订阅）`)
    const shared = await ima.listKnowledgeBases(cred, { type: 'shared' })
    check('listKnowledgeBases(shared)', shared.knowledgeBases.every(k => k.baseType === '共享知识库'), `共享库 ${shared.total} 个`)
    if (shared.total === 0) {
      const mine = await ima.listKnowledgeBases(cred, { type: 'mine' })
      console.log('  (无共享库，个人库', mine.total, '个，改用个人库继续测)')
    }
  } catch (e) { check('listKnowledgeBases', false, e.message) }

  // 3. 选一个库列文件（优先有内容的）
  let target = null
  try {
    const all = await ima.listKnowledgeBases(cred, { limit: 20 })
    target = all.knowledgeBases.find(k => k.contentCount > 0) || all.knowledgeBases[0]
  } catch {}
  if (!target) { console.log('FAIL: 找不到可测试的知识库'); process.exit(1) }
  console.log(`\n目标库：${target.name}（${target.baseType}，${target.contentCount} 条内容）`)

  // 4. 列文件
  let firstFile = null
  try {
    const list = await ima.listMedia(cred, target.id, { limit: 20 })
    check('listMedia', list.items.length > 0, `${list.items.length} 条，isEnd=${list.isEnd}`)
    const folders = list.items.filter(i => i.isFolder)
    console.log(`  文件夹 ${folders.length} 个，文件 ${list.items.length - folders.length} 个`)
    firstFile = list.items.find(i => !i.isFolder) || null

    // 5. 进文件夹（如果有）
    if (folders.length > 0) {
      const sub = await ima.listMedia(cred, target.id, { folderId: folders[0].mediaId, limit: 10 })
      check('listMedia(进文件夹)', Array.isArray(sub.items), `${folders[0].title} → ${sub.items.length} 条，路径深度 ${sub.currentPath.length}`)
    }
  } catch (e) { check('listMedia', false, e.message) }

  // 6. 读文件正文
  if (firstFile) {
    try {
      const r = await ima.readMedia(cred, firstFile.mediaId, { maxBytes: 2048 })
      if (r.binary) {
        check('readMedia(二进制)', !!r.url, `${firstFile.title} → ${r.reason}`)
      } else {
        check('readMedia(正文)', r.content.length > 0, `${firstFile.title} → ${r.bytes} 字节，截断=${r.truncated}`)
        console.log('  正文开头：' + r.content.slice(0, 80).replace(/\n/g, ' '))
      }
    } catch (e) { check('readMedia', false, e.message) }
  } else {
    console.log('  (跳过正文测试：目标库无文件)')
  }

  // 7. 搜索
  try {
    const s = await ima.searchKnowledgeBases(cred, target.name.slice(0, 4), { limit: 5 })
    check('searchKnowledgeBases', Array.isArray(s.knowledgeBases), `命中 ${s.total}`)
  } catch (e) { check('searchKnowledgeBases', false, e.message) }

  // 8. 笔记类文件：get_media_info 返回 chrome://note?docid=xxx（ima 桌面客户端内部协议），
  //    必须走 note/v1/get_doc_content 才能拿到正文。这条专门守这个分支。
  try {
    const all = await ima.listKnowledgeBases(cred, { limit: 20 })
    let noteTested = 0, noteOk = 0
    for (const kb of all.knowledgeBases) {
      if (kb.contentCount === 0 || noteTested >= 3) continue
      let list
      try { list = await ima.listMedia(cred, kb.id, { limit: 20 }) } catch { continue }
      for (const it of list.items) {
        if (it.isFolder || !it.mediaId.startsWith('note_') || noteTested >= 3) continue
        noteTested++
        try {
          const r = await ima.readMedia(cred, it.mediaId, { maxBytes: 300 })
          if (!r.binary && typeof r.content === 'string' && r.noteId) noteOk++
        } catch { /* 单篇失败不阻断，看汇总 */ }
      }
    }
    check('readMedia(笔记分支)', noteTested > 0 && noteOk === noteTested,
      `测 ${noteTested} 篇，成功 ${noteOk} 篇`)
  } catch (e) { check('readMedia(笔记分支)', false, e.message) }

  console.log(`\n结果：${pass} 通过，${fail} 失败`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch(e => { console.error('未捕获错误：', e); process.exit(1) })
