import clsx from 'clsx'
import { useState } from 'react'
import { VoiceRecorderButton } from '@/components/chat/VoiceRecorderButton'
import { useChatStore } from '@/store/useChatStore'

/**
 * 聊天输入栏（仿微信）：
 * [🎙 语音键] [输入框] [😊 表情] [+]
 * 底部安全区留白；「+」展开 8 项扩展面板。
 */
export function ChatInputBar() {
  const { draft, inputMode, extendOpen, setDraft, setInputMode, openExtend, closeExtend, sendText, quoteOf, setQuote } =
    useChatStore()
  const [emojiOpen, setEmojiOpen] = useState(false)

  const EMOJIS = ['😊', '😭', '🥺', '😳', '🤔', '😴', '🍰', '🌙', '💙', '✨', '(๑•̀ㅂ•́)و✧', '˚‧º·(˚ ˃̣̣̥᷄⌓˂̣̣̥᷅ )‧º·˚']

  const canSend = draft.trim().length > 0

  return (
    <div className="shrink-0 border-t border-hairline bg-page/95 backdrop-blur">
      {/* 引用条 */}
      {quoteOf && (
        <div className="flex items-center gap-2 border-b border-hairline px-3 py-1.5 text-[12px] text-ink-sub">
          <span className="truncate">引用：{quoteOf.text}</span>
          <button className="tap ml-auto text-ink-faint" onClick={() => setQuote(undefined)}>
            ✕
          </button>
        </div>
      )}

      <div className="flex items-end gap-2 px-2.5 py-2">
        {/* 语音 / 键盘 切换 */}
        <button
          className="tap grid h-9 w-9 shrink-0 place-items-center rounded-full text-[19px] text-ink-sub"
          onClick={() => setInputMode(inputMode === 'voice' ? 'text' : 'voice')}
          title={inputMode === 'voice' ? '切换到键盘' : '切换到语音'}
        >
          {inputMode === 'voice' ? '⌨️' : '🎙️'}
        </button>

        {inputMode === 'voice' ? (
          <VoiceRecorderButton />
        ) : (
          <textarea
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendText()
              }
            }}
            placeholder="发消息…"
            className="no-scrollbar max-h-24 min-h-9 flex-1 resize-none rounded-md bg-surface px-3 py-2 text-[15px] leading-5 text-ink shadow-card outline-none placeholder:text-ink-faint"
          />
        )}

        {/* 表情 */}
        <button
          className="tap grid h-9 w-9 shrink-0 place-items-center rounded-full text-[19px]"
          onClick={() => {
            setEmojiOpen((v) => !v)
            closeExtend()
          }}
        >
          🙂
        </button>

        {/* 发送 / 更多 */}
        {canSend ? (
          <button
            className="tap h-9 shrink-0 rounded-md bg-brand px-3 text-[14px] text-white"
            onClick={sendText}
          >
            发送
          </button>
        ) : (
          <button
            className="tap grid h-9 w-9 shrink-0 place-items-center rounded-full text-[21px] font-light text-ink-sub"
            onClick={() => (extendOpen ? closeExtend() : openExtend('main'))}
          >
            {extendOpen ? '✕' : '＋'}
          </button>
        )}
      </div>

      {/* 表情面板 */}
      {emojiOpen && !extendOpen && (
        <div className="grid max-h-40 grid-cols-8 gap-2 overflow-y-auto border-t border-hairline px-3 py-3">
          {EMOJIS.map((e) => (
            <button
              key={e}
              className="tap grid h-8 place-items-center rounded text-[18px]"
              onClick={() => setDraft(draft + e)}
            >
              {e}
            </button>
          ))}
        </div>
      )}

      <div className={clsx('h-1', !extendOpen && !emojiOpen && 'safe-bottom')} />
    </div>
  )
}
