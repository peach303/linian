import type { FavoriteItem, Letter, Message, Moment } from '@/types'

/**
 * 收藏夹的小工具：把一条消息 / 一封信 / 一条动态压成快照。
 *
 * 收藏的是快照，不是引用 —— 原消息撤回、原信删掉之后，
 * 收藏里那句话还在；这也让「他收藏我的」可以独立于聊天记录存在。
 */

export const FAVORITE_KIND_LABEL: Record<FavoriteItem['kind'], string> = {
  MESSAGE: '聊天',
  VOICE: '语音',
  LETTER: '信件',
  MOMENT: '朋友圈',
}

/** 列表里的细分类：聊天 / 字卡 / 推送 / 语音 / 信件 / 朋友圈 */
export function favoriteCategory(f: FavoriteItem): string {
  if (f.kind === 'LETTER') return '信件'
  if (f.kind === 'MOMENT') return '朋友圈'
  if (f.kind === 'VOICE') return '语音'
  const mk = String(f.payload?.messageKind ?? '')
  if (mk === 'CARD') return '字卡'
  if (mk === 'SEARCH_PUSH') return '推送'
  return '聊天'
}

export const FAVORITE_CATEGORIES = ['全部', '聊天', '字卡', '推送', '语音', '信件', '朋友圈'] as const

/** 他收藏我的东西时，默认写下的原因（可在「收藏」页增删） */
export const DEFAULT_FAVORITE_REASONS = [
  '想留着你这句话',
  '看了好几遍',
  '今天最想记住的',
  '有点可爱，收起来',
  '以后翻到会笑',
  '这句话像你会说的',
]

function kindLabel(kind?: string): string {
  if (kind === 'VOICE') return '一条语音'
  if (kind === 'CARD') return '一张字卡'
  if (kind === 'SEARCH_PUSH') return '一条推送'
  if (kind === 'DOODLE') return '一张涂鸦'
  if (kind === 'IMAGE') return '一张图片'
  if (kind === 'QUESTION') return '一份问卷'
  if (kind === 'GIFT') return '一件礼物'
  if (kind === 'RED_PACKET') return '一个红包'
  if (kind === 'MUSIC_INVITE') return '一首歌'
  return '一句话'
}

function messageLabel(m: Message): string {
  return kindLabel(m.kind)
}

/** 列表标题：旧快照存过「我一句话」，这里统一按当前口径显示成「我的一句话」 */
export function favoriteDisplayTitle(f: FavoriteItem): string {
  if (f.kind !== 'MESSAGE' && f.kind !== 'VOICE') return f.title
  const who = f.author === 'me' ? '我的' : '他的'
  const kind = String(f.payload?.messageKind ?? (f.kind === 'VOICE' ? 'VOICE' : 'TEXT'))
  return `${who}${kindLabel(kind)}`
}

export function favoriteFromMessage(
  message: Message,
  owner: FavoriteItem['owner'],
): Omit<FavoriteItem, 'id' | 'createdAt'> {
  const author: FavoriteItem['author'] =
    owner === 'me' ? 'dream' : 'me'
  return {
    owner,
    author,
    kind: message.kind === 'VOICE' ? 'VOICE' : 'MESSAGE',
    refId: message.id,
    title: owner === 'me' ? `他的${messageLabel(message)}` : `我的${messageLabel(message)}`,
    text: message.text ?? '',
    payload: {
      messageKind: message.kind,
      url: String(message.payload?.url ?? message.audioUrl ?? ''),
      audioDurationMs: message.audioDurationMs ?? message.payload?.durationMs,
      cardType: message.payload?.cardType,
      senderId: message.senderId,
      createdAt: message.createdAt,
    },
  }
}

export function favoriteFromLetter(
  letter: Letter,
  owner: FavoriteItem['owner'],
): Omit<FavoriteItem, 'id' | 'createdAt'> {
  return {
    owner,
    author: owner === 'me' ? 'dream' : 'me',
    kind: 'LETTER',
    refId: letter.id,
    title: letter.title || '一封信',
    text: letter.body,
    payload: {
      title: letter.title,
      body: letter.body,
      fromId: letter.fromId,
      createdAt: letter.createdAt,
    },
  }
}

export function favoriteFromMoment(
  moment: Moment,
  owner: FavoriteItem['owner'],
): Omit<FavoriteItem, 'id' | 'createdAt'> {
  return {
    owner,
    author: owner === 'me' ? 'dream' : 'me',
    kind: 'MOMENT',
    refId: moment.id,
    title: '一条朋友圈',
    text: moment.text,
    payload: {
      text: moment.text,
      images: moment.images ?? [],
      createdAt: moment.createdAt,
    },
  }
}

/** 他收藏我的时，从默认原因里挑一条（调用方可以换成抽签 / 指定） */
export function pickFavoriteReason(reasons: string[]): string {
  if (!reasons.length) return '想留着'
  return reasons[Math.floor(Math.random() * reasons.length)]
}
