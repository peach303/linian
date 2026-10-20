import { useState } from 'react'
import { ExtendButton, ExtendHint, ExtendInput } from './ui'
import { useChatStore } from '@/store/useChatStore'

/** 抉择：问他「选哪个」，2~6 个选项；他在规则时间里帮你选一个（可能附理由） */
export function ChoiceForm() {
  const sendChoice = useChatStore((s) => s.sendChoice)
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])

  const filled = options.filter((o) => o.trim())
  const valid = !!question.trim() && filled.length >= 2

  return (
    <div className="space-y-2 pt-1">
      <ExtendInput
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="想让我帮你选什么？（例如：晚上吃点什么）"
      />

      <div className="space-y-1.5">
        {options.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-3 shrink-0 text-[12px] text-ink-faint">{i + 1}</span>
            <ExtendInput
              value={o}
              onChange={(e) => setOptions((os) => os.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder={`选项 ${i + 1}`}
              className="flex-1"
            />
            {options.length > 2 && (
              <button
                className="tap shrink-0 px-1 text-[13px] text-ink-faint"
                title="删掉这个选项"
                onClick={() => setOptions((os) => os.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        {options.length < 6 && (
          <ExtendButton tone="ghost" onClick={() => setOptions((os) => [...os, ''])}>
            ＋ 加一个
          </ExtendButton>
        )}
        <ExtendButton disabled={!valid} onClick={() => sendChoice(question, options)} className="ml-auto">
          发起抉择
        </ExtendButton>
      </div>

      <ExtendHint>
        他会不会答、隔多久答、要不要说理由，都在「概率调节引擎 → 递东西」里调。
      </ExtendHint>
    </div>
  )
}
