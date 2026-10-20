/**
 * 主动消息调度（本机定时器版）
 *
 * 他在你安静下来之后**主动来找你**，而不是只等着回你。规则见 `rules.proactive.message`：
 *
 *   enabled                 总开关
 *   interval [min, max]     距上次说话多久后主动发一条（秒，随机落在区间内）
 *   dailyLimit [min, max]   每天主动几条：每天按日期稳定地抽一个额度（今天说得多、明天说得少）
 *   cancelIfRepliedWithin   被打断窗口（秒）：你在窗口期内回过话，这一条就取消，重新计时
 *   quietHours [起, 止]     免打扰时段（支持跨零点），落在里面就顺延到时段结束
 *
 * 这里只做**纯计算**（不碰定时器），排程与出稿在 `lib/engine/runtime.ts`；
 * 服务端对应实现是 `apps/server/src/engine/proactive.module.ts`（BullMQ，多端用）。
 */
import type { Message } from '@/types'
import type { RuleConfig } from '@/types/rules'

const DAY_MS = 24 * 3600 * 1000

/** [min, max] 区间里随机 */
export const randIn = ([a, b]: [number, number]) => a + Math.random() * Math.max(0, b - a)

/** "HH:mm" → 当天的分钟数 */
export function toMinutes(hhmm: string): number {
  const [h, m] = String(hhmm).split(':')
  const hh = Number.parseInt(h ?? '', 10)
  const mm = Number.parseInt(m ?? '', 10)
  return (Number.isFinite(hh) ? hh : 0) * 60 + (Number.isFinite(mm) ? mm : 0)
}

/** 本地日期键，用于「今天」的额度统计 */
export const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`

/** 当前是否落在免打扰时段（支持跨零点，如 00:30~07:30 / 23:00~07:00） */
export function inQuietHours(quiet: [string, string], d: Date): boolean {
  const [a, b] = [toMinutes(quiet[0]), toMinutes(quiet[1])]
  if (a === b) return false
  const cur = d.getHours() * 60 + d.getMinutes()
  return a < b ? cur >= a && cur < b : cur >= a || cur < b
}

/** 免打扰结束的时刻；当前不在免打扰里就原样返回 */
export function quietEndsAt(quiet: [string, string], d: Date): Date {
  if (!inQuietHours(quiet, d)) return d
  const [a, b] = [toMinutes(quiet[0]), toMinutes(quiet[1])]
  const out = new Date(d)
  const cur = d.getHours() * 60 + d.getMinutes()
  // 跨零点且已过起点（如 23:30 在 23:00~07:00 里）→ 明天早上
  if (a > b && cur >= a) out.setDate(out.getDate() + 1)
  out.setHours(0, b, 0, 0)
  return out
}

/**
 * 每天的目标额度：按日期在 [min, max] 里稳定地取一个整数。
 * 同一天内反复调用结果一致（不会因为每次检查都重掷而前后矛盾）。
 */
export function dailyQuota(dailyLimit: [number, number], d: Date): number {
  const lo = Math.max(0, Math.round(dailyLimit[0]))
  const hi = Math.max(lo, Math.round(dailyLimit[1]))
  if (hi === lo) return lo
  const key = dayKey(d)
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 100_000
  return lo + (h % (hi - lo + 1))
}

/** 今天他已经主动发了几条（从聊天记录里数，刷新/换设备后依然准；演示用的 mock 消息不算） */
export const proactiveCountToday = (messages: Message[], d: Date): number =>
  messages.filter(
    (m) => m.proactive && m.plan?.trigger === 'proactive' && dayKey(new Date(m.createdAt)) === dayKey(d),
  ).length

export interface ProactiveSlot {
  /** 计划发出的时刻（毫秒时间戳） */
  at: number
  /** 为什么排在这个时间（写进日志 / 便于排查） */
  reason: string
}

/** 排下一条主动消息；返回 null 表示当前不排（未开启） */
export function nextProactiveAt(
  rules: RuleConfig,
  { now, messages }: { now: Date; messages: Message[] },
): ProactiveSlot | null {
  const p = rules.proactive.message
  if (!p.enabled) return null

  /* 额度用完了 → 顺延到明天（免打扰结束后再随机一个间隔） */
  const quota = dailyQuota(p.dailyLimit, now)
  const used = proactiveCountToday(messages, now)
  if (used >= quota) {
    const start = quietEndsAt(p.quietHours, new Date(now.getTime() + DAY_MS))
    const at = start.getTime() + (randIn(p.interval) + randIn([0, 900])) * 1000
    return { at, reason: `今天的主动额度用完了（${used}/${quota} 条）→ 顺延到明天` }
  }

  /* 正常：随机一个间隔 */
  const at = now.getTime() + randIn(p.interval) * 1000
  const fireAt = new Date(at)

  /* 落进免打扰 → 推到时段结束，再随机抖 0~15 分钟（不会准点 7:30:00 冒出来） */
  if (inQuietHours(p.quietHours, fireAt)) {
    const end = quietEndsAt(p.quietHours, fireAt)
    return {
      at: end.getTime() + randIn([0, 900]) * 1000,
      reason: `原定时间落在免打扰（${p.quietHours[0]}~${p.quietHours[1]}）→ 顺延到时段结束`,
    }
  }

  return {
    at,
    reason: `间隔抽签 ${Math.round((at - now.getTime()) / 60000)} 分钟后（区间 ${p.interval[0]}~${p.interval[1]} 秒）`,
  }
}

/**
 * 该不该取消这一条（「被打断窗口」）：
 * 你在他要发之前 `cancelIfRepliedWithin` 秒内回过话，就把这条吃掉，重新计时。
 */
export function interruptedByReply(
  cancelIfRepliedWithin: number,
  myLastAt: string | undefined,
  now: Date,
): number | null {
  if (cancelIfRepliedWithin <= 0 || !myLastAt) return null
  const gap = (now.getTime() - new Date(myLastAt).getTime()) / 1000
  return gap >= 0 && gap < cancelIfRepliedWithin ? gap : null
}
