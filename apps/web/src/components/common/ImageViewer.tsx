import { useEffect } from 'react'
import { useViewerStore } from '@/store/useViewerStore'

/**
 * 全屏图片 / 涂鸦预览。
 * 放在 App 最外层：不管当前在聊天、朋友圈还是信箱，点开都能盖住整屏。
 */
export function ImageViewer() {
  const item = useViewerStore((s) => s.item)
  const close = useViewerStore((s) => s.close)

  useEffect(() => {
    if (!item) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [item, close])

  if (!item) return null

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 p-3 backdrop-blur-sm"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label={item.kind === 'doodle' ? '涂鸦预览' : '图片预览'}
    >
      <button
        className="absolute right-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-full bg-white/15 text-[22px] leading-none text-white backdrop-blur"
        onClick={(e) => {
          e.stopPropagation()
          close()
        }}
        aria-label="关闭"
      >
        ✕
      </button>

      {item.kind === 'image' ? (
        <img
          src={item.src}
          alt={item.alt ?? '图片'}
          draggable={false}
          onClick={(e) => e.stopPropagation()}
          className="max-h-[92vh] max-w-[96vw] rounded-lg object-contain shadow-2xl"
        />
      ) : (
        <div
          className="rounded-2xl bg-[#FBFDFF] p-2 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          style={{ width: `min(94vw, ${Math.round(84 * (item.ratio ?? 4 / 3))}vh)` }}
        >
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="block w-full rounded-lg"
            style={{ aspectRatio: String(item.ratio ?? 4 / 3) }}
          >
            {(item.strokes ?? []).map((s, i) => (
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
        </div>
      )}

      <p className="absolute bottom-5 left-0 right-0 text-center text-[11px] text-white/60">
        点空白处关闭
      </p>
    </div>
  )
}
