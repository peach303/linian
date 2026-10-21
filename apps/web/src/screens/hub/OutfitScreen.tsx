import { useMemo, useRef, useState } from 'react'
import { NavBar } from '@/components/common/NavBar'
import { Avatar } from '@/components/common/Avatar'
import { outfitOfDay, outfitPieces, outfitSummary, SLOT_LABEL, type OutfitSlot } from '@/lib/outfit'
import { useAppStore } from '@/store/useAppStore'
import { useViewerStore } from '@/store/useViewerStore'

/**
 * 他今天的穿搭（功能 → 穿搭）
 *
 * 同一套衣服按日期固定：今天进来和晚上进来看到的是同一身，不会刷一次换一件。
 * 想多看几套可以点「再搭一套」，那只是预览，不会改掉今天的。
 *
 * 衣服按「外套 / 上衣 / 下衣 / 配饰 / 鞋子」分类；每一类可以导入多张照片，
 * 每天从这一类的照片里随机挑一张搭配。照片只留在这台设备（localStorage），不会上传。
 */

const PHOTO_KEY = 'linian:outfit:photos:v2'
const OLD_PHOTO_KEY = 'linian:outfit:photos:v1'
const WEEK = ['日', '一', '二', '三', '四', '五', '六']
const SLOTS: OutfitSlot[] = ['outer', 'top', 'bottom', 'accessory', 'shoes']
const MAX_PER_SLOT = 12

const emptyPhotos = (): Record<OutfitSlot, string[]> => ({
  outer: [],
  top: [],
  bottom: [],
  accessory: [],
  shoes: [],
})

function loadPhotos(): Record<OutfitSlot, string[]> {
  const out = emptyPhotos()
  try {
    const raw = JSON.parse(localStorage.getItem(PHOTO_KEY) ?? 'null') as unknown
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const slot of SLOTS) {
        const value = (raw as Record<string, unknown>)[slot]
        if (Array.isArray(value)) out[slot] = value.filter((x): x is string => typeof x === 'string' && x.startsWith('data:image/'))
      }
      return out
    }

    // 旧版：一张单品 id 对应一张图（outer_cardigan → 外套）
    const old = JSON.parse(localStorage.getItem(OLD_PHOTO_KEY) ?? '{}') as unknown
    if (old && typeof old === 'object' && !Array.isArray(old)) {
      for (const [id, value] of Object.entries(old as Record<string, unknown>)) {
        if (typeof value !== 'string' || !value.startsWith('data:image/')) continue
        const slot = SLOTS.find((s) => id.startsWith(`${s}_`))
        if (slot) out[slot].push(value)
      }
    }
  } catch {
    /* 读不到就当没有 */
  }
  return out
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

/** 照片压到最长边 480，避免十几张图就把本地空间塞满 */
async function shrinkPhoto(dataUrl: string, rawBytes: number): Promise<string> {
  if (rawBytes <= 120 * 1024) return dataUrl
  const img = await loadImg(dataUrl)
  const max = 480
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
  return canvas.toDataURL('image/jpeg', 0.76)
}

/** 按日期 + 预览轮次稳定地从这一类的照片里挑一张 */
function pickPhoto(list: string[], seed: string): string | undefined {
  if (!list.length) return undefined
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return list[(h >>> 0) % list.length]
}

export function OutfitScreen() {
  const dream = useAppStore((s) => s.dream)
  const openImage = useViewerStore((s) => s.openImage)
  const [preview, setPreview] = useState(0)
  const [photos, setPhotos] = useState<Record<OutfitSlot, string[]>>(loadPhotos)
  const [busySlot, setBusySlot] = useState<OutfitSlot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const pickSlotRef = useRef<OutfitSlot>('outer')

  const outfit = useMemo(() => outfitOfDay(new Date(), preview ? `preview-${preview}` : ''), [preview])
  const pieces = outfitPieces(outfit)
  const today = new Date()
  const dateLabel = `${today.getMonth() + 1}月${today.getDate()}日 · 星期${WEEK[today.getDay()]}`
  const salt = `${outfit.dateKey}:${preview}`

  const chosen = useMemo(() => {
    const out: Partial<Record<OutfitSlot, string>> = {}
    for (const slot of SLOTS) out[slot] = pickPhoto(photos[slot], `${salt}:${slot}`)
    return out
  }, [photos, salt])

  const save = (next: Record<OutfitSlot, string[]>) => {
    try {
      localStorage.setItem(PHOTO_KEY, JSON.stringify(next))
    } catch {
      setError('本地空间不够了，照片已经先显示出来；建议删掉几张不常用的再试。')
    }
    setPhotos(next)
  }

  const openPicker = (slot: OutfitSlot) => {
    pickSlotRef.current = slot
    fileRef.current?.click()
  }

  async function addPhotos(files: FileList | null) {
    const slot = pickSlotRef.current
    const list = Array.from(files ?? [])
    if (!list.length) return
    setError(null)
    setBusySlot(slot)
    const next = [...photos[slot]]
    let skipped = 0
    for (const f of list) {
      if (!f.type.startsWith('image/') || /\.(gif|apng)$/i.test(f.name) || f.type === 'image/gif' || f.size > 12 * 1024 * 1024) {
        skipped++
        continue
      }
      try {
        const url = await shrinkPhoto(await readAsDataUrl(f), f.size)
        if (!next.includes(url)) next.push(url)
      } catch {
        skipped++
      }
    }
    save({ ...photos, [slot]: next.slice(-MAX_PER_SLOT) })
    setBusySlot(null)
    if (skipped) setError(`有 ${skipped} 张不是静态图片或太大了，跳过了。`)
  }

  const removePhoto = (slot: OutfitSlot, url: string) => {
    save({ ...photos, [slot]: photos[slot].filter((x) => x !== url) })
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-page">
      <NavBar title="今日穿搭" />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => void addPhotos(e.target.files)}
      />

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

        {/* 分类照片库 + 今日搭配 */}
        <div className="mt-3 space-y-2.5">
          {pieces.map((piece) => {
            const list = photos[piece.slot]
            const photo = chosen[piece.slot]
            return (
              <section key={piece.slot} className="rounded-2xl bg-surface p-3 shadow-card">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="tap relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl ring-1 ring-hairline"
                    style={{ background: `${piece.color}26` }}
                    onClick={photo ? () => openImage(photo, piece.label) : undefined}
                    aria-label={photo ? `查看${SLOT_LABEL[piece.slot]}照片` : SLOT_LABEL[piece.slot]}
                  >
                    {photo ? (
                      <img src={photo} alt={piece.label} className="h-full w-full object-cover" draggable={false} />
                    ) : (
                      <span className="grid h-full w-full place-items-center text-[32px]">{piece.emoji}</span>
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
                      {list.length > 0 && (
                        <span className="rounded-full bg-brand/10 px-1.5 py-0.5 text-[9px] text-brand-deep">
                          {list.length} 张 · 每天随机
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-[14px] font-medium text-ink">{piece.label}</div>
                    <div className="mt-0.5 truncate text-[11px] text-ink-sub">{piece.detail}</div>
                    <button
                      type="button"
                      className="tap mt-1.5 rounded-full bg-page px-2.5 py-1 text-[10px] text-ink-sub ring-1 ring-hairline"
                      disabled={busySlot === piece.slot}
                      onClick={() => openPicker(piece.slot)}
                    >
                      {busySlot === piece.slot ? '处理中…' : `＋ 加${SLOT_LABEL[piece.slot]}照片（可多选）`}
                    </button>
                  </div>
                </div>

                {list.length > 0 && (
                  <div className="no-scrollbar mt-2.5 flex gap-2 overflow-x-auto pb-0.5">
                    {list.map((url, i) => {
                      const active = url === photo
                      return (
                        <div key={`${url.slice(-24)}-${i}`} className="relative shrink-0">
                          <button
                            type="button"
                            className={`tap block h-14 w-14 overflow-hidden rounded-xl ring-2 ${
                              active ? 'ring-brand' : 'ring-transparent'
                            }`}
                            onClick={() => openImage(url, `${SLOT_LABEL[piece.slot]}照片`)}
                            title={active ? '今天选的是这张' : '看大图'}
                          >
                            <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />
                          </button>
                          {active && (
                            <span className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-xl bg-brand/75 py-0.5 text-center text-[8px] text-white">
                              今天
                            </span>
                          )}
                          <button
                            type="button"
                            className="tap absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-black/50 text-[9px] text-white"
                            title="从这一类里删掉"
                            onClick={() => removePhoto(piece.slot, url)}
                          >
                            ✕
                          </button>
                        </div>
                      )
                    })}
                    <button
                      type="button"
                      className="tap grid h-14 w-14 shrink-0 place-items-center rounded-xl border border-dashed border-brand-soft text-[18px] text-brand-deep"
                      onClick={() => openPicker(piece.slot)}
                      title="继续加照片"
                    >
                      ＋
                    </button>
                  </div>
                )}
              </section>
            )
          })}
        </div>

        {/* 预览 / 说明 */}
        <div className="mt-3 rounded-2xl bg-white/70 p-3 text-[11px] leading-relaxed text-ink-sub shadow-card">
          <p>同一天进来会是同一套，晚上也不会换掉。每天会从每个分类导入的照片里随机挑一张来搭。</p>
          <p className="mt-1 text-ink-faint">照片只存在这台设备上，不会上传；换设备需要重新导入。</p>
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
