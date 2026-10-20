/**
 * 日记的纯工具
 *
 * 日记不再限制「一天一条」：同一天可以写很多条，每条各自有公开 / 私密。
 * `date` 只用来把日记归到哪一天（凌晨补写的仍算前一天），看的是 `date` 不是创建时刻。
 *
 * 两个原则：
 *   ① `date` 是**归属日期**（本地时区的 `YYYY-MM-DD`）；
 *   ② 他的留言里提到的每一件事都必须**今天真的发生过**——`collectFacts()` 只从今天的真实记录里数，
 *      没发生过就一条都不给（宁可不提，也不编）。
 */
import type { CompanionMode, Diary, DiaryEntry, DiaryMood, Letter, Message, Moment } from '@/types'
import type { CompanionSession } from '@/types'

/** 心情（对应 `DiaryEntry.mood`） */
export const DIARY_MOODS: { mood: DiaryMood; label: string }[] = [
  { mood: '😊', label: '挺好' },
  { mood: '🥰', label: '很喜欢' },
  { mood: '😌', label: '平静' },
  { mood: '🤔', label: '在想事' },
  { mood: '😐', label: '一般' },
  { mood: '😪', label: '有点累' },
  { mood: '😔', label: '低落' },
  { mood: '🌙', label: '夜深了' },
]

/** 他觉得适合深夜写留言的那几种心情（抽签用，别一上来就「低落」） */
export const HIS_MOODS: DiaryMood[] = ['😌', '🥰', '😊', '🌙', '🤔']

const pad = (n: number) => String(n).padStart(2, '0')

/** 归属日期键：本地时区的 `YYYY-MM-DD`（跟 `proactive.ts` 的 dayKey 同一个口径，带零填充） */
export const dayKeyOf = (d: Date | string | number): string => {
  const t = d instanceof Date ? d : new Date(d)
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`
}

export const todayKey = () => dayKeyOf(new Date())

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** `2026-10-19` → `10 月 19 日 · 周一` */
export function humanDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map((x) => Number.parseInt(x, 10))
  if (!y || !m || !d) return dateKey
  const w = WEEK[new Date(y, m - 1, d).getDay()] ?? ''
  return `${m} 月 ${d} 日 · ${w}`
}

/** 某个人在某一天写的所有日记（按写下的先后排） */
export const entriesOf = (diary: Diary | undefined, authorId: string, date: string): DiaryEntry[] =>
  (diary?.entries ?? [])
    .filter((e) => e.authorId === authorId && e.date === date)
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))

/** 某一天的所有日记（两个人混在一起，按写下的先后排） */
export const entriesOnDay = (diary: Diary | undefined, date: string): DiaryEntry[] =>
  (diary?.entries ?? [])
    .filter((e) => e.date === date)
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))

/** 兼容旧调用：取某个人某一天最后写的那条（没有就是 undefined） */
export const entryOf = (diary: Diary | undefined, authorId: string, date: string): DiaryEntry | undefined =>
  entriesOf(diary, authorId, date).at(-1)

/** 有内容的日子（倒序）—— 只要有一方写了，这一天就值得列出来 */
export function daysWithEntries(diary: Diary | undefined): string[] {
  const set = new Set((diary?.entries ?? []).map((e) => e.date))
  return [...set].sort((a, b) => b.localeCompare(a))
}
export function humanDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  if (s < 60) return `${s} 秒`
  const min = Math.round(s / 60)
  if (min < 60) return `${min} 分钟`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} 小时 ${m} 分钟` : `${h} 小时`
}

const COMPANION_LABEL: Record<CompanionMode, string> = { sleep: '睡觉', study: '学习', work: '工作' }

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0)

export interface DiaryFactInput {
  /** 聊天记录（已含 SYSTEM：通话 / 红包 / 一起看片读书都在里面） */
  messages: Message[]
  meId: string
  /** 归属日期 */
  date: string
  /** 陪伴记录（按 `startedAt` 归属到某天） */
  companionSessions?: CompanionSession[]
  moments?: Moment[]
  letters?: Letter[]
}

/**
 * 今天（`date` 那天）真的发生过什么
 *
 * 只数真的有的，返回一串人话短语；一条都没有就返回 `[]`（调用方就不会提「今天」）。
 * 顺序 = 从他留言的角度排的轻重（先聊了什么，再是一起做过的事）。
 */
export function collectFacts(input: DiaryFactInput): string[] {
  const { messages, meId, date, companionSessions = [], moments = [], letters = [] } = input
  const onDay = (iso?: string) => Boolean(iso) && dayKeyOf(iso!) === date

  const facts: string[] = []

  /* ① 聊天：只算「说出来的话」——安静类（系统 / 通话事件）和「东西」（红包 / 卡片 / 语音）
     都不算「聊天条数」，它们在下面对应的那几条里各报各的 */
  const NOT_TALK = ['SYSTEM', 'CALL_EVENT', 'SEARCH_PUSH', 'RED_PACKET', 'CARD', 'GIFT', 'MUSIC_INVITE', 'VOICE']
  const talk = messages.filter((m) => onDay(m.createdAt) && !NOT_TALK.includes(m.kind))
  if (talk.length) {
    const mine = talk.filter((m) => m.senderId === meId).length
    const his = talk.length - mine
    facts.push(`我们聊了 ${talk.length} 条消息（我 ${mine} 条 / 他 ${his} 条）`)
  }

  /* ② 语音 */
  const voices = messages.filter((m) => onDay(m.createdAt) && m.kind === 'VOICE')
  if (voices.length) {
    const mine = voices.filter((m) => m.senderId === meId).length
    if (mine && mine === voices.length) facts.push(`我给他发了 ${mine} 条语音`)
    else if (!mine) facts.push(`他给我发了 ${voices.length} 条语音`)
    else facts.push(`来回发了 ${voices.length} 条语音`)
  }

  /* ③ 通话（读 CALL_EVENT 的 payload：只认真的接通了的那种） */
  const calls = messages.filter(
    (m) => onDay(m.createdAt) && m.kind === 'CALL_EVENT' && m.payload?.phase === 'ENDED' && m.payload?.outcome !== 'MISSED',
  )
  if (calls.length) {
    const total = calls.reduce((n, m) => n + num(m.payload?.durationSec), 0)
    facts.push(total > 0 ? `通了一次话（${humanDuration(total)}）` : '通了一次话')
  }

  /* ④ 红包（我发的 / 他发的，分清楚谁给谁） */
  const packets = messages.filter((m) => onDay(m.createdAt) && m.kind === 'RED_PACKET')
  const minePackets = packets.filter((m) => m.senderId === meId).length
  const hisPackets = packets.length - minePackets
  if (minePackets) facts.push(minePackets > 1 ? `我给他发了 ${minePackets} 个红包` : '我给他发了个红包')
  if (hisPackets) facts.push(hisPackets > 1 ? `他给我发了 ${hisPackets} 个红包` : '他给我发了个红包')

  /* ⑤ 递出去的东西：礼物 / 音乐邀请（有的是独立 kind，有的是字卡上的 cardType，两处都认） */
  const today = messages.filter((m) => onDay(m.createdAt))
  const isKind = (m: Message, kind: string, cardType: string) =>
    m.kind === kind || (m.kind === 'CARD' && m.payload?.cardType === cardType)
  const gifts = today.filter((m) => isKind(m, 'GIFT', 'GIFT')).length
  const musicInvites = today.filter((m) => isKind(m, 'MUSIC_INVITE', 'MUSIC_INVITE')).length
  if (gifts) facts.push(`收到了 ${gifts} 件礼物`)
  if (musicInvites) facts.push('一起听了会儿歌')

  /* ⑥ 一起看片 / 一起读（收尾时落在聊天里的 `SYSTEM`，payload 里有真的时长） */
  type SessionPayload = { title?: string; readSec?: number; playedSec?: number }
  const payloadOf = (m: Message, key: 'watch' | 'read'): SessionPayload | undefined =>
    (m.payload as Record<string, SessionPayload> | undefined)?.[key]

  const watched = messages.filter((m) => onDay(m.createdAt) && payloadOf(m, 'watch')?.title)
  for (const m of watched) {
    const w = payloadOf(m, 'watch')!
    const sec = num(w.readSec ?? w.playedSec)
    facts.push(`一起看了《${w.title}》${sec > 0 ? `（${humanDuration(sec)}）` : ''}`)
  }
  const read = messages.filter((m) => onDay(m.createdAt) && payloadOf(m, 'read')?.title)
  for (const m of read) {
    const r = payloadOf(m, 'read')!
    const sec = num(r.readSec)
    facts.push(`一起读了《${r.title}》${sec > 0 ? `（${humanDuration(sec)}）` : ''}`)
  }

  /* ⑦ 陪伴（按 startedAt 归属；同一模式同一天只算一次，报最长的那个） */
  const comp = companionSessions.filter((s) => dayKeyOf(s.startedAt) === date)
  const byMode = new Map<CompanionMode, number>()
  for (const s of comp) byMode.set(s.mode, Math.max(byMode.get(s.mode) ?? 0, num(s.durationSec)))
  for (const [mode, sec] of byMode) {
    facts.push(sec > 0 ? `陪我${COMPANION_LABEL[mode]} ${humanDuration(sec)}` : `陪我${COMPANION_LABEL[mode]}`)
  }

  /* ⑧ 朋友圈：他今天发了动态 / 点赞 / 评论（只说他做的，不替我数） */
  const momentIds = new Set(moments.filter((m) => m.authorId === meId).map((m) => m.id))
  const hisMoments = moments.filter((m) => onDay(m.createdAt) && m.authorId !== meId)
  const hisLikes = moments.filter((m) => momentIds.has(m.id) && (m.likes ?? []).includes('u_dream')).length
  const hisComments = moments.reduce(
    (n, m) => n + (momentIds.has(m.id) ? (m.comments ?? []).filter((c) => c.authorId !== meId && onDay(c.createdAt)).length : 0),
    0,
  )
  if (hisMoments.length) facts.push(`他发了 ${hisMoments.length} 条朋友圈`)
  if (hisLikes) facts.push(`他在我朋友圈点了 ${hisLikes} 个赞`)
  if (hisComments) facts.push(`他在我朋友圈评论了 ${hisComments} 句`)

  /* ⑨ 信箱：他今天寄来的信 / 回信 */
  const hisLetters = letters.filter((l) => l.fromId !== meId && onDay(l.createdAt))
  if (hisLetters.length) facts.push(`他给我写了${hisLetters.length > 1 ? ' ' + hisLetters.length + ' 封' : '一封'}信`)

  return facts
}
