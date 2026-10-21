import { useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'

/**
 * 让右下角的小窗可以拖。
 *
 * 用 transform 偏移，不改变原来的 right/bottom 布局；拖动阈值 4px，
 * 超过阈值才把「点击」吞掉，所以点一下展开 / 点按钮仍然正常。
 */
export function useFloatingDrag() {
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const drag = useRef<{
    id: number
    x: number
    y: number
    ox: number
    oy: number
    moved: boolean
    minX: number
    maxX: number
    minY: number
    maxY: number
  } | null>(null)
  const swallowClick = useRef(false)

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    const parent = e.currentTarget.parentElement
    const self = e.currentTarget.getBoundingClientRect()
    const box = parent?.getBoundingClientRect()
    const pw = box?.width || window.innerWidth
    const ph = box?.height || window.innerHeight
    const left = self.left - (box?.left ?? 0) - offset.x
    const top = self.top - (box?.top ?? 0) - offset.y
    drag.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      ox: offset.x,
      oy: offset.y,
      moved: false,
      // 拖动后仍然整块留在父容器里（四周留 8px），不会滑出屏幕
      minX: 8 - left,
      maxX: pw - self.width - 8 - left,
      minY: 8 - top,
      maxY: ph - self.height - 8 - top,
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* 某些浏览器不允许捕获，也不影响拖动 */
    }
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) > 4) d.moved = true
    if (!d.moved) return
    swallowClick.current = true
    setOffset({
      x: clamp(d.ox + dx, Math.min(d.minX, d.maxX), Math.max(d.minX, d.maxX)),
      y: clamp(d.oy + dy, Math.min(d.minY, d.maxY), Math.max(d.minY, d.maxY)),
    })
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current
    if (d?.id === e.pointerId) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* 已经释放了 */
      }
    }
    drag.current = null
    // 点击事件在 pointerup 之后才到，下一帧再恢复
    window.setTimeout(() => {
      swallowClick.current = false
    }, 0)
  }

  const onClickCapture = (e: ReactMouseEvent) => {
    if (!swallowClick.current) return
    e.preventDefault()
    e.stopPropagation()
    swallowClick.current = false
  }

  return {
    offset,
    style: { transform: `translate(${offset.x}px, ${offset.y}px)`, touchAction: 'none' as const },
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onClickCapture,
    },
  }
}
