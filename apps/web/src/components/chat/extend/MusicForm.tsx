import { useState } from 'react'
import clsx from 'clsx'
import { SONGS } from '@/lib/music'
import { useAppStore } from '@/store/useAppStore'
import { useChatStore } from '@/store/useChatStore'
import { useRulesStore } from '@/store/useRulesStore'
import { ExtendButton, ExtendHint, ExtendInput } from './ui'

/** 音乐邀请：从歌单里挑一首（或自己填），邀请他一起听 */
export function MusicForm() {
  const sendMusicInvite = useChatStore((s) => s.sendMusicInvite)
  const m = useRulesStore((s) => s.saved.music)
  const [selId, setSelId] = useState('')
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')

  const picked = SONGS.find((s) => s.id === selId)
  const custom = title.trim().length > 0
  const payload = custom
    ? { title: title.trim(), artist: artist.trim(), cover: '🎵' }
    : picked
      ? { title: picked.title, artist: picked.artist, cover: picked.cover }
      : null

  return (
    <div className="space-y-2 pt-1">
      <div className="grid grid-cols-2 gap-2">
        {SONGS.map((s) => (
          <button
            key={s.id}
            onClick={() => {
              setSelId(s.id)
              setTitle('')
              setArtist('')
            }}
            className={clsx(
              'tap flex items-center gap-2 rounded-lg border px-2 py-2 text-left shadow-card',
              selId === s.id && !custom ? 'border-brand bg-white' : 'border-transparent bg-surface',
            )}
          >
            <span className="text-[20px] leading-none">{s.cover}</span>
            <span className="min-w-0">
              <span className="block truncate text-[12px] text-ink">{s.title}</span>
              <span className="block truncate text-[10px] text-ink-faint">{s.artist}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <ExtendInput
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            setSelId('')
          }}
          placeholder="也可以自己填歌名"
          className="flex-1"
        />
        <ExtendInput
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          placeholder="歌手"
          className="w-24"
        />
      </div>

      <div className="flex items-center gap-2">
        <ExtendHint>
          加入概率 {Math.round(m.join.p * 100)}% · 他会待 {m.listenMin[0]}~{m.listenMin[1]} 分钟
        </ExtendHint>
        <ExtendButton
          className="ml-auto"
          disabled={!payload}
          onClick={() => payload && sendMusicInvite(payload)}
        >
          邀请一起听
        </ExtendButton>
      </div>

      <div className="flex items-center gap-2">
        <ExtendHint>想真的出声？</ExtendHint>
        <button
          className="tap ml-auto rounded-lg bg-brand-soft px-2.5 py-1.5 text-[12px] text-brand-deep"
          onClick={() => useAppStore.getState().push('music-room')}
        >
          去房间一起听 ›
        </button>
      </div>

      <ExtendHint>
        这里发的是一张「邀请卡」（只有歌名与歌手，放不出声）。房间那边才是真播放器：
        导入本机音乐文件、贴音频直链、或用网易云官方外链播放器 —— 进度和时长都是真的。
      </ExtendHint>
    </div>
  )
}
