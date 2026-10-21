import { useEffect, useRef, useState } from 'react'
import { Avatar } from '@/components/common/Avatar'
import { formatClock, hangupCall, answerIncomingCall } from '@/lib/engine/call'
import { startKeepAlive, stopKeepAlive, updateMedia } from '@/lib/keepAlive'
import { onPlayer, playerState } from '@/lib/audio'
import { startCallRing, stopCallRing } from '@/lib/sfx'
import { useFloatingDrag } from '@/lib/useFloatingDrag'
import { useAppStore } from '@/store/useAppStore'
import { useCallStore } from '@/store/useCallStore'
import { useChatStore } from '@/store/useChatStore'
import { useUIStore } from '@/store/useUIStore'
import type { CallPayload } from '@/types'
import type { LiveCall } from '@/store/useCallStore'

/**
 * 通话界面（挂在 App 上，盖在所有页面之上）
 *
 * 两种形态：
 *   · 全屏：响铃 / 通话中（秒表跟着真实时间走）/ 挂断 / 收起小窗
 *   · 小窗：去别的页面时自动收起，浮在右下角；点一下回到全屏，通话不断
 *
 * 只显示真实存在的东西：没有「静音 / 免提」这种点了也没用的按钮 —— 不装样子。
 * 切后台的保活是「尽力」而不是保证：见 lib/keepAlive.ts 开头的说明。
 */
export function CallOverlay() {
  const live = useCallStore((s) => s.live)
  const dream = useAppStore((s) => s.dream)
  const screen = useAppStore((s) => s.screen)
  const [now, setNow] = useState(() => Date.now())
  const [musicOpen, setMusicOpen] = useState(false)
  const ringMaster = useUIStore((s) => s.sfxMaster)
  const ringIn = useUIStore((s) => s.sfxIncomingCall)
  const ringOut = useUIStore((s) => s.sfxOutgoingCall)
  const callPayload = useChatStore((s) => {
    if (!live) return undefined
    const m = s.messages.find((x) => x.id === live.messageId)
    return m?.payload as unknown as CallPayload | undefined
  })

  /* 响铃：来电用「他打来的铃声」，我拨出去用回铃；接通 / 挂断就停 */
  useEffect(() => {
    if (!live || live.phase !== 'CALLING') {
      stopCallRing()
      return
    }
    const kind = callPayload?.direction === 'in' ? 'incoming' : 'outgoing'
    const on = kind === 'incoming' ? ringIn : ringOut
    if (!ringMaster || !on) {
      stopCallRing()
      return
    }
    const stop = startCallRing(kind)
    return () => {
      stop()
      stopCallRing()
    }
  }, [live?.messageId, live?.phase, ringMaster, ringIn, ringOut, callPayload?.direction])

  /* 有没有音乐在放：小窗要往上让一点 */
  useEffect(() => {
    const sync = () => setMusicOpen(!!playerState().trackId)
    sync()
    return onPlayer(sync)
  }, [])

  /* 秒表 */
  useEffect(() => {
    if (!live) return
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [live?.messageId, live?.phase])

  /* 保活 + 锁屏信息（响铃阶段也开，别等接起那一刻页面已经被挂起） */
  useEffect(() => {
    if (!live) {
      stopKeepAlive()
      return
    }
    void startKeepAlive(
      {
        title: live.phase === 'TALKING' ? `和${dream.nickname}通话中` : `正在呼叫 ${dream.nickname}`,
        artist: live.phase === 'TALKING' ? formatClock((Date.now() - live.since) / 1000) : '响铃中',
        artwork: dream.avatarUrl,
      },
      { hangup: hangupCall, stop: hangupCall, pause: hangupCall },
    )
    return () => stopKeepAlive()
  }, [live?.messageId, live?.phase, dream.nickname, dream.avatarUrl])

  /* 锁屏上的秒表：5 秒刷新一次就够 */
  useEffect(() => {
    if (!live || live.phase !== 'TALKING') return
    const id = setInterval(
      () =>
        updateMedia({
          title: `和${dream.nickname}通话中`,
          artist: formatClock((Date.now() - live.since) / 1000),
          artwork: dream.avatarUrl,
        }),
      5000,
    )
    return () => clearInterval(id)
  }, [live?.messageId, live?.phase, live?.since, dream.nickname, dream.avatarUrl])

  /* 切走当前页面 → 自动收成小窗（别把别的页面挡死）
     只在「页面真的变了」时收：从小窗点开时不要把刚展开的又收回去 */
  const prevScreen = useRef(screen)
  useEffect(() => {
    const changed = prevScreen.current !== screen
    prevScreen.current = screen
    if (changed && live && screen !== 'chat' && !live.minimized) useCallStore.getState().minimize()
  }, [live, screen])

  if (!live) return null

  const talking = live.phase === 'TALKING'
  const incomingRinging = !talking && callPayload?.direction === 'in'
  const sec = Math.max(0, (now - live.since) / 1000)

  if (live.minimized) {
    return (
      <CallMini
        live={live}
        sec={sec}
        talking={talking}
        incoming={incomingRinging}
        bottom={bottomOf(screen, musicOpen)}
      />
    )
  }

  return (
    <div className="absolute inset-0 z-[60] flex flex-col items-center justify-between bg-gradient-to-b from-[#7FB2E5] to-[#3F6FA8] pb-20 pt-24 text-white">
      {talking && (
        <button
          className="tap absolute right-3 top-[calc(env(safe-area-inset-top,0px)+12px)] rounded-full bg-white/20 px-3 py-1 text-[12px] text-white backdrop-blur"
          onClick={() => useCallStore.getState().minimize()}
          title="收成小窗，去别的页面也能继续通话"
        >
          收起小窗
        </button>
      )}

      <div className="grid place-items-center gap-3">
        <Avatar src={dream.avatarUrl} name={dream.nickname} size={84} ring />
        <div className="text-[18px]">{dream.nickname}</div>
        <div className="text-[13px] tabular-nums opacity-95">
          {talking ? formatClock(sec) : incomingRinging ? '邀请你语音通话…' : '正在呼叫…'}
        </div>
        {talking && <div className="text-[11px] opacity-75">切到别的页面不会挂断，会在右下角变小窗</div>}
        {incomingRinging && <div className="text-[11px] opacity-75">接听后会记在聊天里</div>}
      </div>

      <div className="grid place-items-center gap-3">
        {incomingRinging ? (
          <div className="flex items-center gap-12">
            <div className="grid place-items-center gap-2">
              <button
                className="tap grid h-16 w-16 place-items-center rounded-full bg-[#E5554F] text-[26px] shadow-lg"
                onClick={hangupCall}
                title="拒绝"
              >
                <span className="rotate-[135deg]">📞</span>
              </button>
              <span className="text-[11px] opacity-80">拒绝</span>
            </div>
            <div className="grid place-items-center gap-2">
              <button
                className="tap grid h-16 w-16 place-items-center rounded-full bg-[#43B36B] text-[26px] shadow-lg"
                onClick={answerIncomingCall}
                title="接听"
              >
                📞
              </button>
              <span className="text-[11px] opacity-80">接听</span>
            </div>
          </div>
        ) : (
          <>
            <button
              className="tap grid h-16 w-16 place-items-center rounded-full bg-[#E5554F] text-[26px] shadow-lg"
              onClick={hangupCall}
              title="挂断"
            >
              <span className="rotate-[135deg]">📞</span>
            </button>
            <div className="text-[11px] opacity-80">
              {talking ? '挂断后这通电话会记在聊天里' : '响铃中…'}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ───────────────────────── 小窗 ───────────────────────── */

function CallMini({
  live,
  sec,
  talking,
  incoming,
  bottom,
}: {
  live: LiveCall
  sec: number
  talking: boolean
  incoming: boolean
  bottom: number
}) {
  const dream = useAppStore((s) => s.dream)
  const restore = useCallStore((s) => s.restore)
  const drag = useFloatingDrag()

  return (
    <div
      role="button"
      tabIndex={0}
      className="tap absolute right-3 z-[60] flex w-[148px] cursor-grab touch-none items-center gap-2 rounded-2xl bg-gradient-to-br from-[#7FB2E5] to-[#3F6FA8] py-2 pl-2 pr-1 text-white shadow-phone ring-1 ring-white/30 active:cursor-grabbing"
      style={{ bottom: `calc(${bottom}px + env(safe-area-inset-bottom, 0px))`, ...drag.style }}
      {...drag.handlers}
      onClick={restore}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && restore()}
      title="拖动可以换位置；点一下展开通话"
    >
      <Avatar src={dream.avatarUrl} name={dream.nickname} size={34} ring />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[10px] opacity-85">{talking ? '通话中' : incoming ? '来电' : '呼叫中'}</div>
        <div className="text-[13px] font-medium tabular-nums">{formatClock(sec)}</div>
      </div>
      {incoming && (
        <button
          className="tap grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#43B36B] text-[13px]"
          title="接听"
          onClick={(e) => {
            e.stopPropagation()
            answerIncomingCall()
          }}
        >
          📞
        </button>
      )}
      <button
        className="tap grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#E5554F] text-[13px]"
        title={incoming ? '拒绝' : '挂断'}
        onClick={(e) => {
          e.stopPropagation()
          hangupCall()
        }}
      >
        <span className="rotate-[135deg]">📞</span>
      </button>
    </div>
  )
}

/** 小窗的落脚点：主界面要给底部的五个入口让位；上面有音乐小窗再往上抬 */
function bottomOf(screen: string, musicOpen: boolean): number {
  const base = screen === 'home' ? 96 : 16
  return base + (musicOpen ? 66 : 0)
}
