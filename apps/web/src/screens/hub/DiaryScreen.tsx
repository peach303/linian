import { useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { NavBar } from '@/components/common/NavBar'
import {
  DIARY_MOODS,
  daysWithEntries,
  entriesOf,
  entriesOnDay,
  humanDate,
  todayKey,
} from '@/lib/diary'
import { promptHisEntry, hisWindowText, willWriteText } from '@/lib/engine/diary'
import { useAppStore } from '@/store/useAppStore'
import type { DiaryEntry, DiaryMood } from '@/types'

/**
 * 日记
 *
 * 这里不限制条数：同一天可以写很多条，每条各自选公开 / 私密。
 * 私密的那条只有我看得到，但每条第一次保存成私密时有 30% 概率被他破解（之后不重掷）。
 *
 * 他的留言是抽出来的：写不写、几点写、提不提今天真发生的事，都在「设置 → 概率调节引擎 → 日记」，
 * 种子 = 日期 —— 今天他写不写，你早上看和晚上看是同一个答案，刷新也不会重掷。
 * 他提到的事都来自今天的真实记录，没发生过就不提。
 */
export function DiaryScreen() {
  const diary = useAppStore((s) => s.diary)
  const me = useAppStore((s) => s.me)
  const dream = useAppStore((s) => s.dream)
  const saveMyDiary = useAppStore((s) => s.saveMyDiary)
  const removeDiary = useAppStore((s) => s.removeDiary)

  const today = todayKey()
  const myToday = entriesOf(diary, me.id, today)
  const hisToday = entriesOf(diary, dream.id, today)

  const [mood, setMood] = useState<DiaryMood>('😊')
  const [text, setText] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [editingId, setEditingId] = useState<string | null>(null)
  const composerRef = useRef<HTMLDivElement>(null)

  const days = useMemo(() => daysWithEntries(diary), [diary])
  const pastDays = days.filter((d) => d !== today)

  const resetComposer = () => {
    setEditingId(null)
    setMood('😊')
    setText('')
    setVisibility('public')
  }

  const startEdit = (entry: DiaryEntry) => {
    setEditingId(entry.id)
    setMood(entry.mood)
    setText(entry.text)
    setVisibility(entry.visibility ?? 'public')
    requestAnimationFrame(() => composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const submit = () => {
    if (!text.trim()) return
    saveMyDiary({
      id: editingId ?? undefined,
      date: today,
      mood,
      text,
      visibility,
    })
    resetComposer()
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-page">
      <NavBar title="日记" right={<span className="pr-1 text-[12px] text-ink-faint">{humanDate(today)}</span>} />

      <div className="no-scrollbar flex-1 overflow-y-auto px-3 pb-6">
        <div className="mt-3 rounded-2xl bg-surface p-3.5 shadow-card">
          <h3 className="text-[13px] font-medium text-ink">日记</h3>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-sub">
            想写就写，<b className="text-ink">不限条数</b>；同一天写很多条也可以。每一条都能单独选公开或私密。
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-sub">
            他的留言是抽出来的（「设置 → 概率调节引擎 → 日记」），<b className="text-ink">种子 = 日期</b> ——
            今天他写不写，你早上看和晚上看是同一个答案，刷新不会重掷。他提到的事都来自<b className="text-ink">今天的真实记录</b>，
            没发生过就不提。
          </p>
        </div>

        {/* 我的：写法不限制条数，下面按写下的顺序列出今天已经写过的 */}
        <div ref={composerRef} className="mt-3 scroll-mt-3 rounded-2xl bg-surface p-3.5 shadow-card">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium text-ink">我写的</span>
            {editingId && <span className="text-[10px] text-brand-deep">正在改一条</span>}
            <span className="ml-auto text-[11px] text-ink-faint">
              今天 {myToday.length} 条
            </span>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {DIARY_MOODS.map((m) => (
              <button
                key={m.mood}
                className={clsx(
                  'tap flex items-center gap-1 rounded-full px-2 py-1 text-[11px]',
                  mood === m.mood ? 'bg-brand text-white' : 'bg-page text-ink-sub ring-1 ring-hairline',
                )}
                onClick={() => setMood(m.mood)}
              >
                <span className="text-[13px] leading-none">{m.mood}</span>
                {m.label}
              </button>
            ))}
          </div>

          <textarea
            className="mt-2 h-28 w-full resize-none rounded-xl bg-page px-3 py-2 text-[13px] leading-relaxed text-ink outline-none ring-1 ring-hairline placeholder:text-ink-faint"
            placeholder="想记下什么？可以写很多条。"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />

          <div className="mt-2 flex items-center gap-1.5">
            <button
              className={clsx(
                'tap rounded-lg px-2.5 py-1 text-[11px] ring-1',
                visibility === 'public'
                  ? 'bg-brand/10 text-brand-deep ring-brand/30'
                  : 'bg-page text-ink-sub ring-hairline',
              )}
              onClick={() => setVisibility('public')}
            >
              公开
            </button>
            <button
              className={clsx(
                'tap rounded-lg px-2.5 py-1 text-[11px] ring-1',
                visibility === 'private'
                  ? 'bg-[#fff1f3] text-[#9b3d55] ring-[#f3c7d1]'
                  : 'bg-page text-ink-sub ring-hairline',
              )}
              onClick={() => setVisibility('private')}
            >
              私密
            </button>
            <span className="ml-1 text-[10px] leading-snug text-ink-faint">
              {visibility === 'private'
                ? '这条只有你能看；第一次保存时有 30% 概率被他破解（写死，不在概率页里调）'
                : '公开：他看得到'}
            </span>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <button
              className="tap rounded-xl bg-brand px-4 py-2 text-[12.5px] font-medium text-white disabled:opacity-40"
              disabled={!text.trim()}
              onClick={submit}
            >
              {editingId ? '保存修改' : '记下来'}
            </button>
            {editingId && (
              <button
                className="tap rounded-xl bg-page px-3 py-2 text-[12px] text-ink-faint ring-1 ring-hairline"
                onClick={resetComposer}
              >
                取消
              </button>
            )}
            <span className="ml-auto shrink-0 text-[10px] text-ink-faint">
              {editingId ? '改完只影响这一条' : '写几条都可以'}
            </span>
          </div>

          {myToday.length > 0 && (
            <div className="mt-3 space-y-2">
              {myToday.map((entry) => (
                <MyEntryCard
                  key={entry.id}
                  entry={entry}
                  editing={editingId === entry.id}
                  onEdit={() => startEdit(entry)}
                  onDelete={() => {
                    removeDiary(entry.id)
                    if (editingId === entry.id) resetComposer()
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* 他的 */}
        <div className="mt-3 rounded-2xl bg-surface p-3.5 shadow-card">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium text-ink">{dream.nickname} 的留言</span>
            {hisToday.some((e) => e.byEngine) && (
              <span className="rounded-full bg-brand-soft px-1.5 py-0.5 text-[9px] text-brand-deep">抽签</span>
            )}
            <span className="ml-auto text-[11px] text-ink-faint">
              {hisToday.length ? `今天写了 ${hisToday.length} 条` : '今天还没写'}
            </span>
          </div>

          {hisToday.length ? (
            <div className="mt-2 space-y-2">
              {hisToday.map((entry) => (
                <div key={entry.id} className="rounded-xl bg-page p-3 ring-1 ring-hairline">
                  <div className="flex items-start gap-2">
                    <span className="text-[18px] leading-none">{entry.mood}</span>
                    <p className="min-w-0 flex-1 whitespace-pre-wrap text-[13px] leading-[1.85] text-ink">{entry.text}</p>
                  </div>
                  {!!entry.facts?.length && (
                    <div className="mt-2 rounded-xl bg-brand-soft/50 p-2.5">
                      <p className="text-[10px] text-ink-faint">取材自今天的真实记录（不是我编的）：</p>
                      <ul className="mt-1 space-y-0.5">
                        {entry.facts.map((f) => (
                          <li key={f} className="text-[10.5px] leading-snug text-brand-deep">
                            · {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className="text-[10px] text-ink-faint">
                      写于 {new Date(entry.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <button
                      className="tap ml-auto rounded-lg bg-page px-2.5 py-1.5 text-[10.5px] text-ink-faint ring-1 ring-hairline"
                      onClick={() => removeDiary(entry.id)}
                    >
                      删掉
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-2 flex flex-col items-center gap-2 rounded-xl bg-page py-6 text-center ring-1 ring-hairline">
              <span className="text-3xl">📔</span>
              <p className="text-[12px] text-ink">他今天还没写</p>
              <p className="text-[10.5px] leading-relaxed text-ink-faint">
                {willWriteText(today) === '会写'
                  ? `今天他会写，一般在你睡前那段（${hisWindowText()} 之间）—— 到点回到这页就能看到，不是「在加载」，是真的还没到点。`
                  : '今天他不打算写（抽签结果，刷新也不会变）。'}
              </p>
              {willWriteText(today) === '会写' && (
                <button
                  className="tap rounded-lg bg-page px-3 py-1.5 text-[11px] text-brand-deep ring-1 ring-hairline"
                  onClick={() => promptHisEntry()}
                >
                  现在就写（本来就是今天他写）
                </button>
              )}
            </div>
          )}
        </div>

        {/* 以前的 */}
        <div className="mt-3 rounded-2xl bg-surface p-3.5 shadow-card">
          <h3 className="text-[13px] font-medium text-ink">以前的</h3>
          {pastDays.length === 0 ? (
            <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
              今天之前还没有。今天想写几条都可以。
            </p>
          ) : (
            <ul className="mt-2 space-y-2.5">
              {pastDays.map((d) => {
                const list = entriesOnDay(diary, d)
                return (
                  <li key={d} className="border-t border-hairline pt-2.5 first:border-0 first:pt-0">
                    <p className="text-[11px] text-ink-faint">{humanDate(d)}</p>
                    <div className="mt-1 space-y-1.5">
                      {list.map((entry) => (
                        <HistoryLine
                          key={entry.id}
                          who={entry.authorId === me.id ? '我' : dream.nickname}
                          entry={entry}
                          mine={entry.authorId === me.id}
                        />
                      ))}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <p className="mt-4 text-center text-[10px] leading-relaxed text-ink-faint">
          这里没有「自动编一段日记」：他的留言按天抽签，提到的事都从今天的真实记录里数。
        </p>
      </div>
    </div>
  )
}

function MyEntryCard({
  entry,
  editing,
  onEdit,
  onDelete,
}: {
  entry: DiaryEntry
  editing: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className={clsx('rounded-xl bg-page p-3 ring-1', editing ? 'ring-brand/40' : 'ring-hairline')}>
      <div className="flex items-center gap-2">
        <span className="text-[16px] leading-none">{entry.mood}</span>
        <span
          className={clsx(
            'rounded-full px-1.5 py-0.5 text-[9px]',
            entry.visibility === 'private'
              ? 'bg-[#fff1f3] text-[#b34b63] ring-1 ring-[#f3c7d1]'
              : 'bg-brand-soft text-brand-deep',
          )}
        >
          {entry.visibility === 'private' ? '私密' : '公开'}
        </span>
        <span className="ml-auto text-[10px] text-ink-faint">
          {new Date(entry.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          {entry.editedAt ? ' · 改过' : ''}
        </span>
      </div>
      <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-[1.85] text-ink">{entry.text}</p>
      {entry.visibility === 'private' && (
        <div
          className={clsx(
            'mt-2 rounded-lg px-2.5 py-2 text-[10.5px] leading-snug ring-1',
            entry.cracked
              ? 'bg-[#fff1f3] text-[#9b3d55] ring-[#f3c7d1]'
              : 'bg-surface text-ink-faint ring-hairline',
          )}
        >
          {entry.cracked
            ? '🔓 他破解了这一条。私密日记默认有 30% 概率被他看到，这一条已经命中。'
            : '🔒 只有你能看。默认有 30% 概率被他破解，这一条没有。'}
        </div>
      )}
      <div className="mt-2 flex items-center gap-1.5">
        <button
          className="tap rounded-lg bg-surface px-2.5 py-1.5 text-[11px] text-ink-sub ring-1 ring-hairline"
          onClick={onEdit}
        >
          {editing ? '正在改' : '改一改'}
        </button>
        <button
          className="tap rounded-lg bg-surface px-2.5 py-1.5 text-[11px] text-ink-faint ring-1 ring-hairline"
          onClick={onDelete}
        >
          删掉
        </button>
      </div>
    </div>
  )
}

function HistoryLine({ who, entry, mine = true }: { who: string; entry: DiaryEntry; mine?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <span className={clsx('w-14 shrink-0 pt-0.5 text-[10.5px]', mine ? 'text-ink-sub' : 'text-brand-deep')}>
        {entry.visibility === 'private' ? (entry.cracked ? '🔓' : '🔒') : ''} {entry.mood} {who}
      </span>
      <p className="min-w-0 flex-1 whitespace-pre-wrap text-[11.5px] leading-relaxed text-ink">{entry.text}</p>
    </div>
  )
}
