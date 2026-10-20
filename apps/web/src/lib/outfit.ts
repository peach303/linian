import type { UserProfile } from '@/types'

/**
 * 他今日的穿搭。
 *
 * 同一天进来看到的是同一套（种子 = 日期），不会刷新一次换一件；
 * 想多看几套可以点「再搭一套」，但默认还是以「今天」为准。
 * 先做文字 + emoji + 颜色，之后如果要换成用户导入的图片，只要把 piece 上再加 imageUrl 即可。
 */

export type OutfitSlot = 'outer' | 'top' | 'bottom' | 'shoes' | 'accessory'

export interface OutfitPiece {
  id: string
  slot: OutfitSlot
  label: string
  emoji: string
  /** 主色（用于色块和文字提示） */
  color: string
  /** 材质 / 版型的一句话 */
  detail: string
}

export interface DailyOutfit {
  dateKey: string
  pieces: Record<OutfitSlot, OutfitPiece>
  /** 整体风格 */
  style: string
  /** 他今天为什么这么穿 */
  note: string
}

const SLOT_ORDER: OutfitSlot[] = ['outer', 'top', 'bottom', 'shoes', 'accessory']

const OUTERS: OutfitPiece[] = [
  { id: 'outer_cardigan', slot: 'outer', label: '浅灰针织开衫', emoji: '🧥', color: '#9aa3ad', detail: '松松地敞着，袖口挽一点' },
  { id: 'outer_denim', slot: 'outer', label: '水洗牛仔外套', emoji: '🧥', color: '#6f8fae', detail: '旧旧的，肩线刚好' },
  { id: 'outer_blazer', slot: 'outer', label: '米白薄西装', emoji: '🥼', color: '#e5d8c3', detail: '不系扣，里面留一点空' },
  { id: 'outer_none', slot: 'outer', label: '今天不穿外套', emoji: '🌤️', color: '#dcecff', detail: '天气刚好，少一层更自在' },
  { id: 'outer_hoodie', slot: 'outer', label: '深蓝连帽卫衣', emoji: '🧥', color: '#334a68', detail: '帽子随手搭在背后' },
]

const TOPS: OutfitPiece[] = [
  { id: 'top_white_shirt', slot: 'top', label: '白衬衫', emoji: '👔', color: '#f3f5f7', detail: '最上面那颗扣子没系' },
  { id: 'top_blue_shirt', slot: 'top', label: '雾蓝衬衫', emoji: '👔', color: '#a9c4dc', detail: '袖口卷到小臂' },
  { id: 'top_black_tee', slot: 'top', label: '黑色短袖', emoji: '👕', color: '#2c3036', detail: '简单，领口有一点洗旧' },
  { id: 'top_cream_knit', slot: 'top', label: '奶油色针织衫', emoji: '🧶', color: '#efe3cf', detail: '软软的，看起来很好抱' },
  { id: 'top_stripe', slot: 'top', label: '细条纹长袖', emoji: '👕', color: '#c9d6e4', detail: '蓝白条纹，干净但不无聊' },
  { id: 'top_green_tee', slot: 'top', label: '灰绿色 T 恤', emoji: '👕', color: '#8fa89b', detail: '像刚下过雨的叶子' },
]

const BOTTOMS: OutfitPiece[] = [
  { id: 'bottom_denim', slot: 'bottom', label: '深蓝直筒牛仔裤', emoji: '👖', color: '#334b6b', detail: '裤脚刚好盖住鞋面' },
  { id: 'bottom_black', slot: 'bottom', label: '黑色休闲长裤', emoji: '👖', color: '#2c3036', detail: '垂感很好，走路带一点风' },
  { id: 'bottom_beige', slot: 'bottom', label: '卡其色工装裤', emoji: '👖', color: '#b9a17e', detail: '口袋很多，手可以插进去' },
  { id: 'bottom_grey', slot: 'bottom', label: '浅灰运动裤', emoji: '👖', color: '#aeb6bf', detail: '松紧腰，适合赖在家里' },
  { id: 'bottom_white', slot: 'bottom', label: '米白阔腿裤', emoji: '👖', color: '#e8e1d4', detail: '干净，坐下来会堆一点褶' },
]

const SHOES: OutfitPiece[] = [
  { id: 'shoes_white', slot: 'shoes', label: '白色帆布鞋', emoji: '👟', color: '#f3f5f7', detail: '鞋边刷得很干净' },
  { id: 'shoes_black', slot: 'shoes', label: '黑色板鞋', emoji: '👟', color: '#2c3036', detail: '百搭，去哪都不会错' },
  { id: 'shoes_brown', slot: 'shoes', label: '棕色乐福鞋', emoji: '🥿', color: '#8b6547', detail: '今天想稍微正式一点' },
  { id: 'shoes_grey', slot: 'shoes', label: '灰白运动鞋', emoji: '👟', color: '#c4c9cf', detail: '走很远也不会累' },
]

const ACCESSORIES: OutfitPiece[] = [
  { id: 'acc_watch', slot: 'accessory', label: '银色手表', emoji: '⌚', color: '#b8c2cc', detail: '表带有点凉' },
  { id: 'acc_ring', slot: 'accessory', label: '细银戒', emoji: '💍', color: '#c8d2dc', detail: '戴在食指上' },
  { id: 'acc_glasses', slot: 'accessory', label: '细框眼镜', emoji: '👓', color: '#8d7357', detail: '低头的时候会反一点光' },
  { id: 'acc_scarf', slot: 'accessory', label: '浅色围巾', emoji: '🧣', color: '#d8c7b8', detail: '松松绕一圈' },
  { id: 'acc_none', slot: 'accessory', label: '今天什么也没戴', emoji: '🤍', color: '#f1f3f5', detail: '空着手，反而轻松' },
]

const STYLES = ['干净松弛', '温柔日常', '安静的好看', '像刚出门散步', '有一点认真']
const NOTES = [
  '今天想穿得让你一眼就能认出来。',
  '没想太多，顺手拿了最舒服的那几件。',
  '出门前在镜子前站了一会儿，还是选了这套。',
  '今天有一点想被你夸。',
  '如果见你，就这样穿。',
  '颜色是照着今天的天气配的。',
]

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function pick<T>(list: T[], seed: string): T {
  return list[hash(seed) % list.length]
}

const dateKeyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** 生成某一天的穿搭；salt 只用于「再搭一套」预览，不改变日期 */
export function outfitOfDay(date = new Date(), salt = ''): DailyOutfit {
  const dateKey = dateKeyOf(date)
  const seed = `${dateKey}:${salt}`
  const pieces: Record<OutfitSlot, OutfitPiece> = {
    outer: pick(OUTERS, `${seed}:outer`),
    top: pick(TOPS, `${seed}:top`),
    bottom: pick(BOTTOMS, `${seed}:bottom`),
    shoes: pick(SHOES, `${seed}:shoes`),
    accessory: pick(ACCESSORIES, `${seed}:accessory`),
  }
  return {
    dateKey,
    pieces,
    style: pick(STYLES, `${seed}:style`),
    note: pick(NOTES, `${seed}:note`),
  }
}

export function outfitPieces(outfit: DailyOutfit): OutfitPiece[] {
  return SLOT_ORDER.map((slot) => outfit.pieces[slot]).filter(Boolean)
}

export const SLOT_LABEL: Record<OutfitSlot, string> = {
  outer: '外套',
  top: '上衣',
  bottom: '下装',
  shoes: '鞋',
  accessory: '配饰',
}

/** 给 UI 用的一句话总结 */
export function outfitSummary(outfit: DailyOutfit, dream: UserProfile): string {
  const { top, bottom, shoes } = outfit.pieces
  return `${dream.nickname}今天穿 ${top.label} + ${bottom.label}，脚上是${shoes.label}。`
}
