import clsx from 'clsx'
import { useRef, useState } from 'react'
import { Switch } from '@/components/settings/controls'
import { shrinkImageDataUrl } from '@/lib/file'
import { DUPE_THRESHOLD, TYPE_META, cardHash, guessCategory, normText, parseCardLines, similarity } from '@/lib/cards'
import { useCardsStore } from '@/store/useCardsStore'
import type { Card, CardLibType, ImportRow } from '@/types/cards'

const SAMPLE = `晚安，做个好梦
(๑•̀ㅂ•́)و✧
今晚的月亮很好看
🫧`

interface MediaRow {
  name: string
  url: string
  bytes: number
  checked: boolean
  animated?: boolean
  exact?: Card
}

const MEDIA_TYPES: CardLibType[] = ['STICKER', 'IMAGE']
const MAX_MEDIA_BYTES = 10 * 1024 * 1024

const readAsDataUrl = (f: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('读不了这个文件'))
    r.readAsDataURL(f)
  })

const animated = (f: File) =>
  f.type === 'image/gif' || f.type === 'image/apng' || /\.(gif|apng)$/i.test(f.name)

/**
 * 批量导入 + 查重预览
 *   · 文字：一行一张卡；支持「1. 内容」「- 内容」「"内容"」；# 开头是注释
 *   · 图片 / 表情包：一次选多张，全部进字卡库，**不会自动发到聊天**
 *   查重：指纹相同 → 重复；相似度 ≥ 0.85 → 疑似重复（可自定义阈值）
 */
export function ImportSheet() {
  const { cards, setImportOpen, addMany } = useCardsStore()
  const [mode, setMode] = useState<'text' | 'media'>('text')
  const [raw, setRaw] = useState('')
  const [type, setType] = useState<CardLibType>('TEXT')
  const [category, setCategory] = useState('自定义')
  const [threshold, setThreshold] = useState(DUPE_THRESHOLD)
  const [rows, setRows] = useState<ImportRow[] | null>(null)
  const [autoSkip, setAutoSkip] = useState(true)
  const [mediaRows, setMediaRows] = useState<MediaRow[]>([])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

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
  const checkedMedia = mediaRows.filter((r) => r.checked)
  const importableMedia = checkedMedia.filter((r) => !(type === 'IMAGE' && r.animated))
  const dupCount = rows?.filter((r) => r.exact).length ?? 0
  const nearCount = rows?.filter((r) => !r.exact && r.near).length ?? 0

  const doImport = () => {
    if (mode === 'text') {
      addMany(
        checked.map((r) => ({
          text: r.text,
          type: r.type,
          category: category.trim() || guessCategory(r.text),
        })),
      )
    } else {
      addMany(
        importableMedia.map((r) => ({
          text: r.name,
          type,
          category:
            category.trim() ||
            (type === 'STICKER' ? '表情包' : '图片'),
          mediaUrl: r.url,
        })),
      )
    }
    setImportOpen(false)
  }

  async function pickMedia(files: FileList | null) {
    const list = Array.from(files ?? [])
    if (!list.length) return
    setBusy(true)
    setNote('')
    const existing = new Map(cards.map((c) => [c.hash, c]))
    const next: MediaRow[] = []
    const skipped: string[] = []

    for (const f of list) {
      if (!f.type.startsWith('image/')) {
        skipped.push(`${f.name}（不是图片）`)
        continue
      }
      if (f.size > MAX_MEDIA_BYTES) {
        skipped.push(`${f.name}（超过 ${MAX_MEDIA_BYTES / 1024 / 1024}MB）`)
        continue
      }
      if (type === 'IMAGE' && animated(f)) {
        skipped.push(`${f.name}（图片卡只收静态图，动图请选「表情包」）`)
        continue
      }
      try {
        let url = await readAsDataUrl(f)
        // 图片卡会跟着字卡库一起存，压小一点；表情包保留动图原始数据
        if (type === 'IMAGE') url = await shrinkImageDataUrl(url, 1500, 0.85)
        const name = f.name.replace(/\.[a-z0-9]{2,5}$/i, '').trim() || '图片'
        const hash = cardHash({ text: name, mediaUrl: url })
        const exact = existing.get(hash)
        // 同一批中的重复也标出来
        const inBatch = next.some((r) => cardHash({ text: r.name, mediaUrl: r.url }) === hash)
        next.push({
          name,
          url,
          bytes: f.size,
          checked: !exact && !inBatch,
          animated: animated(f),
          exact,
        })
      } catch {
        skipped.push(`${f.name}（读不了）`)
      }
    }

    setMediaRows((prev) => [...prev, ...next])
    setBusy(false)
    if (skipped.length) setNote(`跳过了 ${skipped.length} 个：${skipped.slice(0, 3).join('、')}`)
    else if (next.length) setNote(`已读入 ${next.length} 张，点下面「导入」才会进字库。`)
  }

  const totalBottom = mode === 'text' ? checked.length : importableMedia.length

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
          {/* 模式 */}
          <div className="flex gap-1.5">
            {(
              [
                ['text', '文字 / 颜文字 / Emoji'],
                ['media', '图片 / 表情包'],
              ] as ['text' | 'media', string][]
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => {
                  setMode(k)
                  setNote('')
                  if (k === 'media') {
                    if (!MEDIA_TYPES.includes(type)) setType('STICKER')
                    if (!category.trim() || category === '自定义') setCategory('表情包')
                  }
                  if (k === 'text' && type === 'IMAGE') setType('TEXT')
                }}
                className={clsx(
                  'tap flex-1 rounded-lg py-2 text-[12px] ring-1',
                  mode === k ? 'bg-brand text-white ring-brand' : 'bg-page text-ink-sub ring-hairline',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'text' ? (
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
          ) : (
            <section className="space-y-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.gif,.apng"
                multiple
                className="hidden"
                onChange={(e) => void pickMedia(e.target.files)}
              />
              <button
                className="tap w-full rounded-xl border border-dashed border-brand bg-page py-6 text-[13px] text-brand-deep"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                {busy ? '正在读图…' : '点这里一次选多张（可多选）'}
              </button>
              <p className="text-[11px] leading-relaxed text-ink-faint">
                {type === 'STICKER'
                  ? '表情包支持 GIF / APNG / 动态 WebP，会保留动图。'
                  : '图片卡只收静态图；GIF / 动图请切成「表情包」。'}
                导入后只进字卡库，<b className="font-medium text-ink">不会自动发到聊天</b>；单个文件最大{' '}
                {MAX_MEDIA_BYTES / 1024 / 1024}MB。
              </p>

              {mediaRows.length > 0 && (
                <ul className="grid grid-cols-3 gap-2">
                  {mediaRows.map((r, i) => (
                    <li key={`${r.name}-${i}`} className="relative overflow-hidden rounded-xl bg-page ring-1 ring-hairline">
                      <button
                        className="tap block w-full"
                        onClick={() =>
                          setMediaRows(mediaRows.map((x, j) => (j === i ? { ...x, checked: !x.checked } : x)))
                        }
                      >
                        <img src={r.url} alt={r.name} className="h-24 w-full object-contain" />
                        <span className="block truncate px-1.5 py-1 text-[10px] text-ink-sub">{r.name}</span>
                      </button>
                      <span
                        className={clsx(
                          'absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full border text-[9px]',
                          r.checked ? 'border-brand bg-brand text-white' : 'border-white/80 bg-black/35 text-transparent',
                        )}
                      >
                        ✓
                      </span>
                      {r.exact && (
                        <span className="absolute bottom-7 left-1 rounded bg-black/55 px-1 py-0.5 text-[9px] text-white">
                          已有
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* 批量类型 / 分类 */}
          <section>
            <div className="mb-1.5 text-[12px] text-ink-sub">导入为</div>
            <div className="flex flex-wrap gap-1.5">
              {TYPE_META.filter((t) => mode === 'text' || MEDIA_TYPES.includes(t.key as CardLibType)).map((t) => (
                <button
                  key={t.key}
                  onClick={() => {
                    setType(t.key as CardLibType)
                    if (!category.trim() || category === '自定义') {
                      setCategory(t.key === 'STICKER' ? '表情包' : t.key === 'IMAGE' ? '图片' : '自定义')
                    }
                    if (t.key === 'IMAGE') {
                      const n = mediaRows.filter((r) => r.animated).length
                      if (n) setNote(`有 ${n} 个动图；图片卡只收静态图，导入时会跳过它们。`)
                    }
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
            <div className="mt-2 flex items-center gap-2">
              <span className="shrink-0 text-[12px] text-ink-sub">分组</span>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder={mode === 'media' ? '如：表情包 / 日常图片' : '留空则自动猜'}
                className="min-w-0 flex-1 rounded-xl bg-page px-3 py-2 text-[13px] text-ink outline-none ring-1 ring-hairline focus:ring-brand placeholder:text-ink-faint"
              />
            </div>
          </section>

          {/* 查重设置（文字） */}
          {mode === 'text' && (
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
          )}

          {/* 解析结果 */}
          {mode === 'text' && rows && (
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

          {note && <p className="text-[11px] leading-relaxed text-ink-sub">{note}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-hairline px-4 py-2.5 pb-4">
          {mode === 'text' && rows ? (
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
          ) : mode === 'media' && mediaRows.length ? (
            <button
              className="tap rounded-lg bg-page px-3 py-1.5 text-[13px] text-ink-sub ring-1 ring-hairline"
              onClick={() => setMediaRows(mediaRows.map((r) => ({ ...r, checked: true })))}
            >
              全选
            </button>
          ) : null}
          <span className="flex-1" />
          {mode === 'text' ? (
            rows ? (
              <button
                className={clsx(
                  'tap rounded-lg px-4 py-1.5 text-[13px] text-white',
                  checked.length ? 'bg-brand' : 'bg-brand/40',
                )}
                disabled={!checked.length}
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
            )
          ) : (
            <button
              className={clsx(
                'tap rounded-lg px-4 py-1.5 text-[13px] text-white',
                totalBottom ? 'bg-brand' : 'bg-brand/40',
              )}
              disabled={!totalBottom}
              onClick={doImport}
            >
              导入 {totalBottom} 张
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
