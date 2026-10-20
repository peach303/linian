/**
 * 真播放器（一个 `<video>` 单例）—— 观影室用
 *
 * 只做一件事：把「本机视频文件 / 视频直链」放出来 —— 进度、时长、音量、seek 都是真的。
 * B 站的片子不经过这里（用官方 iframe 播放器播），只有片名的也不经过这里（播不了就明说）。
 *
 * 本机文件从 IndexedDB 取 Blob → `URL.createObjectURL`，换片时 revoke，不堆内存。
 */
import { readWatchVideo } from './repo'
import { watchPlayKind } from './watch'
import type { WatchItem } from '@/types'

export interface VideoState {
  itemId?: string
  playing: boolean
  loading: boolean
  /** 播放位置（秒） */
  position: number
  /** 总长（秒）；0 = 还不知道 */
  duration: number
  /** 播不了的原因（文件不在本机 / 链接失效 / 浏览器拦了自动播放 / 格式不认） */
  error?: string
}

let video: HTMLVideoElement | null = null
let objectUrl: string | null = null
let state: VideoState = { playing: false, loading: false, position: 0, duration: 0 }
const subs = new Set<(s: VideoState) => void>()

const emit = (patch: Partial<VideoState>) => {
  state = { ...state, ...patch }
  subs.forEach((fn) => fn(state))
}

export const videoState = () => state
export const onVideo = (fn: (s: VideoState) => void) => {
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

function el(): HTMLVideoElement {
  if (video) return video
  const v = document.createElement('video')
  v.preload = 'metadata'
  v.playsInline = true
  v.className = 'h-full w-full bg-black object-contain'
  video = v
  v.addEventListener('timeupdate', () => emit({ position: v.currentTime }))
  v.addEventListener('loadedmetadata', () => emit({ duration: Number.isFinite(v.duration) ? v.duration : 0, loading: false }))
  v.addEventListener('play', () => emit({ playing: true, error: undefined }))
  v.addEventListener('pause', () => emit({ playing: false }))
  v.addEventListener('ended', () => emit({ playing: false, position: v.duration || 0 }))
  v.addEventListener('waiting', () => emit({ loading: true }))
  v.addEventListener('canplay', () => emit({ loading: false }))
  v.addEventListener('error', () =>
    emit({ playing: false, loading: false, error: '这部播不了（文件不在这台设备上，或链接 / 格式不受支持）' }),
  )
  return v
}

/** 把 `<video>` 挂到页面上（播放器区是它唯一的家） */
export function mountVideo(container: HTMLElement | null) {
  const v = el()
  if (!container) {
    if (v.parentElement) v.parentElement.removeChild(v)
    return
  }
  if (v.parentElement !== container) container.appendChild(v)
}

/** 载入一部片（不自动播）。本机文件先取 Blob，取不到就明说 */
export async function loadWatchItem(item: WatchItem): Promise<void> {
  const v = el()
  v.pause()
  releaseUrl()
  emit({ itemId: item.id, playing: false, loading: true, error: undefined, position: 0, duration: 0 })

  const kind = watchPlayKind(item)
  if (kind !== 'video') {
    v.removeAttribute('src')
    emit({ loading: false, error: kind === 'iframe' ? undefined : '这部只有片名，没有视频' })
    return
  }

  let src = ''
  if (item.source.kind === 'url') {
    src = item.source.url ?? ''
  } else if (item.source.kind === 'local') {
    const blob = item.source.blobKey ? await readWatchVideo(item.source.blobKey) : undefined
    if (!blob) {
      v.removeAttribute('src')
      emit({ loading: false, error: '文件不在这台设备上（换设备后要重新导入）' })
      return
    }
    objectUrl = URL.createObjectURL(blob)
    src = objectUrl
  }
  if (!src) {
    emit({ loading: false, error: '这部没有可播的地址' })
    return
  }

  v.src = src
  v.load()
}

export async function playVideo(): Promise<void> {
  const v = el()
  if (!v.src) return
  try {
    await v.play()
  } catch {
    emit({ playing: false, error: '浏览器拦了自动播放 —— 点一下播放键' })
  }
}

/** 播一部片（从头 / 从指定秒数接着看） */
export async function playWatchItem(item: WatchItem, at = 0): Promise<void> {
  await loadWatchItem(item)
  if (at > 0) seekVideo(at)
  await playVideo()
}

export const pauseVideo = () => el().pause()

export function seekVideo(sec: number) {
  const v = el()
  if (!v.src && !v.currentTime) return
  const max = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : sec
  v.currentTime = Math.max(0, Math.min(sec, max))
  emit({ position: v.currentTime })
}

export const toggleFullscreen = (on: boolean) => {
  const v = el()
  if (on) void v.requestFullscreen?.().catch(() => undefined)
  else if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined)
}

/** 停下来并释放（离开房间时用） */
export function stopVideo() {
  if (!video) return
  video.pause()
  releaseUrl()
  video.removeAttribute('src')
  emit({ itemId: undefined, playing: false, loading: false, position: 0, duration: 0 })
}
