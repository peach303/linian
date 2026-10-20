import { useMemo } from 'react'
import clsx from 'clsx'
import { NavBar } from '@/components/common/NavBar'
import { computeFitness, computeStats } from '@/lib/stats'
import { useAppStore } from '@/store/useAppStore'
import { useCardsStore } from '@/store/useCardsStore'
import { useChatStore } from '@/store/useChatStore'
import { useRulesStore } from '@/store/useRulesStore'

/**
 * 适应度（功能 Hub → 🧭）
 *
 * 「他适应我了吗」这件事只认**能测出来的**证据：
 *   ① 他抽过我哪些卡（`messages.plan.cardIds`，按轮去重）
 *   ② 我发话他回不回、隔多久回
 *   ③ 他从我的原话里拾取了多少张卡（`Card.source === 'PICKED'`）
 * 综合分是这三项的**平均**，公式就写在页面上 —— 三项的原始数字都摆着，随时能自己核。
 * 这里不用字卡的 `useCount` 当熟练度：那个数现在只在编辑卡片时被动过，不是引擎真实命中数。
 */
export function FitnessScreen() {
  const messages = useChatStore((s) => s.messages)
  const cards = useCardsStore((s) => s.cards)
  const meId = useAppStore((s) => s.me.id)
  const companion = useAppStore((s) => s.companion)
  const room = useAppStore((s) => s.room)
  const moments = useAppStore((s) => s.moments)
  const letters = useAppStore((s) => s.letters)
  const gifts = useAppStore((s) => s.gifts)
  const voices = useAppStore((s) => s.voices)
  const pats = useAppStore((s) => s.pats)
  const weights = useRulesStore((s) => s.saved.chat.weights)

  const stats = useMemo(
    () => computeStats({ messages, cards, companion, room, moments, letters, gifts, voices, pats, meId }),
    [messages, cards, companion, room, moments, letters, gifts, voices, pats, meId],
  )
  const fit = useMemo(() => computeFitness(stats, cards, weights as unknown as Record<string, number>), [stats, cards, weights])

  const pct = (v: number) => `${Math.round(v * 100)}%`
  /** 拾取率：他每轮从我话里收卡的比例（封顶 100%，公式上写清楚） */
  const pickupRate = stats.myTurns ? Math.min(1, fit.pickedCards.length / stats.myTurns) : 0
  const score = (fit.coverage + fit.replyRate + pickupRate) / 3
  const maxDrawn = Math.max(1, ...fit.top.map((t) => t.drawn))

  return (
    <div className="flex h-full min-h-0 flex-col bg-page">
      <NavBar title="适应度" />

      <div className="no-scrollbar flex-1 overflow-y-auto px-3 pb-6">
        {/* 综合 */}
        <div className="mt-3 rounded-2xl bg-surface p-4 shadow-card">
          <div className="flex items-end gap-3">
            <div>
              <div className="text-[11px] text-ink-faint">适应度</div>
              <div className="text-[34px] font-light leading-none tabular-nums text-ink">{pct(score)}</div>
            </div>
            <p className="mb-1 text-[11px] leading-relaxed text-ink-sub">
              综合 = （字卡覆盖 + 回应率 + 拾取率）÷ 3
            </p>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Term label="字卡覆盖" value={pct(fit.coverage)} note={`${stats.cardsUsed}/${stats.cardsTotal} 张`} />
            <Term label="回应率" value={pct(fit.replyRate)} note={`${stats.repliedTurns}/${stats.myTurns} 轮`} />
            <Term label="拾取率" value={pct(pickupRate)} note={`${fit.pickedCards.length} 张`} />
          </div>
          {stats.myTurns < 5 && (
            <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
              样本还少（你才发了 {stats.myTurns} 轮），这几个比例会晃 —— 多聊两句再看更准。
            </p>
          )}
        </div>

        {/* 配置 vs 实际 */}
        <Section title="他实际在发什么（配置 vs 实际）">
          <p className="mb-2 text-[11px] leading-relaxed text-ink-faint">
            「配置」是概率引擎里的字卡占比；「实际」是他这些轮里真的发出来的载体（按轮数，从抽签轨迹统计）。
            两边差得多，说明抽签还没跑够样本 —— 不是他「学坏了」。
          </p>
          <div className="space-y-1.5">
            {fit.weights.map((w) => {
              const act = fit.actual.find((a) => a.key === w.key)
              const actual = act?.pct ?? 0
              return (
                <div key={w.key} className="text-[12px]">
                  <div className="flex items-center">
                    <span className="text-ink">{w.label}</span>
                    <span className="ml-auto tabular-nums text-ink-sub">
                      配置 {Math.round(w.value * 100)}% · 实际 {Math.round(actual * 100)}%
                      {act ? `（${act.count} 轮）` : ''}
                    </span>
                  </div>
                  <div className="mt-1 flex h-1.5 gap-0.5 overflow-hidden rounded-full">
                    <div className="rounded-full bg-brand" style={{ width: `${Math.max(1, w.value * 100)}%` }} title="配置" />
                    <div className="rounded-full bg-brand-soft" style={{ width: `${Math.max(1, actual * 100)}%` }} title="实际" />
                  </div>
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-[10px] text-ink-faint">深色 = 配置占比，浅色 = 实际占比</p>
        </Section>

        {/* 字卡熟练度 */}
        <Section title={`字卡熟练度（抽到过 ${stats.cardsUsed} / ${stats.cardsTotal} 张）`}>
          {fit.top.length === 0 ? (
            <p className="text-[11px] leading-relaxed text-ink-faint">
              还没有抽签记录 —— 他每回一条，这一轮抽到的卡就会记在消息上（长按消息 →「看抽签」能翻到）。
            </p>
          ) : (
            <ul className="space-y-1.5">
              {fit.top.slice(0, 12).map((row) => (
                <li key={row.card.id} className="flex items-center gap-2 text-[12px]">
                  <span className="w-[100px] shrink-0 truncate text-ink" title={row.card.text}>
                    {row.card.type === 'IMAGE' ? '🖼 图片卡' : row.card.text || row.card.id}
                  </span>
                  <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-hairline">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${(row.drawn / maxDrawn) * 100}%` }} />
                  </div>
                  <span className="w-14 shrink-0 text-right tabular-nums text-ink-sub">{row.drawn} 轮</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
            还有 <b className="text-ink">{fit.neverDrawn}</b> 张从没被抽到过
            {stats.cardsTotal > 0 ? `（占 ${Math.round((fit.neverDrawn / stats.cardsTotal) * 100)}%）` : ''}
            —— 想让某张多出现，去字卡库把它的权重调大。
          </p>
        </Section>

        {/* 他从我的话里学到的 */}
        <Section title={`他从我的话里收下的（${fit.pickedCards.length} 张）`}>
          {fit.pickedCards.length === 0 ? (
            <p className="text-[11px] leading-relaxed text-ink-faint">
              还没有。聊天里他偶尔会「拾取」你刚说的一句（`chat.pickup`），收进字卡库之后就成了他会说的话 ——
              在字卡库「拾取」那一栏能看到。
            </p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {fit.pickedCards.map((c) => (
                <li key={c.id} className="rounded-full bg-brand-soft px-2.5 py-1 text-[11px] text-brand-deep">
                  {c.text || c.id}
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* 说话习惯 */}
        <Section title="说话的习惯，他有没有跟上">
          <div className="grid grid-cols-2 gap-2">
            <Habit label="我一轮平均" value={`${fit.avgMyChars} 字`} />
            <Habit label="他一轮平均" value={`${fit.avgHisChars} 字`} />
            <Habit label="我带标点" value={pct(fit.myPunctRate)} note="我发的话里有标点/波浪号的比例" />
            <Habit label="他带 emoji" value={pct(fit.hisEmojiRate)} note="他发的话里带 emoji 的比例" />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
            他「跟着你说话」的方式是抽签的：`chat.punctuation` 决定他会不会用标点，多字卡拼接 / 连词决定他的句子长短。
            想让他更像你，就去概率引擎调这两项。
          </p>
        </Section>

        <Section title="他有多主动">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Term label="主动消息" value={String(stats.proactive)} note="条" />
            <Term label="拍一拍" value={String(stats.pats.his)} note="他拍我" />
            <Term label="引用回复" value={String(stats.quotes)} note="条" />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
            这三项都来自真实的排程：主动消息由 `proactive.message` 定时器发（气泡左上角 ❤️），
            拍一拍与引用是他回你时抽中的。
          </p>
        </Section>

        <p className={clsx('mt-4 text-center text-[10px] leading-relaxed text-ink-faint')}>
          这一页不算「像不像」那种主观分 —— 只有真能测的东西。
        </p>
      </div>
    </div>
  )
}

/* ───────────────────────── 小零件 ───────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-3 rounded-2xl bg-surface p-3.5 shadow-card">
      <h3 className="mb-2 text-[13px] font-medium text-ink">{title}</h3>
      {children}
    </section>
  )
}

function Term({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl bg-page px-2 py-2.5">
      <div className="text-[10px] text-ink-faint">{label}</div>
      <div className="text-[15px] font-medium tabular-nums text-ink">{value}</div>
      <div className="text-[10px] text-ink-faint">{note}</div>
    </div>
  )
}

function Habit({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl bg-page px-3 py-2.5">
      <div className="text-[10px] text-ink-faint">{label}</div>
      <div className="mt-0.5 text-[14px] font-medium text-ink">{value}</div>
      {note && <div className="mt-0.5 text-[10px] leading-snug text-ink-faint">{note}</div>}
    </div>
  )
}
