import type { Message, QuoteRef } from '@/types'

/**
 * 引用快照
 *
 * 旧记录只存了 `{ id, text, senderId }`；这里把图片 / 表情包 / 歌卡封面也收进来，
 * 引用条就能显示一张小图，而不是一串 dataURL / 文件名。
 * 快照只存显示需要的东西，后续原消息撤回 / 删除也不影响引用。
 */
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

function coverOf(payload: Record<string, unknown> | undefined): string {
  const cover = payload?.cover
  if (typeof cover === 'string') return cover
  if (cover && typeof cover === 'object') {
    const c = cover as { proxy?: unknown; src?: unknown }
    return str(c.proxy) || str(c.src)
  }
  return ''
}

export function quoteRefOf(m: Message): QuoteRef {
  const p = m.payload ?? {}
  const cardType = str(p.cardType).toUpperCase()
  let thumb = ''
  let label = m.text?.trim() ?? ''

  if (m.kind === 'CARD' && (cardType === 'IMAGE' || cardType === 'STICKER')) {
    thumb = str(p.url)
    /** 图片 / 表情包引用只显示缩略图 + 类型，绝不回显文件名、URL 或乱码 */
    label = cardType === 'STICKER' ? '表情包' : '图片'
  } else if (m.kind === 'MUSIC_INVITE') {
    thumb = coverOf(p)
    if (!label) label = '一起听'
  } else if (m.kind === 'SEARCH_PUSH') {
    thumb = coverOf(p)
    /** 搜索卡正文可能是一整篇摘要；引用条只留标题（或他配的那句），不要整段搬过来 */
    label = str(p.caption) || str(p.title) || (thumb ? '图片' : '网页')
  } else if (m.kind === 'VOICE') {
    label = label || '语音'
  } else if (m.kind === 'DOODLE') {
    label = label || '涂鸦'
  }

  return {
    id: m.id,
    senderId: m.senderId,
    text: m.text ?? '',
    kind: m.kind,
    thumb: thumb || undefined,
    label: label || undefined,
  }
}

/** 引用条上显示的那一行字；图片类优先显示说明，不显示 dataURL */
export function quoteCaption(q: QuoteRef): string {
  if (q.thumb) return q.label || (q.kind === 'CARD' ? '图片' : '引用')
  const text = (q.label || q.text || '').trim()
  /** 旧引用快照没有 thumb 时，text 里可能留着 dataURL / 图片地址 / 文件名：
      不要把它整串显示出来，统一退回「图片 / 引用」。 */
  if (
    /^(data:|blob:|https?:\/\/)/i.test(text) ||
    /\.(png|jpe?g|gif|webp|avif|bmp)(\?|#|$)/i.test(text) ||
    text.length > 80
  ) {
    return q.kind === 'CARD' ? '图片' : '引用'
  }
  return text || '引用'
}
