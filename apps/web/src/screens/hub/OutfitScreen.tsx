import { useMemo, useState } from 'react'
import { NavBar } from '@/components/common/NavBar'
import { Avatar } from '@/components/common/Avatar'
import { pickImage } from '@/lib/file'
import { outfitOfDay, outfitPieces, outfitSummary, SLOT_LABEL, type OutfitPiece } from '@/lib/outfit'
import { useAppStore } from '@/store/useAppStore'
import { useViewerStore } from '@/store/useViewerStore'

/**
 * 他今天的穿搭（功能 → 穿搭）
 *
 * 同一套衣服按日期固定：今天进来和晚上进来看到的是同一身，不会刷一次换一件。
 * 想多看几套可以点「再搭一套」，那只是预览，不会改掉今天的。
 *
 * 衣服本身先做文字 + emoji + 颜色；每件都可以换成你本机的一张照片。
 * 照片只留在这台设备（localStorage），不会上传，也不会进聊天记录。
 */

const PHOTO_KEY = 'linian:outfit:photos:v1'
const WEEK = ['日', '一', '二', '三', '四', '五', '六']

function loadPhotos(): Record<string, string> {
  try {
    const raw = JSON.parse(localStorage.getItem(PHOTO_KEY) ?? '{}') as unknown
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === 'string' && v.startsWith('data:image/')) out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = src
  })
}

/** 照片压到最长边 640，避免几张图就把本地空间塞满 */
async function shrinkPhoto(dataUrl: string, rawBytes: number): Promise<string> {
  if (rawBytes <= 220 * 1024) return dataUrl
  const img = await loadImg(dataUrl)
  const max = 640
  const scale = Math.min(1, max / Math.max(img.naturalWidth || 1, img.naturalHeight || 1))
  const w = Math.max(1, Math.round((img.naturalWidth || 1) * scale))
  const h = Math.max(1, Math.round((img.naturalHeight || 1) * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl
  // 透明 PNG 转 JPEG 会发黑，先铺一层白
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', 0.82)
}

export function OutfitScreen() {
  const dream = useAppStore((s) => s.dream)
  const openImage = useViewerStore((s) => s.openImage)
  const [preview, setPreview] = useState(0)
  const [photos, setPhotos] = useState<Record<string, string>>(loadPhotos)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const outfit = useMemo(() => outfitOfDay(new Date(), preview ? `preview-${preview}` : ''), [preview])
  const pieces = outfitPieces(outfit)
  const today = new Date()
  const dateLabel = `${today.getMonth() + 1}月${today.getDate()}日 · 星期${WEEK[today.getDay()]}`

  const choosePhoto = (piece: OutfitPiece) => {
    setError(null)
    pickImage(
      async (dataUrl, file) => {
        setBusyId(piece.id)
        try {
          const small = await shrinkPhoto(dataUrl, file.size)
          const next = { ...photos, [piece.id]: small }
          localStorage.setItem(PHOTO_KEY, JSON.stringify(next))
          setPhotos(next)
        } catch {
          setError('这张照片没能存进去，换一张小一点的试试。')
        } finally {
          setBusyId(null)
        }
      },
      undefined,
      {
        staticOnly: true,
        maxBytes: 12 * 1024 * 1024,
        onError: (message) => setError(message),
      },
    )
  }

  const removePhoto = (piece: OutfitPiece) => {
    const next = { ...photos }
    delete next[piece.id]
    try {
      localStorage.setItem(PHOTO_KEY, JSON.stringify(next))
    } catch {
      /* 写不进去也不影响这次撤下 */
    }
    setPhotos(next)
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-page">
      <NavBar title="今日穿搭" />

      <div className="no-scrollbar flex-1 overflow-y-auto px-3 pb-8 pt-3">
        {/* 今天这一身 */}
        <section className="relative overflow-hidden rounded-[22px] bg-gradient-to-br from-[#f7e9dd] via-[#f4f0e9] to-[#dce9f7] p-4 shadow-card">
          <span className="pointer-events-none absolute -right-6 -top-8 h-28 w-28 rounded-full bg-white/35" />
          <span className="pointer-events-none absolute -bottom-10 left-10 h-24 w-24 rounded-full bg-white/20" />

          <div className="relative flex items-center gap-3">
            <Avatar src={dream.avatarUrl} name={dream.nickname} size={50} ring />
            <div className="min-w-0">
              <div className="text-[12px] text-ink-sub">今天 · {dateLabel}</div>
              <div className="mt-0.5 truncate text-[17px] font-medium text-ink">{dream.nickname}的穿搭</div>
              <div className="mt-1 inline-flex rounded-full bg-white/60 px-2 py-0.5 text-[10px] text-ink-sub">
                {outfit.style}
              </div>
            </div>
          </div>

          <p className="relative mt-3 text-[13px] leading-relaxed text-ink">{outfit.note}</p>
          <p className="relative mt-1.5 text-[11px] leading-relaxed text-ink-sub">{outfitSummary(outfit, dream)}</p>
        </section>

        {error && (
          <p className="mt-2 rounded-xl bg-[#fff3f0] px-3 py-2 text-[11px] leading-relaxed text-[#c05a48]">{error}</p>
        )}

        {/* 单品 */}
        <div className="mt-3 space-y-2">
          {pieces.map((piece) => {
            const photo = photos[piece.id]
            return (
              <section key={piece.id} className="flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-card">
                <button
                  type="button"
                  className="tap relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl"
                  style={{ background: `${piece.color}26` }}
                  onClick={photo ? () => openImage(photo, piece.label) : undefined}
                  aria-label={photo ? `查看${piece.label}照片` : piece.label}
                >
                  {photo ? (
                    <img src={photo} alt={piece.label} className="h-full w-full object-cover" draggable={false} />
                  ) : (
                    <span className="grid h-full w-full place-items-center text-[30px]">{piece.emoji}</span>
                  )}
                  {photo && (
                    <span className="absolute bottom-1 right-1 rounded-full bg-black/35 px-1.5 py-0.5 text-[8px] text-white">
                      看大图
                    </span>
                  )}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-ink-faint">{SLOT_LABEL[piece.slot]}</span>
                    <span
                      className="h-2.5 w-2.5 rounded-full ring-1 ring-black/5"
                      style={{ background: piece.color }}
                      aria-hidden
                    />
                  </div>
                  <div className="mt-0.5 truncate text-[14px] font-medium text-ink">{piece.label}</div>
                  <div className="mt-0.5 truncate text-[11px] text-ink-sub">{piece.detail}</div>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  <button
                    type="button"
                    className="tap rounded-full bg-page px-2.5 py-1 text-[10px] text-ink-sub"
                    disabled={busyId === piece.id}
                    onClick={() => choosePhoto(piece)}
                  >
                    {busyId === piece.id ? '处理中…' : photo ? '换照片' : '配图'}
                  </button>
                  {photo && (
                    <button
                      type="button"
                      className="tap px-1.5 py-0.5 text-[10px] text-ink-faint"
                      onClick={() => removePhoto(piece)}
                    >
                      撤下
                    </button>
                  )}
                </div>
              </section>
            )
          })}
        </div>

        {/* 预览 / 说明 */}
        <div className="mt-3 rounded-2xl bg-white/70 p-3 text-[11px] leading-relaxed text-ink-sub shadow-card">
          <p>同一天进来会是同一套，晚上也不会换掉。想多看几套，可以点下面「再搭一套」。</p>
          <p className="mt-1 text-ink-faint">照片只存在这台设备上，不会上传；换设备需要重新配。</p>
        </div>

        <button
          type="button"
          className="tap mt-3 w-full rounded-2xl bg-surface py-3 text-[13px] font-medium text-ink shadow-card"
          onClick={() => setPreview((n) => n + 1)}
        >
          再搭一套看看
        </button>
        {preview > 0 && (
          <button
            type="button"
            className="tap mt-2 w-full py-2 text-[12px] text-ink-faint"
            onClick={() => setPreview(0)}
          >
            回到今天这一套
          </button>
        )}
      </div>
    </div>
  )
}
