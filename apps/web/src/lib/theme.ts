/**
 * 主界面「可更改配色」：预设主题。
 *
 * 注意职责边界：主题只负责页面/品牌色（--ln-page、--ln-brand…）；
 * **气泡颜色归「设置 → 美化」管**（--ln-bubble-me / --ln-bubble-peer / --ln-bubble-ink）。
 * 主题里带的 bubble 只是「切换配色时顺便把气泡也换成搭配色」，由 useAppStore.setTheme
 * 调 useAppearanceStore.setBubble 写入，避免 applyTheme 直接覆盖用户的美化设置。
 */

export interface ThemePreset {
  key: string
  name: string
  /** 颜色以 "r g b" 字符串形式写入 CSS 变量 */
  vars: Record<string, string>
  /** 主题附带的「我的气泡」配色 */
  bubble?: { me: string; peer?: string; ink?: string }
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    key: 'light-blue',
    name: '黎念蓝',
    vars: {
      '--ln-page': '234 244 255',
      '--ln-brand': '106 168 240',
      '--ln-brand-soft': '200 224 250',
      '--ln-brand-deep': '58 122 200',
    },
    bubble: { me: '#a8d4ff' },
  },
  {
    key: 'haze',
    name: '雾霾蓝',
    vars: {
      '--ln-page': '232 238 246',
      '--ln-brand': '124 148 178',
      '--ln-brand-soft': '206 219 234',
      '--ln-brand-deep': '78 100 128',
    },
    bubble: { me: '#b0c6de' },
  },
  {
    key: 'mint',
    name: '薄荷',
    vars: {
      '--ln-page': '232 248 246',
      '--ln-brand': '104 200 190',
      '--ln-brand-soft': '198 236 232',
      '--ln-brand-deep': '56 148 140',
    },
    bubble: { me: '#aae2dc' },
  },
  {
    key: 'sakura',
    name: '樱',
    vars: {
      '--ln-page': '255 240 245',
      '--ln-brand': '244 152 180',
      '--ln-brand-soft': '252 214 228',
      '--ln-brand-deep': '196 96 130',
    },
    bubble: { me: '#ffc8da' },
  },
  {
    key: 'night',
    name: '深夜蓝',
    vars: {
      '--ln-page': '22 30 46',
      '--ln-surface': '32 42 61',
      '--ln-brand': '110 168 240',
      '--ln-brand-soft': '58 80 116',
      '--ln-brand-deep': '146 190 246',
      '--ln-ink': '234 241 250',
      '--ln-ink-sub': '154 172 194',
      '--ln-ink-faint': '106 124 148',
      '--ln-hairline': '52 66 88',
    },
    bubble: { me: '#366098', peer: '#202a3d', ink: '#eaf1fa' },
  },
]

/** 写入 CSS 变量（只碰主题色，气泡由美化模块负责） */
export function applyTheme(key: string): ThemePreset {
  const preset = THEME_PRESETS.find((t) => t.key === key) ?? THEME_PRESETS[0]
  const root = document.documentElement
  // 先重置所有预设用过的键，避免切回浅色时残留上一个主题（如夜间模式）的变量
  const allKeys = new Set(THEME_PRESETS.flatMap((t) => Object.keys(t.vars)))
  allKeys.forEach((k) => root.style.removeProperty(k))
  Object.entries(preset.vars).forEach(([k, v]) => root.style.setProperty(k, v))
  root.dataset.theme = preset.key
  return preset
}
