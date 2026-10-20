import { useRef, useState } from 'react'
import clsx from 'clsx'
import { DOODLE_COLORS } from '@/lib/doodles'
import { useChatStore } from '@/store/useChatStore'
import { useRulesStore } from '@/store/useRulesStore'
import { ExtendButton, ExtendHint } from './ui'
import type { DoodleStroke } from '@/types'

/** 画布宽高比（存进卡片，换设备也能按同一比例还原） */
const RATIO = 4 / 3
const WIDTHS = [2, 3, 5]

/** 涂鸦：手画一张递给他。存的是笔画，不是截图 */
export function DoodleForm() {
  const sendDoodle = useChatStore((s) => s.sendDoodle)
  const d = useRulesStore((s) => s.saved.doodle)

  const boxRef = useRef<HTMLDivElement>(null)
  const drawing = useRef(false)
  const [strokes, setStrokes] = useState<DoodleStroke[]>([])
  const [draft, setDraft] = useState<DoodleStroke | null>(null)
  const [color, setColor] = useState(DOODLE_COLORS[0])
  const [width, setWidth] = useState(WIDTHS[1])

  /** 指针位置 → 归一化坐标（0~1），跟画布大小无关 */
  const norm = (clientX: number, clientY: number): [number, number] => {
    const r = boxRef.current?.getBoundingClientRect()
    if (!r) return [0, 0]
    const clamp = (v: number) => Math.min(1, Math.max(0, v))
    return [clamp((clientX - r.left) / r.width), clamp((clientY - r.top) / r.height)]
  }

  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    // 某些环境（合成事件 / 触屏兼容）拿不到 pointer capture，画还是要能画
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* 忽略：不影响本机绘制 */
    }
    drawing.current = true
    const p = norm(e.clientX, e.clientY)
    setDraft({ color, width, points: [p, p] })
  }
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drawing.current) return
    const p = norm(e.clientX, e.clientY)
    setDraft((cur) => (cur ? { ...cur, points: [...cur.points, p] } : cur))
  }
  const up = () => {
    if (!drawing.current) return
    drawing.current = false
    if (draft && draft.points.length > 1) setStrokes((s) => [...s, draft])
    setDraft(null)
  }

  const shown = draft ? [...strokes, draft] : strokes

  const send = () => {
    if (!strokes.length) return
    sendDoodle({ strokes, ratio: RATIO })
    setStrokes([])
    setDraft(null)
  }

  return (
    <div className="space-y-2 pt-1">
      <div
        ref={boxRef}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        className="relative w-full touch-none overflow-hidden rounded-lg bg-[#FBFDFF] ring-1 ring-hairline"
        style={{ aspectRatio: String(RATIO) }}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          {shown.map((s, i) => (
            <polyline
              key={i}
              points={s.points.map(([x, y]) => `${(x * 100).toFixed(2)},${(y * 100).toFixed(2)}`).join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth={s.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {!shown.length && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-[12px] text-ink-faint">
            用手指 / 鼠标在这里画
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {DOODLE_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={clsx(
              'tap h-6 w-6 rounded-full ring-2',
              color === c ? 'ring-brand' : 'ring-white',
            )}
            style={{ background: c }}
            title={c}
          />
        ))}
        <span className="mx-1 h-4 w-px bg-hairline" />
        {WIDTHS.map((w) => (
          <button
            key={w}
            onClick={() => setWidth(w)}
            className={clsx('tap grid h-6 w-6 place-items-center rounded-full', width === w ? 'bg-brand-soft' : 'bg-surface')}
            title={`${w}px`}
          >
            <span className="rounded-full bg-ink" style={{ width: w + 2, height: w + 2 }} />
          </button>
        ))}
        <button
          className="tap ml-auto text-[12px] text-ink-sub"
          onClick={() => setStrokes((s) => s.slice(0, -1))}
        >
          撤销
        </button>
        <button className="tap text-[12px] text-ink-sub" onClick={() => setStrokes([])}>
          清空
        </button>
      </div>

      <div className="flex items-center gap-2">
        <ExtendHint>
          他回话 {Math.round(d.reply.p * 100)}% · 回画一张 {Math.round(d.drawBack.p * 100)}%
        </ExtendHint>
        <ExtendButton className="ml-auto" disabled={!strokes.length} onClick={send}>
          发这张涂鸦
        </ExtendButton>
      </div>

      <ExtendHint>存的是笔画（几百字节的 JSON），不是图片 —— 同步得动，放大也不糊。</ExtendHint>
    </div>
  )
}
