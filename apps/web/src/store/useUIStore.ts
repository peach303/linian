import { create } from 'zustand'

/**
 * 只跟这台设备有关的界面偏好（不进 state / 不同步）
 *
 * 为什么单独放：音乐小窗开不开、要不要消息通知，是「这台手机想不想要」的事，
 * 换设备后各自决定就好，没必要跟着聊天记录一起同步。
 */
const KEY = 'linian:ui:v1'

interface Prefs {
  /** 音乐悬浮窗：默认开 */
  musicMini: boolean
  /** 收到他的消息时弹通知：默认开；浏览器权限要用户点一下才给 */
  messageNotify: boolean
  /** 聊天后台保活：默认关；开了会放一段几乎无声的音频，尽量让标签页不被冻结 */
  backgroundKeepAlive: boolean
}

function load(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>
    return {
      musicMini: raw.musicMini !== false,
      messageNotify: raw.messageNotify !== false,
      backgroundKeepAlive: raw.backgroundKeepAlive === true,
    }
  } catch {
    return { musicMini: true, messageNotify: true, backgroundKeepAlive: false }
  }
}

interface UIState extends Prefs {
  setMusicMini: (v: boolean) => void
  setMessageNotify: (v: boolean) => void
  setBackgroundKeepAlive: (v: boolean) => void
}

function persist(patch: Partial<Prefs>) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...load(), ...patch }))
  } catch {
    /* 隐私模式写不进去也不影响本次使用 */
  }
}

export const useUIStore = create<UIState>((set) => ({
  ...load(),
  setMusicMini: (v) => {
    persist({ musicMini: v })
    set({ musicMini: v })
  },
  setMessageNotify: (v) => {
    persist({ messageNotify: v })
    set({ messageNotify: v })
  },
  setBackgroundKeepAlive: (v) => {
    persist({ backgroundKeepAlive: v })
    set({ backgroundKeepAlive: v })
  },
}))
