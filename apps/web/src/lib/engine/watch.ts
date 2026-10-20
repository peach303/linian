/**
 * 观影室（一起看片）的引擎
 *
 * 两件事分开说清楚：
 *   · **进度是真的** —— 本机视频文件 / 直链走 `<video>`，看到第几秒、一共看了多久都是真的
 *     （`<video>` 真的在走才累加，每秒结算一次，每 10 秒落一次盘）。
 *   · **他说的话是抽出来的** —— 他进不进来、发几条弹幕、发在哪一秒、房间里说一句、会不会先走，
 *     全部种子随机（种子 = 这一次观影的 id），刷新不会重掷；所有待办都从数据推导，不存定时任务表。
 *
 * B 站（iframe 官方播放器）和「只有片名」的片子：**进度我们拿不到**，
 * 所以那种片子不发弹幕（不在假进度上飘字），他的房间发言按「一起待了多久」的真实分钟数来 —— 界面上会写明。
 */
import { nid } from '@/lib/ids'
import { humanDur } from '@/lib/companion'
import { onVideo, videoState } from '@/lib/videoEl'
import { watchCover, watchPlayKind } from '@/lib/watch'
import { MOCK_CONVERSATION } from '@/mock/chat'
import { useAppStore } from '@/store/useAppStore'
import { useChatStore } from '@/store/useChatStore'
import { useRulesStore } from '@/store/useRulesStore'
import {
  makeWatchBusy,
  makeWatchChatLine,
  makeWatchDanmaku,
  makeWatchEnd,
  makeWatchJoin,
  makeWatchLeave,
  makeWatchReply,
  makeWatchSay,
} from './content'
import { seededHit, seededRange } from './seed'
import type { ActiveWatch, Message, WatchDanmaku, WatchItem } from '@/types'

/** 他到场（有空的那些）不可能瞬移：1~6 秒 */
const ARRIVE_SEC: [number, number] = [1, 6]
/** 片子太短就不飘弹幕了：一次要飘 8 秒，比片子还长就成了干扰（片长拿不到也按这个拦） */
const DANMAKU_MIN_DUR = 15
/** 一秒一趟的钟：累计真实播放秒数 + 检查到场 / 发言 / 先走 */
const FLUSH_MS = 10_000

let attached = false
let clock: ReturnType<typeof setInterval> | null = null
let lastTickAt = 0
let pendingSec = 0
let pendingItemId: string | null = null

const timers: ReturnType<typeof setTimeout>[] = []
const after = (ms: number, fn: () => void) => timers.push(setTimeout(fn, Math.max(0, ms)))
const clearTimers = () => {
  timers.forEach(clearTimeout)
  timers.length = 0
}

const room = () => useAppStore.getState().watchRoom
const active = () => room().active
const rules = () => useRulesStore.getState().saved.watchRoom
const itemOf = (id?: string): WatchItem | undefined => room().items.find((i) => i.id === id)
const currentItem = (): WatchItem | undefined => itemOf(active()?.itemId)

const say = (text: string) => {
  useAppStore.getState().pushWatchMessage({
    id: nid('wm'),
    senderId: useAppStore.getState().dream.id,
    text,
    createdAt: new Date().toISOString(),
  })
  console.debug('[engine] 观影室里他说', text)
}

const patch = (p: Partial<ActiveWatch>) => useAppStore.getState().patchWatchActive(p)

/** 这部片的进度归谁管（`video` = 我们控得了，弹幕才有意义） */
const controllable = () => watchPlayKind(currentItem() ?? ({ source: { kind: 'title' } } as WatchItem)) === 'video'

/* ───────────────────────── 开始 / 结束 ───────────────────────── */

/**
 * 开始一次一起看（他进不进来 / 会不会先走，在这里各抽一次）
 * 种子 = 这一次观影的 id
 */
export function startWatch(itemId: string): ActiveWatch | null {
  const st = useAppStore.getState()
  if (st.watchRoom.active) return st.watchRoom.active
  const item = itemOf(itemId)
  if (!item) return null

  const id = nid('wt')
  const r = rules()
  const now = Date.now()
  const act: ActiveWatch = { id, itemId, startedAt: new Date(now).toISOString() }

  const onTime = r.join.enabled && seededHit(`wr-join:${id}`, r.join.p)
  const sec = onTime
    ? seededRange(`wr-arrive:${id}`, ARRIVE_SEC)
    : Math.round(seededRange(`wr-late:${id}`, r.joinDelay))
  act.heComingAt = new Date(now + sec * 1000).toISOString()
  if (r.leave.enabled && seededHit(`wr-leave:${id}`, r.leave.p)) {
    const min = Math.round(seededRange(`wr-leave-at:${id}`, r.leaveAfterMin))
    act.heLeavesAt = new Date(now + min * 60_000).toISOString()
  }

  st.startWatch(act)
  console.debug('[engine] 开始一起看', item.title, onTime ? '他马上进来' : '他要一会儿', act.heLeavesAt ? '（他打算中途先走）' : '')

  if (!onTime) {
    const waitMin = Math.max(1, Math.round((+new Date(act.heComingAt!) - now) / 60_000))
    after(600 + Math.random() * 1200, () => {
      if (active()?.id === id && !active()?.heJoinedAt) say(makeWatchBusy(waitMin))
    })
  }
  return act
}

/**
 * 结束一起看：他收尾一句 + 聊天里一条系统消息（`SYSTEM` 是安静类型，不会再触发回复引擎）
 * 「看了多久」用的是这一路累计的真实播放秒数（`watchRoom.playedSec` 的增量），不是墙上时间。
 */
export function endWatch(finished = false): void {
  const a = active()
  if (!a) return
  // 「这一场真的看了多久」= 收尾时的累计播放秒数 − 开始时的累计（不是墙上时间）
  const watched = Math.max(0, (room().playedSec ?? 0) - (a.basePlayedSec ?? 0))
  const wasThere = Boolean(a.heJoinedAt) || room().messages.length > 0
  if (a.heJoinedAt) say(makeWatchEnd(finished))

  clearTimers()
  useAppStore.getState().endWatch()

  const item = itemOf(a.itemId)
  // 没看成（没进度、他也没来）就不往聊天里塞东西 —— 只记录，不伪造
  if (item && (watched > 0 || wasThere)) {
    const chat = useChatStore.getState()
    const msg: Message = {
      id: nid('m'),
      conversationId: chat.conversation?.id ?? MOCK_CONVERSATION.id,
      senderId: useAppStore.getState().dream.id,
      kind: 'SYSTEM',
      status: 'SENT',
      text: makeWatchChatLine(
        watchCover(item),
        useAppStore.getState().dream.nickname,
        item.title,
        watched > 0 ? humanDur(watched) : '',
      ),
      payload: { watch: { itemId: item.id, title: item.title, playedSec: watched, finished } },
      createdAt: new Date().toISOString(),
    }
    chat.pushMessage(msg)
  }
  console.debug('[engine] 一起看结束', finished ? '看完了' : '先停在这儿', watched > 0 ? humanDur(watched) : '（这一场没有真实进度）')
}

/** 我在房间里说话之后，他回不回（回了返回 true） */
export function watchReplyMe(): boolean {
  const a = active()
  if (!a?.heJoinedAt) return false // 他没来 / 已经先走了
  const r = rules()
  if (!r.replyMe.enabled) return false
  if (!seededHit(`wr-reply:${a.id}:${room().messages.length}`, r.replyMe.p)) return false
  const id = a.id
  after(1200 + Math.random() * 3200, () => {
    const cur = active()
    if (cur?.id !== id || !cur.heJoinedAt) return
    say(makeWatchReply())
  })
  return true
}

/* ───────────────────────── 每秒回来的那一趟 ───────────────────────── */

/** 他到场：到了就把这一场的弹幕一次排好（位置固定 → 刷新不重掷，冒出来的时候才飘） */
function checkArrival(now: number) {
  const a = active()
  if (!a || a.heJoinedAt || !a.heComingAt) return
  if (now < +new Date(a.heComingAt)) return
  patch({ heJoinedAt: new Date().toISOString(), heComingAt: undefined })
  say(makeWatchJoin())
  planDanmaku()
}

/**
 * 排这一场的弹幕
 *
 * 位置 = 片子时长的 5%~95% 里随机散开（种子 = 观影 id + 序号），**现在就落库**，
 * 界面上只有播到那一刻才让它飘出来 —— 刷新重进看到的还是同一批、同一时刻。
 * 片长还不知道（B 站 / 只有片名）就**一条都不排**，不在假进度上飘字。
 */
function planDanmaku() {
  const a = active()
  if (!a) return
  const r = rules()
  if (!r.danmaku.enabled) return
  if (!controllable()) {
    console.debug('[engine] 这部片拿不到进度（B 站 / 只有片名）→ 这一场不发弹幕')
    return
  }
  const dur = videoState().duration || (itemOf(a.itemId)?.durationMs ?? 0) / 1000
  // 片长必须是个真实数字（直播流 / 边录边播的 webm 会是 Infinity 或 NaN → 当不知道处理）
  if (!Number.isFinite(dur) || !(dur > 0)) {
    console.debug('[engine] 还不知道片长（先播起来）→ 弹幕等片长出来再排')
    return
  }
  if (!(dur >= DANMAKU_MIN_DUR)) {
    console.debug('[engine] 片子只有', Math.round(dur), '秒（太短，飘一次比片子还长）→ 这一场不发弹幕')
    return
  }
  if ((a.plannedDanmaku ?? []).length) return // 已经排过

  const count = Math.max(0, Math.round(seededRange(`wr-dm-n:${a.id}`, r.danmakuCount)))
  const positions: number[] = []
  const usedText = new Set<string>()
  const list: WatchDanmaku[] = []
  for (let i = 0; i < count; i++) {
    const frac = seededRange(`wr-dm-at:${a.id}:${i}`, [0.05, 0.95])
    const atSec = Math.round(frac * dur)
    if (positions.includes(atSec)) continue
    // 一场里不重复同一句（`pick()` 是随机的，重掷几次就错开了）
    let text = makeWatchDanmaku(frac)
    for (let g = 0; g < 6 && usedText.has(text); g++) text = makeWatchDanmaku(frac)
    usedText.add(text)
    positions.push(atSec)
    list.push({
      id: nid('wd'),
      itemId: a.itemId,
      atSec,
      text,
      createdAt: new Date().toISOString(),
    })
  }
  list.sort((x, y) => x.atSec - y.atSec)
  list.forEach((d) => useAppStore.getState().pushWatchDanmaku(d))
  patch({ plannedDanmaku: positions.sort((x, y) => x - y) })
  console.debug('[engine] 这一场排了', list.length, '条弹幕（片长', Math.round(dur), '秒）')
}

/** 房间里他说一句：控得了进度的按片子进度，控不了就按「一起待了多久」 */
function checkSay(now: number) {
  const a = active()
  if (!a?.heJoinedAt || a.said) return
  const r = rules()
  if (!r.say.enabled) return
  if (!seededHit(`wr-say-will:${a.id}`, r.say.p)) {
    patch({ said: true }) // 这一场他不打算说话，别每秒问一次
    return
  }
  const elapsedMin = (now - +new Date(a.heJoinedAt)) / 60_000
  if (controllable()) {
    const dur = videoState().duration || (itemOf(a.itemId)?.durationMs ?? 0) / 1000
    if (!Number.isFinite(dur) || !(dur > 3)) return
    const at = seededRange(`wr-say-at:${a.id}`, [0.35, 0.75]) * dur
    if (videoState().position < at) return
    patch({ said: true })
    say(makeWatchSay(videoState().position / dur))
    return
  }
  const atMin = seededRange(`wr-say-at-real:${a.id}`, [3, 10])
  if (elapsedMin < atMin) return
  patch({ said: true })
  say(makeWatchSay(0.5))
}

/** 他先走（走了之后片照放，只是他不出声了） */
function checkLeave(now: number) {
  const a = active()
  if (!a?.heJoinedAt || !a.heLeavesAt) return
  if (now < +new Date(a.heLeavesAt)) return
  patch({ heJoinedAt: undefined })
  say(makeWatchLeave())
  clearTimers()
}

/** 真的看了多久：`<video>` 在走才累加（B 站 / 只有片名的不算），每 10 秒落一次盘 */
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

    const v = videoState()
    if (v.playing && !v.loading && v.itemId) {
      pendingSec += dt
      pendingItemId = v.itemId
      // 片长测出来了就把弹幕补排上（弹幕必须等片长才知道排在哪）
      if (a && !(a.plannedDanmaku ?? []).length) planDanmaku()
      useAppStore.getState().setWatchPosition(v.itemId, Math.round(v.position))
    }
    if (pendingSec >= FLUSH_MS / 1000 && pendingItemId) {
      const sec = Math.floor(pendingSec)
      pendingSec -= sec
      if (sec > 0) {
        useAppStore.getState().addWatchPlayedSec(pendingItemId, sec)
        const it = itemOf(pendingItemId)
        if (it && videoState().duration > 0) useAppStore.getState().patchWatchItem(it.id, { durationMs: Math.round(videoState().duration * 1000) })
      }
    }
  }, 1000)
}

export function attachWatchEngine() {
  if (attached) return
  attached = true
  onVideo(() => {
    // 「按下播放」本身就是开始信号（和「一起听」一样）——
    // 但只有真的在放才算：暂停 / 结束 / 换片时的状态变化不能再开一场
    const v = videoState()
    if (!v.itemId || !v.playing) return
    if (!active()) startWatch(v.itemId)
  })
  startClock()
}

/** 离开观影室：把没落盘的秒数补上（声音 / 画面由屏幕自己停） */
export function flushWatchClock() {
  const sec = Math.floor(pendingSec)
  pendingSec -= sec
  if (sec > 0 && pendingItemId) useAppStore.getState().addWatchPlayedSec(pendingItemId, sec)
}
