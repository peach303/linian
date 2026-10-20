/**
 * 「递给他的东西」：抉择 / 问卷 / 红包 / 礼物 / 音乐邀请 / 涂鸦。
 *
 * 它们不是普通聊天消息 —— 聊天回复引擎（`runtime.ts`）**不管**它们，
 * 由时间轴（`timeline.ts`）按自己的概率与延迟回应（答题 / 抢红包 / 收礼物 / 回笔…）。
 * 否则一张卡会同时触发「他随口回一句话」和「他认真答这张卡」两套互不相干的排程。
 *
 * 通话事件（CALL_EVENT）是**结果**而不是「我递过去的东西」，所以不在这里；
 * 但同样不能让回复引擎把它当成一句「我说的话」去回（`SILENT_KINDS`）。
 */
import type { Message } from '@/types'

export type CardKind = 'CHOICE' | 'QUESTION' | 'RED_PACKET' | 'GIFT' | 'MUSIC_INVITE' | 'DOODLE'

export const CARD_KINDS: CardKind[] = [
  'CHOICE',
  'QUESTION',
  'RED_PACKET',
  'GIFT',
  'MUSIC_INVITE',
  'DOODLE',
]

export const isCardKind = (k: Message['kind']): k is CardKind => (CARD_KINDS as string[]).includes(k)

/** 引擎产出的 / 系统性质的消息：不该触发「随口回一句」 */
const QUIET_KINDS: Message['kind'][] = ['CALL_EVENT', 'SYSTEM', 'SEARCH_PUSH']

export const isQuietKind = (k: Message['kind']) => QUIET_KINDS.includes(k)
