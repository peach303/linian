/**
 * 通话 / 一起听时的「尽力保活」
 *
 * 先把话说清楚：**网页没有真正的系统级后台保活**。
 * 安卓 / iOS 都会在内存紧张、省电模式、切后台太久时冻结或回收标签页 ——
 * 只有原生 App（前台服务）才能保证不被杀。这里做的是网页能做到的四件事，全部是真的：
 *
 *   ① Wake Lock：通话时屏幕不休眠（页面可见时才有效）
 *   ② 静音音频：让浏览器把这一页当成「正在播放」，切后台后不容易被立刻挂起
 *      （安卓 Chrome 会保留音频会话；iOS 在锁屏后也可能继续）
 *   ③ Media Session：锁屏 / 通知栏显示「和 XX 通话中」，可以直接挂断；
 *      音乐则显示歌名，能播放 / 暂停 / 上一首 / 下一首
 *   ④ 时间戳补齐：所有时长都按 Date.now() 算，后台定时器被节流也不会少算
 *
 * 所以「切后台再回来，通话还在」大概率成立；「被系统杀掉之后还能继续」不可能。
 * 界面文案不要承诺做不到的事。
 */

let wakeLock: WakeLockSentinel | null = null
let silent: HTMLAudioElement | null = null
let silentUrl = ''

/* ───────────────────────── Wake Lock ───────────────────────── */

async function acquireWakeLock() {
  try {
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<WakeLockSentinel> } }).wakeLock
    if (!wl) return
    wakeLock = await wl.request('screen')
    wakeLock.addEventListener('release', () => {
      wakeLock = null
    })
  } catch {
    /* 不支持 / 被省电模式拒绝：不影响通话本身 */
  }
}

async function releaseWakeLock() {
  try {
    await wakeLock?.release()
  } catch {
    /* 已经释放了 */
  }
  wakeLock = null
}

/* ───────────────────────── 静音音频 ───────────────────────── */

/** 生成 1 秒静音 wav（44.1kHz / 单声道 / 16bit） */
function silentWav(): string {
  if (silentUrl) return silentUrl
  const rate = 44100
  const samples = rate
  const bytes = 44 + samples * 2
  const buf = new ArrayBuffer(bytes)
  const view = new DataView(buf)
  const str = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }
  str(0, 'RIFF')
  view.setUint32(4, bytes - 8, true)
  str(8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  str(36, 'data')
  view.setUint32(40, samples * 2, true)
  silentUrl = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))
  return silentUrl
}

async function startSilent() {
  if (silent) return
  try {
    const a = new Audio(silentWav())
    a.loop = true
    a.volume = 0.001
    silent = a
    await a.play()
  } catch {
    silent = null
  }
}

function stopSilent() {
  if (!silent) return
  silent.pause()
  silent.removeAttribute('src')
  silent = null
}

/* ───────────────────────── Media Session ───────────────────────── */

export interface MediaHandlers {
  play?: () => void
  pause?: () => void
  next?: () => void
  prev?: () => void
  stop?: () => void
  hangup?: () => void
}

export function setMedia(meta: { title: string; artist?: string; artwork?: string }, handlers: MediaHandlers = {}) {
  const ms = navigator.mediaSession
  if (!ms) return
  try {
    ms.metadata = new MediaMetadata({
      title: meta.title,
      artist: meta.artist ?? '',
      artwork: meta.artwork && /^(https?:|data:|blob:)/.test(meta.artwork) ? [{ src: meta.artwork, sizes: '512x512' }] : [],
    })
    ms.playbackState = 'playing'
  } catch {
    /* 旧浏览器没有 MediaMetadata */
  }
  const bind = (action: MediaSessionAction, fn?: () => void) => {
    try {
      ms.setActionHandler(action, fn ? () => fn() : null)
    } catch {
      /* 这个动作不支持就跳过 */
    }
  }
  bind('play', handlers.play)
  bind('pause', handlers.pause)
  bind('nexttrack', handlers.next)
  bind('previoustrack', handlers.prev)
  bind('stop', handlers.stop)
  // 'hangup' 是新动作，TS 的 lib.dom 还没跟上；浏览器不认识会自己 throw，被 bind 吃掉
  bind('hangup' as MediaSessionAction, handlers.hangup)
}

export function clearMedia() {
  const ms = navigator.mediaSession
  if (!ms) return
  try {
    ms.metadata = null
    ms.playbackState = 'none'
  } catch {
    /* ignore */
  }
}

/** 锁屏上的播放 / 暂停状态（音乐用；通话一直是 playing） */
export function setMediaPlaying(playing: boolean) {
  try {
    if (navigator.mediaSession) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'
  } catch {
    /* ignore */
  }
}

/* ───────────────────────── 对外 ───────────────────────── */

/**
 * 开始保活（通话 / 音乐都走这里）
 * `kind` 只影响文案与 Media Session 的动作绑定。
 */
export async function startKeepAlive(meta: { title: string; artist?: string; artwork?: string }, handlers: MediaHandlers = {}) {
  setMedia(meta, handlers)
  await Promise.all([acquireWakeLock(), startSilent()])
}

/** 更新锁屏上的信息（通话计时 / 换歌） */
export function updateMedia(meta: { title: string; artist?: string; artwork?: string }) {
  const ms = navigator.mediaSession
  if (!ms) return
  try {
    ms.metadata = new MediaMetadata({
      title: meta.title,
      artist: meta.artist ?? '',
      artwork: meta.artwork && /^(https?:|data:|blob:)/.test(meta.artwork) ? [{ src: meta.artwork, sizes: '512x512' }] : [],
    })
  } catch {
    /* ignore */
  }
}

export function stopKeepAlive() {
  stopSilent()
  void releaseWakeLock()
  clearMedia()
}

/* 回到前台时重新申请 Wake Lock（切后台会被系统自动释放） */
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && silent) void acquireWakeLock()
  })
}
