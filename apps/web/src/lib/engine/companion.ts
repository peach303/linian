/**
 * 陪伴（睡觉 / 学习 / 工作）的引擎
 *
 * **陪伴是真的在计时**：从 `startedAt` 到收尾那一刻的真实秒数（挂在别的页面 / 关掉页面重进都照算），
 * 到点自动收尾的按目标时长封顶 —— 不虚报超时的部分。
 *
 * 他做的事全部**从数据推导**（没有定时任务表），刷新不会重掷：
 *   · 他一叫就来吗：`companion.join`；没空的话「一会儿」是 `companion.joinDelay`（到场时间存在 `heComingAt`）
 *   · 中途说不说话：每 10 分钟一个节拍抽一次 `companion.say`（种子 = 陪伴 id + 节拍号）
 *   · 他会不会先走：`companion.leave` + `companion.leaveAfterMin`（存在 `heLeavesAt`）
 *   · 我在房间里说话，他回不回：`companion.replyMe`
 *   · 到点 / 我点结束 → 落一条记录 + 收尾一句 + 聊天里一条系统消息（`SYSTEM` 是安静类型，不会再触发回复引擎）
 */
import { nid } from '@/lib/ids'
import { elapsedSec, humanDur, modeMeta } from '@/lib/companion'
import { MOCK_CONVERSATION } from '@/mock/chat'
import { useAppStore } from '@/store/useAppStore'
import { useChatStore } from '@/store/useChatStore'
import { useRulesStore } from '@/store/useRulesStore'
import {
  makeCompanionBusy,
  makeCompanionChatLine,
  makeCompanionEnd,
  makeCompanionLeave,
  makeCompanionOpen,
  makeCompanionReply,
  makeCompanionSay,
} from './content'
import { seededHit, seededRange } from './seed'
import type { ActiveCompanion, CompanionMessage, CompanionMode, CompanionSession, Message } from '@/types'

/** 他说一句的节拍：10 分钟 */
const SAY_BUCKET_MS = 10 * 60 * 1000
/** 他到场（有空的那些）不可能瞬移：1~6 秒 */
const ARRIVE_SEC: [number, number] = [1, 6]

let attached = false
let clock: ReturnType<typeof setInterval> | null = null
const timers: ReturnType<typeof setTimeout>[] = []
const after = (ms: number, fn: () => void) => timers.push(setTimeout(fn, Math.max(0, ms)))
const clearTimers = () => {
  timers.forEach(clearTimeout)
  timers.length = 0
}

const companion = () => useAppStore.getState().companion
const active = () => companion().active
const rules = () => useRulesStore.getState().saved.companion

const say = (text: string) => {
  const msg: CompanionMessage = {
    id: nid('cm'),
    senderId: useAppStore.getState().dream.id,
    text,
    createdAt: new Date().toISOString(),
  }
  useAppStore.getState().pushCompanionMessage(msg)
  console.debug('[engine] 陪伴里他说', text)
}

const patch = (p: Partial<ActiveCompanion>) => useAppStore.getState().patchCompanionActive(p)

/* ───────────────────────── 开始 / 结束 ───────────────────────── */

export interface StartCompanionOpts {
  mode: CompanionMode
  /** 目标时长（分钟）；0 = 不定时 */
  plannedMin: number
  note?: string
  backgroundUrl?: string
}

/**
 * 开始一次陪伴
 * 他在「有没有空 / 多久之后来 / 会不会先走」上各抽一次，抽签全部用陪伴 id 当种子。
 */
export function startCompanion(opts: StartCompanionOpts): ActiveCompanion | null {
  const st = useAppStore.getState()
  if (st.companion.active) return st.companion.active

  const id = nid('cp')
  const r = rules()
  const now = Date.now()
  const act: ActiveCompanion = {
    id,
    mode: opts.mode,
    startedAt: new Date(now).toISOString(),
    plannedMin: Math.max(0, Math.round(opts.plannedMin)),
    note: opts.note?.trim() || undefined,
    backgroundUrl: opts.backgroundUrl,
    saidBuckets: [],
  }

  const onTime = r.join.enabled && seededHit(`cp-join:${id}`, r.join.p)
  if (onTime) {
    const sec = seededRange(`cp-arrive:${id}`, ARRIVE_SEC)
    act.heComingAt = new Date(now + sec * 1000).toISOString()
  } else {
    const sec = Math.round(seededRange(`cp-late:${id}`, r.joinDelay))
    act.heComingAt = new Date(now + sec * 1000).toISOString()
  }
  if (r.leave.enabled && seededHit(`cp-leave:${id}`, r.leave.p)) {
    const min = Math.round(seededRange(`cp-leave-at:${id}`, r.leaveAfterMin))
    act.heLeavesAt = new Date(now + min * 60_000).toISOString()
  }

  useAppStore.getState().startCompanion(act)
  console.debug('[engine] 开始陪伴', opts.mode, `${act.plannedMin} 分钟`, onTime ? '他马上来' : '他先忙一会儿', act.heLeavesAt ? '（他打算中途先走）' : '')

  // 他没空的那些：立刻先解释一句（到场由 tick 负责）
  if (!onTime) {
    const waitMin = Math.max(1, Math.round((+new Date(act.heComingAt!) - now) / 60_000))
    after(600 + Math.random() * 1200, () => {
      if (active()?.id === id && !active()?.heJoinedAt) say(makeCompanionBusy(waitMin))
    })
  }
  return act
}

export type EndReason = 'done' | 'manual'

/** 结束陪伴：落一条记录 + 他收尾一句 + 聊天里一条系统消息 */
export function endCompanion(reason: EndReason = 'manual'): CompanionSession | null {
  const a = active()
  if (!a) return null

  const elapsed = elapsedSec(a.startedAt)
  const plannedSec = a.plannedMin * 60
  const interrupted = reason === 'manual' && plannedSec > 0 && elapsed < plannedSec - 5
  // 到点收尾的按目标时长封顶：不把「关掉页面半天后才回来」算成陪了 8 小时
  const durationSec = plannedSec > 0 ? Math.min(elapsed, plannedSec) : elapsed

  const session: CompanionSession = {
    id: a.id,
    mode: a.mode,
    plannedMin: a.plannedMin,
    durationSec,
    startedAt: a.startedAt,
    endedAt: new Date().toISOString(),
    interrupted: interrupted || undefined,
    heJoined: Boolean(a.heJoinedAt || a.heLeavesAt),
    heLeftEarly: a.heLeavesAt ? true : undefined,
    note: a.note,
    backgroundUrl: a.backgroundUrl,
  }

  // 他还在的话，收尾一句（他已经先走了就不硬拉他回来）
  if (a.heJoinedAt) say(makeCompanionEnd(a.mode, interrupted))

  clearTimers()
  useAppStore.getState().endCompanion(session)

  // 聊天里留一条（居中的系统小字，安静类型：不会再触发他的回复引擎）
  const meta = modeMeta(a.mode)
  const chat = useChatStore.getState()
  const msg: Message = {
    id: nid('m'),
    conversationId: chat.conversation?.id ?? MOCK_CONVERSATION.id,
    senderId: useAppStore.getState().dream.id,
    kind: 'SYSTEM',
    status: 'SENT',
    text: `${makeCompanionChatLine(meta.icon, useAppStore.getState().dream.nickname, meta.verb, humanDur(durationSec))}${a.note ? ` · ${a.note}` : ''}`,
    payload: { companion: { mode: a.mode, durationSec, plannedMin: a.plannedMin, interrupted: Boolean(interrupted) } },
    createdAt: new Date().toISOString(),
  }
  chat.pushMessage(msg)
  console.debug('[engine] 陪伴结束', a.mode, humanDur(durationSec), interrupted ? '（提前结束）' : '（到点）')
  return session
}

/** 我在房间里说话之后，他回不回（回了返回 true） */
export function companionReplyMe(): boolean {
  const a = active()
  if (!a?.heJoinedAt) return false // 他没来 / 已经先走了 → 不出声
  const r = rules()
  if (!r.replyMe.enabled) return false
  const seed = `cp-reply:${a.id}:${companion().messages.length}`
  if (!seededHit(seed, r.replyMe.p)) return false
  const id = a.id
  const mode = a.mode
  after(1200 + Math.random() * 3200, () => {
    const now = active()
    if (now?.id !== id || !now.heJoinedAt) return
    say(makeCompanionReply(mode))
  })
  return true
}

/* ───────────────────────── 每秒回来的那一趟 ───────────────────────── */

/** 他到场 */
function checkArrival(now: number) {
  const a = active()
  if (!a || a.heJoinedAt || !a.heComingAt) return
  if (now < +new Date(a.heComingAt)) return
  patch({ heJoinedAt: new Date().toISOString(), heComingAt: undefined })
  say(makeCompanionOpen(a.mode))
}

/** 他先走（走了之后陪伴继续计时，只是他不出声了） */
function checkLeave(now: number) {
  const a = active()
  if (!a?.heJoinedAt || !a.heLeavesAt) return
  if (now < +new Date(a.heLeavesAt)) return
  patch({ heJoinedAt: undefined })
  say(makeCompanionLeave(a.mode))
}

/** 每 10 分钟一个节拍：他可能说一句（种子固定 → 刷新不会重掷） */
function checkSay(now: number) {
  const a = active()
  if (!a?.heJoinedAt) return
  const r = rules()
  if (!r.say.enabled) return
  const bucket = Math.floor((now - +new Date(a.startedAt)) / SAY_BUCKET_MS)
  if (bucket < 1) return
  if ((a.saidBuckets ?? []).includes(bucket)) return
  if (!seededHit(`cp-say:${a.id}:${bucket}`, r.say.p)) return
  const leftMin =
    a.plannedMin > 0 ? Math.max(0, a.plannedMin - Math.floor((now - +new Date(a.startedAt)) / 60_000)) : -1
  patch({ saidBuckets: [...(a.saidBuckets ?? []), bucket] })
  say(makeCompanionSay(a.mode, leftMin))
}

/** 到点（目标时长）→ 自动收尾 */
function checkAutoEnd(now: number) {
  const a = active()
  if (!a || a.plannedMin <= 0) return
  if (now - +new Date(a.startedAt) < a.plannedMin * 60_000) return
  endCompanion('done')
}

function onTick() {
  if (!active()) return
  const now = Date.now()
  checkArrival(now)
  checkLeave(now)
  checkSay(now)
  checkAutoEnd(now)
}

export function attachCompanionEngine() {
  if (attached) return
  attached = true
  if (!clock) clock = setInterval(onTick, 1000)
  onTick() // 刷新前就在陪伴中 → 立刻补上该补的（到场 / 收尾）
}
