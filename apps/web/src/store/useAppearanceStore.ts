import { create } from 'zustand'
import { applyAppearance } from '@/lib/appearance'
import { saveState } from '@/lib/repo'
import { DEFAULT_APPEARANCE } from '@/types/appearance'
import type { Appearance,BackgroundValue, BubbleStyle, IconValue } from '@/types/appearance'
import type { ScreenId } from '@/store/useAppStore'

type Section = 'appIcon' | 'frame' | 'homeBackground' | 'chatBackground' | 'momentsBackground' | 'bubble'

interface AppearanceState {
  appearance: Appearance
  /** 启动时由 bootstrap 注入 */
  hydrate: (a: Appearance) => void

  setIcon: (section: 'appIcon' | 'frame', v: IconValue) => void
  setBackground: (
    section: 'homeBackground' | 'chatBackground' | 'momentsBackground',
    patch: Partial<BackgroundValue>,
  ) => void
  setBubble: (patch: Partial<BubbleStyle>) => void
  setEntryIcon: (screen: ScreenId, v: IconValue) => void
  resetEntryIcon: (screen: ScreenId) => void
  /** 主界面那句话（两颗心上面那段） */
  setHomeNote: (note: string) => void
  /** 照片墙：换第 i 张图（空字符串 = 清掉） */
  setPhoto: (index: number, url: string) => void
  /** 照片墙：拖动后落位置（x / y 是百分比偏移） */
  movePhoto: (index: number, x: number, y: number) => void
  /** 点一下某张 → 拿到最上层 */
  bringPhotoFront: (index: number) => void
  resetPhotos: () => void
  resetAll: () => void
}

/** 改动 → 写 CSS 变量 → 落本地（防抖，避免拖滑块时狂写库） */
let persistTimer: ReturnType<typeof setTimeout> | undefined
function commit(next: Appearance, set: (a: Appearance) => void) {
  applyAppearance(next)
  set(next)
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    void saveState({ appearance: next })
  }, 350)
}

export const useAppearanceStore = create<AppearanceState>((setState, get) => {
  const next = (patch: Partial<Appearance>) => ({ ...get().appearance, ...patch })

  return {
    appearance: DEFAULT_APPEARANCE,
    hydrate: (a) => {
      applyAppearance(a)
      setState({ appearance: a })
    },

    setIcon: (section, v) => {
      const n = next({ [section]: v } as Partial<Appearance>)
      commit(n, (a) => setState({ appearance: a }))
    },

    setBackground: (section, patch) => {
      const cur = get().appearance[section]
      const n = next({ [section]: { ...cur, ...patch } } as Partial<Appearance>)
      commit(n, (a) => setState({ appearance: a }))
    },

    setBubble: (patch) => {
      const n = next({ bubble: { ...get().appearance.bubble, ...patch } })
      commit(n, (a) => setState({ appearance: a }))
    },

    setEntryIcon: (screen, v) => {
      const n = next({ entryIcons: { ...get().appearance.entryIcons, [screen]: v } })
      commit(n, (a) => setState({ appearance: a }))
    },

    resetEntryIcon: (screen) => {
      const entryIcons = { ...get().appearance.entryIcons }
      delete entryIcons[screen]
      const n = next({ entryIcons })
      commit(n, (a) => setState({ appearance: a }))
    },

    setHomeNote: (note) => {
      commit(next({ homeNote: note }), (a) => setState({ appearance: a }))
    },

    setPhoto: (index, url) => {
      const photos = photosOf(get().appearance).map((p, i) => (i === index ? { ...p, url } : p))
      commit(next({ photos }), (a) => setState({ appearance: a }))
    },

    movePhoto: (index, x, y) => {
      const photos = photosOf(get().appearance).map((p, i) => (i === index ? { ...p, x, y } : p))
      commit(next({ photos }), (a) => setState({ appearance: a }))
    },

    bringPhotoFront: (index) => {
      const list = photosOf(get().appearance)
      const max = Math.max(0, ...list.map((p) => p.z))
      const photos = list.map((p, i) => (i === index ? { ...p, z: max + 1 } : p))
      commit(next({ photos }), (a) => setState({ appearance: a }))
    },

    resetPhotos: () => {
      const photos = DEFAULT_APPEARANCE.photos.map((p) => ({ ...p }))
      commit(next({ photos }), (a) => setState({ appearance: a }))
    },

    resetAll: () => commit(DEFAULT_APPEARANCE, (a) => setState({ appearance: a })),
  }
})

/** 老数据可能没有 photos / 不足三张 → 补成三张，别让主界面少一块 */
export function photosOf(a: Appearance) {
  const base = (a.photos?.length ? a.photos : DEFAULT_APPEARANCE.photos).slice(0, 3)
  while (base.length < 3) base.push({ ...DEFAULT_APPEARANCE.photos[base.length] })
  return base
}

/** 供非组件代码（设置页）读取当前 section 名 —— 保持类型收敛 */
export type AppearanceSection = Section
