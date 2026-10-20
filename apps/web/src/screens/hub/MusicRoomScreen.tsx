import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { Avatar } from '@/components/common/Avatar'
import { NavBar } from '@/components/common/NavBar'
import { AddTrackSheet } from '@/components/music/AddTrackSheet'
import { onPlayer, pause, play, playTrack, playerState, seek, stop, type PlayerState } from '@/lib/audio'
import { leaveRoomScreen } from '@/lib/engine/room'
import { mmss, neteaseEmbedUrl, neteaseSongUrl, playableKind } from '@/lib/music'
import { nid } from '@/lib/ids'
import { useAppStore } from '@/store/useAppStore'
import { useUIStore } from '@/store/useUIStore'
import type { Track } from '@/types'

/**
 * 一起听（真播放器 + 房间）
 *
 * 能真的出声：本机音频文件 / 音频直链由 `<audio>` 播（进度、音量、seek 都是真的）；
 * 网易云曲目用**官方外链播放器**嵌进来播（进度以它为准）。
 * 「一起听」的时长是**真的播出来的秒数**，不是编的数字。
 */
export function MusicRoomScreen() {
  const room = useAppStore((s) => s.room)
  const me = useAppStore((s) => s.me)
  const dream = useAppStore((s) => s.dream)
  const removeRoomTrack = useAppStore((s) => s.removeRoomTrack)
  const pushRoomMessage = useAppStore((s) => s.pushRoomMessage)
  const patchRoom = useAppStore((s) => s.patchRoom)
  const musicMini = useUIStore((s) => s.musicMini)
  const setMusicMini = useUIStore((s) => s.setMusicMini)

  const [player, setPlayer] = useState<PlayerState>(() => playerState())
  const [sheetOpen, setSheetOpen] = useState(false)
  const [loop, setLoop] = useState<'list' | 'one'>('list')
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editArtist, setEditArtist] = useState('')
  const chatRef = useRef<HTMLDivElement>(null)
  const endedRef = useRef(false)

  const tracks = room.tracks
  const current = useMemo(() => tracks.find((t) => t.id === room.currentId), [tracks, room.currentId])
  const kind = current ? playableKind(current) : 'none'

  /* 订阅播放器 */
  useEffect(() => onPlayer(setPlayer), [])

  /* 离开页面：把没落盘的秒数补上；**不停声** —— 声音交给全局的音乐悬浮窗继续放 */
  useEffect(() => () => leaveRoomScreen(), [])

  /* 一曲放完 → 下一首（或单曲循环） */
  useEffect(() => {
    if (player.playing) {
      endedRef.current = false
      return
    }
    const finished = player.duration > 0 && player.position >= player.duration - 0.6
    if (!finished || endedRef.current) return
    endedRef.current = true
    if (loop === 'one') {
      if (current) void playTrack(current, 0)
      return
    }
    const next = neighbour(1)
    // 歌单里没有「下一首」了（或只有这一首）→ 停在结尾，不自己重放
    if (next && next.id !== current?.id) {
      patchRoom({ currentId: next.id, position: 0 })
      if (playableKind(next) === 'audio') void playTrack(next, 0)
    } else {
      seek(0)
      patchRoom({ position: 0 })
    }
  }, [player.playing, player.position, player.duration, loop])

  /* 房间对话滚到底 */
  useEffect(() => {
    const el = chatRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [room.messages.length])

  /** 上一首 / 下一首：跳过只有歌名的（播不了的） */
  function neighbour(dir: 1 | -1): Track | undefined {
    if (!tracks.length) return undefined
    const from = tracks.findIndex((t) => t.id === room.currentId)
    for (let i = 1; i <= tracks.length; i++) {
      const idx = (from + dir * i + tracks.length * 2) % tracks.length
      const t = tracks[idx]
      if (t && playableKind(t) !== 'none') return t
    }
    return undefined
  }

  async function selectTrack(t: Track | undefined) {
    if (!t) return
    patchRoom({ currentId: t.id, position: 0 })
    if (playableKind(t) === 'audio') await playTrack(t, 0)
  }

  async function togglePlay() {
    if (!current) return
    if (player.trackId === current.id && player.playing) {
      pause()
      patchRoom({ position: player.position })
      return
    }
    if (player.trackId === current.id) {
      await play()
      return
    }
    // 接着上次的位置听
    await playTrack(current, room.position ?? 0)
  }

  const listened = room.playedSec ?? 0
  const heState = room.heJoinedAt ? '在听' : '还没进来'
  const sendMsg = () => {
    const t = draft.trim()
    if (!t) return
    pushRoomMessage({ id: nid('rm'), senderId: me.id, text: t, createdAt: new Date().toISOString() })
    setDraft('')
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-page">
      <NavBar
        title="一起听"
        onBack={() => {
          leaveRoomScreen()
          useAppStore.getState().back()
        }}
        right={
          <>
            <button
              className={clsx('tap px-1.5 py-1 text-[12px]', musicMini ? 'text-brand-deep' : 'text-ink-faint')}
              title="离开页面后是否保留这个音乐小窗"
              onClick={() => setMusicMini(!musicMini)}
            >
              悬浮窗{musicMini ? '开' : '关'}
            </button>
            <button className="tap px-2 py-1 text-[13px]" onClick={() => setSheetOpen(true)}>
              加歌
            </button>
          </>
        }
      />

      <div className="no-scrollbar flex-1 overflow-y-auto px-3 pb-3">
        {/* ── 头部：谁在听 ── */}
        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-gradient-to-br from-[#5aa0e8] to-[#8fc4f8] p-3 text-white shadow-card">
          <div className="flex">
            <Avatar src={me.avatarUrl} name={me.nickname} size={34} ring />
            <Avatar src={dream.avatarUrl} name={dream.nickname} size={34} ring className="-ml-2.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-medium">和{dream.nickname}一起听</div>
            <div className="text-[11px] opacity-90">
              他{heState} · 一起听了 {listened >= 60 ? `${Math.floor(listened / 60)} 分 ${listened % 60} 秒` : `${listened} 秒`}
              {room.heStaysUntil && room.heJoinedAt ? ` · 他准备待到 ${hhmm(room.heStaysUntil)}` : ''}
            </div>
          </div>
        </div>

        {/* ── 正在播放 ── */}
        <div className="mt-3 rounded-2xl bg-surface p-4 shadow-card">
          <div className="flex flex-col items-center">
            {current?.cover && /^(https?:|data:)/.test(current.cover) ? (
              <img
                src={current.cover}
                alt=""
                className={clsx('h-40 w-40 rounded-full object-cover shadow-lg', player.playing && 'animate-[spin_14s_linear_infinite]')}
              />
            ) : (
              <div
                className={clsx(
                  'grid h-40 w-40 place-items-center rounded-full bg-gradient-to-br from-brand-soft to-white text-[64px] shadow-lg',
                  player.playing && 'animate-[spin_14s_linear_infinite]',
                )}
              >
                {current?.cover ?? '🎵'}
              </div>
            )}
            <div className="mt-3 max-w-full truncate text-[16px] font-medium text-ink">
              {current?.title ?? '还没有歌'}
            </div>
            <div className="max-w-full truncate text-[12px] text-ink-sub">
              {current?.artist ?? '点右上角「加歌」导入本机音乐 / 音频直链 / 网易云'}
            </div>

            {/* 网易云：官方外链播放器（版权是他们的，进度也归他们） */}
            {kind === 'netease' && current?.source.kind === 'netease' && (
              <div className="mt-3 w-full">
                <iframe
                  title="网易云音乐"
                  src={neteaseEmbedUrl(current.source.songId, player.playing ? 1 : 0)}
                  width="100%"
                  height={66}
                  frameBorder={0}
                  allow="autoplay; encrypted-media"
                  className="rounded-lg"
                />
                <a
                  className="mt-1.5 block text-center text-[11px] text-brand-deep underline"
                  href={neteaseSongUrl(current.source.songId)}
                  target="_blank"
                  rel="noreferrer"
                >
                  在网易云里打开（VIP / 地区受限时这里可能只能试听）
                </a>
                <p className="mt-1 text-center text-[10px] leading-relaxed text-ink-faint">
                  这首走网易云官方播放器：进度、音量和「能不能听」都由它决定，我们这边不接管、也不统计时长。
                </p>
              </div>
            )}

            {kind === 'audio' && (
              <>
                <input
                  type="range"
                  min={0}
                  max={Math.max(1, player.duration)}
                  step={0.5}
                  value={Math.min(player.position, player.duration || 0)}
                  onChange={(e) => seek(Number(e.target.value))}
                  className="mt-4 h-1 w-full"
                  style={{ accentColor: 'var(--brand)' }}
                />
                <div className="mt-1 flex w-full justify-between text-[10px] tabular-nums text-ink-faint">
                  <span>{mmss(player.position)}</span>
                  <span>{player.duration ? mmss(player.duration) : '--:--'}</span>
                </div>
              </>
            )}

            {kind === 'none' && current && (
              <p className="mt-3 text-center text-[11px] leading-relaxed text-ink-faint">
                这首只有歌名，没有音频 —— 想真听的话，把音乐文件加进来，或换成直链 / 网易云那种。
              </p>
            )}

            {player.error && (
              <p className="mt-2 text-center text-[11px] text-[#c25b4e]">{player.error}</p>
            )}

            {/* 控制条 */}
            <div className="mt-4 flex items-center gap-6">
              <button className="tap text-[20px] text-ink-sub disabled:opacity-40" disabled={!tracks.length} onClick={() => void selectTrack(neighbour(-1))}>
                ⏮
              </button>
              <button
                className="tap grid h-14 w-14 place-items-center rounded-full bg-brand text-[22px] text-white shadow-card disabled:opacity-40"
                disabled={!current || kind === 'none'}
                onClick={() => void togglePlay()}
              >
                {player.playing ? '⏸' : '▶'}
              </button>
              <button className="tap text-[20px] text-ink-sub disabled:opacity-40" disabled={!tracks.length} onClick={() => void selectTrack(neighbour(1))}>
                ⏭
              </button>
              <button
                className={clsx('tap text-[12px]', loop === 'one' ? 'text-brand-deep' : 'text-ink-faint')}
                onClick={() => setLoop(loop === 'one' ? 'list' : 'one')}
                title="单曲循环 / 顺序播放"
              >
                {loop === 'one' ? '单曲' : '顺序'}
              </button>
            </div>
          </div>
        </div>

        {/* ── 歌单 ── */}
        <section className="mt-4">
          <div className="mb-2 flex items-center px-1">
            <span className="text-[13px] font-medium text-ink">歌单 {tracks.length} 首</span>
            <button className="tap ml-auto text-[12px] text-brand-deep" onClick={() => setSheetOpen(true)}>
              ＋ 加歌
            </button>
          </div>

          {tracks.length === 0 ? (
            <p className="rounded-xl bg-surface p-3 text-[12px] leading-relaxed text-ink-faint shadow-card">
              还没有歌。点「＋ 加歌」可以：<br />
              · 导入本机音乐文件（mp3 / flac / m4a / wav…）—— 真的会出声<br />
              · 贴一个音频直链<br />
              · 贴网易云分享链接（用官方外链播放器播）
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl bg-surface shadow-card">
              {tracks.map((t) => {
                const active = t.id === room.currentId
                const k = playableKind(t)
                return (
                  <div key={t.id} className={clsx('border-b border-hairline last:border-0', active && 'bg-brand-soft/40')}>
                    <div className="flex items-center gap-2 px-3 py-2">
                      <button className="tap flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => void selectTrack(t)}>
                        <span className="text-[20px] leading-none">
                          {t.cover && /^(https?:|data:)/.test(t.cover) ? (
                            <img src={t.cover} alt="" className="h-6 w-6 rounded object-cover" />
                          ) : (
                            t.cover ?? '🎵'
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={clsx('block truncate text-[13px]', active ? 'text-brand-deep' : 'text-ink')}>
                            {t.title}
                          </span>
                          <span className="block truncate text-[11px] text-ink-faint">
                            {t.artist || '未知歌手'}
                            {t.playedSec ? ` · 听过 ${mmss(t.playedSec)}` : ''}
                            {k === 'none' ? ' · 只有歌名' : ''}
                          </span>
                          {t.hisNote && <span className="mt-0.5 block truncate text-[11px] text-brand-deep">他：{t.hisNote}</span>}
                        </span>
                      </button>
                      <span className={clsx('shrink-0 text-[10px]', t.addedBy === 'him' ? 'text-brand-deep' : 'text-ink-faint')}>
                        {t.addedBy === 'him' ? '他加的' : '我加的'}
                      </span>
                      <button
                        className="tap shrink-0 px-1 text-[13px] text-ink-faint"
                        title="删掉这首"
                        onClick={() => {
                          if (room.currentId === t.id) stop()
                          removeRoomTrack(t.id)
                        }}
                      >
                        ✕
                      </button>
                    </div>

                    {/* 只有歌名 → 允许补上真来源 */}
                    {k === 'none' && (
                      <div className="px-3 pb-2">
                        {editingId === t.id ? (
                          <div className="space-y-1.5">
                            <input
                              className="w-full rounded-md bg-page px-2 py-1 text-[12px] outline-none"
                              placeholder="歌名"
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                            />
                            <input
                              className="w-full rounded-md bg-page px-2 py-1 text-[12px] outline-none"
                              placeholder="歌手"
                              value={editArtist}
                              onChange={(e) => setEditArtist(e.target.value)}
                            />
                            <div className="flex justify-end gap-2 text-[12px]">
                              <button className="tap text-ink-faint" onClick={() => setEditingId(null)}>
                                取消
                              </button>
                              <button
                                className="tap text-brand-deep"
                                onClick={() => {
                                  useAppStore.getState().patchRoom({
                                    tracks: tracks.map((x) =>
                                      x.id === t.id ? { ...x, title: editTitle.trim() || x.title, artist: editArtist.trim() } : x,
                                    ),
                                  })
                                  setEditingId(null)
                                }}
                              >
                                保存
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            className="tap text-[11px] text-brand-deep"
                            onClick={() => {
                              setEditingId(t.id)
                              setEditTitle(t.title)
                              setEditArtist(t.artist)
                            }}
                          >
                            改歌名 / 歌手
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* ── 房间对话 ── */}
        <section className="mt-4">
          <div className="mb-2 px-1 text-[13px] font-medium text-ink">一起听的时候说的话</div>
          <div ref={chatRef} className="max-h-56 space-y-2 overflow-y-auto rounded-xl bg-surface p-3 shadow-card">
            {room.messages.length === 0 ? (
              <p className="text-[12px] text-ink-faint">开始放歌之后，他可能会说点什么。</p>
            ) : (
              room.messages.map((m) => {
                const mine = m.senderId === me.id
                return (
                  <div key={m.id} className={clsx('flex items-end gap-2', mine && 'flex-row-reverse')}>
                    <Avatar src={mine ? me.avatarUrl : dream.avatarUrl} name={mine ? me.nickname : dream.nickname} size={24} />
                    <div
                      className={clsx(
                        'max-w-[76%] rounded-2xl px-3 py-1.5 text-[12px] leading-relaxed',
                        mine ? 'bg-brand text-white' : 'bg-page text-ink',
                      )}
                    >
                      {m.text}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </section>
      </div>

      {/* 底部输入 */}
      <div className="flex shrink-0 items-center gap-2 border-t border-hairline bg-surface px-3 py-2">
        <input
          className="min-w-0 flex-1 rounded-md bg-page px-3 py-2 text-[13px] outline-none"
          placeholder="边听边聊…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMsg()}
        />
        <button className="tap rounded-md bg-brand px-3 py-2 text-[13px] text-white disabled:opacity-40" disabled={!draft.trim()} onClick={sendMsg}>
          发送
        </button>
      </div>

      {sheetOpen && (
        <AddTrackSheet
          onClose={() => setSheetOpen(false)}
          onAdded={(id) => {
            setSheetOpen(false)
            patchRoom({ currentId: id, position: 0 })
          }}
        />
      )}
    </div>
  )
}

const hhmm = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
