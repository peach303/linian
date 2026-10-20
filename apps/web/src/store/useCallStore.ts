import { create } from 'zustand'

/**
 * 通话界面状态（只服务 UI）
 *
 * 通话本身是一条 CALL_EVENT 消息，落库的是**结果**（接通 / 未接 / 时长）；
 * 这里只存「现在屏幕上是哪个阶段」，刷新后由 `lib/engine/call.ts` 收尾，不会卡在半路。
 *
 * `minimized` 是「小窗」：接通后可以收成一个小浮窗，去别的页面逛、通话不断；
 * 页面切走时（App 里）也会自动收起，回来点一下展开。
 */
export interface LiveCall {
  messageId: string
  phase: 'CALLING' | 'TALKING'
  /** 当前阶段的起点（毫秒），用来跳秒表 */
  since: number
  minimized: boolean
}

interface CallUIState {
  live: LiveCall | null
  begin: (messageId: string, now?: number) => void
  answer: (now?: number) => void
  minimize: () => void
  restore: () => void
  end: () => void
}

export const useCallStore = create<CallUIState>((set) => ({
  live: null,
  begin: (messageId, now = Date.now()) =>
    set({ live: { messageId, phase: 'CALLING', since: now, minimized: false } }),
  answer: (now = Date.now()) =>
    set((st) => (st.live ? { live: { ...st.live, phase: 'TALKING', since: now } } : st)),
  minimize: () => set((st) => (st.live ? { live: { ...st.live, minimized: true } } : st)),
  restore: () => set((st) => (st.live ? { live: { ...st.live, minimized: false } } : st)),
  end: () => set({ live: null }),
}))
