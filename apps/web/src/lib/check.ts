/**
 * 查岗的纯工具
 *
 * 查岗最容易变成纯编：**我们拿不到他的定位、也看不到他的手机**（这台设备上没有任何这样的来源）。
 * 所以这个模块把报告拆成两堆，界面上也分两栏摆：
 *
 *   · **真的**（`realFacts`）：全部从本机记录现算 —— 他那边的钟点（按世界感知的时差换算）、
 *     他最后一条消息是多久前、他今天发了几条、他最近一次陪你一起做了什么、他今天写没写日记、
 *     他从你这儿拾走过什么、他的字卡库有多少张。**这些都是这台设备上真实存在的数据。**
 *   · **抽的**（`LOCATION_POOL` / `PHONE_POOL`）：定位与「手机屏幕上看到的东西」——
 *     只有候选池，由引擎按请求 id 的种子抽，界面上标明「抽的」。
 */
import { fromNow } from '@/lib/time'
import { bucketOf, clockOf, hisNow } from '@/lib/world'
import type { Card } from '@/types/cards'
import type { CheckPhone, CheckRequest, CheckType, Diary, Message, World } from '@/types'

export const CHECK_TYPE_LABEL: Record<CheckType, string> = {
  PHONE: '看看手机',
  LOCATION: '看看定位',
}

export const CHECK_STATUS_LABEL = {
  REQUESTED: '等你 / 等他回应',
  AGREED: '给你看了',
  REFUSED: '没给看',
  EXPIRED: '过期了',
} as const

/** 查岗结果里「抽的」那半边的候选池（按类型分） */
export const LOCATION_POOL = [
  '在公司楼下的便利店',
  '在家里书桌前',
  '在地铁上',
  '在小区门口等外卖',
  '在街角那家咖啡店',
  '在江边散步',
  '在加班的那层楼',
  '在回家的电梯里',
]

export const PHONE_POOL = [
  '微信置顶是你',
  '在跟同事的工作群来回',
  '相册最后一张是今天的天',
  '在刷一个很吵的短视频',
  '在翻你很早之前发的那条朋友圈',
  '刚拍了一张桌上的咖啡',
  '在和你的聊天记录里往上翻',
  '在听你收藏过的那首歌',
]

/** 「修饰过」时他会补的那句（对应 `checkPhone.fakeInfoP`） */
export const POLISHED_LINES = [
  '太干净了 —— 干净得像提前收拾过的。',
  '时间戳对不上：他说刚出门，可这张照片是两小时前的。',
  '背景里那件东西，跟他前两天说的行程不太对。',
  '他把截图裁过，边上留了道白。',
]

const QUIET = ['SYSTEM', 'CALL_EVENT', 'SEARCH_PUSH']

/** 冷却还剩多久（毫秒）：从**我上一次发起**（不管结论）算起 */
export function cooldownLeftMs(checks: CheckPhone['checks'], cooldownMin: number, meId: string, now = new Date()): number {
  const mine = checks.filter((c) => c.requesterId === meId)
  const last = mine[mine.length - 1]
  if (!last) return 0
  const ready = +new Date(last.requestedAt) + Math.max(0, cooldownMin) * 60_000
  return Math.max(0, ready - now.getTime())
}

/** 人话的剩余时间 */
export function humanLeft(ms: number): string {
  const min = Math.ceil(ms / 60_000)
  if (min <= 0) return '现在就能查'
  if (min < 60) return `${min} 分钟`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} 小时 ${m} 分钟` : `${h} 小时`
}

/** 还挂着、要**我**回应的那条（他查我） */
export const pendingForMe = (checks: CheckPhone['checks'], meId: string): CheckRequest | undefined =>
  [...checks].reverse().find((c) => c.targetId === meId && c.status === 'REQUESTED')

/** 还挂着、等**他**回应的那条（我查他） */
export const pendingForHim = (checks: CheckPhone['checks'], meId: string): CheckRequest | undefined =>
  [...checks].reverse().find((c) => c.requesterId === meId && c.status === 'REQUESTED')

export interface CheckFactInput {
  messages: Message[]
  meId: string
  nickname: string
  cards: Card[]
  diary: Diary
  world: World
  now?: Date
}

/**
 * 报告里**真的**那几条 —— 全部从本机记录现算
 *
 * 一条都算不出来（比如刚装上、什么都没发生过）就返回空数组，界面会说「暂时没什么可查的」。
 */
export function realFacts(input: CheckFactInput): string[] {
  const { messages, meId, nickname, cards, diary, world } = input
  const now = input.now ?? new Date()
  const facts: string[] = []

  /* ① 他那边的钟点（按我设的时差真换算） */
  if (world.offsetMin !== 0) {
    const his = hisNow(now, world.offsetMin)
    facts.push(`他那边现在是 ${clockOf(his)}（${bucketOf(his)}）`)
  } else {
    facts.push(`他那边和你同一个时间点（现在是 ${clockOf(now)}）`)
  }

  /* ② 他在这部手机里的痕迹：最后一条 / 今天几条 */
  const his = messages.filter((m) => m.senderId !== meId && !QUIET.includes(m.kind))
  const last = his[his.length - 1]
  if (last) facts.push(`他最后一条消息：${fromNow(last.createdAt, now)}`)
  const today = his.filter((m) => new Date(m.createdAt).toDateString() === now.toDateString())
  if (today.length) facts.push(`他今天发来 ${today.length} 条`)

  /* ③ 他最近一次陪你一起做点什么（收尾落在聊天里的那几条 + 通话 + 一起听） */
  const together = messages.filter((m) => {
    const p = m.payload as Record<string, { title?: string }> | undefined
    return Boolean(p?.watch?.title || p?.read?.title || p?.companion) || m.kind === 'CALL_EVENT' || (m.payload as { cardType?: string } | undefined)?.cardType === 'MUSIC_INVITE'
  })
  const lastTogether = together[together.length - 1]
  if (lastTogether) {
    const p = lastTogether.payload as Record<string, { title?: string; mode?: string; durationSec?: number }> | undefined
    const what = p?.watch?.title ? `一起看了《${p.watch.title}》` : p?.read?.title ? `一起读了《${p.read.title}》` : p?.companion ? '陪你待了一会儿' : lastTogether.kind === 'CALL_EVENT' ? '通了一次话' : '一起听了会儿歌'
    facts.push(`他最近一次陪你：${fromNow(lastTogether.createdAt, now)}（${what}）`)
  }

  /* ④ 日记（今天他写没写 —— 数据就在本机） */
  const wroteToday = diary.entries.some((e) => e.authorId !== meId && new Date(e.createdAt).toDateString() === now.toDateString())
  facts.push(wroteToday ? '他今天写了日记' : '他今天还没写日记')

  /* ⑤ 他的字卡库：拾走了你几句话、一共几张卡 */
  const picked = cards.filter((c) => c.source === 'PICKED')
  if (picked.length) facts.push(`他从你这儿拾走过 ${picked.length} 句话`)
  facts.push(`他的字卡库里一共 ${cards.length} 张卡`)

  return facts
}

/** 报告里「抽的」那几条的来源名（界面上要标明） */
export const fakeLabel = (type: CheckType) => (type === 'LOCATION' ? '定位（抽的）' : '手机屏幕（抽的）')

/** 报告摘要一句话（聊天里那条系统小字用） */
export function checkSummary(c: CheckRequest, nickname: string): string {
  const phone = c.type === 'PHONE'
  if (c.status === 'AGREED') return phone ? `🔍 查岗：${nickname}把手机给你看了` : `🔍 查岗：${nickname}把定位发你了`
  if (c.status === 'REFUSED') return phone ? `🔍 查岗：${nickname}把手机翻过去了` : `🔍 查岗：${nickname}没给定位`
  if (c.status === 'EXPIRED') return '🔍 查岗：这条过期了，他没看到'
  return `🔍 查岗：你${phone ? '看了他的手机' : '看了他的定位'}（等回应）`
}
