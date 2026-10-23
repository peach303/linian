import { dayKeyOf } from '@/lib/diary'
import { seededPick } from './seed'

/**
 * 他此刻的心情
 *
 * 以前「情绪标签」只读我上一句话（`inferEmotion(myText)`），看起来像他没有自己的情绪。
 * 这里给他一条**独立于我的心情**：按「日期 + 情绪持续时段」抽签，换一段时间就换一种；
 * 同时把「读到你的情绪」作为另一条标签并排显示。
 *
 * 不写进聊天记录 / 后端：刷新不会变，过了 `emotion.decayHours` 才会换。
 * 这样不用加数据库字段，也不会因为同步把「他今天心情」改来改去。
 */
export interface HisMood {
  key: string
  label: string
  emoji: string
  /** 两个短标签：他此刻的情绪 + 他今天想做的事 */
  tags: string[]
  /** 写进抽签轨迹的解释 */
  note: string
}

const MORNING: HisMood[] = [
  { key: 'sunny', label: '轻快', emoji: '🌤️', tags: ['他此刻：轻快', '想和你说早安'], note: '刚醒，心情明亮' },
  { key: 'clingy', label: '黏人', emoji: '🥰', tags: ['他此刻：黏人', '想靠近你'], note: '一醒来就想找你' },
  { key: 'quiet', label: '安静', emoji: '🫧', tags: ['他此刻：安静', '想听你说话'], note: '话不多，但一直在' },
]

const DAY: HisMood[] = [
  { key: 'soft', label: '温柔', emoji: '💙', tags: ['他此刻：温柔', '想照顾你'], note: '心里很软，说话会放轻' },
  { key: 'playful', label: '想逗你', emoji: '😼', tags: ['他此刻：想逗你', '想看你笑'], note: '有点坏心眼，但不是恶意' },
  { key: 'focused', label: '认真', emoji: '📎', tags: ['他此刻：认真', '想把你的事记好'], note: '在忙，但看到你的消息会停下来' },
  { key: 'restless', label: '走神', emoji: '🍃', tags: ['他此刻：走神', '想和你随便聊聊'], note: '注意力飘着，回话会短一点' },
  { key: 'proud', label: '有点得意', emoji: '✨', tags: ['他此刻：有点得意', '想被你夸'], note: '心情很好，会主动讨一句夸' },
  { key: 'shy', label: '不好意思', emoji: '🫣', tags: ['他此刻：不好意思', '想装作没事'], note: '被说中了，嘴硬但没生气' },
  { key: 'tired', label: '有点累', emoji: '😪', tags: ['他此刻：有点累', '想靠着你待会儿'], note: '不是冷淡，只是没力气说长句' },
  { key: 'quiet', label: '安静', emoji: '🫧', tags: ['他此刻：安静', '想陪着你'], note: '更想听，不急着说' },
  { key: 'missing', label: '想你', emoji: '🌙', tags: ['他此刻：想你', '想被你想起'], note: '没来由地想你，会主动一点' },
]

const NIGHT: HisMood[] = [
  { key: 'sleepy', label: '犯困', emoji: '🌙', tags: ['他此刻：犯困', '想和你说晚安'], note: '困了，句子会变短' },
  { key: 'missing', label: '想你', emoji: '💫', tags: ['他此刻：想你', '想再多聊一会儿'], note: '夜里容易想你' },
  { key: 'soft', label: '温柔', emoji: '🫧', tags: ['他此刻：温柔', '想听你的声音'], note: '夜里说话会轻一点' },
  { key: 'quiet', label: '安静', emoji: '🌌', tags: ['他此刻：安静', '想陪你待着'], note: '不吵你，但没走' },
]

const poolFor = (now: Date) => {
  const h = now.getHours()
  if (h >= 23 || h < 6) return NIGHT
  if (h < 11) return MORNING
  return DAY
}

/** 他此刻的心情（同一时段 / 同一天稳定；`decayHours` 来自概率引擎） */
export function hisMoodAt(now = new Date(), decayHours = 4, offset = 0): HisMood {
  const hours = Math.max(0.5, Number(decayHours) || 4)
  const slot = Math.floor(now.getTime() / (hours * 3600_000))
  const pool = poolFor(now)
  return seededPick(pool, `his-mood:${dayKeyOf(now)}:${slot}:${offset}`) ?? DAY[0]
}

/** 把他的心情折成两个短标签（不覆盖「读到你」的那条） */
export function hisMoodTags(mood: HisMood): string[] {
  return [mood.label ? `他此刻：${mood.label}` : '', mood.tags[1] ?? ''].filter(Boolean)
}

export const HIS_MOOD_EMOJI = (mood: HisMood) => mood.emoji
