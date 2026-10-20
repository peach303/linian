import type { WatchItem, WatchSourceKind } from '@/types'

/**
 * 观影室
 *
 * 四种来源，各播各的（跟音乐一样的老实话）：
 *  - `local`    本机视频文件 → `<video>` 真播，进度 / 时长都在我们手里
 *  - `url`      视频直链 → 同上
 *  - `bilibili` B 站链接 → 用**官方 iframe 播放器**嵌进来播；进度我们拿不到，所以不计「一起看了多久」
 *  - `title`    只有片名（他随口推的）→ 播不了就直说
 *
 * B 站没有给第三方拿播放进度的公开接口，跨域我们也读不到 iframe 里的 `currentTime` ——
 * 所以这里只做「把官方的播放器嵌进来」，**不伪造进度**，也不假装知道他看到哪儿了。
 */

/** 他推片时用的片单（只有片名 + 一句推荐语，没有播放地址） */
export interface WatchPick {
  id: string
  title: string
  emoji: string
  note: string
}

export const WATCH_PICKS: WatchPick[] = [
  { id: 'w_1', title: '爱在黎明破晓前', emoji: '🌅', note: '整部片几乎只有两个人在走路聊天，但一点都不闷。' },
  { id: 'w_2', title: '千与千寻', emoji: '🐉', note: '小时候看是冒险，现在看是「别忘了自己叫什么」。' },
  { id: 'w_3', title: '海上钢琴师', emoji: '🎹', note: '最后那段独白我看一次难受一次，你陪我一起看吧。' },
  { id: 'w_4', title: '你的名字。', emoji: '☄️', note: '看到中间记得抓紧我。' },
  { id: 'w_5', title: '布达佩斯大饭店', emoji: '🛎️', note: '配色好看到每一帧都能截屏。' },
  { id: 'w_6', title: '请以你的名字呼唤我', emoji: '🍑', note: '夏天的味道都在这部片里了。' },
  { id: 'w_7', title: '心灵奇旅', emoji: '✨', note: '看完想认真吃一顿饭、看一次天。' },
  { id: 'w_8', title: '言叶之庭', emoji: '🌧️', note: '只有 46 分钟，下雨天看刚好。' },
]

export const watchPickById = (id: string) => WATCH_PICKS.find((w) => w.id === id)

export const newWatchId = () => `w_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

/** 他推一部片（只有片名，播不了就明说） */
export const watchItemFromPick = (pick: WatchPick, addedBy: 'me' | 'him' = 'him'): WatchItem => ({
  id: newWatchId(),
  title: pick.title,
  cover: pick.emoji,
  source: { kind: 'title' },
  addedBy,
  addedAt: new Date().toISOString(),
  note: pick.note,
})

/* ───────────────────────── B 站 ───────────────────────── */

/** 从她粘的东西里抠出 BV 号（也认 av 号 → 直接拼成官方播放器能认的形式） */
export function bilibiliId(input: string): { bvid: string; page: number } | null {
  const s = input.trim()
  const pageM = s.match(/[?&]p=(\d+)/)
  const page = pageM ? Number(pageM[1]) : 1
  const bv = s.match(/(BV[0-9A-Za-z]{10})/)
  if (bv) return { bvid: bv[1], page }
  const av = s.match(/av(\d+)/i)
  if (av) return { bvid: `av${av[1]}`, page }
  return null
}

/** B 站官方播放器（iframe 能嵌；danmaku=0 是不显示他们家的弹幕 —— 这一层留给我们自己） */
export const bilibiliEmbedUrl = (bvid: string, page = 1) =>
  `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(bvid)}&p=${page}&autoplay=0&danmaku=0&high_quality=1`

export const bilibiliPageUrl = (bvid: string, page = 1) =>
  `https://www.bilibili.com/video/${bvid}${page > 1 ? `?p=${page}` : ''}`

/* ───────────────────────── 播放方式 ───────────────────────── */

export type WatchPlayKind = 'video' | 'iframe' | 'none'

/** 这部片到底怎么播（`none` = 只有片名，界面上会直说） */
export function watchPlayKind(item: WatchItem): WatchPlayKind {
  if (item.source.kind === 'local') return 'video'
  if (item.source.kind === 'url') return item.source.url ? 'video' : 'none'
  if (item.source.kind === 'bilibili') return item.source.bvid ? 'iframe' : 'none'
  return 'none'
}

export const WATCH_KIND_LABEL: Record<WatchSourceKind, string> = {
  local: '本机文件',
  url: '直链',
  bilibili: 'B 站',
  title: '只有片名',
}

/** 封面兜底 */
export const watchCover = (item: WatchItem) =>
  item.cover ||
  (item.source.kind === 'bilibili' ? '📺' : item.source.kind === 'local' ? '📁' : item.source.kind === 'url' ? '🎞️' : '🍿')

/** 「2 小时 05 分」这种（片长显示成一整部片的样子） */
export const humanRuntime = (sec: number) => {
  if (!Number.isFinite(sec) || sec <= 0) return '—'
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  if (h > 0) return `${h} 小时 ${String(m).padStart(2, '0')} 分`
  return `${Math.max(1, m)} 分钟`
}

/** 我导入时随手粘的一坨东西 → 解析成一条片（解析不出来就返回 null，让她自己补） */
export function itemFromInput(input: string, title: string): WatchItem | null {
  const s = input.trim()
  const t = title.trim()
  if (!s && !t) return null
  const bili = s ? bilibiliId(s) : null
  if (bili) {
    return {
      id: newWatchId(),
      title: t || `B 站视频 ${bili.bvid}`,
      cover: '📺',
      source: { kind: 'bilibili', bvid: bili.bvid, page: bili.page, label: s },
      addedBy: 'me',
      addedAt: new Date().toISOString(),
    }
  }
  if (/^https?:\/\//i.test(s)) {
    return {
      id: newWatchId(),
      title: t || s.split('/').pop() || '网络视频',
      cover: '🎞️',
      source: { kind: 'url', url: s, label: s },
      addedBy: 'me',
      addedAt: new Date().toISOString(),
    }
  }
  if (t) {
    return {
      id: newWatchId(),
      title: t,
      cover: '🍿',
      source: { kind: 'title' },
      addedBy: 'me',
      addedAt: new Date().toISOString(),
    }
  }
  return null
}
