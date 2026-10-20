/** 选本地图片 → dataURL（图片存在本机，不上传；同步后端时以 base64 传输） */
export interface PickOptions {
  /** 图片模块只收静态图；动图（GIF / APNG）请走「表情包」 */
  staticOnly?: boolean
  /** 单个文件大小上限，默认 8MB */
  maxBytes?: number
  onError?: (message: string) => void
}

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024

function isAnimatedStillImage(file: File) {
  return file.type === 'image/gif' || file.type === 'image/apng' || /\.(gif|apng)$/i.test(file.name)
}

function pickFile(
  accept: string,
  onPick: (dataUrl: string, file: File) => void,
  capture?: 'user' | 'environment',
  opts: PickOptions = {},
) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = accept
  // 手机上会直接调起相机；桌面浏览器会忽略它，仍走文件选择（所以界面别写「正在拍照」）
  if (capture) input.capture = capture
  input.onchange = () => {
    const f = input.files?.[0]
    if (!f) return

    if (opts.staticOnly && isAnimatedStillImage(f)) {
      opts.onError?.('图片模块只收静态图片；GIF / 动图请到「表情包」里上传。')
      return
    }

    const max = opts.maxBytes ?? DEFAULT_MAX_BYTES
    if (f.size > max) {
      opts.onError?.(`文件有点大（${(f.size / 1024 / 1024).toFixed(1)}MB），最大 ${(max / 1024 / 1024).toFixed(0)}MB。`)
      return
    }

    const reader = new FileReader()
    reader.onload = () => onPick(String(reader.result), f)
    reader.readAsDataURL(f)
  }
  input.click()
}

/** 静态图片：头像 / 背景 / 图片卡 / 发图片 */
export function pickImage(
  onPick: (dataUrl: string, file: File) => void,
  capture?: 'user' | 'environment',
  opts?: PickOptions,
) {
  // 所有走 pickImage 的地方都是静态图片模块：动图统一去「表情包」用 pickSticker
  pickFile('image/png,image/jpeg,image/webp,image/*', onPick, capture, {
    maxBytes: DEFAULT_MAX_BYTES,
    ...opts,
    staticOnly: true,
  })
}

/** 表情包：支持 GIF / APNG / 动态 WebP，也允许普通静态图当表情用 */
export function pickSticker(
  onPick: (dataUrl: string, file: File) => void,
  opts?: PickOptions,
) {
  pickFile('image/gif,image/webp,image/apng,image/*', onPick, undefined, {
    maxBytes: DEFAULT_MAX_BYTES,
    ...opts,
  })
}

/**
 * 把一张 dataURL 图压到最长边 `max`（默认 1400），转成 JPEG。
 * 用在朋友圈 / 信箱这种会把图片跟着 state 一起存的地方，避免几张手机原图就把空间吃满。
 * 已经很小（< 450KB）的图原样返回，不重复编码。
 */
export function shrinkImageDataUrl(dataUrl: string, max = 1400, quality = 0.84): Promise<string> {
  if (dataUrl.length < 450_000) return Promise.resolve(dataUrl)
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const scale = Math.min(1, max / Math.max(img.naturalWidth || 1, img.naturalHeight || 1))
        const w = Math.max(1, Math.round((img.naturalWidth || 1) * scale))
        const h = Math.max(1, Math.round((img.naturalHeight || 1) * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(dataUrl)
          return
        }
        // 透明 PNG 转 JPEG 会发黑，先铺白
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', quality))
      } catch {
        resolve(dataUrl)
      }
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

