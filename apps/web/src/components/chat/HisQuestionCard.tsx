import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { useChatStore } from '@/store/useChatStore'
import type { Message, QuestionPayload } from '@/types'

/**
 * 他发来的问卷（从「功能 → 问卷」的题库里挑的）。
 *
 * 和聊天里我出给他的问卷共用 `QUESTION` 消息，只是 `askedBy: 'him'`：
 * 选项可以点，交卷后写回同一条消息的 payload，刷新 / 换设备都还在。
 */
export function HisQuestionCard({
  message,
  base,
  onContextMenu,
}: {
  message: Message
  base: string
  onContextMenu: (e: React.MouseEvent) => void
}) {
  const q = message.payload as unknown as QuestionPayload | undefined
  const items = q?.items ?? []
  const submit = useChatStore((s) => s.answerQuestionAsMe)
  const [picked, setPicked] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {}
    ;(q?.answers ?? []).forEach((a) => {
      init[a.itemId] = [...a.optionIds]
    })
    return init
  })

  const filled = Boolean(q?.submittedAt)
  const answered = useMemo(
    () => items.filter((it) => (picked[it.id] ?? []).length > 0).length,
    [items, picked],
  )

  const toggle = (itemId: string, optionId: string, multi: boolean) => {
    if (filled) return
    setPicked((prev) => {
      const cur = prev[itemId] ?? []
      if (multi) {
        const next = cur.includes(optionId) ? cur.filter((x) => x !== optionId) : [...cur, optionId]
        return { ...prev, [itemId]: next }
      }
      return { ...prev, [itemId]: [optionId] }
    })
  }

  const handIn = () => {
    if (!items.length) return
    submit(
      message.id,
      items
        .map((it) => ({ itemId: it.id, optionIds: picked[it.id] ?? [] }))
        .filter((a) => a.optionIds.length > 0),
    )
  }

  return (
    <div className={clsx(base, 'ln-bubble ln-bubble-peer w-[268px] p-0')} onContextMenu={onContextMenu}>
      <div className="flex items-center gap-1.5 px-3 py-2 text-[14px]">
        <span className="text-[13px]">📋</span>
        <span className="min-w-0 flex-1">{q?.title ?? message.text}</span>
      </div>
      <div className="border-t border-hairline px-3 py-2">
        {items.map((it, i) => (
          <div key={it.id} className="mb-2.5 last:mb-0">
            <div className="text-[12.5px] leading-snug text-ink">
              {i + 1}. {it.text}
              {it.multi && <span className="ml-1 text-[10px] text-ink-faint">多选</span>}
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {it.options.map((o) => {
                const on = (picked[it.id] ?? []).includes(o.id)
                return (
                  <button
                    key={o.id}
                    type="button"
                    disabled={filled}
                    onClick={() => toggle(it.id, o.id, it.multi)}
                    className={clsx(
                      'tap rounded-full border px-2 py-0.5 text-[11px]',
                      on
                        ? 'border-brand bg-white/80 font-medium text-brand-deep'
                        : 'border-hairline bg-white/40 text-ink-sub',
                    )}
                  >
                    {on ? '✓' : ''}
                    {o.label}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 border-t border-hairline px-3 py-2 text-[11px]">
        {filled ? (
          <span className="text-brand-deep">
            我答了 {q?.answers?.length ?? 0}/{items.length} 题
            {q?.note ? ` · ${q.note}` : ''}
          </span>
        ) : (
          <>
            <span className="text-ink-faint">已选 {answered}/{items.length} 题</span>
            <button
              type="button"
              onClick={handIn}
              disabled={answered === 0}
              className="tap ml-auto rounded-full bg-brand px-3 py-1 text-white disabled:opacity-40"
            >
              交卷
            </button>
          </>
        )}
      </div>
    </div>
  )
}
