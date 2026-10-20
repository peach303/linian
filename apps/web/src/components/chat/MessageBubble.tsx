import { useState } from 'react'
import clsx from 'clsx'
import type {
  CallPayload,
  ChoicePayload,
  DoodlePayload,
  GiftPayload,
  Message,
  MusicPayload,
  QuestionPayload,
  RedPacketPayload,
} from '@/types'
import { Avatar } from '@/components/common/Avatar'
import { VoiceBubble } from '@/components/chat/VoiceBubble'
import { HisQuestionCard } from '@/components/chat/HisQuestionCard'
import { callSummary } from '@/lib/engine/call'
import { useAppStore } from '@/store/useAppStore'
import { useChatStore } from '@/store/useChatStore'
import { MESSAGE_BUBBLE, BUBBLE_BASE } from './messageStyles'

/**
 * 一条消息的渲染分发：按 `kind` 走不同渲染器。
 * 「我递给他的东西」（抉择 / 问卷 / 红包 / 礼物）都是**有状态**的卡片 ——
 * 卡片本身会随他的回应就地更新（他选了哪个 / 他填了哪题 / 红包被领取 / 礼物被收下）。
 */

interface Props {
  message: Message
  /** 是否为自己发送（右侧气泡） */
  mine: boolean
  /**
   * 字卡占比引擎在 UI 上的体现：不同类型消息走不同渲染器。
   * 真实项目中把 kind 分发到各子组件即可。
   */
  peerName?: string
  peerAvatar?: string
  myAvatar?: string
  onLongPress?: (m: Message) => void
  /** 点他的头像（拍一拍） */
  onPatAvatar?: () => void
}

export function MessageBubble({
  message,
  mine,
  peerName = '梦角',
  peerAvatar,
  myAvatar,
  onLongPress,
  onPatAvatar,
}: Props) {
  const recalled = message.status === 'RECALLED'

  /* 拍一拍 / 系统提示：整行居中的浅色小字，不带头像 */
  if (message.kind === 'PAT' || message.kind === 'SYSTEM') {
    return (
      <div className="my-1.5 px-3 text-center text-[11px] text-ink-faint">
        <span
          className="inline-block rounded px-2 py-1"
          onContextMenu={(e) => {
            e.preventDefault()
            onLongPress?.(message)
          }}
        >
          {message.text}
        </span>
      </div>
    )
  }

  return (
    <div className={clsx('flex w-full gap-2 px-3 py-1.5', mine ? 'flex-row-reverse' : 'flex-row')}>
      {!mine && onPatAvatar ? (
        <button className="tap h-10 shrink-0 rounded-full" title="点他的头像 → 拍一拍" onClick={onPatAvatar}>
          <Avatar src={peerAvatar} name={peerName} size={40} />
        </button>
      ) : (
        <Avatar src={mine ? myAvatar : peerAvatar} name={mine ? '我' : peerName} size={40} />
      )}

      <div className={clsx('flex max-w-[70%] flex-col', mine ? 'items-end' : 'items-start')}>
        {/* 引用块 */}
        {message.quoteOf && !recalled && (
          <div className="mb-1 max-w-full truncate rounded-md border-l-2 border-brand bg-brand-soft/50 px-2 py-1 text-[12px] text-ink-sub">
            {message.quoteOf.text}
          </div>
        )}

        <div className="flex items-end gap-1.5">
          {/* 主动消息 · 左上角小爱心 */}
          {message.proactive && (
            <span
              className="animate-heart-pop self-start text-[12px] leading-none"
              title="梦角主动发来的消息"
            >
              ❤️
            </span>
          )}

          {recalled ? (
            <div className="rounded-lg bg-hairline/70 px-3 py-2 text-[13px] text-ink-faint">
              {mine ? '你' : peerName}撤回了一条消息
            </div>
          ) : (
            <BubbleBody message={message} mine={mine} onLongPress={onLongPress} />
          )}
        </div>

        {/* 情绪 / 心意 / 意图标签 */}
        {!!message.emotionTags?.length && !recalled && (
          <div className="mt-1 flex gap-1">
            {message.emotionTags.map((t) => (
              <span
                key={t}
                className="rounded-full bg-brand-soft/70 px-1.5 py-0.5 text-[10px] leading-none text-brand-deep"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        {/* 已读回执（我发的消息）：已读 / 已读不回 */}
        {mine && !recalled && message.status === 'READ' && (
          <div className="mt-0.5 flex items-center gap-1 text-[10px] leading-none">
            {message.plan?.silent ? (
              <span className="rounded bg-hairline/70 px-1.5 py-0.5 text-ink-faint">已读不回</span>
            ) : (
              <span className="flex items-center gap-0.5 text-ink-faint">
                <span className="text-[9px]">✓✓</span>已读
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function BubbleBody({ message, mine, onLongPress }: Omit<Props, 'peerName' | 'peerAvatar' | 'myAvatar'>) {
  const openRedPacket = useChatStore((s) => s.openRedPacket)
  const base = [
    'ln-bubble animate-bubble-in px-3 py-2 text-[15px] leading-[1.45] break-words',
    mine ? 'ln-bubble-me' : 'ln-bubble-peer',
    BUBBLE_BASE,
    mine ? `bg-bubble text-bubble-ink ${MESSAGE_BUBBLE.mine.tail}` : `bg-bubble-peer text-bubble-ink shadow-card ${MESSAGE_BUBBLE.peer.tail}`,
    message.status === 'SENDING' ? 'opacity-60' : '',
  ].join(' ')

  const common = {
    className: base,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault()
      onLongPress?.(message)
    },
  }

  switch (message.kind) {
    case 'CARD': {
      // 字卡：按卡类型分发（文字卡与普通气泡一致；颜文字 emoji 无气泡放大；表情、图片出图）
      const ct = String(message.payload?.cardType ?? 'TEXT')
      const url = message.payload?.url as string | undefined

      if (ct === 'IMAGE' || ct === 'STICKER') {
        if (url) {
          return (
            <img
              src={url}
              alt=""
              onContextMenu={common.onContextMenu}
              className="animate-bubble-in max-h-52 rounded-xl object-cover shadow-card"
            />
          )
        }
        // 没配图的表情包：图标 + 名字，仍给气泡底
        return (
          <div {...common} className={clsx(base, 'flex items-center gap-1.5')}>
            <span className="text-[18px] leading-none">{ct === 'STICKER' ? '🧸' : '🖼️'}</span>
            {message.text}
          </div>
        )
      }

      if (ct === 'KAOMOJI' || ct === 'EMOJI') {
        return (
          <div className="animate-bubble-in px-1 text-[22px] leading-tight" onContextMenu={common.onContextMenu}>
            {message.text}
          </div>
        )
      }

      // TEXT / SENTENCE：和普通文字一样
      return (
        <div {...common}>
          {message.text}
          {mine && message.status === 'SENDING' && (
            <span className="ml-1 align-[1px] text-[10px] text-ink-faint">✓</span>
          )}
        </div>
      )
    }

    case 'VOICE':
      return <VoiceBubble message={message} mine={mine} className={base} onContextMenu={common.onContextMenu} />

    case 'IMAGE':
      return (
        <img
          src={(message.payload?.url as string) ?? ''}
          alt="图片"
          onContextMenu={common.onContextMenu}
          className="animate-bubble-in max-h-56 rounded-lg object-cover shadow-card"
        />
      )

    case 'RED_PACKET': {
      const p = message.payload as unknown as RedPacketPayload | undefined
      const amount = Number(p?.amount ?? 0)
      const claimed = p?.claimed
      /** 他发来的、还没拆开 —— 点一下才看得到金额（微信里也是这个手感） */
      const openable = !mine && !claimed
      return (
        <button
          {...common}
          onClick={openable ? () => openRedPacket(message.id) : undefined}
          className="animate-bubble-in w-[224px] rounded-lg bg-gradient-to-br from-[#F6A96B] to-[#E8744F] px-3 py-3 text-left text-white shadow-card"
        >
          <div className="flex items-center gap-2">
            <span className="text-[26px] leading-none">🧧</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px]">{p?.blessing || message.text || '恭喜发财'}</div>
              <div className="text-[11px] opacity-90">
                {openable ? '点一下拆开' : `¥ ${amount.toFixed(2)}`}
              </div>
            </div>
          </div>
          <div className="mt-2 border-t border-white/25 pt-1 text-[10px] opacity-85">
            {mine ? (claimed ? '已被领取' : '等他领取') : claimed ? '你已领取' : '黎念红包'}
          </div>
        </button>
      )
    }

    case 'GIFT': {
      const p = message.payload as unknown as GiftPayload | undefined
      const acc = p?.accepted
      return (
        <div {...common} className="animate-bubble-in w-[216px] p-0">
          <div className="flex items-center gap-2 px-3 py-2.5">
            {p?.imageUrl ? (
              <img src={p.imageUrl} alt="" className="h-9 w-9 rounded-lg object-cover" />
            ) : (
              <span className="text-[30px] leading-none">{p?.icon || '🎁'}</span>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px]">{p?.name ?? '礼物'}</div>
              <div className="text-[11px] text-ink-faint">¥ {p?.price ?? 0}</div>
            </div>
          </div>
          {p?.note && (
            <div className="border-t border-hairline px-3 py-1.5 text-[11px] leading-snug text-ink-sub">
              “{p.note}”
            </div>
          )}
          <div className="border-t border-hairline px-3 py-1 text-[10px]">
            {mine ? (
              acc ? (
                <span className="text-brand-deep">他收下了</span>
              ) : (
                <span className="text-ink-faint">等他拆开…</span>
              )
            ) : (
              <span className="text-brand-deep">他送的</span>
            )}
          </div>
        </div>
      )
    }

    case 'CALL_EVENT': {
      const p = message.payload as unknown as CallPayload | undefined
      const missed = p?.phase === 'MISSED'
      return (
        <div {...common} className="animate-bubble-in w-[214px] p-0">
          <div className="flex items-center gap-2 px-3 py-2.5">
            <span className="text-[22px] leading-none">{missed ? '📵' : '📞'}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px]">{p?.direction === 'in' ? '他打来的语音通话' : '语音通话'}</div>
              <div className="text-[11px] text-ink-faint">
                {p ? callSummary(p) : (message.text ?? '')}
              </div>
            </div>
          </div>
        </div>
      )
    }

    case 'MUSIC_INVITE': {
      const p = message.payload as unknown as MusicPayload | undefined
      return (
        <div {...common} className="animate-bubble-in w-[228px] p-0">
          <div className="flex items-center gap-2 px-3 py-2.5">
            <span className="text-[26px] leading-none">{p?.cover ?? '🎵'}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px]">{p?.title ?? '一首歌'}</div>
              <div className="truncate text-[11px] text-ink-faint">{p?.artist ?? ''}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 border-t border-hairline px-3 py-1.5 text-[10px]">
            <span className="min-w-0 flex-1 truncate">
              {p?.from === 'him' ? (
                <span className="text-brand-deep">他推给你的</span>
              ) : p?.joined ? (
                <span className="text-brand-deep">
                  他加入了{p?.listenMin ? ` · 一起听 ${p.listenMin} 分钟` : ''}
                </span>
              ) : (
                <span className="text-ink-faint">等他加入…</span>
              )}
            </span>
            <button
              className="tap shrink-0 text-brand-deep"
              onClick={(e) => {
                e.stopPropagation()
                useAppStore.getState().push('music-room')
              }}
            >
              进房间一起听 ›
            </button>
          </div>
        </div>
      )
    }

    case 'DOODLE': {
      const p = message.payload as unknown as DoodlePayload | undefined
      const strokes = p?.strokes ?? []
      return (
        <div {...common} className="animate-bubble-in w-[216px] p-0">
          <div className="p-2">
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="w-full rounded-md bg-[#FBFDFF] ring-1 ring-hairline"
              style={{ aspectRatio: String(p?.ratio ?? 4 / 3) }}
            >
              {strokes.map((s, i) => (
                <polyline
                  key={i}
                  points={s.points.map(([x, y]) => `${(x * 100).toFixed(2)},${(y * 100).toFixed(2)}`).join(' ')}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={s.width}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
          </div>
          <div className="border-t border-hairline px-3 py-1.5 text-[10px]">
            {p?.from === 'him' ? (
              <span className="text-brand-deep">他画的{p?.comment ? ` · ${p.comment}` : ''}</span>
            ) : p?.comment ? (
              <span className="text-brand-deep">{p.comment}</span>
            ) : (
              <span className="text-ink-faint">等他看看…</span>
            )}
          </div>
        </div>
      )
    }

    case 'SEARCH_PUSH': {
      const cover = message.payload?.cover as
        | { proxy?: string; src?: string; width?: number; height?: number; from?: string; hostPageUrl?: string }
        | undefined
      const clip = message.payload?.clip as { site?: string | null; duration?: string | null; why?: string | null } | undefined
      const media = (String(message.payload?.media ?? 'link') || 'link') as 'link' | 'image' | 'video'
      const caption = String(message.payload?.caption ?? '').trim()
      const title = String(message.payload?.title ?? '')
      const snippet = String(message.payload?.snippet ?? '').trim()
      const url = String(message.payload?.url ?? '')
      const icon = String(message.payload?.siteIcon ?? '')
      const isImage = media === 'image'
      const host = (() => {
        try {
          return new URL(url).hostname.replace(/^www\./, '')
        } catch {
          return ''
        }
      })()

      return (
        <div onContextMenu={common.onContextMenu} className="animate-bubble-in w-[248px]">
          {/* 他配的那一句（真人口吻；可能没有 —— 那就只有卡片） */}
          {caption && (
            <div className="mb-1.5 w-fit max-w-full rounded-lg bg-surface px-2.5 py-1.5 text-[13px] leading-relaxed text-ink shadow-card">
              {caption}
            </div>
          )}
          <a
            href={url || '#'}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-lg bg-surface shadow-card"
          >
            {/* 配图 / 封面：服务端验过的图才走到这里（`proxy` 走我们后端代取，防盗链也能显示） */}
            {Boolean(cover?.proxy) && (
              <SearchCover
                src={String(cover?.proxy)}
                fallbackSrc={String(cover?.src ?? '')}
                isVideo={media === 'video'}
                duration={String(clip?.duration ?? '')}
                tall={isImage}
              />
            )}
            <div className="p-2.5">
              <div className="mb-1 flex items-center gap-1 text-[10px] text-brand-deep">
                {icon ? <SearchFavicon src={icon} /> : <span>🌐</span>}
                <span className="line-clamp-1 min-w-0">{String(message.payload?.source ?? '联网搜索')}</span>
                {media === 'video' && (
                  <span className="shrink-0 rounded bg-brand/10 px-1 py-[1px] text-[9px] text-brand-deep">视频</span>
                )}
                {Boolean(message.payload?.datePublished) && (
                  <span className="ml-auto shrink-0 text-ink-faint">{String(message.payload?.datePublished).slice(0, 10)}</span>
                )}
              </div>
              {isImage ? (
                // 图片卡：图是主角，只标一句「这图从哪来的」
                <div className="line-clamp-1 text-[11px] text-ink-sub">图源：{host || '网页'} · 点开看原页面</div>
              ) : (
                <>
                  {title && <div className="line-clamp-2 text-[14px] leading-snug text-ink">{title}</div>}
                  {snippet && <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-ink-sub">{snippet}</p>}
                </>
              )}
              <div className="mt-1 line-clamp-1 text-[11px] text-ink-faint">{url}</div>
            </div>
          </a>
        </div>
      )
    }

    case 'CHOICE': {
      const c = message.payload as unknown as ChoicePayload | undefined
      const opts = c?.options ?? []
      const ans = c?.answer
      const picked = opts.find((o) => o.id === ans?.optionId)
      return (
        <div {...common} className={clsx(base, 'w-[240px] p-0')}>
          <div className="flex items-center gap-1.5 px-3 py-2 text-[14px]">
            <span className="text-[13px]">🤔</span>
            <span className="min-w-0 flex-1">抉择 · {message.text}</span>
          </div>
          <ul className="border-t border-hairline">
            {opts.map((o) => {
              const on = ans?.optionId === o.id
              return (
                <li
                  key={o.id}
                  className={clsx(
                    'flex items-center gap-2 border-b border-hairline px-3 py-2 text-[13px] last:border-0',
                    on ? 'bg-white/60 font-medium text-brand-deep' : 'text-ink-sub',
                  )}
                >
                  <span
                    className={clsx(
                      'grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[9px]',
                      on ? 'border-brand bg-brand text-white' : 'border-ink-faint/40',
                    )}
                  >
                    {on ? '✓' : ''}
                  </span>
                  <span className="min-w-0 flex-1">{o.label}</span>
                  {on && <span className="shrink-0 text-[10px]">他选的</span>}
                </li>
              )
            })}
          </ul>
          <div className="px-3 py-2 text-[12px] leading-relaxed">
            {ans ? (
              <>
                <div className="text-brand-deep">他选「{picked?.label ?? '？'}」</div>
                {ans.reason && <div className="mt-0.5 text-ink-sub">{ans.reason}</div>}
              </>
            ) : (
              <span className="text-ink-faint">等他选…</span>
            )}
          </div>
        </div>
      )
    }

    case 'QUESTION': {
      const q = message.payload as unknown as QuestionPayload | undefined
      // 他发来的卷：选项可点，交卷写回同一条消息
      if (!mine && q?.askedBy === 'him') {
        return <HisQuestionCard message={message} base={base} onContextMenu={common.onContextMenu} />
      }
      const items = q?.items ?? []
      const ansMap = new Map((q?.answers ?? []).map((a) => [a.itemId, a]))
      const filled = q?.submittedAt
      return (
        <div {...common} className={clsx(base, 'w-[252px] p-0')}>
          <div className="flex items-center gap-1.5 px-3 py-2 text-[14px]">
            <span className="text-[13px]">📋</span>
            <span className="min-w-0 flex-1">{q?.title ?? message.text}</span>
          </div>
          <div className="border-t border-hairline px-3 py-2">
            {items.map((it, i) => {
              const a = ansMap.get(it.id)
              return (
                <div key={it.id} className="mb-2 last:mb-0">
                  <div className="text-[12.5px] leading-snug text-ink">
                    {i + 1}. {it.text}
                    {it.multi && <span className="ml-1 text-[10px] text-ink-faint">多选</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {it.options.map((o) => {
                      const on = !!a?.optionIds.includes(o.id)
                      return (
                        <span
                          key={o.id}
                          className={clsx(
                            'rounded-full border px-2 py-0.5 text-[11px]',
                            on
                              ? 'border-brand bg-white/75 font-medium text-brand-deep'
                              : 'border-hairline text-ink-sub',
                          )}
                        >
                          {on ? '✓' : ''}
                          {o.label}
                        </span>
                      )
                    })}
                  </div>
                  {filled && !a && <div className="mt-0.5 text-[11px] text-ink-faint">（这题留空）</div>}
                </div>
              )
            })}
          </div>
          <div className="border-t border-hairline px-3 py-1.5 text-[11px]">
            {filled ? (
              <span className="text-brand-deep">
                他填了 {ansMap.size}/{items.length} 题{q?.note ? ` · ${q.note}` : ''}
              </span>
            ) : (
              <span className="text-ink-faint">等他交卷…</span>
            )}
          </div>
        </div>
      )
    }

    case 'SYSTEM':
      return (
        <div className="mx-auto my-1 rounded bg-hairline/60 px-2 py-1 text-center text-[11px] text-ink-faint">
          {message.text}
        </div>
      )

    default:
      return (
        <div {...common}>
          {message.text}
          {/* 状态点：发送中 / 已读 */}
          {mine && message.status === 'SENDING' && (
            <span className="ml-1 align-[1px] text-[10px] text-ink-faint">·</span>
          )}
        </div>
      )
  }
}

/**
 * 搜索卡的配图 / 封面
 *
 * 优先走我们后端的代理（防盗链的图只有这一条能显示）；代理挂了就试原图；
 * 两个都挂就**整块不渲染** —— 退回成一张纯文字卡，而不是留个破图框。
 */
function SearchCover({
  src,
  fallbackSrc,
  isVideo,
  duration,
  tall,
}: {
  src: string
  fallbackSrc?: string
  isVideo?: boolean
  duration?: string
  tall?: boolean
}) {
  const [stage, setStage] = useState<'proxy' | 'raw' | 'dead'>('proxy')
  if (stage === 'dead') return null
  const img = stage === 'proxy' ? src : (fallbackSrc ?? '')
  if (!img) return null
  return (
    <div className={clsx('relative w-full overflow-hidden bg-hairline/40', tall ? 'h-[220px]' : 'h-[120px]')}>
      <img
        src={img}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover"
        onError={() => setStage(stage === 'proxy' && fallbackSrc ? 'raw' : 'dead')}
      />
      {isVideo && (
        <>
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/45 pl-[2px] text-[13px] text-white">
              ▶
            </span>
          </span>
          {duration && (
            <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] leading-4 text-white">
              {duration}
            </span>
          )}
        </>
      )}
    </div>
  )
}

/** 站点图标（博查给的真 favicon）；加载不出来就退回一个地球 */
function SearchFavicon({ src }: { src: string }) {
  const [ok, setOk] = useState(true)
  if (!ok) return <span>🌐</span>
  return <img src={src} alt="" className="h-3.5 w-3.5 shrink-0 rounded-sm" onError={() => setOk(false)} />
}
