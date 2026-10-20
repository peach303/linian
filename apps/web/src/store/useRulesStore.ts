import { create } from 'zustand'
import { DEFAULT_RULES, diffCount, getAtPath, setAtPath } from '@/lib/rules'
import { simulateReply, type SimResult } from '@/lib/simulate'
import { isOnline, saveRules } from '@/lib/repo'
import type { RuleConfig } from '@/types/rules'

interface RulesState {
  /** 正在编辑的草稿 */
  draft: RuleConfig
  /** 已保存的版本（用于算差异） */
  saved: RuleConfig
  /** 服务端版本号 */
  version: number
  saving: boolean
  lastSavedAt: string | null
  online: boolean
  activeGroup: string
  simOpen: boolean
  sim: SimResult | null

  /** 启动时由 bootstrap 注入本地/远端规则 */
  hydrate: (rules: RuleConfig, version: number) => void

  setGroup: (key: string) => void
  update: (path: string, value: unknown) => void
  /** 概率项的开关（关掉时保留 p，重新打开即恢复原值） */
  toggleEnabled: (path: string, enabled: boolean) => void
  resetGroup: (keys: string[]) => void
  resetAll: () => void
  save: () => Promise<void>
  runSim: () => void
  closeSim: () => void
  dirty: () => number
}

export const useRulesStore = create<RulesState>((setState, get) => ({
  draft: structuredClone(DEFAULT_RULES),
  saved: structuredClone(DEFAULT_RULES),
  version: 1,
  saving: false,
  lastSavedAt: null,
  online: false,
  activeGroup: 'chat',
  simOpen: false,
  sim: null,

  hydrate: (rules, version) =>
    setState({
      draft: structuredClone(rules),
      saved: structuredClone(rules),
      version,
      online: isOnline(),
    }),

  setGroup: (key) => setState({ activeGroup: key }),

  update: (path, value) => setState((st) => ({ draft: setAtPath(st.draft, path, value) })),

  toggleEnabled: (path, enabled) =>
    setState((st) => {
      const cur = getAtPath(st.draft, path) as { enabled?: boolean; p?: number }
      const next = { ...(cur as object), enabled } as { enabled: boolean; p?: number }
      return { draft: setAtPath(st.draft, path, next) }
    }),

  resetGroup: (keys) =>
    setState((st) => {
      let next = st.draft
      for (const k of keys) {
        const def = getAtPath(DEFAULT_RULES, k)
        if (def !== undefined) next = setAtPath(next, k, def)
      }
      return { draft: next }
    }),

  resetAll: () => setState({ draft: structuredClone(DEFAULT_RULES) }),

  /**
   * 保存：写本地（IndexedDB）→ 推后端 PUT /api/v1/rules。
   * 后端会 zod 全量校验 + 新增一个 version 并置为 active（见 modules/rules/rules.service.ts）。
   * 推不上去就排队，联网后由 startSyncLoop 补发。
   */
  save: async () => {
    const { draft, version } = get()
    setState({ saving: true })
    const nextVersion = version + 1
    await saveRules(draft, nextVersion)
    setState({
      saved: structuredClone(draft),
      version: nextVersion,
      saving: false,
      lastSavedAt: new Date().toISOString(),
      online: isOnline(),
    })
  },

  runSim: () => setState((st) => ({ sim: simulateReply(st.draft), simOpen: true })),
  closeSim: () => setState({ simOpen: false }),

  dirty: () => diffCount(get().saved, get().draft),
}))
