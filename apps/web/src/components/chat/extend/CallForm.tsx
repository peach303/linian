import { Avatar } from '@/components/common/Avatar'
import { startIncomingCall, startOutgoingCall } from '@/lib/engine/call'
import { useAppStore } from '@/store/useAppStore'
import { useChatStore } from '@/store/useChatStore'
import { useCallStore } from '@/store/useCallStore'
import { useRulesStore } from '@/store/useRulesStore'
import { ExtendHint } from './ui'

/** 语音通话：拨出去之后就是一通真电话（响铃 → 接通或未接 → 通话记录） */
export function CallForm() {
  const dream = useAppStore((s) => s.dream)
  const c = useRulesStore((s) => s.saved.call)
  const closeExtend = useChatStore((s) => s.closeExtend)
  const live = useCallStore((s) => s.live)

  const dial = () => {
    closeExtend()
    startOutgoingCall()
  }

  const callMe = () => {
    closeExtend()
    startIncomingCall()
  }

  return (
    <div className="grid place-items-center gap-3 pt-3">
      <Avatar src={dream.avatarUrl} name={dream.nickname} size={58} ring />
      <div className="text-[13px] text-ink-sub">拨给 {dream.nickname}</div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          disabled={!!live}
          className="tap rounded-full bg-brand px-6 py-2.5 text-[14px] text-white shadow-card disabled:opacity-50"
          onClick={dial}
        >
          📞 拨打语音通话
        </button>
        <button
          disabled={!!live}
          className="tap rounded-full bg-surface px-4 py-2.5 text-[13px] text-ink ring-1 ring-hairline disabled:opacity-50"
          onClick={callMe}
          title="模拟他此刻打给你：会响铃，你可以接或拒绝"
        >
          📲 让他打给我
        </button>
      </div>

      <ExtendHint>
        接通 {Math.round(c.connect.p * 100)}% · 忙线 {Math.round(c.busy.p * 100)}% · 拒绝{' '}
        {Math.round(c.reject.p * 100)}% · 无人接听 {Math.round(c.miss.p * 100)}%
      </ExtendHint>
      <ExtendHint>
        响铃 {c.connect.delay[0]}~{c.connect.delay[1]} 秒接起；通话最长 {c.maxDurationMin} 分钟，
        挂断后聊天里会留下通话记录（这段拿不到真实语音，所以不编通话内容）。
      </ExtendHint>
    </div>
  )
}
