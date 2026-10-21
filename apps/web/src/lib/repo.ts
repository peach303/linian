/**
 * 数据仓库（本地优先 / local-first）
 *
 *  写入：先落 IndexedDB（立刻、离线也成功）→ 再尝试推后端 → 失败进 outbox 排队
 *  读取：启动时只读本地（同步、秒开）→ 渲染完成后后台拉远端覆盖
 *
 * 后端 REST 契约见 apps/server/dev-server.mjs（无依赖开发后端）
 * 与 apps/server/src/modules/*（NestJS 生产实现）。
 */
import { db } from './db'
import { API_BASE as API, STATIC_ONLY } from './deploy'
import { DEFAULT_RULES, withRuleDefaults } from './rules'
import { defaultCards } from './cards'
import { defaultPats } from './pats'
import { DEFAULT_GIFTS } from './gifts'
import { DEFAULT_FAVORITE_REASONS } from './favorites'
import { DEFAULT_APPEARANCE } from '@/types/appearance'
import type { Appearance } from '@/types/appearance'
import type { Card } from '@/types/cards'
import type { Anniversary, CheckPhone, Companion, CompanionMessage, CompanionSession, Diary, DiaryEntry, EmotionTag, FavoriteItem, GiftItem, Letter, Message, Moment, MusicRoom, PatEntry, QuestionPack, QuizSession, ReadRoom, SearchPush, UserProfile, VoiceClip, WatchItem, WatchRoom, World } from '@/types'
import type { RuleConfig } from '@/types/rules'

const KV_STATE = 'state'
const KV_RULES = 'rules'
const KV_RULES_VERSION = 'rulesVersion'
const KV_CARDS = 'cards'
const KV_CARDS_VERSION = 'cardsVersion'

export interface PersistedState {
  themeKey: string
  me: UserProfile
  dream: UserProfile
  anniversaries: Anniversary[]
  bonded: boolean
  appearance: Appearance
  /** 拍一拍库（我的 / 他的） */
  pats: { mine: PatEntry[]; his: PatEntry[] }
  /** 朋友圈动态（含他的主动投喂，整包随 state 一起走） */
  moments: Moment[]
  /** 信箱（我寄出的 / 他寄来的 / 蓝色批注） */
  letters: Letter[]
  /** 礼物柜（预设 + 自定义；送出去的记录在聊天的 GIFT 消息里） */
  gifts: GiftItem[]
  /** 一起听房间（歌单 + 一起听的时长 + 房间里的对话；音频文件本身在本机 Blob 里） */
  musicRoom: MusicRoom
  /** 收藏的语音（他的 / 我的；音频是 dataURL，跟着 state 一起同步） */
  voices: VoiceClip[]
  /** 收藏夹：我收藏他的 / 他收藏我的（聊天 / 字卡 / 语音 / 信件 / 朋友圈 / 推送） */
  favorites: FavoriteItem[]
  /** 他收藏我的时用的默认原因 */
  favoriteReasons: string[]
  /** 问卷题库（我自建 / 导入；可由他挑一套来问我） */
  questionPacks: QuestionPack[]
  /** 默契问卷记录（两个人做同一套题，算默契度） */
  quizSessions: QuizSession[]
  /** 陪伴（睡觉 / 学习 / 工作：正在进行的 + 记录 + 每个模式的背景） */
  companion: Companion
  /** 观影室（片单 + 弹幕 + 房间对话 + 真的看了多久；视频文件本身在本机 Blob 里） */
  watchRoom: WatchRoom
  /** 阅读室（书单 + 页边批注 + 房间对话 + 真的读了多久；书的正文本体在本机 IndexedDB 里） */
  readRoom: ReadRoom
  /** 日记（同一天可以有很多条，每条各自公开 / 私密，对应 DB 的 `diary_entries`） */
  diary: Diary
  /** 世界感知（他那边的时间差与状态采样；对应 DB 的 `world_sense_logs`） */
  world: World
  /** 查岗（我查他 / 他查我；对应 DB 的 `check_requests`） */
  checkPhone: CheckPhone
  /** 联网搜索推送：每次尝试的成败记录（对应 DB 的 `search_pushes`；**搜不到就不发消息**） */
  searchPush: SearchPush
  /** 情绪 / 意图标签的自定义（内置标签 + 自己加的词；见「功能 → 情绪意图」） */
  emotionTags: EmotionTag[]
}

export const DEFAULT_STATE: PersistedState = {
  themeKey: 'light-blue',
  me: { id: 'u_me', nickname: '我', avatarUrl: '', isDream: false },
  dream: { id: 'u_dream', nickname: '梦角', avatarUrl: '', isDream: true },
  anniversaries: [
    { id: 'a1', title: '相遇的日子', date: '2024-03-14', recurring: true, showOnHome: true, icon: '💙' },
  ],
  bonded: true,
  appearance: DEFAULT_APPEARANCE,
  pats: defaultPats(),
  moments: [],
  letters: [],
  gifts: DEFAULT_GIFTS.map((g) => ({ ...g })),
  musicRoom: { tracks: [], messages: [], playedSec: 0 },
  voices: [],
  favorites: [],
  favoriteReasons: [...DEFAULT_FAVORITE_REASONS],
  questionPacks: [],
  quizSessions: [],
  companion: { active: null, messages: [], sessions: [], backgrounds: {}, plannedMin: {} },
  watchRoom: { items: [], messages: [], danmaku: [], playedSec: 0, position: {}, active: null },
  readRoom: { books: [], messages: [], marks: [], readSec: 0, position: {}, active: null },
  diary: { entries: [] },
  world: { offsetMin: 0, samples: [] },
  checkPhone: { checks: [] },
  searchPush: { logs: [] },
  emotionTags: [],
}

export const emptyRoom = (): MusicRoom => ({ tracks: [], messages: [], playedSec: 0 })

export const emptyWatchRoom = (): WatchRoom => ({
  items: [],
  messages: [],
  danmaku: [],
  playedSec: 0,
  position: {},
  active: null,
})

export const emptyCompanion = (): Companion => ({
  active: null,
  messages: [],
  sessions: [],
  backgrounds: {},
  plannedMin: {},
})

export const emptyReadRoom = (): ReadRoom => ({
  books: [],
  messages: [],
  marks: [],
  readSec: 0,
  position: {},
  active: null,
})

/** 日记：同一天可以有很多条，每条各自公开 / 私密 */
export const emptyDiary = (): Diary => ({ entries: [] })

/** 世界感知：时差默认 0（同一时间点），采样从空开始 */
export const emptyWorld = (): World => ({ offsetMin: 0, samples: [] })

/** 查岗：一条记录都没有（既没查过，他也没问过） */
export const emptyCheckPhone = (): CheckPhone => ({ checks: [] })

/** 联网搜索推送：一次都没试过（轨迹是空的，不是「搜到过 0 条」） */
export const emptySearchPush = (): SearchPush => ({ logs: [] })

/** 世界感知最多留多少条采样（够看几天，又不至于把 state 越推越大） */
export const MAX_WORLD_SAMPLES = 40
/** 查岗最多留多少条记录 */
export const MAX_CHECKS = 60
/** 联网搜索最多留多少条尝试记录（成败都算，失败的那几条正是最该留着的） */
export const MAX_SEARCH_LOGS = 40

/**
 * 美化配置的合并：`homeNote` / `photos` 是后加的字段，
 * 远端还是老版本（没有这两个字段）时别把本机已经摆好的照片墙冲掉。
 */
function mergeAppearance(local?: Partial<Appearance>, remote?: Partial<Appearance>): Appearance {
  const l = local ?? {}
  const r = remote ?? {}
  const icon = r.appIcon ?? l.appIcon
  // 旧版默认是 🫧：换成雪人图标；用户自己挑过的仍然保留
  const appIcon = icon?.mode === 'emoji' && icon.value === '🫧' ? DEFAULT_APPEARANCE.appIcon : icon
  return {
    ...DEFAULT_APPEARANCE,
    ...l,
    ...r,
    appIcon: appIcon ?? DEFAULT_APPEARANCE.appIcon,
    photos: r.photos ?? l.photos ?? DEFAULT_APPEARANCE.photos,
    homeNote: r.homeNote ?? l.homeNote ?? DEFAULT_APPEARANCE.homeNote,
  }
}

/**
 * 收藏语音的合并策略：按 id 取并集（远端为准）。
 * 我这边刚收藏、推送还没成功时，不会被远端那份旧的整包顶掉。
 */
function mergeVoices(local?: VoiceClip[], remote?: VoiceClip[]): VoiceClip[] {
  const map = new Map<string, VoiceClip>()
  ;(local ?? []).forEach((v) => map.set(v.id, v))
  ;(remote ?? []).forEach((v) => map.set(v.id, v))
  return [...map.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** 通用按 id 取并集（远端为准），按 createdAt 倒序；收藏 / 题库 / 默契记录共用 */
function mergeById<T extends { id: string; createdAt?: string }>(local?: T[], remote?: T[]): T[] {
  const map = new Map<string, T>()
  ;(local ?? []).forEach((x) => map.set(x.id, x))
  ;(remote ?? []).forEach((x) => map.set(x.id, x))
  return [...map.values()].sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
}

/**
 * 一起听房间的合并策略
 *
 * 歌单和房间对话按 id 取并集（远端为准），累计时长取较大的那个（时长只会涨，不会因为换设备归零）。
 * 音频文件本身是**本机 Blob**，不在这里，所以另一台设备上那些歌只有歌名、点开会提示重新导入。
 */
function mergeRoom(local?: MusicRoom, remote?: MusicRoom): MusicRoom {
  const a = local ?? emptyRoom()
  const b = remote ?? emptyRoom()
  const tracks = new Map(a.tracks.map((t) => [t.id, t]))
  b.tracks.forEach((t) => tracks.set(t.id, t))
  const msgs = new Map(a.messages.map((m) => [m.id, m]))
  b.messages.forEach((m) => msgs.set(m.id, m))
  return {
    ...a,
    ...b,
    tracks: [...tracks.values()].sort((x, y) => x.addedAt.localeCompare(y.addedAt)),
    messages: [...msgs.values()]
      .sort((x, y) => x.createdAt.localeCompare(y.createdAt))
      .slice(-200),
    playedSec: Math.max(a.playedSec ?? 0, b.playedSec ?? 0),
    currentId: b.currentId ?? a.currentId,
    position: b.position ?? a.position,
    heJoinedAt: b.heJoinedAt ?? a.heJoinedAt,
    heStaysUntil: b.heStaysUntil ?? a.heStaysUntil,
  }
}

/**
 * 陪伴的合并策略
 *
 *   · 记录 / 房间对话：按 id 取并集（两边都写过，别互相顶掉）
 *   · 每个模式的背景与上次的时长：远端有就用远端的
 *   · 正在进行的那次：**谁新算谁的**（换设备接着陪也算数）；
 *     只有一边有的时候保留那一边 —— 别让「远端那份还没有 active」把我这边正在跑的陪伴掐掉
 */
function mergeCompanion(local?: Companion, remote?: Companion): Companion {
  const a = local ?? emptyCompanion()
  const b = remote ?? emptyCompanion()
  const sessions = new Map<string, CompanionSession>(a.sessions.map((s) => [s.id, s]))
  b.sessions.forEach((s) => sessions.set(s.id, s))
  const msgs = new Map<string, CompanionMessage>(a.messages.map((m) => [m.id, m]))
  b.messages.forEach((m) => msgs.set(m.id, m))
  const pickActive = (): Companion['active'] => {
    if (a.active && b.active) return +new Date(b.active.startedAt) > +new Date(a.active.startedAt) ? b.active : a.active
    return b.active ?? a.active
  }
  return {
    active: pickActive(),
    messages: [...msgs.values()].sort((x, y) => x.createdAt.localeCompare(y.createdAt)).slice(-200),
    sessions: [...sessions.values()]
      .sort((x, y) => x.startedAt.localeCompare(y.startedAt))
      .slice(-300),
    backgrounds: { ...a.backgrounds, ...b.backgrounds },
    plannedMin: { ...a.plannedMin, ...b.plannedMin },
  }
}

/**
 * 观影室的合并策略
 *
 * 片单 / 弹幕 / 房间对话按 id 取并集（远端为准）；「真的看了多久」取较大的那个（只会涨）。
 * 看到哪了（`position`）有两台设备在看时，谁推上来的就先用谁的 —— 这里取远端优先，
 * 但本地刚写过的（比如刚看到 30 分钟）不会被一份更旧的远端顶掉。
 * 视频文件本身是**本机 Blob**，不在这里 —— 换台设备那些片只剩片名，点开会提示重新导入。
 */
function mergeWatchRoom(local?: WatchRoom, remote?: WatchRoom): WatchRoom {
  const a = local ?? emptyWatchRoom()
  const b = remote ?? emptyWatchRoom()
  const items = new Map(a.items.map((i) => [i.id, i]))
  b.items.forEach((i) => items.set(i.id, i))
  const msgs = new Map(a.messages.map((m) => [m.id, m]))
  b.messages.forEach((m) => msgs.set(m.id, m))
  const dan = new Map(a.danmaku.map((d) => [d.id, d]))
  b.danmaku.forEach((d) => dan.set(d.id, d))
  const pickActive = (): WatchRoom['active'] => {
    if (a.active && b.active) return +new Date(b.active.startedAt) > +new Date(a.active.startedAt) ? b.active : a.active
    return b.active ?? a.active
  }
  return {
    items: [...items.values()].sort((x, y) => x.addedAt.localeCompare(y.addedAt)),
    messages: [...msgs.values()].sort((x, y) => x.createdAt.localeCompare(y.createdAt)).slice(-200),
    danmaku: [...dan.values()].sort((x, y) => x.createdAt.localeCompare(y.createdAt)).slice(-500),
    currentId: b.currentId ?? a.currentId,
    playedSec: Math.max(a.playedSec ?? 0, b.playedSec ?? 0),
    position: { ...a.position, ...b.position },
    active: pickActive(),
  }
}

/**
 * 阅读室的合并策略
 *
 * 书单 / 页边批注 / 房间对话按 id 取并集（远端为准）；「真的读了多久」取较大的那个（只会涨）。
 * 读到第几段（`position`）取远端优先，但本地刚翻过的不会被一份更旧的远端顶掉。
 * 书的**正文本体是本机 IndexedDB 的 `book:<id>`**，不在这里 —— 换台设备那本书只剩书名，
 * 点开会提示重新导入（和观影室一样，宁缺毋滥）。
 */
function mergeReadRoom(local?: ReadRoom, remote?: ReadRoom): ReadRoom {
  const a = local ?? emptyReadRoom()
  const b = remote ?? emptyReadRoom()
  const books = new Map(a.books.map((x) => [x.id, x]))
  b.books.forEach((x) => books.set(x.id, x))
  const msgs = new Map(a.messages.map((m) => [m.id, m]))
  b.messages.forEach((m) => msgs.set(m.id, m))
  const marks = new Map(a.marks.map((m) => [m.id, m]))
  b.marks.forEach((m) => marks.set(m.id, m))
  const pickActive = (): ReadRoom['active'] => {
    if (a.active && b.active) return +new Date(b.active.startedAt) > +new Date(a.active.startedAt) ? b.active : a.active
    return b.active ?? a.active
  }
  return {
    books: [...books.values()].sort((x, y) => x.addedAt.localeCompare(y.addedAt)),
    messages: [...msgs.values()].sort((x, y) => x.createdAt.localeCompare(y.createdAt)).slice(-200),
    marks: [...marks.values()].sort((x, y) => x.createdAt.localeCompare(y.createdAt)).slice(-500),
    currentId: b.currentId ?? a.currentId,
    readSec: Math.max(a.readSec ?? 0, b.readSec ?? 0),
    position: { ...a.position, ...b.position },
    active: pickActive(),
  }
}

/**
 * 日记的合并策略
 *
 * 日记不限制一天几条，所以按每条自己的 `id` 归并：两边都有同一条时取**改得更晚的那条**
 * （`editedAt ?? createdAt`），这样「本机刚写完还没推上去」不会被一份更旧的远端稿顶掉，
 * 同一天不同 id 的几条也不会互相覆盖。
 */
function mergeDiary(local?: Diary, remote?: Diary): Diary {
  const a = local ?? emptyDiary()
  const b = remote ?? emptyDiary()
  const map = new Map<string, DiaryEntry>()
  const put = (e: DiaryEntry) => {
    const cur = map.get(e.id)
    if (!cur) return void map.set(e.id, e)
    const at = new Date(e.editedAt ?? e.createdAt).getTime()
    const ct = new Date(cur.editedAt ?? cur.createdAt).getTime()
    if (at >= ct) map.set(e.id, e)
  }
  a.entries.forEach(put)
  b.entries.forEach(put)
  return {
    entries: [...map.values()].sort(
      (x, y) => x.date.localeCompare(y.date) || +new Date(x.createdAt) - +new Date(y.createdAt),
    ),
  }
}

/**
 * 世界感知的合并策略
 *
 * 采样按 id 取并集（远端为准）、按 `sampledAt` 排好、只留最近 `MAX_WORLD_SAMPLES` 条；
 * 「时差」以**远端**为准（它是设定，不该被本机那份默认的 0 顶掉）。
 */
function mergeWorld(local?: World, remote?: World): World {
  const a = local ?? emptyWorld()
  const b = remote ?? emptyWorld()
  const map = new Map<string, World['samples'][number]>()
  a.samples.forEach((s) => map.set(s.id, s))
  b.samples.forEach((s) => map.set(s.id, s))
  const samples = [...map.values()]
    .sort((x, y) => x.sampledAt.localeCompare(y.sampledAt))
    .slice(-MAX_WORLD_SAMPLES)
  return { offsetMin: b.offsetMin ?? a.offsetMin ?? 0, samples }
}

/**
 * 查岗的合并策略
 *
 * 按 id 取并集；同一条两边都有时取**有结论的那条**（结算过的不该被一份还没结算的盖掉）。
 */
function mergeChecks(local?: CheckPhone, remote?: CheckPhone): CheckPhone {
  const a = local ?? emptyCheckPhone()
  const b = remote ?? emptyCheckPhone()
  const map = new Map<string, CheckPhone['checks'][number]>()
  const put = (c: CheckPhone['checks'][number]) => {
    const cur = map.get(c.id)
    if (!cur) return void map.set(c.id, c)
    const rank = (x: CheckPhone['checks'][number]) => (x.status === 'REQUESTED' ? 0 : 1)
    if (rank(c) >= rank(cur)) map.set(c.id, c)
  }
  a.checks.forEach(put)
  b.checks.forEach(put)
  return {
    checks: [...map.values()]
      .sort((x, y) => x.requestedAt.localeCompare(y.requestedAt))
      .slice(-MAX_CHECKS),
  }
}

/**
 * 联网搜索轨迹的合并策略
 *
 * 按 id 取并集（成功与失败都留），按时间排好、只留最近 `MAX_SEARCH_LOGS` 条。
 * 失败的那几条**特意留着** —— 界面上要能说清「上次为什么没搜到」。
 */
function mergeSearchPush(local?: SearchPush, remote?: SearchPush): SearchPush {
  const a = local ?? emptySearchPush()
  const b = remote ?? emptySearchPush()
  const map = new Map<string, SearchPush['logs'][number]>()
  a.logs.forEach((l) => map.set(l.id, l))
  b.logs.forEach((l) => map.set(l.id, l))
  return {
    logs: [...map.values()].sort((x, y) => x.at.localeCompare(y.at)).slice(-MAX_SEARCH_LOGS),
  }
}

/* ───────────────────────── 远端（可缺席） ───────────────────────── */

let online = false
export const isOnline = () => online

async function request<T>(method: string, url: string, body?: unknown, timeoutMs = 1500): Promise<T> {
  if (STATIC_ONLY) throw new Error('static-only build: no backend')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${API}${url}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      signal: ctrl.signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`[${res.status}] ${res.statusText}`)
    online = true
    return (await res.json()) as T
  } catch (e) {
    online = false
    throw e
  } finally {
    clearTimeout(timer)
  }
}

/** 推后端；失败就排队（纯静态站没有后端，直接只留在本机） */
async function push(method: string, url: string, body?: unknown) {
  if (STATIC_ONLY) return
  try {
    await request(method, url, body)
  } catch {
    await db.enqueue({ method, url, body })
  }
}

/** 把 outbox 里的操作按顺序补发 */
export async function flush(): Promise<{ sent: number; failed: number }> {
  if (STATIC_ONLY) return { sent: 0, failed: 0 }
  const ops = await db.listOutbox<{ method: string; url: string; body?: unknown }>()
  let sent = 0
  for (const op of ops) {
    try {
      await request(op.method, op.url, op.body)
      await db.removeOutbox(op.id)
      sent++
    } catch {
      return { sent, failed: ops.length - sent } // 失败即停，保持顺序
    }
  }
  return { sent, failed: 0 }
}

/* ───────────────────────── 状态：本地 / 远端 ───────────────────────── */

export async function loadStateLocal(): Promise<PersistedState> {
  const local = (await db.get<Partial<PersistedState>>(KV_STATE)) ?? {}
  return {
    ...DEFAULT_STATE,
    ...local,
    appearance: mergeAppearance(local.appearance, undefined),
    pats: {
      mine: local.pats?.mine ?? DEFAULT_STATE.pats.mine,
      his: local.pats?.his ?? DEFAULT_STATE.pats.his,
    },
    moments: local.moments ?? [],
    letters: local.letters ?? [],
    gifts: local.gifts ?? DEFAULT_STATE.gifts,
    musicRoom: local.musicRoom ?? emptyRoom(),
    voices: local.voices ?? [],
    favorites: local.favorites ?? [],
    favoriteReasons: local.favoriteReasons ?? [],
    questionPacks: local.questionPacks ?? [],
    quizSessions: local.quizSessions ?? [],
    companion: { ...emptyCompanion(), ...(local.companion ?? {}) },
    watchRoom: { ...emptyWatchRoom(), ...(local.watchRoom ?? {}) },
    readRoom: { ...emptyReadRoom(), ...(local.readRoom ?? {}) },
    diary: { ...emptyDiary(), ...(local.diary ?? {}) },
    world: { ...emptyWorld(), ...(local.world ?? {}) },
    checkPhone: { ...emptyCheckPhone(), ...(local.checkPhone ?? {}) },
    searchPush: { ...emptySearchPush(), ...(local.searchPush ?? {}) },
  }
}

/** 只拉远端；离线或无数据返回 null */
export async function pullState(): Promise<PersistedState | null> {
  try {
    const remote = await request<Partial<PersistedState>>('GET', '/state')
    if (!remote || Object.keys(remote).length === 0) return null
    // 本机也是「动态 / 信件」的写入方：远端没有这个字段（比如推送失败过）时保留本机那份
    const local = (await db.get<Partial<PersistedState>>(KV_STATE)) ?? {}
    const merged: PersistedState = {
      ...DEFAULT_STATE,
      ...remote,
      appearance: mergeAppearance(local.appearance, remote.appearance),
      pats: {
        mine: remote.pats?.mine ?? DEFAULT_STATE.pats.mine,
        his: remote.pats?.his ?? DEFAULT_STATE.pats.his,
      },
      moments: remote.moments ?? local.moments ?? [],
      letters: remote.letters ?? local.letters ?? [],
      gifts: remote.gifts ?? local.gifts ?? DEFAULT_STATE.gifts,
      musicRoom: mergeRoom(local.musicRoom, remote.musicRoom),
      // 收藏的语音按 id 取并集：刚收藏的还没推上去时，别被远端那份旧的整包覆盖掉
      voices: mergeVoices(local.voices, remote.voices),
      favorites: mergeById(local.favorites, remote.favorites),
      favoriteReasons: remote.favoriteReasons?.length ? remote.favoriteReasons : (local.favoriteReasons ?? []),
      questionPacks: mergeById(local.questionPacks, remote.questionPacks),
      quizSessions: mergeById(local.quizSessions, remote.quizSessions),
      companion: mergeCompanion(local.companion, remote.companion),
      watchRoom: mergeWatchRoom(local.watchRoom, remote.watchRoom),
      readRoom: mergeReadRoom(local.readRoom, remote.readRoom),
      diary: mergeDiary(local.diary, remote.diary),
      world: mergeWorld(local.world, remote.world),
      checkPhone: mergeChecks(local.checkPhone, remote.checkPhone),
      searchPush: mergeSearchPush(local.searchPush, remote.searchPush),
      emotionTags: remote.emotionTags ?? local.emotionTags ?? [],
    }
    await db.set(KV_STATE, merged)
    return merged
  } catch {
    return null
  }
}

export async function saveState(patch: Partial<PersistedState>): Promise<PersistedState> {
  const cur = (await db.get<Partial<PersistedState>>(KV_STATE)) ?? {}
  const next = {
    ...DEFAULT_STATE,
    ...cur,
    ...patch,
    appearance: { ...DEFAULT_APPEARANCE, ...(cur.appearance ?? {}), ...(patch.appearance ?? {}) },
    pats: {
      mine: patch.pats?.mine ?? cur.pats?.mine ?? DEFAULT_STATE.pats.mine,
      his: patch.pats?.his ?? cur.pats?.his ?? DEFAULT_STATE.pats.his,
    },
    moments: patch.moments ?? cur.moments ?? DEFAULT_STATE.moments,
    letters: patch.letters ?? cur.letters ?? DEFAULT_STATE.letters,
    gifts: patch.gifts ?? cur.gifts ?? DEFAULT_STATE.gifts,
    musicRoom: patch.musicRoom ?? cur.musicRoom ?? emptyRoom(),
    voices: patch.voices ?? cur.voices ?? [],
    favorites: patch.favorites ?? cur.favorites ?? [],
    favoriteReasons: patch.favoriteReasons ?? cur.favoriteReasons ?? [],
    questionPacks: patch.questionPacks ?? cur.questionPacks ?? [],
    quizSessions: patch.quizSessions ?? cur.quizSessions ?? [],
    companion: patch.companion ?? cur.companion ?? emptyCompanion(),
    watchRoom: patch.watchRoom ?? cur.watchRoom ?? emptyWatchRoom(),
    readRoom: patch.readRoom ?? cur.readRoom ?? emptyReadRoom(),
    diary: patch.diary ?? cur.diary ?? emptyDiary(),
    world: patch.world ?? cur.world ?? emptyWorld(),
    checkPhone: patch.checkPhone ?? cur.checkPhone ?? emptyCheckPhone(),
    searchPush: patch.searchPush ?? cur.searchPush ?? emptySearchPush(),
    emotionTags: patch.emotionTags ?? cur.emotionTags ?? [],
  } as PersistedState & { pats: { mine: PatEntry[]; his: PatEntry[] } }
  await db.set(KV_STATE, next) // ① 本地立即生效
  await push('PUT', '/state', patch) // ② 再推后端（失败排队）
  return next
}

/* ───────────────────────── 规则（版本化） ───────────────────────── */

export async function loadRulesLocal(): Promise<{ rules: RuleConfig; version: number }> {
  const local = await db.get<RuleConfig>(KV_RULES)
  const version = (await db.get<number>(KV_RULES_VERSION)) ?? 1
  // 老版本存下来的规则缺新字段 → 用默认值补齐（否则新增的概率项读出来是 undefined）
  return { rules: withRuleDefaults(local ?? DEFAULT_RULES), version }
}

export async function pullRules(): Promise<{ rules: RuleConfig; version: number } | null> {
  try {
    const remote = await request<{ data?: RuleConfig; version?: number } & Partial<RuleConfig>>('GET', '/rules')
    const raw = remote?.data ?? (remote as RuleConfig | undefined)
    if (!raw || !raw.chat) return null
    const rules = withRuleDefaults(raw)
    const version = remote?.version ?? 1
    await db.set(KV_RULES, rules)
    await db.set(KV_RULES_VERSION, version)
    return { rules, version }
  } catch {
    return null
  }
}

export async function saveRules(rules: RuleConfig, version: number): Promise<number> {
  await db.set(KV_RULES, rules)
  await db.set(KV_RULES_VERSION, version)
  await push('PUT', '/rules', rules)
  return version
}

/* ───────────────────────── 字卡库（版本化，全量替换） ───────────────────────── */

export async function loadCardsLocal(): Promise<{ cards: Card[]; version: number }> {
  const local = await db.get<Card[]>(KV_CARDS)
  const version = (await db.get<number>(KV_CARDS_VERSION)) ?? 0
  return { cards: local ?? defaultCards(), version }
}

export async function pullCards(): Promise<{ cards: Card[]; version: number } | null> {
  try {
    const remote = await request<{ data?: Card[]; version?: number }>('GET', '/cards')
    if (!Array.isArray(remote?.data)) return null
    await db.set(KV_CARDS, remote.data)
    const version = remote.version ?? 0
    await db.set(KV_CARDS_VERSION, version)
    return { cards: remote.data, version }
  } catch {
    return null
  }
}

/** 字卡库整包保存（卡片数量在几百张量级，全量替换比逐张 diff 简单可靠） */
export async function saveCards(cards: Card[], version: number): Promise<number> {
  await db.set(KV_CARDS, cards)
  await db.set(KV_CARDS_VERSION, version)
  await push('PUT', '/cards', { data: cards, version })
  return version
}

/* ───────────────────────── 聊天记录 ───────────────────────── */

export async function appendMessage(m: Message): Promise<void> {
  await db.putMessage(m)
  await push('POST', `/conversations/${m.conversationId}/messages`, m)
}

/** 发送成功后把 SENDING 覆盖为 SENT（本地补丁 + 后端幂等 upsert，避免刷新后气泡一直是半透明） */
export async function markSent(m: Message): Promise<void> {
  const sent = { ...m, status: 'SENT' as const }
  await db.putMessage(sent)
  await push('POST', `/conversations/${m.conversationId}/messages`, sent)
}

export async function loadMessagesLocal(conversationId: string, limit = 300): Promise<Message[]> {
  return db.listMessages<Message>(conversationId, limit)
}

/** 本地为空时（换设备 / 清了缓存）从后端补拉 */
export async function pullMessages(conversationId: string, limit = 300): Promise<Message[] | null> {
  try {
    const remote = await request<Message[]>('GET', `/conversations/${conversationId}/messages`)
    if (!Array.isArray(remote)) return null
    for (const m of remote) await db.putMessage(m)
    return remote.slice(-limit)
  } catch {
    return null
  }
}

export async function recallMessage(id: string): Promise<void> {
  await db.patchMessage(id, { status: 'RECALLED', recalled: true, text: undefined })
  await push('POST', `/messages/${id}/recall`)
}

export async function clearMessages(): Promise<void> {
  await db.clearMessages()
}

/* ── 本机音频（一起听用的 mp3 / flac / m4a…）── */

/** 存一个音频文件（Blob 只在 IndexedDB，不进 state JSON；换设备要重新导入） */
export const saveAudioFile = (blobKey: string, blob: Blob): Promise<void> => db.putBlob(blobKey, blob)
export const readAudioFile = (blobKey: string): Promise<Blob | undefined> => db.getBlob(blobKey)
export const deleteAudioFile = (blobKey: string): Promise<void> => db.deleteBlob(blobKey)

/** 观影室的本机视频（同一个 Blob 区，key 用 `video:<id>`；视频很大，别整包进 state） */
export const saveWatchVideo = (blobKey: string, blob: Blob): Promise<void> => db.putBlob(blobKey, blob)
export const readWatchVideo = (blobKey: string): Promise<Blob | undefined> => db.getBlob(blobKey)
export const deleteWatchVideo = (blobKey: string): Promise<void> => db.deleteBlob(blobKey)

/**
 * 阅读室的书（同一个 Blob 区，key 用 `book:<id>`）
 *
 * 存的是**解析好的段落数组**（`TextEncoder` 之后的 JSON Blob），不是原文件 ——
 * 原书可能几百 KB 到几 MB，解析一次就够，正文进 state 会把每次同步都撑大。
 * 换台设备这些书只剩书名，点开会提示重新导入。
 */
export const saveBookText = (blobKey: string, paragraphs: string[]): Promise<void> =>
  db.putBlob(blobKey, new Blob([JSON.stringify(paragraphs)], { type: 'application/json' }))
export const readBookText = async (blobKey: string): Promise<string[] | undefined> => {
  const blob = await db.getBlob(blobKey)
  if (!blob) return undefined
  try {
    const arr = JSON.parse(await blob.text())
    return Array.isArray(arr) ? (arr as string[]) : undefined
  } catch {
    return undefined
  }
}
export const deleteBookText = (blobKey: string): Promise<void> => db.deleteBlob(blobKey)

/**
 * 清空某个会话的聊天记录
 *
 * 本地删 + **推一条 DELETE 把后端也清掉** —— 否则下次启动的「远端合并」
 * 会把刚清掉的历史又并回来（见 `store/bootstrap.ts`）。
 * 离线时这条删除会进 outbox，联网后补发。
 */
export async function clearConversation(conversationId: string): Promise<void> {
  await db.clearMessages()
  await push('DELETE', `/conversations/${conversationId}/messages`)
}

export const stats = async () => ({
  outbox: (await db.listOutbox<unknown>()).length,
})

/* ───────────────────────── 后台补发 ───────────────────────── */

let timer: ReturnType<typeof setInterval> | undefined
export function startSyncLoop(intervalMs = 20_000) {
  if (STATIC_ONLY) return () => {}
  if (timer) return () => clearInterval(timer)
  const tick = () => void flush()
  timer = setInterval(tick, intervalMs)
  if (typeof window !== 'undefined') window.addEventListener('online', tick)
  tick()
  return () => {
    if (timer) clearInterval(timer)
    if (typeof window !== 'undefined') window.removeEventListener('online', tick)
  }
}
