/**
 * 时间轴调度：朋友圈、信箱，以及「+」里递给他的东西（抉择 / 问卷 / 红包 / 礼物 / 音乐 / 涂鸦）
 *
 * 和 `runtime.ts`（聊天）的分工：
 *   - runtime.ts   —— 对话的排程（回你 / 主动来找你）
 *   - timeline.ts  —— 他那些「不是对话」的行为：发动态 / 点赞 / 评论 / 写信 / 回信 / 蓝色批注 / 答题 / 抢红包…
 *
 * 设计要点：**所有待办都是从数据推导出来的**，不额外存「定时任务表」——
 * 每个事件都从「他/我那条动态、那封信、那张卡的时间」加上规则里的延迟算出来，
 * 掷签用 `seed.ts` 的种子随机（种子 = 那条记录 id），所以刷新、关机、换设备都不会重复掷，
 * 也不会因为「刷新一次多掷一次」把概率偷偷放大。
 */
import {
  makeAnnotation,
  makeCallAfter,
  makeCallBye,
  makeChoiceReason,
  makeDoodleComment,
  makeDoodleNote,
  makeGiftNote,
  makeGiftThanks,
  makeLetter,
  makeMoment,
  makeMomentComment,
  makeMomentReply,
  makeMusicLine,
  makeQuestionAnswers,
  makeQuestionNote,
  makeRedPacketBlessing,
  makeRedPacketThanks,
  pickChoiceOption,
} from './content'
import { inQuietHours } from './proactive'
import { pick, seededHit, seededPick, seededRange } from './seed'
import { HIS_DOODLES } from '@/lib/doodles'
import { SONGS } from '@/lib/music'
import { dayKeyOf } from '@/lib/diary'
import { favoriteFromLetter, favoriteFromMessage, favoriteFromMoment } from '@/lib/favorites'
import { nid } from '@/lib/ids'
import { useAppStore } from '@/store/useAppStore'
import { useCardsStore } from '@/store/useCardsStore'
import { useChatStore } from '@/store/useChatStore'
import { useRulesStore } from '@/store/useRulesStore'
import type {
  ChoicePayload,
  DoodlePayload,
  GiftPayload,
  Message,
  MusicPayload,
  QuestionPayload,
  RedPacketPayload,
} from '@/types'

/**
 * 检查节拍：`proactive.moment` / `proactive.letter` 只有一个概率 + 冷却，
 * 没有「间隔」字段，所以给它们一个 20 分钟的节拍 —— 每个节拍掷一次签，冷却没到就直接跳过。
 */
const CHECK_MS = 20 * 60_000

/** 已经到点（关机太久）的事件：等 20~90 秒再发生，别一开 App 全弹出来 */
const GRACE_MS: [number, number] = [20_000, 90_000]

interface TimelineEvent {
  key: string
  at: number
  run: () => void
}

/** 他在聊天里最后跟我说的话 / 我说的最后一句 */
const lastMyText = () => {
  const { messages } = useChatStore.getState()
  const { dream } = useAppStore.getState()
  return [...messages].reverse().find((m) => m.senderId !== dream.id)?.text?.trim() || undefined
}

const bucketStart = (now: number) => Math.floor(now / CHECK_MS) * CHECK_MS

/* ───────────────── ① 他主动发朋友圈 / 主动写信 ───────────────── */

function hisMomentOpportunity(now: number): TimelineEvent | null {
  const { moments, dream } = useAppStore.getState()
  const rules = useRulesStore.getState().saved
  const p = rules.proactive.moment
  if (!p.enabled) return null

  const lastAt = moments
    .filter((m) => m.authorId === dream.id)
    .reduce((acc, m) => Math.max(acc, +new Date(m.createdAt)), 0)
  if (now - lastAt < Math.max(0, p.cooldownMin) * 60_000) return null // 冷却中

  const bucket = Math.floor(now / CHECK_MS)
  // 一个节拍只给一次机会：否则冷却设为 0 时，同一个节拍会被反复重排、无限发下去
  if (lastAt >= bucketStart(now)) return null
  if (!seededHit(`pmo:${bucket}`, p.p)) return null
  if (inQuietHours(rules.proactive.message.quietHours, new Date(now))) return null

  return {
    key: `moment-auto:${bucket}`,
    at: bucketStart(now) + seededRange(`pmo-d:${bucket}`, [10_000, 240_000]),
    run: () => emitHisMoment(false),
  }
}

function hisLetterOpportunity(now: number): TimelineEvent | null {
  const { letters, dream } = useAppStore.getState()
  const rules = useRulesStore.getState().saved
  const p = rules.proactive.letter
  if (!p.enabled) return null

  const lastAt = letters
    .filter((l) => l.fromId === dream.id)
    .reduce((acc, l) => Math.max(acc, +new Date(l.createdAt)), 0)
  if (now - lastAt < Math.max(0, p.cooldownMin) * 60_000) return null

  const bucket = Math.floor(now / CHECK_MS)
  // 一个节拍只给一次机会（同朋友圈）
  if (lastAt >= bucketStart(now)) return null
  if (!seededHit(`plo:${bucket}`, p.p)) return null
  if (inQuietHours(rules.proactive.message.quietHours, new Date(now))) return null

  return {
    key: `letter-auto:${bucket}`,
    at: bucketStart(now) + seededRange(`plo-d:${bucket}`, [10_000, 240_000]),
    run: () => emitHisLetter(false),
  }
}

/**
 * 他发一条动态。
 * `manual` = 引擎页的「主动朋友圈」预览：跳过概率与冷却，但仍然是 `proactive`（带 ❤️）。
 */
export function emitHisMoment(manual = false) {
  const { me, dream, pushMoment } = useAppStore.getState()
  const cards = useCardsStore.getState().cards
  const m = makeMoment({ me, dream, cards, proactive: true })
  pushMoment(m)
  console.debug('[engine] 他发了一条动态', manual ? '（手动预览）' : '', m.text)
  return m
}

/** 他写一封信；`replyTo` 有值就是回信 */
export function emitHisLetter(manual = false, replyTo?: Parameters<typeof makeLetter>[0]['replyTo']) {
  const { me, dream, pushLetter } = useAppStore.getState()
  const rules = useRulesStore.getState().saved
  const cards = useCardsStore.getState().cards
  const l = makeLetter({
    me,
    dream,
    cards,
    length: replyTo ? rules.mail.replyLength : rules.mail.length,
    randomPunctuation: rules.mail.randomPunctuation,
    lastMyText: lastMyText(),
    replyTo,
    proactive: true,
  })
  pushLetter(l)
  console.debug('[engine] 他写了一封信', manual ? '（手动预览）' : '', l.title)
  return l
}

/* ───────────────── ② 我发的动态 → 他的点赞 / 评论 ───────────────── */

function hisReactionsToMyMoments(): TimelineEvent[] {
  const { moments, me, dream } = useAppStore.getState()
  const rules = useRulesStore.getState().saved
  const out: TimelineEvent[] = []

  for (const m of moments) {
    if (m.authorId !== me.id) continue
    const base = +new Date(m.createdAt)

    // 点赞：延迟落到 rules.moment.like.delay（最快 / 最慢）
    if (!m.likes.includes(dream.id) && seededHit(`ml:${m.id}`, rules.moment.like.p)) {
      out.push({
        key: `like:${m.id}`,
        at: base + seededRange(`ml-d:${m.id}`, rules.moment.like.delay) * 1000,
        run: () => useAppStore.getState().dreamLike(m.id),
      })
    }

    // 评论：按 rules.moment.comment.p
    if (!m.comments.some((c) => c.authorId === dream.id) && seededHit(`mc:${m.id}`, rules.moment.comment.p)) {
      out.push({
        key: `comment:${m.id}`,
        at: base + seededRange(`mc-d:${m.id}`, rules.moment.comment.delay) * 1000,
        run: () => {
          const st = useAppStore.getState()
          const cur = st.moments.find((x) => x.id === m.id)
          if (!cur) return
          st.commentFromDream(m.id, makeMomentComment(cur, useCardsStore.getState().cards))
        },
      })
    }
  }
  return out
}

/* ───────────────── ③ 我在他的动态下互动 → 他的回应 ───────────────── */

function hisRepliesOnHisMoments(now: number): TimelineEvent[] {
  const { moments, me, dream } = useAppStore.getState()
  const rules = useRulesStore.getState().saved
  const anchor = bucketStart(now)
  const out: TimelineEvent[] = []

  for (const m of moments) {
    if (m.authorId !== dream.id) continue

    // 他回复我的评论（moment.replyMyReply）
    for (const c of m.comments) {
      if (c.authorId !== me.id) continue
      if (m.comments.some((x) => x.replyToId === c.id)) continue
      if (!seededHit(`mr:${c.id}`, rules.moment.replyMyReply.p)) continue
      out.push({
        key: `reply:${c.id}`,
        at: anchor + seededRange(`mr-d:${c.id}`, [15, 120]) * 1000,
        run: () => useAppStore.getState().commentFromDream(m.id, makeMomentReply(), c.id),
      })
    }

    // 我点赞后他回赞（moment.likeBackIfILiked）
    if (
      m.likes.includes(me.id) &&
      !m.likes.includes(dream.id) &&
      seededHit(`mlb:${m.id}`, rules.moment.likeBackIfILiked.p)
    ) {
      out.push({
        key: `like-back:${m.id}`,
        at: anchor + seededRange(`mlb-d:${m.id}`, [10, 90]) * 1000,
        run: () => useAppStore.getState().dreamLike(m.id),
      })
    }
  }
  return out
}

/* ───────────────── ④ 我寄出的信 → 他的回信 + 蓝色批注 ───────────────── */

function hisRepliesToMyLetters(): TimelineEvent[] {
  const { letters, me } = useAppStore.getState()
  const rules = useRulesStore.getState().saved
  const out: TimelineEvent[] = []
  if (!rules.mail.reply.enabled) return out

  for (const l of letters) {
    if (l.fromId !== me.id) continue
    if (letters.some((x) => x.replyToId === l.id)) continue // 已经回过信了
    if (!seededHit(`mail:${l.id}`, rules.mail.reply.p)) continue // 这封他不回（掷过就不再改）

    out.push({
      key: `mail:${l.id}`,
      // 回信延迟 mail.replyDelayH（小时）——从我这封信寄出那一刻算
      at: +new Date(l.createdAt) + seededRange(`mail-d:${l.id}`, rules.mail.replyDelayH) * 3600_000,
      run: () => replyToMyLetter(l.id),
    })
  }
  return out
}

/** 他回信（回信和批注是两件独立的事，见 hisAnnotationsToMyLetters） */
function replyToMyLetter(id: string) {
  const st = useAppStore.getState()
  const letter = st.letters.find((l) => l.id === id)
  if (!letter) return
  const rules = useRulesStore.getState().saved
  const cards = useCardsStore.getState().cards

  const reply = makeLetter({
    me: st.me,
    dream: st.dream,
    cards,
    length: rules.mail.replyLength,
    randomPunctuation: rules.mail.randomPunctuation,
    lastMyText: lastMyText(),
    replyTo: letter,
  })
  st.pushLetter(reply)
  st.setLetterStatus(letter.id, 'REPLIED')
  console.debug('[engine] 他回了一封信', reply.title)
}

/**
 * 他读我的信时，会用蓝笔在信纸上写批注（`mail.annotation`）。
 *
 * 和「回信」是**两件独立抽签的事**，所以三种结果都有可能出现：
 *   ① 只回信不批注 ② 只批注不回信（读了，随手在页边写两笔）③ 又回信又批注。
 * 时间基准跟回信一致（都用 `mail.replyDelayH`，种子也相同 → 同一封信两件事同时发生）。
 */
function hisAnnotationsToMyLetters(): TimelineEvent[] {
  const { letters, me } = useAppStore.getState()
  const rules = useRulesStore.getState().saved
  const out: TimelineEvent[] = []
  if (!rules.mail.annotation.enabled) return out

  for (const l of letters) {
    if (l.fromId !== me.id) continue
    if (l.annotations.length > 0) continue // 已经批注过这封了
    if (!seededHit(`mail-an:${l.id}`, rules.mail.annotation.p)) continue

    out.push({
      key: `mail-an:${l.id}`,
      at: +new Date(l.createdAt) + seededRange(`mail-d:${l.id}`, rules.mail.replyDelayH) * 3600_000,
      run: () => annotateMyLetter(l.id),
    })
  }
  return out
}

/** 在信纸上写 1~2 处蓝笔批注 */
function annotateMyLetter(id: string) {
  const st = useAppStore.getState()
  const letter = st.letters.find((l) => l.id === id)
  if (!letter) return

  const first = makeAnnotation(letter)
  st.annotateLetter(letter.id, first)
  // 有时候会写两处
  if (seededHit(`mail-an2:${letter.id}`, 0.4)) {
    const second = makeAnnotation(letter)
    if (second.anchor !== first.anchor) st.annotateLetter(letter.id, second)
  }
  console.debug('[engine] 他在你的信上写了批注', letter.title)
}

/* ───────────────── ⑤ 「+」递给他的东西 → 他的回应 ───────────────── */

/** 组装一条「他发的」消息（时间轴主动产出：答题 / 抢红包 / 收礼物…） */
export function pushHisMessage(opts: {
  kind?: Message['kind']
  text: string
  quoteOf?: Message
  payload?: Record<string, unknown>
}) {
  const { dream } = useAppStore.getState()
  const chat = useChatStore.getState()
  const q = opts.quoteOf
  const msg: Message = {
    id: nid('m'),
    conversationId: chat.conversation?.id ?? 'c_1',
    senderId: dream.id,
    kind: opts.kind ?? 'TEXT',
    status: 'SENT',
    text: opts.text,
    payload: opts.payload,
    quoteOf: q ? { id: q.id, text: q.text ?? '', senderId: q.senderId } : undefined,
    createdAt: new Date().toISOString(),
  }
  chat.pushMessage(msg)
  return msg
}

/**
 * 我递给他的东西，他什么时候回应。
 * 和朋友圈 / 信箱同一套口径：种子 = 那张卡的 id（一张卡只掷一次签），延迟取自规则区间。
 * 结果和回信一样是「独立的几件事」：答应 / 不答应（卡停在原状）/ 答完再补一句话。
 */
function hisAnswersToMyCards(): TimelineEvent[] {
  const { messages } = useChatStore.getState()
  const { me } = useAppStore.getState()
  const rules = useRulesStore.getState().saved
  const out: TimelineEvent[] = []

  for (const m of messages) {
    if (m.senderId !== me.id || m.status === 'RECALLED') continue
    const base = +new Date(m.createdAt)

    // 抉择：选一个选项，可能附理由
    if (m.kind === 'CHOICE') {
      const p = m.payload as unknown as ChoicePayload | undefined
      if (!rules.choice.enabled || !p?.options?.length || p.answer) continue
      if (!seededHit(`ch:${m.id}`, rules.choice.p)) continue
      out.push({
        key: `choice:${m.id}`,
        at: base + seededRange(`ch-d:${m.id}`, rules.choice.delay) * 1000,
        run: () => answerMyChoice(m.id),
      })
      continue
    }

    // 问卷：逐题作答（每题都可能留空）
    if (m.kind === 'QUESTION') {
      const p = m.payload as unknown as QuestionPayload | undefined
      if (!rules.question.enabled || !p?.items?.length || p.answers) continue
      if (!seededHit(`qn:${m.id}`, rules.question.p)) continue
      out.push({
        key: `question:${m.id}`,
        at: base + seededRange(`qn-d:${m.id}`, rules.question.delay) * 1000,
        run: () => answerMyQuestion(m.id),
      })
    }
  }
  return out
}

/** 他答了一条抉择：卡片就地更新，还会在聊天里说一句（带引用） */
function answerMyChoice(id: string) {
  const chat = useChatStore.getState()
  const msg = chat.messages.find((m) => m.id === id)
  if (!msg) return
  const p = (msg.payload ?? {}) as unknown as ChoicePayload
  const rules = useRulesStore.getState().saved
  const opt = pickChoiceOption(p.options ?? [], msg.id)
  if (!opt) return

  const said = rules.choice.reason.enabled && seededHit(`ch-r:${msg.id}`, rules.choice.reason.p)
  const reason = said ? makeChoiceReason(opt, rules.choice.maxReasonChars) : undefined
  chat.patchMessage(id, {
    payload: { ...msg.payload, answer: { optionId: opt.id, reason, at: new Date().toISOString() } },
  })
  pushHisMessage({
    text: reason ? `我选「${opt.label}」。${reason}` : `我选「${opt.label}」。`,
    quoteOf: msg,
  })
  console.debug('[engine] 他答了你的抉择', opt.label, reason ?? '')
}

/** 他交卷：卡片就地更新 + 聊天里说一句 */
function answerMyQuestion(id: string) {
  const chat = useChatStore.getState()
  const msg = chat.messages.find((m) => m.id === id)
  if (!msg) return
  const p = (msg.payload ?? {}) as unknown as QuestionPayload
  const rules = useRulesStore.getState().saved

  const answers = makeQuestionAnswers(p.items ?? [], msg.id, rules.question.skipPerItem.p)
  const hasBlank = answers.length < (p.items?.length ?? 0)
  const note = seededHit(`qn-n:${msg.id}`, rules.question.noteP) ? makeQuestionNote(hasBlank) : undefined
  chat.patchMessage(id, {
    payload: { ...msg.payload, answers, note, submittedAt: new Date().toISOString() },
  })
  pushHisMessage({ text: note ?? '填好了，你看看。', quoteOf: msg })
  console.debug('[engine] 他填完了你的问卷', `${answers.length}/${p.items?.length ?? 0} 题`, note ?? '')
}

/* ───────────────── ⑥ 红包 / 礼物 ───────────────── */

/**
 * 我发出去的红包 → 他领（`redPacket.claim`）与「他回一个」（`redPacket.back`）。
 * 两件事**各自独立掷签**，所以「只领不回」「又领又回」「直接没领」都有可能。
 */
function hisRedPacketResponse(): TimelineEvent[] {
  const { messages } = useChatStore.getState()
  const { me } = useAppStore.getState()
  const rules = useRulesStore.getState().saved
  const rp = rules.redPacket
  const out: TimelineEvent[] = []

  for (const m of messages) {
    if (m.senderId !== me.id || m.kind !== 'RED_PACKET' || m.status === 'RECALLED') continue
    const p = m.payload as unknown as RedPacketPayload | undefined
    if (!p) continue
    const base = +new Date(m.createdAt)

    if (rp.claim.enabled && !p.claimed && seededHit(`rp:${m.id}`, rp.claim.p)) {
      out.push({
        key: `rp-claim:${m.id}`,
        at: base + seededRange(`rp-d:${m.id}`, rp.claim.delay) * 1000,
        run: () => claimMyRedPacket(m.id),
      })
    }

    // 回礼是独立掷签的；但「他发来的红包」只会有一个 ——
    // 否则同一张卡会被反复重排，他会一直给你回红包
    const backAlready = messages.some(
      (x) => x.senderId !== me.id && x.kind === 'RED_PACKET' && +new Date(x.createdAt) > base,
    )
    if (rp.back.enabled && !backAlready && seededHit(`rpb:${m.id}`, rp.back.p)) {
      out.push({
        key: `rp-back:${m.id}`,
        at: base + seededRange(`rpb-d:${m.id}`, rp.back.delay) * 1000,
        run: () => sendHisRedPacketBack(m.id),
      })
    }
  }
  return out
}

/** 他领了我的红包：卡片上写明「已领取」，微信式系统提示 + 可能还有一句谢谢 */
function claimMyRedPacket(id: string) {
  const chat = useChatStore.getState()
  const msg = chat.messages.find((m) => m.id === id)
  if (!msg) return
  const p = (msg.payload ?? {}) as unknown as RedPacketPayload
  const { dream } = useAppStore.getState()
  const rules = useRulesStore.getState().saved
  // 老数据里的金额可能是字符串（mock / 早期版本写的）→ 一律当数字算
  const amount = Number(p.amount)

  chat.patchMessage(id, {
    payload: {
      ...msg.payload,
      claimed: { byId: dream.id, amount, at: new Date().toISOString() },
    },
  })
  pushHisMessage({ kind: 'SYSTEM', text: `${dream.nickname} 领取了你的红包 ¥${amount.toFixed(2)}` })

  const thanks = rules.redPacket.thanks.enabled && seededHit(`rp-t:${id}`, rules.redPacket.thanks.p)
  if (thanks) pushHisMessage({ text: makeRedPacketThanks() })
  console.debug('[engine] 他领了你的红包', `¥${amount.toFixed(2)}`, thanks ? '（还回了句）' : '')
}

/** 他回一个红包给我（我用「拆开红包」自己点开才看得到金额） */
function sendHisRedPacketBack(id: string) {
  const rules = useRulesStore.getState().saved
  const amount = Number(seededRange(`rpb-amt:${id}`, rules.redPacket.back.amount).toFixed(2))
  const blessing = makeRedPacketBlessing()
  pushHisMessage({
    kind: 'RED_PACKET',
    text: blessing,
    payload: { amount, blessing, isRandom: false },
  })
  console.debug('[engine] 他回了一个红包', `¥${amount.toFixed(2)}`)
}

/** 我送出去的礼物 → 他收下（`gift.accept`） */
function hisGiftResponse(): TimelineEvent[] {
  const { messages } = useChatStore.getState()
  const { me } = useAppStore.getState()
  const rules = useRulesStore.getState().saved
  const out: TimelineEvent[] = []

  for (const m of messages) {
    if (m.senderId !== me.id || m.kind !== 'GIFT' || m.status === 'RECALLED') continue
    const p = m.payload as unknown as GiftPayload | undefined
    if (!p || p.accepted) continue
    if (!rules.gift.accept.enabled || !seededHit(`gf:${m.id}`, rules.gift.accept.p)) continue
    out.push({
      key: `gift:${m.id}`,
      at: +new Date(m.createdAt) + seededRange(`gf-d:${m.id}`, rules.gift.accept.delay) * 1000,
      run: () => acceptMyGift(m.id),
    })
  }
  return out
}

function acceptMyGift(id: string) {
  const chat = useChatStore.getState()
  const msg = chat.messages.find((m) => m.id === id)
  if (!msg) return
  const rules = useRulesStore.getState().saved
  const thanks = rules.gift.thanks.enabled && seededHit(`gf-t:${id}`, rules.gift.thanks.p)
  const text = thanks ? makeGiftThanks() : '收下了，谢谢。'

  chat.patchMessage(id, {
    payload: { ...msg.payload, accepted: { at: new Date().toISOString(), thanks: thanks ? text : undefined } },
  })
  pushHisMessage({ text, quoteOf: msg })
  console.debug('[engine] 他收下了你的礼物', String((msg.payload as GiftPayload | undefined)?.name ?? ''))
}

/** 他主动送我一件礼物（`gift.giveMe`，从礼物柜里挑一件） */
function hisGiftOpportunity(now: number): TimelineEvent | null {
  const { messages } = useChatStore.getState()
  const { dream, gifts } = useAppStore.getState()
  const rules = useRulesStore.getState().saved
  const g = rules.gift.giveMe
  if (!g.enabled || !gifts.length) return null

  const lastAt = messages
    .filter((m) => m.senderId === dream.id && m.kind === 'GIFT')
    .reduce((acc, m) => Math.max(acc, +new Date(m.createdAt)), 0)
  if (now - lastAt < Math.max(0, g.cooldownMin) * 60_000) return null

  const bucket = Math.floor(now / CHECK_MS)
  if (lastAt >= bucketStart(now)) return null // 一个节拍只给一次机会
  if (!seededHit(`gfo:${bucket}`, g.p)) return null
  if (inQuietHours(rules.proactive.message.quietHours, new Date(now))) return null

  return {
    key: `gift-auto:${bucket}`,
    at: bucketStart(now) + seededRange(`gfo-d:${bucket}`, [10_000, 240_000]),
    run: () => sendHisGift(),
  }
}

function sendHisGift() {
  const { gifts } = useAppStore.getState()
  const item = pick(gifts)
  if (!item) return
  pushHisMessage({
    kind: 'GIFT',
    text: item.name,
    payload: {
      giftId: item.id,
      name: item.name,
      icon: item.icon,
      price: item.price,
      imageUrl: item.imageUrl,
      note: makeGiftNote(),
    },
  })
  console.debug('[engine] 他送了你一件礼物', item.name)
}

/** 他主动画一张涂鸦发过来（`doodle.proactive`；不是等你先画） */
function hisDoodleOpportunity(now: number): TimelineEvent | null {
  const { messages } = useChatStore.getState()
  const { dream } = useAppStore.getState()
  const rules = useRulesStore.getState().saved
  const d = rules.doodle.proactive
  if (!d.enabled) return null

  const lastAt = messages
    .filter((m) => m.senderId === dream.id && m.kind === 'DOODLE')
    .reduce((acc, m) => Math.max(acc, +new Date(m.createdAt)), 0)
  if (now - lastAt < Math.max(0, d.cooldownMin) * 60_000) return null

  const bucket = Math.floor(now / CHECK_MS)
  if (lastAt >= bucketStart(now)) return null
  if (!seededHit(`ddo:${bucket}`, d.p)) return null
  if (inQuietHours(rules.proactive.message.quietHours, new Date(now))) return null

  return {
    key: `doodle-auto:${bucket}`,
    at: bucketStart(now) + seededRange(`ddo-d:${bucket}`, [20_000, 300_000]),
    run: () => {
      const tpl = seededPick(HIS_DOODLES, `ddo-tpl:${bucket}`)
      if (!tpl) return
      pushHisMessage({
        kind: 'DOODLE',
        text: '涂鸦',
        payload: {
          strokes: tpl.strokes,
          ratio: 4 / 3,
          from: 'him',
          comment: makeDoodleNote(),
        },
      })
      console.debug('[engine] 他主动画了一张涂鸦')
    },
  }
}

/* ───────────────── ⑥ 音乐邀请 / 涂鸦 ───────────────── */

/** 我邀请他一起听 → 他加入（`music.join`）→ 说一句 / 回推一首 */
function hisMusicResponse(): TimelineEvent[] {
  const { messages } = useChatStore.getState()
  const { me, dream } = useAppStore.getState()
  const rules = useRulesStore.getState().saved
  const m = rules.music
  const out: TimelineEvent[] = []
  if (!m.join.enabled) return out

  for (const msg of messages) {
    if (msg.senderId !== me.id || msg.kind !== 'MUSIC_INVITE' || msg.status === 'RECALLED') continue
    const p = msg.payload as unknown as MusicPayload | undefined
    if (!p || p.from === 'him' || p.joined) continue
    if (!seededHit(`mu:${msg.id}`, m.join.p)) continue
    out.push({
      key: `music:${msg.id}`,
      at: +new Date(msg.createdAt) + seededRange(`mu-d:${msg.id}`, m.join.delay) * 1000,
      run: () => joinMyMusic(msg.id),
    })
  }

  // 他回推一首：每次邀请最多推一首（数据里已经有他推的就跳过）
  const lastHis = messages
    .filter((x) => x.senderId === dream.id && x.kind === 'MUSIC_INVITE')
    .reduce((acc, x) => Math.max(acc, +new Date(x.createdAt)), 0)
  for (const msg of messages) {
    if (msg.senderId !== me.id || msg.kind !== 'MUSIC_INVITE') continue
    const base = +new Date(msg.createdAt)
    if (lastHis > base) continue
    const p = msg.payload as unknown as MusicPayload | undefined
    if (!p?.joined || !p.joined.at) continue
    if (!m.shareBack.enabled || !seededHit(`mu-sb:${msg.id}`, m.shareBack.p)) continue
    out.push({
      key: `music-back:${msg.id}`,
      at: +new Date(p.joined.at) + seededRange(`mu-sb-d:${msg.id}`, [20, 300]) * 1000,
      run: () => shareHisSong(),
    })
    break
  }
  return out
}

function joinMyMusic(id: string) {
  const chat = useChatStore.getState()
  const msg = chat.messages.find((m) => m.id === id)
  if (!msg) return
  const rules = useRulesStore.getState().saved
  const p = (msg.payload ?? {}) as unknown as MusicPayload
  const listenMin = Math.round(seededRange(`mu-min:${id}`, rules.music.listenMin))
  const at = new Date().toISOString()

  chat.patchMessage(id, { payload: { ...p, joined: { at }, listenMin } })
  if (rules.music.say.enabled && seededHit(`mu-say:${id}`, rules.music.say.p)) {
    pushHisMessage({ text: makeMusicLine(p.title), quoteOf: msg })
  }
  console.debug('[engine] 他加入了一起听', p.title, `${listenMin} 分钟`)
}

function shareHisSong() {
  const song = pick(SONGS)
  pushHisMessage({
    kind: 'MUSIC_INVITE',
    text: `${song.title} - ${song.artist}`,
    payload: { title: song.title, artist: song.artist, cover: song.cover, from: 'him' },
  })
  console.debug('[engine] 他回推了一首歌', song.title)
}

/** 我画了一张 → 他回话（`doodle.reply`）→ 也可能画一张回你 */
function hisDoodleResponse(): TimelineEvent[] {
  const { messages } = useChatStore.getState()
  const { me } = useAppStore.getState()
  const rules = useRulesStore.getState().saved
  const out: TimelineEvent[] = []
  if (!rules.doodle.reply.enabled) return out

  let replied = false
  for (const msg of messages) {
    if (msg.senderId !== me.id || msg.kind !== 'DOODLE' || msg.status === 'RECALLED') continue
    const p = msg.payload as unknown as DoodlePayload | undefined
    if (!p || p.from === 'him' || p.comment) continue
    if (replied) break
    if (!seededHit(`dd:${msg.id}`, rules.doodle.reply.p)) continue
    replied = true
    out.push({
      key: `doodle:${msg.id}`,
      at: +new Date(msg.createdAt) + seededRange(`dd-d:${msg.id}`, rules.doodle.reply.delay) * 1000,
      run: () => answerMyDoodle(msg.id),
    })
  }
  return out
}

function answerMyDoodle(id: string) {
  const chat = useChatStore.getState()
  const msg = chat.messages.find((m) => m.id === id)
  if (!msg) return
  const rules = useRulesStore.getState().saved
  const p = (msg.payload ?? {}) as unknown as DoodlePayload
  const comment = makeDoodleComment()

  chat.patchMessage(id, { payload: { ...p, comment } })
  pushHisMessage({ text: comment, quoteOf: msg })

  // 画一张回你：从他自己的模板里挑一张（种子 = 这条涂鸦的 id）
  if (rules.doodle.drawBack.enabled && seededHit(`dd-back:${id}`, rules.doodle.drawBack.p)) {
    const tpl = seededPick(HIS_DOODLES, `dd-tpl:${id}`)
    if (tpl) {
      pushHisMessage({
        kind: 'DOODLE',
        text: '涂鸦',
        payload: { strokes: tpl.strokes, ratio: 4 / 3, from: 'him', comment: makeDoodleNote() },
      })
    }
  }
  console.debug('[engine] 他看了你的涂鸦', comment)
}

/** 他从题库里挑一套来问我（`question.askMeP`，一天最多一次，种子 = 日期） */
function hisQuestionOpportunity(now: number): TimelineEvent | null {
  const { questionPacks, dream } = useAppStore.getState()
  const { messages } = useChatStore.getState()
  const rules = useRulesStore.getState().saved
  if (!questionPacks.length || !rules.question.enabled) return null

  const date = dayKeyOf(new Date(now))
  const hisQuestions = messages.filter(
    (m) =>
      m.senderId === dream.id &&
      m.kind === 'QUESTION' &&
      (m.payload as unknown as QuestionPayload | undefined)?.askedBy === 'him',
  )
  const lastAt = hisQuestions.reduce((acc, m) => Math.max(acc, +new Date(m.createdAt)), 0)
  if (lastAt && dayKeyOf(new Date(lastAt)) === date) return null
  if (now - lastAt < rules.question.askCooldownMin * 60_000) return null
  if (!seededHit(`q-ask:${date}`, rules.question.askMeP)) return null

  const pack = seededPick(questionPacks, `q-pack:${date}`)
  if (!pack) return null
  const at = Math.max(
    now,
    +new Date(`${date}T10:00:00`) + seededRange(`q-ask-at:${date}`, [0, 12 * 3600_000]),
  )
  return {
    key: `question-auto:${date}`,
    at,
    run: () => {
      useChatStore.getState().askQuestionFromDream(pack.title, pack.items)
      console.debug('[engine] 他从题库里挑了一套来问你', pack.title)
    },
  }
}

/** 他偷偷收藏我的东西（`favorite.collect`；聊天 / 字卡 / 语音 / 信 / 朋友圈） */
function hisFavoriteOpportunity(now: number): TimelineEvent | null {
  const { favorites, favoriteReasons, dream, me, letters, moments } = useAppStore.getState()
  const { messages } = useChatStore.getState()
  const rules = useRulesStore.getState().saved
  const f = rules.favorite.collect
  if (!f.enabled) return null

  const lastAt = favorites
    .filter((x) => x.owner === 'dream')
    .reduce((acc, x) => Math.max(acc, +new Date(x.createdAt)), 0)
  if (now - lastAt < Math.max(0, rules.favorite.cooldownMin) * 60_000) return null

  const has = (kind: string, refId: string) =>
    favorites.some((x) => x.owner === 'dream' && x.kind === kind && x.refId === refId)
  const within = (iso: string) => now - +new Date(iso) < 48 * 3600_000

  type Cand =
    | { at: number; key: string; kind: 'MESSAGE'; source: Message }
    | { at: number; key: string; kind: 'LETTER'; source: (typeof letters)[number] }
    | { at: number; key: string; kind: 'MOMENT'; source: (typeof moments)[number] }

  const candidates: Cand[] = []
  for (const m of messages) {
    if (m.senderId !== me.id || m.status === 'RECALLED' || !within(m.createdAt)) continue
    if (m.kind === 'SYSTEM' || m.kind === 'PAT' || m.kind === 'CALL_EVENT') continue
    const kind = m.kind === 'VOICE' ? 'VOICE' : 'MESSAGE'
    if (has(kind, m.id)) continue
    if (!seededHit(`fav:${m.id}`, f.p)) continue
    candidates.push({ at: +new Date(m.createdAt), key: `fav:${m.id}`, kind: 'MESSAGE', source: m })
  }
  for (const l of letters) {
    if (l.fromId !== me.id || !within(l.createdAt) || has('LETTER', l.id)) continue
    if (!seededHit(`fav:${l.id}`, f.p)) continue
    candidates.push({ at: +new Date(l.createdAt), key: `fav:${l.id}`, kind: 'LETTER', source: l })
  }
  for (const p of moments) {
    if (p.authorId !== me.id || !within(p.createdAt) || has('MOMENT', p.id)) continue
    if (!seededHit(`fav:${p.id}`, f.p)) continue
    candidates.push({ at: +new Date(p.createdAt), key: `fav:${p.id}`, kind: 'MOMENT', source: p })
  }
  if (!candidates.length) return null

  const pickOne = candidates.sort((a, b) => b.at - a.at)[0]
  const reason = seededPick(favoriteReasons, `fav-r:${pickOne.key}`) ?? '想留着'
  return {
    key: `fav-auto:${pickOne.key}`,
    at: Math.max(now, pickOne.at) + seededRange(`fav-d:${pickOne.key}`, [30_000, 600_000]),
    run: () => {
      const store = useAppStore.getState()
      if (pickOne.kind === 'MESSAGE') {
        store.addFavorite({ ...favoriteFromMessage(pickOne.source, 'dream'), reason })
      } else if (pickOne.kind === 'LETTER') {
        store.addFavorite({ ...favoriteFromLetter(pickOne.source, 'dream'), reason })
      } else {
        store.addFavorite({ ...favoriteFromMoment(pickOne.source, 'dream'), reason })
      }
      console.debug('[engine] 他收藏了你的东西', reason)
    },
  }
}

/* ───────────────────────── 排程 ───────────────────────── */

/** 当前所有「还没发生」的事件（按时间正序） */
export function pendingTimeline(): TimelineEvent[] {
  const now = Date.now()
  return [
    hisMomentOpportunity(now),
    hisLetterOpportunity(now),
    ...hisReactionsToMyMoments(),
    ...hisRepliesOnHisMoments(now),
    ...hisRepliesToMyLetters(),
    ...hisAnnotationsToMyLetters(),
    ...hisAnswersToMyCards(),
    ...hisRedPacketResponse(),
    ...hisGiftResponse(),
    hisGiftOpportunity(now),
    ...hisMusicResponse(),
    ...hisDoodleResponse(),
    hisDoodleOpportunity(now),
    hisQuestionOpportunity(now),
    hisFavoriteOpportunity(now),
  ]
    .filter((e): e is TimelineEvent => !!e)
    .sort((a, b) => a.at - b.at)
}

/** 下一个事件的状态（排查 / 引擎页展示用） */
export const timelineState: { at: number; key: string } = { at: 0, key: '' }

let timer: ReturnType<typeof setTimeout> | null = null
let attached = false

/** 重新推导并排好最近的那一个；事件跑完会自动再推导一次 */
export function checkTimeline() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  const next = pendingTimeline()[0]
  if (!next) {
    timelineState.at = 0
    timelineState.key = ''
    return
  }
  timelineState.at = next.at
  timelineState.key = next.key

  const wait = next.at - Date.now()
  const delay = wait > 0 ? wait : GRACE_MS[0] + Math.random() * (GRACE_MS[1] - GRACE_MS[0])
  timer = setTimeout(() => {
    timer = null
    next.run()
    checkTimeline()
  }, delay)
}

/**
 * 挂上时间轴（启动时调一次）：
 * 数据一变（发动态 / 收信 / 他点了赞）就重新推导，另有 10 分钟兜底节拍。
 */
export function attachTimeline() {
  if (attached) return
  attached = true

  checkTimeline()

  useAppStore.subscribe((s, prev) => {
    if (s.moments !== prev.moments || s.letters !== prev.letters) checkTimeline()
  })
  useRulesStore.subscribe((s, prev) => {
    if (s.saved !== prev.saved) checkTimeline()
  })
  // 聊天里多了一张卡（抉择 / 问卷…）或者他刚答完，都要重新推导
  useChatStore.subscribe((s, prev) => {
    if (s.messages !== prev.messages) checkTimeline()
  })

  // 主动发朋友圈 / 主动写信按节拍掷签，没人动数据时也要往前走
  setInterval(() => checkTimeline(), CHECK_MS / 2)
}

/** 引擎页的手动预览：不等概率与冷却，立刻来一次 */
export function fireTimelinePreview(kind: 'moment' | 'letter') {
  return kind === 'moment' ? emitHisMoment(true) : emitHisLetter(true)
}
