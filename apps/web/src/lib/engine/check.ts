/**
 * 查岗的引擎
 *
 * 一句话原则：**能查到的只有这台手机里的记录，查不到的（定位 / 手机内容）一律标明是抽的。**
 *
 *   · 我发起：规则开关 + **真实冷却**（上一次发起的时刻 + `checkPhone.cooldownMin`，冷却是真的，界面上显示还差多久）。
 *     发出后他**几秒内**回应（`respondAt` 是种子定的，存在记录里 → 不存定时任务表，1 秒的钟到点结算）。
 *   · 报告分两堆：`facts` 从本机记录现算（真的），`faked` 是定位 / 手机屏幕（抽的，种子 = 请求 id）。
 *     `checkPhone.fakeInfoP` 命中则标「修饰过」（他自己承认改过）。
 *   · 他查我：种子 = 日期，每天最多 `checkPhone.dailyLimit` 次（1~5，默认 1；`askMeP` 每个名额独立抽签），到点落在界面上等我回应；
 *     我点了之后他会在聊天里回一句。
 *
 * `EXPIRED` 保留但本机版不产生（我们这边他 3~12 秒就回，不存在没人看见的超时；多端版才有）。
 */
import { nid } from '@/lib/ids'
import {
  CHECK_TYPE_LABEL,
  checkSummary,
  humanLeft,
  LOCATION_POOL,
  PHONE_POOL,
  POLISHED_LINES,
  realFacts,
} from '@/lib/check'
import { dayKeyOf } from '@/lib/diary'
import { MAX_CHECKS } from '@/lib/repo'
import { useAppStore } from '@/store/useAppStore'
import { useCardsStore } from '@/store/useCardsStore'
import { useChatStore } from '@/store/useChatStore'
import { useRulesStore } from '@/store/useRulesStore'
import { MOCK_CONVERSATION } from '@/mock/chat'
import {
  makeCheckAgreeReply,
  makeCheckAskLine,
  makeCheckGiveLine,
  makeCheckRefuseLine,
  makeCheckRefuseReply,
} from './content'
import { seededHit, seededPick, seededRange } from './seed'
import type { CheckReport, CheckRequest, CheckType, Message } from '@/types'

/** 他多久回（秒）—— 拟真一点，别像秒回机器人 */
const RESPOND_SEC: [number, number] = [3, 12]
/** 结算的钟跑多勤 */
const TICK_MS = 1000

let attached = false
let clock: ReturnType<typeof setInterval> | null = null

const checks = () => useAppStore.getState().checkPhone.checks
const rules = () => useRulesStore.getState().saved.checkPhone
const me = () => useAppStore.getState().me
const dream = () => useAppStore.getState().dream

/** 我上一次发起（不管结论）的时间 */
const lastMineAt = (): number =>
  checks()
    .filter((c) => c.requesterId === me().id)
    .reduce((n, c) => Math.max(n, +new Date(c.requestedAt)), 0)

/** 冷却还剩多少毫秒（真的：从数据算，不存状态） */
export function cooldownLeft(now = new Date()): number {
  const last = lastMineAt()
  if (!last) return 0
  return Math.max(0, last + Math.max(0, rules().cooldownMin) * 60_000 - now.getTime())
}

/** 我现在能不能发起（返回原因，界面照实说） */
export function canRequest(now = new Date()): { ok: boolean; reason?: string } {
  const r = rules()
  if (!r.enabled) return { ok: false, reason: '查岗功能关着（设置 → 概率调节引擎 → 其他）' }
  const left = cooldownLeft(now)
  if (left > 0) return { ok: false, reason: `还在冷却里，${humanLeft(left)}后能再查` }
  return { ok: true }
}

/** 他给的那份报告：真的 + 抽的 */
function buildReport(req: CheckRequest, now: Date): CheckReport {
  const st = useAppStore.getState()
  // 真的那堆：全部从本机记录现算
  const facts = realFacts({
    messages: useChatStore.getState().messages,
    meId: st.me.id,
    nickname: st.dream.nickname,
    cards: useCardsStore.getState().cards,
    diary: st.diary,
    world: st.world,
    now,
  })

  // 抽的那堆：定位 / 手机屏幕（种子 = 请求 id）
  const pool = req.type === 'LOCATION' ? LOCATION_POOL : PHONE_POOL
  const faked = [seededPick(pool, `chk-fake:${req.id}`) as string]
  if (req.type === 'PHONE') faked.push(seededPick(PHONE_POOL, `chk-fake2:${req.id}`) as string)

  const polished = seededHit(`chk-polish:${req.id}`, rules().fakeInfoP)
  if (polished) faked.push(seededPick(POLISHED_LINES, `chk-polish-line:${req.id}`) as string)

  return { facts, faked, polished }
}

/** 往聊天里落一条安静的系统小字（不触发回复引擎） */
function dropLine(text: string, payload: Record<string, unknown>) {
  const st = useAppStore.getState()
  const chat = useChatStore.getState()
  const msg: Message = {
    id: nid('m'),
    conversationId: chat.conversation?.id ?? MOCK_CONVERSATION.id,
    senderId: st.dream.id,
    kind: 'SYSTEM',
    status: 'SENT',
    text,
    payload,
    createdAt: new Date().toISOString(),
  }
  chat.pushMessage(msg)
}

/** 他说一句（普通消息，会出现在聊天里） */
function say(text: string, now = new Date()) {
  const st = useAppStore.getState()
  const chat = useChatStore.getState()
  const msg: Message = {
    id: nid('m'),
    conversationId: chat.conversation?.id ?? MOCK_CONVERSATION.id,
    senderId: st.dream.id,
    kind: 'TEXT',
    status: 'SENT',
    text,
    createdAt: now.toISOString(),
  }
  chat.pushMessage(msg)
  return msg
}

/** 我发起一次查岗 */
export function requestCheck(type: CheckType, note?: string, now = new Date()): { ok: boolean; reason?: string; req?: CheckRequest } {
  const gate = canRequest(now)
  if (!gate.ok) return { ok: false, reason: gate.reason }

  const id = nid('chk')
  const req: CheckRequest = {
    id,
    requesterId: me().id,
    targetId: dream().id,
    type,
    status: 'REQUESTED',
    note: note?.trim() || undefined,
    // 他什么时候回：种子 = 请求 id（存在记录里，钟到点结算 —— 不存任务表）
    respondAt: new Date(now.getTime() + seededRange(`chk-at:${id}`, RESPOND_SEC) * 1000).toISOString(),
    requestedAt: now.toISOString(),
  }
  useAppStore.getState().pushCheck(req)
  console.debug('[engine] 查岗：发起', CHECK_TYPE_LABEL[type], '→ 他大约', req.respondAt)
  return { ok: true, req }
}

/** 结算「我查他」：他同意 / 拒绝（种子 = 请求 id） */
export function settle(req: CheckRequest, now = new Date()): CheckRequest | null {
  if (req.status !== 'REQUESTED') return null
  const agreed = seededHit(`chk-ok:${req.id}`, rules().acceptP)
  const line = agreed ? makeCheckGiveLine() : makeCheckRefuseLine()
  const next: CheckRequest = agreed
    ? { ...req, status: 'AGREED', respondedAt: now.toISOString(), result: { ...buildReport(req, now), line } }
    : { ...req, status: 'REFUSED', respondedAt: now.toISOString(), result: { facts: [], faked: [], line } }
  useAppStore.getState().updateCheck(next)
  // 他先开口（普通消息），再落一条安静的系统小字说结论
  say(line, now)
  dropLine(checkSummary(next, dream().nickname), { check: { id: next.id, type: next.type, status: next.status } })
  console.debug('[engine] 查岗：他', agreed ? '给看了' : '拒绝了', `（${CHECK_TYPE_LABEL[req.type]}）`)
  return next
}

/** 我回应「他查我」 */
export function answerHisCheck(id: string, give: boolean, now = new Date()): CheckRequest | null {
  const req = checks().find((c) => c.id === id)
  if (!req || req.status !== 'REQUESTED') return null
  const next: CheckRequest = give
    ? { ...req, status: 'AGREED', respondedAt: now.toISOString(), result: { facts: [], faked: [] } }
    : { ...req, status: 'REFUSED', respondedAt: now.toISOString(), result: { facts: [], faked: [] } }
  useAppStore.getState().updateCheck(next)
  dropLine(give ? '🔍 查岗：你给他看了' : '🔍 查岗：你没给他看', { check: { id: next.id, type: next.type, status: next.status } })
  say(give ? makeCheckAgreeReply() : makeCheckRefuseReply(), now)
  return next
}

/** 他今天最多来几次（1~5；默认 1） */
const askLimit = () => Math.max(1, Math.min(5, Math.round(rules().dailyLimit ?? 1)))

/** 他今天的查岗名额：每个名额独立抽签；种子 = 日期，刷新不重掷 */
const hisAskSlots = (date: string) => {
  if (!rules().enabled) return [] as { at: number }[]
  const n = askLimit()
  const from = 9 * 60
  const span = 14 * 60 // 9:00 ~ 23:00
  const step = span / n
  const out: { at: number }[] = []
  for (let i = 0; i < n; i++) {
    if (!seededHit(`chk-ask:${date}:${i}`, rules().askMeP)) continue
    const start = from + step * i
    out.push({ at: start + seededRange(`chk-ask-at:${date}:${i}`, [0, step * 0.8]) })
  }
  return out
}

/** 他有没有还没回应的那条（用来避免重复发） */
const heHasOpen = () => checks().some((c) => c.requesterId === dream().id && c.status === 'REQUESTED')
const heAskedToday = (date: string) =>
  checks().filter((c) => c.requesterId === dream().id && dayKeyOf(c.requestedAt) === date).length

/** 一秒一趟：① 结算我发起的 ② 到点了就是他来找我 */
function check(now = new Date()) {
  const st = useAppStore.getState()
  if (!st.ready) return

  // ① 我发起的，到他回应的点了
  const open = checks().filter((c) => c.status === 'REQUESTED' && c.requesterId === st.me.id)
  for (const req of open) {
    if (now.getTime() >= +new Date(req.respondAt)) settle(req, now)
  }

  // ② 他查我：今天有抽中的名额 + 到点了 + 没超过上限 + 没有挂着的
  const date = dayKeyOf(now)
  if (!rules().enabled) return
  const slots = hisAskSlots(date)
  if (!slots.length) return
  const asked = heAskedToday(date)
  if (asked >= slots.length || asked >= askLimit()) return
  if (heHasOpen()) return
  const next = slots[asked]
  if (now.getHours() * 60 + now.getMinutes() < next.at) return

  const req: CheckRequest = {
    id: nid('chk'),
    requesterId: st.dream.id,
    targetId: st.me.id,
    type: 'PHONE',
    status: 'REQUESTED',
    respondAt: now.toISOString(),
    requestedAt: now.toISOString(),
  }
  st.pushCheck(req)
  // 他会先在聊天里问一句（普通消息）
  say(makeCheckAskLine(), now)
  console.debug('[engine] 查岗：他来找我看了', `今天第 ${asked + 1}/${slots.length} 条`)
}

export function attachCheckEngine() {
  if (attached) return
  attached = true
  check()
  clock = setInterval(() => check(), TICK_MS)
}

/** 界面上要显示的记录上限（说明用） */
export const checkCap = () => MAX_CHECKS

/** 他今天来不来（界面上照实说） */
export const hisAskText = (date = dayKeyOf(new Date())) => {
  const total = hisAskSlots(date).length
  const done = heAskedToday(date)
  if (!total) return '今天不会来查你'
  if (done >= total) return `今天已经来查过你 ${done} 次`
  return `今天会来查你（最多 ${Math.min(total, askLimit())} 条，已经 ${done} 条）`
}
