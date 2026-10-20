import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store/useAppStore'

interface Popup {
  title: string
  body: string
  messageId: string
}

/**
 * 应用内消息小弹窗
 *
 * 页面在前台、但人不在聊天屏时出现；点一下直接进聊天。
 * 页面在后台时不会走这里，而是 lib/notify.ts 的系统通知。
 */
export function MessagePopup() {
  const [popup, setPopup] = useState<Popup | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const dream = useAppStore((s) => s.dream)
  const push = useAppStore((s) => s.push)
  const screen = useAppStore((s) => s.screen)

  useEffect(() => {
    const onMessage = (event: Event) => {
      const detail = (event as CustomEvent<Popup>).detail
      if (!detail) return
      setPopup(detail)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setPopup(null), 5200)
    }
    window.addEventListener('linian:peer-message', onMessage)
    return () => {
      window.removeEventListener('linian:peer-message', onMessage)
      window.clearTimeout(timer.current)
    }
  }, [])

  // 已经进聊天屏就别挡着消息本身
  useEffect(() => {
    if (screen === 'chat') setPopup(null)
  }, [screen])

  const open = () => {
    setPopup(null)
    if (screen !== 'chat') push('chat')
  }

  return (
    <AnimatePresence>
      {popup && (
        <motion.button
          type="button"
          initial={{ y: -18, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -14, opacity: 0, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          onClick={open}
          className="absolute left-3 right-3 top-2 z-40 flex items-center gap-2.5 rounded-2xl border border-brand-soft bg-surface/95 px-3 py-2.5 text-left shadow-card backdrop-blur"
          aria-label="打开新消息"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-brand/10 text-[16px] text-brand-deep ring-1 ring-brand-soft">
            {dream.avatarUrl ? (
              <img src={dream.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              '念'
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-ink">{popup.title}</span>
            <span className="mt-0.5 block truncate text-[11px] text-ink-sub">{popup.body}</span>
          </span>
          <span className="shrink-0 text-[11px] text-brand-deep">查看</span>
        </motion.button>
      )}
    </AnimatePresence>
  )
}
