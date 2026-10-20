import clsx from 'clsx'
import { useState, type ReactNode } from 'react'
import { Slider, Switch } from '@/components/settings/controls'
import { TYPE_META, cardHash, cardRates, makeCard, pct, typeMeta } from '@/lib/cards'
import { pickImage, pickSticker } from '@/lib/file'
import { useCardsStore } from '@/store/useCardsStore'
import { useChatStore } from '@/store/useChatStore'
import { useRulesStore } from '@/store/useRulesStore'
import type { Card, CardLibType } from '@/types/cards'

/** 单个分类候选 */
const CATEGORY_SUGGEST = ['日常', '问候', '关心', '撒娇', '晚间', '陪伴', '心情', '自定义']

/**
 * 字卡编辑 / 新建抽屉
 * - 系统预设卡：文字内容锁定（不可改内容），可改开关 / 权重 / 分类 / 禁组句
 * - 自定义、拾取卡：全字段可改，可删除
 */
export function CardEditSheet() {
  const { editing, cards, upsert, remove, closeEdit, markUsed } = useCardsStore()
  const weights = useRulesStore((s) => s.draft.chat.weights)
  const pushMessage = useChatStore((s) => s.pushMessage)

  const isNew = !editing
  const [draft, setDraft] = useState<Card>(() => editing ?? makeCard({ type: 'TEXT', source: 'CUSTOM' }))
  const [tagInput, setTagInput] = useState((editing?.tags ?? []).join(' '))
  const [err, setErr] = useState('')
  const [sent, setSent] = useState(false)

  const locked = !isNew && draft.source === 'SYSTEM'
  const meta = typeMeta(draft.type)
  /** 图片 / 表情包都靠 mediaUrl；表情包也可以只写名字 */
  const isMediaCard = draft.type === 'IMAGE' || draft.type === 'STICKER'
  const isSticker = draft.type === 'STICKER'

  /** 把草稿并入现有卡列表算出「池内占比 / 命中率」 */
  const preview = (() => {
    const others = cards.filter((c) => c.id !== draft.id)
    const merged = [...others, { ...draft, text: draft.text?.trim(), enabled: draft.enabled }]
    return cardRates(merged, weights).rate({ ...draft, text: draft.text?.trim() })
  })()

  const set = (patch: Partial<Card>) => setDraft((d) => ({ ...d, ...patch }))

  const save = () => {
    const text = draft.text?.trim()
    if (draft.type === 'IMAGE') {
      if (!draft.mediaUrl) return setErr('图片卡需要上传一张图片')
    } else if (draft.type === 'STICKER') {
      if (!draft.mediaUrl && !text) return setErr('表情包需要上传动图，或者写一个名字')
    } else if (!text) {
      return setErr('内容不能为空')
    }
    const tags = tagInput
      .split(/[\s,，、]+/)
      .map((t) => t.trim())
      .filter(Boolean)
    const next: Card = { ...draft, text, tags: tags.length ? tags : draft.category ? [draft.category] : [] }
    upsert({ ...next, hash: cardHash(next) })
    closeEdit()
  }

  const sendToChat = () => {
    const text = draft.text?.trim() ?? ''
    if (!text && !draft.mediaUrl) return setErr('内容不能为空')
    pushMessage({
      id: `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      conversationId: 'c_1',
      senderId: 'u_me',
      kind: 'CARD',
      status: 'SENT',
      text,
      payload: { cardType: draft.type, cardId: draft.id, cardSource: draft.source, url: draft.mediaUrl },
      createdAt: new Date().toISOString(),
    })
    if (!isNew) markUsed(draft.id)
    setSent(true)
    setTimeout(() => setSent(false), 1400)
  }

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end">
      <button className="flex-1 bg-black/25" onClick={closeEdit} aria-label="关闭" />

      <div className="flex max-h-[88%] flex-col overflow-hidden rounded-t-2xl bg-surface shadow-phone">
        <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
          <h3 className="text-[15px] font-medium text-ink">{isNew ? '新建字卡' : '编辑字卡'}</h3>
          {!isNew && (
            <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[10px] text-brand-deep">
              {draft.source === 'SYSTEM' ? '系统预设' : draft.source === 'PICKED' ? '拾取' : '自定义'}
            </span>
          )}
          <button className="tap ml-auto text-[13px] text-ink-faint" onClick={closeEdit}>
            ✕
          </button>
        </div>

        <div className="no-scrollbar flex-1 space-y-3.5 overflow-y-auto px-4 py-3">
          {/* 类型 */}
          <Field label="类型">
            <div className="flex flex-wrap gap-1.5">
              {TYPE_META.map((t) => (
                <button
                  key={t.key}
                  disabled={locked}
                  onClick={() => set({ type: t.key as CardLibType })}
                  className={clsx(
                    'tap rounded-full px-2.5 py-1.5 text-[12px] ring-1',
                    draft.type === t.key ? 'bg-brand text-white ring-brand' : 'bg-page text-ink-sub ring-hairline',
                    locked && 'opacity-50',
                  )}
                >
                  <span className="mr-1">{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-ink-faint">
              占比池：{meta.hint}
              {locked && ' · 预设卡类型不可改'}
            </p>
          </Field>

          {/* 内容 */}
          <Field label={isSticker ? '表情包动图' : draft.type === 'IMAGE' ? '图片' : '内容'}>
            {isMediaCard ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    disabled={locked}
                    className={clsx(
                      'tap rounded-lg bg-page px-2.5 py-1.5 text-[12px] text-ink-sub ring-1 ring-hairline',
                      locked && 'opacity-50',
                    )}
                    onClick={() =>
                      isSticker
                        ? pickSticker((url) => set({ mediaUrl: url }), { onError: setErr })
                        : pickImage((url) => set({ mediaUrl: url }), undefined, {
                            staticOnly: true,
                            onError: setErr,
                          })
                    }
                  >
                    {isSticker ? '⬆ 上传 GIF / 动图' : '⬆ 上传图片'}
                  </button>
                  {draft.mediaUrl && (
                    <button
                      disabled={locked}
                      className={clsx(
                        'tap rounded-lg bg-page px-2.5 py-1.5 text-[12px] text-ink-sub ring-1 ring-hairline',
                        locked && 'opacity-50',
                      )}
                      onClick={() => set({ mediaUrl: undefined })}
                    >
                      移除
                    </button>
                  )}
                </div>
                {draft.mediaUrl && (
                  <img
                    src={draft.mediaUrl}
                    alt=""
                    className={clsx(
                      'max-h-40 max-w-full rounded-xl ring-1 ring-hairline',
                      isSticker ? 'object-contain' : 'object-cover',
                    )}
                  />
                )}
                {isSticker && (
                  <input
                    value={draft.text ?? ''}
                    disabled={locked}
                    onChange={(e) => {
                      set({ text: e.target.value })
                      setErr('')
                    }}
                    placeholder="给这个表情包起个名字（可选）"
                    className={clsx(
                      'w-full rounded-xl bg-page px-3 py-2 text-[13px] text-ink outline-none ring-1 ring-hairline focus:ring-brand placeholder:text-ink-faint',
                      locked && 'opacity-60',
                    )}
                  />
                )}
                <p className="text-[11px] leading-relaxed text-ink-faint">
                  {isSticker
                    ? '支持 GIF / 动态 WebP / APNG，也支持普通图片；抽到这张卡时直接发图。'
                    : '图片卡只收静态图片；GIF / 动图请用「表情包」类型。'}
                </p>
              </div>
            ) : (
              <textarea
                value={draft.text ?? ''}
                disabled={locked}
                onChange={(e) => {
                  set({ text: e.target.value })
                  setErr('')
                }}
                rows={draft.type === 'TEXT' ? 3 : 2}
                placeholder={draft.type === 'KAOMOJI' ? '(๑•̀ㅂ•́)و✧' : draft.type === 'EMOJI' ? '🌙' : '写一句他会说的话…'}
                className={clsx(
                  'w-full resize-none rounded-xl bg-page px-3 py-2.5 text-[14px] leading-relaxed text-ink outline-none ring-1 ring-hairline focus:ring-brand placeholder:text-ink-faint',
                  locked && 'opacity-60',
                )}
              />
            )}
            {locked && <p className="mt-1.5 text-[11px] text-ink-faint">预设卡内容锁定，可关掉它或调权重。</p>}
            {err && <p className="mt-1.5 text-[11px] text-[#e0533d]">{err}</p>}
          </Field>

          {/* 分类 */}
          <Field label="分类">
            <input
              value={draft.category ?? ''}
              onChange={(e) => set({ category: e.target.value || undefined })}
              placeholder="日常 / 关心 / 晚间…"
              className="w-full rounded-xl bg-page px-3 py-2 text-[13px] text-ink outline-none ring-1 ring-hairline focus:ring-brand placeholder:text-ink-faint"
            />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {CATEGORY_SUGGEST.map((c) => (
                <button
                  key={c}
                  onClick={() => set({ category: c })}
                  className={clsx(
                    'tap rounded-full px-2 py-1 text-[11px] ring-1',
                    draft.category === c ? 'bg-brand/15 text-brand-deep ring-brand' : 'bg-page text-ink-sub ring-hairline',
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </Field>

          {/* 权重 */}
          <Field label="卡内权重">
            <div className="rounded-xl bg-page px-3 py-2.5">
              <div className="flex items-center gap-3">
                <Slider
                  value={draft.weight}
                  min={0}
                  max={3}
                  step={0.05}
                  onChange={(weight) => set({ weight })}
                />
                <span className="w-10 shrink-0 text-right text-[12px] tabular-nums text-ink-sub">
                  {draft.weight.toFixed(2)}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-faint">
                <span>
                  池内占比 <b className="text-ink-sub">{pct(preview.within)}</b>
                </span>
                <span>
                  综合命中率 <b className="text-brand-deep">{draft.enabled ? pct(preview.hit) : '已停用'}</b>
                </span>
                <span>
                  （{meta.label}池 占比 {pct(preview.poolRatio)}）
                </span>
              </div>
            </div>
          </Field>

          {/* 开关 */}
          <div className="flex items-center gap-3 rounded-xl bg-page px-3 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] text-ink">启用这张卡</span>
              <span className="block text-[11px] text-ink-faint">停用后不参与抽签，权重保留</span>
            </span>
            <Switch checked={draft.enabled} onChange={(enabled) => set({ enabled })} />
          </div>

          <div className="flex items-center gap-3 rounded-xl bg-page px-3 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] text-ink">禁止参与「自由造句」</span>
              <span className="block text-[11px] text-ink-faint">防止梦角把这句拆开重组成别的话</span>
            </span>
            <Switch
              checked={Boolean(draft.noFreeSentence)}
              onChange={(v) => set({ noFreeSentence: v })}
            />
          </div>

          {/* 标签 */}
          <Field label="标签">
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="空格分隔，如：温柔 晚间"
              className="w-full rounded-xl bg-page px-3 py-2 text-[13px] text-ink outline-none ring-1 ring-hairline focus:ring-brand placeholder:text-ink-faint"
            />
          </Field>

          {!isNew && (
            <p className="text-[11px] text-ink-faint">
              使用 {draft.useCount} 次
              {draft.lastUsedAt ? ` · 最近 ${new Date(draft.lastUsedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}
            </p>
          )}
        </div>

        {/* 底部操作 */}
        <div className="flex shrink-0 items-center gap-2 border-t border-hairline px-4 py-2.5 pb-4">
          {!isNew && (
            <button
              className="tap rounded-lg bg-page px-3 py-1.5 text-[13px] text-[#e0533d] ring-1 ring-hairline"
              onClick={() => {
                remove(draft.id)
                closeEdit()
              }}
            >
              删除
            </button>
          )}
          <button
            className="tap rounded-lg bg-page px-3 py-1.5 text-[13px] text-ink-sub ring-1 ring-hairline"
            onClick={sendToChat}
          >
            {sent ? '已发送 ✓' : '试发到聊天'}
          </button>
          <span className="flex-1" />
          <button className="tap rounded-lg px-3 py-1.5 text-[13px] text-ink-sub" onClick={closeEdit}>
            取消
          </button>
          <button className="tap rounded-lg bg-brand px-4 py-1.5 text-[13px] text-white" onClick={save}>
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-1.5 text-[12px] text-ink-sub">{label}</div>
      {children}
    </section>
  )
}
