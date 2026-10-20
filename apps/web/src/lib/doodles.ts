import type { DoodlePayload, DoodleStroke } from '@/types'

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

export const HIS_DOODLES: { id: string; strokes: DoodleStroke[] }[] = [
  { id: 'heart', strokes: heart() },
  { id: 'cat', strokes: cat() },
  { id: 'star', strokes: star() },
  { id: 'smiley', strokes: smiley() },
  { id: 'flower', strokes: flower() },
]

/** 空画布（我画的时候用） */
export const emptyDoodle = (): DoodlePayload => ({ strokes: [], ratio: 4 / 3 })
