/**
 * 服务端接口层骨架。全部走 /api/v1。
 * 生产环境请用 @tanstack/react-query 包一层缓存。
 */
import type { Conversation, Message } from '@/types'

const BASE = '/api/v1'

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...init,
  })
  if (!res.ok) throw new Error(`[${res.status}] ${await res.text()}`)
  return res.json() as Promise<T>
}

export const api = {
  /* ── 关系 ── */
  getCouple: () => req<Conversation>('/couple'),

  /* ── 聊天 ── */
  listMessages: (conversationId: string, before?: string) =>
    req<Message[]>(`/conversations/${conversationId}/messages?before=${before ?? ''}`),
  sendMessage: (conversationId: string, body: Partial<Message>) =>
    req<Message>(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  recallMessage: (id: string) => req<void>(`/messages/${id}/recall`, { method: 'POST' }),
  /** 已经读了（上报已读水位） */
  readUpTo: (conversationId: string, messageId: string) =>
    req<void>(`/conversations/${conversationId}/read`, {
      method: 'POST',
      body: JSON.stringify({ messageId }),
    }),

  /* ── 规则引擎 ── */
  getRules: () => req<Record<string, unknown>>('/rules'),
  saveRules: (data: Record<string, unknown>) =>
    req<{ version: number }>('/rules', { method: 'PUT', body: JSON.stringify(data) }),

  /* ── 字卡库 ── */
  listCards: (params?: { type?: string; category?: string }) =>
    req<unknown[]>(`/cards?${new URLSearchParams(params as Record<string, string> ?? {})}`),
  importCards: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return req<{ created: number; duplicated: number }>('/cards/import', {
      method: 'POST',
      body: fd,
    })
  },

  /* ── 集成（MiniMax / 搜索）── */
  getIntegrations: () => req<unknown>('/integrations'),
  saveIntegration: (provider: string, secret: string, enabled: boolean) =>
    req<void>(`/integrations/${provider}`, {
      method: 'PUT',
      body: JSON.stringify({ secret, enabled }),
    }),
}
