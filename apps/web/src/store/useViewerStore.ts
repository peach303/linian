import { create } from 'zustand'
import type { DoodleStroke } from '@/types'

/**
 * 全屏看图 / 看涂鸦。
 *
 * 图片来自聊天 / 朋友圈 / 信箱，点一下把原图铺到屏幕上；
 * 表情包不接这个入口（它本来就要保持小尺寸、直接发出去）。
 * 涂鸦不是图片：存的是笔画，所以放大时重新用 SVG 画一遍，不会糊。
 */
export interface ViewerItem {
  kind: 'image' | 'doodle'
  src?: string
  alt?: string
  strokes?: DoodleStroke[]
  ratio?: number
}

interface ViewerState {
  item: ViewerItem | null
  openImage: (src: string, alt?: string) => void
  openDoodle: (payload: { strokes?: DoodleStroke[]; ratio?: number }) => void
  close: () => void
}

export const useViewerStore = create<ViewerState>((set) => ({
  item: null,
  openImage: (src, alt) => {
    if (src) set({ item: { kind: 'image', src, alt } })
  },
  openDoodle: (payload) => {
    if (payload.strokes?.length) {
      set({ item: { kind: 'doodle', strokes: payload.strokes, ratio: payload.ratio ?? 4 / 3 } })
    }
  },
  close: () => set({ item: null }),
}))
