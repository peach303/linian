import clsx from 'clsx'
import type { ReactNode } from 'react'
import { useAppStore } from '@/store/useAppStore'

interface NavBarProps {
  title?: ReactNode
  /** 左侧：默认显示返回箭头；传 back=false 隐藏 */
  back?: boolean
  onBack?: () => void
  right?: ReactNode
  /** 是否使用品牌色底（聊天页标题栏） */
  tint?: boolean
  className?: string
}

/** 仿微信导航栏：56px 高，1px 发丝线 */
export function NavBar({ title, back = true, onBack, right, tint, className }: NavBarProps) {
  const goBack = useAppStore((s) => s.back)

  return (
    <header
      className={clsx(
        /* `ln-navbar`：手机全屏时由它自己把顶部安全区（刘海/状态栏）垫高，见 styles/index.css */
        'ln-navbar relative z-20 flex h-14 shrink-0 items-center px-2 backdrop-blur',
        tint ? 'bg-brand/95 text-white' : 'bg-surface/95 text-ink',
        className,
      )}
    >
      <div className="flex min-w-[64px] items-center">
        {back && (
          <button
            className={clsx('tap flex items-center gap-0.5 px-1 py-2 text-[15px]', tint ? 'text-white' : 'text-ink')}
            onClick={onBack ?? goBack}
          >
            <svg width="11" height="19" viewBox="0 0 11 19" aria-hidden>
              <path d="M9.5 1 2 9.5 9.5 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span>返回</span>
          </button>
        )}
      </div>

      <div className="flex-1 truncate text-center text-[17px] font-medium">{title}</div>

      <div className="flex min-w-[64px] items-center justify-end gap-1 pr-1">{right}</div>
      <div className={clsx('absolute inset-x-0 bottom-0 h-px', tint ? 'bg-white/15' : 'bg-hairline')} />
    </header>
  )
}
