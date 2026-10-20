import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { NavBar } from '@/components/common/NavBar'
import { nid } from '@/lib/ids'
import { humanDur } from '@/lib/companion'
import { readBookText, saveBookText } from '@/lib/repo'
import {
  BOOK_PICKS,
  READ_KIND_LABEL,
  bookFromPick,
  hasText,
  humanChars,
  newBookId,
  parseBookFile,
  parsePastedText,
  readCover,
} from '@/lib/read'
import { endRead, markReadActivity, readReplyMe, reportReadProgress, setReadOpen, startRead } from '@/lib/engine/read'
import { useAppStore } from '@/store/useAppStore'
import type { ReadBook } from '@/types'

/** 一页显示多少段（按段分页 —— 「读到第几段」才是可核对的） */
const PAGE_SIZE = 14

/**
 * 阅读室（一起读）
 *
 * 两条边界写在明面上，不糊过去：
 *   ① **进度是真的** —— 本机 txt / md / html / epub 或粘进来的正文会解析成段落，
 *      「读到第几段」是我们自己数出来的；**只有书名**的书没有正文，就没有进度，不假装在读第几页。
 *      「一起读了多久」也不是墙上时间：阅读室开着 + 页面在前台 + 最近 45 秒内翻过页 / 滚过，才走表。
 *   ② **他写什么、写在第几段是抽出来的** —— 进不进来、写几处批注 / 短句、写在哪一段、房间里说一句、
 *      会不会先走，全在 `readRoom.*` 规则里，种子 = 这一次共读的 id（刷新不会重掷）。
 *      他这一场写的东西可以点开看（会剧透，自己决定）。
 */
export function ReadRoomScreen() {
  const room = useAppStore((s) => s.readRoom)
  const me = useAppStore((s) => s.me)
  const dream = useAppStore((s) => s.dream)
  const pushReadMessage = useAppStore((s) => s.pushReadMessage)

  const active = room.active
  const book = useMemo(() => room.books.find((b) => b.id === active?.bookId), [room.books, active?.bookId])

  /** 正文（从本机 IndexedDB 里读出来；`null` = 还在读 / 或这台设备上没有） */
  const [paras, setParas] = useState<string[] | null>(null)
  const [page, setPage] = useState(0)
  const scroller = useRef<HTMLDivElement | null>(null)

  // 进房间：把正文读出来（只在书换的时候读一次）
  useEffect(() => {
    const blobKey = book?.source.blobKey
    if (!active || !hasText(book) || !blobKey) {
      setParas(null)
      return
    }
    let alive = true
    setParas(null)
    void readBookText(blobKey).then((arr) => {
      if (!alive) return
      setParas(arr ?? [])
      const at = room.position[book!.id] ?? 0
      setPage(Math.max(0, Math.floor(at / PAGE_SIZE)))
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, book?.id])

  // 阅读室开着才算「在读」：正文没显示出来（换设备了 / 还没读完）就不走表
  useEffect(() => {
    if (!active || !book || !paras?.length) return
    setReadOpen(true)
    const onVisible = () => markReadActivity()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      setReadOpen(false)
    }
  }, [active?.id, book?.id, paras])

  // 房间里的倒计时（他还没到 / 他快走了）
  const [nowMs, setNowMs] = useState(Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active])

  const begin = (b: ReadBook) => {
    startRead(b.id)
    markReadActivity()
  }

  const finish = (finished: boolean) => {
    if (book && finished) useAppStore.getState().markReadFinished(book.id, true)
    endRead(finished)
  }

  if (!active) return <Lobby onBegin={begin} />

  const total = book?.paraCount ?? paras?.length ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const start = page * PAGE_SIZE
  const slice = (paras ?? []).slice(start, start + PAGE_SIZE)
  const marks = room.marks.filter((m) => m.bookId === book?.id)
  const at = room.position[book?.id ?? ''] ?? start
  const pct = total > 1 ? Math.min(100, Math.round((at / (total - 1)) * 100)) : 0

  const goto = (p: number) => {
    const next = Math.min(pages - 1, Math.max(0, p))
    setPage(next)
    markReadActivity()
    if (book) reportReadProgress(book.id, next * PAGE_SIZE)
    requestAnimationFrame(() => scroller.current?.scrollTo({ top: 0 }))
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-page">
      <NavBar title="阅读室" right={<span className="pr-1 text-[12px] text-ink-faint">{readCover(book)}</span>} />

      <div className="no-scrollbar flex-1 overflow-y-auto" ref={scroller} onScroll={markReadActivity} onClick={markReadActivity}>
        {/* 正文 / 占位 */}
        <div className="px-3 pt-3">
          <div className="rounded-2xl bg-surface p-4 shadow-card">
            {book && hasText(book) ? (
              paras === null ? (
                <p className="py-8 text-center text-[12px] text-ink-faint">正在把这本本机的书读出来…</p>
              ) : slice.length === 0 ? (
                <p className="py-8 text-center text-[12px] text-ink-faint">这本书的正文不在这台设备上（换设备要重新导入）。</p>
              ) : (
                <div className="space-y-3">
                  {slice.map((text, i) => {
                    const idx = start + i
                    const mine = marks.filter((m) => m.paraIndex === idx)
                    return (
                      <div key={idx}>
                        <p className="whitespace-pre-wrap text-[13.5px] leading-[1.95] text-ink">{text}</p>
                        {mine.map((m) => (
                          <div
                            key={m.id}
                            className={clsx(
                              'mt-1.5 rounded-r-lg border-l-2 pl-2.5',
                              m.kind === 'MARK' ? 'border-brand' : 'border-hairline',
                            )}
                          >
                            <p className={clsx('text-[12px] leading-relaxed', m.kind === 'MARK' ? 'text-brand-deep' : 'text-ink-faint')}>
                              {m.kind === 'MARK' ? `✎ ${m.text}` : `· ${m.text}`}
                            </p>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )
            ) : (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <span className="text-4xl">{readCover(book)}</span>
                <p className="text-[13px] text-ink">《{book?.title}》只有书名，没有正文</p>
                <p className="text-[11px] leading-relaxed text-ink-faint">
                  这本是他随口推的 —— 想真读就把本机 txt / md / html / epub 导进来，或者把正文粘一段。
                  <br />
                  所以这一场<b className="text-ink-sub">没有「读到第几段」、也不记时长、页边不写字</b>，就是他陪着你待一会儿。
                </p>
                {book?.note && <p className="mt-1 text-[11px] text-ink-sub">「{book.note}」</p>}
              </div>
            )}
          </div>
        </div>

        {/* 阅读进度 + 翻页 */}
        {book && hasText(book) && (
          <div className="mt-2.5 space-y-2 px-3">
            <div className="flex items-center gap-3">
              <button
                className="tap rounded-full bg-surface px-3 py-1.5 text-[12px] text-ink-sub ring-1 ring-hairline disabled:opacity-40"
                disabled={page <= 0}
                onClick={() => goto(page - 1)}
              >
                上一页
              </button>
              <div className="min-w-0 flex-1">
                <div className="h-1 overflow-hidden rounded-full bg-hairline">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1 text-center text-[10px] text-ink-faint tabular-nums">
                  第 {page + 1} / {pages} 页 · 读到第 {at + 1} 段 · {pct}%
                </p>
              </div>
              <button
                className="tap rounded-full bg-surface px-3 py-1.5 text-[12px] text-ink-sub ring-1 ring-hairline disabled:opacity-40"
                disabled={page >= pages - 1}
                onClick={() => goto(page + 1)}
              >
                下一页
              </button>
            </div>
          </div>
        )}

        {/* 他的状态 */}
        <div className="mt-2.5 px-3">
          <div className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2 shadow-card">
            <span className="text-[16px]">
              {active.heJoinedAt ? '👀' : active.heComingAt && +new Date(active.heComingAt) > nowMs ? '⏳' : '💤'}
            </span>
            <span className="min-w-0 flex-1 text-[12px] text-ink-sub">
              {active.heJoinedAt
                ? book && hasText(book)
                  ? '他也在读，你在这一页他也跟着'
                  : '他陪着你待着（这本书没有正文，你们在房间里说话）'
                : active.heComingAt && +new Date(active.heComingAt) > nowMs
                  ? `他说一会儿过来 · 还有 ${Math.max(1, Math.ceil((+new Date(active.heComingAt) - nowMs) / 1000))} 秒`
                  : '他先走了 —— 书照读，他不说话了'}
            </span>
            {active.heLeavesAt && active.heJoinedAt && +new Date(active.heLeavesAt) > nowMs && (
              <span className="shrink-0 text-[10px] text-ink-faint">
                {Math.max(1, Math.round((+new Date(active.heLeavesAt) - nowMs) / 60_000))} 分钟后他准备走
              </span>
            )}
          </div>
        </div>

        {/* 房间对话 + 他写的批注清单 */}
        <div className="mt-2.5 space-y-2 px-3 pb-4">
          <RoomChat
            myId={me.id}
            hisName={dream.nickname}
            messages={room.messages}
            onSend={(text) => {
              pushReadMessage({ id: nid('rm'), senderId: me.id, text, createdAt: new Date().toISOString() })
              readReplyMe()
            }}
          />

          {book && hasText(book) && (
            <details className="rounded-xl bg-surface px-3 py-2 shadow-card">
              <summary className="cursor-pointer text-[11px] text-ink-faint">
                点开看他这一场写的（{marks.length} 处 · 会剧透）
              </summary>
              <ul className="mt-2 space-y-1">
                {marks.map((m) => (
                  <li key={m.id} className="flex items-start gap-2 text-[11px] text-ink-sub">
                    <span className="shrink-0 tabular-nums text-ink-faint">第 {m.paraIndex + 1} 段</span>
                    <span className="min-w-0 flex-1">{m.kind === 'MARK' ? `✎ ${m.text}` : `· ${m.text}`}</span>
                    {m.paraIndex <= at && <span className="shrink-0 text-ink-faint">已读到</span>}
                  </li>
                ))}
                {marks.length === 0 && (
                  <li className="text-[11px] text-ink-faint">{active.heJoinedAt ? '他这一本没写（或者还没排）' : '他还没进来'}</li>
                )}
              </ul>
            </details>
          )}

          <div className="flex gap-2 pb-2">
            <button className="tap flex-1 rounded-xl bg-surface py-2.5 text-[13px] text-ink ring-1 ring-hairline" onClick={() => finish(true)}>
              读完了
            </button>
            <button className="tap flex-1 rounded-xl bg-brand py-2.5 text-[13px] font-medium text-white" onClick={() => finish(false)}>
              先停在这儿
            </button>
          </div>
          <p className="pb-4 text-center text-[10px] leading-relaxed text-ink-faint">
            《{book?.title}》· 全库累计真的读了 {humanDur(room.readSec)}
          </p>
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────── 书单（没在房间里的时候） ───────────────────────── */

function Lobby({ onBegin }: { onBegin: (book: ReadBook) => void }) {
  const room = useAppStore((s) => s.readRoom)
  const addReadBooks = useAppStore((s) => s.addReadBooks)
  const removeReadBook = useAppStore((s) => s.removeReadBook)
  const markReadFinished = useAppStore((s) => s.markReadFinished)

  const [tab, setTab] = useState<'local' | 'paste' | 'title'>('local')
  const [input, setInput] = useState('')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  /** 本机文件：解析成段落 → 存本机 → 只把「目录信息」放进 state */
  const onFile = async (file?: File | null) => {
    if (!file) return
    setBusy(true)
    setErr('')
    try {
      const parsed = await parseBookFile(file)
      const id = newBookId()
      const blobKey = `book:${id}`
      await saveBookText(blobKey, parsed.paragraphs)
      addReadBooks([
        {
          id,
          title: title.trim() || parsed.title,
          author: parsed.author,
          cover: '📖',
          source: { kind: 'local', blobKey, label: file.name },
          addedBy: 'me',
          addedAt: new Date().toISOString(),
          paraCount: parsed.paragraphs.length,
          charCount: parsed.charCount,
        },
      ])
      setTitle('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : '这本书读不出来')
    } finally {
      setBusy(false)
    }
  }

  const submit = () => {
    setErr('')
    if (tab === 'title') {
      const t = input.trim()
      if (!t) return
      addReadBooks([
        {
          id: newBookId(),
          title: t,
          cover: '📕',
          source: { kind: 'title' },
          addedBy: 'me',
          addedAt: new Date().toISOString(),
        },
      ])
      setInput('')
      return
    }
    const parsed = parsePastedText(input, title)
    if (!parsed) {
      setErr('这段没有可读的正文')
      return
    }
    const id = newBookId()
    const blobKey = `book:${id}`
    void saveBookText(blobKey, parsed.paragraphs).then(() =>
      addReadBooks([
        {
          id,
          title: parsed.title,
          cover: '📖',
          source: { kind: 'paste', blobKey },
          addedBy: 'me',
          addedAt: new Date().toISOString(),
          paraCount: parsed.paragraphs.length,
          charCount: parsed.charCount,
        },
      ]),
    )
    setInput('')
    setTitle('')
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-page">
      <NavBar title="阅读室" />

      <div className="no-scrollbar flex-1 overflow-y-auto px-3 pb-6">
        <div className="mt-3 rounded-2xl bg-surface p-3.5 shadow-card">
          <h3 className="text-[13px] font-medium text-ink">一起读</h3>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-sub">
            本机 txt / md / html / epub 或粘一段正文 → 解析成段落，<b className="text-ink">读到第几段是真的</b>；
            他写在页边的批注会锚在具体那一段，你读到才看得见。
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-sub">
            「只有书名」的书<b className="text-ink">没有正文就没有进度</b>：不记时长、页边不写字，就是他陪你待一会儿。
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
            他的批注与发言是抽出来的（「设置 → 概率调节引擎 → 阅读室」），种子 = 这一次共读的 id，刷新不会重掷。
          </p>
        </div>

        {/* 导入 */}
        <div className="mt-3 rounded-2xl bg-surface p-3.5 shadow-card">
          <div className="flex gap-1.5">
            {(
              [
                ['local', '本机文件'],
                ['paste', '粘正文'],
                ['title', '只有书名'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                className={clsx(
                  'tap flex-1 rounded-full py-1.5 text-[12px]',
                  tab === k ? 'bg-brand text-white' : 'bg-page text-ink-sub ring-1 ring-hairline',
                )}
                onClick={() => setTab(k)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-2.5 space-y-2">
            <input
              className="w-full rounded-xl bg-page px-3 py-2 text-[12px] text-ink outline-none ring-1 ring-hairline placeholder:text-ink-faint"
              placeholder={tab === 'title' ? '书名，例如「夜航西飞」' : '书名（可留空，用文件名 / 段落首行）'}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            {tab === 'local' && (
              <>
                <label className="tap flex items-center justify-center rounded-xl border border-dashed border-hairline py-3 text-[12px] text-ink-sub">
                  {busy ? '正在解析…' : '选择本机文件（txt / md / html / epub）'}
                  <input
                    className="hidden"
                    type="file"
                    accept=".txt,.md,.markdown,.html,.htm,.xhtml,.epub,text/plain,text/html,application/epub+zip"
                    onChange={(e) => void onFile(e.target.files?.[0])}
                  />
                </label>
                <p className="text-[10px] leading-relaxed text-ink-faint">
                  正文解析后存在本机（换设备要重新导入）；epub 在这里自己拆 zip，解不开会明说，不会给你一本空书。
                </p>
              </>
            )}

            {tab === 'paste' && (
              <>
                <textarea
                  className="h-32 w-full resize-none rounded-xl bg-page px-3 py-2 text-[12px] leading-relaxed text-ink outline-none ring-1 ring-hairline placeholder:text-ink-faint"
                  placeholder="把正文粘进来（空行分段）…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                />
              </>
            )}

            {tab !== 'local' && (
              <button className="tap w-full rounded-xl bg-brand py-2 text-[12.5px] font-medium text-white" onClick={submit}>
                {tab === 'title' ? '加进书单（只有书名）' : '加进书单'}
              </button>
            )}

            {err && <p className="text-[11px] text-amber-600">{err}</p>}
          </div>
        </div>

        {/* 书单 */}
        <div className="mt-3 rounded-2xl bg-surface p-3.5 shadow-card">
          <div className="flex items-center">
            <h3 className="text-[13px] font-medium text-ink">书单</h3>
            <span className="ml-auto text-[11px] text-ink-faint">真的一起读了 {humanDur(room.readSec)}</span>
          </div>

          {room.books.length === 0 ? (
            <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
              书单还是空的。上面导一本，或者点下面的「让他推一本」—— 他推的只有书名，读不了正文就明说。
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {room.books.map((b) => {
                const canRead = hasText(b)
                const total = b.paraCount ?? 0
                const at = room.position[b.id] ?? 0
                const pct = total > 1 ? Math.min(100, Math.round((at / (total - 1)) * 100)) : 0
                return (
                  <li key={b.id} className="rounded-xl bg-page p-2.5 ring-1 ring-hairline">
                    <div className="flex items-start gap-2.5">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-[20px]">
                        {readCover(b)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{b.title}</span>
                          {b.finishedAt && (
                            <span className="shrink-0 rounded-full bg-brand-soft px-1.5 py-0.5 text-[9px] text-brand-deep">已读完</span>
                          )}
                        </div>
                        <div className="mt-0.5 text-[10.5px] text-ink-faint">
                          {b.author ? `${b.author} · ` : ''}
                          {READ_KIND_LABEL[b.source.kind]}
                          {b.addedBy === 'him' ? ' · 他推的' : ''}
                          {canRead ? ` · ${total} 段 · ${humanChars(b.charCount ?? 0)}` : ''}
                          {canRead && at > 0 ? ` · 读到 ${pct}%` : ''}
                        </div>
                        {b.note && <div className="mt-0.5 text-[10.5px] leading-snug text-ink-sub">「{b.note}」</div>}
                        {canRead && (
                          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-hairline">
                            <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <button
                        className="tap flex-1 rounded-lg bg-brand py-1.5 text-[11.5px] font-medium text-white"
                        onClick={() => onBegin(b)}
                      >
                        {canRead ? (at > 0 ? `接着读（${pct}%）` : '一起读') : '陪他待着（没正文）'}
                      </button>
                      <button
                        className="tap rounded-lg bg-surface px-2.5 py-1.5 text-[11px] text-ink-sub ring-1 ring-hairline"
                        onClick={() => markReadFinished(b.id, !b.finishedAt)}
                      >
                        {b.finishedAt ? '取消读完' : '标记读完'}
                      </button>
                      <button
                        className="tap rounded-lg bg-surface px-2.5 py-1.5 text-[11px] text-ink-faint ring-1 ring-hairline"
                        onClick={() => removeReadBook(b.id)}
                      >
                        删
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          <button
            className="tap mt-2.5 w-full rounded-xl bg-page py-2 text-[12px] text-ink-sub ring-1 ring-hairline"
            onClick={() => {
              const pick = BOOK_PICKS[Math.floor(Math.random() * BOOK_PICKS.length)]
              addReadBooks([bookFromPick(pick, 'him')])
            }}
          >
            📚 让他推一本（手动 · 他推的只有书名）
          </button>
        </div>

        <p className="mt-4 text-center text-[10px] leading-relaxed text-ink-faint">
          这里没有「假装在读」：正文没显示出来、页面切走了、45 秒没翻页，秒数就不加。
        </p>
      </div>
    </div>
  )
}

/* ───────────────────────── 房间对话 ───────────────────────── */

function RoomChat({
  myId,
  hisName,
  messages,
  onSend,
}: {
  myId: string
  hisName: string
  messages: { id: string; senderId: string; text: string; createdAt: string }[]
  onSend: (text: string) => void
}) {
  const [text, setText] = useState('')
  const send = () => {
    const t = text.trim()
    if (!t) return
    onSend(t)
    setText('')
  }
  return (
    <div className="rounded-xl bg-surface p-3 shadow-card">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[12px] text-ink-sub">房间里的对话</span>
        <span className="text-[10px] text-ink-faint">（跟主聊天分开，不占聊天气泡）</span>
      </div>
      <div className="max-h-56 space-y-1.5 overflow-y-auto">
        {messages.length === 0 && <p className="text-[11px] text-ink-faint">这里只有你们在房间里说的话。</p>}
        {messages.map((m) => {
          const mine = m.senderId === myId
          return (
            <div key={m.id} className={clsx('flex', mine ? 'justify-end' : 'justify-start')}>
              <div
                className={clsx(
                  'max-w-[78%] rounded-2xl px-2.5 py-1.5 text-[12px] leading-relaxed',
                  mine ? 'bg-brand text-white' : 'bg-page text-ink ring-1 ring-hairline',
                )}
              >
                {!mine && <span className="mr-1 text-[10px] text-ink-faint">{hisName}</span>}
                {m.text}
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          className="min-w-0 flex-1 rounded-full bg-page px-3 py-1.5 text-[12px] text-ink outline-none ring-1 ring-hairline placeholder:text-ink-faint"
          placeholder="跟他说一句…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send()
          }}
        />
        <button className="tap rounded-full bg-brand-soft px-3 py-1.5 text-[12px] text-brand-deep" onClick={send}>
          说
        </button>
      </div>
    </div>
  )
}
