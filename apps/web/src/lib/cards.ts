/**
 * 字卡库：类型元数据 / 预设卡 / 查重算法 / 命中率换算
 *
 * 三层概率（README §3 设计点 4）：
 *   ① 类型占比  ← 概率引擎 chat.weights（文字/颜文字/表情包/图片）
 *   ② 卡内权重  ← 每张卡的 weight，同类型内归一化
 *   ③ 命中率 = ①×②
 */
import type { Card, CardLibType, CardSource } from '@/types/cards'
import type { RuleConfig } from '@/types/rules'

/* ───────────────────────── 类型元数据 ───────────────────────── */

export interface TypeMeta {
  key: CardLibType
  label: string
  icon: string
  color: string
  /** 对应概率引擎里的字卡占比字段 */
  weightKey: keyof RuleConfig['chat']['weights']
  hint: string
}

export const TYPE_META: TypeMeta[] = [
  { key: 'TEXT', label: '文字', icon: '🅰️', color: '#5B9BE8', weightKey: 'text', hint: '主字卡，一句一行' },
  { key: 'KAOMOJI', label: '颜文字', icon: '◕‿◕', color: '#8FC2F5', weightKey: 'kaomoji', hint: '(๑•̀ㅂ•́)و✧' },
  { key: 'EMOJI', label: 'Emoji', icon: '🌙', color: '#9B8FE8', weightKey: 'text', hint: '单个或多个 emoji' },
  { key: 'STICKER', label: '表情包', icon: '🧸', color: '#68C8BE', weightKey: 'sticker', hint: '可上传 GIF / 动图，也可以只写名字' },
  { key: 'IMAGE', label: '图片', icon: '🖼️', color: '#F498B4', weightKey: 'image', hint: '上传的图片卡' },
]

export const typeMeta = (t: string): TypeMeta => TYPE_META.find((x) => x.key === t) ?? TYPE_META[0]

export const SOURCE_LABEL: Record<CardSource, string> = {
  SYSTEM: '系统预设',
  CUSTOM: '自定义',
  PICKED: '拾取',
}

/* ───────────────────────── 查重 ───────────────────────── */

/** 归一化：全角转半角 + 去空白 + 去标点尾巴（用于判重，不影响显示） */
export function normText(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\u3000]+/g, '')
    .replace(/[。，！？、~〜….!?,;:；：'"'"「」『』()（）\[\]【】]+$/g, '')
}

/**
 * 更狠的归一化：把标点全去掉（「晚安，做个好梦」==「晚安做个好梦」）。
 * 引擎发卡时可能按设置去掉标点，所以比对「卡上配的语音说的那句话」时必须忽略标点。
 */
export const bareSentence = (s: string): string =>
  s
    .normalize('NFKC')
    .replace(/[\s\u3000]+/g, '')
    .replace(/[，。！？、…~～,.!?;:；：'"“”‘’「」『』()（）[\]【】·—\-]+/g, '')

/** 媒体卡指纹：dataURL 很长，但前几十个字符是相同的头部，不能只截前缀 */
function mediaHash(mediaUrl: string): string {
  let h = 2166136261
  for (let i = 0; i < mediaUrl.length; i++) {
    h ^= mediaUrl.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

export const cardHash = (c: Pick<Card, 'text' | 'mediaUrl'>): string =>
  c.mediaUrl ? `md:${mediaHash(c.mediaUrl)}` : `tx:${normText(c.text ?? '')}`

/** Dice 系数（字符二元组），0~1；用于「疑似重复」提示 */
export function similarity(a: string, b: string): number {
  const x = normText(a)
  const y = normText(b)
  if (!x || !y) return 0
  if (x === y) return 1
  if (x.length < 2 || y.length < 2) return x === y ? 1 : 0

  const grams = (s: string) => {
    const m = new Map<string, number>()
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2)
      m.set(g, (m.get(g) ?? 0) + 1)
    }
    return m
  }
  const ga = grams(x)
  const gb = grams(y)
  let inter = 0
  let total = 0
  for (const [g, na] of ga) {
    total += na
    const nb = gb.get(g)
    if (nb) inter += Math.min(na, nb)
  }
  for (const nb of gb.values()) total += nb
  return total === 0 ? 0 : (2 * inter) / total
}

/** 相似度达到多少算「疑似重复」（可调） */
export const DUPE_THRESHOLD = 0.85

/* ───────────────────────── 命中率换算 ───────────────────────── */

/** 类型 → 概率引擎里的「占比池」：emoji 与文字共用同一池 */
export const POOL_OF: Record<CardLibType, keyof RuleConfig['chat']['weights']> = {
  TEXT: 'text',
  EMOJI: 'text',
  KAOMOJI: 'kaomoji',
  STICKER: 'sticker',
  IMAGE: 'image',
}

/** 各池占比（来自概率引擎，归一化后和为 1） */
export function poolRatios(weights: RuleConfig['chat']['weights']): Record<string, number> {
  const keys: (keyof RuleConfig['chat']['weights'])[] = ['text', 'kaomoji', 'sticker', 'image']
  const total = keys.reduce((s, k) => s + Math.max(0, weights[k] ?? 0), 0)
  const out: Record<string, number> = {}
  for (const k of keys) out[k] = total > 0 ? Math.max(0, weights[k] ?? 0) / total : k === 'text' ? 1 : 0
  return out
}

/** 单卡命中率 = 池占比 × 池内权重占比 */
export function cardRates(cards: Card[], weights: RuleConfig['chat']['weights']) {
  const ratios = poolRatios(weights)
  const poolSum = new Map<string, number>()
  const typeCount = new Map<string, { total: number; enabled: number }>()

  for (const c of cards) {
    const pool = POOL_OF[c.type as CardLibType]
    if (!pool) continue
    const stat = typeCount.get(c.type) ?? { total: 0, enabled: 0 }
    stat.total++
    if (c.enabled) {
      stat.enabled++
      poolSum.set(pool, (poolSum.get(pool) ?? 0) + Math.max(0, c.weight))
    }
    typeCount.set(c.type, stat)
  }

  const rate = (c: Card) => {
    const pool = POOL_OF[c.type as CardLibType]
    const sum = poolSum.get(pool) ?? 0
    const poolRatio = ratios[pool] ?? 0
    const within = sum > 0 ? Math.max(0, c.weight) / sum : 0
    return { pool, poolRatio, within, hit: c.enabled ? poolRatio * within : 0 }
  }

  return { ratios, poolSum, typeCount, rate, poolOf: (t: CardLibType) => POOL_OF[t] }
}

export const pct = (v: number) => (v > 0 && v < 0.001 ? '<0.1%' : `${(v * 100).toFixed(v >= 0.1 ? 0 : 1)}%`)

/* ───────────────────────── 造卡 ───────────────────────── */

let seq = 0
export function makeCard(p: Partial<Card> & Pick<Card, 'type' | 'source'>): Card {
  const text = p.text?.trim() || undefined
  const base: Card = {
    id: p.id ?? `card_${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    type: p.type,
    source: p.source,
    text,
    mediaUrl: p.mediaUrl,
    category: p.category,
    weight: p.weight ?? 1,
    enabled: p.enabled ?? true,
    noFreeSentence: p.noFreeSentence,
    tags: p.tags ?? [],
    useCount: p.useCount ?? 0,
    lastUsedAt: p.lastUsedAt,
    createdAt: p.createdAt ?? new Date().toISOString(),
    voice: p.voice,
    hash: '',
  }
  base.hash = cardHash(base)
  return base
}

/* ───────────────────────── 预设字卡 ───────────────────────── */

type Seed = [text: string, category: string, weight?: number]

const SYSTEM_TEXT: Seed[] = [
  ['早呀，醒了吗', '问候'],
  ['晚安，做个好梦', '晚间'],
  ['吃饭了吗', '关心'],
  ['在忙吗？', '问候'],
  ['今天过得怎么样', '关心'],
  ['我到家了', '日常', 0.8],
  ['你在干嘛呢', '问候'],
  ['想你了', '撒娇', 1.2],
  ['抱一下', '撒娇', 1.2],
  ['摸摸头', '撒娇'],
  ['不可以不理我', '撒娇', 0.6],
  ['陪你一会儿', '陪伴'],
  ['记得喝水', '关心'],
  ['有没有好好吃饭', '关心'],
  ['别熬夜啦', '关心'],
  ['今天降温，多穿点', '关心'],
  ['累了就早点休息', '关心'],
  ['外面下雨了，带伞了吗', '关心', 0.7],
  ['今晚的月亮很好看', '晚间'],
  ['刚看到一只小猫，想起你', '日常', 0.7],
  ['我有点心情不好，陪我一会儿', '心情', 0.5],
  ['明天见', '日常', 0.8],
  ['路上小心', '关心', 0.8],
  ['收到啦', '日常', 0.6],
]

const SYSTEM_KAOMOJI: Seed[] = [
  ['(๑•̀ㅂ•́)و✧', '开心'],
  ['(˶‾᷄ ⁻̫ ‾᷅˵)', '害羞'],
  ['(｡•́︿•̀｡)', '低落'],
  ['(*/ω＼*)', '害羞'],
  ['(๑>؂<๑)', '开心'],
  ['( ˘ω˘ )ｽﾔｧ', '晚间'],
  ['٩(ˊᗜˋ*)و', '开心'],
  ['(｡･ω･｡)', '温柔'],
  ['(´･_･`)', '低落', 0.6],
  ['(￣▽￣)~*', '俏皮'],
]

const SYSTEM_EMOJI: Seed[] = [
  ['🌙', '晚间'],
  ['☁️', '日常'],
  ['💙', '心意', 1.2],
  ['🫧', '日常'],
  ['🌠', '晚间'],
  ['🥤', '日常', 0.8],
  ['🍰', '日常', 0.8],
  ['🫂', '撒娇', 1.1],
]

const SYSTEM_STICKER: Seed[] = [
  ['揉眼睛的小猫', '表情包'],
  ['张开手要抱抱', '表情包', 1.2],
  ['递伞', '表情包'],
  ['点头', '表情包', 0.8],
  ['歪头疑惑', '表情包', 0.8],
  ['举起小猫', '表情包'],
  ['缩进被子里', '表情包', 0.7],
]

const PICKED_TEXT: Seed[] = [
  ['你今天有没有想我', '拾取·撒娇'],
  ['记得吃药', '拾取·关心'],
  ['那我等你', '拾取·陪伴'],
]

export function defaultCards(): Card[] {
  const mk = (seeds: Seed[], type: Card['type'], source: CardSource): Card[] =>
    seeds.map(([text, category, weight]) =>
      makeCard({ type, source, text, category, weight: weight ?? 1, tags: [category], noFreeSentence: source === 'SYSTEM' }),
    )

  return [
    ...mk(SYSTEM_TEXT, 'TEXT', 'SYSTEM'),
    ...mk(SYSTEM_KAOMOJI, 'KAOMOJI', 'SYSTEM'),
    ...mk(SYSTEM_EMOJI, 'EMOJI', 'SYSTEM'),
    ...mk(SYSTEM_STICKER, 'STICKER', 'SYSTEM'),
    ...mk(PICKED_TEXT, 'TEXT', 'PICKED'),
  ]
}

/* ───────────────────────── 导入解析 ───────────────────────── */

/** 一行一张卡：去掉序号/项目符号、引号包裹；空行忽略；`#` 开头视为注释 */
export function parseCardLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) =>
      l
        .replace(/^\s*(?:\d+[.、)]|[-*·•])\s*/, '')
        .replace(/^["'「『]|["'」』]$/g, '')
        .trim(),
    )
    .filter(Boolean)
}

/** 默认导入分类推断（文字卡按关键词猜一个分类，纯锦上添花） */
export function guessCategory(text: string): string {
  const t = text
  if (/(晚安|月亮|星|梦|睡)/.test(t)) return '晚间'
  if (/(早|醒|起床)/.test(t)) return '问候'
  if (/(吃|喝|累|休息|药|穿|伞|熬夜)/.test(t)) return '关心'
  if (/(想你|抱|摸|亲|撒娇|不理)/.test(t)) return '撒娇'
  if (/(陪|等|一起)/.test(t)) return '陪伴'
  return '自定义'
}
