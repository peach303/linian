/* 前端共享类型（应与 packages/shared 保持一致，生产环境从 @linian/shared 引入） */

import type { ReplyTrace } from './engine'

export type CardType =
  | 'TEXT'
  | 'KAOMOJI'
  | 'EMOJI'
  | 'STICKER'
  | 'IMAGE'
  | 'PAT'
  | 'VOICE'
  | 'SENTENCE'

export type MessageKind =
  | 'TEXT'
  | 'CARD'
  | 'IMAGE'
  | 'VOICE'
  | 'PAT'
  | 'QUOTE'
  | 'CHOICE'
  | 'QUESTION'
  | 'RED_PACKET'
  | 'GIFT'
  | 'MUSIC_INVITE'
  | 'DOODLE'
  | 'CALL_EVENT'
  | 'SEARCH_PUSH'
  | 'SYSTEM'

export type MessageStatus = 'SENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'RECALLED' | 'FAILED'

/** 这句话在说谁：我 / 他自己 / 我们 */
export type MessageAbout = 'me' | 'him' | 'us'

/** 本意的来源：字卡自己跳的 / 他挑的 / 从我说过的话拾的 / 系统随机 / 他自己想的 */
export type MessageMeaningSource = 'card' | 'custom' | 'picked' | 'random' | 'engine'

/** 情绪 / 心意 / 意图 三合一标签 */
export interface EmotionTag {
  id: string
  name: string
  kind: 'EMOTION' | 'INTENTION' | 'HEART'
  color: string
  /**
   * 自定义标签的触发词：他/我说的话里命中任意一个，就把这个标签打上。
   * 内置标签没有这一项（走 compose.ts 里的正则表）。
   */
  words?: string[]
  /** 关掉的标签不参与推断（默认参与）；内置标签也可以关 */
  enabled?: boolean
  /** 内置标签（不可删，只能关） */
  builtin?: boolean
}

export interface UserProfile {
  id: string
  nickname: string
  avatarUrl: string
  isDream: boolean
}

export interface Message {
  id: string
  conversationId: string
  senderId: string
  kind: MessageKind
  status: MessageStatus
  text?: string
  /** 复杂载荷：红包金额/礼物信息/问卷选项/搜索结果… */
  payload?: Record<string, unknown>
  /** 主动消息 → 对话气泡左上角显示小爱心 */
  proactive?: boolean
  isVoice?: boolean
  audioUrl?: string
  audioDurationMs?: number
  quoteOf?: Pick<Message, 'id' | 'text' | 'senderId'>
  recalled?: boolean
  emotionTags?: string[]
  latencyMs?: number
  /** 引擎抽签轨迹（复盘用；对应 DB 的 messages.plan JSONB） */
  plan?: ReplyTrace
  /** 这句话的本意（长按问他，或引擎按概率自带） */
  meaning?: string
  /** 本意是在说谁 */
  about?: MessageAbout
  /** 本意是从哪来的：字卡 / 他挑的 / 拾取 / 随机 / 他自己 */
  meaningSource?: MessageMeaningSource
  /** 是不是我长按问出来的（引擎自带的不标） */
  meaningAsked?: boolean
  createdAt: string
}

export interface Anniversary {
  id: string
  title: string
  date: string
  recurring: boolean
  showOnHome: boolean
  icon?: string
  /** 主界面那张纪念日卡片的背景图（dataURL / 空 = 默认渐变） */
  bg?: string
  /** 卡片底部的小字，默认「相遇」 */
  caption?: string
  /** 备注（只在这张卡背面的编辑页里显示） */
  note?: string
}
/**
 * 收藏夹里的一条（聊天 / 字卡 / 语音 / 信件 / 朋友圈 / 推送）
 *
 * `owner` 是「谁收藏的」，`author` 是「这条内容是谁的」——
 * 所以「我收藏他的」和「他收藏我的」能分开摆，不会混成一锅。
 * 收藏的是**快照**：原消息 / 原信后来被删了，收藏里仍然看得到。
 */
export type FavoriteKind = 'MESSAGE' | 'VOICE' | 'LETTER' | 'MOMENT' | 'MUSIC'

export interface FavoriteItem {
  id: string
  /** 谁收藏的：我 / 他 */
  owner: 'me' | 'dream'
  /** 内容是谁的：我 / 他 */
  author: 'me' | 'dream'
  kind: FavoriteKind
  /** 原消息 / 信件 / 动态的 id（同一个人对同一条只收一次） */
  refId: string
  /** 列表标题 */
  title: string
  /** 正文摘要（完整内容尽量放 payload） */
  text: string
  /** 原消息 / 信 / 动态的快照（渲染用，不依赖原件还在） */
  payload?: Record<string, unknown>
  /** 他收藏我的时，给的理由 */
  reason?: string
  createdAt: string
}

/** 收藏的一段语音（他的 / 我的）—— 存在 `state.voices` 里，音频（dataURL）跟着 state 一起同步 */
export interface VoiceClip {
  id: string
  /** 谁说的 */
  speaker: 'peer' | 'me'
  /** 说的内容（他的语音 = 转写文本） */
  text: string
  /** 自定义名字（列表里显示，没填就用 text） */
  label?: string
  /** 音频（dataURL：换设备也听得到） */
  url: string
  durationMs: number
  voiceId?: string
  model?: string
  emotion?: string
  /** 从哪条消息收藏来的（用来判断「这条收过没有」+ 取消收藏） */
  messageId?: string
  /** 绑到哪张字卡（绑上之后抽到那张卡直接发这段音频，不再合成、不再花钱） */
  cardId?: string
  createdAt: string
}

/** 「+」扩展面板的入口 */
export type ExtendAction =
  | 'CALL'
  | 'IMAGE'
  | 'PAT'
  | 'CHOICE'
  | 'QUESTION'
  | 'RED_PACKET'
  | 'MUSIC'
  | 'GIFT'
  | 'DOODLE'

/** 拍一拍库：两句一拍，各自有后缀（微信的「拍了拍我的×××」） */
export type PatSide = 'mine' | 'his'

export interface PatEntry {
  id: string
  /** 后缀文案，例如「小脑袋」「脸颊 🐾」 */
  text: string
  /** 他的拍一拍池：关掉就不参与抽签（我的拍一拍点了就发，不需要开关） */
  enabled: boolean
  /** 系统自带（只能删不能改内容） */
  builtin?: boolean
}

export interface Conversation {
  id: string
  coupleId: string
  peer: UserProfile
  me: UserProfile
  lastMessage?: Message
  unread: number
  pinned?: boolean
}

/* ──────────── 「+」递东西：抉择 / 问卷（对应 DB 的 choices / questions） ──────────── */

export interface ChoiceOption {
  id: string
  label: string
}

/** 他答完的抉择：选了哪个 + 为什么（理由可能没有） */
export interface ChoiceAnswer {
  optionId: string
  reason?: string
  at: string
}

export interface ChoicePayload {
  question: string
  options: ChoiceOption[]
  answer?: ChoiceAnswer
}

/** 问卷的一题（单选 / 多选） */
export interface QuestionItem {
  id: string
  text: string
  multi: boolean
  options: ChoiceOption[]
}

export interface QuestionAnswerRow {
  itemId: string
  optionIds: string[]
  note?: string
}

export interface QuestionPayload {
  title: string
  items: QuestionItem[]
  answers?: QuestionAnswerRow[]
  /** 他交卷时补的一句备注 */
  note?: string
  submittedAt?: string
  /** 谁出的卷：我（聊天里「+ → 问卷」）还是他（功能里的题库来问你） */
  askedBy?: 'me' | 'him'
}

/** 功能 → 问卷里的题库（我导入 / 自己出的题，攒着让他来问） */
export interface QuestionPack {
  id: string
  title: string
  items: QuestionItem[]
  /** 自己建 / 从文件导入 / 系统自带 */
  source?: 'custom' | 'import' | 'builtin'
  createdAt: string
  updatedAt?: string
}

/** 默契问卷：两个人做同一套题，交卷后算一致率 */
export interface QuizSession {
  id: string
  /** 从哪个题库出的（题库后来删了也能看） */
  packId?: string
  title: string
  items: QuestionItem[]
  myAnswers?: QuestionAnswerRow[]
  hisAnswers?: QuestionAnswerRow[]
  /** 他这次认不认真（抽签；不认真时答案更随机） */
  serious?: boolean
  /** 默契度 0~100（双方都交卷后才有） */
  score?: number
  createdAt: string
  submittedAt?: string
}

/* ──────────── 红包 / 礼物（对应 DB 的 red_packets / gifts / gift_orders） ──────────── */

export interface RedPacketPayload {
  /** 金额（元） */
  amount: number
  /** 祝福语（红包封面上的那句话） */
  blessing: string
  /** 我发的时候是不是「随机金额」 */
  isRandom: boolean
  /** 谁拆开的：他拆我的 / 我拆他的 */
  claimed?: { byId: string; amount: number; at: string }
}

/** 礼物柜里的一件礼物（自定义的可以改名字 / 定价 / 换图） */
export interface GiftItem {
  id: string
  name: string
  price: number
  /** emoji 或图标 */
  icon: string
  /** 自定义图片（dataURL，存本机） */
  imageUrl?: string
  /** 这件礼物的默认卡片文案 */
  note?: string
  /** 系统自带（可删可改价，但不能改回默认） */
  builtin?: boolean
}

/** 送出去 / 收到的礼物 */
export interface GiftPayload {
  giftId: string
  name: string
  icon: string
  price: number
  imageUrl?: string
  /** 卡片上写的那句话 */
  note?: string
  /** 他收下了 */
  accepted?: { at: string; thanks?: string }
}

/* ─────────────────────── 通话（对应 DB 的 calls） ─────────────────────── */

export type CallOutcome = 'connect' | 'reject' | 'busy' | 'miss' | 'hangup'

/**
 * 通话记录。微信里通话是**一条消息**，所以这里存成 CALL_EVENT 的 payload：
 * 拨出时先落一条 `phase: 'CALLING'`，接通改 `TALKING`，挂断补上时长。
 */
export interface CallPayload {
  direction: 'out' | 'in'
  phase: 'CALLING' | 'TALKING' | 'ENDED' | 'MISSED'
  /** 结局（挂断后才知道：他先挂 / 我挂） */
  outcome?: CallOutcome
  /** 通话时长（秒），只有接通过才有 */
  durationSec?: number
  calledAt: string
  answeredAt?: string
  endedAt?: string
}

/* ─────────────────────── 音乐邀请 / 一起听 ─────────────────────── */

export interface MusicPayload {
  title: string
  artist: string
  /** 封面 emoji */
  cover?: string
  /** 他加入了 */
  joined?: { at: string }
  /** 这次一起听了几分钟（结束后回填） */
  listenMin?: number
  /** 他回推给我的那首（用于「他推的歌」卡片） */
  from?: 'me' | 'him'
  /** 邀请的是房间歌单里的哪一首（点进房间时直接选中） */
  trackId?: string
}

/* ─────────────────────── 涂鸦 ─────────────────────── */

/** 一笔：颜色 + 粗细 + 归一化坐标点（0~1，跟随画布缩放） */
export interface DoodleStroke {
  color: string
  width: number
  points: [number, number][]
}

export interface DoodlePayload {
  strokes: DoodleStroke[]
  /** 画布宽高比（宽/高），渲染时按这个撑开 */
  ratio: number
  /** 他画的那张（他回你一张涂鸦时用） */
  from?: 'me' | 'him'
  /** 他看完说的一句话 */
  comment?: string
}

/* ─────────────────────── 一起听（音乐房间） ─────────────────────── */

/**
 * 一首歌的来源
 *  - `local`   本机音频文件（Blob 存在 IndexedDB，**只在这台设备上**）
 *  - `url`     音频直链（任何合法可播的 http(s) 地址）
 *  - `netease` 网易云（用**官方外链播放器**播，进度/音量在它自己的控件里）
 *  - `title`   只有歌名（他推来的、或她只填了歌名）→ 显示，但不假装能播
 */
export type TrackSource =
  | { kind: 'local'; blobKey: string; mime?: string; size?: number }
  | { kind: 'url'; url: string }
  | { kind: 'netease'; songId: string; /** 代理音频流；旧记录没有就退回官方外链播放器 */ streamUrl?: string; /** 代理/镜像失败时的官方直链 */ fallbackUrl?: string }
  | { kind: 'title' }

export interface Track {
  id: string
  title: string
  artist: string
  /** 封面：emoji 或图片地址（网易云的封面是外链） */
  cover?: string
  source: TrackSource
  /** 谁加的 */
  addedBy: 'me' | 'him'
  addedAt: string
  /** 真的播出来的秒数（累计；代理音频流也算真播放） */
  playedSec?: number
  /** 他在这首上说过的话（说过就不再重复） */
  hisNote?: string
}

/** 房间里的消息（一起听时的对话，跟主聊天分开） */
export interface RoomMessage {
  id: string
  senderId: string
  text: string
  createdAt: string
}

/** 一起听房间（随 state 一起走；音频文件本身不进 state） */
export interface MusicRoom {
  tracks: Track[]
  currentId?: string
  /** 上次的播放位置（秒），下次进来接着听 */
  position?: number
  /** 一起听的累计秒数（真的播出来的时间，不是编的） */
  playedSec?: number
  /** 他也在听（进房间的时刻） */
  heJoinedAt?: string
  /** 他这次准备待到什么时候 */
  heStaysUntil?: string
  /** 播放模式：顺序 / 随机 / 单曲循环（他也可以改） */
  playMode?: 'list' | 'shuffle' | 'one'
  messages: RoomMessage[]
}

/* ─────────────────────── 陪伴（睡觉 / 学习 / 工作） ─────────────────────── */

/** 三种陪伴 */
export type CompanionMode = 'sleep' | 'study' | 'work'

/** 陪伴房间里的对话（跟主聊天分开，跟一起听一样的做法） */
export interface CompanionMessage {
  id: string
  senderId: string
  text: string
  createdAt: string
}

/** 正在进行的一次陪伴 */
export interface ActiveCompanion {
  id: string
  mode: CompanionMode
  startedAt: string
  /** 目标时长（分钟）；0 = 不定时，想陪多久陪多久 */
  plannedMin: number
  /** 背景图（本机上传的 dataURL / 外链），空则用模式自带的渐变 */
  backgroundUrl?: string
  /** 这次要做什么（「复习高数」这种） */
  note?: string
  /** 他什么时候来的（undefined = 还没来） */
  heJoinedAt?: string
  /** 他「先忙一会儿」的到场时间（只有他没空时才有） */
  heComingAt?: string
  /** 他准备什么时候先走 */
  heLeavesAt?: string
  /** 他已经说过话的节拍（10 分钟一个，说过的不重复） */
  saidBuckets?: number[]
}

/** 一次陪伴的记录（陪伴结束后落一条，`state.companion.sessions`） */
export interface CompanionSession {
  id: string
  mode: CompanionMode
  plannedMin: number
  /** 真正陪了多久（秒）—— 从开始到结束的真实时间，到点收尾的按目标时长封顶 */
  durationSec: number
  startedAt: string
  endedAt: string
  /** 我提前结束的（没到目标时长） */
  interrupted?: boolean
  /** 他来过没有 */
  heJoined: boolean
  /** 他先走了（没陪到底） */
  heLeftEarly?: boolean
  note?: string
  backgroundUrl?: string
}

/** 陪伴（随 state 一起走；背景图是 dataURL，跟着 state 同步） */
export interface Companion {
  active: ActiveCompanion | null
  messages: CompanionMessage[]
  /** 历史记录（时间正序） */
  sessions: CompanionSession[]
  /** 每种模式我换过的背景 */
  backgrounds: Partial<Record<CompanionMode, string>>
  /** 每种模式上次设的目标时长（分钟），下次进来默认带上 */
  plannedMin: Partial<Record<CompanionMode, number>>
}

/* ─────────────────────── 观影室（对应 DB 的 watch_rooms / watch_items） ─────────────────────── */

/**
 * 片子的来源。**能不能播、进度归谁管，全看这个**：
 *  - `local`    本机视频文件（Blob 只在 IndexedDB，不上传）→ `<video>` 真播，进度 / 时长都在我们手里
 *  - `url`      视频直链（mp4 / webm）→ 同上
 *  - `bilibili` B 站官方 iframe 播放器 → 播得出来，但**进度我们拿不到**（跨域），所以不算「一起看了多久」
 *  - `title`    只有片名（他随口推的一部）→ 播不了就明说，不假装
 */
export type WatchSourceKind = 'local' | 'url' | 'bilibili' | 'title'

export interface WatchItem {
  id: string
  title: string
  /** 封面：emoji 或图片 dataURL（没有就按类型给个默认） */
  cover?: string
  source: {
    kind: WatchSourceKind
    /** url 直链 */
    url?: string
    /** B 站 bvid（BVxxxx） */
    bvid?: string
    /** B 站分P，从 1 开始 */
    page?: number
    /** 本机文件的 IndexedDB key（`video:<id>`） */
    blobKey?: string
    /** 本机文件原文件名 / 直链，用来重新导入时提示 */
    label?: string
  }
  addedBy: 'me' | 'him'
  addedAt: string
  /** 他推这部片时说的那句 */
  note?: string
  /** 片长（毫秒）—— 只有我们自己放过的才有 */
  durationMs?: number
  /** 我看完的时间（有值 = 已看完） */
  finishedAt?: string
}

/** 他的弹幕。`atSec` 是「看了多少秒」这条时间轴上的位置（本机/直链才有意义） */
export interface WatchDanmaku {
  id: string
  itemId: string
  atSec: number
  text: string
  createdAt: string
}

/** 正在进行的一次观影 */
export interface ActiveWatch {
  id: string
  itemId: string
  startedAt: string
  /** 他什么时候进房间 */
  heJoinedAt?: string
  /** 他说的「一会儿再来」 → 到场时间（只有他没空时才有） */
  heComingAt?: string
  /** 他准备什么时候先走 */
  heLeavesAt?: string
  /** 他这次观影的那句房间发言已经说过了 */
  said?: boolean
  /** 开始这一次时的累计播放秒数（收尾时用差值算「这一场真的看了多久」） */
  basePlayedSec?: number
  /** 已经排出去的弹幕位置（秒），避免重复排 */
  plannedDanmaku?: number[]
}

/** 观影室（随 state 一起走；视频文件本身在本机 Blob 里） */
export interface WatchRoom {
  items: WatchItem[]
  /** 房间里的对话（跟一起听一样的做法） */
  messages: RoomMessage[]
  danmaku: WatchDanmaku[]
  /** 正在看的片子 */
  currentId?: string
  /** **真的看了多久**（秒；只有 `<video>` 在走才累加，B 站 / 只有片名的不算） */
  playedSec: number
  /** 每部片看到哪了（秒），下次接着看 */
  position: Record<string, number>
  active: ActiveWatch | null
}

/* ─────────────────────── 阅读室（对应 DB 的 read_rooms / read_annotations） ─────────────────────── */

/**
 * 书从哪儿来：
 *  - `local`  本机 txt / md / html / epub（正文解析出来存 IndexedDB 的 `book:<id>`，原文件不上传）→ 有真文本、真进度
 *  - `paste`  直接把一段正文粘进来 → 同上（段落少，也是一本真文本）
 *  - `title`  只有书名（他随口推的一本）→ **没有正文就没有进度**，不假装在读第几页
 */
export type ReadSourceKind = 'local' | 'paste' | 'title'

export interface ReadBook {
  id: string
  title: string
  author?: string
  cover?: string
  source: {
    kind: ReadSourceKind
    /** 正文存本机 IndexedDB 的 key（`book:<id>`），只有 local / paste 有 */
    blobKey?: string
    /** 本机文件原文件名 */
    label?: string
  }
  addedBy: 'me' | 'him'
  addedAt: string
  /** 他推这本书时说的那句 */
  note?: string
  /** 一共多少段（解析出来的真值；`title` 类没有） */
  paraCount?: number
  /** 一共多少字（真值，用来显示「读了 3% · 1200 字」） */
  charCount?: number
  /** 我读完的时间（有值 = 已读完） */
  finishedAt?: string
}

/** 他写在页边的东西：`MARK` = 手写批注（锚在某一段），`LINE` = 短句（读到那一段时才飘一下） */
export interface ReadMark {
  id: string
  bookId: string
  kind: 'MARK' | 'LINE'
  /** 锚在第几段（从 0 开始） */
  paraIndex: number
  text: string
  createdAt: string
}

/** 正在进行的一次共读 */
export interface ActiveRead {
  id: string
  bookId: string
  startedAt: string
  heJoinedAt?: string
  heComingAt?: string
  heLeavesAt?: string
  said?: boolean
  /** 开始这一次时的累计阅读秒数（收尾时用差值算「这一场真的读了多久」） */
  baseReadSec?: number
  /** 已经排出去的批注 / 短句位置（段号），避免重复排 */
  plannedMarks?: number[]
}

/** 阅读室（随 state 一起走；书的正文本体在本机 IndexedDB 里） */
export interface ReadRoom {
  books: ReadBook[]
  /** 房间里的话（跟一起听一样的做法） */
  messages: RoomMessage[]
  /** 他写在页边的批注与短句（排程时就定好并落库，读到那一段才显示） */
  marks: ReadMark[]
  currentId?: string
  /** **真的读了多久**（秒；书只有开着、页面在前台、并且最近还在翻页/滚动才累加） */
  readSec: number
  /** 每本书读到第几段（下次接着读） */
  position: Record<string, number>
  active: ActiveRead | null
}

/* ─────────────────────── 日记（同一天可以有很多条，对应 DB 的 diary_entries） ─────────────────────── */

/** 日记的心情（对应 `DiaryEntry.mood`） */
export type DiaryMood = '😊' | '😌' | '🥰' | '😐' | '😔' | '😪' | '🤔' | '🌙'

/**
 * 一条日记
 *
 * 不再限制「一天一条」：同一天可以写很多条，每条各自决定公开 / 私密。
 * `date` 是「归属日期」（`YYYY-MM-DD`），不是创建时刻：凌晨补写的仍算前一天，看的是 `date`。
 */
export interface DiaryEntry {
  id: string
  /** u_me / u_dream */
  authorId: string
  mood: DiaryMood
  text: string
  /** 归属日期 `YYYY-MM-DD`（同一天可以有多条） */
  date: string
  createdAt: string
  /** 我自己改过的话记一下（他的留言不会被我改） */
  editedAt?: string
  /** 他的留言里提到的、当天真的发生过的事（只记录，界面上写「取材自今天的真实记录」） */
  facts?: string[]
  /** 这条是引擎按天生成的（种子 = 日期）→ 刷新不重掷 */
  byEngine?: boolean
  /** 公开 / 私密（默认公开；私密只有我看得到，但他有 30% 概率破解） */
  visibility?: 'public' | 'private'
  /** 私密日记被他破解了（每条私密第一次保存时抽一次，之后不重掷） */
  cracked?: boolean
  crackedAt?: string
  /** 这条的 30% 是否已经掷过（公开时也保留，改回私密不会重新抽） */
  crackRolled?: boolean
}

/** 日记（随 state 一起走） */
export interface Diary {
  entries: DiaryEntry[]
}

/* ─────────────────────── 世界感知（对应 DB 的 world_sense_logs） ─────────────────────── */

/** 他那边一天里的时段（决定「他可能在干嘛」的基调；他那边的时间是用时差真换算出来的） */
export type WorldBucket = '凌晨' | '早上' | '上午' | '中午' | '下午' | '傍晚' | '晚上' | '深夜'

/**
 * 一条「他那边」的采样
 *
 * 真的部分：`sampledAt`（我这边的采样时刻）· `offsetMin`（我设的时差）· `hisClock`（**真的换算出来的**他那边的钟点）。
 * 抽的部分：`status` / `doing`（种子 = 日期 + 采样槽 → 同一段时间里反复看是同一个答案）。
 * 没有的部分：`weather` —— 没接天气源，所以一直是 `null`，界面上照实说，不编。
 */
export interface WorldSample {
  id: string
  /** 采样时刻（本机时间，ISO） */
  sampledAt: string
  /** 采样当时的时差（分钟；正 = 他那边比我快） */
  offsetMin: number
  /** 他那边的本地时间 `HH:mm`（真换算） */
  hisClock: string
  bucket: WorldBucket
  /** 他那边的状态（抽签；`undefined` = 这一次不带状态） */
  status?: string
  /** 正在做的事（抽签） */
  doing?: string
  /** 天气：**本机没有天气源** → 恒为 `null` */
  weather: string | null
}

/** 世界感知（随 state 一起走） */
export interface World {
  /** 我设的时差（分钟；正 = 他那边比我快）—— 这是**设定**，不是测量出来的 */
  offsetMin: number
  /** 采样记录（倒序显示，只留最近 `MAX_WORLD_SAMPLES` 条） */
  samples: WorldSample[]
}

/* ─────────────────────── 查岗（对应 DB 的 check_requests） ─────────────────────── */

export type CheckType = 'PHONE' | 'LOCATION'

/** 和多端设计（`enum CheckStatus`）一致 */
export type CheckStatus = 'REQUESTED' | 'AGREED' | 'REFUSED' | 'EXPIRED'

/**
 * 一份查岗报告 —— **分成两堆，界面上一眼能分清**
 *
 * `facts` 是真的：全部从本机记录现算（他最后一条消息 / 今天发了几条 / 最近一次一起做点什么 /
 * 今天写没写日记 / 他从你这儿拾走过什么 / 他的字卡库有多少张）。
 * `faked` 是抽的：定位、手机屏幕上看到的东西 —— **我们拿不到这些**，所以标明「抽的」，不假装是真的。
 */
export interface CheckReport {
  facts: string[]
  faked: string[]
  /** 他给的是「修饰过」的版本（对应 `checkPhone.fakeInfoP`） */
  polished?: boolean
  /** 他当时说的那一句（拒绝时也留在这儿，记录卡片上能看见） */
  line?: string
}

export interface CheckRequest {
  id: string
  /** u_me / u_dream */
  requesterId: string
  targetId: string
  type: CheckType
  status: CheckStatus
  /** 发起时带的一句话 */
  note?: string
  /** 他大约什么时候回应（种子 = 请求 id；到点由引擎结算 —— 不存定时任务表） */
  respondAt: string
  result?: CheckReport
  requestedAt: string
  respondedAt?: string
}

/** 查岗（随 state 一起走） */
export interface CheckPhone {
  checks: CheckRequest[]
}

/* ─────────────────────── 联网搜索推送（对应 DB 的 search_pushes） ─────────────────────── */

/**
 * 一次搜索尝试的记录 —— **成功和失败都记**
 *
 * 这个模块最容易造假：编一条「他上网看到……」谁也查不出来。所以这里的规矩是：
 * 搜到了才推一张卡（标题 / 链接 / 摘要都是搜索服务**真返回**的），
 * 搜不到（没配 Key / 连不上外网 / 被限流 / 一条结果都没有）就**一条消息都不发**，
 * 只在这里记一条失败 —— 界面上能看见「上次为什么没搜到」，不给任何假结果。
 */
export interface SearchLog {
  id: string
  /** 尝试时刻（本机时间，ISO） */
  at: string
  /** 这一槽用的主题（种子抽出来的） */
  topic: string
  /** 这一槽的编号（`日期 + 槽` 决定同一个间隔里只试一次） */
  slot: number
  ok: boolean
  /** 成功：真返回的第一条（标题 / 链接 / 站点） */
  title?: string
  url?: string
  siteName?: string
  /** 成功：推出去的卡片是什么形态 */
  media?: 'link' | 'image' | 'video'
  /** 成功：这次形态的说明（「视频页 00:38（域名是视频站）」/「纯链接（图都没验过：防盗链）」） */
  note?: string
  /** 失败原因（人话，界面上直接显示） */
  error?: string
  /** 失败细节（HTTP 状态 / 上游原话） */
  detail?: string
}

/** 联网搜索推送（随 state 一起走；只留最近 `MAX_SEARCH_LOGS` 条） */
export interface SearchPush {
  logs: SearchLog[]
}

/* ─────────────────────── 朋友圈（对应 DB 的 moments / moment_comments） ─────────────────────── */

export interface MomentComment {
  id: string
  /** 谁评论的：u_me / u_dream */
  authorId: string
  text: string
  /** 回复某条评论（对应 `rule_configs.moment.replyMyReply`） */
  replyToId?: string
  createdAt: string
}

export interface Moment {
  id: string
  authorId: string
  text: string
  /** 配图：本机存的占位色块 / dataURL */
  images: string[]
  /** 分享的音乐 */
  music?: { title: string; url: string }
  /** 点赞的人（存 id，渲染时换成昵称） */
  likes: string[]
  comments: MomentComment[]
  /** 他主动发的动态 → 卡片左上角 ❤️（对应 `proactive_jobs`） */
  proactive?: boolean
  createdAt: string
}

/* ─────────────────────── 信箱（对应 DB 的 letters / letter_annotations） ─────────────────────── */

/** 信纸上的蓝色手写批注（锚定到信里的一句话） */
export interface LetterAnnotation {
  id: string
  /** 被批注的那句话原文（用来在信里定位） */
  anchor: string
  text: string
  createdAt: string
}

/** UNREAD=他寄来我还没看 · READ=看过了 · PENDING=我寄出等他回信 · REPLIED=已回信 */
export type LetterStatus = 'UNREAD' | 'READ' | 'PENDING' | 'REPLIED'

export interface Letter {
  id: string
  fromId: string
  toId: string
  title: string
  body: string
  status: LetterStatus
  /** 回信指向原信 */
  replyToId?: string
  /** 他写在这封信（我写的信）上的蓝色批注 */
  annotations: LetterAnnotation[]
  /** 随信附上的图片（本机上上传的 dataURL；旧信没有这个字段） */
  images?: string[]
  /** 他主动寄来的信 → 列表里带 ❤️（对应 `proactive.letter`） */
  proactive?: boolean
  createdAt: string
}
