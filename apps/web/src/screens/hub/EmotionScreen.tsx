import { useMemo, useState } from 'react'
import { NavBar } from '@/components/common/NavBar'
import { Switch } from '@/components/settings/controls'
import { BUILTIN_TAGS } from '@/lib/engine/compose'
import { nid } from '@/lib/ids'
import { useAppStore } from '@/store/useAppStore'
import { useChatStore } from '@/store/useChatStore'
import type { EmotionTag } from '@/types'

const KINDS: { key: EmotionTag['kind']; label: string }[] = [
  { key: 'EMOTION', label: '情绪' },
  { key: 'INTENTION', label: '意图' },
  { key: 'HEART', label: '心意' },
]

const COLORS = ['#9cc4ec', '#f2a7b8', '#a8d8c8', '#f3c98b', '#b9b3e6']

/**
 * 情绪意图（功能 → 情绪意图）
 *
 * 这里管的是**聊天气泡上那几个小标签**（`message.emotionTags`）：
 *  · 系统默认的标签可以关掉（关掉之后引擎就不再推它）
 *  · 自己加标签 = 给一个名字 + 一组触发词（例如「宝宝 / 抱抱」→「亲昵」）
 *    引擎造句时会先看这些词，命中就把你的标签打上
 *  · 下面显示每个标签真的被用过多少次（从聊天记录现算，不是编的）
 *
 * 它不会伪造「我读到了什么」：没命中任何词时还是走内置规则，内置也没命中就退回「温柔」。
 */
export function EmotionScreen() {
  const emotionTags = useAppStore((s) => s.emotionTags)
  const upsertEmotionTag = useAppStore((s) => s.upsertEmotionTag)
  const removeEmotionTag = useAppStore((s) => s.removeEmotionTag)
  const toggleEmotionTag = useAppStore((s) => s.toggleEmotionTag)
  const messages = useChatStore((s) => s.messages)

  const [draft, setDraft] = useState<EmotionTag | null>(null)
  const [words, setWords] = useState('')

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of messages) for (const t of m.emotionTags ?? []) map.set(t, (map.get(t) ?? 0) + 1)
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [messages])

  const countOf = (name: string) => counts.find(([t]) => t === name)?.[1] ?? 0
  const builtinEntry = (name: string) => emotionTags.find((t) => t.builtin && t.name === name)
  const custom = emotionTags.filter((t) => !t.builtin)

  const toggleBuiltin = (name: string, on: boolean) => {
    const cur = builtinEntry(name)
    upsertEmotionTag(
      cur
        ? { ...cur, enabled: on }
        : { id: `b_${name}`, name, kind: 'EMOTION', color: '#9cc4ec', builtin: true, enabled: on },
    )
  }

  const startNew = () => {
    setDraft({ id: nid('et'), name: '', kind: 'EMOTION', color: COLORS[0] })
    setWords('')
  }

  const startEdit = (t: EmotionTag) => {
    setDraft({ ...t })
    setWords((t.words ?? []).join('、'))
  }

  const save = () => {
    if (!draft) return
    const name = draft.name.trim()
    if (!name) return
    const list = words
      .split(/[,，、\s]+/)
      .map((w) => w.trim())
      .filter(Boolean)
    upsertEmotionTag({ ...draft, name, words: list, enabled: draft.enabled !== false })
    setDraft(null)
    setWords('')
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-page">
      <NavBar
        title="情绪意图"
        right={
          <button className="tap px-2 py-1 text-[13px] text-brand-deep" onClick={startNew}>
            ＋ 新标签
          </button>
        }
      />

      <div className="no-scrollbar flex-1 space-y-3 overflow-y-auto px-3 py-3">
        <p className="rounded-xl bg-white/70 px-3 py-2 text-[12px] leading-relaxed text-ink-sub shadow-card">
          标签会出现在聊天气泡上：你发的话 → 他「读到的情绪」；他发的话 → 这条消息的标签。
          这里加的词只影响推断，不会凭空多出一条消息。
        </p>

        {/* ── 真的被用过多少次 ── */}
        <section className="rounded-2xl bg-surface p-3 shadow-card">
          <div className="text-[14px] font-medium text-ink">最近真的出现过</div>
          {counts.length === 0 ? (
            <p className="mt-1 text-[12px] text-ink-faint">还没有标签 —— 去聊天页说几句，或者等他回你。</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {counts.slice(0, 14).map(([t, n]) => (
                <span key={t} className="rounded-full bg-brand-soft/50 px-2 py-1 text-[11px] text-brand-deep">
                  {t} <span className="text-ink-faint">×{n}</span>
                </span>
              ))}
            </div>
          )}
        </section>

        {/* ── 编辑器 ── */}
        {draft && (
          <section className="rounded-2xl bg-surface p-3 shadow-card ring-1 ring-brand-soft">
            <div className="mb-2 flex items-center">
              <span className="text-[14px] font-medium text-ink">{draft.id.startsWith('et_') ? '新标签' : '编辑标签'}</span>
              <button className="tap ml-auto text-[12px] text-ink-faint" onClick={() => setDraft(null)}>
                取消
              </button>
            </div>

            <label className="block text-[11px] text-ink-faint">标签名字</label>
            <input
              className="mt-1 w-full rounded-lg bg-page px-2.5 py-2 text-[13px] text-ink outline-none ring-1 ring-hairline focus:ring-brand"
              value={draft.name}
              placeholder="例如：亲昵 / 想被哄"
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />

            <div className="mt-2">
              <div className="text-[11px] text-ink-faint">类型</div>
              <div className="mt-1 flex gap-1.5">
                {KINDS.map((k) => (
                  <button
                    key={k.key}
                    className={`tap rounded-full px-3 py-1 text-[12px] ${
                      draft.kind === k.key ? 'bg-brand text-white' : 'bg-page text-ink-sub ring-1 ring-hairline'
                    }`}
                    onClick={() => setDraft({ ...draft, kind: k.key })}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="mt-2 block text-[11px] text-ink-faint">触发词（逗号 / 顿号 / 空格分开，命中任意一个就打上）</label>
            <input
              className="mt-1 w-full rounded-lg bg-page px-2.5 py-2 text-[13px] text-ink outline-none ring-1 ring-hairline focus:ring-brand"
              value={words}
              placeholder="宝宝、抱抱、亲亲"
              onChange={(e) => setWords(e.target.value)}
            />

            <div className="mt-2">
              <div className="text-[11px] text-ink-faint">颜色</div>
              <div className="mt-1 flex gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    className={`tap h-6 w-6 rounded-full ring-2 ${draft.color === c ? 'ring-brand-deep' : 'ring-transparent'}`}
                    style={{ background: c }}
                    onClick={() => setDraft({ ...draft, color: c })}
                    title={c}
                  />
                ))}
              </div>
            </div>

            <button className="tap mt-3 w-full rounded-lg bg-brand py-2.5 text-[14px] font-medium text-white disabled:opacity-50" disabled={!draft.name.trim()} onClick={save}>
              保存
            </button>
          </section>
        )}

        {/* ── 系统默认 ── */}
        <section className="rounded-2xl bg-surface p-3 shadow-card">
          <div className="text-[14px] font-medium text-ink">系统默认</div>
          <p className="mt-0.5 text-[11px] text-ink-faint">内置的正则推断；关掉之后引擎就不会再推这个标签。</p>
          <div className="mt-1 divide-y divide-hairline">
            {BUILTIN_TAGS.map((name) => {
              const entry = builtinEntry(name)
              const on = entry?.enabled !== false
              return (
                <div key={name} className="flex items-center gap-2 py-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{name}</span>
                  <span className="shrink-0 text-[11px] text-ink-faint">{countOf(name) ? `用过 ${countOf(name)} 次` : '还没出现'}</span>
                  <Switch checked={on} onChange={(v) => toggleBuiltin(name, v)} />
                </div>
              )
            })}
          </div>
        </section>

        {/* ── 我加的 ── */}
        <section className="rounded-2xl bg-surface p-3 shadow-card">
          <div className="flex items-center">
            <span className="text-[14px] font-medium text-ink">我加的标签</span>
            <button className="tap ml-auto text-[12px] text-brand-deep" onClick={startNew}>
              ＋ 新标签
            </button>
          </div>

          {custom.length === 0 ? (
            <p className="mt-1 text-[12px] leading-relaxed text-ink-faint">
              还没有。加一个试试：名字写「亲昵」，触发词写「宝宝、抱抱」——以后他说到这些词，气泡上就会有这个标签。
            </p>
          ) : (
            <div className="mt-1 divide-y divide-hairline">
              {custom.map((t) => (
                <div key={t.id} className="flex items-center gap-2 py-2">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: t.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] text-ink">{t.name}</span>
                      <span className="shrink-0 rounded-full bg-page px-1.5 py-0.5 text-[10px] text-ink-faint">
                        {KINDS.find((k) => k.key === t.kind)?.label ?? '情绪'}
                      </span>
                    </div>
                    <div className="truncate text-[11px] text-ink-faint">
                      {(t.words ?? []).length ? (t.words ?? []).join('、') : '没有触发词（只会显示在统计里）'}
                      {countOf(t.name) ? ` · 用过 ${countOf(t.name)} 次` : ''}
                    </div>
                  </div>
                  <button className="tap shrink-0 text-[12px] text-brand-deep" onClick={() => startEdit(t)}>
                    编辑
                  </button>
                  <button
                    className="tap shrink-0 text-[12px] text-ink-faint"
                    onClick={() => {
                      if (confirm(`删掉标签「${t.name}」？（已经打在旧消息上的不会变）`)) removeEmotionTag(t.id)
                    }}
                  >
                    删除
                  </button>
                  <Switch checked={t.enabled !== false} onChange={() => toggleEmotionTag(t.id)} />
                </div>
              ))}
            </div>
          )}
        </section>

        <p className="px-1 text-[11px] leading-relaxed text-ink-faint">
          自定义标签存在设置里（会跟着换设备走）；关掉的标签不会参与新消息的推断，旧消息上的标签保留。
        </p>
      </div>
    </div>
  )
}
