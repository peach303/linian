import clsx from 'clsx'
import { useState, type CSSProperties } from 'react'
import { UNIT_LABEL, humanRange, humanSeconds, type FieldMeta, type FieldUnit } from '@/lib/rules'
import type { Range2 } from '@/types/rules'

/* ───────────────────────── 基础控件 ───────────────────────── */

export function Switch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative h-[26px] w-[46px] shrink-0 rounded-full transition-colors duration-200',
        checked ? 'bg-brand' : 'bg-ink-faint/40',
        disabled && 'opacity-40',
      )}
    >
      <span
        className={clsx(
          'absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-all duration-200',
          checked ? 'left-[23px]' : 'left-[3px]',
        )}
      />
    </button>
  )
}

export function Slider({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  disabled,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  disabled?: boolean
}) {
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ '--ln-fill': `${fill}%` } as CSSProperties}
      className={clsx('h-6 w-full', disabled && 'opacity-40')}
    />
  )
}

function NumBox({
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled,
  width = 'w-[68px]',
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  width?: string
}) {
  const clamp = (v: number) => {
    let x = Number.isNaN(v) ? 0 : v
    if (min !== undefined) x = Math.max(min, x)
    if (max !== undefined) x = Math.min(max, x)
    return x
  }
  return (
    <input
      type="number"
      inputMode="decimal"
      value={Number.isFinite(value) ? value : 0}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onChange={(e) => onChange(clamp(Number(e.target.value)))}
      className={clsx(
        width,
        'rounded-lg bg-page px-2 py-1.5 text-center text-[14px] tabular-nums text-ink outline-none ring-1 ring-hairline focus:ring-brand',
        disabled && 'opacity-40',
      )}
    />
  )
}

/** 单行「标题 + 描述」头部，控件放右侧或下方 */
export function FieldHead({
  label,
  desc,
  right,
  child,
}: {
  label: string
  desc?: string
  right?: React.ReactNode
  child?: boolean
}) {
  return (
    <div className={clsx('flex items-start gap-3', child && 'pl-3')}>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] leading-5 text-ink">{label}</div>
        {desc && <div className="mt-0.5 text-[11px] leading-4 text-ink-faint">{desc}</div>}
      </div>
      {right}
    </div>
  )
}

/* ───────────────────────── 区间输入 ───────────────────────── */

function RangeControl({
  value,
  onChange,
  min,
  max,
  step,
  unit,
  disabled,
}: {
  value: Range2
  onChange: (v: Range2) => void
  min: number
  max: number
  step: number
  unit: FieldUnit
  disabled?: boolean
}) {
  // 秒单位：允许在「秒 / 分」之间切换显示（底层始终存秒）
  const [mode, setMode] = useState<'sec' | 'min'>(unit === 'sec' && value[1] >= 600 ? 'min' : 'sec')
  const div = unit === 'sec' && mode === 'min' ? 60 : 1
  const stp = unit === 'sec' && mode === 'min' ? 1 : step

  const set = (i: 0 | 1, raw: number) => {
    const v = raw * div
    const next: Range2 = i === 0 ? [v, value[1]] : [value[0], v]
    onChange(next)
  }

  return (
    <div className={clsx('mt-2', disabled && 'pointer-events-none opacity-40')}>
      <div className="flex items-center gap-2">
        <NumBox value={+(value[0] / div).toFixed(2)} onChange={(v) => set(0, v)} min={min / div} max={max / div} step={stp} />
        <span className="text-ink-faint">—</span>
        <NumBox value={+(value[1] / div).toFixed(2)} onChange={(v) => set(1, v)} min={min / div} max={max / div} step={stp} />
        <span className="text-[12px] text-ink-sub">{unit === 'sec' ? (mode === 'min' ? '分钟' : '秒') : UNIT_LABEL[unit]}</span>

        {unit === 'sec' && (
          <div className="ml-auto flex overflow-hidden rounded-lg ring-1 ring-hairline">
            {(['sec', 'min'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={clsx(
                  'px-2 py-1 text-[11px]',
                  mode === m ? 'bg-brand text-white' : 'bg-surface text-ink-sub',
                )}
              >
                {m === 'sec' ? '秒' : '分'}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="mt-1 text-[11px] text-brand-deep">
        当前：{unit === 'sec' ? `${humanSeconds(value[0])} ~ ${humanSeconds(value[1])}` : humanRange(value, unit)}
      </div>
    </div>
  )
}

/* ───────────────────────── 自由关键词 ───────────────────────── */

/** 输入一行 / 用逗号分隔，回车加入；点 × 删除 */
function KeywordsControl({
  value,
  onChange,
  disabled,
}: {
  value: unknown
  onChange: (v: string[]) => void
  disabled?: boolean
}) {
  const [text, setText] = useState('')
  const list = (Array.isArray(value) ? value : []).map(String).filter(Boolean)
  const add = () => {
    const next = text
      .split(/[,，、;；\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (!next.length) return
    onChange([...new Set([...list, ...next])].slice(0, 50))
    setText('')
  }
  const remove = (word: string) => onChange(list.filter((x) => x !== word))
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {list.map((word) => (
          <span
            key={word}
            className="inline-flex max-w-full items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-[12px] text-brand-deep"
          >
            <span className="truncate">{word}</span>
            <button className="tap shrink-0 text-ink-faint" disabled={disabled} onClick={() => remove(word)}>
              ×
            </button>
          </span>
        ))}
        {!list.length && <span className="text-[12px] text-ink-faint">还没有关键词，下面输入一个再加</span>}
      </div>
      <div className="mt-2 flex gap-1.5">
        <input
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          placeholder="例如：最近的人工智能新闻"
          className="min-w-0 flex-1 rounded-lg bg-page px-2.5 py-1.5 text-[13px] text-ink outline-none ring-1 ring-hairline placeholder:text-ink-faint focus:ring-brand disabled:opacity-40"
        />
        <button
          className="tap shrink-0 rounded-lg bg-brand px-3 py-1.5 text-[12px] text-white disabled:opacity-40"
          disabled={disabled || !text.trim()}
          onClick={add}
        >
          加入
        </button>
      </div>
    </div>
  )
}

/* ───────────────────────── 字段分发 ───────────────────────── */

interface FieldProps {
  field: FieldMeta
  value: unknown
  onChange: (v: unknown) => void
  /** 依赖开关是否打开 */
  active: boolean
  /** 依赖的开关关着时给个说法（例如「先打开上面「撤回」」），免得看起来像坏了 */
  disabledHint?: string
}

export function RuleField({ field, value, onChange, active, disabledHint }: FieldProps) {
  const disabled = !active
  /** 被父开关连累而灰掉的行：下面补一行小字说清是「谁」没开 */
  const hint =
    disabled && disabledHint ? (
      <div className={clsx('mt-1 text-[11px] leading-4 text-ink-faint', field.child && 'pl-3')}>
        🔒 {disabledHint}
      </div>
    ) : null

  switch (field.kind) {
    /* 概率项：开关 + 滑块 */
    case 'prob': {
      const v = value as { enabled: boolean; p: number }
      return (
        <div className="py-3">
          <div className={clsx(disabled && 'opacity-40')}>
            <FieldHead
              label={field.label}
              desc={field.desc}
              child={field.child}
              right={
                <Switch checked={v.enabled} disabled={disabled} onChange={(enabled) => onChange({ ...v, enabled })} />
              }
            />
            <div
              className={clsx(
                'mt-1 flex items-center gap-3',
                field.child && 'pl-3',
                (!v.enabled || disabled) && 'opacity-40',
              )}
            >
              <Slider
                value={v.p}
                disabled={disabled || !v.enabled}
                onChange={(p) => onChange({ ...v, p })}
              />
              <span
                className="w-12 shrink-0 text-right text-[13px] tabular-nums text-brand-deep"
                title={`当前 ${(v.p * 100).toFixed(0)}%（打开这一行的开关才会按它抽签）`}
              >
                {disabled ? '—' : v.enabled ? `${(v.p * 100).toFixed(0)}%` : '已关闭'}
              </span>
            </div>
          </div>
          {hint}
        </div>
      )
    }

    /* 只有概率 */
    case 'p': {
      const p = Number(value ?? 0)
      return (
        <div className="py-3">
          <div className={clsx(disabled && 'opacity-40')}>
            <FieldHead label={field.label} desc={field.desc} child={field.child} />
            <div className={clsx('mt-1 flex items-center gap-3', field.child && 'pl-3')}>
              <Slider value={p} disabled={disabled} onChange={(x) => onChange(x)} />
              <span className="w-12 shrink-0 text-right text-[13px] tabular-nums text-brand-deep">
                {(p * 100).toFixed(0)}%
              </span>
            </div>
          </div>
          {hint}
        </div>
      )
    }

    /* 开关 */
    case 'bool': {
      const v = Boolean(value)
      return (
        <div className="py-3">
          <div className={clsx(disabled && 'opacity-40')}>
            <FieldHead
              label={field.label}
              desc={field.desc}
              child={field.child}
              right={<Switch checked={v} disabled={disabled} onChange={(x) => onChange(x)} />}
            />
          </div>
          {hint}
        </div>
      )
    }

    /* 区间 / 整数区间 */
    case 'range':
    case 'intRange':
      return (
        <div className="py-3">
          <div className={clsx(disabled && 'opacity-40')}>
            <FieldHead label={field.label} desc={field.desc} child={field.child} />
            <RangeControl
              value={(value as Range2) ?? [0, 0]}
              onChange={(v) => onChange(field.kind === 'intRange' ? [Math.round(v[0]), Math.round(v[1])] : v)}
              min={field.min ?? 0}
              max={field.max ?? 100}
              step={field.step ?? 1}
              unit={(field.unit ?? 'count') as FieldUnit}
              disabled={disabled}
            />
          </div>
          {hint}
        </div>
      )

    /* 单值整数 / 小数（stepper） */
    case 'int':
    case 'number': {
      const v = Number(value ?? 0)
      const step = field.step ?? (field.kind === 'int' ? 1 : 0.1)
      const setVal = (x: number) => {
        let y = Math.min(field.max ?? Number.MAX_SAFE_INTEGER, Math.max(field.min ?? 0, x))
        if (field.kind === 'int') y = Math.round(y)
        onChange(+(y.toFixed(3)))
      }
      return (
        <div className="py-3">
          <div className={clsx('flex items-center gap-3', disabled && 'opacity-40')}>
            <FieldHead label={field.label} desc={field.desc} child={field.child} />
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <button
                className="tap grid h-7 w-7 place-items-center rounded-lg bg-page text-[16px] text-ink-sub ring-1 ring-hairline"
                onClick={() => setVal(v - step)}
                disabled={disabled}
              >
                −
              </button>
              <NumBox value={v} onChange={setVal} min={field.min} max={field.max} step={step} width="w-[72px]" disabled={disabled} />
              {!!field.unit && <span className="text-[12px] text-ink-sub">{UNIT_LABEL[field.unit]}</span>}
              <button
                className="tap grid h-7 w-7 place-items-center rounded-lg bg-page text-[16px] text-ink-sub ring-1 ring-hairline"
                onClick={() => setVal(v + step)}
                disabled={disabled}
              >
                ＋
              </button>
            </div>
          </div>
          {hint}
        </div>
      )
    }

    /* 免打扰时段 */
    case 'timeRange': {
      const v = (value as [string, string]) ?? ['00:00', '00:00']
      return (
        <div className="py-3">
          <div className={clsx(disabled && 'opacity-40')}>
            <FieldHead label={field.label} desc={field.desc} child={field.child} />
            <div className={clsx('mt-2 flex items-center gap-2', field.child && 'pl-3')}>
              <input
                type="time"
                value={v[0]}
                disabled={disabled}
                onChange={(e) => onChange([e.target.value, v[1]])}
                className="rounded-lg bg-page px-2 py-1.5 text-[13px] tabular-nums text-ink outline-none ring-1 ring-hairline focus:ring-brand"
              />
              <span className="text-ink-faint">至</span>
              <input
                type="time"
                value={v[1]}
                disabled={disabled}
                onChange={(e) => onChange([v[0], e.target.value])}
                className="rounded-lg bg-page px-2 py-1.5 text-[13px] tabular-nums text-ink outline-none ring-1 ring-hairline focus:ring-brand"
              />
            </div>
          </div>
          {hint}
        </div>
      )
    }

    /* 自由关键词 */
    case 'keywords':
      return (
        <div className="py-3">
          <div className={clsx(disabled && 'opacity-40')}>
            <FieldHead label={field.label} desc={field.desc} child={field.child} />
            <div className={clsx('mt-2', field.child && 'pl-3')}>
              <KeywordsControl value={value} onChange={(v) => onChange(v)} disabled={disabled} />
            </div>
          </div>
          {hint}
        </div>
      )

    /* 单选下拉 */
    case 'select': {
      const v = String(value ?? '')
      const options = field.options ?? []
      return (
        <div className="py-3">
          <div className={clsx(disabled && 'opacity-40')}>
            <FieldHead label={field.label} desc={field.desc} child={field.child} />
            <select
              value={v}
              disabled={disabled}
              onChange={(e) => onChange(e.target.value)}
              className={clsx(
                'mt-2 w-full rounded-lg bg-page px-2.5 py-2 text-[13px] text-ink outline-none ring-1 ring-hairline focus:ring-brand',
                field.child && 'ml-3 w-[calc(100%-0.75rem)]',
              )}
            >
              {options.map((o) => (
                <option key={o} value={o}>
                  {field.optionLabels?.[o] ?? o}
                </option>
              ))}
            </select>
          </div>
          {hint}
        </div>
      )
    }

    /* 多选标签 */
    case 'tags': {
      const v = (value as string[]) ?? []
      const toggle = (o: string) =>
        onChange(v.includes(o) ? v.filter((x) => x !== o) : [...v, o])
      return (
        <div className="py-3">
          <div className={clsx(disabled && 'opacity-40')}>
            <FieldHead label={field.label} desc={field.desc} child={field.child} />
            <div className={clsx('mt-2 flex flex-wrap gap-2', field.child && 'pl-3')}>
              {(field.options ?? []).map((o) => (
                <button
                  key={o}
                  disabled={disabled}
                  onClick={() => toggle(o)}
                  className={clsx(
                    'tap rounded-full px-3 py-1 text-[12px] ring-1',
                    v.includes(o) ? 'bg-brand text-white ring-brand' : 'bg-surface text-ink-sub ring-hairline',
                  )}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
          {hint}
        </div>
      )
    }
  }
}
