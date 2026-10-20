import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Avatar } from '@/components/common/Avatar'
import { THEME_PRESETS } from '@/lib/theme'
import { bgCss } from '@/lib/appearance'
import { pickImage } from '@/lib/file'
import { ENTRIES, resolveEntryIcon } from '@/lib/entries'
import { daysSince, daysUntil, formatDate } from '@/lib/time'
import { clockOf, hisNow } from '@/lib/world'
import { dayKeyOf, entryOf, todayKey } from '@/lib/diary'
import { photosOf, useAppearanceStore } from '@/store/useAppearanceStore'
import { useAppStore } from '@/store/useAppStore'
import { useChatStore } from '@/store/useChatStore'

/**
 * 主界面
 *
 * 从上到下：一句话 → 两个人（他左 / 我右，中间一条真的在动的波）→ 照片墙 + 纪念日卡
 * → 今日小卡 / 留言 → 底部五个入口。
 *
 * 照片墙的三张可以拖着换位置、点一下置顶（位置存进美化配置，换设备也跟着走）；
 * 换照片在「设置 → 美化 → 主界面照片墙」，这里点空相框会直接让你选图。
 */
export function HomeScreen() {
  const { me, dream, anniversaries, themeKey, setTheme, push, diary, world } = useAppStore()
  const { appearance, setHomeNote } = useAppearanceStore()
  const { messages } = useChatStore()
  const [themeOpen, setThemeOpen] = useState(false)
  const [noteEditing, setNoteEditing] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [now, setNow] = useState(() => new Date())

  /** 保存那句话（空着就保持原样，不清空） */
  const commitNote = () => {
    setHomeNote(noteDraft.trim() || appearance.homeNote)
    setNoteEditing(false)
  }

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])

  /** 主界面只展示 showOnHome 的那些，第一个是「主卡」 */
  const shown = anniversaries.filter((a) => a.showOnHome)
  const primary = shown[0]
  const days = daysSince(primary?.date ?? new Date().toISOString())
  const until = primary ? daysUntil(primary.date, primary.recurring) : null

  /** 「今日小卡」：全部用今天的真实记录现算 */
  const today = todayKey()
  const todayMessages = messages.filter((m) => dayKeyOf(m.createdAt) === today)
  const todayHis = todayMessages.filter((m) => m.senderId !== me.id && m.kind !== 'SYSTEM' && m.kind !== 'CALL_EVENT')
  const todayHisCards = todayHis.filter((m) => m.kind === 'CARD').length
  const todayCardIds = new Set<string>()
  todayHis.forEach((m) => m.plan?.cardIds?.forEach((id) => todayCardIds.add(id)))
  const smallCardText =
    todayMessages.length === 0
      ? '今天还没说话 —— 去聊天页跟他说一句'
      : `他今天发来 ${todayHis.length} 条（其中字卡 ${todayHisCards} 条），抽到过 ${todayCardIds.size} 张字卡`

  const myDiary = entryOf(diary, me.id, today)
  const hisDiary = entryOf(diary, dream.id, today)
  const diaryText = hisDiary
    ? `${hisDiary.mood} ${hisDiary.text}`
    : myDiary
      ? '你今天写过了 —— 他还没写'
      : '今天还没写 —— 点进去写一条'

  const bg = appearance.homeBackground
  const bgImage = bgCss(bg)

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* ── 主界面背景（美化可换：预设 / 纯色 / 图片） ── */}
      <div
        className="absolute inset-0 -z-20"
        style={{
          background: bgImage || undefined,
          backgroundColor: bgImage ? undefined : 'rgb(var(--ln-page))',
          backgroundPosition: 'center',
          backgroundSize: 'cover',
          filter: bg.blur ? `blur(${bg.blur}px)` : undefined,
          transform: bg.blur ? 'scale(1.06)' : undefined,
        }}
      />
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            bg.dim > 0 ? `rgba(0,0,0,${bg.dim})` : 'radial-gradient(circle at 20% 0%, rgba(255,255,255,.45), transparent 60%)',
        }}
      />

      <div className="no-scrollbar flex-1 overflow-y-auto px-4 pb-4 safe-top">
        {/* ── 应用图标 + 名称（美化可换） ── */}
        <div className="mt-2 flex items-center gap-2">
          <button className="tap flex min-w-0 items-center gap-2" onClick={() => push('appearance')} title="去「设置 → 美化」更换图标">
            {appearance.appIcon.mode === 'image' ? (
              <img src={appearance.appIcon.value} alt="" className="h-7 w-7 rounded-lg object-cover shadow-card" />
            ) : (
              <span className="text-[20px] leading-none">{appearance.appIcon.value}</span>
            )}
            <span className="truncate text-[13px] font-medium text-ink">
              {me.nickname} &amp; {dream.nickname}
            </span>
          </button>
          <button
            className="tap ml-auto grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/80 text-[13px] shadow-card"
            title="更改配色"
            onClick={() => setThemeOpen((v) => !v)}
          >
            🎨
          </button>
          <button className="tap shrink-0 text-[10px] text-ink-faint" onClick={() => push('appearance')}>
            美化 ›
          </button>
        </div>

        {/* ── 一句话 + 两个人 + 中间那条波 ── */}
        <section className="mt-2 rounded-[24px] bg-white/70 p-4 shadow-card backdrop-blur">
          {noteEditing ? (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={noteDraft}
                maxLength={40}
                className="w-full rounded-lg border border-brand-soft bg-white px-2 py-1.5 text-center text-[13px] text-ink outline-none"
                placeholder="写一句话放在最上面"
                onChange={(e) => setNoteDraft(e.target.value)}
                onBlur={() => commitNote()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitNote()
                  if (e.key === 'Escape') setNoteEditing(false)
                }}
              />
              <button
                className="tap grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand text-[13px] text-white"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => commitNote()}
                title="保存这句话"
              >
                ✓
              </button>
            </div>
          ) : (
            <button
              className="tap mx-auto block max-w-full truncate px-2 text-[13px] leading-relaxed text-ink-sub"
              title="点一下改这句话"
              onClick={() => {
                setNoteDraft(appearance.homeNote)
                setNoteEditing(true)
              }}
            >
              {appearance.homeNote || '点一下写一句话'}
            </button>
          )}

          <div className="mt-3 flex items-center gap-1">
            <Person name={dream.nickname} time={clockOf(hisNow(now, world.offsetMin))} avatar={dream.avatarUrl} />
            <CoupleWave />
            <Person name={me.nickname} time={clockOf(now)} avatar={me.avatarUrl} />
          </div>
        </section>

        {/* ── 照片墙 + 纪念日卡 ── */}
        <div className="mt-3 flex items-stretch gap-3">
          <div className="min-w-0 flex-1">
            <PhotoStack />
            <p className="mt-1 text-center text-[10px] text-ink-faint">拖一拖换位置 · 点一下置顶</p>
          </div>

          <button
            className="tap relative w-[116px] shrink-0 overflow-hidden rounded-[20px] text-white shadow-card"
            onClick={() => push('anniversary')}
            title="纪念日：点进去添加 / 改日期 / 换背景"
          >
            <span
              className="absolute inset-0"
              style={{
                background: primary?.bg
                  ? `url("${primary.bg}") center/cover no-repeat`
                  : 'linear-gradient(165deg,#9cc4ec 0%,#6f9ed4 55%,#4f7fb6 100%)',
              }}
            />
            <span className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-black/25" />
            <span className="relative flex h-full min-h-[196px] flex-col items-center justify-between px-2 py-3 text-center">
              <span className="text-[15px] drop-shadow">💙</span>
              {primary ? (
                <span className="leading-none">
                  <span className="block text-[34px] font-semibold tabular-nums drop-shadow-sm">{days}</span>
                  <span className="mt-1 block text-[10px] opacity-90">已经 {days} 天</span>
                  <span className="mt-2 block text-[12px] font-medium">{primary.title}</span>
                  <span className="mt-0.5 block text-[10px] opacity-85">{primary.caption || '相遇'}</span>
                </span>
              ) : (
                <span className="text-[12px]">＋ 添加纪念日</span>
              )}
              <span className="text-[10px] leading-tight opacity-80">
                {primary ? (
                  <>
                    <span className="block">{formatDate(primary.date)}</span>
                    {typeof until === 'number' && until > 0 && <span className="block">还有 {until} 天</span>}
                  </>
                ) : (
                  '点这里开始'
                )}
              </span>
            </span>
          </button>
        </div>

        {/* 配色选择 */}
        {themeOpen && (
          <div className="mt-3 flex flex-wrap gap-2 rounded-2xl bg-white/70 p-3 shadow-card backdrop-blur">
            {THEME_PRESETS.map((t) => (
              <button
                key={t.key}
                className={`tap flex items-center gap-2 rounded-full bg-white px-2.5 py-1.5 text-[12px] shadow-card ${
                  themeKey === t.key ? 'ring-2 ring-brand' : ''
                }`}
                onClick={() => setTheme(t.key)}
              >
                <span className="h-4 w-4 rounded-full" style={{ background: `rgb(${t.vars['--ln-brand']})` }} />
                {t.name}
              </button>
            ))}
          </div>
        )}

        {/* ── 今日小卡 / 留言 ── */}
        <div className="mt-3 space-y-2.5">
          <SectionCard title="今日小卡" body={smallCardText} onClick={() => push('chat')} />
          <SectionCard title={`${dream.nickname} 的留言`} body={diaryText} onClick={() => push('diary')} />
        </div>

        <p className="mt-5 text-center text-[11px] text-ink-faint">黎念 · 字卡传讯</p>
      </div>

      {/* ── 底部五个入口（固定在空白处，不再跟着内容滚走） ── */}
      <nav className="safe-bottom shrink-0 border-t border-white/70 bg-white/80 backdrop-blur">
        <div className="grid grid-cols-5 gap-1 px-2 pb-1.5 pt-2">
          {ENTRIES.map((e) => {
            const icon = resolveEntryIcon(appearance, e)
            return (
              <button key={e.key} className="tap relative flex flex-col items-center gap-1" onClick={() => push(e.key)}>
                <span className="relative grid h-11 w-11 place-items-center overflow-hidden rounded-[15px] bg-white text-[22px] shadow-card">
                  {icon.mode === 'image' ? (
                    <img src={icon.value} alt="" className="h-full w-full object-cover" />
                  ) : (
                    icon.value
                  )}
                  {!!e.badge && (
                    <span className="absolute right-0 top-0 grid h-4 min-w-4 place-items-center rounded-full border-2 border-white bg-[#FA5151] px-1 text-[10px] font-medium text-white">
                      {e.badge}
                    </span>
                  )}
                </span>
                <span className="text-[10px] text-ink">{e.label}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

/* ───────────────────────── 两个人 ───────────────────────── */

function Person({ name, time, avatar }: { name: string; time: string; avatar: string }) {
  return (
    <div className="flex w-[74px] shrink-0 flex-col items-center">
      <Avatar src={avatar} name={name} size={56} ring />
      <span className="mt-1.5 max-w-full truncate text-[12px] font-medium text-ink">{name}</span>
      <span className="text-[10px] tabular-nums text-ink-faint">{time}</span>
    </div>
  )
}

/** 中间那条真的在动的波（两层反向，中间一颗心） */
function CoupleWave() {
  return (
    <div className="relative flex h-10 min-w-0 flex-1 items-center justify-center overflow-hidden" aria-hidden>
      <svg viewBox="0 0 160 40" className="h-10 w-full" fill="none" preserveAspectRatio="none">
        <defs>
          <linearGradient id="ln-wave-g" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgb(var(--ln-brand))" stopOpacity="0" />
            <stop offset="25%" stopColor="rgb(var(--ln-brand))" stopOpacity=".9" />
            <stop offset="75%" stopColor="rgb(var(--ln-brand))" stopOpacity=".9" />
            <stop offset="100%" stopColor="rgb(var(--ln-brand))" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g className="ln-wave-b">
          <path
            d={WAVE_PATH}
            stroke="url(#ln-wave-g)"
            strokeWidth="1.4"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </g>
        <g className="ln-wave-a">
          <path
            d={WAVE_PATH}
            stroke="url(#ln-wave-g)"
            strokeWidth="1.8"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      </svg>
      <span className="ln-heart absolute text-[14px]">💗</span>
    </div>
  )
}

/** 周期 40：x 从 -80 一直画到 200 */
const WAVE_PATH =
  'M-80 20 C-70 8 -60 8 -50 20 S-30 32 -20 20 S0 8 10 20 S30 32 40 20 S60 8 70 20 S90 32 100 20 S120 8 130 20 S150 32 160 20 S180 8 200 20'

/* ───────────────────────── 照片墙 ───────────────────────── */

function PhotoStack() {
  const photos = photosOf(useAppearanceStore((s) => s.appearance))
  const setPhoto = useAppearanceStore((s) => s.setPhoto)
  const movePhoto = useAppearanceStore((s) => s.movePhoto)
  const bringPhotoFront = useAppearanceStore((s) => s.bringPhotoFront)
  const boxRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ i: number; sx: number; sy: number; px: number; py: number; moved: boolean } | null>(null)
  const [live, setLive] = useState<{ i: number; x: number; y: number } | null>(null)

  const down = (i: number, e: ReactPointerEvent<HTMLDivElement>) => {
    const box = boxRef.current
    if (!box) return
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* 合成事件 / 老浏览器没有指针捕获：不捕获也能拖 */
    }
    drag.current = { i, sx: e.clientX, sy: e.clientY, px: photos[i].x, py: photos[i].y, moved: false }
    setLive({ i, x: photos[i].x, y: photos[i].y })
  }

  const move = (i: number, e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    const box = boxRef.current
    if (!d || d.i !== i || !box) return
    const r = box.getBoundingClientRect()
    const dx = ((e.clientX - d.sx) / r.width) * 100
    const dy = ((e.clientY - d.sy) / r.height) * 100
    if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true
    setLive({ i, x: clamp(d.px + dx, -34, 34), y: clamp(d.py + dy, -26, 26) })
  }

  const up = (i: number) => {
    const d = drag.current
    const l = live
    drag.current = null
    setLive(null)
    if (!d) return
    if (d.moved && l) {
      movePhoto(i, l.x, l.y)
      return
    }
    // 没拖动 = 点了一下：空相框选图，有图的置顶
    if (!photos[i].url) pickImage((url) => setPhoto(i, url))
    else bringPhotoFront(i)
  }

  return (
    <div ref={boxRef} className="relative h-[196px] w-full rounded-[20px] bg-white/40 shadow-card ring-1 ring-white/60">
      {photos.map((p, i) => {
        const x = live?.i === i ? live.x : p.x
        const y = live?.i === i ? live.y : p.y
        return (
          <div
            key={i}
            role="button"
            tabIndex={0}
            className="tap absolute h-[136px] w-[100px] cursor-grab touch-none select-none rounded-[6px] bg-white p-1.5 pb-4 shadow-[0_6px_18px_rgba(30,60,100,.18)] active:cursor-grabbing"
            style={{
              left: `calc(50% + ${x}%)`,
              top: `calc(50% + ${y}%)`,
              zIndex: live?.i === i ? 99 : p.z,
              transform: `translate(-50%, -50%) rotate(${p.rot}deg)`,
            }}
            onPointerDown={(e) => down(i, e)}
            onPointerMove={(e) => move(i, e)}
            onPointerUp={() => up(i)}
            onPointerCancel={() => {
              drag.current = null
              setLive(null)
            }}
          >
            {p.url ? (
              <img src={p.url} alt="" className="h-full w-full rounded-[3px] object-cover" draggable={false} />
            ) : (
              <div className="grid h-full w-full place-items-center rounded-[3px] border border-dashed border-brand-soft bg-page/60 text-center text-ink-faint">
                <div>
                  <div className="text-[18px]">＋</div>
                  <div className="mt-0.5 text-[9px]">放张照片</div>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

/* ───────────────────────── 小卡 ───────────────────────── */

function SectionCard({ title, body, onClick }: { title: string; body: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="tap block w-full rounded-2xl bg-white/70 p-3.5 text-left shadow-card backdrop-blur"
    >
      <div className="text-[13px] font-medium text-ink">{title}</div>
      <div className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-ink-sub">{body}</div>
    </button>
  )
}
