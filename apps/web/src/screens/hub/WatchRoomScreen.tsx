import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { NavBar } from '@/components/common/NavBar'
import { nid } from '@/lib/ids'
import { humanDur } from '@/lib/companion'
import { mmss } from '@/lib/music'
import { saveWatchVideo } from '@/lib/repo'
import { loadWatchItem, mountVideo, onVideo, pauseVideo, playVideo, playWatchItem, seekVideo, stopVideo, videoState } from '@/lib/videoEl'
import {
  WATCH_KIND_LABEL,
  WATCH_PICKS,
  bilibiliEmbedUrl,
  bilibiliPageUrl,
  humanRuntime,
  itemFromInput,
  newWatchId,
  watchCover,
  watchItemFromPick,
  watchPlayKind,
} from '@/lib/watch'
import { endWatch, flushWatchClock, startWatch, watchReplyMe } from '@/lib/engine/watch'
import { useAppStore } from '@/store/useAppStore'
import type { WatchItem } from '@/types'

/**
 * 观影室（一起看片）
 *
 * 两条边界写在明面上，不糊过去：
 *   ① **进度是真的** —— 本机视频文件 / 直链走 `<video>`，看到第几秒、一共看了多久都是真的；
 *      B 站的片走**官方 iframe 播放器**（`player.bilibili.com`），跨域读不到它的 `currentTime`，
 *      所以那一种**不算「一起看了多久」，也不发弹幕**（不在假进度上飘字）。
 *   ② **他说的话是抽出来的** —— 他进不进来、发几条弹幕、第几秒发、房间里说一句、会不会先走，
 *      全在 `watchRoom.*` 规则里，种子 = 这一次观影的 id（刷新不会重掷）。
 *      他这一场排的弹幕可以点开看（会剧透，自己决定）。
 */
export function WatchRoomScreen() {
  const room = useAppStore((s) => s.watchRoom)
  const me = useAppStore((s) => s.me)
  const dream = useAppStore((s) => s.dream)
  const addWatchItems = useAppStore((s) => s.addWatchItems)
  const removeWatchItem = useAppStore((s) => s.removeWatchItem)
  const markWatchFinished = useAppStore((s) => s.markWatchFinished)
  const pushWatchMessage = useAppStore((s) => s.pushWatchMessage)

  const active = room.active
  const item = useMemo(() => room.items.find((i) => i.id === active?.itemId), [room.items, active?.itemId])
  const kind = item ? watchPlayKind(item) : 'none'

  const [vs, setVs] = useState(videoState())
  useEffect(() => onVideo(setVs), [])

  // 离开页面：把没落盘的真实秒数补上、画面停下来
  useEffect(
    () => () => {
      flushWatchClock()
      pauseVideo()
    },
    [],
  )

  const boxRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!active || kind !== 'video') return
    mountVideo(boxRef.current)
    // 刷新后回到房间里：播放器是空的 —— 把这一部重新挂上，并接着上次的位置
    const it = room.items.find((i) => i.id === active.itemId)
    if (it && videoState().itemId !== it.id) {
      void loadWatchItem(it).then(() => {
        const at = room.position[it.id] ?? 0
        if (at > 1) seekVideo(at)
      })
    }
    return () => mountVideo(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.itemId, kind])

  // 房间里的倒计时（他还没到 / 他快走了）
  const [nowMs, setNowMs] = useState(Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active])

  const begin = async (it: WatchItem, fromStart = false) => {
    startWatch(it.id)
    if (watchPlayKind(it) === 'video') {
      const at = fromStart ? 0 : room.position[it.id] ?? 0
      await playWatchItem(it, at)
    }
  }

  const finish = (finished: boolean) => {
    if (item && finished) markWatchFinished(item.id, true)
    // 先把播放器摘掉再收尾：否则「暂停」这件事会被当成「按了播放」又开一场
    pauseVideo()
    if (finished) stopVideo()
    endWatch(finished)
  }

  if (!active) return <Lobby onBegin={begin} />

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0b0d12] text-white">
      <NavBar title="观影室" tint right={<span className="pr-1 text-[12px] opacity-80">{item ? watchCover(item) : ''}</span>} />

      <div className="no-scrollbar flex-1 overflow-y-auto">
        {/* 播放器 */}
        <div className="relative w-full bg-black" style={{ aspectRatio: kind === 'video' ? '16 / 9' : undefined }}>
          {kind === 'video' && <div ref={boxRef} className="h-full w-full" style={{ aspectRatio: '16 / 9' }} />}

          {kind === 'iframe' && item?.source.bvid && (
            <iframe
              title={item.title}
              src={bilibiliEmbedUrl(item.source.bvid, item.source.page ?? 1)}
              allowFullScreen
              className="h-full w-full"
              style={{ aspectRatio: '16 / 9', border: 0 }}
            />
          )}

          {kind === 'none' && (
            <div className="flex flex-col items-center justify-center gap-2 px-6 text-center" style={{ aspectRatio: '16 / 9' }}>
              <span className="text-4xl">{item ? watchCover(item) : '🎬'}</span>
              <p className="text-[13px] text-white/80">《{item?.title}》这边放不出来</p>
              <p className="text-[11px] leading-relaxed text-white/50">
                {item?.source.kind === 'title'
                  ? '他推的片子只带了片名 —— 想看就把本机文件导入，或者贴一个直链 / B 站链接。'
                  : '这份来源没有可播的地址。'}
              </p>
              {item?.source.bvid && (
                <a
                  className="rounded-full bg-white/10 px-3 py-1 text-[11px] text-white/80"
                  href={bilibiliPageUrl(item.source.bvid, item.source.page ?? 1)}
                  target="_blank"
                  rel="noreferrer"
                >
                  去 B 站看 ↗
                </a>
              )}
            </div>
          )}

          {/* 弹幕层：只有控得了进度的片才有（时间轴 = 片子里第几秒） */}
          {kind === 'video' && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              {room.danmaku
                .filter((d) => d.itemId === item?.id && d.atSec <= vs.position + 0.6 && d.atSec > vs.position - 9)
                .slice(-6)
                .map((d, i) => (
                  <div
                    key={d.id}
                    className="danmaku absolute whitespace-nowrap rounded-full bg-black/45 px-2.5 py-1 text-[13px] text-white shadow"
                    style={{
                      top: `${12 + ((i * 37) % 62)}%`,
                      animationDuration: '8s',
                    }}
                  >
                    {d.text}
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* 控制条 */}
        <div className="space-y-2 px-3 py-2.5">
          <div className="flex items-center gap-3">
            {kind === 'video' ? (
              <>
                <button
                  className="tap flex h-9 w-9 items-center justify-center rounded-full bg-white/12 text-[15px]"
                  onClick={() => (vs.playing ? pauseVideo() : void playVideo())}
                  title={vs.playing ? '暂停' : '播放'}
                >
                  {vs.playing ? '❚❚' : '▶'}
                </button>
                <span className="w-28 shrink-0 text-[11px] tabular-nums text-white/70">
                  {mmss(vs.position)} / {vs.duration > 0 ? mmss(vs.duration) : '--:--'}
                </span>
                <input
                  className="h-1 min-w-0 flex-1 appearance-none rounded-full bg-white/20 accent-white"
                  type="range"
                  min={0}
                  max={vs.duration > 0 ? vs.duration : 1}
                  step={1}
                  value={vs.position}
                  onChange={(e) => seekVideo(Number(e.target.value))}
                />
              </>
            ) : (
              <p className="text-[11px] leading-relaxed text-white/60">
                {kind === 'iframe'
                  ? '进度归 B 站播放器管（跨域读不到），所以这一场不算「一起看了多久」，也不发弹幕。'
                  : '这部只有片名，播不了 —— 他陪着你看这件事就先放着。'}
              </p>
            )}
          </div>

          {vs.error && <p className="text-[11px] text-amber-300/90">{vs.error}</p>}

          {/* 他现在的状态 */}
          <div className="flex items-center gap-2 rounded-xl bg-white/6 px-3 py-2">
            <span className="text-[16px]">{active.heJoinedAt ? '👀' : active.heComingAt && +new Date(active.heComingAt) > nowMs ? '⏳' : '💤'}</span>
            <span className="min-w-0 flex-1 text-[12px] text-white/85">
              {active.heJoinedAt
                ? '他在房间里，一起看着'
                : active.heComingAt && +new Date(active.heComingAt) > nowMs
                  ? `他说一会儿再来 · 还有 ${Math.max(1, Math.ceil((+new Date(active.heComingAt) - nowMs) / 1000))} 秒`
                  : '他先走了 —— 片照放，他不说话了'}
            </span>
            {active.heLeavesAt && active.heJoinedAt && +new Date(active.heLeavesAt) > nowMs && (
              <span className="shrink-0 text-[10px] text-white/45">
                {Math.max(1, Math.round((+new Date(active.heLeavesAt) - nowMs) / 60_000))} 分钟后他准备走
              </span>
            )}
          </div>
        </div>

        {/* 房间对话 + 他的弹幕清单 */}
        <div className="space-y-2 px-3 pb-4">
          <RoomChat
            myId={me.id}
            hisId={dream.id}
            hisName={dream.nickname}
            messages={room.messages}
            onSend={(text) => {
              pushWatchMessage({ id: nid('wm'), senderId: me.id, text, createdAt: new Date().toISOString() })
              watchReplyMe()
            }}
          />

          {kind === 'video' && (
            <details className="rounded-xl bg-white/5 px-3 py-2">
              <summary className="cursor-pointer text-[11px] text-white/60">
                点开看他这一场排的弹幕（{room.danmaku.filter((d) => d.itemId === item?.id).length} 条 · 会剧透）
              </summary>
              <ul className="mt-2 space-y-1">
                {room.danmaku
                  .filter((d) => d.itemId === item?.id)
                  .map((d) => (
                    <li key={d.id} className="flex items-center gap-2 text-[11px] text-white/70">
                      <span className="tabular-nums text-white/40">{mmss(d.atSec)}</span>
                      <span className="min-w-0 flex-1 truncate">{d.text}</span>
                      {d.atSec <= vs.position && <span className="shrink-0 text-white/30">已飘过</span>}
                    </li>
                  ))}
                {room.danmaku.filter((d) => d.itemId === item?.id).length === 0 && (
                  <li className="text-[11px] text-white/40">
                    {active.heJoinedAt ? '他还没排（片长出来之后才排）' : '他还没进来'}
                  </li>
                )}
              </ul>
            </details>
          )}

          <div className="flex gap-2 pb-2">
            <button
              className="tap flex-1 rounded-xl bg-white/12 py-2.5 text-[13px] text-white"
              onClick={() => finish(true)}
            >
              看完了
            </button>
            <button
              className="tap flex-1 rounded-xl bg-brand py-2.5 text-[13px] font-medium text-white"
              onClick={() => finish(false)}
            >
              先停在这儿
            </button>
          </div>
          <p className="pb-4 text-center text-[10px] leading-relaxed text-white/35">
            《{item?.title}》· 全片单累计真的看了 {humanDur(room.playedSec)}
          </p>
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────── 片单（没在房间里的时候） ───────────────────────── */

function Lobby({ onBegin }: { onBegin: (item: WatchItem, fromStart?: boolean) => void }) {
  const room = useAppStore((s) => s.watchRoom)
  const addWatchItems = useAppStore((s) => s.addWatchItems)
  const removeWatchItem = useAppStore((s) => s.removeWatchItem)
  const markWatchFinished = useAppStore((s) => s.markWatchFinished)

  const [tab, setTab] = useState<'local' | 'url' | 'bilibili' | 'title'>('local')
  const [input, setInput] = useState('')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)

  const push = (it: WatchItem | null) => {
    if (!it) return
    addWatchItems([it])
    setInput('')
    setTitle('')
  }

  const onFile = async (file?: File | null) => {
    if (!file) return
    setBusy(true)
    try {
      const id = newWatchId()
      const blobKey = `video:${id}`
      await saveWatchVideo(blobKey, file)
      addWatchItems([
        {
          id,
          title: title.trim() || file.name.replace(/\.[a-z0-9]{2,5}$/i, ''),
          cover: '📁',
          source: { kind: 'local', blobKey, label: file.name },
          addedBy: 'me',
          addedAt: new Date().toISOString(),
        },
      ])
      setTitle('')
    } finally {
      setBusy(false)
    }
  }

  const submit = () => {
    const s = input.trim()
    if (tab === 'title') return push(itemFromInput('', s))
    if (!s) return
    if (tab === 'url') return push(itemFromInput(s, title))
    if (tab === 'bilibili') return push(itemFromInput(s, title))
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-page">
      <NavBar title="观影室" />

      <div className="no-scrollbar flex-1 overflow-y-auto px-3 pb-6">
        <div className="mt-3 rounded-2xl bg-surface p-3.5 shadow-card">
          <h3 className="text-[13px] font-medium text-ink">一起看片</h3>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-sub">
            本机视频文件 / 直链 → 用真播放器放，<b className="text-ink">看到第几秒、一共看了多久都是真的</b>；
            B 站链接 → 用官方播放器嵌进来播，但跨域读不到它的进度，所以那种<b className="text-ink">不算一起看了多久，也不发弹幕</b>。
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
            他的弹幕与发言是抽出来的（「设置 → 概率调节引擎 → 观影室」），种子 = 这一次观影的 id，刷新不会重掷。
          </p>
        </div>

        {/* 导入 */}
        <div className="mt-3 rounded-2xl bg-surface p-3.5 shadow-card">
          <div className="flex gap-1.5">
            {(
              [
                ['local', '本机视频'],
                ['url', '直链'],
                ['bilibili', 'B 站'],
                ['title', '只有片名'],
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

          {tab === 'local' ? (
            <div className="mt-2.5 space-y-2">
              <input
                className="w-full rounded-xl bg-page px-3 py-2 text-[12px] text-ink outline-none ring-1 ring-hairline placeholder:text-ink-faint"
                placeholder="片名（可留空，用文件名）"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <label className="tap flex items-center justify-center rounded-xl border border-dashed border-hairline py-3 text-[12px] text-ink-sub">
                {busy ? '正在存到本机…' : '选择本机视频文件（存在本机，不上传）'}
                <input
                  className="hidden"
                  type="file"
                  accept="video/*"
                  onChange={(e) => void onFile(e.target.files?.[0])}
                />
              </label>
              <p className="text-[10px] leading-relaxed text-ink-faint">
                视频文件很大，存在本机的 IndexedDB 里（换设备要重新导入）；手机上别导入太大的文件。
              </p>
            </div>
          ) : (
            <div className="mt-2.5 space-y-2">
              <input
                className="w-full rounded-xl bg-page px-3 py-2 text-[12px] text-ink outline-none ring-1 ring-hairline placeholder:text-ink-faint"
                placeholder={
                  tab === 'url'
                    ? 'https://…/movie.mp4（视频直链）'
                    : tab === 'bilibili'
                      ? 'https://www.bilibili.com/video/BV… 或直接贴 BV 号'
                      : '片名，例如「言叶之庭」'
                }
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
              {tab !== 'title' && (
                <input
                  className="w-full rounded-xl bg-page px-3 py-2 text-[12px] text-ink outline-none ring-1 ring-hairline placeholder:text-ink-faint"
                  placeholder="片名（可留空）"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              )}
              <button className="tap w-full rounded-xl bg-brand py-2 text-[12.5px] font-medium text-white" onClick={submit}>
                加进片单
              </button>
            </div>
          )}
        </div>

        {/* 片单 */}
        <div className="mt-3 rounded-2xl bg-surface p-3.5 shadow-card">
          <div className="flex items-center">
            <h3 className="text-[13px] font-medium text-ink">片单</h3>
            <span className="ml-auto text-[11px] text-ink-faint">
              真的一起看了 {humanDur(room.playedSec)}
            </span>
          </div>

          {room.items.length === 0 ? (
            <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
              片单还是空的。上面导入一部，或者点下面的「让他推一部」—— 他推的只有片名，播不了就明说。
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {room.items.map((it) => {
                const k = watchPlayKind(it)
                const pos = room.position[it.id] ?? 0
                const dur = it.durationMs ? it.durationMs / 1000 : 0
                return (
                  <li key={it.id} className="rounded-xl bg-page p-2.5 ring-1 ring-hairline">
                    <div className="flex items-start gap-2.5">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-[20px]">
                        {watchCover(it)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{it.title}</span>
                          {it.finishedAt && (
                            <span className="shrink-0 rounded-full bg-brand-soft px-1.5 py-0.5 text-[9px] text-brand-deep">已看完</span>
                          )}
                        </div>
                        <div className="mt-0.5 text-[10.5px] text-ink-faint">
                          {WATCH_KIND_LABEL[it.source.kind]}
                          {it.addedBy === 'him' ? ' · 他推的' : ''}
                          {dur > 0 ? ` · ${humanRuntime(dur)}` : ''}
                          {pos > 0 && dur > 0 ? ` · 看到 ${mmss(pos)}` : ''}
                        </div>
                        {it.note && <div className="mt-0.5 text-[10.5px] leading-snug text-ink-sub">「{it.note}」</div>}
                        {dur > 0 && pos > 0 && (
                          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-hairline">
                            <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (pos / dur) * 100)}%` }} />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <button
                        className="tap flex-1 rounded-lg bg-brand py-1.5 text-[11.5px] font-medium text-white"
                        onClick={() => onBegin(it, pos <= 0)}
                      >
                        {k === 'none' ? '陪他放着（播不了）' : pos > 5 ? `接着看（${mmss(pos)}）` : '一起看'}
                      </button>
                      <button
                        className="tap rounded-lg bg-surface px-2.5 py-1.5 text-[11px] text-ink-sub ring-1 ring-hairline"
                        onClick={() => markWatchFinished(it.id, !it.finishedAt)}
                      >
                        {it.finishedAt ? '取消看完' : '标记看完'}
                      </button>
                      <button
                        className="tap rounded-lg bg-surface px-2.5 py-1.5 text-[11px] text-ink-faint ring-1 ring-hairline"
                        onClick={() => removeWatchItem(it.id)}
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
              const pick = WATCH_PICKS[Math.floor(Math.random() * WATCH_PICKS.length)]
              addWatchItems([watchItemFromPick(pick, 'him')])
            }}
          >
            🍿 让他推一部（手动 · 他推的只有片名）
          </button>
        </div>

        <p className="mt-4 text-center text-[10px] leading-relaxed text-ink-faint">
          这里没有「模拟进度条」：{'<video>'} 没在走，秒数就不加。
        </p>
      </div>
    </div>
  )
}

/* ───────────────────────── 房间对话 ───────────────────────── */

function RoomChat({
  myId,
  hisId,
  hisName,
  messages,
  onSend,
}: {
  myId: string
  hisId: string
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
  void hisId
  return (
    <div className="rounded-xl bg-white/5 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[12px] text-white/70">房间里的对话</span>
        <span className="text-[10px] text-white/35">（跟主聊天分开，不占聊天气泡）</span>
      </div>
      <div className="max-h-56 space-y-1.5 overflow-y-auto">
        {messages.length === 0 && <p className="text-[11px] text-white/35">这里只有你们在房间里说的话。</p>}
        {messages.map((m) => {
          const mine = m.senderId === myId
          return (
            <div key={m.id} className={clsx('flex', mine ? 'justify-end' : 'justify-start')}>
              <div
                className={clsx(
                  'max-w-[78%] rounded-2xl px-2.5 py-1.5 text-[12px] leading-relaxed',
                  mine ? 'bg-brand text-white' : 'bg-white/12 text-white/90',
                )}
              >
                {!mine && <span className="mr-1 text-[10px] text-white/50">{hisName}</span>}
                {m.text}
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          className="min-w-0 flex-1 rounded-full bg-white/10 px-3 py-1.5 text-[12px] text-white outline-none placeholder:text-white/35"
          placeholder="跟他说一句…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send()
          }}
        />
        <button className="tap rounded-full bg-white/12 px-3 py-1.5 text-[12px] text-white/85" onClick={send}>
          说
        </button>
      </div>
    </div>
  )
}
