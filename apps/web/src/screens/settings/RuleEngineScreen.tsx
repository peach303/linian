import clsx from 'clsx'
import type { CSSProperties } from 'react'
import { NavBar } from '@/components/common/NavBar'
import { RuleField } from '@/components/settings/controls'
import { fireProactive, proactiveState } from '@/lib/engine/runtime'
import { fireTimelinePreview, timelineState } from '@/lib/engine/timeline'
import { RULE_GROUPS, getAtPath, normalizeWeights, type FieldMeta } from '@/lib/rules'
import { useRulesStore } from '@/store/useRulesStore'
import { useAppStore } from '@/store/useAppStore'
import type { RuleConfig } from '@/types/rules'

/**
 * ★ 概率调节引擎（设置 → 深度拟真）
 * 元数据驱动：RULE_GROUPS 描述字段 → RuleField 自动渲染控件；
 * 改完可在顶部「模拟一次回复」立刻看到抽签结果，
 * 「现在就来一条」直接演示一次他自己的主动消息（气泡左上角 ❤️）。
 */
export function RuleEngineScreen() {
  const st = useRulesStore()
  const goBack = useAppStore((s) => s.back)
  const push = useAppStore((s) => s.push)
  const group = RULE_GROUPS.find((g) => g.key === st.activeGroup) ?? RULE_GROUPS[0]
  const dirty = st.dirty()

  const previewProactive = () => {
    fireProactive('manual')
    push('chat')
  }

  const previewTimeline = (kind: 'moment' | 'letter') => {
    fireTimelinePreview(kind)
    push(kind === 'moment' ? 'moments' : 'mailbox')
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-page">
      <NavBar
        title="概率调节引擎"
        onBack={goBack}
        right={
          <span className="rounded-full bg-brand-soft px-2 py-1 text-[11px] text-brand-deep">
            v{st.version}
            {dirty > 0 ? ' · 草稿' : ''}
          </span>
        }
      />

      <div className="no-scrollbar flex-1 overflow-y-auto px-3 pb-4">
        {/* ── 概览：字卡占比 + 模拟 ── */}
        <WeightsCard weights={st.draft.chat.weights} onChange={(k, v) => st.update(`chat.weights.${k}`, v)} />

        <button
          className="tap mt-3 flex w-full items-center gap-3 rounded-2xl bg-gradient-to-br from-[#5aa0e8] to-[#8fc4f8] p-3.5 text-left text-white shadow-card"
          onClick={st.runSim}
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/25 text-[20px]">🎲</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-medium">模拟一次回复</span>
            <span className="block text-[11px] opacity-90">按当前配置跑一遍抽签，看他会怎么回</span>
          </span>
          <span className="text-[16px] opacity-80">›</span>
        </button>

        <button
          className="tap mt-2 flex w-full items-center gap-3 rounded-2xl bg-surface p-3.5 text-left shadow-card ring-1 ring-hairline"
          onClick={previewProactive}
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-soft text-[20px]">❤️</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-medium text-ink">现在就来一条</span>
            <span className="block text-[11px] text-ink-faint">
              不等间隔，立刻演示一次他自己发来的消息（气泡左上角带 ❤️）
            </span>
          </span>
          <span className="text-[16px] text-ink-faint">›</span>
        </button>

        <div className="mt-2 flex gap-2">
          <button
            className="tap flex-1 rounded-2xl bg-surface p-3 text-left shadow-card ring-1 ring-hairline"
            onClick={() => previewTimeline('moment')}
          >
            <span className="block text-[13px] font-medium text-ink">🌈 让他发条朋友圈</span>
            <span className="block text-[11px] leading-snug text-ink-faint">不等冷却，立刻来一条动态</span>
          </button>
          <button
            className="tap flex-1 rounded-2xl bg-surface p-3 text-left shadow-card ring-1 ring-hairline"
            onClick={() => previewTimeline('letter')}
          >
            <span className="block text-[13px] font-medium text-ink">✉️ 让他写封信</span>
            <span className="block text-[11px] leading-snug text-ink-faint">不等冷却，立刻寄一封</span>
          </button>
        </div>

        {proactiveState.at > 0 && (
          <p className="mt-2 px-1 text-[11px] leading-relaxed text-ink-faint">
            ⏰ 下一条主动消息：{new Date(proactiveState.at).toLocaleString('zh-CN', { hour12: false })}
            <br />
            <span className="text-ink-faint/80">（{proactiveState.reason}）</span>
          </p>
        )}

        {timelineState.at > 0 && (
          <p className="mt-1 px-1 text-[11px] leading-relaxed text-ink-faint">
            ⏰ 朋友圈 / 信箱：{timelineLabel(timelineState.key)} ·{' '}
            {new Date(timelineState.at).toLocaleString('zh-CN', { hour12: false })}
          </p>
        )}

        {/* ── 分组 Tab ── */}
        <div className="no-scrollbar -mx-3 mt-3 flex gap-2 overflow-x-auto px-3 pb-1 pr-8">
          {RULE_GROUPS.map((g) => (
            <button
              key={g.key}
              onClick={() => st.setGroup(g.key)}
              className={clsx(
                'tap flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] shadow-card',
                st.activeGroup === g.key ? 'bg-brand text-white' : 'bg-surface text-ink-sub',
              )}
            >
              <span>{g.icon}</span>
              {g.label}
            </button>
          ))}
        </div>

        {/* ── 当前分组 ── */}
        <div className="mt-3 rounded-xl bg-surface shadow-card">
          <div className="flex items-start gap-2 border-b border-hairline px-3 py-2.5">
            <p className="flex-1 text-[12px] leading-relaxed text-ink-sub">{group.blurb}</p>
            <button
              className="tap shrink-0 rounded-full bg-page px-2.5 py-1 text-[11px] text-ink-sub ring-1 ring-hairline"
              onClick={() => st.resetGroup(group.fields.map((f) => f.path))}
            >
              重置本组
            </button>
          </div>

          <div className="divide-y divide-hairline px-3">
            {group.fields.map((f) => (
              <FieldRow key={f.path} field={f} />
            ))}
          </div>
        </div>

        <p className="mt-3 px-1 text-[11px] leading-relaxed text-ink-faint">
          说明：所有概率独立抽签，字卡占比不强制求和为 100%（引擎会归一化）。
          每项在抽签链路中的位置见各字段下方描述；保存后新增一个版本，旧版本可回滚。
        </p>
      </div>

      {/* ── 底部保存条 ── */}
      <div className="shrink-0 border-t border-hairline bg-surface/95 px-3 py-2.5 backdrop-blur safe-bottom">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 text-[12px] leading-4">
            {dirty > 0 ? (
              <span className="text-brand-deep">未保存 {dirty} 项修改</span>
            ) : st.lastSavedAt ? (
              <span className="text-ink-faint">
                已保存 ·{' '}
                {new Date(st.lastSavedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            ) : (
              <span className="text-ink-faint">当前为默认配置</span>
            )}
          </div>
          <button
            className={clsx('tap rounded-lg px-3 py-1.5 text-[13px]', dirty > 0 ? 'bg-page text-ink-sub ring-1 ring-hairline' : 'bg-page/60 text-ink-faint')}
            disabled={dirty === 0 || st.saving}
            onClick={st.resetAll}
          >
            撤销
          </button>
          <button
            className={clsx(
              'tap rounded-lg px-4 py-1.5 text-[13px] text-white',
              dirty > 0 && !st.saving ? 'bg-brand' : 'bg-brand/40',
            )}
            disabled={dirty === 0 || st.saving}
            onClick={() => void st.save()}
          >
            {st.saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>

      {st.simOpen && st.sim && <SimSheet />}
    </div>
  )
}

/* ───────────────────── 字卡占比（权重 → 归一化占比） ───────────────────── */

function WeightsCard({
  weights,
  onChange,
}: {
  weights: RuleConfig['chat']['weights']
  onChange: (key: keyof RuleConfig['chat']['weights'], v: number) => void
}) {
  const items = normalizeWeights(weights)
  const total = items.reduce((s, x) => s + x.weight, 0)

  return (
    <section className="mt-3 rounded-2xl bg-surface p-3.5 shadow-card">
      <div className="flex items-baseline gap-2">
        <h2 className="text-[14px] font-medium text-ink">字卡占比</h2>
        <span className="text-[11px] text-ink-faint">权重合计 {total.toFixed(2)}（无需为 100%）</span>
      </div>

      {/* 归一化占比条 */}
      <div className="mt-2.5 flex h-2.5 overflow-hidden rounded-full bg-page">
        {items.map((x) => (
          <div
            key={x.key}
            style={{ width: `${x.ratio * 100}%`, background: x.color }}
            className="h-full transition-all duration-200"
            title={`${x.label} ${(x.ratio * 100).toFixed(1)}%`}
          />
        ))}
      </div>

      <div className="mt-3 space-y-1.5">
        {items.map((x) => (
          <div key={x.key} className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: x.color }} />
            <span className="w-14 shrink-0 text-[13px] text-ink">{x.label}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={x.weight}
              onChange={(e) => onChange(x.key, Number(e.target.value))}
              style={{ '--ln-slider': x.color, '--ln-fill': `${x.weight * 100}%` } as CSSProperties}
              className="h-5 flex-1"
            />
            <span className="w-10 shrink-0 text-right text-[12px] tabular-nums text-ink-sub">
              {(x.ratio * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>

      <p className="mt-2 text-[11px] text-ink-faint">
        右侧百分比是归一化后的真实占比；权重全为 0 时自动回落纯文字。
      </p>
    </section>
  )
}

/* ───────────────────────── 单个字段 ───────────────────────── */

/** 把时间轴的内部 key（如 `like:p_xxx`）翻成人话 */
function timelineLabel(key: string) {
  const kind = key.split(':')[0]
  const map: Record<string, string> = {
    moment: '他要发一条动态',
    letter: '他要寄一封信',
    like: '他会给你点赞',
    comment: '他会评论你的动态',
    reply: '他会回复你的评论',
    'like-back': '他会回赞',
    mail: '他会回你的信',
    'mail-an': '他要在你的信上写批注',
    choice: '他要在你的抉择里选一个',
    question: '他要填你的问卷',
    'rp-claim': '他要领你的红包',
    'rp-back': '他要回你一个红包',
    gift: '他要拆开你送的礼物',
    'gift-auto': '他要送你一件礼物',
    music: '他要加入你的一起听',
    'music-back': '他要回推一首歌给你',
    doodle: '他要看你画的涂鸦',
  }
  return map[kind] ?? '他有件事要做'
}

/** 字段路径 → 标题（子项被父开关禁掉时，用来说清「先打开上面哪一个」） */
const LABEL_OF: Record<string, string> = Object.fromEntries(
  RULE_GROUPS.flatMap((g) => g.fields.map((f) => [f.path, f.label])),
)

/**
 * 父开关是否打开。
 * ⚠️ 两种形态都要认：`voice.enabled` 这类**布尔字段**（值是 true / false），
 * 以及 `chat.recall` 这类 **`{ enabled, p }` 概率字段**（值是个对象）。
 * （只认 `.enabled` 的话，布尔父项会被永远当成「关着」——子项全灰，正是以前的 bug。）
 */
function parentOn(v: unknown): boolean {
  if (typeof v === 'boolean') return v
  return Boolean((v as { enabled?: boolean } | undefined)?.enabled)
}

function FieldRow({ field }: { field: FieldMeta }) {
  const st = useRulesStore()
  const value = getAtPath(st.draft, field.path)
  const active = field.requires ? parentOn(getAtPath(st.draft, field.requires)) : true
  /**
   * 子项灰掉的唯一原因是**它上面那个开关关着**（跟接没接入无关）——
   * 所以直接把那句话写出来，省得用户以为是坏了 / 还没做。
   */
  const disabledHint =
    field.requires && !active ? `先打开上面「${LABEL_OF[field.requires] ?? '它上面那个开关'}」，这一项才会生效` : undefined

  return (
    <RuleField
      field={field}
      value={value}
      onChange={(v) => st.update(field.path, v)}
      active={active}
      disabledHint={disabledHint}
    />
  )
}

/* ───────────────────── 模拟结果（底部抽屉） ───────────────────── */

function SimSheet() {
  const { sim, closeSim, runSim } = useRulesStore()
  if (!sim) return null

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end">
      <button className="flex-1 bg-black/25" onClick={closeSim} aria-label="关闭" />

      <div className="flex max-h-[80%] flex-col overflow-hidden rounded-t-2xl bg-surface pb-3 shadow-phone">
        <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
          <h3 className="text-[15px] font-medium text-ink">本次抽签结果</h3>
          <button className="tap ml-auto text-[12px] text-brand-deep" onClick={runSim}>
            再抽一次
          </button>
          <button className="tap text-[13px] text-ink-faint" onClick={closeSim}>
            ✕
          </button>
        </div>

        <div className="no-scrollbar flex-1 overflow-y-auto px-4 py-3">
          {/* 结论 */}
          {sim.silent ? (
            <div className="rounded-xl bg-page p-3 text-center text-[14px] text-ink-sub">
              已读不回 😶 本轮什么都不发
            </div>
          ) : (
            <div className="rounded-xl bg-page p-3">
              <div className="text-[12px] text-ink-sub">
                他这次会发 <b className="text-brand-deep">{sim.preview.length}</b> 条
                {sim.totalSec > 0 && (
                  <>
                    ，连发总耗时约 <b className="text-brand-deep">{sim.totalSec} 秒</b>
                  </>
                )}
              </div>
              <div className="mt-2 space-y-1.5">
                {sim.preview.map((p, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <span className="rounded-md bg-brand-soft px-1.5 py-0.5 text-[10px] leading-none text-brand-deep">
                      {p.kind}
                    </span>
                    <span className="flex-1 rounded-lg bg-bubble px-2.5 py-1.5 text-[14px] text-ink">
                      {p.text}
                    </span>
                    <span className="shrink-0 text-[10px] tabular-nums text-ink-faint">
                      +{p.latencySec}s
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 抽签链路 */}
          <h4 className="mt-4 mb-2 text-[12px] text-ink-sub">抽签链路</h4>
          <ol className="space-y-1.5">
            {sim.steps.map((s) => (
              <li key={s.no} className="flex items-start gap-2 rounded-lg bg-page/70 px-2.5 py-2">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-surface text-[10px] text-ink-sub ring-1 ring-hairline">
                  {s.no}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-ink">{s.label}</span>
                  <span className="block text-[11px] leading-4 text-ink-faint">{s.detail}</span>
                </span>
                <span className="shrink-0 pt-0.5 text-[11px]">
                  {s.hit === null ? (
                    <span className="text-ink-faint">·</span>
                  ) : s.hit ? (
                    <span className="rounded-full bg-brand/15 px-1.5 py-0.5 text-brand-deep">命中</span>
                  ) : (
                    <span className="rounded-full bg-page px-1.5 py-0.5 text-ink-faint ring-1 ring-hairline">
                      未命中
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="px-4 pt-1 text-[11px] text-ink-faint">
          抽签逻辑与后端 <code>engine/reply-engine.ts</code> 一致，仅用于预览。
        </div>
      </div>
    </div>
  )
}
