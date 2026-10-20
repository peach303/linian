import { useState } from 'react'
import clsx from 'clsx'
import { NavBar } from '@/components/common/NavBar'
import { nid } from '@/lib/ids'
import { pickImage } from '@/lib/file'
import { useAppStore } from '@/store/useAppStore'
import { useChatStore } from '@/store/useChatStore'
import type { GiftItem, GiftPayload } from '@/types'

const fmt = (iso: string) => {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const emptyGift = (): GiftItem => ({ id: nid('g'), name: '', price: 20, icon: '🎁' })

/**
 * 礼物柜（对应 DB 的 `gifts` / `gift_orders`）
 *
 * 预设几件，其余自己加：名字 / 定价 / emoji / 图片 / 默认卡片文案。
 * 送出去的记录不另存表 —— 就是聊天里的 GIFT 消息，所以柜子与聊天永远一致。
 */
export function GiftCabinetScreen() {
  const gifts = useAppStore((s) => s.gifts)
  const upsertGift = useAppStore((s) => s.upsertGift)
  const removeGift = useAppStore((s) => s.removeGift)
  const resetGifts = useAppStore((s) => s.resetGifts)

  const messages = useChatStore((s) => s.messages)
  const conversation = useChatStore((s) => s.conversation)
  const [editing, setEditing] = useState<GiftItem | null>(null)

  const meId = conversation?.me.id ?? 'u_me'
  const sent = messages.filter((m) => m.kind === 'GIFT' && m.senderId === meId)
  const got = messages.filter((m) => m.kind === 'GIFT' && m.senderId !== meId)
  const spent = sent.reduce((a, m) => a + Number((m.payload as GiftPayload | undefined)?.price ?? 0), 0)

  return (
    <div className="relative flex h-full flex-col bg-page">
      <NavBar
        title="礼物柜"
        right={
          <button className="tap px-2 text-[13px] text-ink-sub" onClick={resetGifts}>
            恢复默认
          </button>
        }
      />

      <div className="no-scrollbar flex-1 overflow-y-auto pb-6">
        {/* 统计 */}
        <div className="mx-3 mt-3 rounded-xl bg-surface p-3 shadow-card">
          <div className="flex items-baseline gap-3">
            <span className="text-[13px] text-ink">
              送出 <b className="text-[16px] text-brand-deep">{sent.length}</b> 件
            </span>
            <span className="text-[13px] text-ink">
              收到 <b className="text-[16px] text-brand-deep">{got.length}</b> 件
            </span>
            <span className="ml-auto text-[12px] text-ink-faint">累计 ¥{spent.toFixed(2)}</span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">
            送出去的每件礼物都会进聊天变成一张卡；他会不会收下、要不要回礼，由「概率调节引擎 → 递东西 → 礼物」决定。
          </p>
        </div>

        {/* 礼物柜 */}
        <Section title="我的礼物柜" hint={`${gifts.length} 件`}>
          <div className="grid grid-cols-3 gap-2">
            {gifts.map((g) => (
              <button
                key={g.id}
                onClick={() => setEditing({ ...g })}
                className="tap grid h-[86px] place-items-center gap-0.5 rounded-lg bg-surface px-1 shadow-card"
              >
                {g.imageUrl ? (
                  <img src={g.imageUrl} alt="" className="h-9 w-9 rounded-md object-cover" />
                ) : (
                  <span className="text-[24px] leading-none">{g.icon || '🎁'}</span>
                )}
                <span className="max-w-full truncate text-[12px] text-ink">{g.name || '未命名'}</span>
                <span className="text-[10px] text-ink-faint">¥ {g.price}</span>
              </button>
            ))}
            <button
              onClick={() => setEditing(emptyGift())}
              className="tap grid h-[86px] place-items-center rounded-lg border border-dashed border-brand-soft bg-page text-[12px] text-brand-deep"
            >
              ＋ 添加礼物
            </button>
          </div>
        </Section>

        {/* 送出记录 */}
        <Section title="送出去过" hint={sent.length ? `${sent.length} 件` : '还没有'}>
          {sent.length === 0 ? (
            <p className="text-[12px] text-ink-faint">在聊天里点「＋ → 礼物柜」挑一件送给他。</p>
          ) : (
            <div className="overflow-hidden rounded-xl bg-surface shadow-card">
              {[...sent].reverse().map((m) => {
                const p = m.payload as GiftPayload | undefined
                const acc = p?.accepted
                return (
                  <div key={m.id} className="flex items-center gap-2 border-b border-hairline px-3 py-2 last:border-0">
                    <span className="text-[20px] leading-none">{p?.icon || '🎁'}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] text-ink">{p?.name ?? '礼物'}</div>
                      <div className="text-[11px] text-ink-faint">{fmt(m.createdAt)}</div>
                    </div>
                    <span
                      className={clsx(
                        'shrink-0 rounded-full px-2 py-0.5 text-[10px]',
                        acc ? 'bg-brand-soft/70 text-brand-deep' : 'bg-hairline/70 text-ink-faint',
                      )}
                    >
                      {acc ? '他收下了' : '等他拆开'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </Section>

        {/* 收到的 */}
        {got.length > 0 && (
          <Section title="他送我的" hint={`${got.length} 件`}>
            <div className="overflow-hidden rounded-xl bg-surface shadow-card">
              {[...got].reverse().map((m) => {
                const p = m.payload as GiftPayload | undefined
                return (
                  <div key={m.id} className="flex items-center gap-2 border-b border-hairline px-3 py-2 last:border-0">
                    <span className="text-[20px] leading-none">{p?.icon || '🎁'}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] text-ink">{p?.name ?? '礼物'}</div>
                      {p?.note && <div className="truncate text-[11px] text-ink-sub">“{p.note}”</div>}
                    </div>
                    <span className="shrink-0 text-[11px] text-ink-faint">{fmt(m.createdAt)}</span>
                  </div>
                )
              })}
            </div>
          </Section>
        )}

        <p className="px-4 pt-4 text-[11px] leading-relaxed text-ink-faint">
          图片存在本机（同步后端时以 base64 传输）；预设礼物可以改价，也可以删掉。
        </p>
      </div>

      {editing && (
        <GiftEditSheet
          value={editing}
          isNew={!gifts.some((g) => g.id === editing.id)}
          onSave={(g) => {
            upsertGift(g)
            setEditing(null)
          }}
          onDelete={(id) => {
            removeGift(id)
            setEditing(null)
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 px-3">
      <div className="mb-2 flex items-baseline px-1">
        <span className="text-[13px] font-medium text-ink">{title}</span>
        {hint && <span className="ml-auto text-[11px] text-ink-faint">{hint}</span>}
      </div>
      {children}
    </section>
  )
}

/** 编辑 / 新增一件礼物 */
function GiftEditSheet({
  value,
  isNew,
  onSave,
  onDelete,
  onClose,
}: {
  value: GiftItem
  isNew: boolean
  onSave: (g: GiftItem) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<GiftItem>({ ...value })
  const valid = draft.name.trim().length > 0 && Number(draft.price) >= 0

  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end">
      <button className="flex-1 bg-black/25" onClick={onClose} aria-label="关闭" />
      <div className="rounded-t-2xl bg-page px-4 pb-5 pt-3 shadow-phone">
        <div className="mb-2 flex items-center">
          <span className="text-[13px] text-ink-sub">{isNew ? '添加礼物' : '编辑礼物'}</span>
          <button className="tap ml-auto text-[13px] text-ink-faint" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="col-span-2 flex items-center gap-3 rounded-lg bg-surface px-3 py-2 ring-1 ring-hairline">
            <span className="w-12 shrink-0 text-[13px] text-ink-sub">名字</span>
            <input
              autoFocus
              value={draft.name}
              maxLength={12}
              placeholder="例如：小夜灯"
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint"
            />
          </label>

          <label className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 ring-1 ring-hairline">
            <span className="shrink-0 text-[13px] text-ink-sub">¥</span>
            <input
              value={String(draft.price)}
              inputMode="decimal"
              onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) || 0 })}
              className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none"
            />
          </label>

          <label className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 ring-1 ring-hairline">
            <span className="shrink-0 text-[13px] text-ink-sub">图标</span>
            <input
              value={draft.icon}
              maxLength={4}
              placeholder="🎁"
              onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
              className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint"
            />
          </label>

          <label className="col-span-2 flex items-center gap-3 rounded-lg bg-surface px-3 py-2 ring-1 ring-hairline">
            <span className="w-12 shrink-0 text-[13px] text-ink-sub">卡片文案</span>
            <input
              value={draft.note ?? ''}
              maxLength={30}
              placeholder="送出时卡片上写的那句话"
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint"
            />
          </label>
        </div>

        <div className="mt-2 flex items-center gap-2">
          {draft.imageUrl ? (
            <img src={draft.imageUrl} alt="" className="h-10 w-10 rounded-lg object-cover ring-1 ring-hairline" />
          ) : (
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-surface text-[18px] ring-1 ring-hairline">
              {draft.icon || '🎁'}
            </div>
          )}
          <button
            className="tap rounded-md border border-brand-soft px-2.5 py-1.5 text-[12px] text-brand-deep"
            onClick={() => pickImage((dataUrl) => setDraft((d) => ({ ...d, imageUrl: dataUrl })))}
          >
            选本地图片
          </button>
          {draft.imageUrl && (
            <button
              className="tap text-[12px] text-ink-faint"
              onClick={() => setDraft((d) => ({ ...d, imageUrl: undefined }))}
            >
              清除图片
            </button>
          )}
          <span className="ml-auto text-[11px] text-ink-faint">图片存本机</span>
        </div>

        <div className="mt-3 flex gap-2">
          {!isNew && (
            <button
              className="tap rounded-lg bg-surface px-3 py-2.5 text-[14px] text-ink-faint ring-1 ring-hairline"
              onClick={() => onDelete(draft.id)}
            >
              删除
            </button>
          )}
          <button
            className="tap flex-1 rounded-lg bg-surface py-2.5 text-[14px] text-ink-sub ring-1 ring-hairline"
            onClick={onClose}
          >
            取消
          </button>
          <button
            disabled={!valid}
            className={clsx('tap flex-[2] rounded-lg bg-brand py-2.5 text-[14px] text-white', !valid && 'opacity-40')}
            onClick={() => onSave({ ...draft, name: draft.name.trim() })}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
