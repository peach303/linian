import { useState } from 'react'
import { ExtendButton, ExtendHint, ExtendInput } from './ui'
import { useChatStore } from '@/store/useChatStore'
import { useRulesStore } from '@/store/useRulesStore'

/** 红包：固定金额或按规则里的区间随机；他按概率领取，也可能回一个（独立掷签） */
export function RedPacketForm() {
  const sendRedPacket = useChatStore((s) => s.sendRedPacket)
  const range = useRulesStore((s) => s.saved.redPacket.amount)
  const [amount, setAmount] = useState('13.14')
  const [isRandom, setIsRandom] = useState(false)
  const [blessing, setBlessing] = useState('')

  const num = Number(amount)
  const valid = isRandom || (Number.isFinite(num) && num > 0)

  return (
    <div className="space-y-2 pt-1">
      <div className="flex items-center gap-2">
        <ExtendInput
          value={isRandom ? '随机' : amount}
          inputMode="decimal"
          disabled={isRandom}
          placeholder="金额"
          onChange={(e) => setAmount(e.target.value)}
          className="flex-1"
        />
        {[
          { label: '固定金额', v: false },
          { label: '随机金额', v: true },
        ].map(({ label, v }) => (
          <button
            key={label}
            onClick={() => setIsRandom(v)}
            className={`tap shrink-0 rounded-full px-2 py-1 text-[11px] ${
              isRandom === v ? 'bg-brand text-white' : 'bg-surface text-ink-sub'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <ExtendInput
        value={blessing}
        onChange={(e) => setBlessing(e.target.value)}
        placeholder="祝福语（默认：恭喜发财，大吉大利）"
      />

      <div className="flex items-center gap-2">
        <ExtendHint>
          {isRandom ? `随机金额 ¥${range[0]} ~ ¥${range[1]}` : '他自己拆开才看得到金额'}
        </ExtendHint>
        <ExtendButton
          className="ml-auto"
          disabled={!valid}
          onClick={() => sendRedPacket(num || 0, isRandom, blessing)}
        >
          塞钱进红包
        </ExtendButton>
      </div>

      <ExtendHint>
        他领不领、隔多久领、要不要回一个红包给你 —— 都在「概率调节引擎 → 递东西」里调。
      </ExtendHint>
    </div>
  )
}
