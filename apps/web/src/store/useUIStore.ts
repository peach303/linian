import { create } from 'zustand'

/**
 * 只跟这台设备有关的界面偏好（不进 state / 不同步）
 *
 * 为什么单独放：音乐小窗开不开是「这台手机想不想要」的事，
 * 换设备后各自决定就好，没必要跟着聊天记录一起同步。
 */
const KEY = 'linian:ui:v1'

interface Prefs {
  /** 音乐悬浮窗：默认开 */
  musicMini: boolean
}

function load(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>
    return { musicMini: raw.musicMini !== false }
  } catch {
    return { musicMini: true }
  }
}

interface UIState extends Prefs {
  setMusicMini: (v: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  ...load(),
  setMusicMini: (v) => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ musicMini: v }))
    } catch {
      /* 隐私模式写不进去也不影响本次使用 */
    }
    set({ musicMini: v })
  },
}))
