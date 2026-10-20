/**
 * 拟真回复引擎 —— 把「概率配置」变成一条像人发的消息。
 * 抽签顺序见 docs/rule-engine.md §抽签顺序。
 */
import type { RuleConfig } from '@linian/shared'

export interface ReplyCard {
  id: string
  type: 'TEXT' | 'KAOMOJI' | 'EMOJI' | 'STICKER' | 'IMAGE'
  text?: string
  mediaUrl?: string
}

export interface ReplyContext {
  /** 上一条（我的）消息 */
  lastUserText: string
  /** 情绪标签（由 emotion 模块预分析） */
  emotion?: string
  /** 会话最近 N 条，供 LLM 参考 */
  history: { role: 'user' | 'dream'; text: string }[]
  /** 候选字卡池（已按 category / 情绪过滤） */
  cards: ReplyCard[]
}

export interface ReplyPlan {
  /** 最终要逐条下发的消息 */
  items: PlannedItem[]
  /** 抽签轨迹，写入 messages.plan 便于复盘 */
  trace: Record<string, unknown>
}

export type PlannedItem =
  | { kind: 'TEXT'; text: string; latencyMs: number }
  | { kind: 'CARD'; cardId: string; cardType: string; text?: string; mediaUrl?: string; latencyMs: number }
  | { kind: 'VOICE'; text: string; latencyMs: number }
  | { kind: 'SEARCH_PUSH'; payload: { title: string; url: string; source: string }; latencyMs: number }

/* ── 抽签原语 ── */
const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const hit = (p: number) => Math.random() < p

/** 加权抽取；权重全 0 时回落 text */
function pickWeighted<T extends string>(weights: Record<T, number>): T {
  const entries = Object.entries(weights) as [T, number][]
  const total = entries.reduce((s, [, w]) => s + w, 0)
  if (total <= 0) return ('text' as unknown) as T
  let r = Math.random() * total
  for (const [k, w] of entries) {
    r -= w
    if (r <= 0) return k
  }
  return entries[entries.length - 1][0]
}

export interface EngineDeps {
  /** LLM：自由组句 / 连词 / 拼音 / 情绪走这里 */
  llm: {
    composeSentence(input: { cards: string[]; emotion?: string; context: string; punctuation: boolean; conjunction: boolean }): Promise<string>
    toPinyin(sentence: string): Promise<string>
  }
  /** MiniMax 语音合成 */
  tts: { synthesize(text: string, opts?: { pace?: number }): Promise<{ url: string; durationMs: number }> }
  /** 联网搜索推送 */
  search: { fetchOne(topics: string[]): Promise<{ title: string; url: string; source: string } | null> }
  /** 随机数注入，便于测试 */
  clock?: () => number
}

export function createReplyEngine(deps: EngineDeps) {
  /** 主入口：给定规则与上下文，产出「怎么回」 */
  async function plan(rules: RuleConfig, ctx: ReplyContext): Promise<ReplyPlan> {
    const trace: Record<string, unknown> = {}
    const items: PlannedItem[] = []
    const c = rules.chat

    /* 1. 已读不回 */
    if (c.readNoReply.enabled && hit(c.readNoReply.p)) {
      return { items: [], trace: { ...trace, readNoReply: true } }
    }

    /* 2. 拍一拍 */
    if (c.pat.enabled && hit(c.pat.p)) {
      items.push({ kind: 'CARD', cardId: 'builtin:pat', cardType: 'PAT', text: '拍了拍你', latencyMs: 800 })
      trace.pat = true
    }

    /* 3. 载体抽签（权重不要求和为 100%） */
    const carrier = pickWeighted(c.weights)
    trace.carrier = carrier

    /* 4. 多字卡拼接 or 单张 */
    const multi = c.multiCard.enabled && hit(c.multiCard.p)
    const cardCount = multi ? Math.round(rnd(c.multiCard.count[0], c.multiCard.count[1])) : 1
    trace.multiCard = multi ? cardCount : 0

    const pool = ctx.cards.filter((x) => matchCarrier(x, carrier))
    const chosen = shuffle(pool).slice(0, Math.max(1, Math.min(cardCount, pool.length)))

    /* 5. 组装：字卡 + 可能的自由组句 */
    const freeSentence = c.freeSentence.enabled && hit(c.freeSentence.p)
    trace.freeSentence = freeSentence

    if (freeSentence || carrier === 'text' || pool.length === 0) {
      const base = await deps.llm.composeSentence({
        cards: chosen.map((x) => x.text ?? '').filter(Boolean),
        emotion: ctx.emotion,
        context: ctx.lastUserText,
        punctuation: c.punctuation.enabled,
        conjunction: c.conjunction.enabled,
      })
      const text =
        c.pinyinSentence.enabled && hit(c.pinyinSentence.p) ? await deps.llm.toPinyin(base) : base
      trace.pinyin = c.pinyinSentence.enabled && text !== base
      items.push({ kind: 'TEXT', text: truncate(text, c.maxLengthPerSentence), latencyMs: 0 })
    } else {
      for (const card of chosen) {
        items.push({ kind: 'CARD', cardId: card.id, cardType: card.type, text: card.text, mediaUrl: card.mediaUrl, latencyMs: 0 })
      }
    }

    /* 6. 语音旁路（MiniMax） */
    if (rules.voice.enabled && hit(rules.voice.p)) {
      const spoken = items.find((i) => i.kind === 'TEXT')
      if (spoken) {
        const { url, durationMs } = await deps.tts.synthesize(spoken.text, { pace: rules.voice.pace })
        items.push({ kind: 'VOICE', text: spoken.text, latencyMs: durationMs })
        trace.voice = { url }
      }
    }

    /* 7. 联网搜索推送旁路 */
    if (rules.search.enabled && hit(rules.search.p)) {
      const found = await deps.search.fetchOne(rules.search.topics)
      if (found) {
        items.push({ kind: 'SEARCH_PUSH', payload: found, latencyMs: 0 })
        trace.searchPush = true
      }
    }

    /* 8. 句数裁剪 + 拟真延迟 */
    const [minS, maxS] = c.replySentences
    const keep = Math.max(minS, Math.min(maxS, items.length))
    const finalItems = items.slice(0, keep).map((it, idx) => {
      const [iMin, iMax] = c.replyInterval
      const len = 'text' in it ? (it.text?.length ?? 10) : 10
      // 长文本回复更慢；第 2 句起间隔更短（像连续打字）
      const base = rnd(iMin, iMax) * (idx === 0 ? 1 : 0.6)
      const latencyMs = Math.round((base + len * 60) * 1000)
      return { ...it, latencyMs }
    })

    trace.sentences = finalItems.length
    return { items: finalItems, trace }
  }

  return { plan }
}

/* ── 工具 ── */
function matchCarrier(card: ReplyCard, carrier: string) {
  switch (carrier) {
    case 'kaomoji':
      return card.type === 'KAOMOJI'
    case 'sticker':
      return card.type === 'STICKER' || card.type === 'EMOJI'
    case 'image':
      return card.type === 'IMAGE'
    default:
      return card.type === 'TEXT'
  }
}

function shuffle<T>(arr: T[]) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s)
