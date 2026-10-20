import { create } from 'zustand'
import { cardHash, defaultCards, makeCard } from '@/lib/cards'
import { pullCards, saveCards } from '@/lib/repo'
import type { Card, CardLibType, CardSource } from '@/types/cards'

export type SourceFilter = CardSource | 'ALL'
export type TypeFilter = CardLibType | 'ALL'

interface CardsState {
  cards: Card[]
  /** 每次保存 +1（对应后端 PUT /cards） */
  version: number
  /** 是否已从本地/远端注入过 */
  hydrated: boolean

  /* 筛选 */
  source: SourceFilter
  type: TypeFilter
  q: string
  setSource: (s: SourceFilter) => void
  setType: (t: TypeFilter) => void
  setQ: (q: string) => void

  /* 底部抽屉 */
  editing: Card | null
  editOpen: boolean
  importOpen: boolean
  openEdit: (card?: Card) => void
  closeEdit: () => void
  setImportOpen: (v: boolean) => void

  hydrate: (cards: Card[], version: number) => void
  /** 首次启动：把预设卡落库（传 remoteChecked 表示调用方刚确认过远端没有卡库，省一次请求） */
  seedIfEmpty: (opts?: { remoteChecked?: boolean }) => Promise<void>
  upsert: (card: Card) => void
  remove: (id: string) => void
  toggle: (id: string) => void
  setWeight: (id: string, weight: number) => void
  /** 导入：批量新增（文字类） */
  addMany: (items: { text: string; type: CardLibType; category?: string }[]) => number
  updateMany: (ids: string[], patch: Partial<Card>) => void
  removeMany: (ids: string[]) => void
  /** 恢复系统预设（保留自定义与拾取） */
  resetPresets: () => void
  /** 引擎使用一次（统计用） */
  markUsed: (id: string) => void
  /** 拾取：把我聊过的话收成字卡（去重），返回是否新增 */
  addPicked: (text: string) => boolean
}

/** 改动 → 更新内存 → 写本地 + 推后端（防抖，避免拖滑块时狂写） */
let persistTimer: ReturnType<typeof setTimeout> | undefined
export const useCardsStore = create<CardsState>((setState, get) => {
  const commit = (next: Card[]) => {
    const version = get().version + 1
    setState({ cards: next, version })
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => void saveCards(next, version), 350)
  }

  const patchOne = (id: string, patch: Partial<Card>) =>
    commit(get().cards.map((c) => (c.id === id ? { ...c, ...patch } : c)))

  return {
    cards: [],
    version: 0,
    hydrated: false,

    source: 'ALL',
    type: 'ALL',
    q: '',
    setSource: (source) => setState({ source }),
    setType: (type) => setState({ type }),
    setQ: (q) => setState({ q }),

    editing: null,
    editOpen: false,
    importOpen: false,
    openEdit: (card) => setState({ editing: card ?? null, editOpen: true }),
    closeEdit: () => setState({ editOpen: false, editing: null }),
    setImportOpen: (importOpen) => setState({ importOpen }),

    hydrate: (cards, version) => setState({ cards, version, hydrated: true }),

    /**
     * 首次启动：把预设卡落库（id 才稳定，也能同步给后端）。
     *
     * ⚠️ 只在「本地没存过卡 **且远端也没有卡库**」时才写。
     * 以前是无条件先落库 —— 换台设备第一次打开（比如手机上新域名 = 空 IndexedDB）时，
     * 内存里那套预设卡会带着新生成的 id 整包 PUT 上去，把服务端已有的卡库覆盖掉
     * （useCount、自定义卡、拾取卡全没了）。所以先问一次远端。
     */
    seedIfEmpty: async (opts) => {
      const { cards, version } = get()
      if (version > 0 || cards.length === 0) return
      if (!opts?.remoteChecked) {
        const remote = await pullCards()
        if (get().version > 0) return // 等远端这段时间里已经同步落地了
        if (remote?.cards.length) {
          setState({ cards: remote.cards, version: remote.version, hydrated: true })
          return
        }
      }
      setState({ version: 1 })
      await saveCards(cards, 1)
    },

    upsert: (card) => {
      const exists = get().cards.some((c) => c.id === card.id)
      commit(exists ? get().cards.map((c) => (c.id === card.id ? card : c)) : [...get().cards, card])
    },

    remove: (id) => commit(get().cards.filter((c) => c.id !== id)),
    toggle: (id) => {
      const c = get().cards.find((x) => x.id === id)
      if (c) patchOne(id, { enabled: !c.enabled })
    },
    setWeight: (id, weight) => patchOne(id, { weight }),

    addMany: (items) => {
      const created = items.map((it) =>
        makeCard({
          type: it.type,
          source: 'CUSTOM',
          text: it.text,
          category: it.category,
          tags: it.category ? [it.category] : [],
          noFreeSentence: false,
        }),
      )
      if (created.length) commit([...get().cards, ...created])
      return created.length
    },

    updateMany: (ids, patch) => {
      const idset = new Set(ids)
      commit(get().cards.map((c) => (idset.has(c.id) ? { ...c, ...patch } : c)))
    },
    removeMany: (ids) => {
      const idset = new Set(ids)
      commit(get().cards.filter((c) => !idset.has(c.id)))
    },

    resetPresets: () => {
      const keep = get().cards.filter((c) => c.source !== 'SYSTEM')
      commit([...defaultCards().filter((c) => c.source === 'SYSTEM'), ...keep])
    },

    markUsed: (id) =>
      patchOne(id, { useCount: (get().cards.find((c) => c.id === id)?.useCount ?? 0) + 1, lastUsedAt: new Date().toISOString() }),

    /** 拾取（引擎反向抽签命中时）：把我聊过的话收成一张他的字卡，同内容不重复收 */
    addPicked: (text) => {
      const clean = text.trim()
      if (clean.length < 2) return false
      const hash = cardHash({ text: clean })
      if (get().cards.some((c) => c.hash === hash)) return false
      commit([
        ...get().cards,
        makeCard({ type: 'TEXT', source: 'PICKED', text: clean, category: '拾取', tags: ['拾取'] }),
      ])
      return true
    },
  }
})
