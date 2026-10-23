/**
 * 浏览器这一侧只保存「代理会话令牌」，不保存网易云 / QQ 的 Cookie。
 *
 * 代理会把令牌和账号 Cookie 的对应关系放在 Deno KV 里；令牌丢了就重新登录。
 * 令牌本身只用于换播放地址 / 查账号状态，不包含账号密码。
 */
export type MusicProvider = 'netease' | 'qq'

export interface MusicSession {
  provider: MusicProvider
  token: string
  nickname?: string
  avatarUrl?: string
  userId?: string
  vip?: boolean
  createdAt?: string
}

const KEY = 'linian:music-session:v1'

export function getMusicSession(): MusicSession | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const j = JSON.parse(raw) as MusicSession
    if (!j?.token || (j.provider !== 'netease' && j.provider !== 'qq')) return null
    return j
  } catch {
    return null
  }
}

export function setMusicSession(s: MusicSession | null) {
  try {
    if (!s) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* 隐私模式 / 存储满了：这次播放会退回公开音源 */
  }
}

export const musicSessionToken = () => getMusicSession()?.token ?? ''
