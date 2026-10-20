import clsx from 'clsx'
import { useState } from 'react'

interface AvatarProps {
  src?: string
  name?: string
  size?: number
  ring?: boolean
  className?: string
}

const PALETTE = ['#8FC2F5', '#A8D8C8', '#F5C6CB', '#C7BEE8', '#F3D5A5']

/** 头像：无图 / 图挂了时用昵称末两字 + 稳定渐变色兜底 */
export function Avatar({ src, name = '?', size = 40, ring, className }: AvatarProps) {
  const idx = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length
  /** 记录加载失败的地址（换图后自动重试） */
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null)
  const showImg = Boolean(src) && brokenSrc !== src

  return (
    <div
      className={clsx(
        'shrink-0 overflow-hidden rounded-[6px] bg-brand-soft',
        ring && 'ring-2 ring-white shadow-card',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {showImg ? (
        <img
          src={src}
          alt={name}
          className="h-full w-full object-cover"
          draggable={false}
          onError={() => setBrokenSrc(src ?? null)}
        />
      ) : (
        <div
          className="grid h-full w-full place-items-center font-medium text-white"
          style={{ background: PALETTE[idx], fontSize: size * 0.42 }}
        >
          {name.slice(-2)}
        </div>
      )}
    </div>
  )
}
