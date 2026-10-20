import { useState } from 'react'

/**
 * 通用「改一行字」弹层（改昵称 / 改分类 / 改后缀…）
 * 仿 iOS：标题 + 单行输入 + 取消 / 保存。
 */
export function PromptSheet({
  title,
  value,
  placeholder,
  maxLength = 16,
  hint,
  onSave,
  onClose,
}: {
  title: string
  value: string
  placeholder?: string
  maxLength?: number
  hint?: string
  onSave: (v: string) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(value)

  const save = () => {
    const v = draft.trim()
    if (v) onSave(v)
    onClose()
  }

  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end">
      <button className="flex-1 bg-black/25" onClick={onClose} aria-label="关闭" />
      <div className="rounded-t-2xl bg-page px-4 pb-5 pt-3 shadow-phone">
        <div className="mb-2 flex items-center">
          <span className="text-[13px] text-ink-sub">{title}</span>
          <button className="tap ml-auto text-[13px] text-ink-faint" onClick={onClose}>
            ✕
          </button>
        </div>
        <input
          autoFocus
          value={draft}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') onClose()
          }}
          className="w-full rounded-lg bg-surface px-3 py-2.5 text-[15px] text-ink outline-none ring-1 ring-hairline focus:ring-brand placeholder:text-ink-faint"
        />
        {hint && <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">{hint}</p>}
        <div className="mt-3 flex gap-2">
          <button
            className="tap flex-1 rounded-lg bg-surface py-2.5 text-[14px] text-ink-sub ring-1 ring-hairline"
            onClick={onClose}
          >
            取消
          </button>
          <button className="tap flex-[2] rounded-lg bg-brand py-2.5 text-[14px] text-white" onClick={save}>
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
