import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { NavBar } from '@/components/common/NavBar'
import {
  CHECK_STATUS_LABEL,
  CHECK_TYPE_LABEL,
  cooldownLeftMs,
  humanLeft,
  pendingForHim,
  pendingForMe,
} from '@/lib/check'
import { answerHisCheck, canRequest, requestCheck, hisAskText } from '@/lib/engine/check'
import { fromNow } from '@/lib/time'
import { useAppStore } from '@/store/useAppStore'
import { useRulesStore } from '@/store/useRulesStore'
import type { CheckRequest, CheckType } from '@/types'

/**
 * 查岗（功能 → 🔍）
 *
 * 红线在这儿最容易破：**我们拿不到他的定位，也看不到他的手机**。所以报告分两栏摆，
 * 分栏的标题就是「真的」和「抽的」：
 *
 *   · **真的**：全部从这台手机的记录里现算 —— 他那边的钟点、最后一条消息是多久前、今天发了几条、
 *     最近一次一起做了什么、今天写没写日记、从你这儿拾走过几句话、字卡库多少张。数字都能对得上。
 *   · **抽的**：定位 / 手机屏幕上看到的东西 —— 种子 = 请求 id，界面上标明。`fakeInfoP` 命中还会标「修饰过」。
 *
 * 冷却也是真的：从你上一次发起的时刻算起（`checkPhone.cooldownMin`），剩多久就显示多久。
 */
export function CheckScreen() {
  const checkPhone = useAppStore((s) => s.checkPhone)
  const me = useAppStore((s) => s.me)
  const dream = useAppStore((s) => s.dream)
  const removeCheck = useAppStore((s) => s.removeCheck)
  const clearChecks = useAppStore((s) => s.clearChecks)
  const rules = useRulesStore((s) => s.saved.checkPhone)

  // 冷却 / 他回应的倒计时都要走秒
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const now = useMemo(() => new Date(nowMs), [nowMs])

  const [type, setType] = useState<CheckType>('PHONE')
  const [note, setNote] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  const gate = canRequest(now)
  const left = cooldownLeftMs(checkPhone.checks, rules.cooldownMin, me.id, now)
  const hisAsk = pendingForMe(checkPhone.checks, me.id)
  const waiting = pendingForHim(checkPhone.checks, me.id)
  const list = [...checkPhone.checks].reverse()

  return (
    <div className="flex h-full min-h-0 flex-col bg-page">
      <NavBar
        title="查岗"
        right={
          <span className="pr-1 text-[12px] text-ink-faint">
            {rules.enabled ? (left > 0 ? `${humanLeft(left)}后可查` : '可以查') : '已关闭'}
          </span>
        }
      />

      <div className="no-scrollbar flex-1 overflow-y-auto px-3 pb-6">
        {/* 他来找你 */}
        {hisAsk && (
          <div className="mt-3 rounded-2xl bg-gradient-to-br from-[#5aa0e8] to-[#8fc4f8] p-3.5 text-white shadow-card">
            <p className="text-[13px] font-medium">{dream.nickname} 想看你手机</p>
            <p className="mt-1 text-[11px] leading-relaxed opacity-95">
              {fromNow(hisAsk.requestedAt, now)}问的，还挂着等你回应。挂着的时候他不会重复问。
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <button
                className="tap rounded-xl bg-white px-3.5 py-2 text-[12px] font-medium text-brand-deep"
                onClick={() => answerHisCheck(hisAsk.id, true, new Date())}
              >
                给他看
              </button>
              <button
                className="tap rounded-xl bg-white/25 px-3.5 py-2 text-[12px] text-white"
                onClick={() => answerHisCheck(hisAsk.id, false, new Date())}
              >
                不给看
              </button>
            </div>
          </div>
        )}

        {/* 发起 */}
        <div className="mt-3 rounded-2xl bg-surface p-3.5 shadow-card">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-medium text-ink">查一下</h3>
            <span className="ml-auto text-[10.5px] text-ink-faint">
              {rules.enabled ? `冷却 ${rules.cooldownMin} 分钟` : '功能关着'}
            </span>
          </div>

          <div className="mt-2 flex gap-2">
            {(['PHONE', 'LOCATION'] as CheckType[]).map((t) => (
              <button
                key={t}
                className={clsx(
                  'tap flex-1 rounded-xl px-3 py-2 text-[12px]',
                  type === t ? 'bg-brand text-white' : 'bg-page text-ink-sub ring-1 ring-hairline',
                )}
                onClick={() => setType(t)}
              >
                {t === 'PHONE' ? '📱 ' : '📍 '}
                {CHECK_TYPE_LABEL[t]}
              </button>
            ))}
          </div>

          <input
            className="mt-2 w-full rounded-xl bg-page px-3 py-2 text-[12px] text-ink outline-none ring-1 ring-hairline placeholder:text-ink-faint"
            placeholder="带一句话（可留空）"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          {waiting ? (
            <p className="mt-2 rounded-xl bg-page p-2.5 text-[11px] text-ink-sub ring-1 ring-hairline">
              你 {fromNow(waiting.requestedAt, now)}发的那条还在等他回 —— 他大约 {fromNow(waiting.respondAt, now) === '刚刚' ? '马上' : '几秒内'}就有反应。
            </p>
          ) : (
            <button
              className="tap mt-2 w-full rounded-xl bg-brand py-2.5 text-[12.5px] font-medium text-white disabled:opacity-40"
              disabled={!gate.ok}
              onClick={() => {
                const r = requestCheck(type, note, new Date())
                if (!r.ok) setToast(r.reason ?? '现在不能查')
                else {
                  setToast(null)
                  setNote('')
                }
              }}
            >
              {gate.ok ? `查一下（${CHECK_TYPE_LABEL[type]}）` : gate.reason}
            </button>
          )}

          {toast && <p className="mt-2 text-[11px] text-brand-deep">{toast}</p>}
          <p className="mt-2 text-[10.5px] leading-relaxed text-ink-faint">
            他{hisAskText()}（抽签，种子 = 日期；每天最多 {Math.max(1, Math.min(5, Math.round(rules.dailyLimit ?? 1)))} 条，不超过 5 条）。冷却是真的：从你上一次发起算起，不因为刷新而消失。
          </p>
        </div>

        {/* 记录 */}
        <div className="mt-3 rounded-2xl bg-surface p-3.5 shadow-card">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-medium text-ink">查岗记录</h3>
            <span className="ml-auto text-[10.5px] text-ink-faint">{checkPhone.checks.length} 条</span>
          </div>

          {list.length === 0 ? (
            <p className="mt-2 rounded-xl bg-page p-3 text-center text-[11.5px] text-ink-faint ring-1 ring-hairline">
              还没查过 —— 上面查一次看看
            </p>
          ) : (
            <ul className="mt-2 space-y-2.5">
              {list.map((c) => (
                <CheckCard key={c.id} c={c} meId={me.id} nickname={dream.nickname} now={now} onRemove={() => removeCheck(c.id)} />
              ))}
            </ul>
          )}
          {list.length > 0 && (
            <button
              className="tap mt-2 w-full rounded-xl bg-page py-2 text-[11px] text-ink-faint ring-1 ring-hairline"
              onClick={() => clearChecks()}
            >
              清空记录（冷也会跟着松掉）
            </button>
          )}
        </div>

        <div className="mt-3 rounded-2xl bg-surface p-3.5 shadow-card">
          <h3 className="text-[13px] font-medium text-ink">这一页里哪些是真的</h3>
          <ul className="mt-2 space-y-1.5 text-[11.5px] leading-relaxed text-ink-sub">
            <li>
              <b className="text-ink">真的</b>：报告里标着「真的」的那一栏 —— 全部从这台手机的记录现算（消息 / 日记 /
              字卡库 / 世界感知），还有冷却时间。
            </li>
            <li>
              <b className="text-ink">抽的</b>：定位和「手机屏幕上看到的东西」—— 我们拿不到这些，
              种子 = 请求 id，标明「抽的」，不假装是真的。
            </li>
            <li>
              <b className="text-ink">没有的</b>：真的截图与坐标。这台设备上没有这样的来源，所以永远不会给你一张假截图。
            </li>
          </ul>
          <p className="mt-2 text-[10.5px] text-ink-faint">
            记录会跟 `state` 一起同步（对应多端设计里的 `check_requests`）；`EXPIRED` 是多端版的超时状态，本机版他几秒内就回，用不到。
          </p>
        </div>
      </div>
    </div>
  )
}

function CheckCard({
  c,
  meId,
  nickname,
  now,
  onRemove,
}: {
  c: CheckRequest
  meId: string
  nickname: string
  now: Date
  onRemove: () => void
}) {
  const mine = c.requesterId === meId
  const r = c.result
  return (
    <li className="rounded-xl bg-page p-3 ring-1 ring-hairline">
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-ink">
          {mine ? `我查他 · ${CHECK_TYPE_LABEL[c.type]}` : `他来查我 · ${CHECK_TYPE_LABEL[c.type]}`}
        </span>
        <span
          className={clsx(
            'rounded-full px-1.5 py-0.5 text-[9.5px]',
            c.status === 'AGREED' ? 'bg-brand-soft text-brand-deep' : c.status === 'REQUESTED' ? 'bg-page text-ink-faint ring-1 ring-hairline' : 'bg-[#fdecec] text-[#c0392b]',
          )}
        >
          {c.status === 'AGREED'
            ? mine
              ? '给你看了'
              : '你给他看了'
            : c.status === 'REFUSED'
              ? mine
                ? '没给看'
                : '你没给看'
              : CHECK_STATUS_LABEL[c.status]}
        </span>
        <span className="ml-auto text-[10px] text-ink-faint">{fromNow(c.requestedAt, now)}</span>
      </div>

      {c.note && <p className="mt-1 text-[11.5px] text-ink-sub">「{c.note}」</p>}
      {r?.line && <p className="mt-1 text-[11.5px] text-ink">「{r.line}」</p>}

      {r && c.status === 'AGREED' && (
        <div className="mt-2 space-y-2">
          {!!r.facts.length && (
            <div className="rounded-lg bg-surface p-2.5 ring-1 ring-hairline">
              <p className="text-[10px] text-ink-faint">真的（从他这部手机里的记录现算）</p>
              <ul className="mt-1 space-y-0.5">
                {r.facts.map((f) => (
                  <li key={f} className="text-[11px] leading-snug text-ink">
                    · {f}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!!r.faked.length && (
            <div className="rounded-lg bg-brand-soft/50 p-2.5">
              <p className="text-[10px] text-brand-deep">
                抽的（{c.type === 'LOCATION' ? '定位' : '手机屏幕'}我们拿不到，这里是抽签写的）
              </p>
              <ul className="mt-1 space-y-0.5">
                {r.faked.map((f) => (
                  <li key={f} className="text-[11px] leading-snug text-brand-deep">
                    · {f}
                  </li>
                ))}
              </ul>
              {r.polished && (
                <p className="mt-1 text-[10px] text-ink-sub">
                  他说这份是「修饰过」的版本 —— 你自己看着信多少（对应 `checkPhone.fakeInfoP`）。
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {c.status === 'REFUSED' && (
        <p className="mt-1 text-[11px] text-ink-sub">{nickname}没给你看。报告里那栏「真的」他也没让你看到。</p>
      )}

      <div className="mt-1.5 flex items-center gap-2">
        {c.respondedAt && <span className="text-[10px] text-ink-faint">回应于 {fromNow(c.respondedAt, now)}</span>}
        <button className="tap ml-auto rounded-md px-1.5 py-1 text-[10px] text-ink-faint" onClick={onRemove}>
          删
        </button>
      </div>
    </li>
  )
}
