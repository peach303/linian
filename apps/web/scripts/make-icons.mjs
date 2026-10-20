/**
 * 生成 PWA 图标（`public/icons/*.png`）—— 零依赖，自己写 PNG 编码器
 *
 * 为什么要自己画：装到手机桌面时需要一个真图标，而这个仓库里只有 `mock/me.png` / `mock/dream.png`
 * 两张占位头像。图标是「蓝底 + 白色对话气泡 + 三个点」，和 App 的浅蓝 + 白、字卡传讯的形态一致；
 * 画法留在代码里，将来想换配色/换形状直接改这里再跑一次即可（不用去找设计稿）。
 *
 *   跑法：node apps/web/scripts/make-icons.mjs
 *
 * 说明：
 *   · 普通图标（192 / 512 / apple-touch 180）—— 满幅，交给系统自己去切圆角；
 *   · maskable 图标（512）—— 内容缩到中间 62%，因为 Android 会按各种形状裁切（圆形/方形/泪滴），
 *     缩进去才不会把气泡裁掉。
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')

/* ── 最小 PNG 编码器（RGBA8） ── */
const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()
const crc32 = (buf) => {
  let c = ~0
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return ~c >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
function encodePng(w, h, rgba) {
  const stride = w * 4
  const raw = Buffer.alloc((stride + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: truecolor + alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ── 形状：有向距离场（<0 表示在里面） ── */
const sdRoundRect = (px, py, cx, cy, hw, hh, r) => {
  const qx = Math.abs(px - cx) - hw + r
  const qy = Math.abs(py - cy) - hh + r
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r
}
const sdCircle = (px, py, cx, cy, r) => Math.hypot(px - cx, py - cy) - r

/** 混色（a 覆盖在 b 上，a 的 alpha 固定 1 —— 用超采样抗锯齿） */
const mix = (b, f, k) => b + (f - b) * k

/**
 * @param {number} size   输出边长（px）
 * @param {number} inset  内容从边缘缩进的比例（0.14 普通 / 0.26 maskable）
 */
function draw(size, inset) {
  const SS = 4 // 每像素 4×4 超采样
  const out = Buffer.alloc(size * size * 4)
  const cx = 0.5
  const cy = 0.5
  const half = 0.5 - inset
  const bw = half * 0.86 // 气泡半宽
  const bh = half * 0.62 // 气泡半高
  const dotR = half * 0.085
  const dotGap = half * 0.34

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let R = 0
      let G = 0
      let B = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size
          const v = (y + (sy + 0.5) / SS) / size
          /* 底：竖向渐变 #7CB3F5 → #3C7FD4 */
          let r = 0x7c + (0x3c - 0x7c) * v
          let g = 0xb3 + (0x7f - 0xb3) * v
          let b = 0xf5 + (0xd4 - 0xf5) * v
          /* 白色气泡 */
          if (sdRoundRect(u, v, cx, cy, bw, bh, bh * 0.52) < 0) {
            r = 0xff
            g = 0xff
            b = 0xff
            /* 气泡里的三个蓝点 */
            for (const k of [-1, 0, 1]) {
              if (sdCircle(u, v, cx + k * dotGap, cy, dotR) < 0) {
                r = 0x4a
                g = 0x92
                b = 0xe0
              }
            }
          }
          R += r
          G += g
          B += b
        }
      }
      const n = SS * SS
      const i = (y * size + x) * 4
      out[i] = Math.round(R / n)
      out[i + 1] = Math.round(G / n)
      out[i + 2] = Math.round(B / n)
      out[i + 3] = 255
    }
  }
  return encodePng(size, size, out)
}

/* ── 产出 ── */
mkdirSync(OUT_DIR, { recursive: true })
const jobs = [
  ['icon-192.png', 192, 0.14],
  ['icon-512.png', 512, 0.14],
  ['apple-touch-icon-180.png', 180, 0.14],
  ['icon-maskable-512.png', 512, 0.26],
]
for (const [name, size, inset] of jobs) {
  const buf = draw(size, inset)
  const file = join(OUT_DIR, name)
  writeFileSync(file, buf)
  console.log(`${name}  ${size}×${size}  ${(statSync(file).size / 1024).toFixed(1)} KB`)
}
console.log(`\n写到：${OUT_DIR}`)
