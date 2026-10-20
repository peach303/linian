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
import { interruptedByReply, inQuietHours, dailyQuota, nextProactiveAt, proactiveCountToday } from './proactive'
import { useAppStore } from '@/store/useAppStore'
import { useCardsStore } from '@/store/useCardsStore'
import { useChatStore } from '@/store/useChatStore'
import { useRulesStore } from '@/store/useRulesStore'
import { useIntegrationsStore } from '@/store/useIntegrationsStore'
import { synthesize, type VoiceAudio, type VoiceEmotion } from '@/lib/voice'
import { INTEGRATIONS } from '@/lib/integrations'
import type { Message } from '@/types'
import type { ReplyTrace } from '@/types/engine'

/** 兼容旧引用：接入开关现在住在 `lib/integrations.ts`（由接入设置写入） */
export { INTEGRATIONS }

/** 发送排程（新消息到来可整体取消重规划） */
const sendTimers = new Set<ReturnType<typeof setTimeout>>()
/** 撤回等「已发出消息」的事后动作，不随重规划取消 */
const houseTimers = new Set<ReturnType<typeof setTimeout>>()
/** 已参与过抽签的消息 id（防重复触发） */
const seen = new Set<string>()
let attached = false

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

const newId = () => `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

/** 取消还没发出去的部分（我连着发消息时，让他只回最新的那句） */
export function cancelPlan() {
  planSeq++ // 让「已经拿到音频、正在 await」的那条作废
  for (const t of sendTimers) clearTimeout(t)
  sendTimers.clear()
  useChatStore.getState().setPeerTyping(false)
}

/** 本轮计划序号：新计划一来，旧计划（含正在等语音合成的）就作废 */
let planSeq = 0

/** 本轮是否有排程在跑（UI 用） */
export const hasPending = () => sendTimers.size > 0

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
    quoteOf: quoted ? { id: quoted.id, text: quoted.text, senderId: quoted.senderId } : undefined,
    emotionTags: item.emotionTags,
    latencyMs: item.delayMs,
    /** 主动消息：气泡左上角小爱心（`proactive_jobs` 的产物）；一次主动只标第一条 */
    proactive: (markProactive && plan.trigger === 'proactive') || undefined,
    plan: trace,
    createdAt: new Date().toISOString(),
  }

  chat.pushMessage(msg)

  if (item.recallAfterMs) {
    laterHouse(item.recallAfterMs, () => useChatStore.getState().recall(msg.id))
  }
  void plan
  return msg
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

/** 发一条（语音条目先等音频）；`seq` 不等就说明这轮已经被新计划顶掉了 */
async function sendItem(
  seq: number,
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
    if (seq !== planSeq) return
    if (!audio) {
      console.warn('[engine] 语音没合成出来 → 这条退化成文字：', item.voice?.text)
      trace.skipped = [...(trace.skipped ?? []), 'voice: 合成失败 → 这条退化成文字']
      const s = [...trace.steps].reverse().find((x) => x.label === 'MiniMax 语音')
      if (s) s.detail = '命中 → 但合成失败，这条退回文字'
    }
  }
  if (seq !== planSeq) return
  useChatStore.getState().setPeerTyping(false)
  emit(item, trace, plan, markProactive, audio)
}

/** 对我的一条消息跑一轮抽签并排程 */
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

  // 他还在准备 → 取消旧排程，改回最新这句（避免回一句已经过期的）
  cancelPlan()
  const seq = planSeq

  // 拾取（反向）：命中就把我上一句收进他的字卡库
  if (plan.pickup && myMsg.text) useCardsStore.getState().addPicked(myMsg.text)

  /* 已读回执：他「点开看了」→ 我的气泡下面出现「已读」小角标；
     命中已读不回时角标变成「已读不回」。轨迹也挂到我这条上，长按就能复盘。 */
  const [iMin] = rules.chat.replyInterval
  const readAt = Math.round(Math.min(Math.max(iMin * 400, 800), 3000))
  const readPatch: Partial<Message> = {
    status: 'READ',
    plan: plan.trace,
  }
  const markRead = () => useChatStore.getState().patchMessage(myMsg.id, readPatch)
  if (plan.silent) {
    laterHouse(readAt, markRead)
  } else {
    later(readAt, markRead)
  }

  if (plan.silent || plan.items.length === 0) {
    console.debug('[engine] 已读不回', plan.trace)
    return
  }

  console.debug(
    '[engine] 出稿',
    plan.items.map((i) => `${i.kind}${i.recallAfterMs ? '(撤回)' : ''}: ${i.text ?? ''}`),
    plan.trace,
  )

  let at = 0
  const voices = startVoices(plan.items)
  for (const item of plan.items) {
    at += item.delayMs
    // 「正在输入」提前 0.9 秒出现（拍一拍不显示）
    if (item.kind !== 'PAT' && plan.typing) {
      later(at - 900, () => useChatStore.getState().setPeerTyping(true))
    }
    later(at, () => void sendItem(seq, item, plan.trace, plan, voices))
  }
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

  console.debug(
    '[engine] 主动消息',
    plan.items.map((i) => `${i.kind}: ${i.text ?? ''}`),
    plan.trace,
  )

  let at = 0
  let idx = 0
  const seq = planSeq
  const voices = startVoices(plan.items)
  for (const item of plan.items) {
    at += item.delayMs
    const first = idx === 0
    later(at, () => void sendItem(seq, item, plan.trace, plan, voices, first))
    idx++
  }

  // 发完顺手排下一条（额度、免打扰都重新算过了）
  scheduleProactive()
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
