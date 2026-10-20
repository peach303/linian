import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { useChatStore } from '@/store/useChatStore'

/**
 * 「按住说话」（真的录）
 *
 * 用 MediaRecorder 录本机麦克风 → 音频转 dataURL 塞进消息 → 语音气泡点一下就能放。
 * 录音**只存在这台设备**（消息里内嵌 dataURL），不伪造、不静音占位：
 * 浏览器不支持 / 没给麦克风权限，就在下面直说，不会发出一条空语音。
 */

const MIN_MS = 400
const MAX_MS = 60_000

interface Rec {
  media: MediaRecorder
  chunks: Blob[]
  stream: MediaStream
  startedAt: number
  released: boolean
}

export function VoiceRecorderButton() {
  const sendVoice = useChatStore((s) => s.sendVoice)
  const [state, setState] = useState<'idle' | 'rec' | 'busy'>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [hint, setHint] = useState('')
  const ref = useRef<Rec | null>(null)
  const tick = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(
    () => () => {
      if (tick.current) clearInterval(tick.current)
      const rec = ref.current
      rec?.stream.getTracks().forEach((t) => t.stop())
    },
    [],
  )

  const start = async () => {
    if (ref.current || state !== 'idle') return
    setHint('')
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setHint('这个浏览器不支持录音')
      return
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setHint('没拿到麦克风权限 —— 在浏览器地址栏允许一下麦克风再试')
      return
    }

    const media = new MediaRecorder(stream)
    const chunks: Blob[] = []
    media.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data)
    }
    const rec: Rec = { media, chunks, stream, startedAt: Date.now(), released: false }
    ref.current = rec
    media.start(200)
    setState('rec')
    setElapsed(0)
    tick.current = setInterval(() => {
      const ms = Date.now() - rec.startedAt
      setElapsed(ms)
      if (ms >= MAX_MS) void stop(false) // 最长 60 秒，自动停
    }, 100)
    // 权限弹窗期间就松手了 → 立刻收尾
    if (rec.released) void stop(false)
  }

  const stop = async (cancel: boolean) => {
    const rec = ref.current
    if (!rec) {
      setState('idle')
      return
    }
    rec.released = true
    if (rec.media.state === 'inactive') return
    ref.current = null
    if (tick.current) {
      clearInterval(tick.current)
      tick.current = null
    }
    const ms = Date.now() - rec.startedAt
    setState('busy')

    rec.media.onstop = () => {
      rec.stream.getTracks().forEach((t) => t.stop())
      if (cancel) {
        setState('idle')
        return
      }
      if (ms < MIN_MS) {
        setState('idle')
        setHint('说话时间太短（按住说 0.4 秒以上）')
        return
      }
      void (async () => {
        const blob = new Blob(rec.chunks, { type: rec.media.mimeType || 'audio/webm' })
        if (!blob.size) {
          setState('idle')
          setHint('没录到声音 —— 检查一下麦克风')
          return
        }
        const url = await blobToDataUrl(blob)
        const durationMs = await readDuration(url, ms)
        sendVoice({ url, durationMs })
        setState('idle')
      })()
    }
    rec.media.stop()
  }

  const seconds = (elapsed / 1000).toFixed(1)

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <button
        className={clsx(
          'tap h-9 select-none rounded-md text-[14px] shadow-card',
          state === 'rec' ? 'bg-brand-soft text-brand-deep' : 'bg-surface text-ink-sub',
          state === 'busy' && 'opacity-60',
        )}
        onPointerDown={(e) => {
          // setPointerCapture 对合成事件 / 老浏览器可能抛错，别让它挡住录音
          try {
            e.currentTarget.setPointerCapture?.(e.pointerId)
          } catch {
            /* 拿不到指针捕获也无所谓：依然靠 pointerup / pointercancel 收尾 */
          }
          void start()
        }}
        onPointerUp={() => void stop(false)}
        onPointerCancel={() => void stop(true)}
        onContextMenu={(e) => e.preventDefault()}
      >
        {state === 'rec' ? `松开 发送 · ${seconds}″` : state === 'busy' ? '处理中…' : '按住 说话'}
      </button>
      {hint && <p className="mt-1 text-[11px] text-ink-faint">{hint}</p>}
    </div>
  )
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(blob)
  })
}

/** 真实时长（webm/opus 的 metadata 一般拿得到；拿不到就用按住的时间） */
function readDuration(url: string, fallbackMs: number): Promise<number> {
  return new Promise((resolve) => {
    const a = new Audio()
    a.preload = 'metadata'
    a.onloadedmetadata = () => resolve(Number.isFinite(a.duration) ? Math.round(a.duration * 1000) : fallbackMs)
    a.onerror = () => resolve(fallbackMs)
    a.src = url
  })
}
