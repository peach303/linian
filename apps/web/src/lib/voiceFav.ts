/**
 * 语音收藏（功能 Hub → 收藏 ⭐）
 *
 * 两层用途：
 *  1. **留下这段话** —— 收藏一段语音（音频是 dataURL，跟着 state 一起同步，换设备也听得到）。
 *  2. **变成语音字卡** —— 字卡库里多一张配了语音的文字卡（卡的文字 = 这段语音说的话）。
 *     以后引擎抽到那张卡，**直接发这段音频**：不调 MiniMax、不再花钱，
 *     而且文字和语音永远对得上（配的就是「这张卡的原话」）。
 *
 * 关键约定：卡上语音的 `text` 必须和卡的文字一致 —— `planner` 抽到卡时会比对
 *（`bareSentence` 忽略标点），对不上就照常当普通文字卡用，绝不张冠李戴。
 */
import { bareSentence, makeCard } from '@/lib/cards'
import { useAppStore } from '@/store/useAppStore'
import { useCardsStore } from '@/store/useCardsStore'
import type { Card, CardVoice } from '@/types/cards'
import type { Message, VoiceClip } from '@/types'

/** 从一条语音消息做一份收藏草稿（不是语音 / 没有音频 → null） */
export function clipFromMessage(message: Message, mine: boolean): Omit<VoiceClip, 'id' | 'createdAt'> | null {
  const url = String(message.payload?.url ?? message.audioUrl ?? '')
  if (message.kind !== 'VOICE' || !url) return null
  const raw = (message.text ?? '').trim()
  return {
    speaker: mine ? 'me' : 'peer',
    text: raw && raw !== '[语音]' ? raw : '',
    url,
    durationMs: message.audioDurationMs ?? (Number(message.payload?.durationMs ?? 0) || 0),
    voiceId: message.payload?.voiceId ? String(message.payload.voiceId) : undefined,
    model: message.payload?.model ? String(message.payload.model) : undefined,
    emotion: message.emotionTags?.[0],
    messageId: message.id,
  }
}

/** 这段收藏说的话（优先转写文本，其次自定义名字） */
export const clipSentence = (c: VoiceClip) => (c.text || c.label || '').trim()

/**
 * 把这段语音变成「语音字卡」：
 * - 字卡库里已经有同句的文字卡 → 直接给它配语音（顺手禁止它参与组句，保证发出来的是这句原话）
 * - 没有 → 新建一张文字卡（文字 = 这段语音说的话）再配语音
 * 返回 null 表示这段收藏没有文本，配不成（UI 会拦住）。
 */
export function attachVoiceAsCard(clip: VoiceClip): { card: Card; created: boolean } | null {
  const text = clipSentence(clip)
  if (!text) return null
  const voice: CardVoice = {
    url: clip.url,
    durationMs: clip.durationMs,
    text,
    voiceId: clip.voiceId,
    model: clip.model,
  }
  const store = useCardsStore.getState()
  const key = bareSentence(text)
  const exist = key ? store.cards.find((c) => c.type === 'TEXT' && bareSentence(c.text ?? '') === key) : undefined

  if (exist) {
    store.updateMany([exist.id], { voice, noFreeSentence: true })
    useAppStore.getState().patchVoice(clip.id, { cardId: exist.id })
    return { card: { ...exist, voice, noFreeSentence: true }, created: false }
  }

  const card = makeCard({
    type: 'TEXT',
    source: 'CUSTOM',
    text,
    category: '语音',
    tags: ['语音'],
    /** 禁止组句：这张卡本身就是一条语音，不能被造句改写 */
    noFreeSentence: true,
    voice,
  })
  store.upsert(card)
  useAppStore.getState().patchVoice(clip.id, { cardId: card.id })
  return { card, created: true }
}

/** 解绑（字卡留着，只是不再配语音；收藏本身也留着） */
export function detachVoice(clip: VoiceClip) {
  if (clip.cardId) useCardsStore.getState().updateMany([clip.cardId], { voice: undefined })
  useAppStore.getState().patchVoice(clip.id, { cardId: undefined })
}

/** 删掉一条收藏：它绑在字卡上的话，那张卡也一起解绑（不然字卡上会留一段你管不到的语音） */
export function removeClip(clip: VoiceClip) {
  if (clip.cardId) useCardsStore.getState().updateMany([clip.cardId], { voice: undefined })
  useAppStore.getState().removeVoice(clip.id)
}
