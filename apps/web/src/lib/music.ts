import { API_BASE } from '@/lib/deploy'
import type { MusicPayload, Track } from '@/types'

/**
 * 歌单 / 一起听
 *
 * 三种来源，各播各的：
 *  - `local`  本机音频文件（mp3 / flac / m4a / wav…）→ `<audio>` 真播，进度、音量都在我们手里
 *  - `url`    音频直链 → 同上
 *  - `netease` 网易云 → 用**官方外链播放器**（outchain）嵌进来播，进度以它自己的控件为准
 *
 * 网易云没有公开 API，登录态和版权曲库都在他们服务器上 ——
 * 所以这里只做「把官方的播放器嵌进来」，不碰音频流，也不假装拿到了音频。
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
  if (/^\d{4,}$/.test(s)) return s
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

/** 网易云曲目的展示封面（没有就退回 emoji） */
export const neteaseCoverEmoji = '🎧'

export interface ResolvedSong {
  songId: string
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

/** 能不能真的出声（本机文件 / 直链可以；网易云交给官方播放器；只有歌名的播不了） */
export const playableKind = (t: Track): 'audio' | 'netease' | 'none' => {
  if (t.source.kind === 'netease') return 'netease'
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
