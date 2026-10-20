import clsx from 'clsx'
import { useState } from 'react'
import { clipFromMessage, removeClip } from '@/lib/voiceFav'
import { favoriteFromMessage, pickFavoriteReason } from '@/lib/favorites'
import { useAppStore } from '@/store/useAppStore'
import { useChatStore } from '@/store/useChatStore'
import type { Message } from '@/types'

/**
 * 消息长按菜单 + 抽签复盘
 *
 * 「看抽签」是拟真引擎的可见窗口：每一条他发的消息都带着出稿时的抽签轨迹
 *（`message.plan`，对应 DB 的 `messages.plan JSONB`），点开就能看到
 * 「已读不回 → 拍一拍 → 载体抽签 → …」每一步命中了没有、用了哪张卡、为什么跳过语音。
 */
export function MessageActionSheet({
  message,
  mine,
  onClose,
}: {
  message: Message
  mine: boolean
  onClose: () => void
}) {
  const [view, setView] = useState<'actions' | 'trace'>('actions')
  /** 收藏的那点事（收藏完给个回执，不静默） */
  const [note, setNote] = useState('')
  const recall = useChatStore((s) => s.recall)
  const setQuote = useChatStore((s) => s.setQuote)
  const clips = useAppStore((s) => s.voices)
  const addVoice = useAppStore((s) => s.addVoice)
  const favorites = useAppStore((s) => s.favorites)
  const favoriteReasons = useAppStore((s) => s.favoriteReasons)
  const addFavorite = useAppStore((s) => s.addFavorite)
  const removeFavorite = useAppStore((s) => s.removeFavorite)

  const canRecall = mine && message.status !== 'RECALLED'
  const canQuote = !mine && Boolean(message.text)
  const plan = message.plan
  /** 语音消息（且真的带音频）才能收藏 */
  const canFav = message.kind === 'VOICE' && Boolean(String(message.payload?.url ?? message.audioUrl ?? ''))
  const clip = clips.find((v) => v.messageId === message.id)
  const favKind = message.kind === 'VOICE' ? 'VOICE' : 'MESSAGE'
  const myFav = favorites.find((f) => f.owner === 'me' && f.kind === favKind && f.refId === message.id)
  const hisFav = favorites.find((f) => f.owner === 'dream' && f.kind === favKind && f.refId === message.id)
  const canCollect = message.kind !== 'SYSTEM' && message.kind !== 'PAT' && message.kind !== 'CALL_EVENT'

  if (view === 'trace' && plan) {
    return (
      <div className="absolute inset-0 z-30 flex flex-col justify-end">
        <button className="flex-1 bg-black/25" onClick={onClose} aria-label="关闭" />
        <div className="flex max-h-[80%] flex-col overflow-hidden rounded-t-2xl bg-surface shadow-phone">
          <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
            <h3 className="text-[15px] font-medium text-ink">{mine ? '他怎么看这条' : '这一条是怎么来的'}</h3>
            <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[10px] text-brand-deep">
              {plan.engine === 'web-local' ? '本机出稿' : '服务端出稿'}
            </span>
            <button className="tap ml-auto text-[13px] text-ink-faint" onClick={onClose}>
              ✕
            </button>
          </div>

          <div className="no-scrollbar flex-1 space-y-1.5 overflow-y-auto px-4 py-3">
            {plan.steps.map((s) => (
              <div key={s.no} className="flex items-start gap-2 rounded-xl bg-page px-3 py-2">
                <span
                  className={clsx(
                    'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px]',
                    s.hit === true ? 'bg-brand text-white' : s.hit === false ? 'bg-ink-faint/25 text-ink-sub' : 'bg-brand-soft text-brand-deep',
                  )}
                >
                  {s.no}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-[13px] text-ink">{s.label}</span>
                    {s.hit === true && <span className="text-[10px] text-brand-deep">命中</span>}
                    {s.hit === false && <span className="text-[10px] text-ink-faint">未命中</span>}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-faint">{s.detail}</span>
                </span>
              </div>
            ))}

            {!!plan.skipped?.length && (
              <div className="rounded-xl bg-[#fff7e6] px-3 py-2 text-[11px] leading-relaxed text-[#8a6d1f] ring-1 ring-[#f0dfae]">
                跳过：{plan.skipped.join('；')}
              </div>
            )}

            <div className="flex flex-wrap gap-x-3 gap-y-1 px-1 pt-1 text-[11px] text-ink-faint">
              {plan.carrier && <span>载体：{plan.carrier}</span>}
              {plan.cardIds?.length ? <span>用卡 {plan.cardIds.length} 张</span> : null}
              {message.latencyMs ? <span>拟真延迟 {(message.latencyMs / 1000).toFixed(1)}s</span> : null}
              <span>规则 v{plan.rulesVersion}</span>
            </div>

            {mine && (
              <div className="mt-1.5 rounded-xl bg-page px-3 py-2 text-[11px] leading-relaxed text-ink-sub ring-1 ring-hairline">
                {plan.silent
                  ? '结果：已读不回 —— 他点开看了，第 1 步抽签就命中，所以这条不回（角标会显示「已读不回」）'
                  : '结果：已读 —— 他看过之后按上面的抽签发回来了（气泡下方角标会显示「已读」）'}
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-hairline px-4 py-2.5 pb-4">
            <button
              className="tap w-full rounded-lg bg-page py-2 text-[13px] text-ink-sub ring-1 ring-hairline"
              onClick={() => setView('actions')}
            >
              返回
            </button>
          </div>
        </div>
      </div>
    )
  }

  const row = (label: string, onClick: () => void, danger = false) => (
    <button
      className={clsx(
        'tap w-full border-b border-hairline px-4 py-3 text-left text-[14px] last:border-0',
        danger ? 'text-[#e0533d]' : 'text-ink',
      )}
      onClick={onClick}
    >
      {label}
    </button>
  )

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end">
      <button className="flex-1 bg-black/25" onClick={onClose} aria-label="关闭" />
      <div className="overflow-hidden rounded-t-2xl bg-surface shadow-phone">
        <div className="border-b border-hairline px-4 py-3 text-[12px] text-ink-faint">
          {mine ? '我' : '他'}：{message.text?.slice(0, 24) ?? '（无文字）'}
        </div>
        {note && <div className="border-b border-hairline bg-page px-4 py-2 text-[11px] leading-snug text-ink-sub">{note}</div>}
        {canQuote &&
          row('引用这条回复他', () => {
            setQuote(message)
            onClose()
          })}
        {message.text &&
          row('复制', () => {
            void navigator.clipboard?.writeText(message.text ?? '')
            onClose()
          })}
        {canFav &&
          (clip
            ? row(`取消收藏（已收进「功能 · 收藏 ⭐」${clip.cardId ? ' · 已变成语音字卡' : ''}）`, () => {
                removeClip(clip)
                if (myFav) removeFavorite(myFav.id)
                setNote('已取消收藏（如果它配在字卡上，那张卡的语音也一起清掉了）')
              })
            : row('⭐ 收藏这段语音', () => {
                const draft = clipFromMessage(message, mine)
                if (!draft) {
                  setNote('这条没有音频，收不了')
                  return
                }
                addVoice(draft)
                if (!mine) addFavorite(favoriteFromMessage(message, 'me'))
                setNote('已收藏 → 「功能 · 收藏 ⭐」里可以试听、改名、变成语音字卡（抽到就发这段，不再花钱）')
              }))}
        {canCollect && message.kind !== 'VOICE' && !mine &&
          (myFav
            ? row('取消收藏（已在「功能 · 收藏 ⭐」）', () => {
                removeFavorite(myFav.id)
                setNote('已经从收藏里拿掉了；原件不会被删。')
              })
            : row('⭐ 收藏这条', () => {
                addFavorite(favoriteFromMessage(message, 'me'))
                setNote('已收藏 → 「功能 · 收藏 ⭐」的「我收藏的」里，按聊天 / 字卡 / 推送分好了。')
              }))}
        {canCollect && mine &&
          (hisFav ? (
            <div className="border-b border-hairline bg-page px-4 py-2.5 text-[11px] leading-snug text-ink-sub">
              他收藏了这条{hisFav.reason ? ` · 原因：${hisFav.reason}` : ''}
            </div>
          ) : (
            row('让他收藏这条（他会写一句原因）', () => {
              addFavorite({
                ...favoriteFromMessage(message, 'dream'),
                reason: pickFavoriteReason(favoriteReasons),
              })
              setNote('他收下了，原因写在「功能 · 收藏 ⭐ → 他收藏的」里。')
            })
          ))}
        {plan &&
          row('看抽签（这一条怎么来的）', () => setView('trace'))}
        {canRecall &&
          row(
            '撤回',
            () => {
              recall(message.id)
              onClose()
            },
            true,
          )}
        <button className="tap w-full border-t border-hairline px-4 py-3 text-[14px] text-ink-sub" onClick={onClose}>
          取消
        </button>
      </div>
    </div>
  )
}
