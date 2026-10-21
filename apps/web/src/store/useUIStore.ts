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
  /** 声音总开关。关掉后下面六项都不响。 */
  sfxMaster: boolean
  /** 他打来的来电铃声 */
  sfxIncomingCall: boolean
  /** 我打给他的回铃音 */
  sfxOutgoingCall: boolean
  /** 他发消息的提示音 */
  sfxHisMessage: boolean
  /** 我发消息的提示音 */
  sfxMyMessage: boolean
  /** 他拍一拍的提示音 */
  sfxHisPat: boolean
  /** 我拍一拍的提示音 */
  sfxMyPat: boolean
}

function load(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>
    return {
      musicMini: raw.musicMini !== false,
      messageNotify: raw.messageNotify !== false,
      backgroundKeepAlive: raw.backgroundKeepAlive === true,
      sfxMaster: raw.sfxMaster !== false,
      sfxIncomingCall: raw.sfxIncomingCall !== false,
      sfxOutgoingCall: raw.sfxOutgoingCall !== false,
      sfxHisMessage: raw.sfxHisMessage !== false,
      // 自己发消息的提示音默认关：很多人只想要「他来了」的动静。
      sfxMyMessage: raw.sfxMyMessage === true,
      sfxHisPat: raw.sfxHisPat !== false,
      sfxMyPat: raw.sfxMyPat !== false,
    }
  } catch {
    return {
      musicMini: true,
      messageNotify: true,
      backgroundKeepAlive: false,
      sfxMaster: true,
      sfxIncomingCall: true,
      sfxOutgoingCall: true,
      sfxHisMessage: true,
      sfxMyMessage: false,
      sfxHisPat: true,
      sfxMyPat: true,
    }
  }
}

interface UIState extends Prefs {
  setMusicMini: (v: boolean) => void
  setMessageNotify: (v: boolean) => void
  setBackgroundKeepAlive: (v: boolean) => void
  setSfx: (key: keyof SoundPrefs, v: boolean) => void
}

export type SoundPrefs = Pick<
  Prefs,
  'sfxMaster' | 'sfxIncomingCall' | 'sfxOutgoingCall' | 'sfxHisMessage' | 'sfxMyMessage' | 'sfxHisPat' | 'sfxMyPat'
>

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
  setSfx: (key, v) => {
    persist({ [key]: v })
    set({ [key]: v } as Partial<UIState>)
  },
}))
