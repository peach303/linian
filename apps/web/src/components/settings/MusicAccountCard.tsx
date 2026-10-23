import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import QRCode from 'qrcode'
import {
  loginQQWithCookie,
  logoutMusic,
  musicStatus,
  pollNeteaseQr,
  startNeteaseQr,
} from '@/lib/musicAccount'
import { getMusicSession, setMusicSession, type MusicSession } from '@/lib/musicAuth'

type Busy = '' | 'qr' | 'qq' | 'logout'

/**
 * 音乐账号：网易云扫码 / QQ 音乐 Cookie
 *
 * 两个账号的 Cookie 都只保存在代理的 Deno KV 里；网页拿到的只是 session 令牌。
 * 登录成功后，播放器会带着这个令牌去请求音频，代理再用 Cookie 换 VIP 地址。
 */
export function MusicAccountCard() {
  const [session, setSession] = useState<MusicSession | null>(() => getMusicSession())
  const [busy, setBusy] = useState<Busy>('')
  const [note, setNote] = useState('')
  const [qrImage, setQrImage] = useState('')
  const [qrState, setQrState] = useState('')
  const [qqCookie, setQQCookie] = useState('')
  const pollRef = useRef<number | null>(null)

  const stopPoll = () => {
    if (pollRef.current != null) window.clearInterval(pollRef.current)
    pollRef.current = null
  }

  const save = (s: MusicSession | null) => {
    setMusicSession(s)
    setSession(s)
  }

  useEffect(() => {
    const s = getMusicSession()
    if (!s) return
    void musicStatus(s.token).then((r) => {
      if (r.ok && r.profile) {
        const next = { ...s, ...r.profile, provider: (r.provider || s.provider) as MusicSession['provider'] }
        save(next)
      } else if (r.error === 'NO_SESSION') {
        save(null)
      }
    })
    return () => stopPoll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const beginNetease = async () => {
    setBusy('qr')
    setNote('')
    setQrImage('')
    setQrState('正在向网易云要二维码…')
    stopPoll()
    const r = await startNeteaseQr()
    if (!r.ok || !r.key || !r.qr) {
      setBusy('')
      setQrState('')
      setNote(`二维码没拿到：${r.error || 'UNKNOWN'}${r.detail ? `（${r.detail}）` : ''}`)
      return
    }
    try {
      const img = await QRCode.toDataURL(r.qr, {
        width: 224,
        margin: 1,
        color: { dark: '#2b2b2b', light: '#ffffff' },
      })
      setQrImage(img)
      setQrState('用网易云 App 扫码，再在手机上确认')
    } catch {
      setNote('二维码生成失败，可以用下面的 QQ Cookie 方式，或重试一次')
      setBusy('')
      return
    }
    setBusy('')
    pollRef.current = window.setInterval(() => {
      void (async () => {
        const p = await pollNeteaseQr(r.key!)
        if (!p.ok) {
          if (p.error === 'QR_POLL_FAILED' || p.error === 'NO_MUSIC_U') {
            stopPoll()
            setQrState('')
            setNote(`登录失败：${p.error}${p.detail ? `（${p.detail}）` : ''}`)
          }
          return
        }
        if (p.status === 'scanned') setQrState('已扫码，等你在手机上点确认')
        if (p.status === 'expired') {
          stopPoll()
          setQrState('')
          setQrImage('')
          setNote('二维码过期了，重新点一次「扫码登录网易云」')
          return
        }
        if (p.status === 'ok' && p.session) {
          stopPoll()
          const s: MusicSession = {
            provider: 'netease',
            token: p.session,
            nickname: p.profile?.nickname || '网易云账号',
            avatarUrl: p.profile?.avatarUrl,
            userId: p.profile?.userId,
            vip: p.profile?.vip,
            createdAt: new Date().toISOString(),
          }
          save(s)
          setQrImage('')
          setQrState('')
          setNote(`已登录：${s.nickname}${s.vip ? '（VIP 账号）' : ''}`)
        }
      })()
    }, 2000)
  }

  const doQQ = async () => {
    setBusy('qq')
    setNote('')
    const r = await loginQQWithCookie(qqCookie)
    setBusy('')
    if (!r.ok || !r.session) {
      setNote(`QQ 音乐登录失败：${r.error || 'UNKNOWN'}${r.detail ? `（${r.detail}）` : ''}`)
      return
    }
    const s: MusicSession = {
      provider: 'qq',
      token: r.session,
      nickname: r.profile?.nickname || 'QQ 音乐账号',
      avatarUrl: r.profile?.avatarUrl,
      userId: r.profile?.userId,
      /** 代理能确认 VIP 才显示；只是「保存了 Cookie」不等于账号真有 VIP */
      vip: Boolean(r.profile?.vip),
      createdAt: new Date().toISOString(),
    }
    save(s)
    setQQCookie('')
    setNote(`QQ 音乐 Cookie 已保存：${s.nickname}`)
  }

  const doLogout = async () => {
    if (!session) return
    setBusy('logout')
    await logoutMusic(session.token)
    save(null)
    setBusy('')
    setNote('已退出音乐账号，播放会退回公开音源')
  }

  return (
    <section className="rounded-xl bg-surface p-3 shadow-card">
      <div className="flex items-center gap-2">
        <h2 className="text-[14px] text-ink">音乐账号（网易云 / QQ 音乐）</h2>
        {session && (
          <span className="ml-auto rounded-full bg-brand-soft px-2 py-0.5 text-[10px] text-brand-deep">
            {session.provider === 'netease' ? '网易云' : 'QQ 音乐'}
          </span>
        )}
      </div>
      <p className="mb-2 mt-0.5 text-[11px] leading-relaxed text-ink-faint">
        登录后，代理会用你的账号换 VIP / 高音质播放地址。Cookie 只存在代理的 Deno KV 里，网页里只有一串会话令牌；
        退出登录会同时清掉代理里的 Cookie。
      </p>

      {session ? (
        <div className="rounded-xl bg-page p-3 ring-1 ring-hairline">
          <div className="flex items-center gap-2">
            {session.avatarUrl ? (
              <img src={session.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
            ) : (
              <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-soft text-[18px]">
                {session.provider === 'netease' ? '🎧' : '🎵'}
              </span>
            )}
            <div className="min-w-0">
              <div className="truncate text-[13px] text-ink">{session.nickname || '音乐账号'}</div>
              <div className="text-[10px] text-ink-faint">
                {session.provider === 'netease' ? '网易云' : 'QQ 音乐'}
                {session.vip ? ' · VIP' : ''}
                {session.userId ? ` · ${session.userId}` : ''}
              </div>
            </div>
            <button
              className="tap ml-auto shrink-0 rounded-lg bg-surface px-2.5 py-1.5 text-[11px] text-ink-sub ring-1 ring-hairline"
              disabled={busy === 'logout'}
              onClick={() => void doLogout()}
            >
              {busy === 'logout' ? '退出中…' : '退出登录'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl bg-page p-3 ring-1 ring-hairline">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-ink">网易云 · 扫码登录</span>
              <button
                className="tap rounded-lg bg-brand px-3 py-1.5 text-[12px] text-white"
                disabled={busy === 'qr'}
                onClick={() => void beginNetease()}
              >
                {busy === 'qr' ? '获取中…' : qrImage ? '重新扫码' : '扫码登录网易云'}
              </button>
            </div>
            {qrImage && (
              <div className="mt-2 flex flex-col items-center">
                <img src={qrImage} alt="网易云登录二维码" className="h-44 w-44 rounded-lg bg-white p-1" />
                <div className="mt-1 text-[11px] text-ink-sub">{qrState}</div>
              </div>
            )}
            {!qrImage && qrState && <div className="mt-1 text-[11px] text-ink-sub">{qrState}</div>}
          </div>

          <div className="rounded-xl bg-page p-3 ring-1 ring-hairline">
            <div className="text-[13px] text-ink">QQ 音乐 · 保存 Cookie</div>
            <p className="mt-0.5 text-[10px] leading-relaxed text-ink-faint">
              在电脑浏览器登录 y.qq.com → 开发者工具 → Application / 存储 → Cookies → 复制 y.qq.com 的整段 Cookie 粘进来。
              只保存 Cookie，不保存账号密码；不要把这段 Cookie 发给别人。
            </p>
            <textarea
              value={qqCookie}
              onChange={(e) => setQQCookie(e.target.value)}
              rows={3}
              placeholder="uin=...; qqmusic_key=...; qm_keyst=..."
              className="mt-2 w-full resize-y rounded-lg bg-surface px-2.5 py-2 text-[12px] text-ink outline-none ring-1 ring-hairline placeholder:text-ink-faint focus:ring-brand"
            />
            <button
              className={clsx(
                'tap mt-2 w-full rounded-lg py-2 text-[12px] text-white',
                qqCookie.trim() ? 'bg-brand' : 'bg-ink-faint',
              )}
              disabled={!qqCookie.trim() || busy === 'qq'}
              onClick={() => void doQQ()}
            >
              {busy === 'qq' ? '正在校验…' : '保存 QQ 音乐 Cookie'}
            </button>
          </div>
        </div>
      )}

      {note && <p className="mt-2 text-[11px] leading-relaxed text-ink-sub">{note}</p>}
    </section>
  )
}
