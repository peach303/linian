import clsx from 'clsx'
import type { InputHTMLAttributes, ReactNode } from 'react'

/** 「+」扩展面板里共用的小控件（递东西的几种表单都用它，保持视觉一致） */

export function ExtendInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={clsx(
        'w-full rounded-md bg-surface px-3 py-2 text-[13px] text-ink outline-none placeholder:text-ink-faint',
        className,
      )}
    />
  )
}

export function ExtendButton({
  children,
  disabled,
  onClick,
  tone = 'primary',
  className,
}: {
  children: ReactNode
  disabled?: boolean
  onClick?: () => void
  tone?: 'primary' | 'ghost' | 'danger'
  className?: string
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'tap rounded-md px-3 py-1.5 text-[13px] transition',
        tone === 'primary' && 'bg-brand text-white',
        tone === 'ghost' && 'border border-brand-soft text-brand-deep',
        tone === 'danger' && 'text-ink-faint',
        disabled && 'opacity-40',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function ExtendHint({ children }: { children: ReactNode }) {
  return <p className="text-[11px] leading-relaxed text-ink-faint">{children}</p>
}
