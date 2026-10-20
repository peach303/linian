/**
 * 带种子的伪随机（用于「他的行为」抽签）
 *
 * 为什么不用 Math.random：朋友圈点赞 / 评论 / 回信这些事件的「掷没掷中」「延迟多久」
 * 必须**可复现** —— 每次刷新、重新排程都用同一个种子（通常是他这条动态/我这封信的 id），
 * 否则刷新一次就多掷一次，等于把概率悄悄放大了。内容是选句，用 Math.random 无所谓。
 */

/** FNV-1a 变体：字符串 → 32 位整数 */
export function hash32(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** mulberry32：同一个种子给同一串随机数 */
export function rng(seed: string): () => number {
  let a = hash32(seed)
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 用种子掷一次概率：命中返回 true */
export const seededHit = (seed: string, p: number) => rng(seed)() < Math.max(0, Math.min(1, p))

/** 用种子在 [min,max] 里取一个数（seed 不同结果不同，同 seed 恒定） */
export const seededRange = (seed: string, range: [number, number]) =>
  range[0] + rng(seed)() * Math.max(0, range[1] - range[0])

/** 用种子从数组里挑一个 */
export const seededPick = <T>(arr: T[], seed: string): T | undefined =>
  arr.length ? arr[Math.floor(rng(seed)() * arr.length) % arr.length] : undefined

/** 普通随机挑一个（内容选句用） */
export const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]
