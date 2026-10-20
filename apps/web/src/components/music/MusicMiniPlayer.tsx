import { useEffect, useRef, useState } from 'react'
import { onPlayer, pause, play, playerState, playTrack, stop, type PlayerState } from '@/lib/audio'
import { mmss, neighbourTrack } from '@/lib/music'
import { clearMedia, setMedia, setMediaPlaying } from '@/lib/keepAlive'
import { useAppStore } from '@/store/useAppStore'
import { useUIStore } from '@/store/useUIStore'
import type { Track } from '@/types'

/**
 * 音乐悬浮窗（全局，挂在 App 上）
 *
 * 一起听里的歌**离开页面也继续放**（声音本来就来自一个 `<audio>` 单例），
 * 这里只是把它收成一个可以点开 / 暂停 / 切歌 / 关掉的小条；开不开在
 * 「功能 → 音乐」右上角的「悬浮窗」里选，偏好只存在这台设备（localStorage）。
 *
 * 顺带把 Media Session 接上：锁屏和通知栏能看到歌名，能播放 / 暂停 / 上一首 / 下一首。
 * 这是网页能做到的「后台播放」——真的出声，不是模拟。
 */
export function MusicMiniPlayer() {
  const room = useAppStore((s) => s.room)
  const screen = useAppStore((s) => s.screen)
  const push = useAppStore((s) => s.push)
  const mini = useUIStore((s) => s.musicMini)
  const [player, setPlayer] = useState<PlayerState>(() => playerState())

  useEffect(() => onPlayer(setPlayer), [])

  const current = room.tracks.find((t) => t.id === player.trackId)

  /* 锁屏 / 通知栏：歌名 + 播控（离开页面也有效） */
  const had = useRef(false)
  useEffect(() => {
    if (current) {
      had.current = true
      setMedia(
        { title: current.title, artist: current.artist || '一起听', artwork: coverArt(current) },
        {
          play: () => void play(),
          pause: () => pause(),
          next: () => jump(1),
          prev: () => jump(-1),
          stop: () => stop(),
        },
      )
      return
    }
    // 歌停了 / 删了：把锁屏信息收掉（但别误清通话那一条：只有之前确实有过音乐才清）
    if (had.current) {
      had.current = false
      clearMedia()
    }
  }, [current?.id, current?.title, current?.artist, current?.cover])

  useEffect(() => setMediaPlaying(player.playing), [player.playing])

  /* 正在房间里、或者关掉了悬浮窗、或者根本没在放 → 不占地方 */
  if (!mini || !current || screen === 'music-room') return null

  const progress = player.duration > 0 ? Math.min(1, player.position / player.duration) : 0
  const bottom = screen === 'home' ? 96 : 16

  return (
    <div
      className="absolute left-2 right-2 z-40 flex items-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-br from-[#5aa0e8] to-[#8fc4f8] py-2 pl-2 pr-1.5 text-white shadow-phone ring-1 ring-white/30"
      style={{ bottom: `calc(${bottom}px + env(safe-area-inset-bottom, 0px))` }}
    >
      {/* 进度条：一条细线，真的跟着播放走 */}
      <span className="absolute inset-x-0 top-0 h-0.5 bg-white/25">
        <span className="block h-full bg-white/85 transition-[width] duration-500" style={{ width: `${progress * 100}%` }} />
      </span>

      <button className="tap flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => push('music-room')} title="回到一起听">
        <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-black/25 text-[18px]">
          {coverArt(current) ? (
            <img src={coverArt(current)} alt="" className="h-full w-full object-cover" />
          ) : (
            current.cover || '🎵'
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{current.title}</span>
          <span className="block truncate text-[10px] opacity-90">
            {player.playing ? `${mmss(player.position)}${player.duration ? ` / ${mmss(player.duration)}` : ''}` : '已暂停'}
            {current.artist ? ` · ${current.artist}` : ''}
          </span>
        </span>
      </button>

      <button
        className="tap grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/20 text-[15px]"
        title={player.playing ? '暂停' : '播放'}
        onClick={() => (player.playing ? pause() : void play())}
      >
        {player.playing ? '⏸' : '▶'}
      </button>
      <button
        className="tap hidden h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15 text-[13px] min-[380px]:grid"
        title="下一首"
        onClick={() => jump(1)}
      >
        ⏭
      </button>
      <button
        className="tap grid h-8 w-8 shrink-0 place-items-center rounded-full text-[13px] text-white/85"
        title="关掉悬浮窗（停止播放）"
        onClick={() => stop()}
      >
        ✕
      </button>
    </div>
  )
}

function coverArt(t: Track): string {
  return t.cover && /^(https?:|data:|blob:)/.test(t.cover) ? t.cover : ''
}

/** 切歌：先落 currentId（房间界面同步），再真的播 */
function jump(dir: 1 | -1) {
  const st = useAppStore.getState()
  const from = playerState().trackId ?? st.room.currentId
  const t = neighbourTrack(st.room.tracks, from, dir)
  if (!t) return
  st.patchRoom({ currentId: t.id, position: 0 })
  void playTrack(t, 0)
}
