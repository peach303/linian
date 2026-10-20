/**
 * 拍一拍库
 *
 * 微信里「拍一拍」的后缀是**被拍的人**设置的：
 *   - 我拍他  → 显示「你」拍了拍「梦角」的{他的后缀}   ← 用 `his`
 *   - 他拍我  → 显示「梦角」拍了拍我的{我的后缀}        ← 用 `mine`
 *
 * `his` 会被拟真引擎抽签使用（`chat.pat` 命中时随机取一条），
 * `mine` 是我手点的（聊天「+」→ 拍一拍 / 点头像），点哪条发哪条。
 */
import type { PatEntry, PatSide } from '@/types'

/** 系统自带的拍一拍后缀 */
const BUILTIN: Record<PatSide, string[]> = {
  mine: ['小脑袋', '脸颊', '肩膀', '发梢', '玻璃心', '待机中的小手机'],
  his: ['小脑袋 🐾', '后脑勺', '肩膀', '手背', '头顶呆毛', '屏幕（他还笑了）'],
}

let seq = 0
const mk = (side: PatSide, text: string, enabled = true): PatEntry => ({
  id: `pat_${side}_${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 4)}`,
  text,
  enabled,
  builtin: true,
})

export function defaultPats(): { mine: PatEntry[]; his: PatEntry[] } {
  return {
    mine: BUILTIN.mine.map((t) => mk('mine', t)),
    his: BUILTIN.his.map((t) => mk('his', t)),
  }
}

/** 新建一条自定义拍一拍（builtin=false，可删除） */
export const makePat = (side: PatSide, text: string, enabled = true): PatEntry => ({
  ...mk(side, text.trim(), enabled),
  builtin: false,
})

/** 从「他的拍一拍」池里抽一条（都没开就返回 null，由引擎回落默认文案） */
export function pickHisPat(his: PatEntry[]): string | null {
  const pool = his.filter((p) => p.enabled && p.text.trim())
  if (!pool.length) return null
  return pool[Math.floor(Math.random() * pool.length)].text.trim()
}

/** 组装微信风格的整句（pat = 被拍的人） */
export const patLine = (patter: string, pattedPossessive: string, suffix: string) =>
  `${patter}拍了拍${pattedPossessive}的${suffix}`

/** 他拍我：显示「梦角」拍了拍我的××× */
export const hisPatLine = (peerName: string, suffix: string) => `「${peerName}」拍了拍我的${suffix}`

/** 我拍他：显示「你」拍了拍「梦角」的××× */
export const myPatLine = (peerName: string, suffix: string) => `「你」拍了拍「${peerName}」的${suffix}`
