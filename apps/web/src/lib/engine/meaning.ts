import type { Card } from '@/types/cards'
import type { Message, MessageAbout, MessageMeaningSource } from '@/types'

/**
 * 「本意 / 在说谁」的小推理。
 *
 * 不是让模型瞎编：先看字卡来源（系统卡 / 他挑的 / 从你说过的话拾的），
 * 再看句子里有没有「你 / 我 / 我们」这些指向，最后才用稳定的种子兜底。
 * 同一个 id 问几次结果都一样，刷新也不会变。
 */

export const ABOUT_LABEL: Record<MessageAbout, string> = {
  me: '你',
  him: '他自己',
  us: '你们',
}

export const MEANING_SOURCE_LABEL: Record<MessageMeaningSource, string> = {
  card: '字卡自己跳的',
  custom: '他挑好想对你说的',
  picked: '从你说过的话里拾的',
  random: '系统随机抽到的',
  engine: '他自己想说的',
}

const MEANINGS: Record<MessageAbout, string[]> = {
  me: [
    '表面在说这件事，注意力其实落在你身上，想看看你会不会接。',
    '这句是冲着你来的，他在等你给一点反应。',
    '他把话递到你面前，其实是想让你多在意他一点。',
    '听起来像随口一说，真正想确认的是「你还在不在」。',
  ],
  him: [
    '这句更像在说他自己，只是没把心事直接摊开。',
    '他借着这句话讲自己的状态，想让你听见一点。',
    '他没有直接说「我不好」，但把情绪藏在了这句话里。',
    '这是在替自己找一个出口，不是在责怪你。',
  ],
  us: [
    '他把你们放在一起说，想要的是「我们」的感觉。',
    '这句是在确认你们之间的关系，想听你也站在同一边。',
    '他说的不是某一个人，而是你们两个人一起的样子。',
    '他把未来和现在都算进了「我们」里面。',
  ],
}

const TEXT_HINTS: [RegExp, MessageAbout][] = [
  [/我们|咱们|咱俩|两个人|一起|以后|将来/, 'us'],
  [/你们|你俩/, 'us'],
  [/你|您/, 'me'],
  [/我自己|我这边|我最近|我有点|我会|我想/, 'him'],
]

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** 这句话在说谁：先看指代词，没线索就按消息 id 稳定地挑一个 */
export function inferAbout(message: Message): MessageAbout {
  const text = `${message.text ?? ''} ${String(message.payload?.caption ?? '')}`.trim()
  for (const [re, about] of TEXT_HINTS) {
    if (re.test(text)) return about
  }
  const cardSource = String(message.payload?.cardSource ?? '')
  if (cardSource === 'PICKED') return 'me'
  if (message.proactive) return 'him'
  const seed = hash(`${message.id}:${message.createdAt}`)
  return (['me', 'him', 'us'] as const)[seed % 3]
}

function sourceOf(message: Message): MessageMeaningSource {
  const cardSource = String(message.payload?.cardSource ?? '')
  if (cardSource === 'SYSTEM') return 'card'
  if (cardSource === 'PICKED') return 'picked'
  if (cardSource === 'CUSTOM') return 'custom'
  if (message.kind === 'CARD' || message.plan?.cardIds?.length) return 'card'
  if (message.proactive || message.plan) return 'engine'
  return 'random'
}

/** 生成本意；同一个 id 多次问结果一致 */
export function deriveMeaning(
  message: Message,
  _cards?: Card[],
): { meaning: string; about: MessageAbout; source: MessageMeaningSource } {
  const about = inferAbout(message)
  const source = sourceOf(message)
  const seed = hash(`${message.id}:${about}:${source}`)
  const pool = MEANINGS[about]
  const meaning = pool[seed % pool.length]

  // 几个常见的短句，给一点更贴脸的解释（仍然不假装是模型读心）
  const text = (message.text ?? '').trim()
  if (/晚安|睡了|好梦/.test(text)) {
    return { meaning: '他用晚安收尾，其实还想多留你一会儿。', about, source }
  }
  if (/在吗|忙吗|干嘛|做什么/.test(text)) {
    return { meaning: '他先找个由头开口，真正想说的是「想跟你说话」。', about, source }
  }
  if (/想你|想我|见面|抱抱/.test(text)) {
    return { meaning: '他把想念说得很轻，怕你觉得太重。', about, source }
  }
  if (/对不起|抱歉|别生气/.test(text)) {
    return { meaning: '他在先低头，怕你真的不理他。', about, source }
  }
  return { meaning, about, source }
}

/** 引擎按概率给一条消息带上本意；不改原消息，返回新对象 */
export function maybeAttachMeaning(message: Message, probability: number): Message {
  if (probability <= 0) return message
  if (message.kind === 'SYSTEM' || message.kind === 'PAT' || message.kind === 'CALL_EVENT') return message
  if (message.meaning || Math.random() >= probability) return message
  const info = deriveMeaning(message)
  return {
    ...message,
    meaning: info.meaning,
    about: info.about,
    meaningSource: info.source,
    meaningAsked: false,
  }
}
