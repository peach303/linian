/**
 * 联网搜索（博查 / Bocha）—— 前端这一侧
 *
 * 请求走**我们自己的后端**（`POST /api/v1/search`），不从这里直连博查：
 *   ① 浏览器直连会被 CORS 挡；② Key 只该待在服务端，永远不下发到前端。
 *
 * 这个模块最容易出问题的地方不是「搜到」，而是「搜不到」：
 * 于是这里**只如实转发结果**，搜不到就把原因原样带回来（`ok:false`），
 * 由调用方决定「什么都不推、只记一条轨迹」。**绝不编一条搜索结果。**
 */
import { API_BASE } from '@/lib/deploy'

export interface SearchResult {
  /** 标题 */
  name: string
  url: string
  /** 站点名（「新华网」这种） */
  siteName: string
  /** 站点图标（博查给的真 favicon） */
  siteIcon?: string
  /** 摘要（上游给的短摘要） */
  snippet: string
  /** 更长的一段（博查的 `summary`，请求时开了 `summary: true`） */
  summary: string
  datePublished?: string
  /** 这条像不像视频页（后端纯本地判的：域名是视频站 / 页面自己的 og:video —— 只有这两路硬信号） */
  video?: SearchVideoInfo
}

/** 「这条是视频页吗」——只有两路硬信号（域名是视频站 / 页面自带 og:video），`why` 说明凭哪一路 */
export interface SearchVideoInfo {
  is: boolean
  site?: string | null
  /** 真读到的时长（`00:38` 这种，来自标题或摘要原文） */
  duration?: string | null
  why?: 'host' | 'og' | null
}

/** 一张**已经被服务端真取过一遍**的图（取不到的根本不会出现在这里） */
export interface SearchPic {
  /** 原图地址 */
  src: string
  /** 走我们后端代取的地址（防盗链的图只能这么显示） */
  proxy: string
  /** 这张图出自哪个页面 */
  hostPageUrl?: string
  width?: number
  height?: number
  bytes?: number
  /** same = 就是首条结果自己页面上的图；related = 博查一起给的相关页面的图；page = 抓的网页 og:image */
  from?: 'same' | 'related' | 'page'
}

/** 首条结果的「形态 + 素材」（`enrich: true` 时才回来） */
export interface SearchMedia {
  video: SearchVideoInfo
  pics: SearchPic[]
  /** 被丢掉的图 + 原因（写进日志，方便回头看「这次为什么没配图」） */
  notes?: string[]
}

export type SearchOutcome =
  | { ok: true; query: string; results: SearchResult[]; media?: SearchMedia; source?: string }
  | { ok: false; error: string; detail?: string; hint?: string }

/** 失败原因 → 人话（和后端 `apps/server/bocha.mjs` 里那张表对齐） */
const REASON: Record<string, string> = {
  NOT_CONFIGURED: '还没配搜索服务（设置 → 接入 里填博查 Key）',
  EMPTY_QUERY: '搜索词是空的',
  FETCH_FAILED: '连不上搜索服务（这台机器出不了外网？）',
  TIMEOUT: '搜索服务没在 15 秒内回话',
  BAD_KEY: 'Key 不对或者没权限',
  QUOTA: '额度用完了 / 被限流了',
  BAD_RESPONSE: '搜索服务回的格式看不懂',
  NO_RESULT: '搜索服务这次没返回可用的结果',
  HTTP_ERROR: '搜索服务报了个错',
  BACKEND_UNREACHABLE: '后端没在跑：先启动 npm run dev:api',
}

export function searchReason(error: string, detail?: string): string {
  const text = REASON[error] ?? '搜索失败了'
  return detail ? `${text}（${detail}）` : text
}

/** 真去搜一次（经我们自己的后端）
 *
 * `enrich: true` 会让后端顺带给**首条结果**备素材（是不是视频页 / 有没有验得过的图）。
 * 「设置 → 接入」里那个「搜一下」测试**不开** enrich：只是想看连通和结果，少发几个请求。
 */
export async function searchWeb(
  query: string,
  opts: { count?: number; freshness?: string; timeoutMs?: number; enrich?: boolean } = {},
): Promise<SearchOutcome> {
  const q = query.trim()
  if (!q) return { ok: false, error: 'EMPTY_QUERY' }
  const ctrl = new AbortController()
  // 开了 enrich 的话后端要真取几张图 / 抓一次网页，给它宽一点
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? (opts.enrich ? 35_000 : 20_000))
  try {
    const res = await fetch(`${API_BASE}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q, count: opts.count, freshness: opts.freshness, enrich: Boolean(opts.enrich) }),
      signal: ctrl.signal,
    })
    const j = (await res.json().catch(() => null)) as
      | ({
          ok?: boolean
          results?: SearchResult[]
          media?: SearchMedia
          source?: string
          error?: string
          detail?: string
          hint?: string
        } & Partial<SearchOutcome>)
      | null
    if (!res.ok || !j) return { ok: false, error: 'HTTP_ERROR', detail: `HTTP ${res.status}` }
    if (j.ok === false) return { ok: false, error: j.error ?? 'HTTP_ERROR', detail: j.detail ?? j.hint }
    if (!Array.isArray(j.results) || j.results.length === 0) return { ok: false, error: 'NO_RESULT' }
    return { ok: true, query: q, results: j.results, media: j.media, source: j.source }
  } catch (e) {
    // 连不上后端（fetch 直接抛）/ 超时
    const aborted = (e as { name?: string })?.name === 'AbortError'
    return { ok: false, error: aborted ? 'TIMEOUT' : 'BACKEND_UNREACHABLE', detail: aborted ? undefined : String((e as Error)?.message ?? e) }
  } finally {
    clearTimeout(timer)
  }
}
