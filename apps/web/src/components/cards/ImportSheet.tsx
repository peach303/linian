import clsx from 'clsx'
import { useState } from 'react'
import { Switch } from '@/components/settings/controls'
import { DUPE_THRESHOLD, TYPE_META, cardHash, guessCategory, normText, parseCardLines, similarity } from '@/lib/cards'
import { useCardsStore } from '@/store/useCardsStore'
import type { CardLibType, ImportRow } from '@/types/cards'

const SAMPLE = `晚安，做个好梦
(๑•̀ㅂ•́)و✧
今晚的月亮很好看
🫧`

/**
 * 批量导入 + 查重预览
 *   一行一张卡；支持「1. 内容」「- 内容」「"内容"」等写法；# 开头是注释
 *   查重：指纹相同 → 重复；相似度 ≥ 0.85 → 疑似重复（可自定义阈值）
 */
export function ImportSheet() {
  const { cards, setImportOpen, addMany } = useCardsStore()
  const [raw, setRaw] = useState('')
  const [type, setType] = useState<CardLibType>('TEXT')
  const [category, setCategory] = useState('自定义')
  const [threshold, setThreshold] = useState(DUPE_THRESHOLD)
  const [rows, setRows] = useState<ImportRow[] | null>(null)
  const [autoSkip, setAutoSkip] = useState(true)

  const parse = () => {
    const lines = parseCardLines(raw)
    const existingHash = new Map(cards.map((c) => [c.hash, c]))
    const normed = cards.map((c) => ({ label: c.text ?? '（图片卡）', n: normText(c.text ?? '') }))
    /* 同一批里前面已经出现过的行：也要互相查重，否则粘贴两份重复内容会漏判 */
    const seen: { label: string; n: string }[] = []

    const next: ImportRow[] = lines.map((text) => {
      const probe = { text, mediaUrl: undefined }
      const exact = existingHash.get(cardHash(probe))
      let near: ImportRow['near']
      const n = normText(text)
      if (!exact && n) {
        const pool = [
          ...normed.map((e) => ({ ...e, fromBatch: false })),
          ...seen.map((e) => ({ ...e, fromBatch: true })),
        ]
        for (const e of pool) {
          if (!e.n) continue
          const score = similarity(n, e.n)
          if (score >= threshold && (!near || score > near.score)) {
            near = { label: e.label, score, fromBatch: e.fromBatch }
          }
        }
      }
      seen.push({ label: text, n })
      return { raw: text, text, type, exact, near, checked: !autoSkip || !(exact || near) }
    })
    setRows(next)
  }

  const checked = rows?.filter((r) => r.checked) ?? []
  const dupCount = rows?.filter((r) => r.exact).length ?? 0
  const nearCount = rows?.filter((r) => !r.exact && r.near).length ?? 0

  const doImport = () => {
    addMany(
      checked.map((r) => ({
        text: r.text,
        type: r.type,
        category: category.trim() || guessCategory(r.text),
      })),
    )
    setImportOpen(false)
  }

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end">
      <button className="flex-1 bg-black/25" onClick={() => setImportOpen(false)} aria-label="关闭" />

      <div className="flex max-h-[88%] flex-col overflow-hidden rounded-t-2xl bg-surface shadow-phone">
        <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
          <h3 className="text-[15px] font-medium text-ink">批量导入字卡</h3>
          <button className="tap ml-auto text-[13px] text-ink-faint" onClick={() => setImportOpen(false)}>
            ✕
          </button>
        </div>

        <div className="no-scrollbar flex-1 space-y-3.5 overflow-y-auto px-4 py-3">
          {/* 输入 */}
          <section>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-[12px] text-ink-sub">一行一张卡</span>
              <button className="tap ml-auto text-[11px] text-brand-deep" onClick={() => setRaw(SAMPLE)}>
                填入示例
              </button>
              <button className="tap text-[11px] text-ink-faint" onClick={() => setRaw('')}>
                清空
              </button>
            </div>
            <textarea
              value={raw}
              onChange={(e) => {
                setRaw(e.target.value)
                setRows(null)
              }}
              rows={5}
              placeholder={'晚安，做个好梦\n(๑•̀ㅂ•́)و✧\n🌙'}
              className="w-full resize-none rounded-xl bg-page px-3 py-2.5 text-[13px] leading-relaxed text-ink outline-none ring-1 ring-hairline focus:ring-brand placeholder:text-ink-faint"
            />
            <p className="mt-1.5 text-[11px] text-ink-faint">
              支持「1. 内容」「- 内容」「"内容"」写法；<code>#</code> 开头为注释忽略。
            </p>
          </section>

          {/* 批量类型 / 分类 */}
          <section>
            <div className="mb-1.5 text-[12px] text-ink-sub">导入为</div>
            <div className="flex flex-wrap gap-1.5">
              {TYPE_META.map((t) => (
                <button
                  key={t.key}
                  onClick={() => {
                    setType(t.key as CardLibType)
                    setRows(null)
                  }}
                  className={clsx(
                    'tap rounded-full px-2.5 py-1.5 text-[12px] ring-1',
                    type === t.key ? 'bg-brand text-white ring-brand' : 'bg-page text-ink-sub ring-hairline',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {type === 'IMAGE' && (
              <p className="mt-1.5 text-[11px] text-[#e0533d]">图片卡需要逐张上传，批量导入仅支持文字类。</p>
            )}
            <div className="mt-2 flex items-center gap-2">
              <span className="shrink-0 text-[12px] text-ink-sub">分类</span>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="留空则自动猜"
                className="min-w-0 flex-1 rounded-xl bg-page px-3 py-2 text-[13px] text-ink outline-none ring-1 ring-hairline focus:ring-brand placeholder:text-ink-faint"
              />
            </div>
          </section>

          {/* 查重设置 */}
          <section className="rounded-xl bg-page px-3 py-2.5">
            <div className="flex items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] text-ink">自动跳过重复</span>
                <span className="block text-[11px] text-ink-faint">勾选框可在预览里逐条改</span>
              </span>
              <Switch
                checked={autoSkip}
                onChange={(v) => {
                  setAutoSkip(v)
                  setRows(null)
                }}
              />
            </div>
            <div className="mt-2.5">
              <div className="mb-1 flex items-center justify-between text-[12px] text-ink">
                <span>疑似重复阈值</span>
                <span className="tabular-nums text-ink-sub">{(threshold * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={1}
                step={0.05}
                value={threshold}
                onChange={(e) => {
                  setThreshold(Number(e.target.value))
                  setRows(null)
                }}
                className="h-6 w-full"
              />
            </div>
          </section>

          {/* 解析结果 */}
          {rows && (
            <section className="space-y-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                <span className="text-ink">
                  共 <b>{rows.length}</b> 行
                </span>
                <span className="text-ink-sub">
                  新增 <b className="text-brand-deep">{rows.length - dupCount - nearCount}</b>
                </span>
                <span className="text-ink-sub">
                  重复 <b>{dupCount}</b>
                </span>
                <span className="text-ink-sub">
                  疑似 <b>{nearCount}</b>
                </span>
              </div>

              <ul className="space-y-1.5">
                {rows.map((r, i) => (
                  <li
                    key={i}
                    className={clsx(
                      'flex items-start gap-2 rounded-xl px-2.5 py-2 ring-1',
                      r.exact ? 'bg-page/60 ring-hairline' : r.near ? 'bg-[#fff7e6] ring-[#f0dfae]' : 'bg-page ring-hairline',
                    )}
                  >
                    <button
                      className={clsx(
                        'mt-0.5 grid shrink-0 place-items-center rounded border text-[10px] leading-none',
                        r.checked ? 'border-brand bg-brand text-white' : 'border-hairline bg-surface text-transparent',
                      )}
                      style={{ height: 18, width: 18 }}
                      onClick={() => setRows(rows.map((x, j) => (j === i ? { ...x, checked: !x.checked } : x)))}
                    >
                      ✓
                    </button>
                    <span className="min-w-0 flex-1">
                      <span className="block break-all text-[13px] text-ink">{r.text}</span>
                      {r.exact ? (
                        <span className="block text-[11px] text-ink-faint">已存在相同内容 · 跳过</span>
                      ) : r.near ? (
                        <span className="block text-[11px] text-[#b8860b]">
                          疑似与{r.near.fromBatch ? '本批「' : '已有卡「'}
                          {r.near.label.slice(0, 14)}」重复（{(r.near.score * 100).toFixed(0)}%）
                        </span>
                      ) : (
                        <span className="block text-[11px] text-ink-faint">新增</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-hairline px-4 py-2.5 pb-4">
          {rows ? (
            <>
              <button
                className="tap rounded-lg bg-page px-3 py-1.5 text-[13px] text-ink-sub ring-1 ring-hairline"
                onClick={() => setRows(rows.map((r) => ({ ...r, checked: true })))}
              >
                全选
              </button>
              <button
                className="tap rounded-lg bg-page px-3 py-1.5 text-[13px] text-ink-sub ring-1 ring-hairline"
                onClick={() => setRows(rows.map((r) => ({ ...r, checked: !(r.exact || r.near) })))}
              >
                仅新增
              </button>
            </>
          ) : null}
          <span className="flex-1" />
          {rows ? (
            <button
              className={clsx(
                'tap rounded-lg px-4 py-1.5 text-[13px] text-white',
                checked.length && type !== 'IMAGE' ? 'bg-brand' : 'bg-brand/40',
              )}
              disabled={!checked.length || type === 'IMAGE'}
              onClick={doImport}
            >
              导入 {checked.length} 张
            </button>
          ) : (
            <button
              className={clsx(
                'tap rounded-lg px-4 py-1.5 text-[13px] text-white',
                parseCardLines(raw).length ? 'bg-brand' : 'bg-brand/40',
              )}
              disabled={!parseCardLines(raw).length}
              onClick={parse}
            >
              解析并查重
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
