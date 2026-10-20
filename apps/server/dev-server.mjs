#!/usr/bin/env node
/**
 * 黎念 · 零依赖开发后端
 *
 * 作用：在没装 Postgres / 没跑 NestJS 的情况下，也能让前端真正走一遍
 * 「本地写入 → 推后端 → 拉取覆盖」的完整链路。
 * 数据落在 apps/server/.data/db.json（纯文件，可随时删掉重来）。
 *
 * 启动： npm run dev:api     （默认 3001，与 vite proxy 的 /api 对应）
 * 生产： 请使用 apps/server/src 下的 NestJS + Prisma 实现（同一套 REST 契约）
 *
 * REST 契约
 *   GET  /api/v1/health
 *   GET  /api/v1/state                       → 设置 / 形象 / 纪念日 / 美化
 *   PUT  /api/v1/state                       ← 局部补丁
 *   GET  /api/v1/rules                       → { version, data }
 *   PUT  /api/v1/rules                       ← RuleConfig（版本 +1）
 *   GET  /api/v1/cards                       → { version, data: Card[] }
 *   PUT  /api/v1/cards                       ← { version, data } 全量替换（版本 +1）
 *   POST /api/v1/cards/:id/use               ← 引擎使用一次（useCount+1）
 *   GET  /api/v1/conversations/:id/messages
 *   POST /api/v1/conversations/:id/messages
 *   POST /api/v1/messages/:id/recall
 *   GET  /api/v1/music/resolve?input=…       → 网易云分享链接 / 歌曲 id → 歌名·歌手·封面（只有元信息，音频不碰）
 *   GET  /api/v1/integrations                → 接入状态（**只回「配没配 + Key 尾号」**，不回明文）
 *   PUT  /api/v1/integrations                ← { minimax: { apiKey, groupId, model, voiceId, speed } } / { minimax: { clear: true } }
 *                                              / { search: { apiKey, freshness, count } } / { search: { clear: true } }
 *   POST /api/v1/voice/tts                   ← { text, voiceId?, model?, speed?, emotion? } → audio/mpeg 字节
 *   POST /api/v1/search                      ← { query, count?, freshness?, enrich? }
 *                                               → { ok:true, results[], media? } | { ok:false, error, detail }
 *                                              （搜不到就返回 ok:false，**不编结果**；前端只记一条轨迹）
 *                                              enrich=true 时顺带给首条备齐素材：是不是视频页 / 验过的图
 *   GET  /api/v1/image?u=<b64url>&ref=<b64url> → 代取图片字节（带磁盘缓存）
 *                                              （有些图浏览器直连会被防盗链挡，只能我们代取）
 */
import http from 'node:http'
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash, timingSafeEqual } from 'node:crypto'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bochaSearch } from './bocha.mjs'
import { buildMedia, detectVideo, probeImage } from './media.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_FILE = join(__dirname, '.data', 'db.json')
const PORT = Number(process.env.PORT ?? 3001)

/**
 * 访问密码（可选，但**部署到公网时一定要设**）。
 *
 *   APP_PASSWORD=只有你知道的一串  npm start
 *
 * 设了以后所有请求（页面、/api、字体、图片代理）都要走浏览器自带的 Basic Auth：
 * 手机第一次打开会弹一次登录框，之后浏览器自己记着。
 *
 * 为什么非要有它：这套后端是单用户的（会话固定 c_1，没有账号体系）——
 * 地址发给谁，谁就能看到你的聊天记录、朋友圈、信件，还能用你的 Key 花钱合成语音。
 * 没设密码时启动会打一行警告。
 */
const APP_PASSWORD = String(process.env.APP_PASSWORD ?? '')

function authorized(req) {
  if (!APP_PASSWORD) return true
  const header = String(req.headers.authorization ?? '')
  if (!header.startsWith('Basic ')) return false
  let raw = ''
  try {
    raw = Buffer.from(header.slice(6), 'base64').toString('utf8')
  } catch {
    return false
  }
  // Basic 的格式是 用户名:密码 —— 用户名随便填，只比密码
  const pass = Buffer.from(raw.slice(raw.indexOf(':') + 1))
  const want = Buffer.from(APP_PASSWORD)
  return pass.length === want.length && timingSafeEqual(pass, want)
}

/** `npm run build` 出来的前端：存在就由这个进程一起托管，手机打开同一个地址就能用语音/搜索 */
const WEB_DIST = join(__dirname, '..', 'web', 'dist')
const MIME = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  webmanifest: 'application/manifest+json; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  ico: 'image/x-icon',
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  txt: 'text/plain; charset=utf-8',
}

/**
 * 托管构建好的前端（`apps/web/dist`）。
 * 只处理 GET、且不是 /api/ 开头的路径；没有 dist 就返回 false，让后面照旧走（开发时用 vite 的 5173）。
 * hash 路由的 SPA：找不到的路径一律回落 index.html；带扩展名的当真 404。
 */
async function serveStatic(pathname, res) {
  if (!existsSync(join(WEB_DIST, 'index.html'))) return false

  const rel = decodeURIComponent(pathname).replace(/^\/+/, '')
  const target = resolve(WEB_DIST, rel)
  if (target !== WEB_DIST && !target.startsWith(WEB_DIST + sep)) return false // 防 ../ 穿越

  let file = target
  try {
    const st = await stat(file)
    if (st.isDirectory()) file = join(file, 'index.html')
  } catch {
    if (extname(pathname)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('404')
      return true
    }
    file = join(WEB_DIST, 'index.html')
  }

  const body = await readFile(file)
  const ext = extname(file).slice(1).toLowerCase()
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    // index.html 不缓存（发版立刻生效）；带 hash 的 assets / 字体可以长缓存
    'Cache-Control': file.endsWith('index.html')
      ? 'no-cache'
      : 'public, max-age=31536000, immutable',
    'Content-Length': body.length,
  })
  res.end(body)
  return true
}

/* ── .env（可选）：apps/server/.env，简单的 KEY=VALUE ── */
async function loadEnvFile() {
  try {
    const raw = await readFile(join(__dirname, '.env'), 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (!m || m[2].startsWith('#')) continue
      if (!(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
    console.log('.env 已读取（apps/server/.env）')
  } catch {
    /* 没有 .env 就跳过：Key 也可以从「设置 → 接入」填 */
  }
}
await loadEnvFile()

/* ── 存储：单文件 JSON ── */
const EMPTY = {
  state: {},
  rules: null,
  rulesVersion: 0,
  cards: null,
  cardsVersion: 0,
  messages: {},
  calls: {},
  /** 接入凭据（MiniMax Key / 博查 Key 等）：只存在服务端，接口不回明文 */
  integrations: {},
}

let cache = null
let writeQueue = Promise.resolve()

async function load() {
  if (cache) return cache
  try {
    cache = { ...EMPTY, ...JSON.parse(await readFile(DATA_FILE, 'utf8')) }
  } catch {
    cache = structuredClone(EMPTY)
  }
  return cache
}

function save() {
  writeQueue = writeQueue.then(async () => {
    await mkdir(dirname(DATA_FILE), { recursive: true })
    await writeFile(DATA_FILE, JSON.stringify(cache, null, 2), 'utf8')
  })
  return writeQueue
}

/* ── HTTP 工具 ── */
const CORS = {
  'Access-Control-Allow-Origin': process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
}

function send(res, status, body) {
  const json = JSON.stringify(body ?? null)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
  res.end(json)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (c) => {
      raw += c
      if (raw.length > 8 * 1024 * 1024) reject(new Error('payload too large'))
    })
    req.on('end', () => {
      if (!raw) return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

/* ── MiniMax 语音（T2A）──
 * Key 有两种来源：**「设置 → 接入」里填的优先**，其次才是 apps/server/.env。
 * 接口只回传「配置没配置 + Key 尾号」，**永远不把明文 Key 发给前端**；
 * 音频由后端代取（浏览器直连 MiniMax 会被 CORS 挡），返回 mp3 字节。
 */
const DEFAULT_MINIMAX = { model: 'speech-02-hd', voiceId: 'male-qn-qingse', speed: 1 }

function minimaxConf(db) {
  const ui = db.integrations?.minimax ?? {}
  const apiKey = String(ui.apiKey || process.env.MINIMAX_API_KEY || '').trim()
  const configured = Boolean(apiKey)
  return {
    apiKey,
    configured,
    source: ui.apiKey ? 'settings' : process.env.MINIMAX_API_KEY ? 'env' : 'none',
    groupId: String(ui.groupId || process.env.MINIMAX_GROUP_ID || '').trim(),
    model: String(ui.model || process.env.MINIMAX_MODEL || DEFAULT_MINIMAX.model).trim(),
    voiceId: String(ui.voiceId || process.env.MINIMAX_VOICE_ID || DEFAULT_MINIMAX.voiceId).trim(),
    speed: Number.isFinite(ui.speed) ? Number(ui.speed) : DEFAULT_MINIMAX.speed,
  }
}

/** Key 只漏尾号，够她确认「填的是不是那把」 */
const maskKey = (k) => (k ? `${k.slice(0, 3)}…${k.slice(-4)}` : '')

/* ── 联网搜索（博查）：Key 和 MiniMax 一样只有两种来源，接口只回尾号 ── */
const DEFAULT_SEARCH = { freshness: 'oneYear', count: 5 }

function searchConf(db) {
  const ui = db.integrations?.search ?? {}
  const apiKey = String(ui.apiKey || process.env.SEARCH_API_KEY || process.env.BOCHA_API_KEY || '').trim()
  return {
    apiKey,
    configured: Boolean(apiKey),
    source: ui.apiKey ? 'settings' : process.env.SEARCH_API_KEY || process.env.BOCHA_API_KEY ? 'env' : 'none',
    freshness: String(ui.freshness || process.env.SEARCH_FRESHNESS || DEFAULT_SEARCH.freshness).trim(),
    count: Number.isFinite(ui.count) ? Number(ui.count) : DEFAULT_SEARCH.count,
  }
}

function integrationsStatus(db) {
  const m = minimaxConf(db)
  const s = searchConf(db)
  return {
    minimax: {
      configured: m.configured,
      source: m.source,
      hint: maskKey(m.apiKey),
      groupId: m.groupId,
      model: m.model,
      voiceId: m.voiceId,
      speed: m.speed,
      /** 前端用来提示「Key 有了，但引擎里的语音开关还是关的」 */
      defaults: DEFAULT_MINIMAX,
    },
    search: {
      configured: s.configured,
      source: s.source,
      hint: maskKey(s.apiKey),
      freshness: s.freshness,
      count: s.count,
      /** 前端用来提示「Key 有了，但引擎里的联网搜索开关还是关的」 */
      defaults: DEFAULT_SEARCH,
    },
  }
}

/* ── 图片代理 ──
 * 有些站的图浏览器直连会被防盗链挡（403 / 空白），后端代取一次再给前端，并落盘缓存。
 * 缓存目录：apps/server/.data/images/<sha1>.<ext>
 */
const IMAGE_DIR = join(__dirname, '.data', 'images')
const imageIndex = new Map() // sha1 → 文件名
let imageDirReady = null

const ensureImageDir = () => (imageDirReady ??= mkdir(IMAGE_DIR, { recursive: true }).catch(() => {}))
const hashOf = (s) => createHash('sha1').update(String(s)).digest('hex')
const b64u = (s) => Buffer.from(String(s), 'utf8').toString('base64url')
const unb64u = (s) => {
  try {
    return Buffer.from(String(s ?? ''), 'base64url').toString('utf8')
  } catch {
    return ''
  }
}
const extOf = (type) => String(type).toLowerCase().replace(/^image\//, '').replace(/[^a-z0-9]/g, '').slice(0, 8) || 'img'
const typeOf = (ext) => (ext === 'jpg' ? 'image/jpeg' : `image/${ext}`)

/** 前端 `<img src>` 用的代理地址 */
const imgProxyPath = (src, referer) => `/api/v1/image?u=${b64u(src)}${referer ? `&ref=${b64u(referer)}` : ''}`

async function lookupCached(src) {
  const h = hashOf(src)
  if (!imageIndex.has(h)) {
    await ensureImageDir()
    try {
      for (const f of await readdir(IMAGE_DIR)) if (f.startsWith(`${h}.`)) imageIndex.set(h, f)
    } catch {
      /* 目录还没建 */
    }
  }
  return imageIndex.get(h) ?? null
}

async function readCachedImage(src) {
  const name = await lookupCached(src)
  if (!name) return null
  try {
    return await readFile(join(IMAGE_DIR, name))
  } catch {
    imageIndex.delete(hashOf(src))
    return null
  }
}

async function writeCachedImage(src, buf, type) {
  const name = `${hashOf(src)}.${extOf(type)}`
  await ensureImageDir()
  try {
    await writeFile(join(IMAGE_DIR, name), buf)
    imageIndex.set(hashOf(src), name)
  } catch {
    /* 缓存失败不影响这次返回 */
  }
}

/** 调 MiniMax t2a_v2，拿回 mp3 字节 */async function minimaxTts(conf, { text, voiceId, model, speed, emotion }) {
  const payload = {
    model,
    text,
    stream: false,
    language_boost: 'auto',
    voice_setting: {
      voice_id: voiceId,
      speed,
      vol: 1,
      pitch: 0,
      ...(emotion ? { emotion } : {}),
    },
    audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3' },
  }
  const url = `https://api.minimax.chat/v1/t2a_v2?GroupId=${encodeURIComponent(conf.groupId)}`
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${conf.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  })
  const j = await r.json().catch(() => null)
  const code = j?.base_resp?.status_code
  if (!r.ok || code !== 0) {
    const detail = j?.base_resp?.status_msg ?? `HTTP ${r.status}`
    throw new Error(`MiniMax ${code ?? r.status}: ${detail}`)
  }
  const hex = j?.data?.audio
  if (!hex) throw new Error('MiniMax 没有返回音频')
  return {
    audio: Buffer.from(hex, 'hex'),
    durationMs: Number(j?.extra_info?.audio_length ?? 0) || 0,
    format: String(j?.extra_info?.audio_format ?? 'mp3'),
  }
}

/* ── 网易云元信息 ──
 * 只在服务端做（浏览器直连网易云会被 CORS 挡）。
 * 只取「歌名 / 歌手 / 封面」这类元信息 —— 音频不经过这里，播放交给网易云官方外链播放器。
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Linian/1.0'

function neteaseIdFromInput(input) {
  const s = String(input ?? '').trim()
  if (/^\d{4,}$/.test(s)) return s
  const m =
    s.match(/[?&]id=(\d+)/) ??
    s.match(/song\/(\d+)/) ??
    s.match(/[?&]songid=(\d+)/i) ??
    s.match(/"songId"\s*:\s*(\d+)/)
  return m ? m[1] : null
}

async function resolveNetease(input) {
  try {
    let id = neteaseIdFromInput(input)
    // 短链（163cn.tv / 分享出来的链接）→ 跟着跳转，把 id 找出来
    if (!id && /^https?:\/\//i.test(String(input))) {
      const r = await fetch(String(input), {
        redirect: 'follow',
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(8000),
      })
      id = neteaseIdFromInput(r.url) ?? neteaseIdFromInput((await r.text()).slice(0, 30000))
    }
    if (!id) return null

    const blank = { songId: id, title: '', artist: '', cover: undefined }
    const res = await fetch(`https://music.163.com/api/song/detail/?ids=%5B${id}%5D`, {
      headers: { 'User-Agent': UA, Referer: 'https://music.163.com/' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return blank
    const j = await res.json()
    const song = j?.songs?.[0]
    if (!song) return blank
    return {
      songId: String(song.id ?? id),
      title: song.name ?? '',
      artist: (song.artists ?? []).map((a) => a.name).filter(Boolean).join(' / '),
      cover: song.album?.picUrl ?? song.artists?.[0]?.picUrl,
    }
  } catch (e) {
    console.log('[music] 网易云解析失败：', e.message)
    return null
  }
}

/* ── 路由 ── */
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS)
    return res.end()
  }

  /* ── 访问密码（APP_PASSWORD 设了才生效）：页面 / API / 图片代理一起挡 ── */
  if (!authorized(req)) {
    res.writeHead(401, {
      'WWW-Authenticate': 'Basic realm="linian", charset="UTF-8"',
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      ...CORS,
    })
    return res.end('需要访问密码：这是私人部署的黎念')
  }

  const url = new URL(req.url, `http://localhost:${PORT}`)

  /* ── 前端静态文件：同一个地址既能开 App、又能连 /api（手机部署就靠这个） ── */
  if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
    try {
      if (await serveStatic(url.pathname, res)) return
    } catch (e) {
      console.error('[static]', e)
    }
  }

  const p = url.pathname.replace(/^\/api\/v1/, '')
  const db = await load()

  try {
    /* 健康检查 */
    if (p === '/health') {
      return send(res, 200, {
        ok: true,
        name: 'linian-dev-server',
        messages: Object.values(db.messages).reduce((n, a) => n + a.length, 0),
        rulesVersion: db.rulesVersion,
        cardsVersion: db.cardsVersion ?? 0,
        cards: (db.cards ?? []).length,
      })
    }

    /* ── 接入（MiniMax 语音）：只回「配没配 + 尾号」，不回明文 ── */
    if (p === '/integrations' && req.method === 'GET') {
      return send(res, 200, integrationsStatus(db))
    }
    if (p === '/integrations' && req.method === 'PUT') {
      const body = await readBody(req)
      const cur = db.integrations ?? {}
      const mm = body?.minimax ?? {}
      const sp = body?.search ?? {}
      if (mm.clear) {
        db.integrations = { ...cur, minimax: {} }
        console.log('[integrations] MiniMax 已断开')
      } else if (mm && Object.keys(mm).length) {
        const next = { ...(cur.minimax ?? {}) }
        // 空字符串 / 不传 = 不改（避免「只改音色」时把 Key 抹掉）
        if (typeof mm.apiKey === 'string' && mm.apiKey.trim()) next.apiKey = mm.apiKey.trim()
        if (mm.removeKey) delete next.apiKey
        if (typeof mm.groupId === 'string') next.groupId = mm.groupId.trim()
        if (typeof mm.model === 'string' && mm.model.trim()) next.model = mm.model.trim()
        if (typeof mm.voiceId === 'string' && mm.voiceId.trim()) next.voiceId = mm.voiceId.trim()
        if (Number.isFinite(mm.speed)) next.speed = Math.max(0.5, Math.min(2, Number(mm.speed)))
        db.integrations = { ...cur, minimax: next }
        console.log(`[integrations] MiniMax 已更新（来源 ${minimaxConf(db).source}）`)
      }
      if (sp?.clear) {
        db.integrations = { ...(db.integrations ?? {}), search: {} }
        console.log('[integrations] 博查搜索已断开')
      } else if (sp && Object.keys(sp).length) {
        const next = { ...(db.integrations?.search ?? {}) }
        if (typeof sp.apiKey === 'string' && sp.apiKey.trim()) next.apiKey = sp.apiKey.trim()
        if (sp.removeKey) delete next.apiKey
        if (typeof sp.freshness === 'string' && sp.freshness.trim()) next.freshness = sp.freshness.trim()
        if (Number.isFinite(sp.count)) next.count = Math.max(1, Math.min(10, Math.round(Number(sp.count))))
        db.integrations = { ...(db.integrations ?? {}), search: next }
        console.log(`[integrations] 博查搜索已更新（来源 ${searchConf(db).source}）`)
      }
      await save()
      return send(res, 200, integrationsStatus(db))
    }

    /* ── 语音合成：返回 mp3 字节（前端存成 dataURL 播） ── */
    if (p === '/voice/tts' && req.method === 'POST') {
      const conf = minimaxConf(db)
      if (!conf.configured) {
        return send(res, 501, {
          error: 'MINIMAX_NOT_CONFIGURED',
          hint: '在「设置 → 接入」里填 MiniMax API Key 与 GroupId（或者写进 apps/server/.env）',
        })
      }
      if (!conf.groupId) return send(res, 501, { error: 'MINIMAX_NO_GROUP_ID', hint: '还缺 GroupId' })

      const body = await readBody(req)
      const text = String(body?.text ?? '').trim()
      if (!text) return send(res, 400, { error: 'TEXT_REQUIRED' })
      if (text.length > 400) return send(res, 400, { error: 'TEXT_TOO_LONG', hint: '一次最多 400 字' })
      const voiceId = String(body?.voiceId || conf.voiceId)
      const model = String(body?.model || conf.model)
      const speed = Math.max(0.5, Math.min(2, Number(body?.speed ?? conf.speed) || 1))
      const emotion = body?.emotion ? String(body.emotion) : ''

      try {
        const r = await minimaxTts(conf, { text, voiceId, model, speed, emotion })
        console.log(
          `[voice] 合成 ${text.length} 字 → ${(r.audio.length / 1024).toFixed(1)}KB / ${r.durationMs}ms · ${model} · ${voiceId}${emotion ? ` · ${emotion}` : ''}`,
        )
        res.writeHead(200, {
          'Content-Type': 'audio/mpeg',
          'Content-Length': r.audio.length,
          'Cache-Control': 'no-store',
          'X-Audio-Duration-Ms': String(r.durationMs),
          'X-Audio-Format': r.format,
          'X-Voice-Model': model,
          'Access-Control-Expose-Headers': 'X-Audio-Duration-Ms,X-Audio-Format,X-Voice-Model',
          ...CORS,
        })
        return res.end(r.audio)
      } catch (e) {
        console.log('[voice] 合成失败：', e.message)
        const notFound = /voice|voice_id|音色/i.test(e.message)
        return send(res, 502, {
          error: notFound ? 'MINIMAX_VOICE_ERROR' : 'MINIMAX_ERROR',
          detail: e.message,
        })
      }
    }

    /* ── 网易云：分享链接 / 歌曲 id → 歌名·歌手·封面 ── */
    if (p === '/music/resolve' && req.method === 'GET') {
      const r = await resolveNetease(url.searchParams.get('input'))
      console.log(`[music] resolve ${url.searchParams.get('input')} → ${r ? `${r.title} - ${r.artist}` : '失败'}`)
      if (!r) return send(res, 404, { error: 'not found' })
      return send(res, 200, r)
    }

    /* ── 联网搜索（博查）：后端代取（浏览器直连会被 CORS 挡，Key 也不能下发到前端） ──
     * 搜不到就返回 ok:false + 原因，**一条假结果都不编** —— 前端只往轨迹里记一条。 */
    if (p === '/search' && req.method === 'POST') {
      const body = await readBody(req)
      const query = String(body?.query ?? '').trim()
      if (!query) return send(res, 400, { ok: false, error: 'EMPTY_QUERY' })
      const conf = searchConf(db)
      if (!conf.configured) {
        return send(res, 200, {
          ok: false,
          error: 'NOT_CONFIGURED',
          hint: '在「设置 → 接入」里填博查 API Key（或者写进 apps/server/.env：SEARCH_API_KEY）',
        })
      }
      const r = await bochaSearch(conf, { query, count: body?.count, freshness: body?.freshness })
      if (r.ok) {
        // 每条都免费标一下「像不像视频页」（纯本地判断：域名表 + 摘要里的真时长，不发请求）
        for (const it of r.results) it.video = detectVideo(it)
        const out = { ok: true, query, count: r.results.length, results: r.results, images: r.images.length, videos: r.videos.length }
        const head = `${r.results.length} 条（首条：${r.results[0].name.slice(0, 30)}）`
        if (body?.enrich && r.results.length) {
          // 只给「将要推送的那一条」备素材：是不是视频页 / 有没有验得过的图
          const media = await buildMedia({ result: r.results[0], images: r.images, videos: r.videos })
          out.media = {
            video: media.video,
            pics: media.pics.map((x) => ({
              src: x.src,
              proxy: imgProxyPath(x.src, x.referer),
              hostPageUrl: x.hostPageUrl,
              width: x.width,
              height: x.height,
              bytes: x.bytes,
              from: x.from,
            })),
            notes: media.notes,
          }
          r.results[0].video = media.video
          const shape = media.video.is
            ? `视频页${media.video.duration ? ` ${media.video.duration}` : ''}`
            : media.pics.length
              ? `可用图 ${media.pics.length} 张`
              : '纯链接'
          console.log(`[search] 「${query}」→ ${head} · 形态：${shape}${media.notes.length ? ` · 丢掉 ${media.notes.length} 张图` : ''}`)
        } else {
          console.log(`[search] 「${query}」→ ${head}`)
        }
        return send(res, 200, out)
      }
      console.log(`[search] 「${query}」失败：${r.error}${r.detail ? ` · ${r.detail}` : ''}`)
      return send(res, 200, { ok: false, error: r.error, detail: r.detail, query })
    }

    /* ── 图片代理：代取一次 + 落盘缓存（防盗链的图只能这么给前端看） ── */
    if (p === '/image' && req.method === 'GET') {
      const src = unb64u(url.searchParams.get('u'))
      if (!/^https?:\/\//i.test(src)) return send(res, 400, { error: 'BAD_URL' })
      const ref = unb64u(url.searchParams.get('ref'))

      const cached = await readCachedImage(src)
      if (cached) {
        const name = await lookupCached(src)
        const ext = (name ?? '').split('.').pop() ?? ''
        res.writeHead(200, {
          'Content-Type': typeOf(ext),
          'Content-Length': cached.length,
          'Cache-Control': 'public, max-age=604800',
          ...CORS,
        })
        return res.end(cached)
      }

      const got = await probeImage(src, ref)
      if (!got.ok) {
        console.log(`[image] 取不到：${got.reason} · ${src.slice(0, 80)}`)
        return send(res, 404, { error: 'IMAGE_UNAVAILABLE', detail: got.reason })
      }
      await writeCachedImage(src, got.buf, got.type)
      console.log(`[image] 代理 ${(got.buf.length / 1024).toFixed(0)}KB · ${got.type} · ${src.slice(0, 70)}`)
      res.writeHead(200, {
        'Content-Type': got.type,
        'Content-Length': got.buf.length,
        'Cache-Control': 'public, max-age=604800',
        ...CORS,
      })
      return res.end(got.buf)
    }

    /* ── 状态（设置 / 形象 / 纪念日 / 美化） ── */
    if (p === '/state' && req.method === 'GET') return send(res, 200, db.state)
    if (p === '/state' && req.method === 'PUT') {
      const patch = await readBody(req)
      db.state = { ...db.state, ...patch }
      await save()
      console.log(`[state] 已更新：${Object.keys(patch).join(', ')}`)
      return send(res, 200, db.state)
    }

    /* ── 规则（版本化） ── */
    if (p === '/rules' && req.method === 'GET') {
      if (!db.rules) return send(res, 200, { version: 0, data: null })
      return send(res, 200, { version: db.rulesVersion, data: db.rules })
    }
    if (p === '/rules' && req.method === 'PUT') {
      const data = await readBody(req)
      db.rules = data
      db.rulesVersion += 1
      await save()
      console.log(`[rules] 新版本 v${db.rulesVersion}`)
      return send(res, 200, { version: db.rulesVersion, data })
    }

    /* ── 字卡库（全量替换，版本 +1） ── */
    if (p === '/cards' && req.method === 'GET') {
      // data 为 null 表示「还没存过卡」，前端会保留本地预设
      return send(res, 200, { version: db.cardsVersion, data: db.cards ?? null })
    }
    if (p === '/cards' && req.method === 'PUT') {
      const body = await readBody(req)
      const list = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : null
      if (!list) return send(res, 400, { error: 'data must be Card[]' })
      db.cards = list
      db.cardsVersion += 1
      await save()
      console.log(`[cards] 新版本 v${db.cardsVersion}（共 ${list.length} 张）`)
      return send(res, 200, { version: db.cardsVersion, data: list })
    }

    const useMatch = p.match(/^\/cards\/([^/]+)\/use$/)
    if (useMatch && req.method === 'POST') {
      const id = decodeURIComponent(useMatch[1])
      const card = (db.cards ?? []).find((c) => c.id === id)
      if (!card) return send(res, 404, { error: 'card not found' })
      card.useCount = (card.useCount ?? 0) + 1
      card.lastUsedAt = new Date().toISOString()
      await save()
      return send(res, 200, card)
    }

    /* ── 聊天记录 ── */
    const listMatch = p.match(/^\/conversations\/([^/]+)\/messages$/)
    if (listMatch) {
      const convId = decodeURIComponent(listMatch[1])
      const list = db.messages[convId] ?? []
      if (req.method === 'GET') return send(res, 200, list)
      if (req.method === 'POST') {
        const msg = await readBody(req)
        if (!msg?.id) return send(res, 400, { error: 'message.id required' })
        const arr = db.messages[convId] ?? (db.messages[convId] = [])
        const i = arr.findIndex((m) => m.id === msg.id)
        if (i >= 0) arr[i] = msg
        else arr.push(msg) // 幂等：同一 id 重复推送只更新
        await save()
        console.log(`[chat] ${convId} +1（共 ${arr.length} 条）`)
        return send(res, 200, msg)
      }
      // 「清空聊天记录」是真删（否则下次启动又会从后端并回来）
      if (req.method === 'DELETE') {
        db.messages[convId] = []
        await save()
        console.log(`[chat] ${convId} 清空`)
        return send(res, 200, { ok: true, count: 0 })
      }
    }

    const recallMatch = p.match(/^\/messages\/([^/]+)\/recall$/)
    if (recallMatch && req.method === 'POST') {
      const id = decodeURIComponent(recallMatch[1])
      let found = false
      for (const convId of Object.keys(db.messages)) {
        const m = db.messages[convId].find((x) => x.id === id)
        if (m) {
          m.status = 'RECALLED'
          m.recalled = true
          m.text = undefined
          found = true
        }
      }
      if (found) await save()
      return send(res, 200, { ok: found })
    }

    send(res, 404, { error: `no route: ${req.method} ${url.pathname}` })
  } catch (e) {
    console.error('[error]', e)
    send(res, 500, { error: String(e?.message ?? e) })
  }
})

server.listen(PORT, () => {
  console.log(`黎念 dev-server  →  http://localhost:${PORT}/api/v1`)
  console.log(`数据文件：${DATA_FILE}`)
  console.log(
    existsSync(join(WEB_DIST, 'index.html'))
      ? `前端已托管：http://localhost:${PORT}/  （手机用同一局域网访问 http://<这台电脑的IP>:${PORT}/）`
      : '前端未构建：只提供 /api（想单进程跑，先 npm run build）',
  )
  console.log(
    APP_PASSWORD
      ? '访问密码：已开启（浏览器会弹一次登录框，用户名随便填，密码 = APP_PASSWORD）'
      : '⚠️ 没设 APP_PASSWORD：任何能访问这个地址的人都能看到你的聊天记录、用你的 Key',
  )
})
