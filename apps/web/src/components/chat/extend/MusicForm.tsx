import { useState } from 'react'
import clsx from 'clsx'
import { searchNetease, trackFromNeteaseHit, type NeteaseHit } from '@/lib/music'
import { useAppStore } from '@/store/useAppStore'
import { useChatStore } from '@/store/useChatStore'
import { useRulesStore } from '@/store/useRulesStore'
import { ExtendButton, ExtendHint, ExtendInput } from './ui'

/**
 * 音乐邀请：直接搜网易云，选一首真歌再邀请
 *
 * 不再放那 8 首只有歌名的默认歌单 —— 那些放进房间也播不出声。
 * 现在搜到的是网易云真实歌曲 id，房间会带上真封面和音频流（代理挂了会自动退回公开音源）。
 */
export function MusicForm() {
  const sendMusicInvite = useChatStore((s) => s.sendMusicInvite)
  const addRoomTracks = useAppStore((s) => s.addRoomTracks)
  const tracks = useAppStore((s) => s.room.tracks)
  const m = useRulesStore((s) => s.saved.music)
  const keywords = m.keywords?.length ? m.keywords : ['晴天']
  const [kw, setKw] = useState(keywords[0] ?? '')
  const [hits, setHits] = useState<NeteaseHit[]>([])
  const [sel, setSel] = useState<NeteaseHit | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  async function doSearch(word = kw) {
    const q = word.trim()
    if (!q) return
    setBusy(true)
    setNote('')
    setSel(null)
    setKw(q)
    const list = await searchNetease(q, 8)
    setHits(list)
    setBusy(false)
    if (!list.length) setNote('没搜到这首歌，换个关键词试试。')
  }

  function send() {
    if (!sel) return
    const existing = tracks.find(
      (t) => t.source.kind === 'netease' && t.source.songId === sel.songId,
    )
    const track = existing ?? trackFromNeteaseHit(sel, 'me')
    if (!existing) addRoomTracks([track])
    sendMusicInvite({
      title: sel.title,
      artist: sel.artist,
      cover: sel.cover || '🎧',
      trackId: track.id,
    })
  }

  return (
    <div className="space-y-2 pt-1">
      <div className="flex items-center gap-2">
        <ExtendInput
          value={kw}
          onChange={(e) => setKw(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void doSearch()
          }}
          placeholder="搜歌名 / 歌手，例如 晴天、陈粒"
          className="flex-1"
        />
        <ExtendButton disabled={busy || !kw.trim()} onClick={() => void doSearch()}>
          {busy ? '搜…' : '搜歌'}
        </ExtendButton>
      </div>

      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {keywords.slice(0, 6).map((k) => (
            <button
              key={k}
              className="tap rounded-full bg-surface px-2 py-1 text-[10px] text-ink-sub ring-1 ring-hairline"
              onClick={() => void doSearch(k)}
            >
              {k}
            </button>
          ))}
        </div>
      )}

      {hits.length > 0 && (
        <div className="max-h-44 space-y-1 overflow-y-auto no-scrollbar">
          {hits.map((h) => (
            <button
              key={h.songId}
              onClick={() => setSel(h)}
              className={clsx(
                'tap flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left',
                sel?.songId === h.songId ? 'border-brand bg-white' : 'border-transparent bg-surface',
              )}
            >
              {h.cover ? (
                <img src={h.cover} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
              ) : (
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-page text-[16px]">🎧</span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] text-ink">{h.title}</span>
                <span className="block truncate text-[10px] text-ink-faint">
                  {h.artist || '未知歌手'}
                  {h.quality ? ` · ${h.quality}` : ''}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {sel && (
        <div className="rounded-lg bg-brand-soft/60 px-2.5 py-2 text-[11px] text-brand-deep">
          已选：{sel.title} - {sel.artist}
          {sel.album ? `（${sel.album}）` : ''}
        </div>
      )}

      {note && <p className="text-[11px] leading-relaxed text-ink-sub">{note}</p>}

      <div className="flex items-center gap-2">
        <ExtendHint>
          加入概率 {Math.round(m.join.p * 100)}% · 他会待 {m.listenMin[0]}~{m.listenMin[1]} 分钟
        </ExtendHint>
        <ExtendButton className="ml-auto" disabled={!sel} onClick={send}>
          邀请一起听
        </ExtendButton>
      </div>

      <div className="flex items-center gap-2">
        <ExtendHint>想直接听完整首歌？</ExtendHint>
        <button
          className="tap ml-auto rounded-lg bg-brand-soft px-2.5 py-1.5 text-[12px] text-brand-deep"
          onClick={() => useAppStore.getState().push('music-room')}
        >
          去房间一起听 ›
        </button>
      </div>

      <ExtendHint>
        搜到的是网易云真实歌曲，邀请卡会带上房间曲目；房间播放会先走代理音频流，代理不可用时自动退回官方公开音源。
        搜不到就不发假歌。
      </ExtendHint>
    </div>
  )
}
