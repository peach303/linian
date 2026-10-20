import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { NavBar } from '@/components/common/NavBar'
import { offsetFromParts, offsetParts, sameDayInHisTime, hisDayShift, WORLD_BUCKETS } from '@/lib/world'
import { worldNow, takeSample, worldSampleCap, sampleSaid } from '@/lib/engine/world'
import { describeTimeOffset, fromNow } from '@/lib/time'
import { useAppStore } from '@/store/useAppStore'
import type { WorldBucket } from '@/types'

/**
 * 世界感知（功能 → 🌍）
 *
 * 这一页最容易滑向「编」，所以把三类东西**分开放、分开标**：
 *
 *   ① **真的**：他那边的钟点 —— 用「我这边现在 + 时差」真换算；时差**是你自己设的**（不是测出来的）；
 *      每条采样的时刻也是真的。
 *   ② **抽的**：他那边的状态（在忙 / 刚起床…）和「正在做的事」—— 种子 = 日期 + 采样槽，
 *      **同一段时间里反复看是同一个答案**，跨到下一槽才会变；而且按他那边的时段分池（他那边半夜不会「在开会」）。
 *   ③ **没有的**：天气 —— 这台设备上没接天气源，所以**一个字都不显示**（留个位置说明白，以后接了才用）。
 */
export function WorldScreen() {
  const world = useAppStore((s) => s.world)
  const setWorldOffset = useAppStore((s) => s.setWorldOffset)
  const removeWorldSample = useAppStore((s) => s.removeWorldSample)
  const clearWorldSamples = useAppStore((s) => s.clearWorldSamples)

  // 他那边的钟点要跟着走：一秒一趟只为了这个显示
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const now = useMemo(() => new Date(nowMs), [nowMs])

  const cur = worldNow(now)
  const parts = offsetParts(world.offsetMin)
  const [ahead, setAhead] = useState(parts.ahead)
  const [hour, setHour] = useState(parts.hour)
  const [minute, setMinute] = useState(parts.minute)
  // 远端补回来 / 换过之后跟着更新草稿
  useEffect(() => {
    setAhead(parts.ahead)
    setHour(parts.hour)
    setMinute(parts.minute)
  }, [parts.ahead, parts.hour, parts.minute])

  const dirty = offsetFromParts(ahead, hour, minute) !== world.offsetMin
  const samples = [...world.samples].reverse()
  const cap = worldSampleCap()
  const shift = hisDayShift(now, world.offsetMin)
  const sameDay = sameDayInHisTime(now, world.offsetMin)

  return (
    <div className="flex h-full min-h-0 flex-col bg-page">
      <NavBar
        title="世界感知"
        right={<span className="pr-1 text-[12px] tabular-nums text-ink-faint">他那边 {cur.hisClock}</span>}
      />

      <div className="no-scrollbar flex-1 overflow-y-auto px-3 pb-6">
        {/* 他那边现在 */}
        <div className="mt-3 overflow-hidden rounded-2xl bg-gradient-to-br from-[#5aa0e8] to-[#8fc4f8] p-4 text-white shadow-card">
          <p className="text-[11px] opacity-90">他那边现在</p>
          <p className="mt-1 text-[40px] font-light leading-none tabular-nums">{cur.hisClock}</p>
          <p className="mt-2 text-[12px] opacity-95">
            {cur.bucket}
            {!sameDay && <span className="ml-1.5">（他那边是{shift > 0 ? '明' : '昨'}天）</span>}
          </p>
          <p className="mt-1 text-[11px] opacity-90">{describeTimeOffset(world.offsetMin)}</p>

          <div className="mt-3 border-t border-white/25 pt-2.5">
            {cur.status && (
              <p className="flex items-center gap-1.5 text-[13px]">
                <span className="rounded-full bg-white/25 px-1.5 py-0.5 text-[9px]">抽的</span>
                <span>他{cur.status}</span>
              </p>
            )}
            {cur.doing && <p className="mt-1 text-[12px] opacity-95">正在：{cur.doing}</p>}
            {!cur.status && !cur.doing && <p className="text-[12px] opacity-90">这一刻没抽到状态 —— 他在自己那边待着</p>}
            <p className="mt-1.5 text-[10px] opacity-80">
              这段时间的答案是同一个，再过 {Math.max(1, Math.round(cur.slotLeftMin))} 分钟才会换一个
            </p>
          </div>
        </div>

        {/* 时差设置 */}
        <div className="mt-3 rounded-2xl bg-surface p-3.5 shadow-card">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-medium text-ink">时差</h3>
            <span className="text-[10px] text-ink-faint">你设的，不是测出来的</span>
            {dirty && <span className="ml-auto text-[10px] text-brand-deep">还没保存</span>}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-sub">
            这台设备不知道他在哪 —— 时差是你自己填的设定，界面上的「他那边几点」是按它**真换算**出来的。
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-lg ring-1 ring-hairline">
              {([true, false] as const).map((v) => (
                <button
                  key={String(v)}
                  className={clsx('tap px-2.5 py-1.5 text-[11px]', ahead === v ? 'bg-brand text-white' : 'bg-page text-ink-sub')}
                  onClick={() => setAhead(v)}
                >
                  {v ? '比我快' : '比我慢'}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1 text-[11px] text-ink-sub">
              <input
                type="number"
                min={0}
                max={14}
                value={hour}
                onChange={(e) => setHour(Math.max(0, Math.min(14, Number.parseInt(e.target.value || '0', 10) || 0)))}
                className="w-14 rounded-lg bg-page px-2 py-1.5 text-center text-[12px] tabular-nums text-ink outline-none ring-1 ring-hairline"
              />
              小时
            </label>
            <div className="flex overflow-hidden rounded-lg ring-1 ring-hairline">
              {[0, 15, 30, 45].map((m) => (
                <button
                  key={m}
                  className={clsx('tap px-2 py-1.5 text-[11px] tabular-nums', minute === m ? 'bg-brand text-white' : 'bg-page text-ink-sub')}
                  onClick={() => setMinute(m)}
                >
                  {m}
                </button>
              ))}
            </div>
            <button
              className="tap ml-auto rounded-xl bg-brand px-3.5 py-2 text-[12px] font-medium text-white disabled:opacity-40"
              disabled={!dirty}
              onClick={() => setWorldOffset(offsetFromParts(ahead, hour, minute))}
            >
              保存
            </button>
          </div>
          <p className="mt-2 text-[10.5px] text-ink-faint">现在：{describeTimeOffset(world.offsetMin)}</p>
        </div>

        {/* 采样 */}
        <div className="mt-3 rounded-2xl bg-surface p-3.5 shadow-card">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-medium text-ink">他那边怎么样</h3>
            <span className="text-[10px] text-ink-faint">采样</span>
            <button
              className="tap ml-auto rounded-xl bg-page px-3 py-1.5 text-[11.5px] text-brand-deep ring-1 ring-hairline"
              onClick={() => takeSample('manual', new Date())}
            >
              现在采一条
            </button>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-sub">
            到点会自己采一条（规则组「世界感知」里的间隔，默认 30~240 分钟）；种子 = <b className="text-ink">日期 + 采样槽</b>，
            所以**同一个槽里反复看是同一个答案**，刷新不会重掷。最多留最近 {cap} 条。
          </p>

          {samples.length === 0 ? (
            <p className="mt-3 rounded-xl bg-page p-3 text-center text-[11.5px] text-ink-faint ring-1 ring-hairline">
              还没有采样 —— 点上面「现在采一条」，或等它自己到点
            </p>
          ) : (
            <>
              <ul className="mt-3 space-y-2">
                {samples.slice(0, 20).map((s) => (
                  <li key={s.id} className="rounded-xl bg-page p-2.5 ring-1 ring-hairline">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[12px] tabular-nums text-ink">他那边 {s.hisClock}</span>
                      <span className="text-[10.5px] text-ink-faint">{s.bucket}</span>
                      <span className="ml-auto text-[10px] text-ink-faint">{fromNow(s.sampledAt, now)}采的</span>
                    </div>
                    {(s.status || s.doing) && (
                      <p className="mt-1 text-[11.5px] leading-relaxed text-ink-sub">
                        {s.status ?? ''}
                        {s.status && s.doing ? ' · ' : ''}
                        {s.doing ? `正在${s.doing}` : ''}
                      </p>
                    )}
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-[10px] text-ink-faint">天气：没接源，不显示</span>
                      {sampleSaid(s.id) && <span className="text-[10px] text-brand-deep">已在聊天里说过</span>}
                      <button
                        className="tap ml-auto rounded-md px-1.5 py-1 text-[10px] text-ink-faint"
                        onClick={() => removeWorldSample(s.id)}
                      >
                        删
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              {world.samples.length > 20 && (
                <p className="mt-2 text-center text-[10.5px] text-ink-faint">只列了最近 20 条（一共 {world.samples.length} 条）</p>
              )}
              <button
                className="tap mt-2 w-full rounded-xl bg-page py-2 text-[11px] text-ink-faint ring-1 ring-hairline"
                onClick={() => clearWorldSamples()}
              >
                清空采样记录
              </button>
            </>
          )}
        </div>

        {/* 真的 / 抽的 / 没有的 */}
        <div className="mt-3 rounded-2xl bg-surface p-3.5 shadow-card">
          <h3 className="text-[13px] font-medium text-ink">这一页里哪些是真的</h3>
          <ul className="mt-2 space-y-1.5 text-[11.5px] leading-relaxed">
            <li className="text-ink-sub">
              <b className="text-ink">真的</b>：他那边几点（按你设的时差真换算）、每条采样的时刻。
            </li>
            <li className="text-ink-sub">
              <b className="text-ink">抽的</b>：他的状态和「正在做的事」—— 按时段分池、种子 = 日期 + 采样槽。
            </li>
            <li className="text-ink-sub">
              <b className="text-ink">没有的</b>：天气。这台设备上没有天气源，所以一个字都不显示 ——
              以后接了（`INTEGRATIONS`）才会出现在采样里。
            </li>
          </ul>
          <p className="mt-2 text-[10.5px] text-ink-faint">
            采样会跟 `state` 一起同步（对应多端设计里的 `world_sense_logs`）。
          </p>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {WORLD_BUCKETS.map((b: WorldBucket) => (
            <span
              key={b}
              className={clsx(
                'rounded-full px-2 py-0.5 text-[10px]',
                b === cur.bucket ? 'bg-brand text-white' : 'bg-surface text-ink-faint ring-1 ring-hairline',
              )}
            >
              {b}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
