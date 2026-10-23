import { API_BASE } from '@/lib/deploy'
import { getMusicSession } from '@/lib/musicAuth'
import type { MusicPayload, Track } from '@/types'

/**
 * 歌单 / 一起听
 *
 * 三种来源，各播各的：
 *  - `local`  本机音频文件（mp3 / flac / m4a / wav…）→ `<audio>` 真播，进度、音量都在我们手里
 *  - `url`    音频直链 → 同上
 *  - `netease` 网易云 → 有代理音频流时用 `<audio>` 真播；没有就退回官方外链播放器
 *
 * 网易云没有公开 API，登录态和版权曲库都在他们服务器上。
 * 我们只代理公开的 `song/media/outer` 音频地址；版权 / VIP 曲目仍然可能只给试听或直接 404，
 * 这时候界面会明说「播不了」，不假装拿到了音频。
 */

export interface Song {
  id: string
  title: string
  artist: string
  cover: string
}

/** 他推歌时用的歌单（只是歌名 + 封面，没有播放地址） */
export const SONGS: Song[] = [
  { id: 's_1', title: '晚安', artist: '陈粒', cover: '🌙' },
  { id: 's_2', title: '小半', artist: '陈粒', cover: '🍃' },
  { id: 's_3', title: '漠河舞厅', artist: '柳爽', cover: '❄️' },
  { id: 's_4', title: '虹', artist: '手嶌葵', cover: '🌈' },
  { id: 's_5', title: '告白气球', artist: '周杰伦', cover: '🎈' },
  { id: 's_6', title: '大鱼', artist: '周深', cover: '🐋' },
  { id: 's_7', title: 'City of Stars', artist: 'Ryan Gosling', cover: '✨' },
  { id: 's_8', title: '晴天', artist: '周杰伦', cover: '☀️' },
]

export const songById = (id: string) => SONGS.find((s) => s.id === id)

/** 卡片上的那行「歌 - 歌手」 */
export const songLabel = (m: Pick<MusicPayload, 'title' | 'artist'>) =>
  m.artist ? `《${m.title}》 - ${m.artist}` : `《${m.title}》`

/* ───────────────────────── 网易云 ───────────────────────── */

/**
 * 从她粘的东西里抠出歌曲 id。
 * 分享出来的通常长这样：`分享单曲《孤勇者》- 陈奕迅 https://music.163.com/song?id=1901371647`
 * 也可能直接是数字 id。
 */
export function neteaseSongId(input: string): string | null {
  const s = input.trim()
  // 只有「整条就是数字」且至少 6 位才当歌曲 id；随手发的年份 / 金额不该变成歌卡
  if (/^\d{6,}$/.test(s)) return s
  // 必须真的是网易云链接，别把别家 URL 的 id 参数当歌曲
  if (!/(?:^|\/\/|\.)(?:music\.163\.com|y\.music\.163\.com)(?:[\/?#]|$)/i.test(s)) return null
  const m =
    s.match(/[?&]id=(\d+)/) ??
    s.match(/song\/(\d+)/) ??
    s.match(/[#/]song\?id=(\d+)/) ??
    s.match(/[?&]songid=(\d+)/i)
  return m ? m[1] : null
}

/** 官方外链播放器（height=66 是它自带的高度，不放大） */
export const neteaseEmbedUrl = (songId: string, auto = 0) =>
  `https://music.163.com/outchain/player?type=2&id=${encodeURIComponent(songId)}&auto=${auto}&height=66`

export const neteaseSongUrl = (songId: string) => `https://music.163.com/song?id=${songId}`

/**
 * 走我们自己的代理播放网易云音频。
 * 代理默认 302 到公开镜像，浏览器再直接向 CDN 请求 Range；所以首字节快、能 seek、能算真实播放时长。
 */
export const neteaseStreamUrl = (songId: string) => {
  const s = getMusicSession()
  const q = new URLSearchParams({ id: songId })
  if (s?.provider === 'netease') q.set('session', s.token)
  return `${API_BASE}/music/audio?${q.toString()}`
}

/** 镜像/代理都不通时，浏览器再试一次网易云官方外链（手机网络通常能连） */
export const neteaseFallbackUrl = (songId: string) =>
  `https://music.163.com/song/media/outer/url?id=${encodeURIComponent(songId)}.mp3`

/* ───────────────────────── QQ 音乐 ───────────────────────── */

/** 从 QQ 音乐分享 / songDetail 链接里抠 songmid */
export function qqSongMid(input: string): string | null {
  const s = input.trim()
  // 裸 songmid 必须同时有字母和数字（避免把普通英文单词当歌）
  if (/^(?=.*\d)(?=.*[A-Za-z])[0-9A-Za-z]{12,20}$/.test(s)) return s
  const m =
    s.match(/songDetail\/([0-9A-Za-z]{10,20})/) ??
    s.match(/[?&]songmid=([0-9A-Za-z]{10,20})/) ??
    s.match(/[?&]mid=([0-9A-Za-z]{10,20})/)
  return m ? m[1] : null
}

/** QQ 音乐也走代理；登录后代理会用 Cookie 换 vkey，VIP 曲目才拿得到地址 */
export const qqStreamUrl = (songMid: string) => {
  const s = getMusicSession()
  const q = new URLSearchParams({ mid: songMid })
  if (s?.provider === 'qq') q.set('session', s.token)
  return `${API_BASE}/music/audio?${q.toString()}`
}

/** 网易云曲目的展示封面（没有就退回 emoji） */
export const neteaseCoverEmoji = '🎧'

export interface ResolvedSong {
  provider?: 'netease'
  songId: string
  title: string
  artist: string
  cover?: string
}

export interface ResolvedQQSong {
  provider: 'qq'
  songMid: string
  title: string
  artist: string
  cover?: string
}

/**
 * 让**我们自己的后端**去解析分享链接（浏览器直连网易云会被 CORS 挡掉）。
 * 后端是可选组件：拿不到就返回 null，界面会让她自己补歌名。
 */
export async function resolveNetease(input: string): Promise<ResolvedSong | null> {
  try {
    const res = await fetch(`${API_BASE}/music/resolve?input=${encodeURIComponent(input)}`)
    if (!res.ok) return null
    const j = (await res.json()) as Partial<ResolvedSong> | null
    if (!j?.songId) return null
    return {
      songId: String(j.songId),
      title: j.title ?? '',
      artist: j.artist ?? '',
      cover: j.cover,
    }
  } catch {
    return null
  }
}

/** QQ 音乐：让代理解析出歌名 / 歌手 / 封面 */
export async function resolveQQ(input: string): Promise<ResolvedQQSong | null> {
  try {
    const res = await fetch(
      `${API_BASE}/music/resolve?provider=qq&input=${encodeURIComponent(input)}`,
    )
    if (!res.ok) return null
    const j = (await res.json()) as Partial<ResolvedQQSong> | null
    if (!j?.songMid) return null
    return {
      provider: 'qq',
      songMid: String(j.songMid),
      title: j.title ?? '',
      artist: j.artist ?? '',
      cover: j.cover,
    }
  } catch {
    return null
  }
}

/* ───────────────────────── 房间里的曲目 ───────────────────────── */

export const newTrackId = () => `t_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

export const trackFromSong = (song: Song, addedBy: 'me' | 'him'): Track => ({
  id: newTrackId(),
  title: song.title,
  artist: song.artist,
  cover: song.cover,
  // 他的歌只有歌名（没有播放地址）—— 所以进房间后只显示，不假装能播
  source: { kind: 'title' },
  addedBy,
  addedAt: new Date().toISOString(),
})

/** 能不能真的出声（本机文件 / 直链 / 代理音频流可以；旧网易云记录交给官方播放器；只有歌名的播不了） */
export const playableKind = (t: Track): 'audio' | 'netease' | 'none' => {
  if (t.source.kind === 'netease') return t.source.streamUrl ? 'audio' : 'netease'
  if (t.source.kind === 'qq') return 'audio'
  if (t.source.kind === 'local') return 'audio'
  if (t.source.kind === 'url') return t.source.url ? 'audio' : 'none'
  return 'none'
}

/** 秒 → mm:ss */
export const mmss = (sec: number) => {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const s = Math.floor(sec)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/**
 * 上一首 / 下一首：跳过**真的播不了**的曲目。
 * 小窗用 `audio`：只看本机文件 / 直链；网易云归它自己的 iframe，不在这里切。
 */
export function neighbourTrack(tracks: Track[], currentId: string | undefined, dir: 1 | -1): Track | undefined {
  if (!tracks.length) return undefined
  const from = tracks.findIndex((t) => t.id === currentId)
  for (let i = 1; i <= tracks.length; i++) {
    const idx = (from + dir * i + tracks.length * 2) % tracks.length
    const t = tracks[idx]
    if (t && playableKind(t) === 'audio') return t
  }
  return undefined
}

/** 本机文件（`我的歌.mp3` → 歌名） */
export const titleFromFileName = (name: string) => name.replace(/\.[a-z0-9]{2,5}$/i, '').trim() || name
