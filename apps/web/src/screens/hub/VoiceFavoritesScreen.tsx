import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { NavBar } from '@/components/common/NavBar'
import { Avatar } from '@/components/common/Avatar'
import { PromptSheet } from '@/components/common/PromptSheet'
import { attachVoiceAsCard, clipSentence, detachVoice, removeClip } from '@/lib/voiceFav'
import { FAVORITE_CATEGORIES, favoriteCategory, favoriteDisplayTitle } from '@/lib/favorites'
import { useAppStore } from '@/store/useAppStore'
import { useCardsStore } from '@/store/useCardsStore'
import type { VoiceClip } from '@/types'

/**
 * 收藏（功能 Hub → ⭐）
 *
 * 两种来源：快照收藏（聊天 / 字卡 / 推送 / 语音 / 信件 / 朋友圈，我收藏的 / 他收藏我的）和语音夹。
 * 语音还能「变成语音字卡」→ 字卡库多一张带语音的文字卡，以后抽到它就直接发这段音频，
 * 不再调 MiniMax、不再花钱。解绑 / 删除都在这里做。
 */

/** 同一时刻只放一条（和聊天里的语音气泡一样） */
let active: HTMLAudioElement | null = null

const fmtDur = (ms: number) => (ms > 0 ? `${Math.max(1, Math.round(ms / 1000))}″` : '…')

const fmtDate = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function VoiceFavoritesScreen() {
  const voices = useAppStore((s) => s.voices)
  const me = useAppStore((s) => s.me)
  const dream = useAppStore((s) => s.dream)
  const patchVoice = useAppStore((s) => s.patchVoice)
  const push = useAppStore((s) => s.push)
  const cards = useCardsStore((s) => s.cards)
  const favorites = useAppStore((s) => s.favorites)
  const favoriteReasons = useAppStore((s) => s.favoriteReasons)
  const removeFavorite = useAppStore((s) => s.removeFavorite)
  const addFavoriteReason = useAppStore((s) => s.addFavoriteReason)
  const removeFavoriteReason = useAppStore((s) => s.removeFavoriteReason)

  const [tab, setTab] = useState<'mine' | 'his'>('mine')
  const [cat, setCat] = useState<string>('全部')
  const [newReason, setNewReason] = useState('')

  const [playingId, setPlayingId] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<VoiceClip | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)

  /** 切屏幕时把自己停掉，别留个后台还在响 */
  useEffect(
    () => () => {
      const a = audioRef.current
      if (a && !a.paused) a.pause()
      if (active === a) active = null
    },
    [],
  )

  const say = (t: string) => {
    setToast(t)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 3000)
  }

  const toggle = (c: VoiceClip) => {
    const cur = audioRef.current
    if (playingId === c.id && cur) {
      cur.pause()
      setPlayingId(null)
      return
    }
    if (cur) {
      cur.pause()
      if (active === cur) active = null
    }
    const el = new Audio(c.url)
    el.onended = () => {
      setPlayingId(null)
      if (active === el) active = null
    }
    el.onerror = () => {
      setPlayingId(null)
      say('这段音频播不出来')
    }
    if (active && active !== el) active.pause()
    active = el
    audioRef.current = el
    setPlayingId(c.id)
    void el.play().catch(() => {
      setPlayingId(null)
      say('浏览器拦了播放，再点一次试试')
    })
  }

  const bind = (c: VoiceClip) => {
    const r = attachVoiceAsCard(c)
    if (!r) {
      say('先给它填一句文字（改名那边也能改），才能变成字卡')
      return
    }
    say(
      r.created
        ? `已在字卡库新增《${r.card.text}》· 抽到就发这段语音，不再花钱`
        : `已绑到字卡《${r.card.text}》· 抽到就发这段语音，不再花钱`,
    )
  }

  const boundCardOf = (c: VoiceClip) => (c.cardId ? cards.find((x) => x.id === c.cardId) : undefined)
  const cardMissing = (c: VoiceClip) => Boolean(c.cardId) && !boundCardOf(c)

  const mineFavs = favorites.filter((f) => f.owner === 'me' && f.kind !== 'VOICE')
  const hisFavs = favorites.filter((f) => f.owner === 'dream')
  const baseList = tab === 'mine' ? mineFavs : hisFavs
  const favList = cat === '全部' ? baseList : baseList.filter((f) => favoriteCategory(f) === cat)

  return (
    <div className="relative flex h-full flex-col bg-page">
      <NavBar
        title={`收藏 · ${favorites.length + voices.length}`}
        right={
          <button className="tap px-2 text-[13px] text-ink-sub" onClick={() => push('card-library')}>
            字卡库
          </button>
        }
      />

      <div className="no-scrollbar flex-1 overflow-y-auto pb-8">
        <div className="mx-3 mt-3 grid grid-cols-2 gap-1 rounded-xl bg-surface p-1 shadow-card">
          <button
            className={clsx(
              'tap rounded-lg py-2 text-[13px]',
              tab === 'mine' ? 'bg-brand text-white' : 'text-ink-sub',
            )}
            onClick={() => {
              setTab('mine')
              setCat('全部')
            }}
          >
            我收藏的
          </button>
          <button
            className={clsx(
              'tap rounded-lg py-2 text-[13px]',
              tab === 'his' ? 'bg-brand text-white' : 'text-ink-sub',
            )}
            onClick={() => {
              setTab('his')
              setCat('全部')
            }}
          >
            他收藏我的
          </button>
        </div>

        {tab === 'his' && (
          <div className="mx-3 mt-2 rounded-xl bg-surface p-3 shadow-card">
            <div className="text-[12px] font-medium text-ink">他收藏我的时，会写一句原因</div>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">
              从这里挑一句；默认给了 6 条，可以删，也可以自己加。聊天里我发的东西也可能被他悄悄收进来。
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {favoriteReasons.map((r) => (
                <button
                  key={r}
                  className="tap rounded-full bg-page px-2.5 py-1 text-[11px] text-ink-sub ring-1 ring-hairline"
                  onClick={() => removeFavoriteReason(r)}
                  title="点一下删掉这条原因"
                >
                  {r} ×
                </button>
              ))}
            </div>
            <div className="mt-2 flex gap-1.5">
              <input
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                placeholder="再加一条原因…"
                maxLength={24}
                className="min-w-0 flex-1 rounded-lg border border-hairline bg-page px-2.5 py-1.5 text-[12px] outline-none"
              />
              <button
                className="tap rounded-lg bg-brand/10 px-3 py-1.5 text-[12px] text-brand-deep ring-1 ring-brand/30"
                onClick={() => {
                  addFavoriteReason(newReason)
                  setNewReason('')
                }}
              >
                添加
              </button>
            </div>
          </div>
        )}

        <div className="mx-3 mt-2 flex flex-wrap gap-1.5">
          {FAVORITE_CATEGORIES.map((c) => (
            <button
              key={c}
              className={clsx(
                'tap rounded-full px-2.5 py-1 text-[11px] ring-1',
                cat === c
                  ? 'bg-brand text-white ring-brand'
                  : 'bg-surface text-ink-sub ring-hairline',
              )}
              onClick={() => setCat(c)}
            >
              {c}
            </button>
          ))}
        </div>

        {favList.length > 0 && (
          <div className="mt-2 flex flex-col gap-2 px-3">
            {favList.map((f) => {
              const whose = f.author === 'dream' ? dream : me
              const reply = f.payload?.messageKind
              return (
                <div key={f.id} className="rounded-xl bg-surface p-3 shadow-card">
                  <div className="flex items-center gap-1.5 text-[11px] text-ink-faint">
                    <span className="rounded bg-brand/10 px-1.5 py-0.5 leading-none text-brand-deep">
                      {favoriteCategory(f)}
                    </span>
                    <span>{f.author === 'dream' ? '他的' : '我的'}</span>
                    <span>·</span>
                    <span>{fmtDate(f.createdAt)}</span>
                    <button
                      className="tap ml-auto px-1 text-[11px] text-ink-faint"
                      onClick={() => removeFavorite(f.id)}
                    >
                      移除
                    </button>
                  </div>
                  <div className="mt-1.5 truncate text-[14px] text-ink">{favoriteDisplayTitle(f)}</div>
                  {(f.kind === 'LETTER' || f.kind === 'MOMENT' || f.text) && (
                    <p className="mt-1 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-ink-sub">
                      {String(f.kind === 'LETTER' ? f.payload?.body ?? f.text : f.text).slice(0, 500)}
                    </p>
                  )}
                  {reply === 'IMAGE' && Boolean(f.payload?.url) && (
                    <img
                      src={String(f.payload?.url)}
                      alt=""
                      className="mt-2 max-h-40 rounded-lg object-cover"
                    />
                  )}
                  {f.reason && (
                    <div className="mt-2 rounded-lg bg-brand/8 px-2.5 py-1.5 text-[11px] leading-snug text-brand-deep">
                      收藏原因：{f.reason}
                    </div>
                  )}
                  <div className="mt-1.5 text-[10px] text-ink-faint">
                    {f.owner === 'me' ? '我收的' : '他收的'} · 来自{whose.nickname}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {baseList.length === 0 && (
          <div className="mx-5 mt-8 text-center text-[12px] leading-relaxed text-ink-faint">
            {tab === 'mine'
              ? '还没有收藏；长按他的消息 → 收藏，或者在信 / 朋友圈里点收藏。'
              : '他还没收藏你的东西；可以先在聊天里点「让他收藏这条」，或等他自己收。'}
          </div>
        )}

        {tab === 'mine' && (
          <>
        <div className="mx-3 mt-3 rounded-xl bg-surface p-3 shadow-card">
          <p className="text-[12px] leading-relaxed text-ink-sub">
            在聊天里<b className="text-ink">长按他的语音 → ⭐ 收藏这段语音</b>，就会存在这里。
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
            点「变成语音字卡」＝ 字卡库里多一张<b className="text-ink-sub">配了这段音频</b>的文字卡：
            以后引擎抽到那张卡，直接发这段音频 —— <b className="text-ink-sub">不再合成、不再花钱</b>，
            而且卡上的文字和语音永远是同一句（那张卡会自动「禁组句」，免得被造句改写）。
          </p>
        </div>

        {voices.length === 0 ? (
          <div className="mt-16 flex flex-col items-center gap-2 px-10 text-center">
            <span className="text-[34px]">⭐</span>
            <p className="text-[13px] text-ink-sub">还没有收藏的语音</p>
            <p className="text-[11px] leading-relaxed text-ink-faint">
              他的语音消息下面长按 → 收藏；我按住说话发出去的也能收藏。
            </p>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-2 px-3">
            {voices.map((c) => {
              const mine = c.speaker === 'me'
              const whose = mine ? me : dream
              const bound = boundCardOf(c)
              const playing = playingId === c.id
              const title = c.label?.trim() || c.text?.trim() || '（没有转写，先给它改个名）'
              /** 已经绑上字卡了就不用再点（想换一张：先解绑再绑） */
              const canBind = Boolean(clipSentence(c)) && !bound
              return (
                <div key={c.id} className="rounded-xl bg-surface p-3 shadow-card">
                  <div className="flex items-start gap-2.5">
                    <Avatar src={whose.avatarUrl} name={whose.nickname} size={34} />

                    <button
                      className="tap mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/12 text-[15px] text-brand-deep ring-1 ring-brand/25"
                      onClick={() => toggle(c)}
                      title="播放 / 暂停"
                    >
                      {playing ? '⏸' : '▶'}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] text-ink">{title}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-faint">
                        <span className={clsx('rounded px-1 py-0.5 leading-none ring-1', mine ? 'ring-hairline' : 'ring-brand/25 text-brand-deep')}>
                          {mine ? '我说' : '他说'}
                        </span>
                        <span className="tabular-nums">{fmtDur(c.durationMs)}</span>
                        <span>·</span>
                        <span>{fmtDate(c.createdAt)}</span>
                        {c.voiceId && <span className="truncate">· {c.voiceId}</span>}
                      </div>
                    </div>
                  </div>

                  {/* 转写 / 自定义名字 */}
                  {!!c.label?.trim() && !!c.text?.trim() && (
                    <p className="mt-2 rounded-lg bg-page px-2.5 py-2 text-[12px] leading-snug text-ink-sub">{c.text}</p>
                  )}

                  {/* 绑定状态 */}
                  {bound && (
                    <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-brand/8 px-2.5 py-1.5 text-[11px] text-brand-deep">
                      <span>🎙 已绑到字卡</span>
                      <b className="min-w-0 flex-1 truncate">{bound.text}</b>
                      <span className="shrink-0 text-ink-faint">抽到就发这段</span>
                    </div>
                  )}
                  {cardMissing(c) && (
                    <div className="mt-2 rounded-lg bg-page px-2.5 py-1.5 text-[11px] text-ink-faint">
                      这张字卡已经被删掉了 → 可以重新「变成语音字卡」
                    </div>
                  )}

                  {/* 操作 */}
                  {confirmId === c.id ? (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="flex-1 text-[11px] leading-snug text-ink-sub">
                        删掉这条收藏？
                        {bound ? '那张字卡上的语音也会一起清掉（卡留着）。' : ''}
                      </span>
                      <button
                        className="tap rounded-lg bg-surface px-2.5 py-1 text-[12px] text-ink-sub ring-1 ring-hairline"
                        onClick={() => setConfirmId(null)}
                      >
                        取消
                      </button>
                      <button
                        className="tap rounded-lg bg-red-500 px-2.5 py-1 text-[12px] text-white"
                        onClick={() => {
                          removeClip(c)
                          setConfirmId(null)
                          say('已删除')
                        }}
                      >
                        删除
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <button
                        className="tap rounded-lg bg-page px-2.5 py-1 text-[12px] text-ink-sub ring-1 ring-hairline"
                        onClick={() => setRenaming(c)}
                      >
                        改名
                      </button>
                      <button
                        className={clsx(
                          'tap rounded-lg px-2.5 py-1 text-[12px] ring-1',
                          canBind ? 'bg-brand/10 text-brand-deep ring-brand/30' : 'bg-page text-ink-faint ring-hairline',
                        )}
                        onClick={() => bind(c)}
                        title={
                          bound
                            ? '已经配在这张卡上了'
                            : canBind
                              ? '在字卡库新增 / 绑定一张带这段音频的文字卡'
                              : '这段没有文字，先改名填一句'
                        }
                        disabled={!canBind}
                      >
                        🎙 变成语音字卡
                      </button>
                      {bound && (
                        <button
                          className="tap rounded-lg bg-page px-2.5 py-1 text-[12px] text-ink-sub ring-1 ring-hairline"
                          onClick={() => {
                            detachVoice(c)
                            say('已解绑（字卡还在字卡库里，只是不再配语音）')
                          }}
                        >
                          解绑
                        </button>
                      )}
                      <span className="flex-1" />
                      {confirmId === c.id ? null : (
                        <button
                          className="tap rounded-lg px-2.5 py-1 text-[12px] text-ink-faint"
                          onClick={() => setConfirmId(c.id)}
                        >
                          删除
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {voices.length > 0 && (
          <p className="px-5 pb-2 pt-4 text-[11px] leading-relaxed text-ink-faint">
            音频直接存在收藏里（跟着数据一起同步），所以换设备、清缓存都还听得到；
            重复听一段已经合成过的语音不会再花钱。
          </p>
        )}
          </>
        )}
      </div>

      {renaming && (
        <PromptSheet
          title="给这段语音改个名（也能当字卡上的文字）"
          value={renaming.label ?? renaming.text ?? ''}
          placeholder="比如：晚安、想你了…"
          maxLength={30}
          hint="名字只影响这里的显示；「变成语音字卡」用的是这段语音的转写文字（没有转写时才用名字）。"
          onSave={(v) => {
            patchVoice(renaming.id, { label: v })
            say('已改名')
          }}
          onClose={() => setRenaming(null)}
        />
      )}

      {toast && (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-30 flex justify-center px-6">
          <div className="rounded-lg bg-black/75 px-3 py-2 text-[12px] leading-snug text-white shadow-phone">{toast}</div>
        </div>
      )}
    </div>
  )
}
