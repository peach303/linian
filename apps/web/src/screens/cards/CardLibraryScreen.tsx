import clsx from 'clsx'
import { useMemo, useState } from 'react'
import { NavBar } from '@/components/common/NavBar'
import { Switch } from '@/components/settings/controls'
import { CardEditSheet } from '@/components/cards/CardEditSheet'
import { ImportSheet } from '@/components/cards/ImportSheet'
import { TYPE_META, cardRates, pct, typeMeta } from '@/lib/cards'
import { normalizeWeights } from '@/lib/rules'
import { useAppStore } from '@/store/useAppStore'
import { useCardsStore, type SourceFilter } from '@/store/useCardsStore'
import { useRulesStore } from '@/store/useRulesStore'
import type { Card } from '@/types/cards'

const SOURCE_TABS: { key: SourceFilter; label: string }[] = [
  { key: 'ALL', label: '全部' },
  { key: 'SYSTEM', label: '系统预设' },
  { key: 'CUSTOM', label: '自定义' },
  { key: 'PICKED', label: '拾取' },
]

/**
 * ★ 字卡库（设置 → 字卡库）
 * 三层概率：类型占比（概率引擎）→ 卡内权重 → 综合命中率
 * 预设卡可开关 / 调权重 / 禁自由造句；自定义卡全类型 CRUD；支持批量导入 + 查重预览。
 */
export function CardLibraryScreen() {
  const st = useCardsStore()
  const weights = useRulesStore((s) => s.draft.chat.weights)
  const push = useAppStore((s) => s.push)
  const [manage, setManage] = useState(false)
  const [selected, setSelected] = useState<string[]>([])

  const { ratios, typeCount, rate, poolOf } = useMemo(() => cardRates(st.cards, weights), [st.cards, weights])
  const pools = normalizeWeights(weights)

  const filtered = st.cards.filter(
    (c) =>
      (st.source === 'ALL' || c.source === st.source) &&
      (st.type === 'ALL' || c.type === st.type) &&
      (!st.q ||
        (c.text ?? '').toLowerCase().includes(st.q.toLowerCase()) ||
        (c.category ?? '').includes(st.q) ||
        c.tags.some((t) => t.includes(st.q))),
  )

  const enabled = st.cards.filter((c) => c.enabled).length
  const usedTotal = st.cards.reduce((s, c) => s + c.useCount, 0)

  /** 按类型分组（选定了具体类型时就不分组） */
  const groups = TYPE_META.map((t) => ({ meta: t, items: filtered.filter((c) => c.type === t.key) })).filter(
    (g) => st.type === 'ALL' || g.items.length > 0,
  )

  const counts = (key: SourceFilter) => (key === 'ALL' ? st.cards.length : st.cards.filter((c) => c.source === key).length)

  const toggleSelect = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-page">
      <NavBar
        title="字卡库"
        right={
          <>
            <button
              className={clsx('tap rounded-lg px-2 py-1 text-[12px]', manage ? 'bg-brand text-white' : 'text-brand-deep')}
              onClick={() => {
                setManage((m) => !m)
                setSelected([])
              }}
            >
              {manage ? '完成' : '管理'}
            </button>
            <button
              className="tap rounded-lg bg-brand px-2.5 py-1 text-[12px] text-white"
              onClick={() => st.setImportOpen(true)}
            >
              导入
            </button>
          </>
        }
      />

      <div className="no-scrollbar flex-1 overflow-y-auto px-3 pb-4">
        {/* ── 概览 ── */}
        <section className="mt-3 rounded-2xl bg-surface p-3.5 shadow-card">
          <div className="flex items-baseline gap-2">
            <h2 className="text-[14px] font-medium text-ink">字卡总览</h2>
            <span className="text-[11px] text-ink-faint">
              共 {st.cards.length} 张 · 启用 {enabled} · 已用 {usedTotal} 次
            </span>
            <button className="tap ml-auto text-[11px] text-brand-deep" onClick={() => push('rule-engine')}>
              调占比 ›
            </button>
          </div>

          {/* 类型占比（来自概率引擎） */}
          <div className="mt-2.5 flex h-2.5 overflow-hidden rounded-full bg-page">
            {pools.map((p) => (
              <div key={p.key} style={{ width: `${p.ratio * 100}%`, background: p.color }} className="h-full" />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {pools.map((p) => (
              <span key={p.key} className="flex items-center gap-1 text-[11px] text-ink-sub">
                <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                {p.label} <b className="text-ink">{pct(p.ratio)}</b>
              </span>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
            综合命中率 = 类型占比 × 卡内权重占比。emoji 与文字共用「文字」占比池。
          </p>
        </section>

        {/* ── 来源 Tab ── */}
        <div className="no-scrollbar -mx-3 mt-3 flex gap-2 overflow-x-auto px-3 pb-1">
          {SOURCE_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                st.setSource(t.key)
                setSelected([])
              }}
              className={clsx(
                'tap shrink-0 rounded-full px-3 py-1.5 text-[13px] shadow-card',
                st.source === t.key ? 'bg-brand text-white' : 'bg-surface text-ink-sub',
              )}
            >
              {t.label}
              <span className="ml-1 text-[11px] opacity-70">{counts(t.key)}</span>
            </button>
          ))}
        </div>

        {/* ── 搜索 + 类型筛选 ── */}
        <div className="mt-2 rounded-xl bg-surface p-2.5 shadow-card">
          <input
            value={st.q}
            onChange={(e) => st.setQ(e.target.value)}
            placeholder="搜索内容 / 分类 / 标签"
            className="w-full rounded-lg bg-page px-3 py-2 text-[13px] text-ink outline-none ring-1 ring-hairline focus:ring-brand placeholder:text-ink-faint"
          />
          <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto">
            <button
              onClick={() => st.setType('ALL')}
              className={clsx(
                'tap shrink-0 rounded-full px-2.5 py-1 text-[12px] ring-1',
                st.type === 'ALL' ? 'bg-brand/15 text-brand-deep ring-brand' : 'bg-page text-ink-sub ring-hairline',
              )}
            >
              全部类型
            </button>
            {TYPE_META.map((t) => (
              <button
                key={t.key}
                onClick={() => st.setType(t.key)}
                className={clsx(
                  'tap shrink-0 rounded-full px-2.5 py-1 text-[12px] ring-1',
                  st.type === t.key ? 'bg-brand/15 text-brand-deep ring-brand' : 'bg-page text-ink-sub ring-hairline',
                )}
              >
                {t.label}
                <span className="ml-1 opacity-60">{typeCount.get(t.key)?.enabled ?? 0}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── 列表（按类型分组） ── */}
        {groups.map((g) => (
          <section key={g.meta.key} className="mt-3">
            <div className="mb-1.5 flex items-baseline gap-2 px-1">
              <h3 className="text-[13px] font-medium text-ink">{g.meta.label}</h3>
              <span className="text-[11px] text-ink-faint">
                {g.items.filter((c) => c.enabled).length}/{g.items.length} 张启用 · 池占比{' '}
                {pct(ratios[poolOf(g.meta.key)] ?? 0)}
              </span>
            </div>

            {g.items.length === 0 ? (
              <div className="rounded-xl bg-surface px-3 py-4 text-center text-[12px] text-ink-faint shadow-card">
                {g.meta.key === 'IMAGE' ? '还没有图片字卡，点右上角「导入」或管理里新增' : '这一类还没有字卡'}
              </div>
            ) : (
              <ul className="divide-y divide-hairline overflow-hidden rounded-xl bg-surface shadow-card">
                {g.items.map((c) => (
                  <CardRow
                    key={c.id}
                    card={c}
                    hit={rate(c).hit}
                    within={rate(c).within}
                    manage={manage}
                    selected={selected.includes(c.id)}
                    onSelect={() => toggleSelect(c.id)}
                    onOpen={() => st.openEdit(c)}
                  />
                ))}
              </ul>
            )}
          </section>
        ))}

        {filtered.length === 0 && (
          <div className="mt-6 rounded-xl bg-surface px-4 py-8 text-center shadow-card">
            <div className="text-[28px]">🗂️</div>
            <p className="mt-2 text-[13px] text-ink">没有匹配的字卡</p>
            <button
              className="tap mt-3 rounded-lg bg-brand px-4 py-1.5 text-[13px] text-white"
              onClick={() => st.openEdit()}
            >
              新建一张
            </button>
          </div>
        )}

        <div className="mt-4 flex items-center gap-2">
          <button
            className="tap rounded-lg bg-surface px-3 py-1.5 text-[12px] text-ink-sub shadow-card"
            onClick={() => st.resetPresets()}
          >
            恢复系统预设
          </button>
          <span className="text-[11px] text-ink-faint">不会删除自定义与拾取的卡</span>
        </div>
      </div>

      {/* ── 批量操作条 ── */}
      {manage && (
        <div className="shrink-0 border-t border-hairline bg-surface/95 px-3 py-2.5 backdrop-blur safe-bottom">
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-ink-sub">已选 {selected.length} 张</span>
            <span className="flex-1" />
            <button
              className="tap rounded-lg bg-page px-2.5 py-1.5 text-[12px] text-ink-sub ring-1 ring-hairline"
              disabled={!selected.length}
              onClick={() => st.updateMany(selected, { enabled: true })}
            >
              启用
            </button>
            <button
              className="tap rounded-lg bg-page px-2.5 py-1.5 text-[12px] text-ink-sub ring-1 ring-hairline"
              disabled={!selected.length}
              onClick={() => st.updateMany(selected, { enabled: false })}
            >
              停用
            </button>
            <button
              className="tap rounded-lg bg-page px-2.5 py-1.5 text-[12px] text-[#e0533d] ring-1 ring-hairline"
              disabled={!selected.length}
              onClick={() => {
                st.removeMany(selected)
                setSelected([])
              }}
            >
              删除
            </button>
          </div>
        </div>
      )}

      {st.editOpen && <CardEditSheet />}
      {st.importOpen && <ImportSheet />}
    </div>
  )
}

/* ───────────────────────── 单行 ───────────────────────── */

function CardRow({
  card,
  hit,
  within,
  manage,
  selected,
  onSelect,
  onOpen,
}: {
  card: Card
  hit: number
  within: number
  manage: boolean
  selected: boolean
  onSelect: () => void
  onOpen: () => void
}) {
  const st = useCardsStore()
  const meta = typeMeta(card.type)
  const isImage = card.type === 'IMAGE'

  return (
    <li className={clsx('flex items-center gap-2.5 px-3 py-2.5', !card.enabled && 'opacity-55')}>
      {manage && (
        <button
          className={clsx(
            'grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border text-[10px] leading-none',
            selected ? 'border-brand bg-brand text-white' : 'border-hairline bg-page text-transparent',
          )}
          onClick={onSelect}
        >
          ✓
        </button>
      )}

      <button className="tap flex min-w-0 flex-1 items-center gap-2.5 text-left" onClick={onOpen}>
        <span
          className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg text-[15px] ring-1 ring-hairline"
          style={{ background: `${meta.color}22` }}
        >
          {isImage && card.mediaUrl ? (
            <img src={card.mediaUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            meta.icon
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[14px] text-ink">
              {card.text || (isImage ? '（图片卡）' : '（空）')}
            </span>
            {card.noFreeSentence && (
              <span className="shrink-0 rounded bg-page px-1 py-0.5 text-[10px] leading-none text-ink-faint ring-1 ring-hairline">
                禁组句
              </span>
            )}
            {card.voice && (
              <span
                className="shrink-0 rounded bg-brand/12 px-1 py-0.5 text-[10px] leading-none text-brand-deep ring-1 ring-brand/25"
                title={`这张卡自带语音（说「${card.voice.text}」）· 抽到它就发这段音频，不再合成、不花钱`}
              >
                🎙 语音卡
              </span>
            )}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-ink-faint">
            {card.category && <span>{card.category}</span>}
            <span>
              命中 <b className={clsx(card.enabled ? 'text-brand-deep' : 'text-ink-faint')}>{card.enabled ? pct(hit) : '停用'}</b>
            </span>
            <span>池内 {pct(within)}</span>
            {card.useCount > 0 && <span>用 {card.useCount} 次</span>}
          </span>
        </span>
      </button>

      <Switch checked={card.enabled} onChange={() => st.toggle(card.id)} />
    </li>
  )
}
