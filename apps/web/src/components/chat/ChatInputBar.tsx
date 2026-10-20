import clsx from 'clsx'
import { useMemo, useState } from 'react'
import { VoiceRecorderButton } from '@/components/chat/VoiceRecorderButton'
import { makeCard } from '@/lib/cards'
import { pickSticker } from '@/lib/file'
import { nid } from '@/lib/ids'
import { useCardsStore } from '@/store/useCardsStore'
import { useChatStore } from '@/store/useChatStore'
import type { Card } from '@/types/cards'

/**
 * 聊天输入栏（仿微信）：
 * [🎙 语音键] [输入框] [😊 表情] [+]
 * 表情面板分两栏：Emoji（插进输入框）和表情包（本机上传的 GIF / 动图，点一下直接发）。
 * 「+」展开扩展面板，图片入口仍然只发静态图片。
 */
export function ChatInputBar() {
  const {
    draft,
    inputMode,
    extendOpen,
    conversation,
    pushMessage,
    setDraft,
    setInputMode,
    openExtend,
    closeExtend,
    sendText,
    quoteOf,
    setQuote,
  } = useChatStore()
  const cards = useCardsStore((s) => s.cards)
  const upsertCard = useCardsStore((s) => s.upsert)
  const markUsed = useCardsStore((s) => s.markUsed)

  const [emojiOpen, setEmojiOpen] = useState(false)
  const [panel, setPanel] = useState<'emoji' | 'sticker'>('emoji')
  const [stickerErr, setStickerErr] = useState('')

  const EMOJIS = ['😊', '😭', '🥺', '😳', '🤔', '😴', '🍰', '🌙', '💙', '✨', '(๑•̀ㅂ•́)و✧', '˚‧º·(˚ ˃̣̣̥᷄⌓˂̣̣̥᷅ )‧º·˚']

  /** 所有上传过动图的表情包卡（禁用的也还能手动发，只是引擎不会抽它） */
  const stickers = useMemo(
    () => cards.filter((c) => c.type === 'STICKER' && Boolean(c.mediaUrl)),
    [cards],
  )

  const canSend = draft.trim().length > 0

  const sendSticker = (card: Card) => {
    if (!conversation || !card.mediaUrl) return
    pushMessage({
      id: nid('m'),
      conversationId: conversation.id,
      senderId: conversation.me.id,
      kind: 'CARD',
      status: 'SENT',
      text: card.text || '[表情包]',
      payload: {
        cardType: 'STICKER',
        cardId: card.id,
        cardSource: card.source,
        url: card.mediaUrl,
      },
      createdAt: new Date().toISOString(),
    })
    markUsed(card.id)
    setStickerErr('')
    setEmojiOpen(false)
  }

  const uploadSticker = () => {
    setStickerErr('')
    pickSticker(
      (url, file) => {
        const existing = cards.find((c) => c.type === 'STICKER' && c.mediaUrl === url)
        const card =
          existing ??
          makeCard({
            type: 'STICKER',
            source: 'CUSTOM',
            text: file.name.replace(/\.[^.]+$/, '').slice(0, 30) || '表情包',
            mediaUrl: url,
            category: '表情包',
            tags: ['表情包'],
            noFreeSentence: true,
          })
        if (!existing) upsertCard(card)
        sendSticker(card)
      },
      { onError: setStickerErr },
    )
  }

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

        {/* 表情 / 表情包 */}
        <button
          className="tap grid h-9 w-9 shrink-0 place-items-center rounded-full text-[19px]"
          onClick={() => {
            setEmojiOpen((v) => !v)
            closeExtend()
          }}
          title="表情 / 表情包"
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
        <div className="border-t border-hairline">
          <div className="flex items-center gap-1.5 px-3 pt-2">
            {(
              [
                ['emoji', 'Emoji'],
                ['sticker', `表情包${stickers.length ? ` ${stickers.length}` : ''}`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                className={clsx(
                  'tap rounded-full px-2.5 py-1 text-[12px] ring-1',
                  panel === key
                    ? 'bg-brand/15 text-brand-deep ring-brand'
                    : 'bg-page text-ink-sub ring-hairline',
                )}
                onClick={() => setPanel(key)}
              >
                {label}
              </button>
            ))}
            {panel === 'sticker' && (
              <span className="ml-auto text-[10px] text-ink-faint">GIF / 动图存在本机</span>
            )}
          </div>

          {panel === 'emoji' ? (
            <div className="grid max-h-40 grid-cols-8 gap-2 overflow-y-auto px-3 py-3">
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
          ) : (
            <div className="max-h-56 overflow-y-auto px-3 py-3">
              <div className="grid grid-cols-4 gap-2">
                <button
                  className="tap grid h-16 place-items-center rounded-xl border border-dashed border-brand-soft bg-surface text-[11px] leading-tight text-brand-deep"
                  onClick={uploadSticker}
                >
                  <span>
                    <span className="block text-[20px] leading-6">＋</span>
                    上传动图
                  </span>
                </button>
                {stickers.map((card) => (
                  <button
                    key={card.id}
                    className="tap grid h-16 place-items-center overflow-hidden rounded-xl bg-surface p-1 shadow-card ring-1 ring-hairline"
                    onClick={() => sendSticker(card)}
                    title={card.text || '表情包'}
                  >
                    <img
                      src={card.mediaUrl}
                      alt={card.text || '表情包'}
                      className="max-h-full max-w-full object-contain"
                      draggable={false}
                    />
                  </button>
                ))}
              </div>
              {stickers.length === 0 && (
                <p className="mt-2 text-center text-[11px] leading-relaxed text-ink-faint">
                  还没有表情包。点「上传动图」选一个 GIF，它会同时进字卡库的「表情包」分类。
                </p>
              )}
              {stickerErr && <p className="mt-2 text-[11px] leading-snug text-[#e0533d]">{stickerErr}</p>}
            </div>
          )}
        </div>
      )}

      <div className={clsx('h-1', !extendOpen && !emojiOpen && 'safe-bottom')} />
    </div>
  )
}
