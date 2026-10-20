/**
 * 日记的引擎（只管他自动写的那条；我的日记不限条数）
 *
 * 这个模块没有「房间」，只有一天一个排程格。三件事说清楚：
 *
 *   · **我的日记不限制条数**（界面在 `DiaryScreen`）；这里只管他自动写的那条 ——
 *     他每天最多自动写一条（避免刷屏），写过之后改规则也不会重来一遍。
 *   · **他写的那条是抽出来的**：今天写不写、大概几点写、提不提今天真发生的事、写几句、会不会顺着我的留言写，
 *     全在 `diary.*` 规则里。种子 = **日期**（不是随机数），所以「今天他到底写不写」这件事
 *     早上抽和晚上抽是同一个答案，刷新也不会重掷。
 *   · **待办从数据推导，不存定时任务表**：他的「今天几点写」是用日期当种子从 `diary.atTime` 里抽出来的，
 *     不需要存 —— 每次开 App 重新算一遍，结果一样。
 *
 * 他提到的每一件事都来自**今天的真实记录**（`lib/diary.ts#collectFacts`）：没发生过就不提，不编。
 */
import { nid } from '@/lib/ids'
import { collectFacts, dayKeyOf, entryOf, HIS_MOODS, humanDuration, todayKey } from '@/lib/diary'
import { useAppStore } from '@/store/useAppStore'
import { useChatStore } from '@/store/useChatStore'
import { useRulesStore } from '@/store/useRulesStore'
import {
  makeDiaryAfterMine,
  makeDiaryClose,
  makeDiaryFactIntro,
  makeDiaryOpen,
  makeDiaryReplyOpen,
} from './content'
import { seededHit, seededPick, seededRange } from './seed'
import type { DiaryEntry, DiaryMood } from '@/types'

/** 一分钟一趟就够了：这件事只关心「到点没有」 */
const TICK_MS = 60_000
/** 我写完之后，他隔多久才写（分钟）—— 别像守在屏幕前等着 */
const REPLY_DELAY_MIN: [number, number] = [8, 45]

let attached = false
let clock: ReturnType<typeof setInterval> | null = null

const diary = () => useAppStore.getState().diary
const rules = () => useRulesStore.getState().saved.diary

const toMinutes = (hhmm: string): number => {
  const [h, m] = String(hhmm).split(':')
  const hh = Number.parseInt(h ?? '', 10)
  const mm = Number.parseInt(m ?? '', 10)
  return (Number.isFinite(hh) ? hh : 0) * 60 + (Number.isFinite(mm) ? mm : 0)
}

/**
 * 他今天打算几点写（分钟数，从 0 点算起）
 *
 * 种子 = 日期 → 今天算几次都是同一个点，不用存。
 * `atTime` 是 `[最早, 最晚]`；顺手兼容「跨零点」（比如 22:00~01:00，那就整段往后铺）。
 */
function hisPlannedMinute(date: string): number {
  const [a, b] = rules().atTime
  const from = toMinutes(a)
  const to = toMinutes(b)
  const span = to >= from ? to - from : to + 24 * 60 - from
  return from + seededRange(`diary-at:${date}`, [0, span])
}

/** 他今天会不会写（种子 = 日期 → 早上和晚上是同一个答案） */
const willWriteToday = (date: string) => rules().write.enabled && seededHit(`diary-write:${date}`, rules().write.p)

/** 我今天先写了之后，他会不会顺着写一条（种子 = 日期） */
const willReplyMine = (date: string) => rules().replyMine.enabled && seededHit(`diary-reply:${date}`, rules().replyMine.p)

/** 他此刻该不该写了（没写 + 到点 / 或者我写了且过了延迟）—— 纯推导，不存任务表 */
function dueReason(now: Date): 'time' | 'after-mine' | null {
  const date = dayKeyOf(now)
  const st = useAppStore.getState()
  if (entryOf(st.diary, st.dream.id, date)) return null // 他自动写的那条每天最多一次

  const cur = now.getHours() * 60 + now.getMinutes()
  if (willWriteToday(date) && cur >= hisPlannedMinute(date)) return 'time'

  const mine = entryOf(st.diary, st.me.id, date)
  if (mine && willReplyMine(date)) {
    const delay = seededRange(`diary-reply-delay:${date}`, REPLY_DELAY_MIN)
    if (now.getTime() >= +new Date(mine.createdAt) + delay * 60_000) return 'after-mine'
  }
  return null
}

/** 今天真的有这些事吗（决定要不要说「今天的事，我记几笔」） */
function todayFacts(date: string): string[] {
  const st = useAppStore.getState()
  const chat = useChatStore.getState()
  const r = rules()
  if (!r.mentionReal.enabled || !seededHit(`diary-real:${date}`, r.mentionReal.p)) return []
  return collectFacts({
    messages: chat.messages,
    meId: st.me.id,
    date,
    companionSessions: st.companion.sessions,
    moments: st.moments,
    letters: st.letters,
  })
}

/**
 * 写他今天这一条（自动排程每天最多一条，写完就不会再来）
 *
 * 结构：开场（跟心情走）→ [提今天真事] → 收尾；如果是「顺着我的留言写」的，
 * 开场换成「看到你写的了」那一路，中间插一句接住我的话。
 */
export function writeHisEntry(now = new Date(), reason: 'time' | 'after-mine' | 'manual' = 'manual'): DiaryEntry | null {
  const st = useAppStore.getState()
  const date = dayKeyOf(now)
  if (entryOf(st.diary, st.dream.id, date)) return null

  const r = rules()
  const mood = seededPick(HIS_MOODS, `diary-mood:${date}`) as DiaryMood
  const sentences = Math.max(1, Math.round(seededRange(`diary-lines:${date}`, r.lines)))

  const parts: string[] = []
  parts.push(reason === 'after-mine' ? makeDiaryReplyOpen() : makeDiaryOpen(mood))
  if (reason === 'after-mine') parts.push(makeDiaryAfterMine())

  const facts = todayFacts(date)
  // 句数里留出开场与收尾，剩下的位置给「今天真事」（至少留一条，多了也没用）
  const room = Math.max(1, sentences - parts.length - 1)
  const picked = facts.slice(0, Math.min(room, facts.length))
  if (picked.length) {
    parts.push(makeDiaryFactIntro())
    parts.push(picked.join('；') + '。')
  }
  parts.push(makeDiaryClose())

  const entry: DiaryEntry = {
    id: nid('dy'),
    authorId: st.dream.id,
    mood,
    text: parts.join(''),
    date,
    createdAt: now.toISOString(),
    facts: picked,
    byEngine: true,
  }
  useAppStore.getState().pushDiaryEntry(entry)
  console.debug('[engine] 他写了今天的日记（' + reason + '）：', entry.text)
  return entry
}

/** 手动叫他补一条（界面上「让他写一条」—— 只在他今天还没写时给这个按钮） */
export function promptHisEntry(): DiaryEntry | null {
  return writeHisEntry(new Date(), 'manual')
}

/** 一分钟一趟：只问一件事 —— 今天他到点了吗，要不要写 */
function check(now = new Date()) {
  const st = useAppStore.getState()
  if (!st.ready) return // 还没 hydrate，别在空 state 上写
  const reason = dueReason(now)
  if (!reason) return
  writeHisEntry(now, reason)
}

export function attachDiaryEngine() {
  if (attached) return
  attached = true
  // 开机先看一眼（今天已经过点了就直接补上，不用等下一分钟）
  check()
  clock = setInterval(() => check(), TICK_MS)
}

/** 界面上要显示的「他一般几点写」 */
export const hisWindowText = () => {
  const [a, b] = rules().atTime
  return `${a}~${b}`
}

/** 界面上要显示的「他今天写不写」（抽签结果，早看晚看都一样） */
export const willWriteText = (date = todayKey()) => (willWriteToday(date) ? '会写' : '今天不写')

export { humanDuration }
