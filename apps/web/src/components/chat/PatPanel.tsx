import clsx from 'clsx'
import { useState } from 'react'
import { hisPatLine, myPatLine } from '@/lib/pats'
import { useAppStore } from '@/store/useAppStore'
import { useChatStore } from '@/store/useChatStore'
import type { PatSide } from '@/types'

/**
 * 拍一拍库（聊天「+」→ 拍一拍 / 点他的头像 / 双击他的头像）
 *
 *  我的拍一拍：点一下就拍他（「你」拍了拍「梦角」的×××）
 *  他的拍一拍：他拍我时由引擎随机抽一条（「梦角」拍了拍我的×××），可以逐条开关
 * 两边都能自己加：系统默认几条 + 你随便写。
 */
export function PatPanel() {
  const pats = useAppStore((s) => s.pats)
  const dreamName = useAppStore((s) => s.dream.nickname)
  const meName = useAppStore((s) => s.me.nickname)
  const addPat = useAppStore((s) => s.addPat)
  const removePat = useAppStore((s) => s.removePat)
  const togglePat = useAppStore((s) => s.togglePat)
  const sendPat = useChatStore((s) => s.sendPat)

  const [draftMine, setDraftMine] = useState('')
  const [draftHis, setDraftHis] = useState('')

  const add = (side: PatSide, value: string, clear: () => void) => {
    if (!value.trim()) return
    addPat(side, value)
    clear()
  }

  return (
    <div className="space-y-3 pt-1">
      {/* ── 我的拍一拍：点一下发出去 ── */}
      <section>
        <div className="mb-1.5 flex items-baseline gap-2">
          <h4 className="text-[13px] font-medium text-ink">我的拍一拍</h4>
          <span className="text-[11px] text-ink-faint">点一下就拍「{dreamName}」</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {pats.mine.map((p) => (
            <span
              key={p.id}
              className="group inline-flex items-center gap-1 rounded-full bg-surface pl-2.5 pr-1 py-1 text-[12px] text-ink shadow-card ring-1 ring-hairline"
            >
              <button className="tap" onClick={() => sendPat(p.text)} title={myPatLine(dreamName, p.text, meName)}>
                {myPatLine(dreamName, p.text, meName)}
              </button>
              <button
                className="tap grid h-4 w-4 place-items-center rounded-full text-[10px] text-ink-faint hover:bg-hairline/70"
                onClick={() => removePat('mine', p.id)}
                title="删掉这条"
              >
                ✕
              </button>
            </span>
          ))}
          {pats.mine.length === 0 && <span className="text-[11px] text-ink-faint">还没有，下面加一条吧</span>}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            value={draftMine}
            onChange={(e) => setDraftMine(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add('mine', draftMine, () => setDraftMine(''))}
            placeholder="加一条我的拍一拍（如：小脑袋）"
            className="min-w-0 flex-1 rounded-lg bg-page px-2.5 py-1.5 text-[12px] text-ink outline-none ring-1 ring-hairline focus:ring-brand placeholder:text-ink-faint"
          />
          <button
            className="tap shrink-0 rounded-lg bg-brand px-3 py-1.5 text-[12px] text-white"
            onClick={() => add('mine', draftMine, () => setDraftMine(''))}
          >
            添加
          </button>
        </div>
      </section>

      <div className="border-t border-hairline" />

      {/* ── 他的拍一拍：引擎抽签用 ── */}
      <section>
        <div className="mb-1.5 flex items-baseline gap-2">
          <h4 className="text-[13px] font-medium text-ink">他的拍一拍</h4>
          <span className="text-[11px] text-ink-faint">他拍你时随机抽一条（关掉就不抽）</span>
        </div>
        <ul className="divide-y divide-hairline overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-hairline">
          {pats.his.map((p) => (
            <li key={p.id} className="flex items-center gap-2 px-2.5 py-1.5">
              <span className={clsx('flex-1 text-[12px]', p.enabled ? 'text-ink' : 'text-ink-faint line-through')}>
                {hisPatLine(dreamName, p.text, meName)}
              </span>
              <button
                className={clsx(
                  'tap rounded-full px-2 py-0.5 text-[11px] ring-1',
                  p.enabled ? 'bg-brand/15 text-brand-deep ring-brand' : 'bg-page text-ink-faint ring-hairline',
                )}
                onClick={() => togglePat('his', p.id)}
              >
                {p.enabled ? '启用' : '已关'}
              </button>
              <button
                className="tap grid h-5 w-5 place-items-center rounded-full text-[11px] text-ink-faint hover:bg-hairline/70"
                onClick={() => removePat('his', p.id)}
                title="删掉这条"
              >
                ✕
              </button>
            </li>
          ))}
          {pats.his.length === 0 && (
            <li className="px-3 py-3 text-center text-[11px] text-ink-faint">还没有，下面加一条吧</li>
          )}
        </ul>
        <div className="mt-2 flex items-center gap-2">
          <input
            value={draftHis}
            onChange={(e) => setDraftHis(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add('his', draftHis, () => setDraftHis(''))}
            placeholder="加一条他的拍一拍（如：后脑勺）"
            className="min-w-0 flex-1 rounded-lg bg-page px-2.5 py-1.5 text-[12px] text-ink outline-none ring-1 ring-hairline focus:ring-brand placeholder:text-ink-faint"
          />
          <button
            className="tap shrink-0 rounded-lg bg-brand px-3 py-1.5 text-[12px] text-white"
            onClick={() => add('his', draftHis, () => setDraftHis(''))}
          >
            添加
          </button>
        </div>
      </section>
    </div>
  )
}
