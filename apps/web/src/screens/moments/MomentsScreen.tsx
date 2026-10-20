import { useState } from 'react'
import { NavBar } from '@/components/common/NavBar'
import { Avatar } from '@/components/common/Avatar'
import { nid } from '@/lib/ids'
import { fromNow } from '@/lib/time'
import { favoriteFromMoment } from '@/lib/favorites'
import { useAppStore } from '@/store/useAppStore'
import type { Moment } from '@/types'

/**
 * 朋友圈：双方发动态 + 点赞 + 评论。
 * 数据来自本机存储（`state.moments`），他的主动动态 / 点赞 / 评论由 `lib/engine/timeline.ts` 产出。
 */
export function MomentsScreen() {
  const { me, dream, moments, pushMoment, toggleMyLike, commentAsMe, removeMoment } = useAppStore()
  const favorites = useAppStore((s) => s.favorites)
  const addFavorite = useAppStore((s) => s.addFavorite)
  const removeFavorite = useAppStore((s) => s.removeFavorite)
  const [openComment, setOpenComment] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [writing, setWriting] = useState(false)
  const [text, setText] = useState('')

  const nameOf = (id: string) => (id === me.id ? me.nickname : dream.nickname)
  const list = [...moments].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))

  const post = () => {
    const t = text.trim()
    if (!t) return
    const m: Moment = {
      id: nid('p'),
      authorId: me.id,
      text: t,
      images: [],
      likes: [],
      comments: [],
      createdAt: new Date().toISOString(),
    }
    pushMoment(m)
    setText('')
    setWriting(false)
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-page">
      <NavBar
        title="朋友圈"
        right={
          <button
            className="tap grid h-8 w-8 place-items-center rounded text-[22px] text-ink-sub"
            onClick={() => setWriting(true)}
            aria-label="发动态"
          >
            ＋
          </button>
        }
      />

      <div className="no-scrollbar flex-1 overflow-y-auto">
        {/* 背景图 + 我的头像 */}
        <div className="relative h-36 bg-gradient-to-br from-[#bcdcff] to-[#e9f4ff]">
          <Avatar src={me.avatarUrl} name={me.nickname} size={64} ring className="absolute -bottom-8 right-4" />
        </div>

        <div className="mt-3 space-y-3 px-3 pb-6 pt-9">
          {list.length === 0 && (
            <p className="rounded-xl bg-surface p-6 text-center text-[13px] leading-relaxed text-ink-faint shadow-card">
              朋友圈还是空的。
              <br />
              点右上角 ＋ 发一条，他也会自己来发。
            </p>
          )}

          {list.map((p) => {
            const his = p.authorId === dream.id
            const liked = p.likes.includes(me.id)
            const fav = favorites.find(
              (f) => f.owner === 'me' && f.kind === 'MOMENT' && f.refId === p.id,
            )
            return (
              <article key={p.id} className="rounded-xl bg-surface p-3 shadow-card">
                <div className="flex gap-2.5">
                  <Avatar src={his ? dream.avatarUrl : me.avatarUrl} name={nameOf(p.authorId)} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[14px] font-medium text-brand-deep">{nameOf(p.authorId)}</span>
                      {p.proactive && (
                        <span className="animate-heart-pop text-[11px] leading-none" title="他主动发的动态">
                          ❤️
                        </span>
                      )}
                    </div>

                    <p className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed text-ink">{p.text}</p>

                    {!!p.images.length && (
                      <div className="mt-2 grid grid-cols-3 gap-1.5">
                        {p.images.map((c, i) => (
                          <div key={i} className="aspect-square rounded-md" style={{ background: c }} />
                        ))}
                      </div>
                    )}

                    {p.music && (
                      <div className="mt-2 flex items-center gap-2 rounded-md bg-brand-soft/50 px-2 py-1.5 text-[12px] text-ink-sub">
                        🎵 {p.music.title}
                      </div>
                    )}

                    <div className="mt-2 flex items-center gap-3 text-[11px] text-ink-faint">
                      <span>{fromNow(p.createdAt)}</span>
                      <button className="tap ml-auto" onClick={() => toggleMyLike(p.id)}>
                        {liked ? '♥ 已赞' : '赞'}
                        {p.likes.length > 0 && ` ${p.likes.length}`}
                      </button>
                      <button
                        className="tap"
                        onClick={() => {
                          setOpenComment(openComment === p.id ? null : p.id)
                          setDraft('')
                        }}
                      >
                        评论
                      </button>
                      {his && (
                        <button
                          className="tap"
                          onClick={() => {
                            if (fav) removeFavorite(fav.id)
                            else addFavorite(favoriteFromMoment(p, 'me'))
                          }}
                        >
                          {fav ? '取消收藏' : '收藏'}
                        </button>
                      )}
                      {p.authorId === me.id && (
                        <button className="tap text-[#e0533d]" onClick={() => removeMoment(p.id)}>
                          删除
                        </button>
                      )}
                    </div>

                    {(p.likes.length > 0 || p.comments.length > 0) && (
                      <div className="mt-2 space-y-1 rounded-md bg-page/70 p-2 text-[12px]">
                        {!!p.likes.length && (
                          <div className="text-brand-deep">♥ {p.likes.map(nameOf).join('、')}</div>
                        )}
                        {p.comments.map((c) => {
                          const to = c.replyToId ? p.comments.find((x) => x.id === c.replyToId) : undefined
                          return (
                            <div key={c.id}>
                              <span className="text-brand-deep">{nameOf(c.authorId)}</span>
                              {to && <span className="text-ink-faint"> 回复 {nameOf(to.authorId)}</span>}
                              <span className="text-ink-faint">：</span>
                              <span className="text-ink">{c.text}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {openComment === p.id && (
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          autoFocus
                          value={draft}
                          maxLength={60}
                          placeholder="说点什么…"
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              commentAsMe(p.id, draft)
                              setDraft('')
                              setOpenComment(null)
                            }
                          }}
                          className="min-w-0 flex-1 rounded-lg bg-page px-2.5 py-2 text-[13px] text-ink outline-none ring-1 ring-hairline focus:ring-brand placeholder:text-ink-faint"
                        />
                        <button
                          className="tap rounded-lg bg-brand px-3 py-2 text-[13px] text-white"
                          onClick={() => {
                            commentAsMe(p.id, draft)
                            setDraft('')
                            setOpenComment(null)
                          }}
                        >
                          发送
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            )
          })}

          <p className="pt-2 text-center text-[11px] leading-relaxed text-ink-faint">
            — 双方都可以发动态 —
            <br />
            他什么时候点赞 / 评论，看 设置 → 概率调节引擎 → 朋友圈（点赞响应 / 评论响应）
          </p>
        </div>
      </div>

      {/* 发动态 */}
      {writing && (
        <div className="absolute inset-0 z-40 flex flex-col justify-end">
          <button className="flex-1 bg-black/25" onClick={() => setWriting(false)} aria-label="关闭" />
          <div className="rounded-t-2xl bg-page px-4 pb-5 pt-3 shadow-phone">
            <div className="mb-2 flex items-center">
              <span className="text-[13px] text-ink-sub">发一条动态</span>
              <button className="tap ml-auto text-[13px] text-ink-faint" onClick={() => setWriting(false)}>
                ✕
              </button>
            </div>
            <textarea
              autoFocus
              rows={4}
              value={text}
              maxLength={300}
              placeholder="这一刻的想法…"
              onChange={(e) => setText(e.target.value)}
              className="w-full resize-none rounded-lg bg-surface px-3 py-2.5 text-[15px] leading-relaxed text-ink outline-none ring-1 ring-hairline focus:ring-brand placeholder:text-ink-faint"
            />
            <div className="mt-3 flex gap-2">
              <button
                className="tap flex-1 rounded-lg bg-surface py-2.5 text-[14px] text-ink-sub ring-1 ring-hairline"
                onClick={() => setWriting(false)}
              >
                取消
              </button>
              <button className="tap flex-[2] rounded-lg bg-brand py-2.5 text-[14px] text-white" onClick={post}>
                发布
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
