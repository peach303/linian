import { useMemo } from 'react'
import clsx from 'clsx'
import { NavBar } from '@/components/common/NavBar'
import { humanDur } from '@/lib/companion'
import { computeStats } from '@/lib/stats'
import { useAppStore } from '@/store/useAppStore'
import { useCardsStore } from '@/store/useCardsStore'
import { useChatStore } from '@/store/useChatStore'
import type { Message } from '@/types'

/**
 * 统计（功能 Hub → 📊）
 *
 * 这里的数字**全部从真实数据现算**：聊天记录（含每条消息上的抽签轨迹 `messages.plan`）、
 * 通话记录（`CALL_EVENT` 消息）、红包 / 礼物卡、一起听的**真实播放秒数**、陪伴记录。
 * 算不出来的东西不摆上去（宁可少一个数字，也不留一个好看的假数字）。
 */
const KIND_LABEL: Partial<Record<Message['kind'], string>> = {
  TEXT: '文字',
  CARD: '字卡',
  IMAGE: '图片',
  VOICE: '语音',
  PAT: '拍一拍',
  QUOTE: '引用',
  CHOICE: '抉择',
  QUESTION: '问卷',
  RED_PACKET: '红包',
  GIFT: '礼物',
  MUSIC_INVITE: '音乐邀请',
  DOODLE: '涂鸦',
  CALL_EVENT: '通话记录',
  SEARCH_PUSH: 'B 站视频',
  SYSTEM: '系统消息',
}

const fmtDate = (iso?: string) => {
  if (!iso) return '—'
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const money = (n: number) => (Math.round(n * 100) / 100).toLocaleString('zh-CN')

export function StatsScreen() {
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

  const st = useMemo(
    () => computeStats({ messages, cards, companion, room, moments, letters, gifts, voices, pats, meId }),
    [messages, cards, companion, room, moments, letters, gifts, voices, pats, meId],
  )

  const dailyMax = Math.max(1, ...st.daily.map((d) => d.count))
  const hourMax = Math.max(1, ...st.hourly)
  const busiestHour = st.hourly.indexOf(Math.max(...st.hourly))

  return (
    <div className="flex h-full min-h-0 flex-col bg-page">
      <NavBar title="统计" />

      <div className="no-scrollbar flex-1 overflow-y-auto px-3 pb-6">
        {/* 概览 */}
        <div className="mt-3 rounded-2xl bg-surface p-4 shadow-card">
          <div className="grid grid-cols-3 gap-2 text-center">
            <BigStat label="消息" value={String(st.messages)} />
            <BigStat label="我 / 他" value={`${st.mine} / ${st.his}`} />
            <BigStat label="聊了" value={`${st.days} 天`} />
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
            从 {fmtDate(st.firstAt)} 到 {fmtDate(st.lastAt)}
            {st.avgLatencySec != null ? ` · 他平均 ${st.avgLatencySec} 秒回你` : ''}
          </p>
        </div>

        {/* 最近 14 天 */}
        <Section title="最近 14 天的消息">
          <div className="flex h-20 items-end gap-1">
            {st.daily.map((d) => (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-1" title={`${d.date} · ${d.count} 条`}>
                <div
                  className={clsx('w-full rounded-t', d.count ? 'bg-brand' : 'bg-hairline')}
                  style={{ height: `${Math.max(2, (d.count / dailyMax) * 64)}px` }}
                />
                <span className="text-[9px] text-ink-faint">{d.date.slice(8)}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* 他的活跃时段 */}
        <Section title="他什么时候在说话">
          <div className="flex h-16 items-end gap-[2px]">
            {st.hourly.map((n, h) => (
              <div key={h} className="flex-1" title={`${h} 点 · ${n} 条`}>
                <div
                  className={clsx('w-full rounded-t', n ? 'bg-brand-soft' : 'bg-hairline')}
                  style={{ height: `${Math.max(2, (n / hourMax) * 52)}px` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[9px] text-ink-faint">
            <span>0 点</span>
            <span>6</span>
            <span>12</span>
            <span>18</span>
            <span>23 点</span>
          </div>
          <p className="mt-2 text-[11px] text-ink-sub">
            他最常在 <b className="text-ink">{busiestHour} 点</b> 说话（{st.hourly[busiestHour]} 条）
          </p>
        </Section>

        {/* 消息构成 */}
        <Section title="消息构成">
          <ul className="space-y-1.5">
            {st.kinds.map((k) => (
              <li key={k.kind} className="flex items-center gap-2 text-[12px]">
                <span className="w-20 shrink-0 text-ink">{KIND_LABEL[k.kind] ?? k.kind}</span>
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-hairline">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${(k.count / st.messages) * 100}%` }} />
                </div>
                <span className="w-16 shrink-0 text-right tabular-nums text-ink-sub">
                  {k.count} · {Math.round((k.count / Math.max(1, st.messages)) * 100)}%
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-ink-faint">每个数字都能追到聊天记录里的那条消息。</p>
        </Section>

        {/* 说话的习惯 */}
        <Section title="他的回应">
          <Row label="我发了" value={`${st.myTurns} 轮`} />
          <Row label="他回了" value={`${st.repliedTurns} 轮 · ${st.myTurns ? Math.round((st.repliedTurns / st.myTurns) * 100) : 0}%`} />
          <Row label="已读不回" value={`${st.silentTurns} 轮`} hint="抽签命中的那种（不是漏回）" />
          <Row label="没接话" value={`${st.noReplyTurns} 轮`} hint="递卡片这类不触发回复的" />
          <Row label="主动来找我" value={`${st.proactive} 条`} />
          <Row label="撤回" value={`${st.recalled} 条`} />
          <Row label="引用回复" value={`${st.quotes} 条`} />
          <Row label="拍一拍" value={`他 ${st.pats.his} · 我 ${st.pats.mine}`} />
          {st.avgLatencySec != null && <Row label="平均回复间隔" value={`${st.avgLatencySec} 秒`} />}
        </Section>

        {/* 语音 */}
        <Section title="语音">
          <Row label="语音条数" value={`${st.voices.count} 条`} />
          <Row label="总时长" value={humanDur(Math.round(st.voices.totalMs / 1000))} />
          <Row
            label="来源"
            value={`MiniMax ${st.voices.byMinimax} · 语音卡 ${st.voices.byCard} · 我录的 ${st.voices.byMe}`}
            hint="语音卡 = 收藏来的现成音频，重听不花钱"
          />
        </Section>

        {/* 通话 */}
        <Section title="通话">
          <Row label="通话次数" value={`${st.calls.count} 次`} />
          <Row label="接通" value={`${st.calls.connected} 次 · ${st.calls.count ? Math.round((st.calls.connected / st.calls.count) * 100) : 0}%`} />
          <Row label="没接通" value={`${st.calls.missed} 次`} hint="拒接 / 忙线 / 无人接听，都是抽出来的结局" />
          <Row label="总时长" value={humanDur(st.calls.totalSec)} />
          <Row label="最长一次" value={humanDur(st.calls.longestSec)} />
          <Row label="他先挂" value={`${st.calls.himHungUp} 次`} />
          {st.calls.count === 0 && <Empty text="还没打过电话 —— 聊天页「+」→ 语音通话" />}
        </Section>

        {/* 红包 / 礼物 */}
        <Section title="红包与礼物">
          <Row label="红包" value={`${st.redPackets.count} 个 · 共 ${money(st.redPackets.total)}`} />
          <Row label="最大一个" value={`${money(st.redPackets.max)}`} />
          <Row label="谁发的" value={`我 ${st.redPackets.mine} · 他 ${st.redPackets.his}`} />
          <Row
            label="礼物"
            value={`${st.gifts.count} 件 · 共 ${money(st.gifts.total)}`}
            hint={st.gifts.top ? `他最常收到：${st.gifts.top.icon} ${st.gifts.top.name}（${st.gifts.top.count} 次）` : undefined}
          />
        </Section>

        {/* 一起听 / 陪伴 */}
        <Section title="一起听">
          <Row label="歌单" value={`${st.music.tracks} 首`} />
          <Row
            label="真的听了"
            value={humanDur(st.music.playedSec)}
            hint="`<audio>` 真的走出来的秒数；网易云的曲目拿不到进度，不计"
          />
          <Row label="房间里的对话" value={`${st.music.roomMessages} 条`} />
          <Row label="递出去的邀请卡" value={`${st.music.invites} 张`} />
        </Section>

        <Section title="陪伴">
          <Row label="一共陪了" value={`${st.companion.sessions} 次 · ${humanDur(st.companion.totalSec)}`} />
          {st.companion.byMode.map((m) => (
            <Row
              key={m.mode}
              label={{ sleep: '🌙 睡觉', study: '📚 学习', work: '💻 工作' }[m.mode] ?? m.mode}
              value={`${m.sessions} 次 · ${humanDur(m.totalSec)}`}
            />
          ))}
          <Row label="他先走 / 没来" value={`${st.companion.heLeftEarly} / ${st.companion.heMissed} 次`} />
          <Row label="我提前结束" value={`${st.companion.interrupted} 次`} />
          {st.companion.sessions === 0 && <Empty text="还没陪过 —— 功能 → 🌙 陪伴" />}
        </Section>

        {/* 高频词 */}
        <Section title="高频词（二元粗切）">
          <p className="mb-2 text-[11px] leading-relaxed text-ink-faint">
            没有分词库，这里按相邻两字粗切统计（「今天天气」→ 今天 / 天天 / 天气），
            只列出现 ≥ 2 次的。样本少的时候就空着 —— 不硬凑。
          </p>
          <WordRow title="他常说的" words={st.wordsHis} />
          <WordRow title="我常说的" words={st.wordsMine} />
        </Section>

        {/* 情绪 */}
        {st.emotions.length > 0 && (
          <Section title="情绪标签">
            <div className="flex flex-wrap gap-1.5">
              {st.emotions.map((e) => (
                <span key={e.tag} className="rounded-full bg-brand-soft px-2.5 py-1 text-[11px] text-brand-deep">
                  {e.tag} · {e.count}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* 别的角落 */}
        <Section title="别的角落">
          <Row label="朋友圈" value={`${moments.length} 条`} />
          <Row label="信箱" value={`${letters.length} 封`} />
          <Row label="礼物柜" value={`${gifts.length} 件可选`} />
          <Row label="字卡库" value={`${st.cardsTotal} 张（抽到过 ${st.cardsUsed} 张）`} />
          <Row label="收藏的语音" value={`${voices.length} 段`} />
          <Row label="拾取来的卡" value={`${st.picked} 张（从我说的话里收的）`} />
        </Section>

        <p className="mt-4 text-center text-[10px] leading-relaxed text-ink-faint">
          这一页里所有数字都是现算的：改一条记录，下次进来就变。
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

function BigStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-ink-faint">{label}</div>
      <div className="mt-0.5 text-[17px] font-medium tabular-nums text-ink">{value}</div>
    </div>
  )
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-start gap-3 border-b border-hairline py-1.5 last:border-b-0">
      <span className="shrink-0 text-[12px] text-ink-sub">{label}</span>
      <span className="ml-auto text-right text-[12px] tabular-nums text-ink">
        {value}
        {hint && <span className="mt-0.5 block text-[10px] font-normal leading-snug text-ink-faint">{hint}</span>}
      </span>
    </div>
  )
}

function WordRow({ title, words }: { title: string; words: { word: string; count: number }[] }) {
  return (
    <div className="mb-2 last:mb-0">
      <div className="mb-1 text-[11px] text-ink-sub">{title}</div>
      {words.length === 0 ? (
        <p className="text-[11px] text-ink-faint">还不够（出现 2 次以上才上榜）</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {words.map((w) => (
            <span key={w.word} className="rounded-full bg-page px-2 py-0.5 text-[11px] text-ink ring-1 ring-hairline">
              {w.word} <span className="text-ink-faint">{w.count}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="text-[11px] text-ink-faint">{text}</p>
}
