import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { Avatar } from '@/components/common/Avatar'
import { NavBar } from '@/components/common/NavBar'
import { pickImage } from '@/lib/file'
import { nid } from '@/lib/ids'
import {
  COMPANION_MODES,
  DURATION_CHIPS,
  clockText,
  daySec,
  elapsedSec,
  humanDur,
  lastSession,
  modeMeta,
  streakDays,
  totalSec,
} from '@/lib/companion'
import { companionReplyMe, endCompanion, startCompanion } from '@/lib/engine/companion'
import { useAppStore } from '@/store/useAppStore'
import type { CompanionMode, CompanionSession } from '@/types'

/**
 * 陪伴（功能 Hub → 🌙）
 *
 * 睡觉 / 学习 / 工作三件事，**陪伴是真的在计时**（从开始到收尾的真实秒数，挂在别的页面也照算）；
 * 这里只做两件事：把这次的配置交给引擎（`lib/engine/companion.ts#startCompanion`）、
 * 把他陪你的过程显示出来（到场时间 / 中途说的话 / 他先走了 / 到点收尾）。
 * 结束时会在聊天里留一条居中的系统小字（「和黎深一起学 45 分钟」）。
 */
export function CompanionScreen() {
  const c = useAppStore((s) => s.companion)
  const me = useAppStore((s) => s.me)
  const dream = useAppStore((s) => s.dream)
  const back = useAppStore((s) => s.back)
  const setBackground = useAppStore((s) => s.setCompanionBackground)
  const setPlannedMin = useAppStore((s) => s.setCompanionPlannedMin)
  const pushMessage = useAppStore((s) => s.pushCompanionMessage)
  const removeSession = useAppStore((s) => s.removeCompanionSession)
  const clearSessions = useAppStore((s) => s.clearCompanionSessions)

  const active = c.active
  /** 计时器：每秒刷一次界面（时长本身是按真实时间算的，这里只是让它跳动） */
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  /* ── 开始前的表单 ── */
  const remembered = (mode: CompanionMode) => c.plannedMin[mode] ?? modeMeta(mode).defaultMin
  const [mode, setMode] = useState<CompanionMode>(() => lastSession(c)?.mode ?? 'study')
  const [plannedMin, setMin] = useState<number>(() => remembered(lastSession(c)?.mode ?? 'study'))
  const [note, setNote] = useState('')
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [draft, setDraft] = useState('')
  const [toast, setToast] = useState('')
  const [ended, setEnded] = useState<CompanionSession | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  const chatRef = useRef<HTMLDivElement>(null)
  const prevActive = useRef(active)

  const meta = modeMeta(active?.mode ?? mode)
  const bgUrl = active ? active.backgroundUrl : c.backgrounds[mode]
  const elapsed = active ? elapsedSec(active.startedAt, now) : 0
  const plannedSec = (active?.plannedMin ?? 0) * 60
  const pct = plannedSec > 0 ? Math.min(100, (elapsed / plannedSec) * 100) : 0
  const leftSec = plannedSec > 0 ? Math.max(0, plannedSec - elapsed) : 0

  const said = useMemo(() => c.messages, [c.messages])

  /** 结束（我点的 / 到点自动的都算）→ 弹一个结算卡 */
  useEffect(() => {
    if (prevActive.current && !active) {
      setEnded((c.sessions ?? []).at(-1) ?? null)
    }
    prevActive.current = active
  }, [active, c.sessions])

  /** 房间对话滚到底 */
  useEffect(() => {
    const el = chatRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [said.length])

  const say = (t: string) => {
    setToast(t)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 3000)
  }

  const begin = (m: CompanionMode = mode, min: number = plannedMin) => {
    setEnded(null)
    setPlannedMin(m, min)
    startCompanion({ mode: m, plannedMin: min, note, backgroundUrl: c.backgrounds[m] })
    setNote('')
  }

  const send = () => {
    const t = draft.trim()
    if (!t) return
    pushMessage({ id: nid('cm'), senderId: me.id, text: t, createdAt: new Date().toISOString() })
    setDraft('')
    if (!companionReplyMe()) console.debug('[engine] 这一句他没回')
  }

  const heStatus = () => {
    if (!active) return ''
    if (active.heJoinedAt) {
      return active.heLeavesAt ? `在陪你 · 他打算 ${hhmm(active.heLeavesAt)} 先走` : '在陪你'
    }
    if (active.heLeavesAt) return `他先走了（${hhmm(active.heLeavesAt)}）—— 你自己这一段也在算`
    if (active.heComingAt) return `他先忙一会儿 · ${hhmm(active.heComingAt)} 过来`
    return '等他过来'
  }

  /* ───────────────────── 陪伴中 ───────────────────── */
  if (active) {
    return (
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-page">
        {/* 背景：我换的图 / 模式自带的渐变 */}
        {bgUrl ? (
          <div className="absolute inset-0">
            <img src={bgUrl} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-black/45" />
          </div>
        ) : (
          <div className={clsx('absolute inset-0 bg-gradient-to-b', meta.gradient)} />
        )}

        <NavBar
          title={
            <span className="text-white">
              {meta.icon} {meta.label}
              {active.note ? ` · ${active.note}` : ''}
            </span>
          }
          tint
          onBack={back}
          right={
            <button className="tap px-2 py-1 text-[13px] text-white/90" onClick={() => setConfirmEnd(true)}>
              结束
            </button>
          }
        />

        <div className="relative z-10 flex min-h-0 flex-1 flex-col px-3 pb-3">
          {/* 计时 */}
          <div className="mt-6 text-center text-white">
            <div className="text-[52px] font-light leading-none tabular-nums drop-shadow">
              {clockText(elapsed)}
            </div>
            <div className="mt-2 text-[12px] opacity-90">
              {plannedSec > 0 ? `目标 ${humanDur(plannedSec)} · 还剩 ${clockText(leftSec)}` : '不定时 —— 想陪多久陪多久'}
            </div>
            {plannedSec > 0 && (
              <div className="mx-auto mt-3 h-1 w-4/5 overflow-hidden rounded-full bg-white/25">
                <div className="h-full rounded-full bg-white/90 transition-all" style={{ width: `${pct}%` }} />
              </div>
            )}
          </div>

          {/* 他在不在 */}
          <div className="mt-5 flex items-center gap-2.5 rounded-2xl bg-white/15 px-3 py-2.5 text-white backdrop-blur">
            <div className="flex">
              <Avatar src={me.avatarUrl} name={me.nickname} size={30} ring />
              <Avatar src={dream.avatarUrl} name={dream.nickname} size={30} ring className="-ml-2" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium">{heStatus()}</div>
              <div className="truncate text-[11px] opacity-85">
                {active.heJoinedAt ? '他也在这一轮里，没走开' : '陪伴时长照算，他不会假装在'}
              </div>
            </div>
          </div>

          {/* 房间对话 */}
          <div ref={chatRef} className="no-scrollbar mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto rounded-2xl bg-black/20 p-3 backdrop-blur">
            {said.length === 0 ? (
              <p className="py-6 text-center text-[12px] leading-relaxed text-white/70">
                （还没人说话 —— 他进来时会先开口）
              </p>
            ) : (
              said.map((m) => {
                const mine = m.senderId === me.id
                return (
                  <div key={m.id} className={clsx('flex', mine ? 'justify-end' : 'justify-start')}>
                    <div
                      className={clsx(
                        'max-w-[78%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed shadow',
                        mine ? 'bg-brand text-white' : 'bg-white/90 text-ink',
                      )}
                    >
                      {m.text}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* 说一句 */}
          <div className="mt-3 flex items-center gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') send()
              }}
              placeholder={planType(active.mode)}
              className="min-w-0 flex-1 rounded-full bg-white/90 px-3.5 py-2.5 text-[13px] text-ink outline-none placeholder:text-ink-faint"
            />
            <button className="tap rounded-full bg-brand px-4 py-2.5 text-[13px] text-white shadow-card" onClick={send}>
              说
            </button>
          </div>
        </div>

        {confirmEnd && (
          <ConfirmEnd
            early={plannedSec > 0 && elapsed < plannedSec - 5}
            mode={active.mode}
            onCancel={() => setConfirmEnd(false)}
            onOk={() => {
              setConfirmEnd(false)
              endCompanion('manual')
            }}
          />
        )}
        {toast && (
          <Toast text={toast} onClose={() => setToast('')} />
        )}
      </div>
    )
  }

  /* ───────────────────── 开始前 / 结束后 ───────────────────── */
  return (
    <div className="relative flex h-full min-h-0 flex-col bg-page">
      <NavBar title="陪伴" onBack={back} />

      <div className="no-scrollbar flex-1 overflow-y-auto px-3 pb-5">
        {/* 结算卡 */}
        {ended && (
          <div className="mt-3 rounded-2xl bg-surface p-4 shadow-card">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-medium text-ink">
                {modeMeta(ended.mode).icon} {humanDur(ended.durationSec)}
              </span>
              <span
                className={clsx(
                  'rounded px-1.5 py-0.5 text-[10px]',
                  ended.interrupted ? 'bg-[#fff1e0] text-[#b06b1f]' : 'bg-brand-soft text-brand-deep',
                )}
              >
                {ended.interrupted ? '提前结束' : '到点完成'}
              </span>
              <button className="tap ml-auto text-[12px] text-ink-faint" onClick={() => setEnded(null)}>
                知道了
              </button>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-ink-sub">
              {ended.heLeftEarly
                ? '他中途先走了 —— 你自己这一段也算数。'
                : ended.heJoined
                  ? '他陪你走完了这一轮。'
                  : '他没来，但你自己这一轮也算数。'}
            </p>
            {c.messages.at(-1) && (
              <p className="mt-1.5 rounded-xl bg-page px-2.5 py-2 text-[12px] leading-relaxed text-ink">
                {c.messages.at(-1)?.text}
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                className="tap flex-1 rounded-lg bg-brand py-2.5 text-[14px] text-white"
                onClick={() => begin(ended.mode, ended.plannedMin)}
              >
                再来一轮
              </button>
            </div>
          </div>
        )}

        {/* 三种模式 */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          {COMPANION_MODES.map((m) => (
            <button
              key={m.mode}
              onClick={() => {
                setMode(m.mode)
                setMin(remembered(m.mode))
              }}
              className={clsx(
                'tap rounded-2xl px-2 py-3 text-center ring-1 transition',
                mode === m.mode ? 'bg-brand text-white ring-brand' : 'bg-surface text-ink-sub ring-hairline',
              )}
            >
              <div className="text-[22px]">{m.icon}</div>
              <div className="mt-1 text-[13px]">{m.label}</div>
            </button>
          ))}
        </div>
        <p className="mt-2 px-1 text-[11px] leading-relaxed text-ink-faint">{meta.hint}</p>

        {/* 目标时长 */}
        <section className="mt-4 rounded-2xl bg-surface p-3.5 shadow-card">
          <div className="flex items-center">
            <span className="text-[13px] font-medium text-ink">目标时长</span>
            <span className="ml-auto text-[12px] text-ink-sub">
              {plannedMin > 0 ? humanDur(plannedMin * 60) : '不限时'}
            </span>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {DURATION_CHIPS.map((m) => (
              <button
                key={m}
                onClick={() => setMin(m)}
                className={clsx(
                  'tap rounded-full px-3 py-1 text-[12px] ring-1',
                  plannedMin === m ? 'bg-brand text-white ring-brand' : 'bg-page text-ink-sub ring-hairline',
                )}
              >
                {m === 0 ? '不定时' : `${m} 分钟`}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[12px] text-ink-sub">自定义</span>
            <button
              className="tap grid h-7 w-7 place-items-center rounded-lg bg-page text-[16px] text-ink-sub ring-1 ring-hairline"
              onClick={() => setMin(Math.max(0, plannedMin - 5))}
            >
              −
            </button>
            <input
              type="number"
              value={plannedMin}
              min={0}
              max={1440}
              step={5}
              onChange={(e) => setMin(Math.max(0, Math.min(1440, Math.round(Number(e.target.value) || 0))))}
              className="w-[64px] rounded-lg bg-page px-2 py-1.5 text-center text-[13px] tabular-nums text-ink outline-none ring-1 ring-hairline focus:ring-brand"
            />
            <span className="text-[12px] text-ink-sub">分钟</span>
            <button
              className="tap grid h-7 w-7 place-items-center rounded-lg bg-page text-[16px] text-ink-sub ring-1 ring-hairline"
              onClick={() => setMin(Math.min(1440, plannedMin + 5))}
            >
              ＋
            </button>
          </div>
        </section>

        {/* 备注 + 背景 */}
        <section className="mt-3 rounded-2xl bg-surface p-3.5 shadow-card">
          <span className="text-[13px] font-medium text-ink">这一轮做什么</span>
          <input
            value={note}
            maxLength={30}
            onChange={(e) => setNote(e.target.value)}
            placeholder="比如：复习高数 / 写周报（选填）"
            className="mt-2 w-full rounded-lg bg-page px-3 py-2.5 text-[13px] text-ink outline-none ring-1 ring-hairline focus:ring-brand placeholder:text-ink-faint"
          />
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[12px] text-ink-sub">背景</span>
            <button
              className="tap rounded-lg bg-page px-3 py-1.5 text-[12px] text-ink-sub ring-1 ring-hairline"
              onClick={() =>
                pickImage((dataUrl) => {
                  setBackground(mode, dataUrl)
                  say('背景换好了（本机图，跟着账号同步）')
                })
              }
            >
              {c.backgrounds[mode] ? '换一张' : '上传背景图'}
            </button>
            {c.backgrounds[mode] && (
              <button
                className="tap rounded-lg bg-page px-3 py-1.5 text-[12px] text-ink-sub ring-1 ring-hairline"
                onClick={() => setBackground(mode, '')}
              >
                用回默认
              </button>
            )}
            {c.backgrounds[mode] && <span className="text-[11px] text-ink-faint">已换</span>}
          </div>
          {c.backgrounds[mode] && (
            <img src={c.backgrounds[mode]} alt="" className="mt-2 h-20 w-full rounded-lg object-cover" />
          )}
        </section>

        <button
          className="tap mt-4 w-full rounded-2xl bg-brand py-3.5 text-[15px] text-white shadow-card"
          onClick={() => begin()}
        >
          开始陪伴
        </button>
        <p className="mt-2 text-center text-[11px] leading-relaxed text-ink-faint">
          计时是真的：从开始到结束按真实时间算，挂到别的页面也在走。<br />
          到点会自动收尾，聊天里会留一条记录。
        </p>

        {/* 统计 */}
        <section className="mt-5">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="今天" value={humanDur(daySec(c))} />
            <Stat label="连续" value={`${streakDays(c)} 天`} />
            <Stat label="一共" value={humanDur(totalSec(c))} />
          </div>
        </section>

        {/* 历史 */}
        <section className="mt-5">
          <div className="mb-2 flex items-center px-1">
            <span className="text-[13px] font-medium text-ink">记录 {c.sessions.length} 次</span>
            {c.sessions.length > 0 && (
              <button
                className="tap ml-auto text-[12px] text-ink-faint"
                onClick={() => {
                  clearSessions()
                  say('记录清空了')
                }}
              >
                清空
              </button>
            )}
          </div>
          {c.sessions.length === 0 ? (
            <p className="rounded-xl bg-surface p-3 text-[12px] leading-relaxed text-ink-faint shadow-card">
              还没有记录。挑一个模式、设好时长，点「开始陪伴」——
              <br />
              他会来（或在几分钟后到），中途可能说一句话，也可能有事先走。
            </p>
          ) : (
            <ul className="overflow-hidden rounded-xl bg-surface shadow-card">
              {[...c.sessions].reverse().map((s) => {
                const m = modeMeta(s.mode)
                return (
                  <li key={s.id} className="flex items-center gap-3 border-b border-hairline px-3 py-2.5 last:border-b-0">
                    <span className="text-[18px]">{m.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-[13px] text-ink">
                        {humanDur(s.durationSec)}
                        {s.note && <span className="truncate text-ink-sub">· {s.note}</span>}
                        {s.interrupted && <span className="rounded bg-[#fff1e0] px-1 text-[10px] text-[#b06b1f]">提前</span>}
                        {s.heLeftEarly && <span className="rounded bg-[#eef2f7] px-1 text-[10px] text-ink-sub">他先走了</span>}
                        {!s.heJoined && <span className="rounded bg-[#eef2f7] px-1 text-[10px] text-ink-sub">他没来</span>}
                      </div>
                      <div className="text-[11px] text-ink-faint">
                        {fmtWhen(s.startedAt)} · 目标 {s.plannedMin > 0 ? humanDur(s.plannedMin * 60) : '不限时'}
                      </div>
                    </div>
                    <button className="tap px-1 text-[12px] text-ink-faint" onClick={() => removeSession(s.id)}>
                      删
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      {toast && <Toast text={toast} onClose={() => setToast('')} />}
    </div>
  )
}

/* ───────────────────────── 小零件 ───────────────────────── */

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface px-2 py-3 text-center shadow-card">
      <div className="text-[11px] text-ink-faint">{label}</div>
      <div className="mt-0.5 text-[14px] font-medium text-ink">{value}</div>
    </div>
  )
}

function Toast({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <button
      className="absolute inset-x-0 bottom-16 z-40 mx-auto w-fit rounded-full bg-black/72 px-3.5 py-2 text-[12px] text-white shadow-phone"
      onClick={onClose}
    >
      {text}
    </button>
  )
}

function ConfirmEnd({
  early,
  mode,
  onCancel,
  onOk,
}: {
  early: boolean
  mode: CompanionMode
  onCancel: () => void
  onOk: () => void
}) {
  const m = modeMeta(mode)
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 px-8">
      <div className="w-full rounded-2xl bg-page p-4 shadow-phone">
        <div className="text-center text-[14px] font-medium text-ink">结束这次陪伴？</div>
        <p className="mt-2 text-center text-[12px] leading-relaxed text-ink-sub">
          {early
            ? `还没到点 —— 提前结束的话，这一轮按你已经陪到的时间记。`
            : `已经到点了，收尾后会在聊天里留一条「${m.verb}」的记录。`}
        </p>
        <div className="mt-3 flex gap-2">
          <button className="tap flex-1 rounded-lg bg-surface py-2.5 text-[14px] text-ink-sub ring-1 ring-hairline" onClick={onCancel}>
            继续陪
          </button>
          <button className="tap flex-1 rounded-lg bg-brand py-2.5 text-[14px] text-white" onClick={onOk}>
            结束
          </button>
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────── 格式化 ───────────────────────── */

/** 他大概会说什么（输入框的提示语，按模式换） */
function planType(mode: CompanionMode) {
  if (mode === 'sleep') return '说声晚安…'
  if (mode === 'work') return '跟他说一句…'
  return '问他一道题 / 说一句…'
}

const hhmm = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

const fmtWhen = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
