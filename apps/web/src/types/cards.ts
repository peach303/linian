/**
 * 字卡库类型（对应 packages/db/schema.prisma 的 Card / CardDeck / EmotionTag）
 * 说明：这里只保留卡片本身；牌组（CardDeck）在单人使用场景下等价于「一个 couples 的字卡库」。
 */
import type { CardType } from '@/types'

/** 卡片来源：系统预设 / 自定义 / 拾取（从我的聊天里抓的话） */
export type CardSource = 'SYSTEM' | 'CUSTOM' | 'PICKED'

/**
 * 卡自带的语音（在「功能 → 收藏 ⭐」里把一段他的语音绑到这张卡上）
 *
 * 语义：**这张卡的内容本来就是一条语音**。抽到它时直接发这段音频 ——
 * 不再调 MiniMax、不再掷「发语音」的概率，也就是不再花钱。
 * `text` 必须和卡的文字一致（引擎会比对），否则音频和文字对不上，就照常当文字卡用。
 */
export interface CardVoice {
  /** 音频（dataURL，跟着字卡一起同步） */
  url: string
  durationMs: number
  /** 这段语音说的原话 */
  text: string
  voiceId?: string
  model?: string
}

/** 字卡库 UI 里可管理的类型（PAT/VOICE/SENTENCE 是引擎行为，不是可编辑的字卡） */
export const CARD_LIB_TYPES = ['TEXT', 'KAOMOJI', 'EMOJI', 'STICKER', 'IMAGE'] as const
export type CardLibType = (typeof CARD_LIB_TYPES)[number]

export interface Card {
  id: string
  type: CardType
  source: CardSource
  /** 文字卡 / 颜文字 / emoji / 表情包名 */
  text?: string
  /** 图片卡（本地 dataURL 或远端 URL） */
  mediaUrl?: string
  /** 分类：日常 / 关心 / 晚间 / 撒娇 …（用于筛选和组句提示） */
  category?: string
  /** 类型内相对权重（不要求和为 100%，引擎归一化） */
  weight: number
  enabled: boolean
  /** 系统预设卡：禁止参与「梦角自由造句」（README §3 设计点 4） */
  noFreeSentence?: boolean
  tags: string[]
  useCount: number
  lastUsedAt?: string
  createdAt: string
  /** 内容指纹：查重用（文字卡 = 归一化文本，图片卡 = 媒体地址） */
  hash: string
  /** 卡自带的语音（配过之后抽到这张卡直接发这段音频，不再合成/花钱） */
  voice?: CardVoice
}

/** 导入预览的一行 */
export interface ImportRow {
  raw: string
  text: string
  type: CardLibType
  /** 完全重复（指纹相同） */
  exact?: Card
  /** 疑似重复（相似度 ≥ 阈值）：label 可能是已有卡，也可能是本批里前面某一行 */
  near?: { label: string; score: number; fromBatch?: boolean }
  /** 是否勾选导入 */
  checked: boolean
}
