/**
 * B 站片单（前端这一侧）
 *
 * 不再直连博查，也不在浏览器里搜 B 站：
 *   · B 站搜索接口有 412 / CORS，公共 CORS 代理也不稳；
 *   · 改成构建时抓热门 + 排行榜，写成 `public/feed/bilibili.json`；
 *   · 前端只读**同源静态文件**，不需要 Key、不经过代理，GitHub Actions 会定时刷新。
 *
 * 这个模块只如实返回片单里真实存在的视频；读不到文件、片单为空就返回失败，
 * 由调用方决定「一条都不推」，绝不编一条「他上网看到的视频」。
 */
export interface SearchResult {
  /** 视频标题 */
  name: string
  /** 视频链接 */
  url: string
  /** 站点名 */
  siteName: string
  siteIcon?: string
  /** 卡片上的一行说明（UP 主 / 播放量 / 分区） */
  snippet: string
  summary: string
  datePublished?: string
  video?: SearchVideoInfo
}

export interface SearchVideoInfo {
  is: boolean
  site?: string | null
  duration?: string | null
  why?: 'host' | 'og' | null
}

export interface SearchPic {
  src: string
  proxy: string
  hostPageUrl?: string
  width?: number
  height?: number
  bytes?: number
  from?: 'same' | 'related' | 'page'
}

export interface SearchMedia {
  video: SearchVideoInfo
  pics: SearchPic[]
  notes?: string[]
}

export type SearchOutcome =
  | { ok: true; query: string; results: SearchResult[]; media?: SearchMedia; source?: string }
  | { ok: false; error: string; detail?: string; hint?: string }

export interface BiliFeedItem {
  bvid: string
  title: string
  url: string
  cover: string
  duration: string
  durationSec: number
  owner: string
  tname: string
  desc: string
  view: number
  like: number
  danmaku: number
  pubdate: string
}

interface BiliFeed {
  generatedAt: string
  source: string
  count: number
  items: BiliFeedItem[]
}

/** 失败原因 → 人话 */
const REASON: Record<string, string> = {
  EMPTY_QUERY: '搜索词是空的',
  FEED_MISSING: '还没生成 B 站片单（部署时会自动抓；本地可运行 node scripts/fetch-bilibili-feed.mjs）',
  FEED_BAD: 'B 站片单文件格式不对',
  NO_RESULT: '这份片单里没有匹配的视频',
  NETWORK: '片单文件读不到（检查静态资源路径）',
}

export function searchReason(error: string, detail?: string): string {
  const text = REASON[error] ?? '搜索失败了'
  return detail ? `${text}（${detail}）` : text
}

const FEED_CACHE_MS = 5 * 60 * 1000
let feedCache: { at: number; data: BiliFeed | null } = { at: 0, data: null }

async function loadFeed(): Promise<BiliFeed | null> {
  if (feedCache.data && Date.now() - feedCache.at < FEED_CACHE_MS) return feedCache.data
  try {
    const base = String(import.meta.env.BASE_URL || '/')
    const url = `${base.replace(/\/?$/, '/')}feed/bilibili.json?t=${Math.floor(Date.now() / FEED_CACHE_MS)}`
    const res = await fetch(url, { cache: 'no-cache' })
    if (!res.ok) {
      feedCache = { at: Date.now(), data: null }
      return null
    }
    const j = (await res.json().catch(() => null)) as Partial<BiliFeed> | null
    if (!j || !Array.isArray(j.items)) {
      feedCache = { at: Date.now(), data: null }
      return null
    }
    const data: BiliFeed = {
      generatedAt: String(j.generatedAt ?? ''),
      source: String(j.source ?? 'bilibili'),
      count: Number(j.count) || j.items.length,
      items: j.items.filter((x): x is BiliFeedItem => Boolean(x?.bvid && x?.title && x?.url)),
    }
    feedCache = { at: Date.now(), data }
    return data
  } catch {
    feedCache = { at: Date.now(), data: null }
    return null
  }
}

/** 关键词拆成能匹配的碎片（中文整词 + 英文单词） */
function terms(query: string): string[] {
  const stop = new Set(['今天', '最近', '本周', '最新', '有什么', '什么', '看看', '一点', '一些', '的', '了', '和', '与', '在'])
  const out: string[] = []
  const push = (s: string) => {
    const t = s.trim().toLowerCase()
    if (t.length >= 2 && !stop.has(t) && !out.includes(t)) out.push(t)
  }
  for (const part of query.toLowerCase().split(/[\s,，。.!！?？、/|+·\-—]+/)) push(part)
  // 中文没有空格时，整句也算一个词（例如「音乐现场」）
  push(query.toLowerCase())
  return out.slice(0, 8)
}

const hash = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** 按相关度排；一个词都匹配不上时，用查询词做种子从当前片单里挑（仍然是真视频、仍是新的） */
function rank(items: BiliFeedItem[], query: string, count: number): BiliFeedItem[] {
  const words = terms(query)
  const scored = items.map((item) => {
    const hay = `${item.title} ${item.tname} ${item.owner} ${item.desc}`.toLowerCase()
    let score = 0
    for (const w of words) {
      if (!w) continue
      if (item.title.toLowerCase().includes(w)) score += 6
      else if (item.tname.toLowerCase().includes(w)) score += 4
      else if (item.owner.toLowerCase().includes(w)) score += 3
      else if (hay.includes(w)) score += 1
    }
    return { item, score }
  })

  const matched = scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score)
  if (matched.length >= count) return matched.slice(0, count).map((x) => x.item)

  // 相关的不够：先用相关的，再补同片单里没出现过的（种子轮换，刷新不会每次一样）
  const picked = matched.map((x) => x.item)
  const seen = new Set(picked.map((x) => x.bvid))
  const rest = items
    .filter((x) => !seen.has(x.bvid))
    .map((item, i) => ({ item, k: hash(`${query}:${item.bvid}:${i}`) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.item)
  return [...picked, ...rest].slice(0, count)
}

const fmtCount = (n: number) => {
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)} 亿`
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)} 万`
  return String(n)
}

function toResult(item: BiliFeedItem): SearchResult {
  const bits = [item.owner, item.tname, item.view ? `${fmtCount(item.view)}播放` : ''].filter(Boolean)
  return {
    name: item.title,
    url: item.url,
    siteName: '哔哩哔哩',
    snippet: bits.join(' · '),
    summary: item.desc || bits.join(' · '),
    datePublished: item.pubdate,
    video: { is: true, site: 'bilibili', duration: item.duration, why: 'host' },
  }
}

/**
 * 从静态片单里挑视频。
 *
 * `opts.freshness` 保留旧调用签名，但片单本身就是热的（每几小时刷新），不再做额外日期过滤。
 */
export async function searchWeb(
  query: string,
  opts: { count?: number; freshness?: string; timeoutMs?: number; enrich?: boolean } = {},
): Promise<SearchOutcome> {
  const q = query.trim()
  if (!q) return { ok: false, error: 'EMPTY_QUERY' }

  const feed = await loadFeed()
  if (!feed) return { ok: false, error: 'NETWORK' }
  if (!feed.items.length) return { ok: false, error: 'FEED_MISSING' }

  const count = Math.max(1, Math.min(10, Math.round(opts.count ?? 5)))
  const picked = rank(feed.items, q, count)
  if (!picked.length) return { ok: false, error: 'NO_RESULT' }

  const results = picked.map(toResult)
  const top = picked[0]!
  const pic: SearchPic = {
    src: top.cover,
    // wsrv 已实测能取 B 站封面；失败时卡片会退回 src
    proxy: `https://wsrv.nl/?url=${encodeURIComponent(top.cover)}&w=720&h=405&fit=cover&output=webp`,
    hostPageUrl: top.url,
    width: 720,
    height: 405,
    from: 'same',
  }

  return {
    ok: true,
    query: q,
    results,
    source: 'bilibili',
    media: {
      video: { is: true, site: 'bilibili', duration: top.duration, why: 'host' },
      pics: [pic],
    },
  }
}
