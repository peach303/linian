/**
 * 联网搜索推送适配层（生产版）
 *
 * 梦角「上网找点东西」推给你 —— 唯一的真源是搜索服务**真返回**的那几条。
 * 本机版（`apps/web/src/lib/engine/search.ts` + `apps/server/bocha.mjs`）已经跑通同一套契约，
 * 这里保持同名同形，多端部署时换成服务端定时任务发起。
 *
 * 红线（两边都必须守）：
 *   ① **搜到才推**：`SEARCH_PUSH` 卡上的标题 / 链接 / 站点 / 摘要 / 图，必须来自搜索服务（或它给的页面）；
 *   ② **搜不到就一条消息都不发**：只落一条 `search_pushes`（`ok=false` + `error` / `detail`），
 *      界面上的「搜索轨迹」能回答「上次为什么没推」；
 *   ③ 读不懂上游响应 = 失败（`BAD_RESPONSE`），**绝不猜一条出来**；
 *   ④ **图先验再用**：上游 `images` 里那批图一半是 logo / 防盗链 / 404 —— 真取一遍才作数，
 *      验不过就不配图（退回纯链接卡，本地版实现见 `apps/server/media.mjs`，**只验证不生成**）。
 *
 * 卡有**链接 / 图片 / 视频**三种形态（`media`）：视频只能靠「这条结果是不是视频页」判 ——
 * 博查这个接口的 `videos` 容器**永远是空的**（别指望它给视频数据）。
 *
 * 搜到的东西只是「素材」：要不要开口、怎么说，仍由引擎的模板/LLM 决定，且**不替搜索结果编点评**。
 */
import { Injectable, Logger } from '@nestjs/common'

/** 搜索源（`integration_configs.provider = 'SEARCH'`） */
export type SearchProvider = 'bocha' | 'none'

/** 一次搜索尝试的结局（成功 / 失败都要落库） */
export interface SearchOutcome {
  ok: boolean
  /** 搜索服务真返回的结果（失败时为空数组） */
  results: SearchResult[]
  /** 失败原因码：NOT_CONFIGURED | BAD_KEY | FETCH_FAILED | TIMEOUT | QUOTA | BAD_RESPONSE | NO_RESULT | HTTP_ERROR */
  error?: string
  /** 上游原话 / HTTP 状态（给人看的） */
  detail?: string
}

export interface SearchResult {
  /** 标题 */
  name: string
  url: string
  /** 站点名 */
  siteName: string
  /** 站点图标（博查给的真 favicon） */
  siteIcon?: string
  /** 短摘要 */
  snippet: string
  /** 长一点的一段（请求时开 `summary: true`） */
  summary: string
  datePublished?: string
  /** 这条像不像视频页（域名是视频站 / 页面自带 og:video —— 只有这两路硬信号） */
  video?: { is: boolean; site?: string | null; duration?: string | null; why?: 'host' | 'og' | null }
}

const BOCHA_ENDPOINT = 'https://api.bochaai.com/v1/web-search'

@Injectable()
export class SearchService {
  private readonly log = new Logger(SearchService.name)
  private provider: SearchProvider = (process.env.SEARCH_PROVIDER as SearchProvider) ?? (process.env.SEARCH_API_KEY ? 'bocha' : 'none')
  private apiKey = process.env.SEARCH_API_KEY ?? ''
  /** 时效过滤：oneDay | oneWeek | oneMonth | oneYear | noLimit */
  private freshness = process.env.SEARCH_FRESHNESS ?? 'oneYear'
  private count = 5

  configure(p: { provider?: SearchProvider; apiKey: string; freshness?: string; count?: number }) {
    if (p.provider) this.provider = p.provider
    this.apiKey = p.apiKey
    if (p.freshness) this.freshness = p.freshness
    if (Number.isFinite(p.count)) this.count = Math.max(1, Math.min(10, Number(p.count)))
  }

  get enabled() {
    return this.provider === 'bocha' && Boolean(this.apiKey)
  }

  /**
   * 真去搜一次
   *
   * 调用方拿到的只有「结局」：`ok` 为 false 时**什么都不要发**，
   * 把 `error` / `detail` 落进 `search_pushes` 就够了。
   */
  async search(query: string): Promise<SearchOutcome> {
    const q = query.trim()
    if (!q) return { ok: false, results: [], error: 'EMPTY_QUERY' }
    if (!this.enabled) return { ok: false, results: [], error: 'NOT_CONFIGURED' }

    let res: Response
    try {
      res = await fetch(BOCHA_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          freshness: this.freshness,
          summary: true,
          count: Math.max(1, Math.min(10, this.count)),
        }),
        signal: AbortSignal.timeout(15_000),
      })
    } catch (e) {
      const timeout = (e as { name?: string })?.name === 'TimeoutError'
      this.log.warn(`search 请求失败：${timeout ? 'TIMEOUT' : 'FETCH_FAILED'}`)
      return { ok: false, results: [], error: timeout ? 'TIMEOUT' : 'FETCH_FAILED', detail: String((e as Error)?.message ?? e) }
    }

    if (res.status === 401 || res.status === 403) return { ok: false, results: [], error: 'BAD_KEY', detail: `HTTP ${res.status}` }
    if (res.status === 429) return { ok: false, results: [], error: 'QUOTA', detail: 'HTTP 429' }

    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (!res.ok) return { ok: false, results: [], error: 'HTTP_ERROR', detail: `HTTP ${res.status}` }
    return this.normalize(json)
  }

  /** 把上游响应归一化（两种外层形状都认；读不懂就当失败） */
  normalize(json: Record<string, unknown> | null): SearchOutcome {
    const code = json?.code
    if (code != null && Number(code) !== 200) {
      return { ok: false, results: [], error: 'HTTP_ERROR', detail: String(json?.msg ?? json?.message ?? `code=${code}`) }
    }
    const data = (json?.data ?? json) as { webPages?: { value?: unknown[] } } | null
    const pages = data?.webPages?.value
    if (!Array.isArray(pages)) return { ok: false, results: [], error: 'BAD_RESPONSE', detail: '响应里没有 webPages.value' }

    const str = (v: unknown) => (v == null ? '' : String(v).trim())
    const results: SearchResult[] = pages
      .map((raw) => {
        const p = raw as Record<string, unknown>
        return {
          name: str(p?.name ?? p?.title),
          url: str(p?.url),
          siteName: str(p?.siteName ?? p?.site),
          snippet: str(p?.snippet),
          summary: str(p?.summary),
          datePublished: str(p?.datePublished),
        }
      })
      .filter((r) => r.url && (r.name || r.snippet || r.summary))

    if (!results.length) return { ok: false, results: [], error: 'NO_RESULT', detail: `上游给了 ${pages.length} 条，但没有一条带标题和链接` }
    return { ok: true, results }
  }
}
