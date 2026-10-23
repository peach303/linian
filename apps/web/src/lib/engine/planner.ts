/**
 * 拟真回复规划器 —— 按 `docs/rule-engine.md` 的抽签顺序，把「概率配置 + 字卡库 + 我的上一句」
 * 变成「他这次要发什么」：
 *
 *   1 readNoReply  已读不回        2 pat 拍一拍              3 chat.weights 载体抽签
 *   4 multiCard    多字卡拼接      5 freeSentence 自由组句   6 recall 撤回（+ 补发）
 *   7 quote        引用回复        8 replySentences 句数 + replyInterval 拟真延迟
 *   9 voice/search 旁路（未配 Key 则跳过）   10 pickup 反向拾取我的上一句
 *
 * 产出是**纯数据**（PlannedItem[]），排程与落库交给 `lib/engine/runtime.ts`。
 * 与服务端 `apps/server/src/engine/reply-engine.ts` 的抽签顺序保持一致。
 */
import { POOL_OF, bareSentence, cardHash } from '@/lib/cards'
import { hisPatLine } from '@/lib/pats'
import { useAppStore } from '@/store/useAppStore'
import { composeSentence, inferEmotion, isPinyinCard, toPinyin } from './compose'
import { emotionFromTags } from '@/lib/voice'
import { hisMoodAt, hisMoodTags } from './mood'
import type { Card } from '@/types/cards'
import type { Message, MessageKind } from '@/types'
import type { RuleConfig } from '@/types/rules'
import type { PlanStep, ReplyTrace } from '@/types/engine'

/** 要下发的一条消息（延迟是相对上一条的毫秒数） */
export interface PlannedItem {
  kind: MessageKind
  text?: string
  payload?: Record<string, unknown>
  /** 相对上一条的延迟（毫秒） */
  delayMs: number
  /** 命中撤回时：发出后多久撤回 */
  recallAfterMs?: number
  /** 撤回后是否补发（补发内容 = items 里的下一条） */
  recallResend?: boolean
  /** 是否把我上一句作为引用块带上 */
  quoteMyMessageId?: string
  emotionTags?: string[]
  /** 溯源：用了哪张卡 */
  cardId?: string
  /**
   * 命中「发语音」：这一条要用 MiniMax 合成成真语音。
   * 只标记意图，**合成在运行时做**（`runtime.ts`）——合成失败就退回普通文字，
   * 所以这里不直接改 `kind`。
   *
   * `url` 有值 = **这段音频是现成的**（字卡自带的语音卡）：运行时直接用，不合成、不花钱。
   */
  voice?: {
    text: string
    emotion?: string
    url?: string
    durationMs?: number
    voiceId?: string
    model?: string
  }
}

export interface ReplyPlan {
  /** 已读不回：什么都不发 */
  silent: boolean
  /** 这一轮是「回你」还是「他主动来的」 */
  trigger: 'reply' | 'proactive'
  items: PlannedItem[]
  trace: ReplyTrace
  /** 命中「拾取」：调用方把我上一句存进他的字卡库 */
  pickup: boolean
  /** 是否显示「正在输入」（chat.typingIndicator） */
  typing: boolean
}

export interface PlanInput {
  rules: RuleConfig
  cards: Card[]
  /** 我最后一条消息（要回应的话）；主动模式下只当语气上下文用 */
  myMessage?: Message
  /** 出稿用的规则版本 */
  rulesVersion: number
  /** 已配置的接入能力（没有 Key 的旁路会被跳过并写进 trace.skipped） */
  integrations: { llm: boolean; tts: boolean; search: boolean }
  /** 他的拍一拍后缀池（`state.pats.his` 里启用的那些） */
  hisPats?: string[]
  /** 他的昵称，用来拼「「梦角」拍了拍我的×××」 */
  peerName?: string
  /**
   * reply（默认）= 回我最新那条；
   * proactive = 主动模式：跳过「已读不回」，不做引用/拾取，也不显示「正在输入」。
   */
  mode?: 'reply' | 'proactive'
  /** 主动模式下距上次说话的分钟数（只写进轨迹，方便复盘） */
  idleMinutes?: number
  /** 主动模式的触发说明（定时 / 手动预览） */
  proactiveNote?: string
}

/* ── 抽签原语 ── */
const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const roll = (p: number) => Math.random() < p
const rollToggle = ({ enabled, p }: { enabled: boolean; p: number }) => enabled && roll(p)
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]

const clamp = (v: number, [a, b]: [number, number]) => Math.max(a, Math.min(b, v))

/** 载体抽签：权重不要求和为 100%，引擎归一化 */
function pickCarrier(weights: RuleConfig['chat']['weights']) {
  const entries = Object.entries(weights) as [string, number][]
  const total = entries.reduce((s, [, w]) => s + Math.max(0, w), 0)
  if (total <= 0) return { key: 'text', ratio: 1, total }
  let r = Math.random() * total
  for (const [k, w] of entries) {
    r -= Math.max(0, w)
    if (r <= 0) return { key: k, ratio: Math.max(0, w) / total, total }
  }
  const [k, w] = entries[entries.length - 1]
  return { key: k, ratio: Math.max(0, w) / total, total }
}

/** 同池内按卡片 weight 不放回抽 n 张 */
function drawCards(pool: Card[], n: number): Card[] {
  const rest = pool.map((c) => ({ c, w: Math.max(0, c.weight) }))
  const out: Card[] = []
  while (out.length < n && rest.length) {
    const total = rest.reduce((s, x) => s + x.w, 0)
    let idx = 0
    if (total <= 0) {
      idx = Math.floor(Math.random() * rest.length)
    } else {
      let r = Math.random() * total
      for (let i = 0; i < rest.length; i++) {
        r -= rest[i].w
        if (r <= 0) {
          idx = i
          break
        }
        idx = i
      }
    }
    out.push(rest[idx].c)
    rest.splice(idx, 1)
  }
  return out
}

/** 主入口：跑一遍抽签 */
export function planReply(input: PlanInput): ReplyPlan {
  const { rules, cards, myMessage } = input
  const c = rules.chat
  /** 主动模式：他到点自己来一句，不是回我 */
  const proactive = input.mode === 'proactive'
  const steps: PlanStep[] = []
  const skipped: string[] = []
  const items: PlannedItem[] = []
  /** 不适合读出来的条目（拼音串：念出来是「wo xiang ni」，很怪） */
  const voiceBan = new Set<PlannedItem>()
  /** 这一轮用上了「自带语音的字卡」（用它的音频，不再另外合成一条） */
  let voiceCard: Card | undefined
  /**
   * 抽中的卡自带语音？→ 把那段现成音频挂到这一条上。
   * 只有当**这一轮说的就是这张卡的原话**时才成立（忽略标点比对）：
   * 组句/拼接会把文字改掉，那样音频和文字就对不上了，宁可按普通文字卡发。
   */
  const bindCardVoice = (item: PlannedItem, card?: Card): Card | undefined => {
    const v = card?.voice
    if (!v?.url || !card || voiceBan.has(item) || voiceCard) return undefined
    const want = bareSentence(v.text)
    if (!want || bareSentence(item.text ?? '') !== want) return undefined
    item.voice = { text: v.text, url: v.url, durationMs: v.durationMs, voiceId: v.voiceId, model: v.model }
    voiceCard = card
    step('语音卡', `抽中的卡「${v.text}」自带语音 → 直接用这段音频（不合成、不花钱）`, true)
    return card
  }
  let no = 0
  const step = (label: string, detail: string, hit: boolean | null) => steps.push({ no: ++no, label, detail, hit })

  const peerCards = cards.filter((x) => x.enabled)
  const myText = myMessage?.text ?? ''

  const trace = (extra: Partial<ReplyTrace> = {}): ReplyTrace => ({
    engine: 'web-local',
    trigger: proactive ? 'proactive' : 'reply',
    rulesVersion: input.rulesVersion,
    steps,
    skipped: skipped.length ? skipped : undefined,
    ...extra,
  })

  /* ── 1. 已读不回（主动模式换成「主动触发」） ── */
  if (proactive) {
    const idle = input.idleMinutes
    const where = idle != null ? `距上次说话约 ${idle} 分钟` : '距上次说话有一会儿了'
    step('主动触发', input.proactiveNote ?? `${where} → 他到点主动来一句（不是回你）`, true)
  } else {
    const silent = rollToggle(c.readNoReply)
    step('已读不回', silent ? '命中 → 这条不回了' : '未命中 → 继续', silent)
    if (silent) return { silent: true, trigger: 'reply', items: [], trace: trace({ silent: true }), pickup: false, typing: false }
  }

  /* ── 2. 拍一拍 ── */
  if (rollToggle(c.pat)) {
    const suffix = input.hisPats?.length ? pick(input.hisPats) : '{me}'
    const meName = useAppStore.getState().me.nickname
    const line = hisPatLine(input.peerName ?? '梦角', suffix, meName)
    step('拍一拍', `命中 → ${line}，再说话`, true)
    items.push({
      kind: 'PAT',
      text: line,
      delayMs: 800,
      payload: { pat: 'his', suffix },
    })
  } else {
    step('拍一拍', '未命中', false)
  }

  /* ── 3. 载体抽签 ── */
  const carrier = pickCarrier(c.weights)
  const carrierCards = peerCards.filter((x) => POOL_OF[x.type as keyof typeof POOL_OF] === carrier.key)
  step(
    '载体抽签',
    `抽中「${CARRIER_LABEL[carrier.key] ?? carrier.key}」（权重合计 ${carrier.total.toFixed(2)}，占比 ${(carrier.ratio * 100).toFixed(0)}%）`,
    null,
  )

  /* ── 4. 多字卡拼接 ──
     只让「文字」载体连发多张；颜文字 / 表情包 / 图片一次只发一个。
     以前抽中 2~4 张颜文字会连着发三个，看起来像卡住了。 */
  const multi = rollToggle(c.multiCard) && carrier.key === 'text'
  const wantCount = multi ? Math.max(1, Math.round(rnd(c.multiCard.count[0], c.multiCard.count[1]))) : 1
  step(
    '多字卡拼接',
    carrier.key !== 'text'
      ? `抽中「${CARRIER_LABEL[carrier.key] ?? carrier.key}」→ 一次只发 1 张`
      : multi
        ? `命中 → 取 ${wantCount} 张`
        : '未命中 → 单张',
    multi,
  )

  const drawn = drawCards(carrierCards, Math.min(wantCount, Math.max(carrierCards.length, 1)))
  const cardIds = drawn.map((d) => d.id)

  /* ── 5. 组句 or 原样发卡 ── */
  const freeSentence = rollToggle(c.freeSentence)
  /** 系统预设默认禁自由造句：抽中的卡带 noFreeSentence 就原样发，不交给「造句」 */
  const lockedCard = drawn.some((d) => d.noFreeSentence)
  const emptyPool = carrierCards.length === 0

  const pinyin = rollToggle(c.pinyinSentence)
  const conj = rollToggle(c.conjunction)
  const punct = c.punctuation.enabled

  if (emptyPool) {
    step('载体抽签', `「${CARRIER_LABEL[carrier.key] ?? carrier.key}」池里没有启用的字卡 → 回落造句`, null)
  }
  step('自由组句', lockedCard ? '抽中的卡禁止组句 → 原样发' : freeSentence ? '命中 → 拼接/造句' : '未命中 → 原样发', lockedCard ? false : freeSentence)
  step('标点符号', punct ? '开启' : '关闭 → 整句去标点', null)

  /** 只有「文字」池允许造句/拼接；颜文字、表情包、图片一律原样发 1 张。
      以前 sticker 也会走组句，自定义表情包会被拼成一句文字，图就丢了。 */
  const useCompose = !emptyPool && !lockedCard && carrier.key === 'text'

  let via: 'card-join' | 'template' | 'pinyin' = 'card-join'
  if (useCompose) {
    const composed = composeSentence({
      seeds: drawn.map((d) => d.text ?? '').filter(Boolean),
      myLastText: myText,
      punctuation: punct,
      conjunction: conj,
      maxLen: c.maxLengthPerSentence,
    })
    let text = composed.text
    via = composed.via
    if (pinyin) {
      // 拼音造句：优先用字卡库里的「拼音卡」（全 ASCII），否则用内置字表转写
      const pinyinCard = peerCards.find((x) => x.type === 'TEXT' && x.text && isPinyinCard(x.text))
      const converted = pinyinCard?.text ?? toPinyin(text)
      if (converted) {
        text = converted
        via = 'pinyin'
      }
    }
    step(
      '拼音造句',
      via === 'pinyin' ? '命中 → 用拼音打出来（优先字卡库里的拼音卡）' : pinyin ? '命中但没有可用拼音串 → 跳过' : '未命中',
      via === 'pinyin',
    )
    items.push({ kind: 'TEXT', text, delayMs: 0, cardId: drawn[0]?.id })
    if (via === 'pinyin') voiceBan.add(items[items.length - 1])
    // 组句没改写（还是原话）时才可能用上卡自带的语音
    else bindCardVoice(items[items.length - 1], drawn[0])
  } else if (emptyPool) {
    const composed = composeSentence({
      seeds: [],
      myLastText: myText,
      punctuation: punct,
      conjunction: conj,
      maxLen: c.maxLengthPerSentence,
    })
    via = 'template'
    step('兜底模板', `字卡库为空 → 用「${via}」兜底（配了 LLM 就换成模型造句）`, null)
    items.push({ kind: 'TEXT', text: composed.text, delayMs: 0 })
  } else {
    // 原样发卡：文字卡走 TEXT（就是一句人话），颜文字/emoji/表情包/图片走 CARD
    const textCards = drawn.filter((d) => d.type === 'TEXT')
    const others = drawn.filter((d) => d.type !== 'TEXT')
    if (textCards.length) {
      const joined = textCards.map((d) => d.text ?? '').join(multi && textCards.length > 1 ? '，' : ' ')
      items.push({
        kind: 'TEXT',
        text: punct ? joined : joined.replace(/[，。！？、…~～]/g, ''),
        delayMs: 0,
        cardId: textCards[0].id,
        payload: { cardIds: textCards.map((d) => d.id), cardSource: textCards[0].source },
      })
      bindCardVoice(items[items.length - 1], textCards[0])
    }
    for (const o of others) {
      items.push({
        kind: 'CARD',
        text: o.text,
        delayMs: 0,
        cardId: o.id,
        payload: { cardType: o.type, cardId: o.id, cardSource: o.source, url: o.mediaUrl },
      })
    }
  }

  /* ── 6. 撤回（+ 补发） ── */
  let recalled = false
  if (rollToggle(c.recall) && items.length) {
    recalled = true
    const resend = rollToggle(c.recallResend)
    step('撤回', `命中 → ${(2).toFixed(0)}~6 秒后撤回第一条`, true)
    step('撤回后补发', resend ? '命中 → 撤回后重新发一条' : '未命中 → 不补发', resend)
    const first = items.findIndex((i) => i.kind !== 'PAT')
    if (first >= 0) {
      items[first] = {
        ...items[first],
        recallAfterMs: Math.round(rnd(2000, 6000)),
        recallResend: resend,
      }
    }
    if (resend) {
      // 补发换一张卡，避免「撤回又发同一条」的穿帮
      const spare = drawCards(carrierCards.filter((x) => !cardIds.includes(x.id)), 1)[0] ?? drawn[0]
      if (spare) {
        items.push({
          kind: spare.type === 'TEXT' ? 'TEXT' : 'CARD',
          text: spare.text,
          delayMs: Math.round(rnd(1200, 2600)),
          cardId: spare.id,
          payload:
            spare.type === 'TEXT'
              ? { cardIds: [spare.id], cardSource: spare.source, resend: true }
              : { cardType: spare.type, cardId: spare.id, cardSource: spare.source, url: spare.mediaUrl, resend: true },
        })
      }
    }
  } else {
    step('撤回', c.recall.enabled ? '未命中' : '未开启', false)
  }

  /* ── 7. 引用（主动消息没有「你的上一句」可引用） ── */
  const quoteTarget = items.find((i) => i.kind !== 'PAT') ?? items[0]
  if (proactive) {
    step('引用回复', '主动消息无引用', false)
  } else if (myMessage && rollToggle(c.quote) && myMessage.text && quoteTarget) {
    quoteTarget.quoteMyMessageId = myMessage.id
    step('引用回复', `命中 → 引用你「${myMessage.text.slice(0, 10)}」那句`, true)
  } else {
    step('引用回复', c.quote.enabled ? '未命中' : '未开启', false)
  }

  /* ── 8. 句数裁剪 + 拟真延迟 ── */
  const [minS, maxS] = c.replySentences
  const keep = Math.max(
    Math.round(minS),
    Math.min(Math.round(maxS), Math.max(items.filter((i) => i.kind !== 'PAT').length, 1)),
  )
  /** 拍一拍是「动作」不占句数额度（否则配置 1 句时他就只拍不说话了） */
  let talked = 0
  const finalItems = items.filter((it) => {
    if (it.kind === 'PAT') return true
    talked++
    return talked <= keep
  })
  const [iMin, iMax] = c.replyInterval
  finalItems.forEach((it, idx) => {
    const len = (it.text ?? '').length || 10
    // 长句更慢；第 2 句起间隔缩短（像连着打字）
    const base = rnd(iMin, iMax) * (idx === 0 ? 1 : 0.6)
    it.delayMs = Math.round((base + len * 0.06) * 1000)
  })
  if (finalItems[0]) finalItems[0].delayMs = Math.max(300, finalItems[0].delayMs - 500)
  const patCount = finalItems.filter((i) => i.kind === 'PAT').length
  step(
    '句数 + 延迟',
    `配置 [${minS}, ${maxS}] 句 → 实发 ${finalItems.length - patCount} 句${patCount ? `（另有 ${patCount} 次拍一拍）` : ''}；首条约 ${(finalItems[0]?.delayMs ?? 0) / 1000}s`,
    null,
  )

  /* ── 8.5 他的心情 + 读到的情绪 ──
     他先有自己的心情（按日期 + 情绪持续时段抽签），再看要不要把「读到你」也贴上。
     以前这里只看我上一句，等于他没有自己的情绪。 */
  const hisMood = hisMoodAt(new Date(), rules.emotion.decayHours)
  step(
    '他的心情',
    `${hisMood.emoji} ${hisMood.label} —— ${hisMood.note}`,
    rules.emotion.enabled ? true : null,
  )
  const moodTarget = finalItems.find((i) => i.kind !== 'PAT')
  if (moodTarget && rules.emotion.enabled && roll(rules.emotion.triggerP)) {
    const readTags = proactive || !myText.trim() ? [] : inferEmotion(myText)
    const tags = [
      ...hisMoodTags(hisMood),
      ...readTags.map((t) => `读到你：${t}`),
    ]
    moodTarget.emotionTags = [...new Set(tags)]
    step(
      '情绪标签',
      `命中 → ${hisMoodTags(hisMood).join(' / ')}${readTags.length ? `；读到你「${readTags.join(' / ')}」` : ''}`,
      true,
    )
  } else {
    step('情绪标签', rules.emotion.enabled ? '未命中（他的心情仍然写在轨迹里）' : '未开启', rules.emotion.enabled ? false : null)
  }

  /* ── 9. 语音旁路：命中就把已经抽好的某一条改成一则语音 ──
     Key 没配就只写进 trace.skipped，稿子一个字都不动（绝不发一条假语音）。
     如果这一轮用上了「自带语音的字卡」（第 5 步 bindCardVoice），就到此为止：不另合成。 */
  if (voiceCard) {
    step('MiniMax 语音', '本轮用的是字卡自带的那段音频 → 不再另外合成一条（这轮不花钱）', null)
  } else if (rules.voice.enabled && roll(rules.voice.p)) {
    if (!input.integrations.tts) {
      step('MiniMax 语音', '命中 → 本机未配置 MiniMax Key，跳过（不伪造语音）', true)
      skipped.push('voice: 未配置 MiniMax Key（设置 → 接入 里填）')
    } else {
      const cap = Math.max(10, Math.round(rules.voice.maxCharsPerVoice))
      /** 挑一条「本来就是一句人话」的：太长的读起来会拖很久，拼音串念出来很怪 */
      const cand = finalItems.find(
        (i) =>
          i.kind === 'TEXT' &&
          !voiceBan.has(i) &&
          (i.text ?? '').trim().length > 0 &&
          (i.text ?? '').trim().length <= cap,
      )
      if (cand) {
        const text = (cand.text ?? '').trim()
        const emotion = rules.voice.emotionMapping
          ? emotionFromTags(cand.emotionTags ?? inferEmotion(text))
          : undefined
        cand.voice = { text, emotion }
        step(
          'MiniMax 语音',
          `命中 → 这一条改成真语音（念「${text.slice(0, 12)}${text.length > 12 ? '…' : ''}」${emotion ? ` · ${emotion}` : ''}）`,
          true,
        )
      } else {
        step('MiniMax 语音', `命中 → 但这一轮没有 ${cap} 字以内、适合读的句子，跳过`, false)
        skipped.push(`voice: 没有 ≤${cap} 字、非拼音的句子可读`)
      }
    }
  } else {
    step('MiniMax 语音', rules.voice.enabled ? '未命中' : '未开启', false)
  }

  /* ── 9. 联网搜索推送：**独立排程**，不挂在「回你」这条链上 ──
     它是他自己去找东西看（`search.pushIntervalMin` 一个间隔最多一次），
     命中了真去搜；搜到才推、搜不到只记一条轨迹（见 `engine/search.ts`）。 */
  step(
    '联网搜索推送',
    !rules.search.enabled
      ? '未开启'
      : input.integrations.search
        ? '独立排程（按推送间隔抽签，不在回复里插队）'
        : '独立排程 · 但本机未配置搜索服务（只记轨迹，不伪造内容）',
    null,
  )

  /* ── 10. 拾取（反向）：把我上一句存进他的字卡库（主动模式没有「上一句」） ── */
  const pickup = !proactive && rollToggle(c.pickup) && myText.trim().length > 1
  step(
    '拾取',
    proactive ? '主动消息不拾取' : pickup ? `命中 → 把「${myText.slice(0, 10)}」收进他的字卡库` : '未命中',
    proactive ? false : c.pickup.enabled ? pickup : false,
  )

  return {
    silent: false,
    trigger: proactive ? 'proactive' : 'reply',
    items: finalItems,
    trace: trace({
      carrier: carrier.key,
      cardIds,
      recalled,
      pickup: pickup || undefined,
    }),
    pickup,
    typing: proactive ? false : c.typingIndicator,
  }
}

const CARRIER_LABEL: Record<string, string> = {
  text: '文字（含 emoji）',
  kaomoji: '颜文字',
  sticker: '表情包',
  image: '图片',
}

/** 抽中的卡是否与「我的上一句」哈希相同（供运行时不重复拾取） */
export const sameAsMine = (cards: Card[], text: string) => cards.some((c) => c.hash === cardHash({ text }))
