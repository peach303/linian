import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { StatusBar } from './StatusBar'

interface PhoneShellProps {
  children: ReactNode
}

/**
 * 小手机外壳：桌面式主界面容器。
 * - 无底部导航栏，所有入口都在「主界面」的图标网格里
 * - 桌面上固定 390 × 844（iPhone 14）摆在屏幕中间，内部滚动
 * - **手机上（≤520px）或装成独立应用后，外壳会自己「拆掉」**：铺满整屏、去掉圆角/阴影/刘海/假状态栏，
 *   安全区（刘海、手势条）交给真机。样式全在 `styles/index.css` 的「手机适配」那一段，
 *   这里只负责挂上钩子 class（`phone-stage` / `phone-body` / `phone-screen` / `phone-notch` / `phone-home`）。
 */
export function PhoneShell({ children }: PhoneShellProps) {
  const kb = useKeyboardInset()

  return (
    <div
      className="phone-stage"
      /* 软键盘顶起来时把外壳往上收（只在这时候写内联样式，桌面端完全不受影响） */
      style={kb ? { paddingBottom: `${kb}px` } : undefined}
    >
      <div className="phone-frame relative">
        {/* 机身 */}
        <div className="phone-body relative overflow-hidden rounded-phone bg-surface shadow-phone ring-1 ring-brand-soft">
          <div className="phone-screen flex h-[844px] w-[390px] flex-col overflow-hidden">
            {/* 刘海（真机上不画：真机自己就有） */}
            <div className="phone-notch pointer-events-none absolute left-1/2 top-2 z-30 h-[26px] w-[110px] -translate-x-1/2 rounded-full bg-black" />

            <StatusBar />

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key="shell"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex min-h-0 flex-1 flex-col"
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Home Indicator（真机上不画） */}
        <div className="phone-home mx-auto mt-[-14px] mb-[-6px] h-[5px] w-[132px] rounded-full bg-ink/25" />
      </div>
    </div>
  )
}

/**
 * 软键盘让位（返回要垫起来的高度，px）
 *
 * iOS Safari 的键盘是**浮在页面上面**的：`100dvh` 不变、`innerHeight` 也不变，
 * 所以输入框会被键盘整个盖住。这里用 `visualViewport` 量出被键盘吃掉的高度，
 * 交给外壳的 `padding-bottom` 收掉。
 *
 * Android / Chrome 走 viewport 的 `interactive-widget=resizes-content`，视口自己变矮 → 差值恒为 0，
 * 不会重复留白。阈值 120px 是为了忽略地址栏收放、缩放抖动这些几十像素的变化。
 */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const apply = () => {
      const raw = window.innerHeight - vv.height - vv.offsetTop
      setInset(raw > 120 ? Math.round(raw) : 0)
    }
    apply()
    vv.addEventListener('resize', apply)
    vv.addEventListener('scroll', apply)
    return () => {
      vv.removeEventListener('resize', apply)
      vv.removeEventListener('scroll', apply)
    }
  }, [])

  return inset
}
