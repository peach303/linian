import { EXTEND_ACTIONS } from '@/mock/chat'
import { PatPanel } from '@/components/chat/PatPanel'
import { ChoiceForm } from '@/components/chat/extend/ChoiceForm'
import { QuestionForm } from '@/components/chat/extend/QuestionForm'
import { RedPacketForm } from '@/components/chat/extend/RedPacketForm'
import { GiftForm } from '@/components/chat/extend/GiftForm'
import { CallForm } from '@/components/chat/extend/CallForm'
import { MusicForm } from '@/components/chat/extend/MusicForm'
import { DoodleForm } from '@/components/chat/extend/DoodleForm'
import { ImageForm } from '@/components/chat/extend/ImageForm'
import { useChatStore } from '@/store/useChatStore'
import type { ExtendAction } from '@/types'

/**
 * 「+」号扩展面板：9 个入口（拍一拍 / 语音通话 / 图片 / 抉择 / 问卷 / 红包 / 音乐 / 礼物 / 涂鸦）。
 * 每个入口打开一个二级页。
 */
export function ExtendPanel() {
  const { extendOpen, extendPanel, openExtend, closeExtend } = useChatStore()
  if (!extendOpen) return null

  if (extendPanel !== 'main') {
    return <ExtendSubPage panel={extendPanel} />
  }

  return (
    <div className="grid shrink-0 grid-cols-4 gap-y-4 border-t border-hairline bg-page px-4 py-4 safe-bottom">
      {EXTEND_ACTIONS.map((a) => (
        <button
          key={a.key}
          className="tap flex flex-col items-center gap-1.5"
          onClick={() => openExtend(a.key as ExtendAction)}
        >
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-surface text-[26px] shadow-card">
            {a.icon}
          </span>
          <span className="text-[11px] text-ink-sub">{a.label}</span>
        </button>
      ))}
      <div className="col-span-4 mt-1 flex justify-center gap-1.5">
        {[0, 1].map((i) => (
          <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === 0 ? 'bg-brand' : 'bg-ink-faint/40'}`} />
        ))}
      </div>
      <button className="col-span-4 py-1 text-[12px] text-ink-faint" onClick={closeExtend}>
        收起
      </button>
    </div>
  )
}

/** 二级扩展页：语音通话 / 图片 / 抉择 / 问卷 / 红包 / 音乐 / 礼物柜 / 涂鸦 */
function ExtendSubPage({ panel }: { panel: ExtendAction }) {
  const closeExtend = useChatStore((s) => s.closeExtend)
  const backToMain = useChatStore((s) => s.openExtend)

  const TITLES: Record<ExtendAction, string> = {
    PAT: '拍一拍',
    CALL: '语音通话',
    IMAGE: '发送图片',
    CHOICE: '抉择 · 帮我选',
    QUESTION: '问卷',
    RED_PACKET: '红包',
    MUSIC: '音乐邀请',
    GIFT: '礼物柜',
    DOODLE: '涂鸦',
  }

  return (
    <div className="flex h-64 shrink-0 flex-col border-t border-hairline bg-page safe-bottom">
      <div className="flex items-center gap-2 px-3 py-2">
        <button className="tap text-[13px] text-ink-sub" onClick={() => backToMain('main')}>
          ‹ 全部功能
        </button>
        <span className="ml-auto text-[12px] text-ink-faint">{TITLES[panel]}</span>
        <button className="tap text-[13px] text-ink-faint" onClick={closeExtend}>
          ✕
        </button>
      </div>
      <div className="no-scrollbar flex-1 overflow-y-auto px-4 pb-4">
        <PanelBody panel={panel} />
      </div>
    </div>
  )
}

function PanelBody({ panel }: { panel: ExtendAction }) {
  switch (panel) {
    case 'PAT':
      return <PatPanel />
    case 'CALL':
      return <CallForm />
    case 'IMAGE':
      return <ImageForm />
    case 'CHOICE':
      return <ChoiceForm />
    case 'QUESTION':
      return <QuestionForm />
    case 'RED_PACKET':
      return <RedPacketForm />
    case 'MUSIC':
      return <MusicForm />
    case 'GIFT':
      return <GiftForm />
    case 'DOODLE':
      return <DoodleForm />
  }
}
