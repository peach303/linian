import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import type { Message } from '@/types'

/**
 * 语音气泡（可真的播出来）
 *
 * - 音频在 `payload.url` 里（MiniMax 合成后转成的 dataURL，或我按住说话录的 dataURL）——
 *   dataURL 跟着消息走，所以**换设备、清缓存也还听得到**。
 * - 没有音频的老占位消息：直接说「没能合成」，**不做假的播放动画**。
 * - 全局只允许一条语音在放（点了别的，前一条自己停）。
 */

interface Props {
  message: Message
  mine: boolean
  className?: string
  onContextMenu?: (e: React.MouseEvent) => void
}

/** 当前在放的那条（同一时刻只放一条） */
let active: HTMLAudioElement | null = null

export function VoiceBubble({ message, mine, className, onContextMenu }: Props) {
  const url = String(message.payload?.url ?? message.audioUrl ?? '')
  const [playing, setPlaying] = useState(false)
  const [showText, setShowText] = useState(false)
  const [failed, setFailed] = useState(false)
  const [ms, setMs] = useState(Number(message.audioDurationMs ?? message.payload?.durationMs ?? 0) || 0)
  const ref = useRef<HTMLAudioElement | null>(null)

  /** 卸载（切屏幕）时把自己停掉，别留个后台还在响 */
  useEffect(
    () => () => {
      const a = ref.current
      if (a && !a.paused) a.pause()
      if (active === a) active = null
    },
    [],
  )

  const toggle = () => {
    if (!url) return
    if (!ref.current) {
      const a = new Audio(url)
      a.onended = () => {
        setPlaying(false)
        if (active === a) active = null
      }
      a.onerror = () => {
        setFailed(true)
        setPlaying(false)
      }
      a.onloadedmetadata = () => {
        if (Number.isFinite(a.duration) && a.duration > 0) setMs(Math.round(a.duration * 1000))
      }
      ref.current = a
    }
    const a = ref.current
    if (a.paused) {
      // 同一时刻只放一条：把上一条按下暂停
      if (active && active !== a) active.pause()
      active = a
      void a
        .play()
        .then(() => setPlaying(true))
        .catch(() => {
          setFailed(true)
          setPlaying(false)
        })
    } else {
      a.pause()
      setPlaying(false)
    }
  }

  const seconds = ms > 0 ? Math.max(1, Math.round(ms / 1000)) : 0
  const width = Math.min(200, 62 + (ms > 0 ? Math.min(ms, 60_000) / 90 : 40))
  const text = message.text ?? String(message.payload?.text ?? '')

  return (
    <div className={clsx('animate-bubble-in flex flex-col', mine ? 'items-end' : 'items-start')}>
      <button
        onContextMenu={onContextMenu}
        onClick={toggle}
        disabled={!url}
        title={url ? '播放 / 暂停' : '这条没有音频'}
        className={clsx(className, 'flex items-center gap-2')}
        style={{ width }}
      >
        <span className={clsx('text-[15px]', mine && 'order-3')}>{mine ? '🔊' : '🔉'}</span>

        {/* 声波：播放时跳动 */}
        <span className={clsx('flex h-4 items-center gap-[3px]', mine && 'order-2')}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={clsx('block w-[3px] rounded-full', mine ? 'bg-bubble-ink/60' : 'bg-brand-deep/60')}
              style={{
                height: playing ? 14 : [8, 12, 6][i],
                animation: playing ? `voice-wave .9s ease-in-out ${i * 0.14}s infinite` : undefined,
              }}
            />
          ))}
        </span>

        <span
          className={clsx(
            'shrink-0 text-[12px] tabular-nums',
            mine ? 'order-1 mr-auto text-bubble-ink/80' : 'ml-auto text-ink-sub',
          )}
        >
          {url ? (seconds ? `${seconds}″` : '…') : '无音频'}
        </span>
      </button>

      {/* 转文字（他的语音才有；WeChat 的「转文字」那味儿） */}
      {!mine && !!text && url && (
        <button className="tap mt-0.5 text-[10px] text-ink-faint" onClick={() => setShowText((v) => !v)}>
          {showText ? '收起文字 ▴' : '转文字 ▾'}
        </button>
      )}
      {showText && <div className="mt-1 max-w-[220px] text-[12px] leading-snug text-ink-sub">{text}</div>}

      {failed && <div className="mt-0.5 text-[10px] text-ink-faint">这条音频播不出来</div>}
      {/* 合成的语音才标来源（我自己录的那条 via='local'，不用写） */}
      {!!message.payload?.via && message.payload.via !== 'local' && (
        <div className="mt-0.5 text-[10px] leading-none text-brand-deep">
          {String(message.payload.via)}
          {message.payload.voiceId ? ` · ${String(message.payload.voiceId)}` : ''}
        </div>
      )}
    </div>
  )
}
