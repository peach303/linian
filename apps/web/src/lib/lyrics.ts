import { API_BASE } from '@/lib/deploy'
import { seededPick } from '@/lib/engine/seed'
import type { Track } from '@/types'

/**
 * 歌词截句
 *
 * 只从**真的拿到**的 LRC 里截，不编歌词。缓存放 localStorage：
 * 同一首歌不用反复向后端要；换设备会重新取。
 *
 * 用在两处：
 *  - 一起听房间里，他聊到这首歌时说一句歌词；
 *  - 他主动发消息时，偶尔把最近一首网易云的歌词当一句话发过来。
 */
interface LyricCache {
  lines: string[]
  at: number
}

const PREFIX = 'linian:lyric:v2:'
const TTL = 30 * 86400_000
const inflight = new Map<string, Promise<string[]>>()

export type LyricProvider = 'netease' | 'qq'

const keyOf = (provider: LyricProvider, id: string) => `${PREFIX}${provider}:${id}`
const validId = (provider: LyricProvider, id: string) =>
  provider === 'qq' ? /^[0-9A-Za-z]{10,20}$/.test(id) : /^\d{4,}$/.test(id)

function read(provider: LyricProvider, id: string): string[] | null {
  try {
    const raw = localStorage.getItem(keyOf(provider, id))
    if (!raw) return null
    const j = JSON.parse(raw) as LyricCache
    if (!Array.isArray(j?.lines) || !j.lines.length) return null
    if (Date.now() - (j.at || 0) > TTL) return null
    return j.lines.map(String).filter(Boolean)
  } catch {
    return null
  }
}

function write(provider: LyricProvider, id: string, lines: string[]) {
  try {
    localStorage.setItem(
      keyOf(provider, id),
      JSON.stringify({ lines, at: Date.now() } satisfies LyricCache),
    )
  } catch {
    /* 隐私模式 / 存储满：只影响下次再取 */
  }
}

/** 取一首歌的歌词（网易云 / QQ）；失败返回空数组（不抛） */
export async function ensureLyrics(songId: string, provider: LyricProvider = 'netease'): Promise<string[]> {
  const id = String(songId || '').trim()
  if (!validId(provider, id)) return []
  const hit = read(provider, id)
  if (hit) return hit
  const cacheKey = `${provider}:${id}`
  const running = inflight.get(cacheKey)
  if (running) return running
  const task = (async () => {
    try {
      const param = provider === 'qq' ? `mid=${encodeURIComponent(id)}` : `id=${encodeURIComponent(id)}`
      const res = await fetch(`${API_BASE}/music/lyric?${param}`)
      const j = (await res.json().catch(() => null)) as { ok?: boolean; lines?: string[] } | null
      const lines = Array.isArray(j?.lines) ? j.lines.map(String).map((s) => s.trim()).filter(Boolean) : []
      if (lines.length) write(provider, id, lines)
      return lines
    } catch {
      return []
    } finally {
      inflight.delete(cacheKey)
    }
  })()
  inflight.set(cacheKey, task)
  return task
}

/** 缓存里抽一句；没有缓存就返回 null（调用方决定要不要等） */
export function pickCachedLyric(
  songId: string,
  seed = 'lyric',
  provider: LyricProvider = 'netease',
): string | null {
  const id = String(songId || '').trim()
  if (!validId(provider, id)) return null
  const lines = read(provider, id)
  if (!lines) return null
  const usable = lines.filter((line) => {
    const s = line.trim()
    if (s.length < 4 || s.length > 42) return false
    // 太像制作名单 / 念白的不要
    if (/^(作词|作曲|编曲|制作|混音|母带|录音|和声|监制|出品|发行)/.test(s)) return false
    if (/^[^：:]{1,12}\s*[:：]/.test(s)) return false
    return true
  })
  return usable.length ? seededPick(usable, `lyric-line:${provider}:${id}:${seed}`) ?? null : null
}

/** 一首歌能截歌词就预先拉一次（在加歌 / 开始播时调用） */
export function preloadTrackLyrics(track: Track | null | undefined) {
  const src = track?.source
  if (src?.kind === 'netease') void ensureLyrics(src.songId, 'netease')
  else if (src?.kind === 'qq') void ensureLyrics(src.songMid, 'qq')
}

/** 是否有可用的歌词缓存（主动消息里用来避免每次都等网络） */
export const hasCachedLyric = (songId: string, provider: LyricProvider = 'netease') =>
  Boolean(read(provider, String(songId || '').trim()))
