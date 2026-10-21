/**
 * 拍一拍库
 *
 * 现在默认是「动作」而不是「身体部位」：
 *   - 我拍他  → 我亲了亲{他} / 我抱了抱{他}……
 *   - 他拍我  → {他}亲了亲{我} / {他}抱了抱{我}……
 *
 * 模板里的 `{him}` `{me}` 在真正发出去时才替换成双方昵称，
 * 所以之后改昵称，历史默认动作和下一次拍一拍都会跟着变。
 * 旧版本留下的「小脑袋」这类纯后缀仍然兼容。
 */
import type { PatEntry, PatSide } from '@/types'

/** 系统自带的拍一拍动作（带占位符） */
const BUILTIN: Record<PatSide, string[]> = {
  mine: [
    '亲了亲{him}',
    '抱了抱{him}',
    '摸了摸{him}的头',
    '捏了捏{him}的脸',
    '把下巴搁在{him}肩上',
    '戳了戳{him}',
    '牵住了{him}的手',
    '揉了揉{him}的头发',
  ],
  his: [
    '亲了亲{me}',
    '抱了抱{me}',
    '揉了揉{me}的头发',
    '牵住了{me}的手',
    '把{me}圈进怀里',
    '用额头碰了碰{me}的额头',
    '捏了捏{me}的脸',
    '把外套披在{me}身上',
  ],
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

/** 旧版本的「小脑袋」后缀迁到新的动作模板；自定义条目保留 */
export function migratePats(old?: { mine: PatEntry[]; his: PatEntry[] } | null) {
  const fresh = defaultPats()
  if (!old?.mine || !old?.his) return fresh
  const hasTemplate = [...old.mine, ...old.his].some((p) => p.builtin && p.text.includes('{'))
  if (hasTemplate) return old
  return {
    mine: [...fresh.mine, ...old.mine.filter((p) => !p.builtin)],
    his: [...fresh.his, ...old.his.filter((p) => !p.builtin)],
  }
}

/** 把模板里的名字换掉；纯后缀（旧数据）原样返回 */
function fill(text: string, side: PatSide, peerName: string, myName: string): string {
  const him = peerName.trim() || '他'
  const me = myName.trim() || (side === 'mine' ? '我' : '我')
  return text
    .replace(/\{him\}/g, him)
    .replace(/\{me\}/g, me)
    .replace(/\{name\}/g, side === 'mine' ? him : me)
}

/** 组装微信风格的整句（pat = 被拍的人） */
export const patLine = (patter: string, pattedPossessive: string, suffix: string) =>
  `${patter}拍了拍${pattedPossessive}的${suffix}`

/** 他拍我：优先按动作模板渲染，旧后缀仍走「拍了拍我的×××」 */
export const hisPatLine = (peerName: string, suffix: string, myName = '我') => {
  const t = suffix.trim()
  if (t.includes('{')) return `${peerName}${fill(t, 'his', peerName, myName)}`
  return `「${peerName}」拍了拍我的${t}`
}

/** 我拍他：优先按动作模板渲染，旧后缀仍走「拍了拍他的×××」 */
export const myPatLine = (peerName: string, suffix: string, myName = '我') => {
  const t = suffix.trim()
  if (t.includes('{')) return `我${fill(t, 'mine', peerName, myName)}`
  return `「你」拍了拍「${peerName}」的${t}`
}
