import { useState } from 'react'
import clsx from 'clsx'
import { NavBar } from '@/components/common/NavBar'
import { pickImage, shrinkImageDataUrl } from '@/lib/file'
import { nid } from '@/lib/ids'
import { fromNow } from '@/lib/time'
import { favoriteFromLetter } from '@/lib/favorites'
import { useAppStore } from '@/store/useAppStore'
import { useViewerStore } from '@/store/useViewerStore'
import type { Letter } from '@/types'

/**
 * 信箱：双方写信 / 回信，信纸上的蓝色手写体批注锚定到具体某一句。
 *
 * 数据来自本机存储（`state.letters`）：
 *   他的主动来信 / 回信 / 蓝笔批注 → `lib/engine/timeline.ts`（`proactive.letter` / `mail.*`）
 *   我写的信 → 这个屏幕（状态 已寄出 / 已回信）
 */
export function MailboxScreen() {
  const { me, dream, letters, pushLetter, markLetterRead, removeLetter } = useAppStore()
  const favorites = useAppStore((s) => s.favorites)
  const addFavorite = useAppStore((s) => s.addFavorite)
  const removeFavorite = useAppStore((s) => s.removeFavorite)
  const openImage = useViewerStore((s) => s.openImage)
  const [openId, setOpenId] = useState<string | null>(null)
  const [compose, setCompose] = useState<{
    title: string
    body: string
    replyToId?: string
    images: string[]
  } | null>(null)
  const [composeErr, setComposeErr] = useState('')

  const nameOf = (id: string) => (id === me.id ? me.nickname : dream.nickname)
  const list = [...letters].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
  const unread = list.filter((l) => l.fromId !== me.id && l.status === 'UNREAD').length
  const open = openId ? list.find((l) => l.id === openId) : undefined

  const openLetter = (l: Letter) => {
    setOpenId(l.id)
    if (l.fromId !== me.id) markLetterRead(l.id) // 拆开就算看过了（未读 → 已读）
  }

  const send = () => {
    if (!compose) return
    const title = compose.title.trim() || '无题'
    const body = compose.body.trim()
    if (!body) return
    pushLetter({
      id: nid('l'),
      fromId: me.id,
      toId: dream.id,
      title,
      body,
      status: 'PENDING',
      replyToId: compose.replyToId,
      annotations: [],
      images: compose.images,
      createdAt: new Date().toISOString(),
    })
    setCompose(null)
    setOpenId(null)
    setComposeErr('')
  }

  const addLetterImages = () => {
    if (!compose) return
    if (compose.images.length >= 6) {
      setComposeErr('一封信最多附 6 张照片。')
      return
    }
    setComposeErr('')
    pickImage(
      async (url) => {
        try {
          const small = await shrinkImageDataUrl(url)
          setCompose((prev) =>
            prev && prev.images.length < 6 ? { ...prev, images: [...prev.images, small] } : prev,
          )
        } catch {
          setComposeErr('这张照片没处理成功，换一张试试。')
        }
      },
      undefined,
      { staticOnly: true, maxBytes: 12 * 1024 * 1024, onError: setComposeErr },
    )
  }

  const removeLetterImage = (index: number) => {
    if (!compose) return
    setCompose({ ...compose, images: compose.images.filter((_, i) => i !== index) })
  }

  /* ───────────────────── 写信 / 回信 ───────────────────── */
  if (compose) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-page">
        <NavBar
          title={compose.replyToId ? '回信' : '写一封信'}
          onBack={() => setCompose(null)}
          right={
            <button className="tap rounded px-2 py-1 text-[14px] text-brand-deep" onClick={send}>
              寄出
            </button>
          }
        />
        <div className="no-scrollbar flex-1 space-y-3 overflow-y-auto px-3 py-4">
          <input
            value={compose.title}
            maxLength={40}
            placeholder="标题"
            onChange={(e) => setCompose({ ...compose, title: e.target.value })}
            className="w-full rounded-lg bg-surface px-3 py-2.5 text-[15px] text-ink outline-none ring-1 ring-hairline focus:ring-brand placeholder:text-ink-faint"
          />
          <textarea
            autoFocus
            rows={14}
            value={compose.body}
            maxLength={3000}
            placeholder={`${dream.nickname}：\n\n`}
            onChange={(e) => setCompose({ ...compose, body: e.target.value })}
            className="w-full resize-none rounded-xl bg-surface px-3 py-3 text-[15px] leading-[1.9] text-ink outline-none ring-1 ring-hairline focus:ring-brand placeholder:text-ink-faint"
          />

          <div className="rounded-xl bg-surface p-2.5 ring-1 ring-hairline">
            <div className="flex items-center">
              <span className="text-[12px] text-ink-sub">随信照片（可选）</span>
              <span className="ml-1 text-[10px] text-ink-faint">{compose.images.length}/6</span>
              <button
                type="button"
                className="tap ml-auto rounded-lg bg-page px-2.5 py-1 text-[11px] text-ink-sub"
                onClick={addLetterImages}
              >
                ＋ 添加
              </button>
            </div>
            {compose.images.length > 0 && (
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {compose.images.map((src, i) => (
                  <div key={i} className="relative aspect-square overflow-hidden rounded-md">
                    <img src={src} alt={`随信照片 ${i + 1}`} className="h-full w-full object-cover" draggable={false} />
                    <button
                      type="button"
                      className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/55 text-[11px] leading-none text-white"
                      onClick={() => removeLetterImage(i)}
                      aria-label={`移除第 ${i + 1} 张照片`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-1.5 text-[10px] leading-relaxed text-ink-faint">照片只存在本机，会跟着信件一起保存。</p>
          </div>
          {composeErr && <p className="px-1 text-[11px] text-[#e0533d]">{composeErr}</p>}
          <p className="px-1 text-[11px] leading-relaxed text-ink-faint">
            他会读，也可能用蓝笔在上面写批注；会不会回信、多久回，看 设置 → 概率调节引擎 → 信箱。
          </p>
        </div>
      </div>
    )
  }

  /* ───────────────────── 读信 ───────────────────── */
  if (open) {
    const mine = open.fromId === me.id
    const letterFav = favorites.find(
      (f) => f.owner === 'me' && f.kind === 'LETTER' && f.refId === open.id,
    )
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-page">
        <NavBar
          title="信件"
          onBack={() => setOpenId(null)}
          right={
            !mine && (
              <button
                className="tap rounded px-2 py-1 text-[14px] text-brand-deep"
                onClick={() =>
                  setCompose({
                    title: `回信 · ${open.title}`,
                    body: `${dream.nickname}：\n\n`,
                    replyToId: open.id,
                    images: [],
                  })
                }
              >
                回信
              </button>
            )
          }
        />

        <div className="no-scrollbar flex-1 overflow-y-auto px-3 py-4">
          {/* 信纸 */}
          <article className="rounded-2xl bg-[#fdfdff] p-4 shadow-card ring-1 ring-hairline">
            <h2 className="text-center text-[17px] font-medium text-ink">{open.title}</h2>
            <p className="mt-1 text-center text-[11px] text-ink-faint">
              {nameOf(open.fromId)} 写给 {nameOf(open.toId)} · {fromNow(open.createdAt)}
              {open.proactive && ' · ❤️ 他自己写的'}
            </p>

            <div className="mt-4 space-y-1.5">
              {renderBody(open).map(({ line, hit }, i) => (
                <div key={i}>
                  <p
                    className={clsx(
                      'text-[15px] leading-[1.95]',
                      hit ? 'rounded bg-brand-soft/40 px-1 text-ink' : line ? 'text-ink' : 'h-3',
                    )}
                  >
                    {line}
                  </p>
                  {hit && (
                    <p className="font-hand px-1 text-[15px] leading-relaxed text-brand-deep">
                      ✎ {hit.text}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* 锚定不到原文的批注（比如信被改过）兜底放页尾 */}
            {!!unmatchedAnnotations(open).length && (
              <div className="mt-4 border-t border-dashed border-hairline pt-3">
                <p className="text-[11px] text-ink-faint">页边的字</p>
                {unmatchedAnnotations(open).map((a) => (
                  <p key={a.id} className="font-hand mt-1 text-[15px] leading-relaxed text-brand-deep">
                    ✎ {a.text}
                  </p>
                ))}
              </div>
            )}
            {/* 随信照片：点开全屏 */}
            {!!open.images?.length && (
              <div className="mt-4 border-t border-dashed border-hairline pt-3">
                <p className="text-[11px] text-ink-faint">随信附上的照片 · 点开看大图</p>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {open.images.map((src, i) => (
                    <button
                      key={i}
                      type="button"
                      className="tap overflow-hidden rounded-md"
                      onClick={() => openImage(src, `信件照片 ${i + 1}`)}
                      aria-label={`查看信件照片 ${i + 1}`}
                    >
                      <img
                        src={src}
                        alt={`信件照片 ${i + 1}`}
                        className="aspect-square w-full object-cover"
                        draggable={false}
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </article>

          <div className="mt-3 flex items-center gap-2 px-1">
            {mine ? (
              <span className="rounded-full bg-brand-soft/60 px-2 py-0.5 text-[11px] text-brand-deep">
                {myLetterState(open)}
              </span>
            ) : (
              <span className="rounded-full bg-brand-soft/60 px-2 py-0.5 text-[11px] text-brand-deep">已读</span>
            )}
            {!!open.annotations.length && (
              <span className="font-hand text-[13px] text-brand-deep">{open.annotations.length} 处蓝色批注</span>
            )}
            {!mine && (
              <button
                className="tap ml-auto rounded-lg bg-page px-2.5 py-1 text-[11px] text-ink-sub ring-1 ring-hairline"
                onClick={() => {
                  if (letterFav) removeFavorite(letterFav.id)
                  else addFavorite(favoriteFromLetter(open, 'me'))
                }}
              >
                {letterFav ? '取消收藏' : '⭐ 收藏这封信'}
              </button>
            )}
            {mine && (
              <button
                className="tap ml-auto text-[11px] text-[#e0533d]"
                onClick={() => {
                  removeLetter(open.id)
                  setOpenId(null)
                }}
              >
                删除这封信
              </button>
            )}
          </div>

          <p className="mt-3 px-1 text-[11px] leading-relaxed text-ink-faint">
            回信概率 / 回信延迟 / 批注概率 → 设置 → 概率调节引擎 → 信箱
          </p>
        </div>
      </div>
    )
  }

  /* ───────────────────── 列表 ───────────────────── */
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-page">
      <NavBar
        title="信箱"
        right={
          <button
            className="tap grid h-8 w-8 place-items-center rounded text-[18px] text-ink-sub"
            onClick={() => {
              setComposeErr('')
              setCompose({ title: '', body: '', images: [] })
            }}
            aria-label="写一封信"
          >
            ✎
          </button>
        }
      />
      <div className="no-scrollbar flex-1 space-y-3 overflow-y-auto px-3 py-4">
        {unread > 0 && (
          <p className="rounded-xl bg-brand-soft/50 px-3 py-2 text-[12px] text-brand-deep">
            {dream.nickname} 寄来 {unread} 封还没拆的信
          </p>
        )}

        {list.length === 0 && (
          <p className="rounded-xl bg-surface p-6 text-center text-[13px] leading-relaxed text-ink-faint shadow-card">
            信箱是空的。
            <br />
            点右上角 ✎ 写一封，他也会自己寄信来。
          </p>
        )}

        {list.map((l) => {
          const mine = l.fromId === me.id
          const excerpt = l.body
            .split('\n')
            .map((x) => x.trim())
            .filter(Boolean)
            .filter((x) => !x.endsWith('：'))
            .join(' ')
            .slice(0, 46)
          return (
            <button
              key={l.id}
              className="tap block w-full rounded-xl bg-surface p-3.5 text-left shadow-card"
              onClick={() => openLetter(l)}
            >
              <div className="flex items-center gap-2">
                {l.status === 'UNREAD' && <span className="h-2 w-2 shrink-0 rounded-full bg-[#f04a4a]" />}
                <span className="truncate text-[13px] font-medium text-ink">
                  {l.proactive && '❤️ '}
                  {l.title}
                </span>
                <span className="ml-auto shrink-0 text-[11px] text-ink-faint">{fromNow(l.createdAt)}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-ink-sub">{excerpt}…</p>
              <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-faint">
                <span>{mine ? `寄给 ${nameOf(l.toId)}` : `来自 ${nameOf(l.fromId)}`}</span>
                <span className="rounded-full bg-brand-soft/60 px-1.5 py-0.5 text-brand-deep">
                  {mine ? myLetterState(l) : l.status === 'UNREAD' ? '未读' : '已读'}
                </span>
                {!!l.images?.length && <span>📷 {l.images.length}</span>}
                {!!l.annotations.length && (
                  <span className="ml-auto font-hand text-[13px] text-brand-deep">
                    {l.annotations.length} 处蓝色批注
                  </span>
                )}
              </div>
            </button>
          )
        })}

        <p className="pt-2 text-center text-[11px] leading-relaxed text-ink-faint">
          信纸上的蓝色手写体批注，可以锚定到任意一行
        </p>
      </div>
    </div>
  )
}

/** 我寄出的信现在是什么状态（他回信 / 只批注没回信 / 还没动静） */
function myLetterState(l: Letter) {
  if (l.status === 'REPLIED') return '已回信'
  if (l.annotations.length > 0) return '他读了 · 写了批注'
  return '已寄出'
}

/** 把书信体按行拆开，并找出每一行是否被某条批注锚定 */
function renderBody(letter: Letter) {
  const used = new Set<string>()
  return letter.body.split('\n').map((line) => {
    const hit = letter.annotations.find((a) => a.anchor && !used.has(a.id) && line.includes(a.anchor))
    if (hit) used.add(hit.id)
    return { line, hit }
  })
}

/** 锚定不到原文的批注 */
function unmatchedAnnotations(letter: Letter) {
  const matched = renderBody(letter)
    .map((r) => r.hit?.id)
    .filter(Boolean) as string[]
  return letter.annotations.filter((a) => !matched.includes(a.id))
}
