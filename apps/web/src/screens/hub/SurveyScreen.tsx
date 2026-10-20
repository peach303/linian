import { useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { NavBar } from '@/components/common/NavBar'
import { nid } from '@/lib/ids'
import { seededPick } from '@/lib/engine/seed'
import { useAppStore } from '@/store/useAppStore'
import { useChatStore } from '@/store/useChatStore'
import { useRulesStore } from '@/store/useRulesStore'
import type { QuestionAnswerRow, QuestionItem, QuestionPack, QuizSession } from '@/types'

/**
 * 功能 → 问卷
 *
 * 两个东西放在一起，但用途不同：
 *   · 题库：我自己加题 / 从文件导入，攒成一套；他按概率挑一套来问我（我逐题作答）。
 *   · 默契问卷：两个人做同一套题，交卷后给总结和默契度。
 *
 * 说明写清楚：他的答案是抽签模拟的，不是读心；默契度只是这套题的一致率。
 */

const EXAMPLE: Omit<QuestionPack, 'id' | 'createdAt'> = {
  title: '默契小问卷',
  source: 'builtin',
  items: [
    {
      id: 'ex1',
      text: '周末最想怎么过？',
      multi: false,
      options: [
        { id: 'ex1a', label: '窝在家里' },
        { id: 'ex1b', label: '出门走走' },
        { id: 'ex1c', label: '见朋友' },
      ],
    },
    {
      id: 'ex2',
      text: '心情不好时更希望对方？',
      multi: false,
      options: [
        { id: 'ex2a', label: '先听我说' },
        { id: 'ex2b', label: '给我空间' },
        { id: 'ex2c', label: '逗我开心' },
      ],
    },
    {
      id: 'ex3',
      text: '最喜欢哪种晚安？',
      multi: false,
      options: [
        { id: 'ex3a', label: '说一句晚安' },
        { id: 'ex3b', label: '语音说' },
        { id: 'ex3c', label: '陪着睡着' },
      ],
    },
    {
      id: 'ex4',
      text: '我们之间最不能少的是？（可多选）',
      multi: true,
      options: [
        { id: 'ex4a', label: '分享日常' },
        { id: 'ex4b', label: '互相惦记' },
        { id: 'ex4c', label: '一起玩' },
      ],
    },
  ],
}

/** 把「1. 题干 | 多选 | A | B」这类文本转成题目 */
function parseItems(text: string): QuestionItem[] {
  const lines = text
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)
  const out: QuestionItem[] = []
  lines.forEach((raw, i) => {
    let line = raw.replace(/^\s*(?:\d+[.、)]|[-*•])\s*/, '')
    if (/^(标题|title)\s*[:：]/i.test(line)) return
    const sep = line.includes('|') ? '|' : line.includes('｜') ? '｜' : line.includes('\t') ? '\t' : ''
    if (!sep) return
    const parts = line.split(sep).map((x) => x.trim()).filter(Boolean)
    if (parts.length < 3) return
    const qtext = parts.shift() ?? ''
    const multi = parts[0] === '多选' || parts[0] === 'multiple'
    if (multi) parts.shift()
    const options = parts.slice(0, 6).map((label, k) => ({
      id: `q${i + 1}_o${k + 1}`,
      label,
    }))
    if (!qtext || options.length < 2) return
    out.push({ id: `q${i + 1}`, text: qtext, multi, options })
  })
  return out.slice(0, 5)
}

function itemsToText(items: QuestionItem[]): string {
  return items
    .map((it, i) => {
      const opts = it.options.map((o) => o.label).join(' | ')
      return `${i + 1}. ${it.text} | ${it.multi ? '多选 | ' : ''}${opts}`
    })
    .join('\n')
}

function parseJsonPack(raw: string): { title?: string; items: QuestionItem[] } | null {
  try {
    const data = JSON.parse(raw) as unknown
    const one = Array.isArray(data) ? { items: data } : (data as Record<string, unknown>)
    const list = Array.isArray(one.items)
      ? one.items
      : Array.isArray(one.questions)
        ? one.questions
        : []
    const items: QuestionItem[] = []
    list.forEach((q, i) => {
      const row = q as Record<string, unknown>
      const text = String(row.text ?? row.question ?? row.title ?? '').trim()
      if (!text) return
      const optionsRaw = Array.isArray(row.options)
        ? row.options
        : Array.isArray(row.choices)
          ? row.choices
          : []
      const options = optionsRaw
        .slice(0, 6)
        .map((o, k) => {
          if (typeof o === 'string') return { id: `q${i + 1}_o${k + 1}`, label: o }
          const obj = o as Record<string, unknown>
          return {
            id: String(obj.id ?? `q${i + 1}_o${k + 1}`),
            label: String(obj.label ?? obj.text ?? obj.value ?? ''),
          }
        })
        .filter((o) => o.label.trim())
      if (options.length < 2) return
      items.push({
        id: `q${i + 1}`,
        text,
        multi: Boolean(row.multi ?? row.multiple ?? row.type === 'multiple'),
        options,
      })
    })
    if (!items.length) return null
    return {
      title: typeof one.title === 'string' ? one.title : undefined,
      items: items.slice(0, 5),
    }
  } catch {
    return null
  }
}

/** 一致率：完全相同 1 分，选到同一个选项但没全同 0.5 分 */
function scoreOf(session: QuizSession): number {
  if (!session.myAnswers?.length || !session.hisAnswers?.length) return 0
  const his = new Map(session.hisAnswers.map((a) => [a.itemId, new Set(a.optionIds)]))
  let total = 0
  let hit = 0
  for (const mine of session.myAnswers) {
    const other = his.get(mine.itemId)
    if (!other) continue
    const a = new Set(mine.optionIds)
    if (!a.size && !other.size) continue
    total++
    if (a.size === other.size && [...a].every((x) => other.has(x))) hit += 1
    else if ([...a].some((x) => other.has(x))) hit += 0.5
  }
  return total ? Math.round((hit / total) * 100) : 0
}

export function SurveyScreen() {
  const packs = useAppStore((s) => s.questionPacks)
  const sessions = useAppStore((s) => s.quizSessions)
  const addPack = useAppStore((s) => s.upsertQuestionPack)
  const removePack = useAppStore((s) => s.removeQuestionPack)
  const addSession = useAppStore((s) => s.upsertQuizSession)
  const removeSession = useAppStore((s) => s.removeQuizSession)
  const push = useAppStore((s) => s.push)
  const askFromDream = useChatStore((s) => s.askQuestionFromDream)
  const rules = useRulesStore((s) => s.saved)

  const [tab, setTab] = useState<'packs' | 'compat'>('packs')
  const [editor, setEditor] = useState<{ id?: string; title: string; body: string } | null>(null)
  const [active, setActive] = useState<QuizSession | null>(null)
  const [picked, setPicked] = useState<Record<string, string[]>>({})
  const [openSession, setOpenSession] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const packOptions = useMemo(() => packs, [packs])

  const savePack = () => {
    if (!editor) return
    const items = parseItems(editor.body)
    if (!items.length) return
    const old = editor.id ? packs.find((p) => p.id === editor.id) : undefined
    addPack({
      id: editor.id ?? nid('qp'),
      title: editor.title.trim() || '我的题库',
      items,
      source: old?.source ?? 'custom',
      createdAt: old?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    setEditor(null)
  }

  const importFile = async (file: File) => {
    const raw = await file.text()
    const json = parseJsonPack(raw)
    if (json) {
      setEditor({ title: json.title ?? file.name.replace(/\.[^.]+$/, ''), body: itemsToText(json.items) })
      return
    }
    const titleLine = raw.split(/\r?\n/).find((l) => /^(标题|title)\s*[:：]/i.test(l.trim()))
    const title = titleLine
      ? titleLine.replace(/^(标题|title)\s*[:：]\s*/i, '').trim()
      : file.name.replace(/\.[^.]+$/, '')
    setEditor({ title, body: raw })
  }

  const startQuiz = (pack: QuestionPack) => {
    const s: QuizSession = {
      id: nid('quiz'),
      packId: pack.id,
      title: pack.title,
      items: pack.items.map((it) => ({ ...it, options: it.options.map((o) => ({ ...o })) })),
      createdAt: new Date().toISOString(),
    }
    setActive(s)
    setPicked({})
  }

  const toggle = (itemId: string, optionId: string, multi: boolean) => {
    setPicked((prev) => {
      const cur = prev[itemId] ?? []
      if (multi) {
        return { ...prev, [itemId]: cur.includes(optionId) ? cur.filter((x) => x !== optionId) : [...cur, optionId] }
      }
      return { ...prev, [itemId]: [optionId] }
    })
  }

  const submitQuiz = () => {
    if (!active) return
    const mine: QuestionAnswerRow[] = active.items
      .map((it) => ({ itemId: it.id, optionIds: picked[it.id] ?? [] }))
      .filter((a) => a.optionIds.length)
    const serious = Math.random() < rules.question.seriousP
    const his: QuestionAnswerRow[] = active.items.map((it, i) => {
      // 认真做：按题目种子抽一个「像他」的答案；不认真：随机，甚至可能留空
      if (!serious && seededPick([true, false], `quiz-skip:${active.id}:${i}`)) {
        return { itemId: it.id, optionIds: [] }
      }
      const n = it.multi ? (seededPick([1, 2], `quiz-n:${active.id}:${i}`) ?? 1) : 1
      const opts = [...it.options]
      const out: string[] = []
      while (out.length < n && opts.length) {
        const opt = seededPick(opts, `quiz-a:${active.id}:${i}:${out.length}`)
        if (!opt) break
        out.push(opt.id)
        opts.splice(opts.indexOf(opt), 1)
      }
      return { itemId: it.id, optionIds: out }
    })
    const done: QuizSession = {
      ...active,
      myAnswers: mine,
      hisAnswers: his,
      serious,
      submittedAt: new Date().toISOString(),
      score: scoreOf({ ...active, myAnswers: mine, hisAnswers: his }),
    }
    addSession(done)
    setActive(null)
    setPicked({})
    setOpenSession(done.id)
    setTab('compat')
  }

  const probability = Math.round(rules.question.askMeP * 100)

  return (
    <div className="flex h-full min-h-0 flex-col bg-page">
      <NavBar title="问卷" right={<span className="pr-1 text-[11px] text-ink-faint">他主动问 {probability}%</span>} />

      <div className="mx-3 mt-3 grid grid-cols-2 gap-1 rounded-xl bg-surface p-1 shadow-card">
        <button
          className={clsx('tap rounded-lg py-2 text-[13px]', tab === 'packs' ? 'bg-brand text-white' : 'text-ink-sub')}
          onClick={() => setTab('packs')}
        >
          题库
        </button>
        <button
          className={clsx('tap rounded-lg py-2 text-[13px]', tab === 'compat' ? 'bg-brand text-white' : 'text-ink-sub')}
          onClick={() => setTab('compat')}
        >
          默契问卷
        </button>
      </div>

      <div className="no-scrollbar flex-1 overflow-y-auto px-3 pb-8 pt-3">
        {tab === 'packs' && (
          <>
            <div className="rounded-xl bg-surface p-3 shadow-card">
              <p className="text-[12px] leading-relaxed text-ink-sub">
                这里是我攒的题。他按概率从题库里挑一套，在聊天里问我；我逐题点选、交卷。
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
                概率在「设置 → 概率调节引擎 → 递东西 → 问卷 · 他主动来问你」。答不答、答得多认真也各有开关。
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  className="tap rounded-lg bg-brand px-3 py-1.5 text-[12px] text-white"
                  onClick={() => setEditor({ title: '', body: '' })}
                >
                  新建题库
                </button>
                <button
                  className="tap rounded-lg bg-page px-3 py-1.5 text-[12px] text-ink-sub ring-1 ring-hairline"
                  onClick={() => fileRef.current?.click()}
                >
                  导入文件
                </button>
                <button
                  className="tap rounded-lg bg-page px-3 py-1.5 text-[12px] text-ink-sub ring-1 ring-hairline"
                  onClick={() =>
                    setEditor({
                      title: EXAMPLE.title,
                      body: itemsToText(EXAMPLE.items),
                    })
                  }
                >
                  填入示例
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".json,.txt,.csv,text/plain,application/json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void importFile(f)
                    e.target.value = ''
                  }}
                />
              </div>
            </div>

            {packs.length === 0 && (
              <div className="mt-10 text-center text-[12px] leading-relaxed text-ink-faint">
                题库还是空的。
                <br />
                新建一套，或从 .json / .txt / .csv 导入。
              </div>
            )}

            <div className="mt-3 space-y-2">
              {packs.map((p) => (
                <div key={p.id} className="rounded-xl bg-surface p-3 shadow-card">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[14px] font-medium text-ink">{p.title}</span>
                    <span className="rounded bg-page px-1.5 py-0.5 text-[10px] text-ink-faint">{p.items.length} 题</span>
                    <span className="text-[10px] text-ink-faint">{p.source === 'import' ? '导入' : p.source === 'builtin' ? '示例' : '自建'}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-ink-faint">
                    {p.items.map((x) => x.text).join(' / ')}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      className="tap rounded-lg bg-brand/10 px-2.5 py-1 text-[11px] text-brand-deep ring-1 ring-brand/30"
                      onClick={() => {
                        askFromDream(p.title, p.items)
                        push('chat')
                      }}
                    >
                      让他现在问我
                    </button>
                    <button
                      className="tap rounded-lg bg-page px-2.5 py-1 text-[11px] text-ink-sub ring-1 ring-hairline"
                      onClick={() => startQuiz(p)}
                    >
                      做默契问卷
                    </button>
                    <button
                      className="tap rounded-lg bg-page px-2.5 py-1 text-[11px] text-ink-sub ring-1 ring-hairline"
                      onClick={() => setEditor({ id: p.id, title: p.title, body: itemsToText(p.items) })}
                    >
                      编辑
                    </button>
                    <button
                      className="tap ml-auto rounded-lg px-2 py-1 text-[11px] text-[#e0533d]"
                      onClick={() => removePack(p.id)}
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'compat' && (
          <>
            <div className="rounded-xl bg-surface p-3 shadow-card">
              <p className="text-[12px] leading-relaxed text-ink-sub">
                两个人做同一套题，交卷后给默契度和逐题对照。
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
                他的答案是抽签模拟的，不是读心；认不认真在「概率调节引擎 → 问卷 · 默契问卷」里调。
                默契度只是这套题的一致率，不代表别的。
              </p>
            </div>

            {sessions.length === 0 && (
              <div className="mt-10 text-center text-[12px] leading-relaxed text-ink-faint">
                还没有默契问卷记录。
                <br />
                去「题库」挑一套，点「做默契问卷」。
              </div>
            )}

            <div className="mt-3 space-y-2">
              {sessions.map((s) => (
                <div key={s.id} className="rounded-xl bg-surface p-3 shadow-card">
                  <button
                    className="tap flex w-full items-center gap-2 text-left"
                    onClick={() => setOpenSession(openSession === s.id ? null : s.id)}
                  >
                    <span className="text-[14px] text-ink">{s.title}</span>
                    <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] text-brand-deep">
                      默契度 {s.score ?? 0}%
                    </span>
                    {!s.serious && <span className="text-[10px] text-ink-faint">他这次没认真</span>}
                    <span className="ml-auto text-[10px] text-ink-faint">
                      {new Date(s.submittedAt ?? s.createdAt).toLocaleDateString('zh-CN')}
                    </span>
                  </button>
                  {openSession === s.id && (
                    <div className="mt-2 space-y-2 border-t border-hairline pt-2">
                      {s.items.map((it, i) => {
                        const mine = s.myAnswers?.find((a) => a.itemId === it.id)?.optionIds ?? []
                        const his = s.hisAnswers?.find((a) => a.itemId === it.id)?.optionIds ?? []
                        const labels = (ids: string[]) =>
                          ids.map((id) => it.options.find((o) => o.id === id)?.label ?? '？').join('、') || '留空'
                        return (
                          <div key={it.id} className="rounded-lg bg-page px-2.5 py-2 text-[11px]">
                            <div className="text-ink-sub">
                              {i + 1}. {it.text}
                            </div>
                            <div className="mt-0.5 text-ink">我：{labels(mine)}</div>
                            <div className="text-brand-deep">他：{labels(his)}</div>
                          </div>
                        )
                      })}
                      <button className="tap text-[11px] text-[#e0533d]" onClick={() => removeSession(s.id)}>
                        删除这条记录
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 题库编辑 */}
      {editor && (
        <div className="absolute inset-0 z-40 flex flex-col justify-end">
          <button className="flex-1 bg-black/25" onClick={() => setEditor(null)} aria-label="关闭" />
          <div className="max-h-[86%] overflow-y-auto rounded-t-2xl bg-surface p-4 pb-6 shadow-phone">
            <h3 className="text-[15px] font-medium text-ink">{editor.id ? '编辑题库' : '新建题库'}</h3>
            <input
              value={editor.title}
              onChange={(e) => setEditor({ ...editor, title: e.target.value })}
              placeholder="题库名字（比如：默契小问卷）"
              maxLength={24}
              className="mt-2 w-full rounded-lg bg-page px-3 py-2 text-[13px] text-ink outline-none ring-1 ring-hairline focus:ring-brand"
            />
            <textarea
              value={editor.body}
              onChange={(e) => setEditor({ ...editor, body: e.target.value })}
              rows={9}
              placeholder={'每行一题，用 | 分开题干和选项：\n1. 周末最想怎么过？ | 窝在家里 | 出门走走\n2. 最不能少的是？ | 多选 | 分享日常 | 互相惦记'}
              className="mt-2 w-full resize-y rounded-lg bg-page px-3 py-2 font-mono text-[11px] leading-relaxed text-ink outline-none ring-1 ring-hairline focus:ring-brand placeholder:text-ink-faint"
            />
            <p className="mt-1 text-[10px] leading-relaxed text-ink-faint">
              最多 5 题、每题 2~6 个选项。导入 .json 支持 {'{"title":"...","items":[{"text":"...","options":["A","B"]}]}'}。
            </p>
            <div className="mt-2 flex gap-2">
              <button
                className="tap flex-1 rounded-lg bg-brand py-2 text-[13px] text-white disabled:opacity-40"
                disabled={!parseItems(editor.body).length}
                onClick={savePack}
              >
                保存题库
              </button>
              <button
                className="tap rounded-lg bg-page px-4 py-2 text-[13px] text-ink-sub ring-1 ring-hairline"
                onClick={() => setEditor(null)}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 默契问卷作答 */}
      {active && (
        <div className="absolute inset-0 z-40 flex flex-col bg-page">
          <NavBar
            title={active.title}
            onBack={() => {
              setActive(null)
              setPicked({})
            }}
            right={<span className="pr-1 text-[11px] text-ink-faint">我答完再看他</span>}
          />
          <div className="no-scrollbar flex-1 overflow-y-auto px-3 py-3">
            {active.items.map((it, i) => (
              <div key={it.id} className="mb-2.5 rounded-xl bg-surface p-3 shadow-card">
                <div className="text-[13px] leading-snug text-ink">
                  {i + 1}. {it.text}
                  {it.multi && <span className="ml-1 text-[10px] text-ink-faint">多选</span>}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {it.options.map((o) => {
                    const on = (picked[it.id] ?? []).includes(o.id)
                    return (
                      <button
                        key={o.id}
                        className={clsx(
                          'tap rounded-full border px-2.5 py-1 text-[12px]',
                          on
                            ? 'border-brand bg-brand/10 text-brand-deep'
                            : 'border-hairline bg-page text-ink-sub',
                        )}
                        onClick={() => toggle(it.id, o.id, it.multi)}
                      >
                        {on ? '✓' : ''}
                        {o.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-hairline bg-surface px-3 py-3">
            <button
              className="tap w-full rounded-xl bg-brand py-2.5 text-[14px] font-medium text-white disabled:opacity-40"
              disabled={Object.values(picked).every((x) => !x.length)}
              onClick={submitQuiz}
            >
              交卷，看看默契度
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
