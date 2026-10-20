import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 全部走 CSS 变量 → 主界面「可更改配色」
        brand: {
          DEFAULT: 'rgb(var(--ln-brand) / <alpha-value>)',
          soft: 'rgb(var(--ln-brand-soft) / <alpha-value>)',
          deep: 'rgb(var(--ln-brand-deep) / <alpha-value>)',
        },
        page: 'rgb(var(--ln-page) / <alpha-value>)',
        surface: 'rgb(var(--ln-surface) / <alpha-value>)',
        bubble: {
          DEFAULT: 'rgb(var(--ln-bubble-me) / <alpha-value>)',
          peer: 'rgb(var(--ln-bubble-peer) / <alpha-value>)',
          ink: 'rgb(var(--ln-bubble-ink) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--ln-ink) / <alpha-value>)',
          sub: 'rgb(var(--ln-ink-sub) / <alpha-value>)',
          faint: 'rgb(var(--ln-ink-faint) / <alpha-value>)',
        },
        hairline: 'rgb(var(--ln-hairline) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['"PingFang SC"', '"HarmonyOS Sans"', 'system-ui', 'sans-serif'],
        hand: ['"Ma Shan Zheng"', '"楷体"', 'cursive'], // 信箱蓝色手写批注
      },
      boxShadow: {
        phone: '0 24px 60px -12px rgba(74,144,217,.35)',
        card: '0 2px 12px rgba(74,144,217,.10)',
      },
      borderRadius: {
        phone: '2.75rem',
      },
      keyframes: {
        'bubble-in': {
          '0%': { opacity: '0', transform: 'translateY(6px) scale(.96)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'heart-pop': {
          '0%': { transform: 'scale(.4)', opacity: '0' },
          '60%': { transform: 'scale(1.15)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      animation: {
        'bubble-in': 'bubble-in .18s ease-out',
        'heart-pop': 'heart-pop .35s ease-out',
      },
    },
  },
  plugins: [],
} satisfies Config
