import { useAppStore } from '@/store/useAppStore'
import { useCallStore } from '@/store/useCallStore'
import { useChatStore } from '@/store/useChatStore'
import { useRulesStore } from '@/store/useRulesStore'
import { nid } from '@/lib/ids'
import { makeCallAfter, makeCallBye } from './content'
import { pushHisMessage } from './timeline'
import { seededHit, seededRange } from './seed'
import type { CallOutcome, CallPayload, Message } from '@/types'

/**
 * 语音通话
 *
 * 一通电话是**一条 CALL_EVENT 消息**（微信也是这么记的）：
 *   CALLING → 接通（TALKING）→ ENDED，或 CALLING → MISSED。
 * 结局、响铃时长、通话时长全部按种子抽（种子 = 消息 id）——
 * 挂断后再刷新，看到的还是同一通电话，不会被重掷。
 *
 * 没接通 = 他那边没人接（拒绝 / 忙线 / 无人接听），**不伪造**通话内容。
 */

let timers: ReturnType<typeof setTimeout>[] = []
const clearTimers = () => {
  timers.forEach(clearTimeout)
  timers = []
}
const after = (ms: number, fn: () => void) => {
  timers.push(setTimeout(fn, Math.max(0, ms)))
}

const patch = (id: string, payload: CallPayload) =>
  useChatStore.getState().patchMessage(id, { payload: payload as unknown as Record<string, unknown> })

/** 抽这一通电话的结局：先看接不接，没接的话再按权重给个理由 */
function rollOutcome(id: string): CallOutcome {
  const c = useRulesStore.getState().saved.call
  if (seededHit(`call-conn:${id}`, c.connect.p)) return 'connect'
  const reasons: [CallOutcome, number][] = [
    ['busy', Math.max(0, c.busy.p)],
    ['miss', Math.max(0, c.miss.p)],
    ['reject', Math.max(0, c.reject.p)],
  ]
  const total = reasons.reduce((a, [, p]) => a + p, 0)
  if (total <= 0) return 'miss'
  let u = seededRange(`call-why:${id}`, [0, total])
  for (const [k, p] of reasons) {
    if ((u -= p) <= 0) return k
  }
  return 'miss'
}

/** 拨出去（从「+ → 语音通话」点进来） */
export function startOutgoingCall(): Message | null {
  const chat = useChatStore.getState()
  const { conversation } = chat
  if (!conversation) return null
  if (useCallStore.getState().live) return null // 已经在通话里了
  clearTimers()

  const c = useRulesStore.getState().saved.call
  const id = nid('call')
  const calledAt = new Date().toISOString()
  const msg: Message = {
    id,
    conversationId: conversation.id,
    senderId: conversation.me.id,
    kind: 'CALL_EVENT',
    status: 'SENT',
    text: '语音通话',
    payload: { direction: 'out', phase: 'CALLING', calledAt } satisfies CallPayload,
    createdAt: calledAt,
  }
  chat.pushMessage(msg)
  useCallStore.getState().begin(id)

  const outcome = rollOutcome(id)
  const ringMs = Math.min(
    seededRange(`call-ring:${id}`, c.connect.delay) * 1000,
    Math.max(2, c.ringTimeoutSec) * 1000,
  )

  if (outcome !== 'connect') {
    // 没人接：响铃一会儿 → 记成未接
    after(Math.max(1500, ringMs), () => {
      patch(id, {
        direction: 'out',
        phase: 'MISSED',
        outcome,
        calledAt,
        endedAt: new Date().toISOString(),
      })
      useCallStore.getState().end()
      // 他看手机之后会补一句解释（不假装是通话内容）
      if (c.afterTalk.enabled && seededHit(`call-after:${id}`, c.afterTalk.p)) {
        after(seededRange(`call-after-d:${id}`, [5, 60]) * 1000, () => pushHisMessage({ text: makeCallAfter(), quoteOf: msg }))
      }
    })
    return msg
  }

  // 接通：响铃 → 通话计时
  const talkSec = Math.round(
    seededRange(`call-dur:${id}`, [45, Math.max(60, c.maxDurationMin * 60)]),
  )
  const hangupFirst = seededHit(`call-hang:${id}`, Math.max(0, Math.min(1, c.hangup.p)))
  const endSec = hangupFirst ? Math.max(5, Math.round(talkSec * seededRange(`call-hang-at:${id}`, [0.25, 0.7]))) : talkSec

  after(Math.max(1200, ringMs), () => {
    if (useCallStore.getState().live?.messageId !== id) return // 我已经先挂了
    const answeredAt = new Date().toISOString()
    patch(id, { direction: 'out', phase: 'TALKING', calledAt, answeredAt })
    useCallStore.getState().answer()

    after(endSec * 1000, () => {
      if (useCallStore.getState().live?.messageId !== id) return
      finishCall(id, endSec, hangupFirst ? 'hangup' : undefined)
    })
  })

  return msg
}

/** 收尾：补上时长并落一条「通话时长 mm:ss」 */
export function finishCall(id: string, durationSec: number, outcome?: CallOutcome) {
  const chat = useChatStore.getState()
  const msg = chat.messages.find((m) => m.id === id)
  if (!msg) return
  const p = (msg.payload ?? {}) as unknown as CallPayload
  const endedAt = new Date().toISOString()
  patch(id, {
    ...p,
    phase: 'ENDED',
    outcome: outcome ?? p.outcome,
    durationSec: Math.max(0, Math.round(durationSec)),
    endedAt,
  })
  useCallStore.getState().end()
  clearTimers()

  const c = useRulesStore.getState().saved.call
  if (c.afterTalk.enabled && seededHit(`call-bye:${id}`, c.afterTalk.p)) {
    after(seededRange(`call-bye-d:${id}`, [3, 40]) * 1000, () =>
      pushHisMessage({ text: makeCallBye(), quoteOf: msg }),
    )
  }
}

/** 我按了挂断 */
export function hangupCall() {
  const live = useCallStore.getState().live
  if (!live) return
  const { messageId, phase, since } = live
  if (phase === 'CALLING') {
    // 还没接通就挂掉 → 记成取消（未接的一种）
    const msg = useChatStore.getState().messages.find((m) => m.id === messageId)
    const p = (msg?.payload ?? {}) as unknown as CallPayload
    patch(messageId, { ...p, phase: 'MISSED', outcome: 'miss', endedAt: new Date().toISOString() })
    useCallStore.getState().end()
    clearTimers()
    return
  }
  finishCall(messageId, (Date.now() - since) / 1000)
}

/**
 * 启动时收尾：上一次关机 / 刷新时中断的通话直接按「已挂断」落定，
 * 别让界面上永远挂着「正在通话」。
 */
export function finalizeStaleCalls() {
  const { messages, patchMessage } = useChatStore.getState()
  for (const m of messages) {
    if (m.kind !== 'CALL_EVENT') continue
    const p = (m.payload ?? {}) as unknown as CallPayload
    if (p.phase !== 'CALLING' && p.phase !== 'TALKING') continue
    const from = p.answeredAt ? +new Date(p.answeredAt) : +new Date(p.calledAt)
    const sec = Math.max(0, Math.round((Date.now() - from) / 1000))
    patchMessage(m.id, {
      payload: { ...p, phase: 'ENDED', durationSec: sec, endedAt: new Date().toISOString() },
    })
  }
  useCallStore.getState().end()
}

/** 界面上那个跳动的秒表（通话中） */
export const formatClock = (sec: number) => {
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** 通话记录里显示的那句（引擎页 / 气泡共用） */
export function callSummary(p: CallPayload): string {
  if (p.phase === 'CALLING') return '正在呼叫…'
  if (p.phase === 'TALKING') return '通话中'
  if (p.phase === 'MISSED') {
    if (p.outcome === 'busy') return '对方忙线'
    if (p.outcome === 'reject') return '对方已拒绝'
    return p.durationSec ? '通话结束' : '对方无应答'
  }
  if (p.outcome === 'hangup') return `他先挂了 · ${formatClock(p.durationSec ?? 0)}`
  return `通话时长 ${formatClock(p.durationSec ?? 0)}`
}
