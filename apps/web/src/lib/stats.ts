/**
 * 统计 / 适应度：**全部从真实数据里算**（聊天记录、字卡库里抽到的卡、通话、红包、陪伴记录…）
 *
 * 一条不伪造的原则：这里每一个数字都能追到一条消息 / 一条记录 /
 * 一次抽签轨迹（`messages.plan`）。算不出来的（比如「网易云曲目播了多久」）就不进统计表，
 * 宁可少一个数字，也不摆一个好看的假数字。
 *
 * 「他适应我了吗」的判据也只有真的能测的那几个：
 *   · 他抽了我哪些卡（`plan.cardIds`，按「一轮」去重 —— 一次抽签发几条不重复计数）
 *   · 我说话 → 他回不回、隔多久回（`latencyMs`）
 *   · 他从我的话里拾取了多少张卡（`Card.source === 'PICKED'`）
 */
import type { Card } from '@/types/cards'
import type { Companion, GiftItem, Letter, Message, Moment, MusicRoom, VoiceClip } from '@/types'

/* ─────────────────────────── 一轮对话 ─────────────────────────── */

/** 一轮 = 我发一句 → 他回的那几条（他主动来的那种也算一轮，只是没有我那句） */
export interface Turn {
  at: string
  myText?: string
  his: Message[]
  /** 这一轮抽到的卡（同一条轨迹只算一次） */
  cardIds: string[]
  carrier?: string
  /** 他的第一条隔了多久（秒） */
  latencySec?: number
  silent: boolean
  recalled: boolean
  proactive: boolean
}

/** 系统类消息（居中提示 / 通话记录 / 搜索推送）不参与「一轮对话」 */
const QUIET: Message['kind'][] = ['SYSTEM', 'SEARCH_PUSH', 'CALL_EVENT']

/**
 * 把消息切成「一轮一轮」
 * 规则很朴素：我的消息开一轮，后面他的消息都算这一轮；他主动来的一轮没有我那句。
 */
export function buildTurns(messages: Message[], meId: string): Turn[] {
  const turns: Turn[] = []
  const sorted = [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  const empty = (at: string): Turn => ({ at, his: [], cardIds: [], silent: false, recalled: false, proactive: false })

  for (const m of sorted) {
    if (QUIET.includes(m.kind)) continue
    const mine = m.senderId === meId
    const last = turns.at(-1)
    if (mine) {
      turns.push({ ...empty(m.createdAt), myText: m.text })
      continue
    }
    const t = last && last.his.length === 0 && !last.proactive ? last : null
    const turn = t ?? empty(m.createdAt)
    if (!t) turns.push(turn)
    turn.his.push(m)
    // 抽签轨迹：同一条轨迹里几张卡只算一次（多字卡拼接发 3 条 ≠ 抽了 3 次）
    if (m.plan?.cardIds?.length) {
      m.plan.cardIds.forEach((id) => {
        if (!turn.cardIds.includes(id)) turn.cardIds.push(id)
      })
    }
    turn.carrier = turn.carrier ?? m.plan?.carrier
    turn.silent = turn.silent || Boolean(m.plan?.silent)
    turn.recalled = turn.recalled || Boolean(m.recalled || m.plan?.recalled)
    turn.proactive = turn.proactive || Boolean(m.proactive)
    const latency = m.latencyMs
    if (latency != null && turn.latencySec == null) turn.latencySec = Math.round(latency / 1000)
  }
  return turns
}

/* ─────────────────────────── 高频词（粗切） ─────────────────────────── */

/** 这些字当「词头/词尾」基本没信息量，直接从二元组里剔掉 */
const STOP_CHARS = new Set('的了是我你他她它在有也就很都又和与这那什么吗呢吧啊呀哦嗯个不没给要会想一二三上下大小好来去说看对把被从到把'.split(''))
const SEG_SPLIT = /[^\u4e00-\u9fa5a-zA-Z0-9]+/

/**
 * 中文没有分词库，这里用**二元组粗切**（「今天天气」→ 今天/天天/天气），
 * 再按出现次数排。界面上会写清是粗切，不当成正经分词结果。
 */
export function topWords(texts: string[], min = 2, top = 12): { word: string; count: number }[] {
  const bag = new Map<string, number>()
  for (const text of texts) {
    if (!text) continue
    for (const seg of text.split(SEG_SPLIT)) {
      if (!seg) continue
      if (!/[\u4e00-\u9fa5]/.test(seg)) {
        if (seg.length >= 2 && seg.length <= 12) bag.set(seg.toLowerCase(), (bag.get(seg.toLowerCase()) ?? 0) + 1)
        continue
      }
      for (let i = 0; i + 2 <= seg.length; i++) {
        const g = seg.slice(i, i + 2)
        if (STOP_CHARS.has(g[0]) || STOP_CHARS.has(g[1])) continue
        bag.set(g, (bag.get(g) ?? 0) + 1)
      }
    }
  }
  return [...bag.entries()]
    .filter(([, n]) => n >= min)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, top)
    .map(([word, count]) => ({ word, count }))
}

/* ─────────────────────────── 统计 ─────────────────────────── */

export interface KindCount {
  kind: Message['kind']
  count: number
  mine: number
  his: number
}

export interface CallStats {
  count: number
  /** 接通的那几通 */
  connected: number
  totalSec: number
  avgSec: number
  longestSec: number
  /** 没接：拒接 / 忙线 / 无人接听 */
  missed: number
  himHungUp: number
}

export interface RedPacketStats {
  count: number
  total: number
  max: number
  mine: number
  his: number
}

export interface GiftStats {
  count: number
  total: number
  /** 送得最多的那件 */
  top?: { name: string; icon: string; count: number }
}

export interface MusicStats {
  tracks: number
  playedSec: number
  /** 房间里的对话（跟主聊天分开的那份） */
  roomMessages: number
  invites: number
}

export interface CompanionStats {
  sessions: number
  totalSec: number
  byMode: { mode: string; sessions: number; totalSec: number }[]
  /** 他没来的次数 / 先走的次数（都是真实记录） */
  heMissed: number
  heLeftEarly: number
  interrupted: number
}

export interface VoiceStats {
  count: number
  totalMs: number
  /** 真的花了钱合成的（MiniMax） */
  byMinimax: number
  /** 来自语音字卡的现成音频 */
  byCard: number
  /** 我自己录的 */
  byMe: number
}

export interface Stats {
  messages: number
  mine: number
  his: number
  /** 消息覆盖了多少天 */
  days: number
  firstAt?: string
  lastAt?: string
  kinds: KindCount[]
  turns: Turn[]
  /** 我发了多少轮 */
  myTurns: number
  /** 他回了多少轮 */
  repliedTurns: number
  /** 已读不回（抽签命中，他看见没回） */
  silentTurns: number
  /** 没回（不是已读不回的那种，比如递了张卡） */
  noReplyTurns: number
  avgLatencySec?: number
  /** 按载体的实际分布（从抽签轨迹来） */
  carriers: { carrier: string; count: number }[]
  /** 抽到过的卡：id → 次数 */
  cardDraws: { id: string; count: number }[]
  /** 14 天柱状（从最早到今天，只取最近 14 天） */
  daily: { date: string; count: number }[]
  /** 他的活跃时段（24 个小格） */
  hourly: number[]
  wordsMine: { word: string; count: number }[]
  wordsHis: { word: string; count: number }[]
  calls: CallStats
  redPackets: RedPacketStats
  gifts: GiftStats
  music: MusicStats
  companion: CompanionStats
  voices: VoiceStats
  pats: { mine: number; his: number }
  proactive: number
  recalled: number
  quotes: number
  emotions: { tag: string; count: number }[]
  /** 字卡库里有多少张被真的抽到过 */
  cardsUsed: number
  cardsTotal: number
  /** 拾取来的卡（从我说过的话里收的） */
  picked: number
}

export interface StatsInput {
  messages: Message[]
  cards: Card[]
  companion: Companion
  room: MusicRoom
  moments: Moment[]
  letters: Letter[]
  gifts: GiftItem[]
  voices: VoiceClip[]
  pats: { mine: unknown[]; his: unknown[] }
  meId: string
}

const dayKey = (iso: string) => {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

export function computeStats(input: StatsInput): Stats {
  const { messages, cards, meId } = input
  const mine = messages.filter((m) => m.senderId === meId)
  const his = messages.filter((m) => m.senderId !== meId)
  const turns = buildTurns(messages, meId)

  /* 消息构成 */
  const kindMap = new Map<Message['kind'], KindCount>()
  for (const m of messages) {
    const row = kindMap.get(m.kind) ?? { kind: m.kind, count: 0, mine: 0, his: 0 }
    row.count++
    if (m.senderId === meId) row.mine++
    else row.his++
    kindMap.set(m.kind, row)
  }

  /* 语音 */
  const voices: VoiceStats = { count: 0, totalMs: 0, byMinimax: 0, byCard: 0, byMe: 0 }
  for (const m of messages.filter((m) => m.kind === 'VOICE')) {
    voices.count++
    voices.totalMs += num(m.audioDurationMs ?? m.payload?.durationMs)
    const via = str(m.payload?.via)
    if (via === 'MiniMax') voices.byMinimax++
    else if (via === '语音卡') voices.byCard++
    else if (m.senderId === meId) voices.byMe++
  }

  /* 通话：一通电话是一条 CALL_EVENT（CALLING → TALKING → ENDED / MISSED） */
  const calls: CallStats = { count: 0, connected: 0, totalSec: 0, avgSec: 0, longestSec: 0, missed: 0, himHungUp: 0 }
  for (const m of messages.filter((m) => m.kind === 'CALL_EVENT')) {
    const p = (m.payload ?? {}) as Record<string, unknown>
    if (p.phase === 'CALLING') continue // 还在响 / 中断没落地的，不算一通
    calls.count++
    const sec = num(p.durationSec)
    calls.totalSec += sec
    calls.longestSec = Math.max(calls.longestSec, sec)
    const outcome = str(p.outcome)
    if (p.phase === 'ENDED' && outcome !== 'miss') calls.connected++
    else calls.missed++
    if (outcome === 'hangup') calls.himHungUp++
  }
  calls.avgSec = calls.count ? Math.round(calls.totalSec / calls.count) : 0

  /* 红包 */
  const rp: RedPacketStats = { count: 0, total: 0, max: 0, mine: 0, his: 0 }
  for (const m of messages.filter((m) => m.kind === 'RED_PACKET')) {
    const amount = num(m.payload?.amount)
    rp.count++
    rp.total += amount
    rp.max = Math.max(rp.max, amount)
    if (m.senderId === meId) rp.mine++
    else rp.his++
  }

  /* 礼物 */
  const giftBag = new Map<string, { name: string; icon: string; count: number }>()
  let giftTotal = 0
  let giftCount = 0
  for (const m of messages.filter((m) => m.kind === 'GIFT')) {
    const name = str(m.payload?.name) || m.text || '礼物'
    const icon = str(m.payload?.icon) || '🎁'
    const cur = giftBag.get(name) ?? { name, icon, count: 0 }
    cur.count++
    giftBag.set(name, cur)
    giftTotal += num(m.payload?.price)
    giftCount++
  }
  const topGift = [...giftBag.values()].sort((a, b) => b.count - a.count)[0]

  /* 他的活跃时段（按本地时间的钟点） */
  const hourly = Array.from({ length: 24 }, () => 0)
  for (const m of his) hourly[new Date(m.createdAt).getHours()]++

  /* 最近 14 天 */
  const spanDays = new Set(messages.map((m) => dayKey(m.createdAt)))
  const daily: { date: string; count: number }[] = []
  const today = new Date()
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)
    const key = dayKey(d.toISOString())
    daily.push({ date: key, count: messages.filter((m) => dayKey(m.createdAt) === key).length })
  }

  /* 载体分布 + 抽到的卡 */
  const carrierBag = new Map<string, number>()
  const cardBag = new Map<string, number>()
  for (const t of turns) {
    if (t.carrier) carrierBag.set(t.carrier, (carrierBag.get(t.carrier) ?? 0) + 1)
    t.cardIds.forEach((id) => cardBag.set(id, (cardBag.get(id) ?? 0) + 1))
  }

  /* 回应率 / 延迟 */
  const myTurns = turns.filter((t) => t.myText !== undefined)
  const replied = myTurns.filter((t) => t.his.length > 0)
  const latencies = turns.map((t) => t.latencySec).filter((x): x is number => x != null)

  /* 情绪标签 */
  const emoBag = new Map<string, number>()
  for (const m of messages) for (const tag of m.emotionTags ?? []) emoBag.set(tag, (emoBag.get(tag) ?? 0) + 1)

  /* 陪伴（记录现算） */
  const byMode = ['sleep', 'study', 'work'].map((mode) => {
    const list = (input.companion.sessions ?? []).filter((s) => s.mode === mode)
    return { mode, sessions: list.length, totalSec: list.reduce((n, s) => n + (s.durationSec || 0), 0) }
  })
  const sessions = input.companion.sessions ?? []

  const dayCount = spanDays.size

  return {
    messages: messages.length,
    mine: mine.length,
    his: his.length,
    days: dayCount,
    firstAt: messages.length ? [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0].createdAt : undefined,
    lastAt: messages.length ? [...messages].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0].createdAt : undefined,
    kinds: [...kindMap.values()].sort((a, b) => b.count - a.count),
    turns,
    myTurns: myTurns.length,
    repliedTurns: replied.length,
    silentTurns: turns.filter((t) => t.silent).length,
    noReplyTurns: myTurns.filter((t) => t.his.length === 0 && !t.silent).length,
    avgLatencySec: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : undefined,
    carriers: [...carrierBag.entries()].map(([carrier, count]) => ({ carrier, count })).sort((a, b) => b.count - a.count),
    cardDraws: [...cardBag.entries()].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count),
    daily,
    hourly,
    wordsMine: topWords(mine.map((m) => m.text ?? '')),
    wordsHis: topWords(his.map((m) => m.text ?? '')),
    calls,
    redPackets: rp,
    gifts: { count: giftCount, total: giftTotal, top: topGift },
    music: {
      tracks: input.room.tracks?.length ?? 0,
      playedSec: input.room.playedSec ?? 0,
      roomMessages: input.room.messages?.length ?? 0,
      invites: messages.filter((m) => m.kind === 'MUSIC_INVITE').length,
    },
    companion: {
      sessions: sessions.length,
      totalSec: sessions.reduce((n, s) => n + (s.durationSec || 0), 0),
      byMode,
      heMissed: sessions.filter((s) => !s.heJoined).length,
      heLeftEarly: sessions.filter((s) => s.heLeftEarly).length,
      interrupted: sessions.filter((s) => s.interrupted).length,
    },
    voices,
    pats: {
      mine: messages.filter((m) => m.kind === 'PAT' && m.senderId === meId).length,
      his: messages.filter((m) => m.kind === 'PAT' && m.senderId !== meId).length,
    },
    proactive: messages.filter((m) => m.proactive).length,
    recalled: messages.filter((m) => m.recalled).length,
    quotes: messages.filter((m) => m.quoteOf).length,
    emotions: [...emoBag.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count),
    cardsUsed: cardBag.size,
    cardsTotal: cards.length,
    picked: cards.filter((c) => c.source === 'PICKED').length,
  }
}

/* ─────────────────────────── 适应度 ─────────────────────────── */

export interface FitnessCard {
  card: Card
  /** 被抽中的轮数（同一轮里发多条只算一次） */
  drawn: number
}

export interface Fitness {
  /** 按抽中次数排的字卡（只列抽到过的） */
  top: FitnessCard[]
  /** 有字卡但一次都没抽到过的张数 */
  neverDrawn: number
  /** 配置的载体占比（来自 `chat.weights`） */
  weights: { key: string; label: string; value: number }[]
  /** 实际的载体占比（从轨迹统计，按轮） */
  actual: { key: string; label: string; count: number; pct: number }[]
  /** 覆盖率 = 抽到过的卡 / 字卡总数 */
  coverage: number
  /** 回应率 = 他回我的轮数 / 我发的轮数 */
  replyRate: number
  /** 拾取：他从我的话里收下的卡（这是「适应」最直白的证据） */
  pickedCards: Card[]
  /** 他说话的长度（平均字数） */
  avgHisChars: number
  avgMyChars: number
  /** emoji 使用率（他的消息里带 emoji 的比例） */
  hisEmojiRate: number
  /** 我说话带标点/表情的比例（他也会学着用） */
  myPunctRate: number
}

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u
const PUNCT = /[。！？…~～、，,!?]/

export function computeFitness(stats: Stats, cards: Card[], weights: Record<string, number>): Fitness {
  const byId = new Map(cards.map((c) => [c.id, c]))
  const top = stats.cardDraws
    .filter((d) => byId.has(d.id))
    .map((d) => ({ card: byId.get(d.id)!, drawn: d.count }))
    .sort((a, b) => b.drawn - a.drawn)

  const label: Record<string, string> = {
    text: '文字（含 emoji）',
    kaomoji: '颜文字',
    sticker: '表情包',
    image: '图片',
  }
  const turnTotal = stats.carriers.reduce((n, c) => n + c.count, 0)

  const hisTexts = stats.turns.flatMap((t) => t.his.map((m) => m.text ?? '')).filter(Boolean)
  const myTexts = stats.turns.map((t) => t.myText ?? '').filter(Boolean)

  return {
    top,
    neverDrawn: cards.length - stats.cardsUsed,
    weights: Object.entries(weights).map(([key, value]) => ({ key, label: label[key] ?? key, value })),
    actual: stats.carriers.map((c) => ({
      key: c.carrier,
      label: label[c.carrier] ?? c.carrier,
      count: c.count,
      pct: turnTotal ? c.count / turnTotal : 0,
    })),
    coverage: cards.length ? stats.cardsUsed / cards.length : 0,
    replyRate: stats.myTurns ? stats.repliedTurns / stats.myTurns : 0,
    pickedCards: cards.filter((c) => c.source === 'PICKED'),
    avgHisChars: hisTexts.length ? Math.round(hisTexts.reduce((n, t) => n + [...t].length, 0) / hisTexts.length) : 0,
    avgMyChars: myTexts.length ? Math.round(myTexts.reduce((n, t) => n + [...t].length, 0) / myTexts.length) : 0,
    hisEmojiRate: hisTexts.length ? hisTexts.filter((t) => EMOJI.test(t)).length / hisTexts.length : 0,
    myPunctRate: myTexts.length ? myTexts.filter((t) => PUNCT.test(t)).length / myTexts.length : 0,
  }
}
