/**
 * 备份：导出 / 导入（设置 → 数据 → 导入 / 导出）
 *
 * 想解决的问题：聊天记录、字卡库、朋友圈、信件这些都在**本机 IndexedDB**（外加一份在服务端），
 * 换设备 / 换一个部署地址时没有任何搬家的办法。这里给一个「全量 JSON」：
 *
 *   导出 = 把本地这份（设置 + 规则 + 字卡 + 聊天记录）打包下载
 *   导入 = 写回本机 + 推给后端；聊天记录和字卡是**合并**（按 id / hash 去重，不会把你新收的删掉），
 *          设置和概率规则是**覆盖**（备份就是一份快照）
 *
 * 不含什么（有意为之）：
 *   · MiniMax / 博查 的 Key —— Key 只在服务端，**永远不进备份文件**
 *   · 一起听的音频、观影的视频、书的正文本体 —— 这些是 IndexedDB 里的 Blob，跟着设备走
 *   · 你自定义的音色 ID 也不在备份里（它属于接入配置，不进这个文件）
 */
import { applyTheme } from '@/lib/theme'
import { cardHash } from '@/lib/cards'
import { db } from '@/lib/db'
import { withRuleDefaults } from '@/lib/rules'
import {
  DEFAULT_STATE,
  appendMessage,
  isOnline,
  loadCardsLocal,
  loadMessagesLocal,
  loadRulesLocal,
  loadStateLocal,
  pullMessages,
  saveCards,
  saveRules,
  saveState,
  type PersistedState,
} from '@/lib/repo'
import { MOCK_CONVERSATION } from '@/mock/chat'
import { useAppearanceStore } from '@/store/useAppearanceStore'
import { useAppStore } from '@/store/useAppStore'
import { useCardsStore } from '@/store/useCardsStore'
import { useChatStore } from '@/store/useChatStore'
import { useRulesStore } from '@/store/useRulesStore'
import { DEFAULT_APPEARANCE } from '@/types/appearance'
import type { Message } from '@/types'
import type { Card } from '@/types/cards'
import type { RuleConfig } from '@/types/rules'

/** 备份格式版本：以后字段变了就 +1，导入时能判断「太新了」 */
export const BACKUP_VERSION = 1

export interface BackupCounts {
  messages: number
  cards: number
  moments: number
  letters: number
  diary: number
}

export interface BackupBundle {
  app: 'linian'
  kind: 'backup'
  version: number
  exportedAt: string
  counts: BackupCounts
  state: PersistedState
  rules: { data: RuleConfig; version: number } | null
  cards: { data: Card[]; version: number } | null
  /** 会话 id → 消息（现在只有 c_1，结构留着以后多会话） */
  messages: Record<string, Message[]>
}

const countOf = (b: {
  state: PersistedState
  cards: Card[] | null
  messages: Message[]
}): BackupCounts => ({
  messages: b.messages.length,
  cards: b.cards?.length ?? 0,
  moments: b.state.moments?.length ?? 0,
  letters: b.state.letters?.length ?? 0,
  diary: b.state.diary?.entries?.length ?? 0,
})

/** 从本机读一份全量快照（不碰网络） */
export async function buildBackup(conversationId = MOCK_CONVERSATION.id): Promise<BackupBundle> {
  const [state, rules, cards] = await Promise.all([loadStateLocal(), loadRulesLocal(), loadCardsLocal()])
  const messages = await db.listMessages<Message>(conversationId, 100_000)

  return {
    app: 'linian',
    kind: 'backup',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    counts: countOf({ state, cards: cards.cards, messages }),
    state,
    rules: { data: rules.rules, version: rules.version },
    cards: { data: cards.cards, version: cards.version },
    messages: { [conversationId]: messages },
  }
}

export function backupFileName(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `linian-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`
}

export function backupSizeLabel(bundle: BackupBundle): string {
  const bytes = new Blob([JSON.stringify(bundle)]).size
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** 触发浏览器下载（手机上会进「下载」或弹出保存到文件） */
export function downloadBackup(bundle: BackupBundle): string {
  const name = backupFileName()
  const blob = new Blob([JSON.stringify(bundle)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // iOS 上立刻 revoke 偶尔会取消下载，给它一点时间
  setTimeout(() => URL.revokeObjectURL(url), 4000)
  return name
}

/** 解析 + 体检（用户可能选错文件） */
export function parseBackup(text: string): BackupBundle {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('这不是一个 JSON 文件')
  }
  const b = raw as Partial<BackupBundle>
  if (b?.app !== 'linian' || b?.kind !== 'backup') throw new Error('这不是黎念的备份文件')
  if (Number(b.version) > BACKUP_VERSION) throw new Error('备份来自更新的版本：先刷新页面再导入')
  if (!b.state || typeof b.state !== 'object') throw new Error('备份里没有设置数据')

  const messages: Record<string, Message[]> = {}
  for (const [cid, list] of Object.entries(b.messages ?? {})) {
    if (Array.isArray(list)) messages[cid] = list.filter((m): m is Message => !!m && typeof m.id === 'string')
  }
  const state = {
    ...DEFAULT_STATE,
    ...(b.state as PersistedState),
    appearance: { ...DEFAULT_APPEARANCE, ...(b.state.appearance ?? {}) },
    emotionTags: (b.state as PersistedState).emotionTags ?? [],
  }
  const cards = Array.isArray(b.cards?.data) ? b.cards.data : null

  return {
    app: 'linian',
    kind: 'backup',
    version: Number(b.version) || BACKUP_VERSION,
    exportedAt: String(b.exportedAt ?? ''),
    counts: b.counts ?? countOf({ state, cards, messages: Object.values(messages).flat() }),
    state,
    rules: b.rules?.data ? { data: b.rules.data, version: Number(b.rules.version) || 0 } : null,
    cards: cards ? { data: cards, version: Number(b.cards?.version) || 0 } : null,
    messages,
  }
}

export interface ImportResult {
  conversationId: string
  messagesAdded: number
  messagesSkipped: number
  cardsAdded: number
  cardsSkipped: number
  rulesApplied: boolean
  stateApplied: boolean
  /** 后端没连上时，这些改动已经进了离线队列 */
  offline: boolean
}

const cardKey = (c: Card) => c.hash || cardHash(c)

/**
 * 导入：先写本地（界面立刻能用），再推后端（推不上就排队补发）
 * 聊天记录 / 字卡 = 合并；设置 / 规则 = 覆盖
 */
export async function importBackup(
  bundle: BackupBundle,
  onProgress?: (step: string) => void,
): Promise<ImportResult> {
  const conversationId = Object.keys(bundle.messages)[0] ?? MOCK_CONVERSATION.id
  const incoming = Object.values(bundle.messages).flat().sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  /* ① 聊天记录：只补本地没有的 id（不覆盖你导入之后新收到的消息） */
  onProgress?.(`正在写入聊天记录（${incoming.length} 条）…`)
  const localMsgs = await loadMessagesLocal(conversationId, 100_000)
  const have = new Set(localMsgs.map((m) => m.id))
  let messagesAdded = 0
  for (const m of incoming) {
    if (!m?.id || have.has(m.id)) continue
    await appendMessage({
      ...m,
      conversationId: m.conversationId || conversationId,
      // 备份里不该有「正在发送」：那说明导出时还没推上去
      status: m.status === 'SENDING' ? 'SENT' : m.status,
    })
    have.add(m.id)
    messagesAdded++
  }

  /* ② 字卡库：按 hash 去重合并（同内容不重复收，保留本地已有的那张） */
  onProgress?.('正在合并字卡库…')
  const localCards = await loadCardsLocal()
  const seen = new Set(localCards.cards.map(cardKey))
  const merged = [...localCards.cards]
  let cardsAdded = 0
  for (const c of bundle.cards?.data ?? []) {
    if (!c?.id) continue
    const k = cardKey(c)
    if (seen.has(k)) continue
    seen.add(k)
    merged.push(c)
    cardsAdded++
  }
  if (cardsAdded) await saveCards(merged, localCards.version + 1)

  /* ③ 概率规则：整包覆盖 */
  const localRules = await loadRulesLocal()
  let rulesApplied = false
  let rules = localRules.rules
  let rulesVersion = localRules.version
  if (bundle.rules?.data) {
    onProgress?.('正在恢复概率设置…')
    rules = withRuleDefaults(bundle.rules.data)
    rulesVersion = await saveRules(rules, rulesVersion + 1)
    rulesApplied = true
  }

  /* ④ 设置 + 记录（朋友圈 / 信箱 / 日记 / 世界感知 / 陪伴 / 收藏）：整包覆盖 */
  onProgress?.('正在恢复设置与记录…')
  const state = { ...DEFAULT_STATE, ...bundle.state }
  await saveState(state)

  /* ⑤ 让界面立刻吃到新数据，不用刷新 */
  applyTheme(state.themeKey)
  useAppStore.getState().hydrate(state)
  useAppearanceStore.getState().hydrate(state.appearance)
  useRulesStore.getState().hydrate(rules, rulesVersion)
  if (cardsAdded) useCardsStore.getState().hydrate(merged, localCards.version + 1)
  useChatStore.getState().hydrate(await loadMessagesLocal(conversationId, 5000))

  /* ⑥ 再把远端那份并进来：另一端可能在你导出之后又聊了几句，别让界面看起来「变少了」 */
  const remoteMsgs = await pullMessages(conversationId)
  if (remoteMsgs?.length) useChatStore.getState().mergeMessages(remoteMsgs)

  return {
    conversationId,
    messagesAdded,
    messagesSkipped: incoming.length - messagesAdded,
    cardsAdded,
    cardsSkipped: (bundle.cards?.data.length ?? 0) - cardsAdded,
    rulesApplied,
    stateApplied: true,
    offline: !isOnline(),
  }
}
