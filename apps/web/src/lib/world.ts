/**
 * 世界感知的纯工具
 *
 * 这个模块最容易滑向「编」：他那边的天气、他此刻在做什么，我们**没有任何真实的来源**。
 * 所以这里把两件事分开：
 *
 *   · **能算的**：他那边的钟点 —— 用「我这边现在 + 我设的时差」真换算（`hisNow` / `clockOf`），时段也从它推；
 *   · **不能算的**：状态与正在做的事 —— 只有候选池（`STATUS_BY_BUCKET` / `DOING_BY_BUCKET`），
 *     由引擎按「日期 + 采样槽」的种子抽（见 `lib/engine/world.ts`），界面上标明「抽的」。
 *   · **没有的**：天气 —— 没接天气源就恒为 `null`，界面照实说，不编。
 */
import type { WorldBucket } from '@/types'

/** 一天里的时段（按**他那边**的钟点分；名字就是界面上显示的那个词） */
export const WORLD_BUCKETS: WorldBucket[] = ['凌晨', '早上', '上午', '中午', '下午', '傍晚', '晚上', '深夜']

/** 他那边现在是哪个时段（按他那边的小时数） */
export function bucketOf(his: Date): WorldBucket {
  const h = his.getHours()
  if (h < 5) return '凌晨'
  if (h < 8) return '早上'
  if (h < 11) return '上午'
  if (h < 13) return '中午'
  if (h < 17) return '下午'
  if (h < 19) return '傍晚'
  if (h < 23) return '晚上'
  return '深夜'
}

/** 他那边的时间 = 我这边的时间 + 时差（分钟；正 = 他比我快） */
export const hisNow = (now: Date, offsetMin: number) => new Date(now.getTime() + offsetMin * 60_000)

/** `HH:mm` */
export const clockOf = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

/** 时差拆成「方向 + 小时 + 分钟」，给设置控件用 */
export function offsetParts(offsetMin: number) {
  const abs = Math.abs(offsetMin)
  return { ahead: offsetMin >= 0, hour: Math.floor(abs / 60), minute: abs % 60 }
}

export const offsetFromParts = (ahead: boolean, hour: number, minute: number) =>
  (ahead ? 1 : -1) * (Math.max(0, Math.round(hour)) * 60 + Math.max(0, Math.round(minute)))

/**
 * 采样槽：把一天按 `intervalMin` 切成格子
 *
 * 「他这段时间的状态」= 用 `日期 + 槽号` 当种子抽出来的 ——
 * 所以同一个槽里反复看是**同一个答案**（刷新不重掷），跨到下一个槽才会变。
 */
export const slotOf = (now: Date, intervalMin: number) => {
  const step = Math.max(1, Math.round(intervalMin))
  return Math.floor((now.getHours() * 60 + now.getMinutes()) / step)
}

/** 槽有多长（分钟）→ 给界面写「这个答案大概还会持续多久」 */
export function slotLeftMin(now: Date, intervalMin: number): number {
  const step = Math.max(1, Math.round(intervalMin))
  const rest = step - ((now.getHours() * 60 + now.getMinutes()) % step)
  return rest
}

/** 他那边的状态（按他那边**时段**分池：深夜不该「在开会」） */
export const STATUS_BY_BUCKET: Record<WorldBucket, string[]> = {
  凌晨: ['还没睡', '刚醒了一下', '在熬夜', '睡得浅'],
  早上: ['刚起床', '在洗漱', '还没醒透', '在吃早饭'],
  上午: ['在忙', '刚出门', '在开会', '在通勤'],
  中午: ['在吃饭', '在午休', '刚忙完', '在买咖啡'],
  下午: ['在忙', '有点困', '在赶东西', '刚开完会'],
  傍晚: ['刚收工', '在路上', '在买菜', '在散步'],
  晚上: ['在家了', '刚洗完澡', '在看书', '在发呆'],
  深夜: ['准备睡了', '还在忙', '在阳台吹风', '已经躺下了'],
}

/** 「正在做的事」（同样按时段分池） */
export const DOING_BY_BUCKET: Record<WorldBucket, string[]> = {
  凌晨: ['翻来翻去没睡着', '在厨房倒水', '在看手机', '听着歌'],
  早上: ['煮咖啡', '在刷牙', '在换衣服', '煎蛋'],
  上午: ['在写方案', '在会议室里', '在回邮件', '在赶地铁'],
  中午: ['在吃面', '趴桌上眯一会儿', '下楼买饭', '在刷手机'],
  下午: ['在改稿子', '对着屏幕发呆', '在写代码', '在跟人打电话'],
  傍晚: ['在收拾桌子', '在走回家', '在菜市场', '绕小区散步'],
  晚上: ['在看书', '在泡茶', '在洗衣服', '靠在沙发上'],
  深夜: ['关灯了', '在写点东西', '在听雨', '刷手机等睡意'],
}

/** 「他那边」和「我这边」的日期是不是同一天（跨零点的时差要说明白） */
export function sameDayInHisTime(now: Date, offsetMin: number) {
  const his = hisNow(now, offsetMin)
  return his.getFullYear() === now.getFullYear() && his.getMonth() === now.getMonth() && his.getDate() === now.getDate()
}

/** 他那边的日期差（他那边比我早/晚几天）—— 跨日的时候界面上说一句 */
export function hisDayShift(now: Date, offsetMin: number): number {
  const his = hisNow(now, offsetMin)
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const b = new Date(his.getFullYear(), his.getMonth(), his.getDate()).getTime()
  return Math.round((b - a) / 86_400_000)
}
