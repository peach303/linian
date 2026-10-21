/**
 * 真播放器（一个 `<audio>` 单例）
 *
 * 只做一件事：把「本机文件 / 音频直链 / 网易云代理音频流」放出来 —— 进度、时长、音量、seek 都是真的。
 * 旧网易云记录（没有代理音频流）走官方外链播放器；只有歌名的曲目不经过这里（播不了就明说）。
 *
 * 本机文件从 IndexedDB 取 Blob → `URL.createObjectURL`，用完 revoke，不堆内存。
 */
import { readAudioFile } from './repo'
import { playableKind } from './music'
import type { Track } from '@/types'

export interface PlayerState {
  trackId?: string
  playing: boolean
  loading: boolean
  /** 播放位置（秒） */
  position: number
  /** 总长（秒）；0 = 还不知道 */
  duration: number
  /** 播不了的原因（文件不在本机 / 链接失效 / 浏览器拦了自动播放） */
  error?: string
}

let audio: HTMLAudioElement | null = null
let objectUrl: string | null = null
let currentTrack: Track | null = null
/** 网易云代理/镜像失败后，按顺序再试的地址 */
let fallbackQueue: string[] = []
let state: PlayerState = { playing: false, loading: false, position: 0, duration: 0 }
const subs = new Set<(s: PlayerState) => void>()

const emit = (patch: Partial<PlayerState>) => {
  state = { ...state, ...patch }
  subs.forEach((fn) => fn(state))
}

export const playerState = () => state
export const onPlayer = (fn: (s: PlayerState) => void) => {
  subs.add(fn)
  return () => {
    subs.delete(fn)
  }
}

function releaseUrl() {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl)
    objectUrl = null
  }
}

function el(): HTMLAudioElement {
  if (audio) return audio
  const a = new Audio()
  a.preload = 'metadata'
  audio = a
  a.addEventListener('timeupdate', () => emit({ position: a.currentTime }))
  a.addEventListener('loadedmetadata', () =>
    emit({ duration: Number.isFinite(a.duration) ? a.duration : 0, loading: false }),
  )
  a.addEventListener('play', () => emit({ playing: true, error: undefined }))
  a.addEventListener('pause', () => emit({ playing: false }))
  a.addEventListener('ended', () => emit({ playing: false, position: a.duration || 0 }))
  a.addEventListener('waiting', () => emit({ loading: true }))
  a.addEventListener('canplay', () => emit({ loading: false }))
  a.addEventListener('error', () => {
    // 网易云：代理镜像不通时，再让浏览器直连一次官方外链
    const next = fallbackQueue.shift()
    if (next) {
      const wasPlaying = state.playing
      a.src = next
      a.load()
      if (wasPlaying) void a.play().catch(() => emit({ playing: false }))
      return
    }
    emit({
      playing: false,
      loading: false,
      error:
        currentTrack?.source.kind === 'netease'
          ? '这首网易云播不了（可能版权 / VIP / 地区受限）'
          : '这首播不了（文件不在这台设备上，或链接失效）',
    })
  })
  return a
}

/** 载入一首（不自动播）。本机文件先取 Blob，取不到就明说 */
export async function loadTrack(track: Track): Promise<void> {
  const a = el()
  currentTrack = track
  a.pause()
  releaseUrl()
  emit({ trackId: track.id, playing: false, loading: true, error: undefined, position: 0, duration: 0 })

  const kind = playableKind(track)
  if (kind !== 'audio') {
    fallbackQueue = []
    a.removeAttribute('src')
    emit({ loading: false, error: kind === 'netease' ? undefined : '这首只有歌名，没有音频' })
    return
  }

  let src = ''
  if (track.source.kind === 'url') {
    fallbackQueue = []
    src = track.source.url
  } else if (track.source.kind === 'netease') {
    src = track.source.streamUrl ?? ''
    fallbackQueue = track.source.fallbackUrl ? [track.source.fallbackUrl] : []
    if (!src) {
      a.removeAttribute('src')
      emit({ loading: false, error: undefined })
      return
    }
  } else if (track.source.kind === 'local') {
    fallbackQueue = []
    const blob = await readAudioFile(track.source.blobKey)
    if (!blob) {
      a.removeAttribute('src')
      emit({ loading: false, error: '文件不在这台设备上（换设备后要重新导入）' })
      return
    }
    objectUrl = URL.createObjectURL(blob)
    src = objectUrl
  }

  a.src = src
  a.load()
}

export async function play(): Promise<void> {
  const a = el()
  if (!a.src) return
  try {
    await a.play()
  } catch {
    emit({ playing: false, error: '浏览器拦了自动播放 —— 点一下播放键' })
  }
}

/** 播一首（从头 / 从指定秒数） */
export async function playTrack(track: Track, at = 0): Promise<void> {
  await loadTrack(track)
  if (at > 0) seek(at)
  await play()
}

export const pause = () => el().pause()

export function seek(sec: number) {
  const a = el()
  if (!a.src && !a.currentTime) return
  const max = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : sec
  a.currentTime = Math.max(0, Math.min(sec, max))
  emit({ position: a.currentTime })
}

export function setVolume(v: number) {
  el().volume = Math.max(0, Math.min(1, v))
}

/** 停下来并释放（离开房间时用） */
export function stop() {
  if (!audio) return
  audio.pause()
  releaseUrl()
  audio.removeAttribute('src')
  currentTrack = null
  fallbackQueue = []
  emit({ trackId: undefined, playing: false, loading: false, position: 0, duration: 0 })
}
