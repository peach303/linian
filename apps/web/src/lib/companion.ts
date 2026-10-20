/**
 * 陪伴（睡觉 / 学习 / 工作）的预设与格式化
 *
 * 这里只有「展示层」的东西：三种模式的文案 / 图标 / 渐变底色、时长的快捷项、时长与合计的格式化。
 * 他答不答应、说不说话、走不走这些**行为**在 `lib/engine/companion.ts`，概率在 `rules.companion`。
 *
 * ⚠️ 陪伴的时长是**真的在计时**（`startedAt` → `endedAt` 的真实秒数），
 *    不是按目标时长编出来的数字 —— 到点自动收尾的那种按目标时长封顶，不虚报超时的部分。
 */
import type { Companion, CompanionMode, CompanionSession } from '@/types'

export interface CompanionModeMeta {
  mode: CompanionMode
  label: string
  icon: string
  /** 一起做什么的说法（「陪他一起学习 45 分钟」） */
  verb: string
  /** 开始前的一句话说明 */
  hint: string
  /** 没上传背景图时用的渐变（Tailwind 类） */
  gradient: string
  /** 没换背景图时，陪伴页面的主色（文字 / 进度条） */
  tone: string
  /** 这个模式的默认目标时长（分钟） */
  defaultMin: number
}

export const COMPANION_MODES: CompanionModeMeta[] = [
  {
    mode: 'sleep',
    label: '睡觉',
    icon: '🌙',
    verb: '一起睡',
    hint: '说声晚安，两边就都安静下来 —— 他会陪你到早上',
    gradient: 'from-[#2b3f6b] to-[#5b7fb5]',
    tone: '#e8f0ff',
    defaultMin: 480,
  },
  {
    mode: 'study',
    label: '学习',
    icon: '📚',
    verb: '一起学',
    hint: '一起自习：他也在书桌前，中途会问你还有多久',
    gradient: 'from-[#5aa0e8] to-[#8fc4f8]',
    tone: '#ffffff',
    defaultMin: 45,
  },
  {
    mode: 'work',
    label: '工作',
    icon: '💻',
    verb: '一起工作',
    hint: '他也在忙自己的那份，只是没走开',
    gradient: 'from-[#3f7fc1] to-[#7fb3e8]',
    tone: '#ffffff',
    defaultMin: 60,
  },
]

export const modeMeta = (m: CompanionMode): CompanionModeMeta =>
  COMPANION_MODES.find((x) => x.mode === m) ?? COMPANION_MODES[1]

/** 目标时长的快捷项（分钟）；0 = 不定时 */
export const DURATION_CHIPS: number[] = [25, 45, 60, 90, 0]

/** 秒 → 「45 分钟」这种（陪伴记录里用） */
export function humanDur(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return m > 0 ? `${h} 小时 ${m} 分` : `${h} 小时`
  if (m > 0) return `${m} 分钟`
  return `${s} 秒`
}

/** 秒 → 「12:34」/「1:02:03」（计时器上跳动的那种） */
export function clockText(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const two = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${two(m)}:${two(ss)}` : `${two(m)}:${two(ss)}`
}

/** 本次陪伴已经过去多少秒（真的按时间算） */
export const elapsedSec = (startedAt: string, now = Date.now()): number =>
  Math.max(0, Math.floor((now - +new Date(startedAt)) / 1000))

/** 记录的合计（秒） */
export const totalSec = (c: Companion): number =>
  (c.sessions ?? []).reduce((sum, s) => sum + (s.durationSec || 0), 0)

/** 某一天的合计（秒）；默认今天（按本地时间算） */
export function daySec(c: Companion, day: Date = new Date()): number {
  const y = day.getFullYear()
  const m = day.getMonth()
  const d = day.getDate()
  return (c.sessions ?? [])
    .filter((s) => {
      const t = new Date(s.startedAt)
      return t.getFullYear() === y && t.getMonth() === m && t.getDate() === d
    })
    .reduce((sum, s) => sum + (s.durationSec || 0), 0)
}

/** 「最近一次陪伴」的那条记录（没有就 undefined） */
export const lastSession = (c: Companion): CompanionSession | undefined =>
  (c.sessions ?? []).at(-1)

/** 连续陪伴天数（从今天往前数，有天没陪就断） */
export function streakDays(c: Companion, now: Date = new Date()): number {
  const days = new Set(
    (c.sessions ?? []).map((s) => {
      const t = new Date(s.startedAt)
      return `${t.getFullYear()}-${t.getMonth()}-${t.getDate()}`
    }),
  )
  let n = 0
  for (let i = 0; i < 400; i++) {
    const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    if (!days.has(`${t.getFullYear()}-${t.getMonth()}-${t.getDate()}`)) break
    n++
  }
  return n
}
