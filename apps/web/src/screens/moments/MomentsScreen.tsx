import { useState } from 'react'
import { NavBar } from '@/components/common/NavBar'
import { Avatar } from '@/components/common/Avatar'
import { bgCss } from '@/lib/appearance'
import { pickImage, shrinkImageDataUrl } from '@/lib/file'
import { nid } from '@/lib/ids'
import { fromNow } from '@/lib/time'
import { favoriteFromMoment } from '@/lib/favorites'
import { useAppStore } from '@/store/useAppStore'
import { useAppearanceStore } from '@/store/useAppearanceStore'
import { useViewerStore } from '@/store/useViewerStore'
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
  const momentsBackground = useAppearanceStore((s) => s.appearance.momentsBackground)
  const setBackground = useAppearanceStore((s) => s.setBackground)
  const openImage = useViewerStore((s) => s.openImage)
  const [openComment, setOpenComment] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [writing, setWriting] = useState(false)
  const [text, setText] = useState('')
  const [postImages, setPostImages] = useState<string[]>([])
  const [postErr, setPostErr] = useState('')
  const [bgErr, setBgErr] = useState('')

  const nameOf = (id: string) => (id === me.id ? me.nickname : dream.nickname)
  const list = [...moments].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))

  const post = () => {
    const t = text.trim()
    if (!t && postImages.length === 0) return
    const m: Moment = {
      id: nid('p'),
      authorId: me.id,
      text: t,
      images: postImages,
      likes: [],
      comments: [],
      createdAt: new Date().toISOString(),
    }
    pushMoment(m)
    setText('')
    setPostImages([])
    setPostErr('')
    setWriting(false)
  }

  const addPostImages = () => {
    if (postImages.length >= 9) {
      setPostErr('最多 9 张图片。')
      return
    }
    setPostErr('')
    pickImage(
      async (url) => {
        try {
          const small = await shrinkImageDataUrl(url)
          setPostImages((prev) => (prev.length >= 9 ? prev : [...prev, small]))
        } catch {
          setPostErr('这张图片没处理成功，换一张试试。')
        }
      },
      undefined,
      { staticOnly: true, maxBytes: 12 * 1024 * 1024, onError: setPostErr },
    )
  }

  const closeComposer = () => {
    setWriting(false)
    setPostErr('')
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-page">
      <NavBar
        title="朋友圈"
        right={
          <button
            className="tap grid h-8 w-8 place-items-center rounded text-[22px] text-ink-sub"
            onClick={() => {
              setPostErr('')
              setWriting(true)
            }}
            aria-label="发动态"
          >
            ＋
          </button>
        }
      />

      <div className="no-scrollbar flex-1 overflow-y-auto">
        {/* 背景图 + 我的头像 */}
        <div
          className="relative h-36"
          style={{
            background:
              (momentsBackground ? bgCss(momentsBackground) : '') ||
              'linear-gradient(135deg, #bcdcff 0%, #e9f4ff 100%)',
            backgroundPosition: 'center',
            backgroundSize: 'cover',
            backgroundRepeat: 'no-repeat',
          }}
        >
          <div className="absolute right-2 top-2 flex items-center gap-1.5">
            {momentsBackground?.mode === 'image' && momentsBackground.value && (
              <button
                className="tap rounded-full bg-black/30 px-2.5 py-1 text-[11px] text-white backdrop-blur"
                onClick={() =>
                  setBackground('momentsBackground', {
                    mode: 'preset',
                    value: 'linian-blue',
                    blur: 0,
                    dim: 0,
                  })
                }
              >
                恢复默认
              </button>
            )}
            <button
              className="tap rounded-full bg-black/30 px-2.5 py-1 text-[11px] text-white backdrop-blur"
              onClick={() =>
                pickImage(
                  (url) => {
                    setBgErr('')
                    setBackground('momentsBackground', {
                      mode: 'image',
                      value: url,
                      blur: 0,
                      dim: 0,
                    })
                  },
                  undefined,
                  { onError: setBgErr },
                )
              }
            >
              换背景
            </button>
          </div>
          <Avatar src={me.avatarUrl} name={me.nickname} size={64} ring className="absolute -bottom-8 right-4" />
        </div>
        {bgErr && <p className="px-3 pt-2 text-[11px] text-[#e0533d]">{bgErr}</p>}

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

                    {!!p.text && (
                      <p className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed text-ink">{p.text}</p>
                    )}

                    {!!p.images.length && (
                      <div
                        className={
                          p.images.length === 1
                            ? 'mt-2 grid max-w-[72%] grid-cols-1 gap-1.5'
                            : 'mt-2 grid grid-cols-3 gap-1.5'
                        }
                      >
                        {p.images.map((c, i) =>
                          isRealImage(c) ? (
                            <button
                              key={i}
                              type="button"
                              className="tap overflow-hidden rounded-md"
                              onClick={() => openImage(c, '朋友圈图片')}
                              aria-label={`查看朋友圈图片 ${i + 1}`}
                            >
                              <img
                                src={c}
                                alt={`朋友圈图片 ${i + 1}`}
                                className="aspect-square w-full object-cover"
                                draggable={false}
                              />
                            </button>
                          ) : (
                            <div key={i} className="aspect-square rounded-md" style={{ background: c }} />
                          ),
                        )}
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
          <button className="flex-1 bg-black/25" onClick={closeComposer} aria-label="关闭" />
          <div className="max-h-[88%] overflow-y-auto rounded-t-2xl bg-page px-4 pb-5 pt-3 shadow-phone">
            <div className="mb-2 flex items-center">
              <span className="text-[13px] text-ink-sub">发一条动态</span>
              <button className="tap ml-auto text-[13px] text-ink-faint" onClick={closeComposer}>
                ✕
              </button>
            </div>
            <textarea
              rows={4}
              value={text}
              maxLength={300}
              placeholder="这一刻的想法…（也可以只发图片）"
              onChange={(e) => setText(e.target.value)}
              className="w-full resize-none rounded-lg bg-surface px-3 py-2.5 text-[15px] leading-relaxed text-ink outline-none ring-1 ring-hairline focus:ring-brand placeholder:text-ink-faint"
            />

            {postImages.length > 0 && (
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {postImages.map((src, i) => (
                  <div key={i} className="relative aspect-square overflow-hidden rounded-md">
                    <img src={src} alt={`待发图片 ${i + 1}`} className="h-full w-full object-cover" draggable={false} />
                    <button
                      type="button"
                      className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/55 text-[11px] leading-none text-white"
                      onClick={() => setPostImages((prev) => prev.filter((_, j) => j !== i))}
                      aria-label={`移除第 ${i + 1} 张图片`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                className="tap rounded-lg bg-surface px-3 py-1.5 text-[12px] text-ink-sub ring-1 ring-hairline"
                onClick={addPostImages}
              >
                🖼 添加图片
              </button>
              <span className="text-[11px] text-ink-faint">{postImages.length}/9 · 只存本机</span>
            </div>
            {postErr && <p className="mt-1 text-[11px] text-[#e0533d]">{postErr}</p>}

            <div className="mt-3 flex gap-2">
              <button
                className="tap flex-1 rounded-lg bg-surface py-2.5 text-[14px] text-ink-sub ring-1 ring-hairline"
                onClick={closeComposer}
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

/** 真实图片（本地上传的 dataURL / 外链），而不是他动态里的占位色块 */
function isRealImage(src: string) {
  return /^(data:image\/|https?:\/\/|blob:)/i.test(src)
}
