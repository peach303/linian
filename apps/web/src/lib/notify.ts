/**
 * 消息提醒
 *
 * 这里只做网页能做到的事：
 *   · 页面在后台（标签页还活着）时，收到他的新消息 → 系统通知；
 *   · 页面在前台、但不在聊天屏 → 应用内小弹窗；
 *   · 页面被系统冻结 / 杀掉后 → 不会再产生消息，也就没有通知。
 *
 * 通知权限必须由用户点一下才能申请；Service Worker 只负责把通知显示出来和点击后回到 App，
 * 不连接任何推送服务器，所以不需要额外的推送 Key。
 */
import type { Message } from '@/types'
import { useUIStore } from '@/store/useUIStore'

const SW_URL = `${import.meta.env.BASE_URL}sw.js`
const ICON_URL = `${import.meta.env.BASE_URL}icons/icon-192.png`

export type NotifyPermission = 'unsupported' | 'default' | 'granted' | 'denied'

let swPromise: Promise<ServiceWorkerRegistration | null> | null = null

export function notificationPermission(): NotifyPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}

/** 注册 Service Worker（只注册一次；不支持就返回 null） */
export function initNotifications(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return Promise.resolve(null)
  if (!swPromise) {
    swPromise = navigator.serviceWorker
      .register(SW_URL, { scope: import.meta.env.BASE_URL })
      .catch(() => null)
  }
  return swPromise
}

/** 必须由点击 / 触摸触发；返回最终权限 */
export async function requestNotificationPermission(): Promise<NotifyPermission> {
  if (notificationPermission() === 'unsupported') return 'unsupported'
  if (Notification.permission === 'granted') {
    await initNotifications()
    return 'granted'
  }
  try {
    const p = await Notification.requestPermission()
    if (p === 'granted') await initNotifications()
    return p
  } catch {
    return Notification.permission
  }
}

function messageBody(m: Message): string {
  switch (m.kind) {
    case 'VOICE':
      return '给你发了一条语音'
    case 'IMAGE':
      return '给你发了一张图片'
    case 'SEARCH_PUSH':
      return '给你推了一条网页'
    case 'CARD':
      return m.payload?.cardType === 'STICKER' ? '给你发了一个表情包' : '给你发了一张字卡'
    case 'CHOICE':
      return '给你出了一道选择'
    case 'QUESTION':
      return '给你发了一份问卷'
    case 'RED_PACKET':
      return '给你发了一个红包'
    case 'GIFT':
      return '给你送了一个礼物'
    case 'MUSIC_INVITE':
      return '想和你一起听首歌'
    case 'DOODLE':
      return '给你画了一张涂鸦'
    case 'PAT':
      return '拍了拍你'
    default:
      return '给你发了一条消息'
  }
}

async function showSystemNotification(title: string, body: string) {
  if (notificationPermission() !== 'granted') return
  const options: NotificationOptions = {
    body,
    icon: ICON_URL,
    badge: ICON_URL,
    tag: 'linian-message',
    data: { url: import.meta.env.BASE_URL },
  }
  try {
    const reg = await initNotifications()
    if (reg) {
      await reg.showNotification(title, options)
      return
    }
    new Notification(title, options)
  } catch {
    try {
      new Notification(title, options)
    } catch {
      /* 浏览器不允许就安静地放弃 */
    }
  }
}

/**
 * 收到他的一条新消息时调用。
 *
 * `screen` 是当前屏；在聊天屏里不弹应用内提示，但页面在后台时仍然发系统通知。
 */
export async function notifyPeerMessage(
  m: Message,
  opts: { nickname: string; screen: string; force?: boolean },
): Promise<void> {
  if (!useUIStore.getState().messageNotify) return
  const name = opts.nickname.trim() || '他'
  const body = messageBody(m)
  const visible = typeof document !== 'undefined' && document.visibilityState === 'visible'

  if (visible && opts.screen !== 'chat') {
    window.dispatchEvent(
      new CustomEvent('linian:peer-message', {
        detail: { title: name, body, messageId: m.id },
      }),
    )
    return
  }

  if (!visible || opts.force) {
    await showSystemNotification(`${name} 给你发了一条消息`, body)
  }
}

/** 设置页的「发一条测试通知」 */
export async function testNotification(nickname: string): Promise<boolean> {
  if (notificationPermission() !== 'granted') return false
  await showSystemNotification(`${nickname || '他'} · 通知测试`, '如果你看到这条，说明消息提醒已经开了。')
  return true
}
