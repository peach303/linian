import { create } from 'zustand'
import { applyTheme } from '@/lib/theme'
import { nid } from '@/lib/ids'
import { defaultPats, makePat } from '@/lib/pats'
import { DEFAULT_GIFTS } from '@/lib/gifts'
import { DEFAULT_FAVORITE_REASONS } from '@/lib/favorites'
import {
  deleteAudioFile,
  deleteBookText,
  deleteWatchVideo,
  emptyCheckPhone,
  emptyCompanion,
  emptyDiary,
  emptyReadRoom,
  emptyRoom,
  emptySearchPush,
  emptyWatchRoom,
  emptyWorld,
  MAX_CHECKS,
  MAX_SEARCH_LOGS,
  MAX_WORLD_SAMPLES,
  saveState,
  type PersistedState,
} from '@/lib/repo'
import { useAppearanceStore } from '@/store/useAppearanceStore'
import type {
  ActiveCompanion,
  ActiveRead,
  ActiveWatch,
  Anniversary,
  CheckPhone,
  CheckRequest,
  Companion,
  CompanionMessage,
  CompanionMode,
  CompanionSession,
  Diary,
  DiaryEntry,
  DiaryMood,
  EmotionTag,
  FavoriteItem,
  GiftItem,
  Letter,
  LetterAnnotation,
  LetterStatus,
  Moment,
  MusicRoom,
  PatEntry,
  PatSide,
  ReadBook,
  ReadMark,
  ReadRoom,
  RoomMessage,
  QuestionPack,
  QuizSession,
  SearchLog,
  SearchPush,
  Track,
  UserProfile,
  VoiceClip,
  WatchDanmaku,
  WatchItem,
  WatchRoom,
  World,
  WorldSample,
} from '@/types'

/** 手机 OS 的屏幕栈 */
export type ScreenId =
  | 'home'
  | 'chat'
  | 'moments'
  | 'mailbox'
  | 'hub'
  | 'settings'
  | 'appearance'
  | 'rule-engine'
  | 'card-library'
  | 'gift-cabinet'
  | 'music-room'
  | 'favorite'
  | 'integration'
  | 'data'
  | 'companion'
  | 'stats'
  | 'fitness'
  | 'watch-room'
  | 'read-room'
  | 'diary'
  | 'world'
  | 'check'
  | 'anniversary'
  | 'emotion'
  | 'survey'

export const VALID_SCREENS: ScreenId[] = [
  'home',
  'chat',
  'moments',
  'mailbox',
  'hub',
  'settings',
  'appearance',
  'rule-engine',
  'card-library',
  'gift-cabinet',
  'music-room',
  'favorite',
  'integration',
  'data',
  'companion',
  'stats',
  'fitness',
  'watch-room',
  'read-room',
  'diary',
  'world',
  'check',
  'anniversary',
  'emotion',
  'survey',
]

/** 开发便利：用 URL hash 直接打开某个屏幕，例如 http://localhost:5173/#rule-engine */
function initialScreen(): ScreenId {
  if (typeof window === 'undefined') return 'home'
  const h = window.location.hash.replace(/^#\/?/, '') as ScreenId
  return VALID_SCREENS.includes(h) ? h : 'home'
}

interface AppState {
  /* ── 系统 UI ── */
  now: Date
  screen: ScreenId
  /** 屏幕栈，用于「返回」手势 */
  history: ScreenId[]
  /** 本地数据是否已注入（避免首屏用默认值闪一下） */
  ready: boolean
  push: (s: ScreenId) => void
  back: () => void
  goto: (s: ScreenId) => void
  tick: () => void

  /* ── 形象 ── */
  me: UserProfile
  dream: UserProfile
  setProfile: (who: 'me' | 'dream', patch: Partial<UserProfile>) => void

  /* ── 纪念日（可自定义编辑）── */
  anniversaries: Anniversary[]
  upsertAnniversary: (a: Anniversary) => void
  removeAnniversary: (id: string) => void

  /* ── 拍一拍库（我的 / 他的）── */
  pats: { mine: PatEntry[]; his: PatEntry[] }
  addPat: (side: PatSide, text: string) => void
  removePat: (side: PatSide, id: string) => void
  togglePat: (side: PatSide, id: string) => void

  /* ── 朋友圈（动态 / 点赞 / 评论）── */
  moments: Moment[]
  /** 追加一条动态（我发的 / 他主动发的都走这里，时间正序存） */
  pushMoment: (m: Moment) => void
  /** 我点赞 / 取消赞 */
  toggleMyLike: (id: string) => void
  /** 他点赞（引擎用） */
  dreamLike: (id: string) => void
  /** 我评论 */
  commentAsMe: (id: string, text: string) => void
  /** 他评论 / 回复我的评论（引擎用） */
  commentFromDream: (id: string, text: string, replyToId?: string) => void
  /** 删掉一条动态（只能删自己发的） */
  removeMoment: (id: string) => void

  /* ── 信箱（写信 / 回信 / 蓝色批注）── */
  letters: Letter[]
  pushLetter: (l: Letter) => void
  markLetterRead: (id: string) => void
  setLetterStatus: (id: string, status: LetterStatus) => void
  /** 他在我的信上加一条蓝色手写批注 */
  annotateLetter: (id: string, a: LetterAnnotation) => void
  /** 删掉一封信（只能删自己寄出的） */
  removeLetter: (id: string) => void

  /* ── 礼物柜（预设 + 自定义）── */
  gifts: GiftItem[]
  /** 新增 / 修改一件礼物（同 id 覆盖） */
  upsertGift: (g: GiftItem) => void
  removeGift: (id: string) => void
  /** 把系统自带的礼物恢复默认（自定义的保留） */
  resetGifts: () => void

  /* ── 一起听（音乐房间）── */
  room: MusicRoom
  /** 加歌（我导入的 / 他推的都走这里） */
  addRoomTracks: (tracks: Track[]) => void
  /** 删歌（本机文件连 Blob 一起删掉） */
  removeRoomTrack: (id: string) => void
  /** 房间状态补丁：当前曲目 / 进度 / 一起听时长 / 他在不在 */
  patchRoom: (patch: Partial<MusicRoom>) => void
  /** 房间里的对话（跟主聊天分开） */
  pushRoomMessage: (m: RoomMessage) => void
  /** 他在某首上说的话（说过就不再重复） */
  setTrackNote: (trackId: string, note: string) => void
  /** 真的播出来的秒数（累加到曲目和房间） */
  addPlayedSec: (trackId: string, sec: number) => void

  /* ── 收藏的语音（他的 / 我的）── */
  voices: VoiceClip[]
  /** 收藏一段语音（同一条消息重复收藏 = 覆盖，不会出现两条一样的） */
  addVoice: (v: Omit<VoiceClip, 'id' | 'createdAt'>) => VoiceClip
  /** 删掉一条收藏（绑在字卡上的话，那张卡也会一起解绑，见 `lib/voiceFav.ts`） */
  removeVoice: (id: string) => void
  /** 改名 / 绑定字卡 / 解绑（`cardId: ''` = 解绑） */
  patchVoice: (id: string, patch: Partial<VoiceClip>) => void

  /* ── 收藏夹（聊天 / 字卡 / 语音 / 信件 / 朋友圈 / 推送）── */
  favorites: FavoriteItem[]
  /** 他收藏我的时用的默认原因（可自己加 / 删） */
  favoriteReasons: string[]
  /** 收藏一条；同一个人对同一条内容只留一条（重复收藏 = 更新原因） */
  addFavorite: (f: Omit<FavoriteItem, 'id' | 'createdAt'>) => FavoriteItem
  removeFavorite: (id: string) => void
  addFavoriteReason: (text: string) => void
  removeFavoriteReason: (text: string) => void

  /* ── 问卷（题库 / 默契问卷）── */
  questionPacks: QuestionPack[]
  upsertQuestionPack: (p: QuestionPack) => void
  removeQuestionPack: (id: string) => void
  quizSessions: QuizSession[]
  upsertQuizSession: (q: QuizSession) => void
  removeQuizSession: (id: string) => void

  /* ── 陪伴（睡觉 / 学习 / 工作）── */
  companion: Companion
  /** 开始一次陪伴（由 `lib/engine/companion.ts#startCompanion` 调用，抽签已经抽好） */
  startCompanion: (act: ActiveCompanion) => void
  /** 补丁：他到场的时刻 / 他先走的时刻 / 说过的节拍 */
  patchCompanionActive: (patch: Partial<ActiveCompanion>) => void
  /** 结束：落一条记录，`active` 置空（房间对话保留） */
  endCompanion: (session: CompanionSession) => void
  /** 陪伴房间里的对话 */
  pushCompanionMessage: (m: CompanionMessage) => void
  /** 每个模式我换过的背景图（dataURL / 外链；`''` = 换回自带渐变） */
  setCompanionBackground: (mode: CompanionMode, url: string) => void
  /** 记住每个模式上次的目标时长 */
  setCompanionPlannedMin: (mode: CompanionMode, min: number) => void
  /** 删掉一条记录 */
  removeCompanionSession: (id: string) => void
  /** 清空全部记录（正在进行的那次不受影响） */
  clearCompanionSessions: () => void

  /* ── 观影室（一起看片）── */
  watchRoom: WatchRoom
  /** 加片（我导入的 / 他推的都走这里） */
  addWatchItems: (items: WatchItem[]) => void
  /** 删一部（本机文件连 Blob 一起删掉） */
  removeWatchItem: (id: string) => void
  /** 改一部片（片长测出来 / 标记看完） */
  patchWatchItem: (id: string, patch: Partial<WatchItem>) => void
  /** 开始一起看（由 `lib/engine/watch.ts#startWatch` 调用，抽签已经抽好） */
  startWatch: (act: ActiveWatch) => void
  /** 补丁：他到场的时刻 / 他先走的时刻 / 说过话没 / 排过的弹幕位置 */
  patchWatchActive: (patch: Partial<ActiveWatch>) => void
  /** 结束一起看（`active` 置空；弹幕与房间对话保留） */
  endWatch: () => void
  /** 观影室里的对话（跟主聊天分开） */
  pushWatchMessage: (m: RoomMessage) => void
  /** 他的弹幕（`atSec` = 片子里的秒数；播到那一刻才飘出来） */
  pushWatchDanmaku: (d: WatchDanmaku) => void
  /** 真的看了多久（`<video>` 在走才累加） */
  addWatchPlayedSec: (itemId: string, sec: number) => void
  /** 看到哪了（秒），下次接着看 */
  setWatchPosition: (itemId: string, sec: number) => void
  /** 标记看完 / 取消看完 */
  markWatchFinished: (id: string, finished: boolean) => void
  /** 清掉某一部片的弹幕 */
  clearWatchDanmaku: (itemId: string) => void

  /* ── 阅读室（一起读）── */
  readRoom: ReadRoom
  /** 加书（我导入的 / 粘的 / 他推的都走这里） */
  addReadBooks: (books: ReadBook[]) => void
  /** 删一本（本机导进来的正文 Blob 一起删掉） */
  removeReadBook: (id: string) => void
  /** 改一本（解析出段落数 / 标记读完） */
  patchReadBook: (id: string, patch: Partial<ReadBook>) => void
  /** 开始一起读（由 `lib/engine/read.ts#startRead` 调用，抽签已经抽好） */
  startRead: (act: ActiveRead) => void
  /** 补丁：他到场的时刻 / 他先走的时刻 / 说过话没 / 排过的批注位置 */
  patchReadActive: (patch: Partial<ActiveRead>) => void
  /** 结束一起读（`active` 置空；批注与房间对话保留） */
  endRead: () => void
  /** 阅读室里的对话（跟主聊天分开） */
  pushReadMessage: (m: RoomMessage) => void
  /** 他写在页边的东西（`paraIndex` = 书里的第几段；读到那一段才显示） */
  pushReadMark: (m: ReadMark) => void
  /** 真的读了多久（书开着、页面在前台、最近还在翻页才累加） */
  addReadSec: (bookId: string, sec: number) => void
  /** 读到第几段（段号），下次接着读 */
  setReadPosition: (bookId: string, para: number) => void
  /** 标记读完 / 取消读完 */
  markReadFinished: (id: string, finished: boolean) => void
  /** 清掉某一本书的批注 */
  clearReadMarks: (bookId: string) => void

  /* ── 日记（不限条数：同一天可以写很多条，每条各自公开 / 私密）── */
  diary: Diary
  /** 写一条新日记 / 改某一条已有日记；返回写好的那条 */
  saveMyDiary: (input: {
    /** 传了就是改这一条；不传就是新写一条 */
    id?: string
    date: string
    mood: DiaryMood
    text: string
    /** 公开 / 私密；不传 = 沿用原值（新日记默认公开） */
    visibility?: 'public' | 'private'
  }) => DiaryEntry
  /** 引擎用：把他写好的那条放进来（同一天可以有多条，按 id 去重） */
  pushDiaryEntry: (e: DiaryEntry) => void
  /** 删掉某一条日记（删错了能收回来） */
  removeDiary: (id: string) => void

  /* ── 世界感知（他那边的时间差与状态）── */
  world: World
  /** 改时差（分钟；正 = 他那边比我快）—— 这是设定，不是测出来的 */
  setWorldOffset: (offsetMin: number) => void
  /** 采一条（自动 / 我手动点的）；只留最近 `MAX_WORLD_SAMPLES` 条 */
  addWorldSample: (s: WorldSample) => void
  removeWorldSample: (id: string) => void
  clearWorldSamples: () => void

  /* ── 查岗（我查他 / 他查我）── */
  checkPhone: CheckPhone
  pushCheck: (c: CheckRequest) => void
  updateCheck: (c: CheckRequest) => void
  /** 删掉一条记录（删了就退回「没查过」；冷却是从记录算的，会跟着松掉） */
  removeCheck: (id: string) => void
  clearChecks: () => void

  /* ── 联网搜索推送（只推真的搜到的；搜不到就只记一条）── */
  searchPush: SearchPush
  /** 记一次尝试（成功 / 失败都记）；只留最近 `MAX_SEARCH_LOGS` 条 */
  addSearchLog: (l: SearchLog) => void
  removeSearchLog: (id: string) => void
  clearSearchLogs: () => void

  /* ── 情绪 / 意图标签（内置 + 自己加的词）── */
  emotionTags: EmotionTag[]
  upsertEmotionTag: (t: EmotionTag) => void
  removeEmotionTag: (id: string) => void
  toggleEmotionTag: (id: string) => void

  /* ── 可更改配色 ── */
  themeKey: string
  setTheme: (key: string) => void

  /* ── 关系到梦角 ── */
  bonded: boolean
  setBonded: (v: boolean) => void

  /** 启动时由 bootstrap 注入本地数据 */
  hydrate: (s: PersistedState) => void
}

/** 写本地 + 推后端（失败自动排队，见 lib/repo） */
const persist = (patch: Partial<PersistedState>) => {
  void saveState(patch)
}

export const useAppStore = create<AppState>((set) => ({
  now: new Date(),
  screen: initialScreen(),
  history: [initialScreen()],
  ready: false,
  push: (s) => set((st) => ({ screen: s, history: [...st.history, s] })),
  back: () =>
    set((st) => {
      const h = st.history.slice(0, -1)
      return { history: h.length ? h : ['home'], screen: h.at(-1) ?? 'home' }
    }),
  goto: (s) => set({ screen: s, history: [s] }),
  tick: () => set({ now: new Date() }),

  me: { id: 'u_me', nickname: '我', avatarUrl: '', isDream: false },
  dream: { id: 'u_dream', nickname: '梦角', avatarUrl: '', isDream: true },
  setProfile: (who, patch) =>
    set((st) => {
      const next = { ...st[who], ...patch }
      persist({ [who]: next } as Partial<PersistedState>)
      return { [who]: next } as Pick<AppState, 'me' | 'dream'>
    }),

  anniversaries: [
    { id: 'a1', title: '相遇的日子', date: '2024-03-14', recurring: true, showOnHome: true, icon: '💙' },
  ],
  upsertAnniversary: (a) =>
    set((st) => {
      const exists = st.anniversaries.some((x) => x.id === a.id)
      const anniversaries = exists
        ? st.anniversaries.map((x) => (x.id === a.id ? a : x))
        : [...st.anniversaries, a]
      persist({ anniversaries })
      return { anniversaries }
    }),
  removeAnniversary: (id) =>
    set((st) => {
      const anniversaries = st.anniversaries.filter((a) => a.id !== id)
      persist({ anniversaries })
      return { anniversaries }
    }),

  pats: defaultPats(),
  addPat: (side, text) =>
    set((st) => {
      const t = text.trim()
      if (!t) return {}
      const pats = { ...st.pats, [side]: [...st.pats[side], makePat(side, t)] }
      persist({ pats })
      return { pats }
    }),
  removePat: (side, id) =>
    set((st) => {
      const pats = { ...st.pats, [side]: st.pats[side].filter((p) => p.id !== id) }
      persist({ pats })
      return { pats }
    }),
  togglePat: (side, id) =>
    set((st) => {
      const pats = {
        ...st.pats,
        [side]: st.pats[side].map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p)),
      }
      persist({ pats })
      return { pats }
    }),

  moments: [],
  pushMoment: (m) =>
    set((st) => {
      if (st.moments.some((x) => x.id === m.id)) return {}
      const moments = [...st.moments, m]
      persist({ moments })
      return { moments }
    }),
  toggleMyLike: (id) =>
    set((st) => {
      const myId = st.me.id
      const moments = st.moments.map((m) =>
        m.id === id ?
          { ...m, likes: m.likes.includes(myId) ? m.likes.filter((x) => x !== myId) : [...m.likes, myId] }
        : m,
      )
      persist({ moments })
      return { moments }
    }),
  dreamLike: (id) =>
    set((st) => {
      const hisId = st.dream.id
      const moments = st.moments.map((m) =>
        m.id === id && !m.likes.includes(hisId) ? { ...m, likes: [...m.likes, hisId] } : m,
      )
      persist({ moments })
      return { moments }
    }),
  commentAsMe: (id, text) =>
    set((st) => {
      const t = text.trim()
      if (!t) return {}
      const moments = st.moments.map((m) =>
        m.id === id ?
          {
            ...m,
            comments: [
              ...m.comments,
              { id: nid('c'), authorId: st.me.id, text: t, createdAt: new Date().toISOString() },
            ],
          }
        : m,
      )
      persist({ moments })
      return { moments }
    }),
  commentFromDream: (id, text, replyToId) =>
    set((st) => {
      const t = text.trim()
      if (!t) return {}
      const moments = st.moments.map((m) =>
        m.id === id ?
          {
            ...m,
            comments: [
              ...m.comments,
              {
                id: nid('c'),
                authorId: st.dream.id,
                text: t,
                replyToId,
                createdAt: new Date().toISOString(),
              },
            ],
          }
        : m,
      )
      persist({ moments })
      return { moments }
    }),
  removeMoment: (id) =>
    set((st) => {
      const moments = st.moments.filter((m) => !(m.id === id && m.authorId === st.me.id))
      persist({ moments })
      return { moments }
    }),

  letters: [],
  pushLetter: (l) =>
    set((st) => {
      if (st.letters.some((x) => x.id === l.id)) return {}
      const letters = [...st.letters, l]
      persist({ letters })
      return { letters }
    }),
  markLetterRead: (id) =>
    set((st) => {
      const letters = st.letters.map((l) => (l.id === id && l.status === 'UNREAD' ? { ...l, status: 'READ' as const } : l))
      persist({ letters })
      return { letters }
    }),
  setLetterStatus: (id, status) =>
    set((st) => {
      const letters = st.letters.map((l) => (l.id === id ? { ...l, status } : l))
      persist({ letters })
      return { letters }
    }),
  annotateLetter: (id, a) =>
    set((st) => {
      const letters = st.letters.map((l) => (l.id === id ? { ...l, annotations: [...l.annotations, a] } : l))
      persist({ letters })
      return { letters }
    }),
  removeLetter: (id) =>
    set((st) => {
      const letters = st.letters.filter((l) => !(l.id === id && l.fromId === st.me.id))
      persist({ letters })
      return { letters }
    }),

  /* ── 礼物柜（预设 + 自定义）── */
  gifts: DEFAULT_GIFTS.map((g) => ({ ...g })),
  upsertGift: (g) =>
    set((st) => {
      const exists = st.gifts.some((x) => x.id === g.id)
      const gifts = exists ? st.gifts.map((x) => (x.id === g.id ? g : x)) : [...st.gifts, g]
      persist({ gifts })
      return { gifts }
    }),
  removeGift: (id) =>
    set((st) => {
      const gifts = st.gifts.filter((g) => g.id !== id)
      persist({ gifts })
      return { gifts }
    }),
  /** 恢复系统自带的礼物（不动自定义的那些） */
  resetGifts: () =>
    set((st) => {
      const custom = st.gifts.filter((g) => !g.builtin)
      const gifts = [...DEFAULT_GIFTS.map((g) => ({ ...g })), ...custom]
      persist({ gifts })
      return { gifts }
    }),

  /* ── 一起听（音乐房间）── */
  room: emptyRoom(),
  addRoomTracks: (tracks) =>
    set((st) => {
      const room: MusicRoom = {
        ...st.room,
        tracks: [...st.room.tracks, ...tracks.filter((t) => !st.room.tracks.some((x) => x.id === t.id))],
      }
      persist({ musicRoom: room })
      return { room }
    }),
  removeRoomTrack: (id) =>
    set((st) => {
      const doomed = st.room.tracks.find((t) => t.id === id)
      // 本机音频文件跟着曲目一起删（别在 IndexedDB 里留垃圾）
      if (doomed?.source.kind === 'local') void deleteAudioFile(doomed.source.blobKey)
      const tracks = st.room.tracks.filter((t) => t.id !== id)
      const room: MusicRoom = { ...st.room, tracks }
      if (st.room.currentId === id) room.currentId = tracks.at(-1)?.id
      persist({ musicRoom: room })
      return { room }
    }),
  patchRoom: (patch) =>
    set((st) => {
      const room: MusicRoom = { ...st.room, ...patch }
      persist({ musicRoom: room })
      return { room }
    }),
  pushRoomMessage: (m) =>
    set((st) => {
      if (st.room.messages.some((x) => x.id === m.id)) return {}
      const room: MusicRoom = { ...st.room, messages: [...st.room.messages, m].slice(-200) }
      persist({ musicRoom: room })
      return { room }
    }),
  setTrackNote: (trackId, note) =>
    set((st) => {
      const room: MusicRoom = {
        ...st.room,
        tracks: st.room.tracks.map((t) => (t.id === trackId ? { ...t, hisNote: note } : t)),
      }
      persist({ musicRoom: room })
      return { room }
    }),
  addPlayedSec: (trackId, sec) =>
    set((st) => {
      if (sec <= 0) return {}
      const room: MusicRoom = {
        ...st.room,
        playedSec: (st.room.playedSec ?? 0) + sec,
        tracks: st.room.tracks.map((t) =>
          t.id === trackId ? { ...t, playedSec: (t.playedSec ?? 0) + sec } : t,
        ),
      }
      persist({ musicRoom: room })
      return { room }
    }),

  voices: [],
  addVoice: (v) => {
    const clip: VoiceClip = { ...v, id: nid('v'), createdAt: new Date().toISOString() }
    set((st) => {
      // 同一条消息只留一条收藏（重复收藏 = 更新）
      const rest = v.messageId ? st.voices.filter((x) => x.messageId !== v.messageId) : st.voices
      const voices = [clip, ...rest]
      persist({ voices })
      return { voices }
    })
    return clip
  },
  removeVoice: (id) =>
    set((st) => {
      const voices = st.voices.filter((v) => v.id !== id)
      persist({ voices })
      return { voices }
    }),
  patchVoice: (id, patch) =>
    set((st) => {
      const voices = st.voices.map((v) => (v.id === id ? { ...v, ...patch } : v))
      persist({ voices })
      return { voices }
    }),

  favorites: [],
  favoriteReasons: DEFAULT_FAVORITE_REASONS,
  addFavorite: (f) => {
    let out!: FavoriteItem
    set((st) => {
      const existed = st.favorites.find(
        (x) => x.owner === f.owner && x.kind === f.kind && x.refId === f.refId,
      )
      const item: FavoriteItem = existed
        ? { ...existed, ...f, id: existed.id, createdAt: existed.createdAt }
        : { ...f, id: nid('fav'), createdAt: new Date().toISOString() }
      const favorites = existed
        ? st.favorites.map((x) => (x.id === existed.id ? item : x))
        : [item, ...st.favorites]
      out = item
      persist({ favorites })
      return { favorites }
    })
    return out
  },
  removeFavorite: (id) =>
    set((st) => {
      const favorites = st.favorites.filter((x) => x.id !== id)
      persist({ favorites })
      return { favorites }
    }),
  addFavoriteReason: (text) =>
    set((st) => {
      const t = text.trim()
      if (!t || st.favoriteReasons.includes(t)) return {}
      const favoriteReasons = [...st.favoriteReasons, t].slice(0, 30)
      persist({ favoriteReasons })
      return { favoriteReasons }
    }),
  removeFavoriteReason: (text) =>
    set((st) => {
      const favoriteReasons = st.favoriteReasons.filter((x) => x !== text)
      persist({ favoriteReasons })
      return { favoriteReasons }
    }),

  questionPacks: [],
  upsertQuestionPack: (p) =>
    set((st) => {
      const exists = st.questionPacks.some((x) => x.id === p.id)
      const questionPacks = exists
        ? st.questionPacks.map((x) => (x.id === p.id ? p : x))
        : [p, ...st.questionPacks]
      persist({ questionPacks })
      return { questionPacks }
    }),
  removeQuestionPack: (id) =>
    set((st) => {
      const questionPacks = st.questionPacks.filter((x) => x.id !== id)
      persist({ questionPacks })
      return { questionPacks }
    }),
  quizSessions: [],
  upsertQuizSession: (q) =>
    set((st) => {
      const exists = st.quizSessions.some((x) => x.id === q.id)
      const quizSessions = exists
        ? st.quizSessions.map((x) => (x.id === q.id ? q : x))
        : [q, ...st.quizSessions]
      persist({ quizSessions })
      return { quizSessions }
    }),
  removeQuizSession: (id) =>
    set((st) => {
      const quizSessions = st.quizSessions.filter((x) => x.id !== id)
      persist({ quizSessions })
      return { quizSessions }
    }),

  /* ── 陪伴（睡觉 / 学习 / 工作）── */
  companion: emptyCompanion(),
  startCompanion: (act) =>
    set((st) => {
      const companion: Companion = {
        ...st.companion,
        active: act,
        // 新的一次：房间对话重开（跟一起听一样，一次陪伴一段对话）
        messages: [],
        plannedMin: { ...st.companion.plannedMin, [act.mode]: act.plannedMin },
      }
      persist({ companion })
      return { companion }
    }),
  patchCompanionActive: (patch) =>
    set((st) => {
      if (!st.companion.active) return {}
      const companion: Companion = { ...st.companion, active: { ...st.companion.active, ...patch } }
      persist({ companion })
      return { companion }
    }),
  endCompanion: (session) =>
    set((st) => {
      if (!st.companion.active) return {}
      const companion: Companion = {
        ...st.companion,
        active: null,
        // 同一次不会记两条（刷新 / 双设备都触发收尾时兜一下）
        sessions: [...st.companion.sessions.filter((s) => s.id !== session.id), session].slice(-300),
      }
      persist({ companion })
      return { companion }
    }),
  pushCompanionMessage: (m) =>
    set((st) => {
      if (st.companion.messages.some((x) => x.id === m.id)) return {}
      const companion: Companion = { ...st.companion, messages: [...st.companion.messages, m].slice(-200) }
      persist({ companion })
      return { companion }
    }),
  setCompanionBackground: (mode, url) =>
    set((st) => {
      const backgrounds = { ...st.companion.backgrounds }
      if (url) backgrounds[mode] = url
      else delete backgrounds[mode]
      const companion: Companion = { ...st.companion, backgrounds }
      persist({ companion })
      return { companion }
    }),
  setCompanionPlannedMin: (mode, min) =>
    set((st) => {
      const companion: Companion = {
        ...st.companion,
        plannedMin: { ...st.companion.plannedMin, [mode]: Math.max(0, Math.round(min)) },
      }
      persist({ companion })
      return { companion }
    }),
  removeCompanionSession: (id) =>
    set((st) => {
      const companion: Companion = { ...st.companion, sessions: st.companion.sessions.filter((s) => s.id !== id) }
      persist({ companion })
      return { companion }
    }),
  clearCompanionSessions: () =>
    set((st) => {
      const companion: Companion = { ...st.companion, sessions: [] }
      persist({ companion })
      return { companion }
    }),

  /* ── 观影室（一起看片）── */
  watchRoom: emptyWatchRoom(),
  addWatchItems: (items) =>
    set((st) => {
      const room: WatchRoom = {
        ...st.watchRoom,
        items: [...st.watchRoom.items, ...items.filter((i) => !st.watchRoom.items.some((x) => x.id === i.id))],
      }
      persist({ watchRoom: room })
      return { watchRoom: room }
    }),
  removeWatchItem: (id) =>
    set((st) => {
      const doomed = st.watchRoom.items.find((i) => i.id === id)
      // 本机视频的 Blob 跟着一起删（别占着空间）
      if (doomed?.source.kind === 'local' && doomed.source.blobKey) void deleteWatchVideo(doomed.source.blobKey)
      const items = st.watchRoom.items.filter((i) => i.id !== id)
      const position = { ...st.watchRoom.position }
      delete position[id]
      const room: WatchRoom = {
        ...st.watchRoom,
        items,
        position,
        danmaku: st.watchRoom.danmaku.filter((d) => d.itemId !== id),
        currentId: st.watchRoom.currentId === id ? items.at(-1)?.id : st.watchRoom.currentId,
        active: st.watchRoom.active?.itemId === id ? null : st.watchRoom.active,
      }
      persist({ watchRoom: room })
      return { watchRoom: room }
    }),
  patchWatchItem: (id, patch) =>
    set((st) => {
      const room: WatchRoom = {
        ...st.watchRoom,
        items: st.watchRoom.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
      }
      persist({ watchRoom: room })
      return { watchRoom: room }
    }),
  startWatch: (act) =>
    set((st) => {
      const room: WatchRoom = {
        ...st.watchRoom,
        // 收尾时用差值算「这一场真的看了多久」
        active: { ...act, basePlayedSec: st.watchRoom.playedSec ?? 0 },
        currentId: act.itemId,
        // 新的一次：房间对话与弹幕重开（跟一起听一样，一次观影一段对话）
        messages: [],
        danmaku: st.watchRoom.danmaku.filter((d) => d.itemId !== act.itemId),
      }
      persist({ watchRoom: room })
      return { watchRoom: room }
    }),
  patchWatchActive: (patch) =>
    set((st) => {
      if (!st.watchRoom.active) return {}
      const room: WatchRoom = { ...st.watchRoom, active: { ...st.watchRoom.active, ...patch } }
      persist({ watchRoom: room })
      return { watchRoom: room }
    }),
  endWatch: () =>
    set((st) => {
      if (!st.watchRoom.active) return {}
      const room: WatchRoom = { ...st.watchRoom, active: null }
      persist({ watchRoom: room })
      return { watchRoom: room }
    }),
  pushWatchMessage: (m) =>
    set((st) => {
      if (st.watchRoom.messages.some((x) => x.id === m.id)) return {}
      const room: WatchRoom = { ...st.watchRoom, messages: [...st.watchRoom.messages, m].slice(-200) }
      persist({ watchRoom: room })
      return { watchRoom: room }
    }),
  pushWatchDanmaku: (d) =>
    set((st) => {
      if (st.watchRoom.danmaku.some((x) => x.id === d.id)) return {}
      const room: WatchRoom = { ...st.watchRoom, danmaku: [...st.watchRoom.danmaku, d].slice(-500) }
      persist({ watchRoom: room })
      return { watchRoom: room }
    }),
  addWatchPlayedSec: (itemId, sec) =>
    set((st) => {
      const room: WatchRoom = { ...st.watchRoom, playedSec: (st.watchRoom.playedSec ?? 0) + sec }
      persist({ watchRoom: room })
      return { watchRoom: room }
    }),
  setWatchPosition: (itemId, sec) =>
    set((st) => {
      const room: WatchRoom = { ...st.watchRoom, position: { ...st.watchRoom.position, [itemId]: sec } }
      persist({ watchRoom: room })
      return { watchRoom: room }
    }),
  markWatchFinished: (id, finished) =>
    set((st) => {
      const room: WatchRoom = {
        ...st.watchRoom,
        items: st.watchRoom.items.map((i) =>
          i.id === id ? { ...i, finishedAt: finished ? new Date().toISOString() : undefined } : i,
        ),
      }
      persist({ watchRoom: room })
      return { watchRoom: room }
    }),
  clearWatchDanmaku: (itemId) =>
    set((st) => {
      const room: WatchRoom = { ...st.watchRoom, danmaku: st.watchRoom.danmaku.filter((d) => d.itemId !== itemId) }
      persist({ watchRoom: room })
      return { watchRoom: room }
    }),

  /* ── 阅读室（一起读）── */
  readRoom: emptyReadRoom(),
  addReadBooks: (books) =>
    set((st) => {
      const room: ReadRoom = {
        ...st.readRoom,
        books: [...st.readRoom.books, ...books.filter((b) => !st.readRoom.books.some((x) => x.id === b.id))],
      }
      persist({ readRoom: room })
      return { readRoom: room }
    }),
  removeReadBook: (id) =>
    set((st) => {
      const doomed = st.readRoom.books.find((b) => b.id === id)
      // 导进来的正文本体在本机 Blob 里，跟着一起删（别占着空间）
      if (doomed?.source.blobKey) void deleteBookText(doomed.source.blobKey)
      const books = st.readRoom.books.filter((b) => b.id !== id)
      const position = { ...st.readRoom.position }
      delete position[id]
      const room: ReadRoom = {
        ...st.readRoom,
        books,
        position,
        marks: st.readRoom.marks.filter((m) => m.bookId !== id),
        currentId: st.readRoom.currentId === id ? books.at(-1)?.id : st.readRoom.currentId,
        active: st.readRoom.active?.bookId === id ? null : st.readRoom.active,
      }
      persist({ readRoom: room })
      return { readRoom: room }
    }),
  patchReadBook: (id, patch) =>
    set((st) => {
      const room: ReadRoom = {
        ...st.readRoom,
        books: st.readRoom.books.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      }
      persist({ readRoom: room })
      return { readRoom: room }
    }),
  startRead: (act) =>
    set((st) => {
      const room: ReadRoom = {
        ...st.readRoom,
        // 收尾时用差值算「这一场真的读了多久」
        active: { ...act, baseReadSec: st.readRoom.readSec ?? 0 },
        currentId: act.bookId,
        // 新的一次：房间对话重开，这一本书的批注先清掉（下次到场再排）
        messages: [],
        marks: st.readRoom.marks.filter((m) => m.bookId !== act.bookId),
      }
      persist({ readRoom: room })
      return { readRoom: room }
    }),
  patchReadActive: (patch) =>
    set((st) => {
      if (!st.readRoom.active) return {}
      const room: ReadRoom = { ...st.readRoom, active: { ...st.readRoom.active, ...patch } }
      persist({ readRoom: room })
      return { readRoom: room }
    }),
  endRead: () =>
    set((st) => {
      if (!st.readRoom.active) return {}
      const room: ReadRoom = { ...st.readRoom, active: null }
      persist({ readRoom: room })
      return { readRoom: room }
    }),
  pushReadMessage: (m) =>
    set((st) => {
      if (st.readRoom.messages.some((x) => x.id === m.id)) return {}
      const room: ReadRoom = { ...st.readRoom, messages: [...st.readRoom.messages, m].slice(-200) }
      persist({ readRoom: room })
      return { readRoom: room }
    }),
  pushReadMark: (m) =>
    set((st) => {
      if (st.readRoom.marks.some((x) => x.id === m.id)) return {}
      const room: ReadRoom = { ...st.readRoom, marks: [...st.readRoom.marks, m].slice(-500) }
      persist({ readRoom: room })
      return { readRoom: room }
    }),
  addReadSec: (bookId, sec) =>
    set((st) => {
      const room: ReadRoom = { ...st.readRoom, readSec: (st.readRoom.readSec ?? 0) + sec }
      persist({ readRoom: room })
      return { readRoom: room }
    }),
  setReadPosition: (bookId, para) =>
    set((st) => {
      const room: ReadRoom = { ...st.readRoom, position: { ...st.readRoom.position, [bookId]: para } }
      persist({ readRoom: room })
      return { readRoom: room }
    }),
  markReadFinished: (id, finished) =>
    set((st) => {
      const room: ReadRoom = {
        ...st.readRoom,
        books: st.readRoom.books.map((b) =>
          b.id === id ? { ...b, finishedAt: finished ? new Date().toISOString() : undefined } : b,
        ),
      }
      persist({ readRoom: room })
      return { readRoom: room }
    }),
  clearReadMarks: (bookId) =>
    set((st) => {
      const room: ReadRoom = { ...st.readRoom, marks: st.readRoom.marks.filter((m) => m.bookId !== bookId) }
      persist({ readRoom: room })
      return { readRoom: room }
    }),

  /* ── 日记（不限条数，每条可公开 / 私密）── */
  diary: emptyDiary(),
  saveMyDiary: ({ id, date, mood, text, visibility }) => {
    const body = text.trim()
    let out!: DiaryEntry
    set((st) => {
      const cur = id ? st.diary.entries.find((e) => e.id === id && e.authorId === st.me.id) : undefined
      const nextVisibility = visibility ?? cur?.visibility ?? 'public'
      // 每条私密日记：第一次保存成私密时各掷一次 30% 的「被他破解」，之后改字不重掷。
      // `crackRolled` 是显式标记；旧数据没有这个字段时，按「原本就是私密」推断。
      const rolled =
        Boolean(cur?.crackRolled) ||
        (cur?.visibility === 'private' && typeof cur?.cracked === 'boolean')
      const cracked =
        nextVisibility === 'private'
          ? rolled
            ? Boolean(cur?.cracked)
            : Math.random() < 0.3
          : cur?.cracked
      const crackRolled = Boolean(cur?.crackRolled) || rolled || nextVisibility === 'private'
      const crackedAt = cracked ? (cur?.crackedAt ?? new Date().toISOString()) : cur?.crackedAt
      const entry: DiaryEntry = cur
        ? {
            ...cur,
            mood,
            text: body,
            editedAt: new Date().toISOString(),
            visibility: nextVisibility,
            cracked,
            crackedAt,
            crackRolled,
          }
        : {
            id: nid('dy'),
            authorId: st.me.id,
            mood,
            text: body,
            date,
            createdAt: new Date().toISOString(),
            visibility: nextVisibility,
            cracked,
            crackedAt,
            crackRolled,
          }
      const entries = cur ? st.diary.entries.map((e) => (e.id === cur.id ? entry : e)) : [...st.diary.entries, entry]
      out = entry
      const diary: Diary = { entries }
      persist({ diary })
      return { diary }
    })
    return out
  },
  pushDiaryEntry: (e) =>
    set((st) => {
      // 同一天可以有多条；只按 id 防重复
      if (st.diary.entries.some((x) => x.id === e.id)) return {}
      const diary: Diary = { entries: [...st.diary.entries, e] }
      persist({ diary })
      return { diary }
    }),
  removeDiary: (id) =>
    set((st) => {
      const diary: Diary = { entries: st.diary.entries.filter((e) => e.id !== id) }
      persist({ diary })
      return { diary }
    }),

  /* ── 世界感知 ── */
  world: emptyWorld(),
  setWorldOffset: (offsetMin) =>
    set((st) => {
      const world: World = { ...st.world, offsetMin: Math.round(offsetMin) || 0 }
      persist({ world })
      return { world }
    }),
  addWorldSample: (s) =>
    set((st) => {
      const samples = [...st.world.samples, s].slice(-MAX_WORLD_SAMPLES)
      const world: World = { ...st.world, samples }
      persist({ world })
      return { world }
    }),
  removeWorldSample: (id) =>
    set((st) => {
      const world: World = { ...st.world, samples: st.world.samples.filter((x) => x.id !== id) }
      persist({ world })
      return { world }
    }),
  clearWorldSamples: () =>
    set((st) => {
      const world: World = { ...st.world, samples: [] }
      persist({ world })
      return { world }
    }),

  /* ── 查岗 ── */
  checkPhone: emptyCheckPhone(),
  pushCheck: (c) =>
    set((st) => {
      const checks = [...st.checkPhone.checks, c].slice(-MAX_CHECKS)
      const checkPhone: CheckPhone = { checks }
      persist({ checkPhone })
      return { checkPhone }
    }),
  updateCheck: (c) =>
    set((st) => {
      const checkPhone: CheckPhone = { checks: st.checkPhone.checks.map((x) => (x.id === c.id ? c : x)) }
      persist({ checkPhone })
      return { checkPhone }
    }),
  removeCheck: (id) =>
    set((st) => {
      const checkPhone: CheckPhone = { checks: st.checkPhone.checks.filter((x) => x.id !== id) }
      persist({ checkPhone })
      return { checkPhone }
    }),
  clearChecks: () =>
    set(() => {
      const checkPhone = emptyCheckPhone()
      persist({ checkPhone })
      return { checkPhone }
    }),

  /* ── 联网搜索推送 ── */
  searchPush: emptySearchPush(),
  addSearchLog: (l) =>
    set((st) => {
      const logs = [...st.searchPush.logs, l].slice(-MAX_SEARCH_LOGS)
      const searchPush: SearchPush = { logs }
      persist({ searchPush })
      return { searchPush }
    }),
  removeSearchLog: (id) =>
    set((st) => {
      const searchPush: SearchPush = { logs: st.searchPush.logs.filter((x) => x.id !== id) }
      persist({ searchPush })
      return { searchPush }
    }),
  clearSearchLogs: () =>
    set(() => {
      const searchPush = emptySearchPush()
      persist({ searchPush })
      return { searchPush }
    }),

  /* ── 情绪 / 意图标签 ── */
  emotionTags: [],
  upsertEmotionTag: (t) =>
    set((st) => {
      const exists = st.emotionTags.some((x) => x.id === t.id)
      const emotionTags = exists ? st.emotionTags.map((x) => (x.id === t.id ? t : x)) : [...st.emotionTags, t]
      persist({ emotionTags })
      return { emotionTags }
    }),
  removeEmotionTag: (id) =>
    set((st) => {
      const emotionTags = st.emotionTags.filter((x) => x.id !== id)
      persist({ emotionTags })
      return { emotionTags }
    }),
  toggleEmotionTag: (id) =>
    set((st) => {
      const emotionTags = st.emotionTags.map((x) => (x.id === id ? { ...x, enabled: x.enabled === false } : x))
      persist({ emotionTags })
      return { emotionTags }
    }),

  themeKey: 'light-blue',
  setTheme: (key) => {
    const preset = applyTheme(key)
    // 主题搭配的气泡色同步到「美化」，两者不再互相覆盖
    if (preset.bubble) {
      const { me, peer, ink } = preset.bubble
      useAppearanceStore.getState().setBubble({ me, ...(peer ? { peer } : {}), ...(ink ? { ink } : {}) })
    }
    persist({ themeKey: key })
    set({ themeKey: key })
  },

  bonded: true,
  setBonded: (v) => {
    persist({ bonded: v })
    set({ bonded: v })
  },

  hydrate: (s) => {
    applyTheme(s.themeKey)
    set({
      ready: true,
      themeKey: s.themeKey,
      me: s.me,
      dream: s.dream,
      anniversaries: s.anniversaries,
      bonded: s.bonded,
      pats: s.pats ?? defaultPats(),
      moments: s.moments ?? [],
      letters: s.letters ?? [],
      gifts: s.gifts?.length ? s.gifts : DEFAULT_GIFTS.map((g) => ({ ...g })),
      room: s.musicRoom ?? emptyRoom(),
      voices: s.voices ?? [],
      favorites: s.favorites ?? [],
      favoriteReasons: s.favoriteReasons?.length ? s.favoriteReasons : DEFAULT_FAVORITE_REASONS,
      questionPacks: s.questionPacks ?? [],
      quizSessions: s.quizSessions ?? [],
      companion: { ...emptyCompanion(), ...(s.companion ?? {}) },
      watchRoom: { ...emptyWatchRoom(), ...(s.watchRoom ?? {}) },
      readRoom: { ...emptyReadRoom(), ...(s.readRoom ?? {}) },
      diary: { ...emptyDiary(), ...(s.diary ?? {}) },
      world: { ...emptyWorld(), ...(s.world ?? {}) },
      checkPhone: { ...emptyCheckPhone(), ...(s.checkPhone ?? {}) },
      searchPush: { ...emptySearchPush(), ...(s.searchPush ?? {}) },
      emotionTags: s.emotionTags ?? [],
    })
  },
}))
