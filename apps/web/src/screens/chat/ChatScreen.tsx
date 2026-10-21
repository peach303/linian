import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Avatar } from '@/components/common/Avatar'
import { NavBar } from '@/components/common/NavBar'
import { ChatInputBar } from '@/components/chat/ChatInputBar'
import { ExtendPanel } from '@/components/chat/ExtendPanel'
import { MessageActionSheet } from '@/components/chat/MessageActionSheet'
import { MessageBubble } from '@/components/chat/MessageBubble'
import { TypingIndicator } from '@/components/chat/TypingIndicator'
import { formatBubbleTime, shouldShowTime } from '@/lib/time'
import { bgCss } from '@/lib/appearance'
import { useAppStore } from '@/store/useAppStore'
import { useAppearanceStore } from '@/store/useAppearanceStore'
import { useChatStore } from '@/store/useChatStore'
import type { Message } from '@/types'

const chat = useChatStore

/**
 * 聊天界面（仿微信）
 * - 顶部：双方头像 + 昵称
 * - 右上角「+」：无好友时是「添加梦角」，已是好友时进入聊天设置
 * - 底部：语音键 / 输入框 / 表情包 / 「+」扩展（8 项）
 */
export function ChatScreen() {
  const { me, dream, bonded, setBonded } = useAppStore()
  const chatBg = useAppearanceStore((s) => s.appearance.chatBackground)
  const [settingOpen, setSettingOpen] = useState(false)
  /** 长按菜单选中的消息 */
  const [acting, setActing] = useState<Message | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const firstScroll = useRef(true)

  const messages = chat((s) => s.messages)
  const peerTyping = chat((s) => s.peerTyping)
  const openExtend = chat((s) => s.openExtend)

  /* 新消息自动滚底。
     注意：不能用 scrollIntoView（它会连带把外层页面也滚走），只滚消息容器。
     第一次进入时直接落到底，不做平滑动画 —— 否则会先看到顶部再「唰」地滑下去。 */
  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    if (firstScroll.current) {
      firstScroll.current = false
      el.scrollTop = el.scrollHeight
      // 图片 / 字卡量完高度后再补一次，避免首屏差半屏
      const raf = requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight
      })
      return () => cancelAnimationFrame(raf)
    }
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages.length, peerTyping])

  /* ── 空态：还没有好友 ── */
  if (!bonded) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-page">
        <NavBar title="聊天" right={<AddButton onClick={() => setBonded(true)} />} />
        <div className="grid flex-1 place-items-center gap-3 px-8 text-center">
          <div className="text-[40px]">💌</div>
          <p className="text-[14px] text-ink-sub">
            还没有梦角
            <br />
            点击右上角「＋」把他加进来吧
          </p>
          <button
            className="mt-1 rounded-full bg-brand px-5 py-2 text-[14px] text-white shadow-card"
            onClick={() => setBonded(true)}
          >
            ＋ 添加梦角
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative isolate flex min-h-0 flex-1 flex-col bg-page">
      {/* ── 聊天背景（美化可换） ── */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: bgCss(chatBg) || 'rgb(var(--ln-page))',
          backgroundPosition: 'center',
          backgroundSize: 'cover',
          filter: chatBg.blur ? `blur(${chatBg.blur}px)` : undefined,
        }}
      />
      {chatBg.dim > 0 && (
        <div className="absolute inset-0 -z-10" style={{ background: `rgba(0,0,0,${chatBg.dim})` }} />
      )}

      {/* 顶部：双方头像 + 昵称（点他的头像 = 拍一拍） */}
      <NavBar
        back
        title={
          <span className="inline-flex items-center gap-2">
            <button
              className="tap rounded-full"
              title="点他的头像 → 拍一拍"
              onClick={() => openExtend('PAT')}
            >
              <Avatar src={dream.avatarUrl} name={dream.nickname} size={24} />
            </button>
            <span className="max-w-[120px] truncate">{dream.nickname}</span>
            <Avatar src={me.avatarUrl} name={me.nickname} size={24} />
          </span>
        }
        right={
          <>
            <button
              className="tap grid h-8 w-8 place-items-center rounded text-[18px] text-ink-sub"
              title="聊天信息"
              onClick={() => setSettingOpen((v) => !v)}
            >
              ⋯
            </button>
            <AddButton onClick={() => setSettingOpen((v) => !v)} />
          </>
        }
      />

      {/* 聊天设置抽屉 */}
      {settingOpen && (
        <div className="border-b border-hairline bg-surface px-3 py-2 text-[12px] text-ink-sub">
          <div className="flex items-center gap-2">
            <span>长按任意消息 → 「看抽签」能看到他这条是怎么来的</span>
            <button
              className="tap ml-auto shrink-0 rounded bg-brand-soft px-2 py-1 text-brand-deep"
              onClick={() => useAppStore.getState().push('rule-engine')}
            >
              去概率调节引擎 ›
            </button>
          </div>
          <div className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
            <div>拟真引擎：本机出稿（离线可用）· 已读不回 / 拍一拍 / 撤回 / 引用 / 多字卡拼接 / 拾取 全部生效</div>
            <div>默认回复间隔 3~25 秒（很像真人），嫌慢可以去引擎里把「回复间隔」改小</div>
            <div>
              安静下来之后他还会<span className="text-brand-deep">主动</span>来找你（气泡左上角 ❤️），间隔 /
              每日条数 / 免打扰都在「主动行为」里
            </div>
          </div>
        </div>
      )}

      {/* 消息列表 */}
      <div ref={listRef} className="no-scrollbar flex-1 overflow-y-auto py-2">
        {messages.map((m, i) => {
          const prev = messages[i - 1]
          const showTime = shouldShowTime(prev?.createdAt, m.createdAt)
          return (
            <div key={m.id}>
              {showTime && (
                <div className="my-2 text-center text-[11px] text-ink-faint">
                  {formatBubbleTime(m.createdAt)}
                </div>
              )}
              <MessageBubble
                message={m}
                mine={m.senderId === me.id}
                peerName={dream.nickname}
                peerAvatar={dream.avatarUrl}
                myAvatar={me.avatarUrl}
                myName={me.nickname}
                onPatAvatar={() => openExtend('PAT')}
                onLongPress={(msg) => setActing(msg)}
              />
            </div>
          )
        })}

        {peerTyping && <TypingIndicator name={dream.nickname} />}
        <div ref={bottomRef} className="h-2" />
      </div>

      {acting && <MessageActionSheet message={acting} mine={acting.senderId === me.id} onClose={() => setActing(null)} />}
      <ExtendPanel />
      <ChatInputBar />
    </div>
  )
}

function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="tap grid h-8 w-8 place-items-center rounded text-[22px] font-light text-ink-sub"
      onClick={onClick}
      title="添加梦角"
    >
      ＋
    </button>
  )
}
