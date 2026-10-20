/**
 * Socket.IO 客户端骨架：/rt 命名空间。
 * 事件约定（与 apps/server/src/realtime 对应）：
 *   server → client: message:new | message:recall | peer:typing | call:event
 *                    companion:update | room:progress | proactive:tick
 *   client → server: room:join | typing | read
 */
import { io, type Socket } from 'socket.io-client'
import type { Message } from '@/types'

export interface ServerEvents {
  'message:new': (m: Message) => void
  'message:recall': (p: { id: string }) => void
  'peer:typing': (p: { typing: boolean }) => void
  'call:event': (p: { status: string; durationSec?: number }) => void
  'companion:update': (p: { status: string; durationSec: number }) => void
  'room:progress': (p: { roomId: string; progressMs: number; playing: boolean }) => void
  'proactive:tick': (p: { kind: string }) => void
}

let socket: Socket | null = null

export function connectRealtime(coupleId: string) {
  if (socket) return socket
  socket = io('/rt', {
    transports: ['websocket'],
    auth: { coupleId },
    withCredentials: true,
  })
  socket.on('connect', () => console.info('[rt] connected', socket?.id))
  socket.on('disconnect', (reason) => console.warn('[rt] disconnected', reason))
  return socket
}

export function onRealtime<K extends keyof ServerEvents>(event: K, handler: ServerEvents[K]) {
  const s = connectRealtime('')
  s.on(event as string, handler as (...args: unknown[]) => void)
  return () => s.off(event as string, handler as (...args: unknown[]) => void)
}

export const emitTyping = (conversationId: string, typing: boolean) =>
  socket?.emit('typing', { conversationId, typing })
