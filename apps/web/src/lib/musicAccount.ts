import { API_BASE } from '@/lib/deploy'
import type { MusicSession } from '@/lib/musicAuth'

/**
 * 音乐账号的后端调用
 *
 * 网页只拿 session 令牌；网易云 Cookie / QQ Cookie 都由 Deno 代理保存。
 * 失败时返回人话，不假装登录成功。
 */
const post = async <T>(path: string, body: unknown): Promise<T> => {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return (await res.json().catch(() => ({}))) as T
}

export interface QrStart {
  ok: boolean
  key?: string
  qr?: string
  expireSec?: number
  error?: string
  detail?: string
}

export interface QrPoll {
  ok: boolean
  status?: 'waiting' | 'scanned' | 'ok' | 'expired'
  session?: string
  profile?: Omit<MusicSession, 'token'>
  error?: string
  detail?: string
}

export interface MusicStatus {
  ok: boolean
  provider?: 'netease' | 'qq'
  profile?: { nickname?: string; avatarUrl?: string; userId?: string; vip?: boolean }
  createdAt?: string
  error?: string
  detail?: string
}

export const startNeteaseQr = async (): Promise<QrStart> => {
  try {
    const res = await fetch(`${API_BASE}/music/netease/qr`)
    return (await res.json().catch(() => ({}))) as QrStart
  } catch (e) {
    return { ok: false, error: 'NETWORK', detail: String((e as Error)?.message ?? e) }
  }
}

export const pollNeteaseQr = async (key: string): Promise<QrPoll> => {
  try {
    const res = await fetch(`${API_BASE}/music/netease/poll?key=${encodeURIComponent(key)}`)
    return (await res.json().catch(() => ({}))) as QrPoll
  } catch (e) {
    return { ok: false, error: 'NETWORK', detail: String((e as Error)?.message ?? e) }
  }
}

export const loginQQWithCookie = async (cookie: string) => {
  try {
    return await post<{ ok: boolean; session?: string; profile?: Omit<MusicSession, 'token'>; error?: string; detail?: string }>(
      '/music/qq/login',
      { cookie },
    )
  } catch (e) {
    return { ok: false, error: 'NETWORK', detail: String((e as Error)?.message ?? e) }
  }
}

export const musicStatus = async (token: string): Promise<MusicStatus> => {
  if (!token) return { ok: false, error: 'NO_SESSION' }
  try {
    const res = await fetch(`${API_BASE}/music/status?session=${encodeURIComponent(token)}`)
    return (await res.json().catch(() => ({}))) as MusicStatus
  } catch (e) {
    return { ok: false, error: 'NETWORK', detail: String((e as Error)?.message ?? e) }
  }
}

export const logoutMusic = async (token: string) => {
  try {
    return await post<{ ok: boolean }>('/music/logout', { session: token })
  } catch {
    return { ok: false }
  }
}
