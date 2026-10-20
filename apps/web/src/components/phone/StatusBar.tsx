import { useEffect } from 'react'

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** iOS 风格状态栏：时间 / 信号 / WiFi / 电量 */
export function StatusBar() {
  const now = new Date()
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  void WEEK

  /* `ln-statusbar`：手机全屏时隐藏（真机自己有状态栏），见 styles/index.css
     文字色固定走 `text-ink`：它在浅色主题下是深色、在深夜蓝主题下会自动变成浅色，
     每个屏的顶栏都是浅色/深色实底，不需要再单独「反白」。 */
  return (
    <div
      className="ln-statusbar flex h-11 shrink-0 items-center justify-between px-6 pt-1 text-[13px] font-semibold text-ink"
    >
      <span className="tabular-nums">{time}</span>
      <div className="flex items-center gap-1.5">
        {/* 信号 */}
        <svg width="17" height="11" viewBox="0 0 17 11" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <rect
              key={i}
              x={i * 4.5}
              y={8 - i * 2.5}
              width="3"
              height={3 + i * 2.5}
              rx="1"
              fill="currentColor"
              opacity={i === 3 ? 0.35 : 1}
            />
          ))}
        </svg>
        {/* WiFi */}
        <svg width="15" height="11" viewBox="0 0 15 11" aria-hidden>
          <path
            d="M7.5 9.5 5 6.8a4 4 0 0 1 5 0L7.5 9.5Zm0-5.2a7 7 0 0 0-4.6 1.7L1.5 4.5a9.5 9.5 0 0 1 12 0l-1.4 1.5A7 7 0 0 0 7.5 4.3Z"
            fill="currentColor"
          />
        </svg>
        {/* 电量 */}
        <svg width="25" height="12" viewBox="0 0 25 12" aria-hidden>
          <rect x="0.5" y="0.5" width="21" height="11" rx="3" fill="none" stroke="currentColor" opacity=".4" />
          <rect x="2" y="2" width="16" height="8" rx="1.8" fill="currentColor" />
          <path d="M23 4v4a2.2 2.2 0 0 0 0-4Z" fill="currentColor" opacity=".4" />
        </svg>
      </div>
    </div>
  )
}

/** 让状态栏时间走起来（可选，挂在 App 上） */
export function useClockTick(onTick: () => void, ms = 30_000) {
  useEffect(() => {
    const t = setInterval(onTick, ms)
    return () => clearInterval(t)
  }, [onTick, ms])
}
