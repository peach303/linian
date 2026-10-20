/** 美化：预设资源 + 应用到 DOM（CSS 变量 / data 属性） */
import type { Appearance, BackgroundValue } from '@/types/appearance'

/* ───────────────────────── 预设 ───────────────────────── */

export const HOME_BG_PRESETS: { key: string; label: string; css: string }[] = [
  { key: 'linian-blue', label: '黎念蓝', css: 'linear-gradient(180deg,#dcecff 0%,#eaf4ff 45%,#f7fbff 100%)' },
  { key: 'mist', label: '雾', css: 'linear-gradient(180deg,#e6eef7 0%,#f5f9fd 100%)' },
  { key: 'sakura', label: '樱', css: 'linear-gradient(180deg,#ffe6ef 0%,#fff8fb 100%)' },
  { key: 'mint', label: '薄荷', css: 'linear-gradient(180deg,#e0f6f2 0%,#f7fffd 100%)' },
  { key: 'sunset', label: '晚霞', css: 'linear-gradient(180deg,#ffdfe0 0%,#e8e4ff 55%,#f6f8ff 100%)' },
  { key: 'night', label: '夜色', css: 'linear-gradient(180deg,#1b2438 0%,#2a324a 100%)' },
  { key: 'paper', label: '米白', css: 'linear-gradient(180deg,#f6f2ea 0%,#fdfbf7 100%)' },
]

export const CHAT_BG_PRESETS: { key: string; label: string; css: string }[] = [
  { key: 'plain', label: '默认', css: '' },
  { key: 'soft-blue', label: '浅蓝', css: 'linear-gradient(180deg,#eaf3ff 0%,#f7fbff 100%)' },
  { key: 'grid', label: '格纹', css: 'repeating-linear-gradient(45deg,#f2f7fd 0 10px,#fafcff 10px 20px)' },
  { key: 'dots', label: '波点', css: 'radial-gradient(#e6eef8 1.6px, transparent 1.6px) 0 0 / 18px 18px, #fbfdff' },
  { key: 'peach', label: '蜜桃', css: 'linear-gradient(180deg,#ffeee6 0%,#fff9f6 100%)' },
  { key: 'night', label: '夜色', css: 'linear-gradient(180deg,#1c2436 0%,#26314a 100%)' },
]

export const BUBBLE_PRESETS: { key: string; label: string; me: string; peer: string; ink: string }[] = [
  { key: 'wechat-blue', label: '黎念蓝', me: '#a8d4ff', peer: '#ffffff', ink: '#1a2430' },
  { key: 'wechat-green', label: '微信绿', me: '#95ec69', peer: '#ffffff', ink: '#1a2430' },
  { key: 'mist', label: '雾霾蓝', me: '#b0c6de', peer: '#ffffff', ink: '#1a2430' },
  { key: 'sakura', label: '樱粉', me: '#ffc8da', peer: '#ffffff', ink: '#3a2028' },
  { key: 'mint', label: '薄荷', me: '#aae2dc', peer: '#ffffff', ink: '#123033' },
  { key: 'night', label: '夜间', me: '#366098', peer: '#202a3d', ink: '#eaf1fa' },
]

export const ICON_PRESETS = ['🫧', '💬', '🐧', '🌙', '🌸', '🎐', '💙', '🍥', '📮', '☁️', '🐚', '🎀']
export const FRAME_PRESETS = ['🖼️', '🩵', '🌠', '🍃', '🎞️', '💎']

export function bgCss(bg: BackgroundValue): string {
  if (bg.mode === 'color') return bg.value
  if (bg.mode === 'image') return bg.value ? `url("${bg.value}") center/cover no-repeat` : ''
  const found = [...HOME_BG_PRESETS, ...CHAT_BG_PRESETS].find((x) => x.key === bg.value)
  return found?.css ?? ''
}

/* ───────────────────────── 应用 ───────────────────────── */

/** '#a8d4ff' → '168 212 255'（Tailwind 的 CSS 变量格式） */
export function hexToRgb(hex: string): string {
  const h = hex.replace('#', '').trim()
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = Number.parseInt(full || '000000', 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `${r} ${g} ${b}`
}

/** 气泡配色写进 CSS 变量；尾巴开关写 data 属性；圆角写变量 */
export function applyAppearance(a: Appearance) {
  const root = document.documentElement
  root.style.setProperty('--ln-bubble-me', hexToRgb(a.bubble.me))
  root.style.setProperty('--ln-bubble-peer', hexToRgb(a.bubble.peer))
  root.style.setProperty('--ln-bubble-ink', hexToRgb(a.bubble.ink))
  root.style.setProperty('--ln-bubble-radius', `${a.bubble.radius}rem`)
  root.dataset.tail = a.bubble.tail ? 'on' : 'off'

  // 自定义 CSS：单独一个 <style>，清空即移除。选择器建议写在 .ln-bubble / .ln-bubble-me / .ln-bubble-peer 上
  let style = document.getElementById('ln-custom-bubble-css') as HTMLStyleElement | null
  const css = a.bubble.customCss?.trim() ?? ''
  if (css) {
    if (!style) {
      style = document.createElement('style')
      style.id = 'ln-custom-bubble-css'
      document.head.appendChild(style)
    }
    if (style.textContent !== css) style.textContent = css
  } else if (style) {
    style.remove()
  }
}
