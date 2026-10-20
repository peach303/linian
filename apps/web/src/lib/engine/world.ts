/**
 * 世界感知的引擎
 *
 * 这个模块只有一件事是真的：**他那边的钟点**（我这边现在 + 时差，真换算）。
 * 状态与「正在做的事」都是抽的 —— 但抽得**有据可查**：
 *
 *   · **种子 = 日期 + 采样槽**（槽长 = `world.intervalMin`）→ 同一段时间里反复看是**同一个答案**，
 *     刷新不重掷、跨槽才变；不用存任何定时任务表。
 *   · **按他那边的时段分池**：他那边的深夜抽不到「在开会」，早上也不会「准备睡了」。
 *   · **天气恒为 `null`** —— 没接天气源就不显示，界面上照实说。
 *
 * 「顺手在聊天里说一句」也在这里：每天最多一条（从采样记录里推导，不存任务表），
 * 你正处在免打扰时段就闭嘴。
 */
import { nid } from '@/lib/ids'
import { dayKeyOf } from '@/lib/diary'
import { bucketOf, clockOf, DOING_BY_BUCKET, hisNow, slotOf, STATUS_BY_BUCKET } from '@/lib/world'
import { MAX_WORLD_SAMPLES } from '@/lib/repo'
import { useAppStore } from '@/store/useAppStore'
import { useRulesStore } from '@/store/useRulesStore'
import { useChatStore } from '@/store/useChatStore'
import { MOCK_CONVERSATION } from '@/mock/chat'
import { inQuietHours } from './proactive'
import { makeWorldChatLine } from './content'
import { seededHit, seededPick, seededRange } from './seed'
import type { Message, WorldBucket, WorldSample } from '@/types'

/** 一分钟一趟就够了：这件事只关心「到没到下一个槽」 */
const TICK_MS = 60_000

let attached = false
let clock: ReturnType<typeof setInterval> | null = null

export interface WorldNow {
  /** 他那边的本地时间（真换算） */
  hisClock: string
  bucket: WorldBucket
  /** 他那边的状态（抽签；`undefined` = 这一次不带状态） */
  status?: string
  /** 正在做的事（抽签） */
  doing?: string
  /** 这一槽还剩多少分钟（过了就换一个答案） */
  slotLeftMin: number
}

const world = () => useAppStore.getState().world
const rules = () => useRulesStore.getState().saved.world

/**
 * 今天两次采样之间隔多久（分钟）= 采样槽的长度
 *
 * 用「日期」当种子从 `world.intervalMin` 里抽一次 —— 今天就是这一个数，
 * 所以「他这段时间的状态」在一个槽里是同一个答案。**不存任务表。**
 */
function stepMin(now: Date): number {
  const [a, b] = rules().intervalMin
  const lo = Math.max(1, Math.min(a ?? 60, b ?? 60))
  const hi = Math.max(lo, b ?? 60)
  return Math.max(5, Math.round(lo + seededRange(`world-step:${dayKeyOf(now)}`, [0, hi - lo])))
}

/** 他那边「现在」是什么样（同一槽里是同一个答案） */
export function worldNow(now = new Date()): WorldNow {
  const w = world()
  const r = rules()
  const his = hisNow(now, w.offsetMin)
  const bucket = bucketOf(his)
  const step = stepMin(now)
  const slot = slotOf(now, step)
  const seed = `world:${dayKeyOf(now)}:${slot}`

  const status = r.status.enabled && seededHit(`${seed}:st?`, r.status.p) ? seededPick(STATUS_BY_BUCKET[bucket], `${seed}:st`) : undefined
  const doing = r.doing.enabled && seededHit(`${seed}:do?`, r.doing.p) ? seededPick(DOING_BY_BUCKET[bucket], `${seed}:do`) : undefined

  return {
    hisClock: clockOf(his),
    bucket,
    status,
    doing,
    slotLeftMin: step - ((now.getHours() * 60 + now.getMinutes()) % step),
  }
}

/**
 * 采一条
 *
 * `manual` = 我在界面上点的「现在采一条」（不掷签，人说了算）；
 * `auto` = 到点自己采（调用方已经掷过签了）。
 */
export function takeSample(reason: 'auto' | 'manual' = 'auto', now = new Date()): WorldSample {
  const cur = worldNow(now)
  const sample: WorldSample = {
    id: nid('ws'),
    sampledAt: now.toISOString(),
    offsetMin: world().offsetMin,
    hisClock: cur.hisClock,
    bucket: cur.bucket,
    status: cur.status,
    doing: cur.doing,
    weather: null,
  }
  useAppStore.getState().addWorldSample(sample)
  console.debug('[engine] 世界感知采样（' + reason + '）：', sample.hisClock, sample.bucket, sample.status ?? '', sample.doing ?? '')
  return sample
}

/**
 * 今天已经在聊天里说过一条了吗
 *
 * **判据是聊天记录本身**（那条消息的 `payload.world` 在不在），不是采样记录里的标记 ——
 * 采样只留最近 40 条、也能被手动删掉，但「今天说过没有」这件事必须以聊天记录为真，
 * 否则删掉采样之后他会把同一句再说一遍。
 */
const saidToday = (date: string) =>
  useChatStore
    .getState()
    .messages.some((m) => Boolean((m.payload as { world?: unknown } | undefined)?.world) && dayKeyOf(m.createdAt) === date)

/** 这一条采样是不是已经在聊天里出现过了（给采样列表标「已在聊天里说过」） */
export const sampleSaid = (id: string) =>
  useChatStore.getState().messages.some((m) => (m.payload as { world?: { sampleId?: string } } | undefined)?.world?.sampleId === id)

/** 采到一条新的 → 可能顺手在聊天里说一句（每天最多一条 + 免打扰时段不说） */
function maybeSayToChat(sample: WorldSample, now: Date) {
  const r = rules()
  if (!r.toChat.enabled) return
  const date = dayKeyOf(now)
  if (saidToday(date)) return
  if (!seededHit(`world-chat:${date}`, r.toChat.p)) return
  const quiet = useRulesStore.getState().saved.proactive.message.quietHours
  if (inQuietHours(quiet, now)) {
    console.debug('[engine] 世界感知：想说话但正处在免打扰时段 → 不说')
    return
  }
  const st = useAppStore.getState()
  const chat = useChatStore.getState()
  const msg: Message = {
    id: nid('m'),
    conversationId: chat.conversation?.id ?? MOCK_CONVERSATION.id,
    senderId: st.dream.id,
    kind: 'TEXT',
    status: 'SENT',
    text: makeWorldChatLine(sample.bucket, sample.doing),
    payload: { world: { sampleId: sample.id, bucket: sample.bucket, hisClock: sample.hisClock } },
    createdAt: now.toISOString(),
  }
  chat.pushMessage(msg)
  console.debug('[engine] 世界感知：顺手在聊天里说了一句 →', msg.text)
}

/** 到点了吗（不存任务表：看最后一条采样 + 这一槽的种子） */
function check(now = new Date()) {
  const st = useAppStore.getState()
  if (!st.ready) return
  const r = rules()
  if (!r.sample.enabled) return

  const w = st.world
  const last = w.samples[w.samples.length - 1]
  const step = stepMin(now)
  if (last && now.getTime() - +new Date(last.sampledAt) < step * 60_000) return
  if (!seededHit(`world-hit:${dayKeyOf(now)}:${slotOf(now, step)}`, r.sample.p)) return

  const sample = takeSample('auto', now)
  maybeSayToChat(sample, now)
}

export function attachWorldEngine() {
  if (attached) return
  attached = true
  check()
  clock = setInterval(() => check(), TICK_MS)
}

/** 界面上要显示的「采样上限」（说明用） */
export const worldSampleCap = () => MAX_WORLD_SAMPLES
