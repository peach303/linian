import { useState } from 'react'
import { ExtendButton, ExtendHint, ExtendInput } from './ui'
import { useChatStore } from '@/store/useChatStore'
import type { QuestionItem } from '@/types'

interface Draft {
  text: string
  multi: boolean
  options: string[]
}

const emptyDraft = (): Draft => ({ text: '', multi: false, options: ['', ''] })

/** 问卷：最多 5 题，每题单选 / 多选，2~6 个选项；他逐题作答（可能留空） */
export function QuestionForm() {
  const sendQuestion = useChatStore((s) => s.sendQuestion)
  const [title, setTitle] = useState('')
  const [drafts, setDrafts] = useState<Draft[]>([emptyDraft()])

  const patch = (i: number, p: Partial<Draft>) =>
    setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, ...p } : d)))

  const clean: QuestionItem[] = drafts
    .map((d, i) => ({
      id: `q_${i + 1}`,
      text: d.text.trim(),
      multi: d.multi,
      options: d.options
        .map((label, k) => ({ id: `q_${i + 1}_o_${k + 1}`, label: label.trim() }))
        .filter((o) => o.label),
    }))
    .filter((q) => q.text && q.options.length >= 2)

  return (
    <div className="space-y-2 pt-1">
      <ExtendInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="问卷标题（例如：关于我们的小问卷）" />

      {drafts.map((d, i) => (
        <div key={i} className="space-y-1.5 rounded-lg bg-white/70 p-2 shadow-card">
          <div className="flex items-center gap-1.5">
            <span className="w-3 shrink-0 text-[12px] text-ink-faint">{i + 1}</span>
            <ExtendInput
              value={d.text}
              onChange={(e) => patch(i, { text: e.target.value })}
              placeholder="题干"
              className="flex-1"
            />
            {drafts.length > 1 && (
              <button
                className="tap shrink-0 px-1 text-[13px] text-ink-faint"
                title="删掉这题"
                onClick={() => setDrafts((ds) => ds.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 pl-4">
            {(['单选', '多选'] as const).map((t) => (
              <button
                key={t}
                onClick={() => patch(i, { multi: t === '多选' })}
                className={`tap rounded-full px-2 py-0.5 text-[11px] ${
                  (t === '多选') === d.multi ? 'bg-brand text-white' : 'bg-surface text-ink-sub'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="space-y-1.5 pl-4">
            {d.options.map((o, k) => (
              <div key={k} className="flex items-center gap-2">
                <span className="w-3 shrink-0 text-[11px] text-ink-faint">{String.fromCharCode(65 + k)}</span>
                <ExtendInput
                  value={o}
                  onChange={(e) =>
                    patch(i, { options: d.options.map((x, m) => (m === k ? e.target.value : x)) })
                  }
                  placeholder={`选项 ${String.fromCharCode(65 + k)}`}
                  className="flex-1"
                />
                {d.options.length > 2 && (
                  <button
                    className="tap shrink-0 px-1 text-[12px] text-ink-faint"
                    onClick={() => patch(i, { options: d.options.filter((_, m) => m !== k) })}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {d.options.length < 6 && (
              <ExtendButton
                tone="ghost"
                className="!px-2 !py-0.5 !text-[11px]"
                onClick={() => patch(i, { options: [...d.options, ''] })}
              >
                ＋ 选项
              </ExtendButton>
            )}
          </div>
        </div>
      ))}

      <div className="flex items-center gap-2">
        {drafts.length < 5 && (
          <ExtendButton tone="ghost" onClick={() => setDrafts((ds) => [...ds, emptyDraft()])}>
            ＋ 加一题
          </ExtendButton>
        )}
        <ExtendButton
          disabled={!clean.length}
          onClick={() => sendQuestion(title, clean)}
          className="ml-auto"
        >
          发送问卷（{clean.length} 题）
        </ExtendButton>
      </div>

      <ExtendHint>
        没填完的题会写「（这题留空）」；他交卷时可能再补一句备注 —— 都在「概率调节引擎 → 递东西 → 问卷」里调。
      </ExtendHint>
    </div>
  )
}
