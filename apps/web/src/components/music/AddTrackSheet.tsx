import { useRef, useState } from 'react'
import clsx from 'clsx'
import { hasIDB } from '@/lib/db'
import {
  neteaseFallbackUrl,
  neteaseSongId,
  neteaseStreamUrl,
  newTrackId,
  qqSongMid,
  qqStreamUrl,
  resolveNetease,
  resolveQQ,
  titleFromFileName,
} from '@/lib/music'
import { saveAudioFile } from '@/lib/repo'
import { useAppStore } from '@/store/useAppStore'
import type { Track } from '@/types'

type Tab = 'local' | 'url' | 'netease' | 'qq'

/**
 * 「＋ 加歌」：三条路，都是真的
 *
 *  · 本机文件 → Blob 存进 IndexedDB（**只在这台设备上**），`<audio>` 真播
 *  · 音频直链 → 任何能直接播的 http(s) 音频地址
 *  · 网易云   → 贴分享链接 / 歌曲 id，走代理音频流在应用内播（VIP / 地区受限时可能只能试听或播不了）
 */
export function AddTrackSheet({ onClose, onAdded }: { onClose: () => void; onAdded: (id: string) => void }) {
  const addRoomTracks = useAppStore((s) => s.addRoomTracks)
  const [tab, setTab] = useState<Tab>('local')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  /* 直链 */
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')

  /* 网易云 */
  const [input, setInput] = useState('')
  const [resolved, setResolved] = useState<{ songId: string; title: string; artist: string; cover?: string } | null>(null)
  const [nTitle, setNTitle] = useState('')
  const [nArtist, setNAritst] = useState('')

  /* QQ 音乐 */
  const [qInput, setQInput] = useState('')
  const [qResolved, setQResolved] = useState<{ songMid: string; title: string; artist: string; cover?: string } | null>(null)
  const [qTitle, setQTitle] = useState('')
  const [qArtist, setQArtist] = useState('')

  const done = (tracks: Track[]) => {
    if (!tracks.length) return
    addRoomTracks(tracks)
    onAdded(tracks[0].id)
  }

  /* ── 本机文件 ── */
  async function pickLocal(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    setNote('')
    try {
      const tracks: Track[] = []
      for (const f of Array.from(files)) {
        const id = newTrackId()
        await saveAudioFile(id, f)
        tracks.push({
          id,
          title: titleFromFileName(f.name),
          artist: '本机文件',
          cover: '🎵',
          source: { kind: 'local', blobKey: id, mime: f.type, size: f.size },
          addedBy: 'me',
          addedAt: new Date().toISOString(),
        })
      }
      done(tracks)
      onClose()
    } catch (e) {
      setNote(e instanceof Error ? e.message : '存不进本机存储')
    } finally {
      setBusy(false)
    }
  }

  /* ── 直链 ── */
  function addUrl() {
    const u = url.trim()
    if (!/^https?:\/\//i.test(u)) {
      setNote('要一个 http(s) 开头的音频地址')
      return
    }
    const id = newTrackId()
    done([
      {
        id,
        title: title.trim() || '未命名',
        artist: artist.trim() || '直链音频',
        cover: '🔗',
        source: { kind: 'url', url: u },
        addedBy: 'me',
        addedAt: new Date().toISOString(),
      },
    ])
    onClose()
  }

  /* ── 网易云 ── */
  async function doResolve() {
    const raw = input.trim()
    if (!raw) return
    setNote('')
    setBusy(true)
    setResolved(null)
    const r = await resolveNetease(raw)
    setBusy(false)
    if (r?.songId) {
      // 后端能解析（歌名 / 歌手 / 封面）
      setResolved(r)
      setNTitle(r.title || '')
      setNAritst(r.artist || '')
      return
    }
    // 后端不在线也没关系：只要能抠出 id，就能用官方外链播放器播
    const id = neteaseSongId(raw)
    if (id) {
      setResolved({ songId: id, title: '', artist: '' })
      setNTitle('')
      setNAritst('')
      setNote('没连上解析服务，不过这首歌会走代理音频流播放；把歌名歌手补一下就行。')
      return
    }
    setNote('认不出歌曲 id：可以贴「分享」出来的整段文字，或者 music.163.com/song?id=xxx 这样的链接。')
  }

  function addNetease() {
    if (!resolved) return
    const id = newTrackId()
    done([
      {
        id,
        title: nTitle.trim() || `网易云歌曲 ${resolved.songId}`,
        artist: nArtist.trim() || '网易云音乐',
        cover: resolved.cover || '🎧',
        source: {
          kind: 'netease',
          songId: resolved.songId,
          streamUrl: neteaseStreamUrl(resolved.songId),
          fallbackUrl: neteaseFallbackUrl(resolved.songId),
        },
        addedBy: 'me',
        addedAt: new Date().toISOString(),
      },
    ])
    onClose()
  }

  /* ── QQ 音乐 ── */
  async function doResolveQQ() {
    const raw = qInput.trim()
    if (!raw) return
    setNote('')
    setBusy(true)
    setQResolved(null)
    const r = await resolveQQ(raw)
    setBusy(false)
    if (r?.songMid) {
      setQResolved(r)
      setQTitle(r.title || '')
      setQArtist(r.artist || '')
      return
    }
    const mid = qqSongMid(raw)
    if (mid) {
      setQResolved({ songMid: mid, title: '', artist: '' })
      setQTitle('')
      setQArtist('')
      setNote('没连上解析服务，不过这首歌会走 QQ 音乐代理；把歌名歌手补一下就行。VIP 曲目需要先在设置里登录 QQ 音乐。')
      return
    }
    setNote('认不出 songmid：可以贴 y.qq.com 的歌曲分享链接，或者 songDetail/xxx 这样的地址。')
  }

  function addQQ() {
    if (!qResolved) return
    const id = newTrackId()
    done([
      {
        id,
        title: qTitle.trim() || `QQ 音乐歌曲 ${qResolved.songMid}`,
        artist: qArtist.trim() || 'QQ 音乐',
        cover: qResolved.cover || '🎵',
        source: {
          kind: 'qq',
          songMid: qResolved.songMid,
          streamUrl: qqStreamUrl(qResolved.songMid),
        },
        addedBy: 'me',
        addedAt: new Date().toISOString(),
      },
    ])
    onClose()
  }

  const input2 = 'w-full rounded-lg bg-surface px-3 py-2 text-[13px] text-ink outline-none ring-1 ring-hairline focus:ring-brand placeholder:text-ink-faint'

  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end">
      <button className="flex-1 bg-black/25" onClick={onClose} aria-label="关闭" />
      <div className="max-h-[78%] overflow-y-auto rounded-t-2xl bg-page px-4 pb-5 pt-3 shadow-phone">
        <div className="mb-2 flex items-center">
          <span className="text-[14px] font-medium text-ink">加歌</span>
          <button className="tap ml-auto text-[13px] text-ink-faint" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="mb-3 flex gap-1.5">
          {(
            [
              ['local', '本机文件'],
              ['url', '音频直链'],
              ['netease', '网易云'],
              ['qq', 'QQ 音乐'],
            ] as [Tab, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              className={clsx(
                'tap flex-1 rounded-lg py-1.5 text-[12px]',
                tab === k ? 'bg-brand text-white' : 'bg-surface text-ink-sub ring-1 ring-hairline',
              )}
              onClick={() => {
                setTab(k)
                setNote('')
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'local' && (
          <div className="space-y-2">
            <input
              ref={fileRef}
              type="file"
              accept="audio/*"
              multiple
              className="hidden"
              onChange={(e) => void pickLocal(e.target.files)}
            />
            <button
              className="tap w-full rounded-xl border border-dashed border-brand bg-surface py-6 text-[13px] text-brand-deep"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              {busy ? '正在存…' : '点这里挑音乐文件（可多选）'}
            </button>
            <p className="text-[11px] leading-relaxed text-ink-faint">
              mp3 / flac / m4a / wav… 文件会存在这台设备的浏览器里（IndexedDB），所以：
              <br />
              · 只有这里能播，换设备 / 清浏览器数据后要重新导入；
              <br />
              · 不会上传到服务器（歌名和「一起听了多久」会同步，音频文件不会）。
            </p>
            {!hasIDB && (
              <p className="text-[11px] text-[#c25b4e]">
                现在拿不到浏览器存储（可能是隐私模式），本机文件存不进来。
              </p>
            )}
          </div>
        )}

        {tab === 'url' && (
          <div className="space-y-2">
            <input className={input2} placeholder="http(s)://…/song.mp3" value={url} onChange={(e) => setUrl(e.target.value)} />
            <div className="flex gap-2">
              <input className={input2} placeholder="歌名" value={title} onChange={(e) => setTitle(e.target.value)} />
              <input className={input2} placeholder="歌手" value={artist} onChange={(e) => setArtist(e.target.value)} />
            </div>
            <p className="text-[11px] leading-relaxed text-ink-faint">
              任何能直接播放的音频地址都行（自己托管的、网盘直链、播客的 mp3…）。
              如果它需要登录 / 有防盗链，就会播不出来 —— 播不出来时这里会直接说，不会假装在放。
            </p>
            <button className="tap w-full rounded-lg bg-brand py-2.5 text-[14px] text-white" onClick={addUrl}>
              加进歌单
            </button>
          </div>
        )}

        {tab === 'netease' && (
          <div className="space-y-2">
            <input
              className={input2}
              placeholder="贴「分享」出来的整段，或 music.163.com/song?id=…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button
              className="tap w-full rounded-lg bg-surface py-2.5 text-[13px] text-brand-deep ring-1 ring-hairline"
              disabled={busy || !input.trim()}
              onClick={() => void doResolve()}
            >
              {busy ? '正在认这首歌…' : '认一下这首歌'}
            </button>

            {resolved && (
              <div className="space-y-2 rounded-xl bg-surface p-3 ring-1 ring-hairline">
                <div className="flex items-center gap-2">
                  {resolved.cover ? (
                    <img src={resolved.cover} alt="" className="h-10 w-10 rounded object-cover" />
                  ) : (
                    <span className="grid h-10 w-10 place-items-center rounded bg-page text-[18px]">🎧</span>
                  )}
                  <span className="text-[11px] text-ink-faint">歌曲 id {resolved.songId}</span>
                </div>
                <input className={input2} placeholder="歌名" value={nTitle} onChange={(e) => setNTitle(e.target.value)} />
                <input className={input2} placeholder="歌手" value={nArtist} onChange={(e) => setNAritst(e.target.value)} />
                <button className="tap w-full rounded-lg bg-brand py-2.5 text-[14px] text-white" onClick={addNetease}>
                  加进歌单
                </button>
              </div>
            )}

            <p className="text-[11px] leading-relaxed text-ink-faint">
              会通过我们自己的代理取网易云的公开音频流，在应用里直接播；进度和「一起听了多久」都能算。
              版权 / VIP / 地区受限的曲子仍然可能只给试听或直接播不了，那时播放器会明说，不会假装在放。
            </p>
          </div>
        )}

        {tab === 'qq' && (
          <div className="space-y-2">
            <input
              className={input2}
              placeholder="贴 QQ 音乐分享链接，或 songDetail/…"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
            />
            <button
              className="tap w-full rounded-lg bg-surface py-2.5 text-[13px] text-brand-deep ring-1 ring-hairline"
              disabled={busy || !qInput.trim()}
              onClick={() => void doResolveQQ()}
            >
              {busy ? '正在认这首歌…' : '认一下这首歌'}
            </button>

            {qResolved && (
              <div className="space-y-2 rounded-xl bg-surface p-3 ring-1 ring-hairline">
                <div className="flex items-center gap-2">
                  {qResolved.cover ? (
                    <img src={qResolved.cover} alt="" className="h-10 w-10 rounded object-cover" />
                  ) : (
                    <span className="grid h-10 w-10 place-items-center rounded bg-page text-[18px]">🎵</span>
                  )}
                  <span className="truncate text-[11px] text-ink-faint">songmid {qResolved.songMid}</span>
                </div>
                <input className={input2} placeholder="歌名" value={qTitle} onChange={(e) => setQTitle(e.target.value)} />
                <input className={input2} placeholder="歌手" value={qArtist} onChange={(e) => setQArtist(e.target.value)} />
                <button className="tap w-full rounded-lg bg-brand py-2.5 text-[14px] text-white" onClick={addQQ}>
                  加进歌单
                </button>
              </div>
            )}

            <p className="text-[11px] leading-relaxed text-ink-faint">
              QQ 音乐的 VIP 曲目需要先在「设置 → 接入」里保存 QQ 音乐 Cookie；保存后由代理换 vkey，网页里不会出现 Cookie。
              没登录时只有公开曲目能播，播不了会直接说。
            </p>
          </div>
        )}

        {note && <p className="mt-2 text-[11px] leading-relaxed text-ink-sub">{note}</p>}
      </div>
    </div>
  )
}
