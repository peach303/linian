/**
 * 联网搜索推送的引擎（真去网上搜，搜到才推）
 *
 * 这个模块的红线最直白，所以先写在最上面：
 *
 *   · **搜到了** → 推一张 `SEARCH_PUSH` 卡：标题 / 链接 / 摘要 / 图**都是真返回的**，
 *     同时往 `state.searchPush.logs` 记一条成功（成功的也留着，好回溯「他都推过什么」）。
 *     卡片有三种形态（见 `runSearch` 里那段注释）：链接卡 / 图片卡 / 视频卡。
 *   · **搜不到**（没配 Key / 连不上外网 / 被限流 / 一条结果都没有）→ **一条消息都不发**，
 *     只记一条失败 —— 界面上能看见「上次为什么没搜到」。
 *     宁可空着，也不编一条「他上网看到……」。
 *   · **图配不上就不配**（上游的图一半是防盗链 / logo / 404）：退回纯链接卡，
 *     绝不放一张占位图或者「他拍的照」。
 *
 * 排程同样**从数据推导、不存任务表**（和世界感知 / 日记一个路子）：
 *
 *   · 一个间隔里最多试一次（`search.pushIntervalMin`，上一次试过的时刻从轨迹与聊天记录里现算）；
 *   · 试不试 = 种子抽签（`search.p`，**种子 = 日期 + 间隔槽**）→ 同一槽里刷新不重掷；
 *   · 搜什么 = 从 `search.topics` 里种子抽一个（种子同上）→ 同一槽里搜的是同一个词。
 *
 * 请求走我们自己的后端（`POST /api/v1/search`）：浏览器直连博查会被 CORS 挡，
 * 而且 Key 只该待在服务端（见 `apps/server/bocha.mjs`）。
 */
import { nid } from '@/lib/ids'
import { dayKeyOf } from '@/lib/diary'
import { slotOf } from '@/lib/world'
import { searchWeb } from '@/lib/search'
import { INTEGRATIONS } from '@/lib/integrations'
import { useAppStore } from '@/store/useAppStore'
import { useChatStore } from '@/store/useChatStore'
import { useIntegrationsStore } from '@/store/useIntegrationsStore'
import { useRulesStore } from '@/store/useRulesStore'
import { MOCK_CONVERSATION } from '@/mock/chat'
import { inQuietHours } from './proactive'
import { makeSearchCaption } from './content'
import { seededHit, seededPick } from './seed'
import type { Message } from '@/types'

/** 一分钟一趟：这件事只关心「到没到下一个间隔」 */
const TICK_MS = 60_000

/** 主题没设时兜底（规则里默认有 4 个，通常用不到） */
const FALLBACK_TOPICS = ['新闻', '趣事', '音乐']

let attached = false
let clock: ReturnType<typeof setInterval> | null = null

const rules = () => useRulesStore.getState().saved.search
const app = () => useAppStore.getState()

/** 一次搜索的结局（手动那条按钮也拿它来报信） */
export interface SearchAttempt {
  ok: boolean
  /** 这次搜的是哪个词 */
  topic: string
  /** 推出去的卡片是什么形态（失败则没有） */
  media?: 'link' | 'image' | 'video'
  title?: string
  url?: string
  error?: string
  detail?: string
}

/** 一次取几条（「设置 → 接入」里配的） */
const wantedCount = () => {
  const n = useIntegrationsStore.getState().status.search.count
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 5
}

/**
 * 上一次「试过」是什么时候（成功、失败都算）
 *
 * 从**轨迹 + 聊天记录**两处现算：轨迹会被裁到 `MAX_SEARCH_LOGS` 条、也能手动删，
 * 但「最近推过一张卡」这件事以聊天记录为真 —— 两边取更晚的那个，免得刚推完又推一条。
 */
function lastAttemptAt(): number {
  const logs = app().searchPush.logs
  const fromLogs = logs.reduce((m, l) => Math.max(m, +new Date(l.at) || 0), 0)
  const pushed = useChatStore
    .getState()
    .messages.filter((m) => m.kind === 'SEARCH_PUSH' && !m.recalled)
  const fromMsg = pushed.reduce((m, x) => Math.max(m, +new Date(x.createdAt) || 0), 0)
  return Math.max(fromLogs, fromMsg)
}

/**
 * 真去搜一次，并按结果决定「推一张卡」还是「只记一条」
 *
 * 这是唯一会真的发消息的地方 —— 只有 `searchWeb` 说 `ok:true` 才会走到推送。
 *
 * 卡片的**形态**（链接 / 图 / 视频）是这么定的：
 *   ① 首位结果本身就是视频页 → **视频卡**（内容说了算，不掷骰子）；
 *   ② 否则服务端验过有可用图 & 掷中 `search.imageP` → **图片卡**；
 *   ③ 再不然 → **链接卡**（有图就带封面，没有就纯文字卡）。
 * 图一律来自上游页面，验不过就没有 —— 不合成、不占位。
 */
export async function runSearch(
  topic: string,
  now = new Date(),
  opts: { slot?: number; manual?: boolean } = {},
): Promise<SearchAttempt> {
  const st = app()
  const chat = useChatStore.getState()
  const r = rules()
  const slot = opts.slot ?? slotOf(now, r.pushIntervalMin)
  /** 关键词 + 时效一起交给后端；默认只看最近一周，避免推旧闻 */
  const out = await searchWeb(topic, { count: wantedCount(), freshness: r.freshness || 'oneWeek', enrich: true })

  if (!out.ok) {
    st.addSearchLog({
      id: nid('sl'),
      at: now.toISOString(),
      topic,
      slot,
      ok: false,
      error: out.error,
      detail: out.detail,
    })
    console.debug('[engine] 联网搜索：这次没搜到 →', out.error, out.detail ?? '', '（不推任何消息）')
    return { ok: false, topic, error: out.error, detail: out.detail }
  }

  const top = out.results[0]
  const allPics = out.media?.pics ?? []
  const notes = out.media?.notes ?? []
  const video = out.media?.video?.is ? out.media.video : top.video?.is ? top.video : null
  // 同一槽里的形态/附言不重掷（刷新页面也一样）
  const dice = `search-media:${dayKeyOf(now)}:${slot}`
  const media: 'link' | 'image' | 'video' = video ? 'video' : allPics.length && seededHit(dice, r.imageP) ? 'image' : 'link'
  const pic = allPics[0]
  const wantCaption = seededHit(`search-caption:${dayKeyOf(now)}:${slot}`, r.captionP)
  const caption = wantCaption ? makeSearchCaption(media) : ''

  const body = (top.summary || top.snippet || top.name).trim()
  /** 图片卡指到「这张图出自的那个页面」；链接卡/视频卡指首位结果 */
  const linkUrl = media === 'image' ? pic?.hostPageUrl || top.url : top.url
  const engineLabel = out.source === 'news-rss' ? '新闻 RSS' : '博查'

  const msg: Message = {
    id: nid('m'),
    conversationId: chat.conversation?.id ?? MOCK_CONVERSATION.id,
    senderId: st.dream.id,
    kind: 'SEARCH_PUSH',
    status: 'SENT',
    text: body,
    payload: {
      // 卡面直接读的字段（`MessageBubble` 的 SEARCH_PUSH 分支）
      source: top.siteName ? `${top.siteName} · ${engineLabel}` : `${engineLabel}搜索`,
      title: media === 'image' ? '' : top.name || body.slice(0, 40),
      url: linkUrl,
      siteName: top.siteName,
      /** 站点图标（博查给的真 favicon） */
      siteIcon: top.siteIcon || '',
      snippet: top.snippet,
      summary: top.summary,
      datePublished: top.datePublished,
      /** 形态：link / image / video —— 卡面排版按它走 */
      media,
      /** 他配的那一句（可能没有）。只有姿态，不评价内容 */
      caption,
      /** 配图 / 封面（服务端验过的图；`proxy` 走我们后端代取，防盗链也能显示） */
      cover: pic ? { proxy: pic.proxy, src: pic.src, width: pic.width, height: pic.height, from: pic.from, hostPageUrl: pic.hostPageUrl } : undefined,
      /** 视频卡：真时长 + 凭哪一路判成视频页 */
      clip: video ? { site: video.site, duration: video.duration, why: video.why } : undefined,
      /** 这次是哪来的：搜索词 + 用了哪个搜索服务 + 取到几条 + 形态（复盘用） */
      search: { query: topic, engine: out.source === 'news-rss' ? 'news-rss' : 'bocha', freshness: r.freshness || 'oneWeek', results: out.results.length, manual: Boolean(opts.manual), imageP: r.imageP, caption: Boolean(caption) },
    },
    createdAt: now.toISOString(),
  }
  chat.pushMessage(msg)
  st.addSearchLog({
    id: nid('sl'),
    at: now.toISOString(),
    topic,
    slot,
    ok: true,
    title: top.name,
    url: linkUrl,
    siteName: top.siteName,
    media,
    note: logNote(media, video, allPics.length, notes),
  })
  console.debug('[engine] 联网搜索：搜到并推了一条 →', topic, `· ${media}`, '·', top.name.slice(0, 30))
  return { ok: true, topic, media, title: top.name, url: linkUrl }
}

/** 轨迹里那句「这次推的是什么」（人话，界面上直接显示） */
function logNote(
  media: 'link' | 'image' | 'video',
  video: { duration?: string | null; why?: string | null } | null,
  picCount: number,
  notes: string[],
): string {
  if (media === 'video') {
    const why = video?.why === 'host' ? '域名是视频站' : video?.why === 'og' ? '页面带 og:video' : ''
    return `视频页${video?.duration ? ` ${video.duration}` : ''}${why ? `（${why}）` : ''}`
  }
  if (media === 'image') return `配了图${notes.length ? `（另有 ${notes.length} 张被丢掉）` : ''}`
  return picCount
    ? `链接卡（有图但这次没发图）`
    : notes.length
      ? `纯链接（图都没验过：${notes[0]}）`
      : '纯链接（这次没有可用图）'
}

/**
 * 手动推一条（「设置 → 接入」里的按钮）
 *
 * 不算「到点了」那套排程：人说了算，也不看免打扰时段。
 * 搜索词仍然用这一槽的种子抽 —— 和自动那条一致。
 */
export async function pushNow(): Promise<SearchAttempt> {
  const now = new Date()
  const r = rules()
  const topics = r.topics.length ? r.topics : FALLBACK_TOPICS
  const slot = slotOf(now, r.pushIntervalMin)
  const topic = seededPick(topics, `search-topic:${dayKeyOf(now)}:${slot}`) ?? FALLBACK_TOPICS[0]
  return runSearch(topic, now, { slot, manual: true })
}

/** 到点了吗（不存任务表：看上次试过多久以前 + 这一槽的种子） */
async function check(now = new Date()) {
  const st = app()
  if (!st.ready) return
  const r = rules()
  if (!r.enabled) return
  /** 没配 Key 就一条都不试（也不刷失败轨迹：配置问题去「接入」页看） */
  if (!INTEGRATIONS.search) return

  const intervalMs = Math.max(10, Math.round(r.pushIntervalMin)) * 60_000
  const last = lastAttemptAt()
  if (last && now.getTime() - last < intervalMs) return

  const slot = slotOf(now, r.pushIntervalMin)
  if (!seededHit(`search-hit:${dayKeyOf(now)}:${slot}`, r.p)) return

  const quiet = useRulesStore.getState().saved.proactive.message.quietHours
  if (inQuietHours(quiet, now)) {
    console.debug('[engine] 联网搜索：这一槽命中了，但正处在免打扰时段 → 不推')
    return
  }

  const topics = r.topics.length ? r.topics : FALLBACK_TOPICS
  const topic = seededPick(topics, `search-topic:${dayKeyOf(now)}:${slot}`) ?? FALLBACK_TOPICS[0]
  await runSearch(topic, now, { slot })
}

/**
 * 挂上排程
 *
 * 放在 `useIntegrationsStore.refresh()` **之后**挂（那一步才知道 Key 配没配）。
 */
export function attachSearchEngine() {
  if (attached) return
  attached = true
  void check()
  clock = setInterval(() => void check(), TICK_MS)
}
