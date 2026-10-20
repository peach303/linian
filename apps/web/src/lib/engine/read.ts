/**
 * 阅读室（一起读）的引擎
 *
 * 和观影室同一套分工，但「进度」在读书这件事上要更小心，所以这里把话说明白：
 *
 *   · **真的读了多久** —— 只有同时满足三件事才算：
 *       ① 阅读室开着（屏幕挂着）② 页面在前台（切走了不算）③ 最近 45 秒内翻过页 / 滚过 / 点过。
 *     三条缺一条就停表（挂机刷手机、把页面丢后台都不算）；每 10 秒落一次盘。
 *   · **读到第几段是真的** —— 阅读器告诉我们当前段号（`state.readRoom.position`），
 *     进度百分比 = 段号 / 总段数；「只有书名」的书**没有正文就没有进度**，一秒都不记（跟观影室的 B 站一个道理）。
 *   · **他写什么、写在第几段是抽出来的** —— 进不进来、写几处批注 / 短句、写在哪一段、房间里说一句、
 *     会不会先走，全部种子随机（种子 = 这一次共读的 id），刷新不重掷；待办一律从数据推导，不存定时任务表。
 */
import { nid } from '@/lib/ids'
import { humanDur } from '@/lib/companion'
import { hasText, readCover } from '@/lib/read'
import { MOCK_CONVERSATION } from '@/mock/chat'
import { useAppStore } from '@/store/useAppStore'
import { useChatStore } from '@/store/useChatStore'
import { useRulesStore } from '@/store/useRulesStore'
import {
  makeReadBusy,
  makeReadChatLine,
  makeReadEnd,
  makeReadJoin,
  makeReadLeave,
  makeReadLine,
  makeReadMark,
  makeReadReply,
  makeReadSay,
  makeReadSayIdle,
} from './content'
import { seededHit, seededRange } from './seed'
import type { ActiveRead, Message, ReadBook, ReadMark } from '@/types'

/** 他到场（有空的那些）不可能瞬移：1~6 秒 */
const ARRIVE_SEC: [number, number] = [1, 6]
/** 「最近还在读」的窗口：这么久没翻页 / 滚动就当他不在读了（停表） */
const ACTIVE_WINDOW_MS = 45_000
/** 一秒一趟的钟：累计真实阅读秒数 + 检查到场 / 发言 / 先走 */
const FLUSH_MS = 10_000

let attached = false
let clock: ReturnType<typeof setInterval> | null = null
let lastTickAt = 0
let pendingSec = 0
let pendingBookId: string | null = null
/** 阅读室是不是开着（由屏幕挂载 / 卸载时告诉我们） */
let readingOpen = false
/** 最后一次「真的在读」的动作（翻页 / 滚动 / 点一下） */
let lastActivityAt = 0

const timers: ReturnType<typeof setTimeout>[] = []
const after = (ms: number, fn: () => void) => timers.push(setTimeout(fn, Math.max(0, ms)))
const clearTimers = () => {
  timers.forEach(clearTimeout)
  timers.length = 0
}

const room = () => useAppStore.getState().readRoom
const active = () => room().active
const rules = () => useRulesStore.getState().saved.readRoom
const bookOf = (id?: string): ReadBook | undefined => room().books.find((b) => b.id === id)
const currentBook = (): ReadBook | undefined => bookOf(active()?.bookId)

const say = (text: string) => {
  useAppStore.getState().pushReadMessage({
    id: nid('rm'),
    senderId: useAppStore.getState().dream.id,
    text,
    createdAt: new Date().toISOString(),
  })
  console.debug('[engine] 阅读室里他说', text)
}

const patch = (p: Partial<ActiveRead>) => useAppStore.getState().patchReadActive(p)

/** 这本书有没有正文（有正文才有真进度、才记时长） */
const traceable = () => hasText(currentBook())

/** 读到第几段（0 开始）；没有正文的书恒为 0 */
const atPara = () => {
  const a = active()
  if (!a) return 0
  return Math.max(0, room().position[a.bookId] ?? 0)
}

/** 进度 0~1（按段号；只有一段的书算 1） */
const progress = () => {
  const b = currentBook()
  const total = (b?.paraCount ?? 0) - 1
  if (total <= 0) return 0
  return Math.min(1, Math.max(0, atPara() / total))
}

/* ───────────────────────── 屏幕告诉我们的事 ───────────────────────── */

/** 阅读室挂着 / 收起（收起时把没落盘的秒数补上） */
export function setReadOpen(open: boolean) {
  readingOpen = open
  if (open) lastActivityAt = Date.now()
  else flushReadClock()
}

/** 翻页 / 滚动 / 点一下 —— 「还在读」的证据 */
export function markReadActivity() {
  lastActivityAt = Date.now()
}

/** 阅读器报进度：读到第几段（真值，界面的百分比就是它算的） */
export function reportReadProgress(bookId: string, para: number) {
  const st = useAppStore.getState()
  if (st.readRoom.position[bookId] === para) return
  st.setReadPosition(bookId, para)
}

/* ───────────────────────── 开始 / 结束 ───────────────────────── */

/**
 * 开始一次共读（他进不进来 / 会不会先走，在这里各抽一次）
 * 种子 = 这一次共读的 id
 */
export function startRead(bookId: string): ActiveRead | null {
  const st = useAppStore.getState()
  if (st.readRoom.active) return st.readRoom.active
  const book = bookOf(bookId)
  if (!book) return null

  const id = nid('rt')
  const r = rules()
  const now = Date.now()
  const act: ActiveRead = { id, bookId, startedAt: new Date(now).toISOString() }

  const onTime = r.join.enabled && seededHit(`rd-join:${id}`, r.join.p)
  const sec = onTime ? seededRange(`rd-arrive:${id}`, ARRIVE_SEC) : Math.round(seededRange(`rd-late:${id}`, r.joinDelay))
  act.heComingAt = new Date(now + sec * 1000).toISOString()
  if (r.leave.enabled && seededHit(`rd-leave:${id}`, r.leave.p)) {
    const min = Math.round(seededRange(`rd-leave-at:${id}`, r.leaveAfterMin))
    act.heLeavesAt = new Date(now + min * 60_000).toISOString()
  }

  st.startRead(act)
  markReadActivity()
  console.debug('[engine] 开始一起读', book.title, onTime ? '他马上过来' : '他要一会儿', act.heLeavesAt ? '（他打算中途先走）' : '')

  if (!onTime) {
    const waitMin = Math.max(1, Math.round((+new Date(act.heComingAt!) - now) / 60_000))
    after(600 + Math.random() * 1200, () => {
      if (active()?.id === id && !active()?.heJoinedAt) say(makeReadBusy(waitMin))
    })
  }
  return act
}

/**
 * 结束共读：他收尾一句 + 聊天里一条系统消息（`SYSTEM` 是安静类型，不会再触发回复引擎）
 * 「读了多久」用的是这一路累计的真实阅读秒数（`readRoom.readSec` 的增量），不是墙上时间。
 */
export function endRead(finished = false): void {
  const a = active()
  if (!a) return
  flushReadClock()
  const read = Math.max(0, (room().readSec ?? 0) - (a.baseReadSec ?? 0))
  const wasThere = Boolean(a.heJoinedAt) || room().messages.length > 0
  const book = bookOf(a.bookId)
  // 收尾那句也看有没有正文：「夹上书签 / 下一本读什么」这种话对只有书名的书是假话
  if (a.heJoinedAt) say(makeReadEnd(finished, hasText(book)))

  clearTimers()
  useAppStore.getState().endRead()

  // 没读成（没进度、他也没来）就不往聊天里塞东西 —— 只记录，不伪造
  if (book && (read > 0 || wasThere)) {
    const chat = useChatStore.getState()
    const msg: Message = {
      id: nid('m'),
      conversationId: chat.conversation?.id ?? MOCK_CONVERSATION.id,
      senderId: useAppStore.getState().dream.id,
      kind: 'SYSTEM',
      status: 'SENT',
      text: makeReadChatLine(
        readCover(book),
        useAppStore.getState().dream.nickname,
        book.title,
        read > 0 ? humanDur(read) : '',
      ),
      payload: { read: { bookId: book.id, title: book.title, readSec: read, finished } },
      createdAt: new Date().toISOString(),
    }
    chat.pushMessage(msg)
  }
  console.debug('[engine] 一起读结束', finished ? '读完了' : '先停在这儿', read > 0 ? humanDur(read) : '（这一场没有真实进度）')
}

/** 我在房间里说话之后，他回不回（回了返回 true） */
export function readReplyMe(): boolean {
  const a = active()
  if (!a?.heJoinedAt) return false // 他没来 / 已经先走了
  const r = rules()
  if (!r.replyMe.enabled) return false
  if (!seededHit(`rd-reply:${a.id}:${room().messages.length}`, r.replyMe.p)) return false
  const id = a.id
  after(1200 + Math.random() * 3200, () => {
    const cur = active()
    if (cur?.id !== id || !cur.heJoinedAt) return
    say(makeReadReply())
  })
  return true
}

/* ───────────────────────── 每秒回来的那一趟 ───────────────────────── */

/** 他到场：到了就把这一本的批注 / 短句一次排好（段落固定 → 刷新不重掷，读到那一段才显示） */
function checkArrival(now: number) {
  const a = active()
  if (!a || a.heJoinedAt || !a.heComingAt) return
  if (now < +new Date(a.heComingAt)) return
  patch({ heJoinedAt: new Date().toISOString(), heComingAt: undefined })
  say(makeReadJoin(traceable()))
  planMarks()
}

/**
 * 排这一本的页边批注与短句
 *
 * 段落号 = 总段数的 5%~95% 里随机散开（种子 = 共读 id + 序号），**现在就落库**，
 * 界面上只有读到那一段才显示 —— 刷新重进看到的还是同一批、同一段。
 * 没有正文（只有书名）就**一处都不排**，不在假进度上写字。
 */
function planMarks() {
  const a = active()
  if (!a) return
  const r = rules()
  if (!r.mark.enabled) return
  const book = bookOf(a.bookId)
  if (!traceable() || !book) {
    console.debug('[engine] 这本书没有正文（只有书名）→ 这一场不写批注')
    return
  }
  const total = (book.paraCount ?? 0) - 1
  if (total < 4) {
    console.debug('[engine] 这本书太短（只有', total + 1, '段）→ 页边就不写了')
    return
  }
  if ((a.plannedMarks ?? []).length) return // 已经排过

  const count = Math.max(0, Math.round(seededRange(`rd-mk-n:${a.id}`, r.markCount)))
  const paras: number[] = []
  const usedText = new Set<string>()
  const list: ReadMark[] = []
  for (let i = 0; i < count; i++) {
    const frac = seededRange(`rd-mk-at:${a.id}:${i}`, [0.05, 0.95])
    const paraIndex = Math.round(frac * total)
    if (paras.includes(paraIndex)) continue
    // 大多数是手写批注，偶尔是一句轻一点的短句
    const isLine = seededHit(`rd-mk-kind:${a.id}:${i}`, 0.35)
    let text = isLine ? makeReadLine() : makeReadMark()
    for (let g = 0; g < 6 && usedText.has(text); g++) text = isLine ? makeReadLine() : makeReadMark()
    usedText.add(text)
    paras.push(paraIndex)
    list.push({
      id: nid('rk'),
      bookId: a.bookId,
      kind: isLine ? 'LINE' : 'MARK',
      paraIndex,
      text,
      createdAt: new Date().toISOString(),
    })
  }
  list.sort((x, y) => x.paraIndex - y.paraIndex)
  list.forEach((m) => useAppStore.getState().pushReadMark(m))
  patch({ plannedMarks: paras.sort((x, y) => x - y) })
  console.debug('[engine] 这一本写了', list.length, '处（共', total + 1, '段）')
}

/** 房间里他说一句：有正文的按读到第几段，没正文的按「一起待了多久」 */
function checkSay(now: number) {
  const a = active()
  if (!a?.heJoinedAt || a.said) return
  const r = rules()
  if (!r.say.enabled) return
  if (!seededHit(`rd-say-will:${a.id}`, r.say.p)) {
    patch({ said: true }) // 这一场他不打算说话，别每秒问一次
    return
  }
  if (traceable()) {
    const book = bookOf(a.bookId)
    const total = (book?.paraCount ?? 0) - 1
    if (total < 1) return
    const at = seededRange(`rd-say-at:${a.id}`, [0.35, 0.75]) * total
    if (atPara() < at) return
    patch({ said: true })
    say(makeReadSay(progress()))
    return
  }
  const elapsedMin = (now - +new Date(a.heJoinedAt)) / 60_000
  const atMin = seededRange(`rd-say-at-real:${a.id}`, [3, 10])
  if (elapsedMin < atMin) return
  patch({ said: true })
  say(makeReadSayIdle())
}

/** 他先走（走了之后书照读，只是他不出声了） */
function checkLeave(now: number) {
  const a = active()
  if (!a?.heJoinedAt || !a.heLeavesAt) return
  if (now < +new Date(a.heLeavesAt)) return
  patch({ heJoinedAt: undefined })
  say(makeReadLeave(traceable()))
  clearTimers()
}

/**
 * 真的读了多久
 *
 * 三条同时成立才累加：阅读室开着 + 页面在前台 + 最近 45 秒内翻过页 / 滚过。
 * **没有正文的书（只有书名）一秒都不记** —— 那种「一起待着」没有可测的进度，就不编时长。
 * 每 10 秒把攒下的整数秒落盘。
 */
function startClock() {
  if (clock) return
  lastTickAt = Date.now()
  clock = setInterval(() => {
    const now = Date.now()
    const dt = (now - lastTickAt) / 1000
    lastTickAt = now

    const a = active()
    if (a) {
      checkArrival(now)
      checkLeave(now)
      checkSay(now)
    }

    if (a && traceable() && readingOpen && typeof document !== 'undefined' && document.visibilityState === 'visible') {
      if (now - lastActivityAt < ACTIVE_WINDOW_MS) {
        pendingSec += dt
        pendingBookId = a.bookId
      }
    }

    if (pendingSec >= FLUSH_MS / 1000 && pendingBookId) {
      const sec = Math.floor(pendingSec)
      pendingSec -= sec
      if (sec > 0) useAppStore.getState().addReadSec(pendingBookId, sec)
    }
  }, 1000)
}

export function attachReadEngine() {
  if (attached) return
  attached = true
  startClock()
}

/** 离开阅读室：把没落盘的秒数补上 */
export function flushReadClock() {
  const sec = Math.floor(pendingSec)
  pendingSec -= sec
  if (sec > 0 && pendingBookId) useAppStore.getState().addReadSec(pendingBookId, sec)
}
