import type { DoodlePayload, DoodleStroke } from '@/types'
import { rng } from './engine/seed'

/**
 * 涂鸦
 *
 * 存的是**笔画**（颜色 + 粗细 + 归一化坐标），不是 PNG —— 一张几百字节的 JSON，
 * 换设备同步得动，放大也不糊。
 */

export const DOODLE_COLORS = ['#4A90D9', '#E8744F', '#68C8BE', '#F498B4', '#333333']

const stroke = (color: string, width: number, points: [number, number][]): DoodleStroke => ({
  color,
  width,
  points,
})

/** 按参数方程描一笔（圆 / 心形 / 星星都能这么画） */
const curve = (
  fn: (t: number) => [number, number],
  steps: number,
  color: string,
  width: number,
): DoodleStroke => {
  const points: [number, number][] = []
  for (let i = 0; i <= steps; i++) points.push(fn(i / steps))
  return stroke(color, width, points)
}

const circle = (cx: number, cy: number, r: number, color: string, width = 3): DoodleStroke =>
  curve((t) => {
    const a = t * Math.PI * 2
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r * 1.0]
  }, 56, color, width)

const line = (x1: number, y1: number, x2: number, y2: number, color: string, width = 3): DoodleStroke =>
  stroke(color, width, [
    [x1, y1],
    [x2, y2],
  ])

/* ── 他会画给你的那几张（id 稳定 → 同一张卡永远画得一样） ── */

const heart = (): DoodleStroke[] => [
  curve(
    (t) => {
      const a = t * Math.PI * 2
      const x = 16 * Math.sin(a) ** 3
      const y = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)
      return [0.5 + x / 42, 0.5 - y / 42]
    },
    80,
    '#E8744F',
    3,
  ),
]

const cat = (): DoodleStroke[] => [
  circle(0.5, 0.56, 0.22, '#4A90D9'),
  // 两只耳朵
  line(0.33, 0.42, 0.28, 0.22, '#4A90D9'),
  line(0.28, 0.22, 0.44, 0.34, '#4A90D9'),
  line(0.67, 0.42, 0.72, 0.22, '#4A90D9'),
  line(0.72, 0.22, 0.56, 0.34, '#4A90D9'),
  // 眼睛 + 鼻子 + 胡须
  stroke('#333333', 3, [
    [0.42, 0.52],
    [0.42, 0.55],
  ]),
  stroke('#333333', 3, [
    [0.58, 0.52],
    [0.58, 0.55],
  ]),
  curve((t) => [0.5 + t * 0.06 - 0.03, 0.64 + Math.sin(t * Math.PI) * 0.02], 12, '#F498B4', 2),
  line(0.28, 0.6, 0.16, 0.57, '#68C8BE', 2),
  line(0.28, 0.65, 0.15, 0.68, '#68C8BE', 2),
  line(0.72, 0.6, 0.84, 0.57, '#68C8BE', 2),
  line(0.72, 0.65, 0.85, 0.68, '#68C8BE', 2),
]

const star = (): DoodleStroke[] => {
  const pts: [number, number][] = []
  for (let i = 0; i <= 10; i++) {
    const r = i % 2 === 0 ? 0.26 : 0.11
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    pts.push([0.5 + Math.cos(a) * r, 0.52 + Math.sin(a) * r])
  }
  return [stroke('#68C8BE', 3, pts)]
}

const smiley = (): DoodleStroke[] => [
  circle(0.5, 0.5, 0.24, '#333333'),
  stroke('#333333', 3, [
    [0.42, 0.44],
    [0.42, 0.46],
  ]),
  stroke('#333333', 3, [
    [0.58, 0.44],
    [0.58, 0.46],
  ]),
  curve((t) => [0.36 + t * 0.28, 0.58 + Math.sin(t * Math.PI) * 0.08], 24, '#333333', 3),
]

const flower = (): DoodleStroke[] => {
  const out: DoodleStroke[] = []
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 5
    out.push(circle(0.5 + Math.cos(a) * 0.14, 0.5 + Math.sin(a) * 0.14, 0.09, '#F498B4', 2))
  }
  out.push(circle(0.5, 0.5, 0.06, '#E8744F', 2))
  out.push(line(0.5, 0.62, 0.5, 0.84, '#4A90D9', 3))
  out.push(line(0.5, 0.72, 0.38, 0.66, '#4A90D9', 2))
  return out
}

/** 随手画的线：几笔不闭合的涂鸦，每一张都不一样（同 id 稳定） */
const scribble = (seed: string): DoodleStroke[] => {
  const random = rng(seed)
  const colors = ['#4A90D9', '#E8744F', '#68C8BE', '#F498B4']
  const out: DoodleStroke[] = []
  const count = 3 + Math.floor(random() * 3)
  for (let i = 0; i < count; i++) {
    const points: [number, number][] = []
    const startX = 0.16 + random() * 0.5
    const startY = 0.28 + random() * 0.42
    const len = 6 + Math.floor(random() * 8)
    for (let j = 0; j <= len; j++) {
      points.push([
        Math.max(0.08, Math.min(0.92, startX + (j / len) * (0.18 + random() * 0.36))),
        Math.max(0.08, Math.min(0.92, startY + Math.sin(j * 1.3 + i) * (0.03 + random() * 0.06))),
      ])
    }
    out.push(stroke(colors[Math.floor(random() * colors.length)], 2 + random() * 2, points))
  }
  return out
}

/** 一朵云 + 雨 */
const rain = (): DoodleStroke[] => [
  curve((t) => [0.2 + t * 0.24, 0.34 - Math.sin(t * Math.PI) * 0.1], 24, '#4A90D9', 2.5),
  curve((t) => [0.3 + t * 0.22, 0.26 + Math.sin(t * Math.PI) * 0.12], 24, '#4A90D9', 2.5),
  curve((t) => [0.46 + t * 0.22, 0.34 - Math.sin(t * Math.PI) * 0.08], 24, '#4A90D9', 2.5),
  line(0.2, 0.34, 0.66, 0.34, '#4A90D9', 2.5),
  line(0.3, 0.46, 0.26, 0.58, '#68C8BE', 2),
  line(0.44, 0.47, 0.4, 0.61, '#68C8BE', 2),
  line(0.58, 0.46, 0.54, 0.57, '#68C8BE', 2),
]

/** 月亮 + 两颗星星 */
const moon = (): DoodleStroke[] => [
  curve((t) => {
    const a = -Math.PI / 2 + t * Math.PI
    return [0.45 + Math.cos(a) * 0.24, 0.48 + Math.sin(a) * 0.24]
  }, 48, '#4A90D9', 3),
  curve((t) => {
    const a = -Math.PI / 2 + t * Math.PI
    return [0.37 + Math.cos(a) * 0.2, 0.48 + Math.sin(a) * 0.2]
  }, 48, '#4A90D9', 3),
  line(0.68, 0.28, 0.72, 0.34, '#F498B4', 2),
  line(0.72, 0.34, 0.78, 0.28, '#F498B4', 2),
  line(0.24, 0.28, 0.27, 0.33, '#68C8BE', 2),
  line(0.27, 0.33, 0.31, 0.28, '#68C8BE', 2),
]

/** 两个音符 */
const music = (): DoodleStroke[] => [
  stroke('#E8744F', 3, [
    [0.32, 0.62],
    [0.32, 0.34],
    [0.58, 0.28],
    [0.58, 0.56],
  ]),
  circle(0.26, 0.65, 0.08, '#E8744F', 3),
  circle(0.52, 0.59, 0.08, '#E8744F', 3),
  line(0.36, 0.34, 0.36, 0.45, '#4A90D9', 2),
  line(0.62, 0.28, 0.62, 0.4, '#4A90D9', 2),
]

/** 猫爪 */
const paw = (): DoodleStroke[] => [
  circle(0.5, 0.58, 0.16, '#F498B4', 2.5),
  circle(0.3, 0.38, 0.06, '#F498B4', 2),
  circle(0.43, 0.3, 0.06, '#F498B4', 2),
  circle(0.57, 0.3, 0.06, '#F498B4', 2),
  circle(0.7, 0.38, 0.06, '#F498B4', 2),
]

/** 螺旋 */
const spiral = (): DoodleStroke[] => {
  const pts: [number, number][] = []
  for (let i = 0; i <= 90; i++) {
    const t = (i / 90) * Math.PI * 4.6
    const r = 0.02 + (i / 90) * 0.24
    pts.push([0.5 + Math.cos(t) * r, 0.5 + Math.sin(t) * r])
  }
  return [stroke('#68C8BE', 2.5, pts)]
}

/** 星座：几个点连起来 */
const constellation = (): DoodleStroke[] => {
  const pts: [number, number][] = [
    [0.18, 0.62],
    [0.33, 0.36],
    [0.49, 0.52],
    [0.62, 0.28],
    [0.78, 0.46],
    [0.66, 0.68],
  ]
  return [
    stroke('#4A90D9', 1.5, pts),
    ...pts.map(([x, y]) => circle(x, y, 0.018, '#F498B4', 2)),
  ]
}

/** 一支穿过心的箭 */
const arrowHeart = (): DoodleStroke[] => [
  ...heart(),
  line(0.16, 0.7, 0.84, 0.34, '#4A90D9', 2.5),
  line(0.78, 0.3, 0.84, 0.34, '#4A90D9', 2.5),
  line(0.8, 0.42, 0.84, 0.34, '#4A90D9', 2.5),
]

export const HIS_DOODLES: { id: string; strokes: DoodleStroke[] }[] = [
  { id: 'heart', strokes: heart() },
  { id: 'cat', strokes: cat() },
  { id: 'star', strokes: star() },
  { id: 'smiley', strokes: smiley() },
  { id: 'flower', strokes: flower() },
  { id: 'rain', strokes: rain() },
  { id: 'moon', strokes: moon() },
  { id: 'music', strokes: music() },
  { id: 'paw', strokes: paw() },
  { id: 'spiral', strokes: spiral() },
  { id: 'constellation', strokes: constellation() },
  { id: 'arrow-heart', strokes: arrowHeart() },
  { id: 'scribble-1', strokes: scribble('scribble-1') },
  { id: 'scribble-2', strokes: scribble('scribble-2') },
  { id: 'scribble-3', strokes: scribble('scribble-3') },
  { id: 'scribble-4', strokes: scribble('scribble-4') },
]

/** 空画布（我画的时候用） */
export const emptyDoodle = (): DoodlePayload => ({ strokes: [], ratio: 4 / 3 })
