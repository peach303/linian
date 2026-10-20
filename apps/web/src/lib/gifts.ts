/**
 * 礼物柜（对应 DB 的 `gifts` / `gift_orders`）
 *
 * 预设几件常用的，剩下都能自己加：名字 / 定价 / emoji / 图片 / 卡片文案。
 * 送出记录不另存表 —— 它就在聊天里的 GIFT 消息（`gift_orders` 的产物），
 * 所以「礼物柜」和「聊天」永远是一致的，不会两边对不上。
 */
import type { GiftItem } from '@/types'

export const DEFAULT_GIFTS: GiftItem[] = [
  { id: 'g_rose', name: '玫瑰', price: 20, icon: '🌹', note: '路过花店，想起你。', builtin: true },
  { id: 'g_plush', name: '玩偶', price: 66, icon: '🧸', note: '让它替我抱你一下。', builtin: true },
  { id: 'g_cake', name: '蛋糕', price: 88, icon: '🎂', note: '今天也值得被庆祝。', builtin: true },
  { id: 'g_poem', name: '诗集', price: 45, icon: '📖', note: '第 27 页折了个角。', builtin: true },
  { id: 'g_cup', name: '杯子', price: 39, icon: '☕', note: '天冷了，多喝热水。', builtin: true },
  { id: 'g_lamp', name: '小夜灯', price: 128, icon: '🏮', note: '夜里醒了就看它一眼。', builtin: true },
]

export const giftIcon = (g: { icon: string; imageUrl?: string }) => g.icon || '🎁'
