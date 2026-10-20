import { useState } from 'react'
import clsx from 'clsx'
import { ExtendButton, ExtendHint, ExtendInput } from './ui'
import { useAppStore } from '@/store/useAppStore'
import { useChatStore } from '@/store/useChatStore'

/** 礼物：从礼物柜里挑一件递给他（可临时改卡片文案），他按概率收下 */
export function GiftForm() {
  const gifts = useAppStore((s) => s.gifts)
  const push = useAppStore((s) => s.push)
  const sendGift = useChatStore((s) => s.sendGift)
  const closeExtend = useChatStore((s) => s.closeExtend)
  const [selId, setSelId] = useState('')
  const [note, setNote] = useState('')

  const sel = gifts.find((g) => g.id === selId) ?? gifts[0]

  return (
    <div className="space-y-2 pt-1">
      <div className="grid grid-cols-3 gap-2">
        {gifts.map((g) => (
          <button
            key={g.id}
            onClick={() => setSelId(g.id)}
            className={clsx(
              'tap grid h-[74px] place-items-center gap-0.5 rounded-lg border px-1 shadow-card',
              sel?.id === g.id ? 'border-brand bg-white' : 'border-transparent bg-surface',
            )}
          >
            {g.imageUrl ? (
              <img src={g.imageUrl} alt="" className="h-8 w-8 rounded-md object-cover" />
            ) : (
              <span className="text-[22px] leading-none">{g.icon || '🎁'}</span>
            )}
            <span className="max-w-full truncate text-[11px] text-ink">{g.name}</span>
            <span className="text-[10px] text-ink-faint">¥ {g.price}</span>
          </button>
        ))}
        <button
          onClick={() => {
            closeExtend()
            push('gift-cabinet')
          }}
          className="tap grid h-[74px] place-items-center rounded-lg border border-dashed border-brand-soft bg-page text-[11px] text-brand-deep"
        >
          ＋ 自定义
        </button>
      </div>

      <ExtendInput
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={sel?.note ? `卡片文案（默认：${sel.note}）` : '卡片文案'}
      />

      <div className="flex items-center gap-2">
        <ExtendButton
          tone="ghost"
          onClick={() => {
            closeExtend()
            push('gift-cabinet')
          }}
        >
          管理礼物柜
        </ExtendButton>
        <ExtendButton className="ml-auto" disabled={!sel} onClick={() => sel && sendGift(sel, note)}>
          送出礼物
        </ExtendButton>
      </div>

      <ExtendHint>
        收下 / 说谢谢 / 他主动送你 —— 都在「概率调节引擎 → 递东西」里调；送出去的记录会留在聊天里。
      </ExtendHint>
    </div>
  )
}
