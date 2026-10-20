/** 纪念日 / 世界感知（时间差）相关的时间工具 */

const DAY = 86_400_000

/** 距离下一次纪念日的天数（recurring=true 时按年循环） */
export function daysUntil(dateStr: string, recurring = true, now = new Date()) {
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return null
  const target = new Date(now.getFullYear(), d.getMonth(), d.getDate())
  if (target.getTime() < startOfDay(now).getTime()) {
    if (!recurring) return null
    target.setFullYear(now.getFullYear() + 1)
  }
  return Math.round((startOfDay(target).getTime() - startOfDay(now).getTime()) / DAY)
}

/** 已在一起 / 已相识 的天数 */
export function daysSince(dateStr: string, now = new Date()) {
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return 0
  return Math.max(0, Math.floor((startOfDay(now).getTime() - startOfDay(d).getTime()) / DAY) + 1)
}

export function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

/** 世界感知：把「时间差（分钟）」渲染成可读文本，如 "他那边 1 小时前是晚上 11 点" */
export function describeTimeOffset(offsetMin: number) {
  if (offsetMin === 0) return '他和你处在同一个时间点'
  const abs = Math.abs(offsetMin)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  const span = [h ? `${h} 小时` : '', m ? `${m} 分钟` : ''].filter(Boolean).join(' ')
  return `他那边比你${offsetMin > 0 ? '快' : '慢'} ${span}`
}

/** 聊天气泡上方的微信式时间分组（5 分钟粒度） */
export function shouldShowTime(prevIso: string | undefined, curIso: string) {
  if (!prevIso) return true
  return new Date(curIso).getTime() - new Date(prevIso).getTime() > 5 * 60_000
}

/** 「刚刚 / 12 分钟前 / 3 小时前 / 2 天前 / 3月14日」——朋友圈、信箱列表用 */
export function fromNow(iso: string, now = new Date()) {
  const d = new Date(iso)
  const diff = now.getTime() - d.getTime()
  if (!Number.isFinite(diff)) return ''
  if (diff < 60_000) return '刚刚'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`
  if (diff < 7 * 86400_000) return `${Math.floor(diff / 86400_000)} 天前`
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const isYear = d.getFullYear() !== now.getFullYear()
  return `${isYear ? `${d.getFullYear()}年` : ''}${d.getMonth() + 1}月${d.getDate()}日 ${hm}`
}

export function formatBubbleTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = startOfDay(d).getTime() === startOfDay(now).getTime()
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (sameDay) return hm
  const isYear = d.getFullYear() !== now.getFullYear()
  return `${isYear ? `${d.getFullYear()}年` : ''}${d.getMonth() + 1}月${d.getDate()}日 ${hm}`
}
