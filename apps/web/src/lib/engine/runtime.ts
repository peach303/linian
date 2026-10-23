/**
 * 引擎运行时 —— 把 `planner` 的抽签结果按时序「发」出去。
 *
 * 时序由配置决定（间隔 / 句数 / 撤回），落库走和「我发消息」完全相同的那条路：
 * 先写 IndexedDB → 再推后端（失败进 outbox），所以刷新、离线都不丢。
 *
 * 触发方式：订阅聊天仓库，只要出现「我发的新消息」就跑一轮（`attachReplyEngine` 在启动时挂一次）。
 */
import { planReply } from './planner'
import type { PlannedItem, ReplyPlan } from './planner'
import { isCardKind, isQuietKind } from './cards'
import { maybeAttachMeaning } from './meaning'
import { interruptedByReply, inQuietHours, dailyQuota, nextProactiveAt, proactiveCountToday } from './proactive'
import { useAppStore } from '@/store/useAppStore'
import { useCardsStore } from '@/store/useCardsStore'
import { useChatStore } from '@/store/useChatStore'
import { useRulesStore } from '@/store/useRulesStore'
import { useIntegrationsStore } from '@/store/useIntegrationsStore'
import { synthesize, type VoiceAudio, type VoiceEmotion } from '@/lib/voice'
import { quoteRefOf } from '@/lib/quote'
import { pickCachedLyric } from '@/lib/lyrics'
import { INTEGRATIONS } from '@/lib/integrations'
import type { Message } from '@/types'
import type { ReplyTrace } from '@/types/engine'

/** 兼容旧引用：接入开关现在住在 `lib/integrations.ts`（由接入设置写入） */
export { INTEGRATIONS }

/** 主动消息 / 已读回执用的排程 */
const sendTimers = new Set<ReturnType<typeof setTimeout>>()
/** 撤回等「已发出消息」的事后动作，不随重规划取消 */
const houseTimers = new Set<ReturnType<typeof setTimeout>>()
/** 已参与过抽签的消息 id（防重复触发） */
const seen = new Set<string>()
let attached = false

/**
 * 回复队列
 *
 * 以前「我发新消息」会 cancel 掉上一轮，所以连发两句时第一句可能永远等不到回复。
 * 现在每句话都排进队列，他按顺序一轮一轮回；语音合成也在队列里等，不会互相顶掉。
 */
interface ReplyJob {
  msg: Message
  plan: ReplyPlan
  token: number
}
const replyQueue: ReplyJob[] = []
let processingReply = false
let runToken = 0

const later = (ms: number, fn: () => void) => {
  const t = setTimeout(() => {
    sendTimers.delete(t)
    fn()
  }, Math.max(0, ms))
  sendTimers.add(t)
}

const laterHouse = (ms: number, fn: () => void) => {
  const t = setTimeout(() => {
    houseTimers.delete(t)
    fn()
  }, Math.max(0, ms))
  houseTimers.add(t)
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ms)))
const newId = () => `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

/** 清空还没发出的回复（清空聊天 / 解绑时用） */
export function cancelPlan() {
  runToken++
  replyQueue.length = 0
  processingReply = false
  for (const t of sendTimers) clearTimeout(t)
  sendTimers.clear()
  useChatStore.getState().setPeerTyping(false)
}

/** 本轮是否有排程在跑（UI 用） */
export const hasPending = () => processingReply || replyQueue.length > 0 || sendTimers.size > 0

/** 组装一条「他发的」消息并落库 */
function emit(
  item: PlannedItem,
  trace: ReplyTrace,
  plan: ReplyPlan,
  markProactive = false,
  audio?: VoiceAudio,
): Message {
  const { dream } = useAppStore.getState()
  const chat = useChatStore.getState()
  const quoted = item.quoteMyMessageId ? chat.messages.find((m) => m.id === item.quoteMyMessageId) : undefined
  /** 语音合出来了才是语音气泡；没合成出来就是普通文字（宁可是字，也不发点不响的假语音） */
  const voice = item.voice && audio

  const msg: Message = {
    id: newId(),
    conversationId: chat.conversation?.id ?? 'c_1',
    senderId: dream.id,
    kind: voice ? 'VOICE' : item.kind,
    status: 'SENT',
    text: item.text ?? (item.kind === 'PAT' ? `「${dream.nickname}」拍了拍你` : undefined),
    payload: voice
      ? {
          ...item.payload,
          url: audio!.url,
          durationMs: audio!.durationMs,
          via: item.voice?.url ? '语音卡' : 'MiniMax',
          voiceId: audio!.voiceId,
        }
      : item.payload,
    audioDurationMs: voice ? audio!.durationMs : undefined,
    quoteOf: quoted ? quoteRefOf(quoted) : undefined,
    emotionTags: item.emotionTags,
    latencyMs: item.delayMs,
    /** 主动消息：气泡左上角小爱心（`proactive_jobs` 的产物）；一次主动只标第一条 */
    proactive: (markProactive && plan.trigger === 'proactive') || undefined,
    plan: trace,
    createdAt: new Date().toISOString(),
  }

  const enriched = maybeAttachMeaning(msg, useRulesStore.getState().saved.chat.meaning.p)
  chat.pushMessage(enriched)

  if (item.recallAfterMs) {
    laterHouse(item.recallAfterMs, () => useChatStore.getState().recall(msg.id))
  }
  void plan
  return enriched
}

/* ───────────────────────── MiniMax 语音 ───────────────────────── */

/**
 * 命中语音的条目：**在拟真延迟里就把合成开跑**（延迟 3 秒，合成通常也就 1~3 秒）。
 * 到点时若还没好就等一下；始终没合成出来 → 退回文字，并把原因写进轨迹。
 */
function startVoices(items: PlannedItem[]): Map<PlannedItem, Promise<VoiceAudio | null>> {
  const tasks = new Map<PlannedItem, Promise<VoiceAudio | null>>()
  if (!INTEGRATIONS.tts) return tasks
  const conf = useIntegrationsStore.getState().status.minimax
  const pace = useRulesStore.getState().saved.voice.pace
  for (const item of items) {
    if (!item.voice) continue
    /** 字卡自带的语音：音频已经在这条计划里了，直接用，不用合成 */
    if (item.voice.url) continue
    tasks.set(
      item,
      synthesize(item.voice.text, {
        voiceId: conf.voiceId,
        model: conf.model,
        speed: pace,
        emotion: item.voice.emotion as VoiceEmotion | undefined,
      }),
    )
  }
  return tasks
}

/** 发一条（语音条目先等音频）。回复队列保证这一轮不会被下一句顶掉 */
async function sendItem(
  item: PlannedItem,
  trace: ReplyTrace,
  plan: ReplyPlan,
  voices: Map<PlannedItem, Promise<VoiceAudio | null>>,
  markProactive = false,
) {
  let audio: VoiceAudio | undefined
  /** 字卡自带的语音（语音卡）：现成音频，不合成、不花钱 */
  if (item.voice?.url) {
    audio = {
      url: item.voice.url,
      durationMs: item.voice.durationMs ?? 0,
      voiceId: item.voice.voiceId ?? '',
      model: item.voice.model ?? '',
      bytes: 0,
    }
  }
  const task = voices.get(item)
  if (task) {
    audio = (await task) ?? undefined
    if (!audio) {
      console.warn('[engine] 语音没合成出来 → 这条退化成文字：', item.voice?.text)
      trace.skipped = [...(trace.skipped ?? []), 'voice: 合成失败 → 这条退化成文字']
      const s = [...trace.steps].reverse().find((x) => x.label === 'MiniMax 语音')
      if (s) s.detail = '命中 → 但合成失败，这条退回文字'
    }
  }
  useChatStore.getState().setPeerTyping(false)
  emit(item, trace, plan, markProactive, audio)
}

/** 一条消息的回复任务：按计划里的相对延迟依次发；发完才轮到队列里的下一句 */
async function runReplyJob(job: ReplyJob) {
  const { plan, token } = job
  if (token !== runToken) return
  const voices = startVoices(plan.items)
  for (const item of plan.items) {
    if (token !== runToken) return
    const delay = Math.max(0, item.delayMs)
    if (item.kind !== 'PAT' && plan.typing) {
      const lead = Math.min(900, delay)
      await sleep(delay - lead)
      if (token !== runToken) return
      useChatStore.getState().setPeerTyping(true)
      await sleep(lead)
    } else {
      await sleep(delay)
    }
    if (token !== runToken) return
    await sendItem(item, plan.trace, plan, voices)
  }
  useChatStore.getState().setPeerTyping(false)
}

/** 队列串行处理：连发几句，就一轮一轮回，不再把上一句顶掉 */
async function drainReplyQueue() {
  if (processingReply) return
  processingReply = true
  try {
    while (replyQueue.length) {
      const job = replyQueue.shift()!
      if (job.token !== runToken) continue
      await runReplyJob(job)
    }
  } finally {
    processingReply = false
    useChatStore.getState().setPeerTyping(false)
  }
}

/** 对我的一条消息跑一轮抽签并排进回复队列 */
export function respondToMyMessage(myMsg: Message) {
  const { bonded } = useAppStore.getState()
  if (!bonded) return

  const chat = useChatStore.getState()
  const rulesStore = useRulesStore.getState()
  const rules = rulesStore.saved
  const cards = useCardsStore.getState().cards
  const { pats, dream } = useAppStore.getState()

  const plan = planReply({
    rules,
    cards,
    myMessage: myMsg,
    rulesVersion: rulesStore.version,
    integrations: INTEGRATIONS,
    hisPats: pats.his.filter((p) => p.enabled).map((p) => p.text),
    peerName: dream.nickname,
  })

  // 拾取（反向）：命中就把我上一句收进他的字卡库
  if (plan.pickup && myMsg.text) useCardsStore.getState().addPicked(myMsg.text)

  /* 已读回执：他「点开看了」→ 我的气泡下面出现「已读」小角标；
     命中已读不回时角标变成「已读不回」。轨迹也挂到我这条上，长按就能复盘。
     回执在排队时也照常出现，不因为上一轮还没发完就装没看见。 */
  const [iMin] = rules.chat.replyInterval
  const readAt = Math.round(Math.min(Math.max(iMin * 400, 800), 3000))
  const readPatch: Partial<Message> = {
    status: 'READ',
    plan: plan.trace,
  }
  const markRead = () => useChatStore.getState().patchMessage(myMsg.id, readPatch)
  if (plan.silent) laterHouse(readAt, markRead)
  else later(readAt, markRead)

  if (plan.silent || plan.items.length === 0) {
    console.debug('[engine] 已读不回', plan.trace)
    return
  }

  const queued = processingReply || replyQueue.length > 0
  if (queued) {
    plan.trace.steps.push({
      no: plan.trace.steps.length + 1,
      label: '回复队列',
      detail: '你连着发了消息 → 这条排在上一轮回复之后，不会被顶掉',
      hit: true,
    })
  }

  console.debug(
    '[engine] 出稿',
    plan.items.map((i) => `${i.kind}${i.recallAfterMs ? '(撤回)' : ''}: ${i.text ?? ''}`),
    plan.trace,
  )

  replyQueue.push({ msg: myMsg, plan, token: runToken })
  void drainReplyQueue()
  void chat
}

/**
 * 挂上引擎（启动时调一次）。
 * - 先把我已有的消息记成「已看过」，避免启动/拉取历史时触发抽签
 * - 批量注入（一次多出好几条）只记账不回复
 */
export function attachReplyEngine() {
  if (attached) return
  attached = true

  for (const m of useChatStore.getState().messages) seen.add(m.id)

  useChatStore.subscribe((state, prev) => {
    if (state.messages === prev.messages) return
    const grew = state.messages.length - prev.messages.length
    const last = state.messages[state.messages.length - 1]
    if (!last) return

    // 启动时拉历史 / 清空重载：只记账
    if (grew > 1) {
      for (const m of state.messages) seen.add(m.id)
      return
    }
    if (seen.has(last.id)) return
    seen.add(last.id)

    const { me } = useAppStore.getState()
    if (last.senderId !== me.id) return
    if (last.status === 'RECALLED' || last.kind === 'SYSTEM') return
    // 递给他的东西（抉择 / 问卷 / 红包…）由 timeline.ts 回应，聊天引擎不插手
    if (isCardKind(last.kind)) return
    // 通话事件 / 系统推送同理：它们不是「我说的一句话」，别回「递伞」这种无关的话
    if (isQuietKind(last.kind)) return
    respondToMyMessage(last)
  })
}

/* ───────────────────────── 主动消息调度 ───────────────────────── */

/** 下一次主动消息的排程状态（排查用；`at` 是计划时刻） */
export const proactiveState: { at: number; reason: string } = { at: 0, reason: '未排程' }

let proactiveTimer: ReturnType<typeof setTimeout> | null = null
let proactiveAttached = false

/** 最短等待：排到的时间已经过去（比如关机久了）也等一会儿再冒出来，别一开App就弹 */
const PROACTIVE_MIN_WAIT_MS = 30_000

const clearProactive = () => {
  if (proactiveTimer) clearTimeout(proactiveTimer)
  proactiveTimer = null
}

/**
 * 重排下一条主动消息。
 * 每次有新消息（我的 / 他的）都调一次 = 「从他最后一次说话重新计时」，
 * 所以只要你们在聊，他就不会突然插一句；安静下来了才轮到他主动。
 */
export function scheduleProactive() {
  clearProactive()
  const rules = useRulesStore.getState().saved
  const messages = useChatStore.getState().messages
  const now = Date.now()

  if (!useAppStore.getState().bonded) {
    proactiveState.at = 0
    proactiveState.reason = '未绑定梦角'
    return
  }

  // 以「最后一条消息」为计时起点：刷新 / 关机之后再打开，倒计时不会从头再来
  const last = messages[messages.length - 1]
  const base = new Date(Math.min(last ? new Date(last.createdAt).getTime() : now, now))
  const slot = nextProactiveAt(rules, { now: base, messages })

  if (!slot) {
    proactiveState.at = 0
    proactiveState.reason = '主动消息未开启'
    return
  }

  proactiveState.at = Math.max(slot.at, now + PROACTIVE_MIN_WAIT_MS)
  proactiveState.reason = slot.reason
  proactiveTimer = setTimeout(() => {
    proactiveTimer = null
    fireProactive('timer')
  }, proactiveState.at - now)
}

/**
 * 发一条主动消息（气泡左上角带 ❤️）。
 *
 * - `timer`：到点自动触发，先过三道闸 —— 免打扰时段 / 每日额度 / 被打断窗口（你刚说过话就取消）
 * - `manual`：设置 → 概率调节引擎 →「现在就来一条」的手动预览，跳过三道闸（方便马上看到效果）
 */
export function fireProactive(source: 'timer' | 'manual' = 'timer') {
  const { bonded, pats, dream } = useAppStore.getState()
  if (!bonded) return null

  const rulesStore = useRulesStore.getState()
  const rules = rulesStore.saved
  const p = rules.proactive.message
  const chat = useChatStore.getState()
  const now = new Date()

  // 正在回你的话 / 队列里还有没回完的，就先不插一条主动消息
  if (processingReply || replyQueue.length > 0) {
    console.debug('[engine] 主动消息：回复还没发完 → 等这一轮结束再排')
    scheduleProactive()
    return null
  }

  if (source === 'timer') {
    if (!p.enabled) return null

    if (inQuietHours(p.quietHours, now)) {
      console.debug('[engine] 主动消息：正处在免打扰时段 → 顺延')
      scheduleProactive()
      return null
    }
    if (proactiveCountToday(chat.messages, now) >= dailyQuota(p.dailyLimit, now)) {
      console.debug('[engine] 主动消息：今天的额度用完了 → 顺延到明天')
      scheduleProactive()
      return null
    }
    const myLast = [...chat.messages].reverse().find((m) => m.senderId !== dream.id)
    const gap = interruptedByReply(p.cancelIfRepliedWithin, myLast?.createdAt, now)
    if (gap != null) {
      console.debug(`[engine] 主动消息：你 ${gap.toFixed(0)} 秒前刚说过话 → 这条取消，重新计时`)
      scheduleProactive()
      return null
    }
  }

  const last = chat.messages[chat.messages.length - 1]
  const idleMinutes = last
    ? Math.max(0, Math.round((now.getTime() - new Date(last.createdAt).getTime()) / 60000))
    : undefined

  const plan = planReply({
    rules,
    cards: useCardsStore.getState().cards,
    myMessage: last,
    rulesVersion: rulesStore.version,
    integrations: INTEGRATIONS,
    hisPats: pats.his.filter((x) => x.enabled).map((x) => x.text),
    peerName: dream.nickname,
    mode: 'proactive',
    idleMinutes,
    proactiveNote: source === 'manual' ? '手动预览：不等间隔，立刻来一条' : undefined,
  })

  /* 偶尔从最近一首网易云的歌词里截一句，当他想说的话。
     只有真的缓存过歌词才发；没有就完全不提，不编一句「歌词」。 */
  const lyricRule = rules.music.lyric
  if (lyricRule?.enabled && Math.random() < lyricRule.p) {
    const room = useAppStore.getState().room
    const ordered = [
      room.tracks.find((t) => t.id === room.currentId),
      ...[...room.tracks].reverse(),
    ].filter((t): t is NonNullable<typeof t> => Boolean(t))
    for (const t of ordered) {
      const src = t.source
      const line =
        src.kind === 'netease'
          ? pickCachedLyric(src.songId, `proactive:${Date.now()}`, 'netease')
          : src.kind === 'qq'
            ? pickCachedLyric(src.songMid, `proactive:${Date.now()}`, 'qq')
            : null
      if (!line) continue
      plan.items.push({
        kind: 'TEXT',
        text: `「${line}」`,
        delayMs: Math.round(1500 + Math.random() * 2500),
        payload: {
          lyric: {
            line,
            title: t.title,
            artist: t.artist,
            ...(src.kind === 'netease'
              ? { songId: src.songId }
              : src.kind === 'qq'
                ? { songMid: src.songMid }
                : {}),
          },
        },
      })
      plan.trace.steps.push({
        no: plan.trace.steps.length + 1,
        label: '歌词截句',
        detail: `从《${t.title}》里截了一句：「${line.slice(0, 18)}${line.length > 18 ? '…' : ''}」`,
        hit: true,
      })
      break
    }
  }

  console.debug(
    '[engine] 主动消息',
    plan.items.map((i) => `${i.kind}: ${i.text ?? ''}`),
    plan.trace,
  )

  let at = 0
  let idx = 0
  let left = plan.items.length
  const voices = startVoices(plan.items)
  for (const item of plan.items) {
    at += item.delayMs
    const first = idx === 0
    later(at, () => {
      void (async () => {
        await sendItem(item, plan.trace, plan, voices, first)
        left--
        // 最后一條发完，再按最新的聊天记录排下一条主动消息（避免还没发完又排一条）
        if (left === 0) scheduleProactive()
      })()
    })
    idx++
  }

  if (plan.items.length === 0) scheduleProactive()
  return plan
}

/**
 * 挂上主动调度（启动时调一次）：
 * 排第一条 + 规则改动 / 聊天有新动静时重排。
 */
export function attachProactiveScheduler() {
  if (proactiveAttached) return
  proactiveAttached = true

  scheduleProactive()

  useRulesStore.subscribe((state, prev) => {
    if (state.saved !== prev.saved) scheduleProactive()
  })
  useChatStore.subscribe((state, prev) => {
    if (state.messages !== prev.messages) scheduleProactive()
  })
}
