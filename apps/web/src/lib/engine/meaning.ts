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
  card: '他刚好抽到这张卡',
  custom: '他自己挑好想说的',
  picked: '从你说过的话里拾的',
  random: '这一句没有特别设定',
  engine: '他自己想说的',
}

const MEANINGS: Record<MessageAbout, string[]> = {
  me: [
    '表面在说这件事，注意力其实落在你身上，想看看你会不会接。',
    '这句是冲着你来的，他在等你给一点反应。',
    '他把话递到你面前，其实是想让你多在意他一点。',
    '听起来像随口一说，真正想确认的是「你还在不在」。',
    '他把语气放得很轻，是怕太用力会把你推远。',
    '这句留了半截没说，剩下那半截在等你问。',
    '他不是要一个答案，更像是想听你多和他说两句。',
    '话是朝着你说的，心思却有点绕，怕被你看穿。',
  ],
  him: [
    '这句更像在说他自己，只是没把心事直接摊开。',
    '他借着这句话讲自己的状态，想让你听见一点。',
    '他没有直接说「我不好」，但把情绪藏在了这句话里。',
    '这是在替自己找一个出口，不是在责怪你。',
    '他把自己的那点累说得很随便，其实还是希望你能接住。',
    '听着像抱怨，更多是想要一点被放在心上的感觉。',
    '他先把自己的心情摆出来，看你愿不愿意靠近。',
    '这句话里有一点示弱，只是他说得不太明显。',
  ],
  us: [
    '他把你们放在一起说，想要的是「我们」的感觉。',
    '这句是在确认你们之间的关系，想听你也站在同一边。',
    '他说的不是某一个人，而是你们两个人一起的样子。',
    '他把未来和现在都算进了「我们」里面。',
    '他在试探你们之间的距离，想知道能不能再近一点。',
    '这句话把两个人绑在了一起，也把一点期待放了进去。',
    '他其实在问：我们这样，是不是可以一直这样。',
    '他说得很平常，心里想的是你们共同的那部分。',
  ],
}

/** 按来源再多给几种解释，避免每次都是同一句「字卡自己跳的」 */
const SOURCE_MEANINGS: Record<MessageMeaningSource, string[]> = {
  card: [
    '这张卡被他抽出来的时候，正好对上了他此刻想说的那一点。',
    '不是卡在替他说，是他从一叠话里挑中了这一句。',
    '卡片只是载体，真正想让你看到的是这句话落在你身上的意思。',
    '他可能只是觉得这张卡很像现在的气氛，就顺手递给了你。',
    '这张卡的内容和他现在的心情有一小块重叠，所以显得刚好。',
  ],
  custom: [
    '这句话是他自己写下的，所以他发出来时其实比字面更认真。',
    '他把它留到这会儿才说，应该是觉得现在合适。',
    '这是他提前准备好的话，挑了一个不那么刻意的时机。',
    '他没有临时改词，说明这句本来就想让你看到。',
    '字是他自己选的，语气也像他，没什么拐弯。',
  ],
  picked: [
    '这是从你说过的话里拾来的，他大概一直记着。',
    '他把你以前的那句话又递了回来，像是想接上当时没说完的部分。',
    '这句原本是你的语气，他借来用了一下，其实是在靠近你。',
    '他记得你这么说过的感觉，所以现在换他说给你听。',
    '这不是新话，是他从你们之间翻出来的一点旧回声。',
  ],
  random: [
    '这句话没有特别的暗号，更多是当下的一点心情。',
    '不必每个字都找深意，他可能只是想和你说句话。',
    '它更像一句顺口的话，真正重要的是他还在这里。',
    '没有特别设计，读起来是什么就是什么。',
    '这一句只是刚好冒出来，不必把它当成一道题。',
  ],
  engine: [
    '这句是他自己起的头，没有借卡，也没有照搬模板。',
    '他顺着当前的气氛说下去，想看看你会怎么接。',
    '不是抽签抽出来的套话，更像是他此刻真的想说的。',
    '他把话说到一半，剩下的等你来补。',
    '这句没有隐藏任务，只是他在你面前的一点自然反应。',
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
  const aboutPool = MEANINGS[about]
  const sourcePool = SOURCE_MEANINGS[source]
  // 六成按「来源」解释，四成按「在说谁」解释，读起来不会总是同一个模板
  const meaning =
    seed % 10 < 6
      ? sourcePool[seed % sourcePool.length]
      : aboutPool[seed % aboutPool.length]

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
