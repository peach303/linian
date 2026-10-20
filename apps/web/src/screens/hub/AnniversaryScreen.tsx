import { useState } from 'react'
import { NavBar } from '@/components/common/NavBar'
import { Switch } from '@/components/settings/controls'
import { pickImage } from '@/lib/file'
import { nid } from '@/lib/ids'
import { daysSince, daysUntil, formatDate } from '@/lib/time'
import { useAppStore } from '@/store/useAppStore'
import type { Anniversary } from '@/types'

/**
 * 纪念日（功能 → 纪念日 / 主界面那张卡）
 *
 * 想解决的是之前「功能里这个按钮点不动」：现在可以真的增删改。
 *  · 日期、名字、图标、卡片底部小字
 *  · 是否每年重复（生日那种）、是否显示在主界面（第一张就是主卡）
 *  · 主界面那张卡的背景图（本机图片，跟着 state 同步）
 *
 * 天数都是按日期现算的，不是写死的数字。
 */
export function AnniversaryScreen() {
  const { anniversaries, upsertAnniversary, removeAnniversary } = useAppStore()
  const [draft, setDraft] = useState<Anniversary | null>(null)

  const startNew = () => {
    setDraft({
      id: nid('a'),
      title: '新的纪念日',
      date: new Date().toISOString().slice(0, 10),
      recurring: true,
      showOnHome: anniversaries.every((a) => !a.showOnHome),
      icon: '💙',
      caption: '相遇',
    })
  }

  const save = () => {
    if (!draft) return
    const title = draft.title.trim() || '纪念日'
    upsertAnniversary({ ...draft, title })
    setDraft(null)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-page">
      <NavBar
        title="纪念日"
        right={
          <button className="tap px-2 py-1 text-[13px] text-brand-deep" onClick={startNew}>
            ＋ 新增
          </button>
        }
      />

      <div className="no-scrollbar flex-1 space-y-3 overflow-y-auto px-3 py-3">
        <p className="rounded-xl bg-white/70 px-3 py-2 text-[12px] leading-relaxed text-ink-sub shadow-card">
          主界面右边那张卡显示的是「显示在主界面」里的第一张。点它就能进到这里。
          背景图会铺在那张卡上，换设备也跟着走（图存在设置里）。
        </p>

        {/* ── 编辑器 ── */}
        {draft && (
          <section className="rounded-2xl bg-surface p-3 shadow-card ring-1 ring-brand-soft">
            <div className="mb-2 flex items-center">
              <span className="text-[14px] font-medium text-ink">{anniversaries.some((a) => a.id === draft.id) ? '编辑' : '新增'}纪念日</span>
              <button className="tap ml-auto text-[12px] text-ink-faint" onClick={() => setDraft(null)}>
                取消
              </button>
            </div>

            <label className="block text-[11px] text-ink-faint">名字</label>
            <input
              className="mt-1 w-full rounded-lg bg-page px-2.5 py-2 text-[13px] text-ink outline-none ring-1 ring-hairline focus:ring-brand"
              value={draft.title}
              placeholder="例如：在一起的日子"
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />

            <div className="mt-2 flex gap-2">
              <div className="min-w-0 flex-1">
                <label className="block text-[11px] text-ink-faint">日期</label>
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg bg-page px-2 py-2 text-[13px] tabular-nums text-ink outline-none ring-1 ring-hairline focus:ring-brand"
                  value={draft.date.slice(0, 10)}
                  onChange={(e) => e.target.value && setDraft({ ...draft, date: e.target.value })}
                />
              </div>
              <div className="w-[76px] shrink-0">
                <label className="block text-[11px] text-ink-faint">图标</label>
                <input
                  className="mt-1 w-full rounded-lg bg-page px-2 py-2 text-center text-[15px] outline-none ring-1 ring-hairline focus:ring-brand"
                  value={draft.icon ?? ''}
                  maxLength={4}
                  onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
                />
              </div>
            </div>

            <label className="mt-2 block text-[11px] text-ink-faint">卡片底部小字（默认「相遇」）</label>
            <input
              className="mt-1 w-full rounded-lg bg-page px-2.5 py-2 text-[13px] text-ink outline-none ring-1 ring-hairline focus:ring-brand"
              value={draft.caption ?? ''}
              placeholder="相遇"
              onChange={(e) => setDraft({ ...draft, caption: e.target.value })}
            />

            <div className="mt-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-ink">每年重复</div>
                <div className="text-[11px] text-ink-faint">生日 / 周年这类；关掉就是「只算这一次」</div>
              </div>
              <Switch checked={draft.recurring} onChange={(recurring) => setDraft({ ...draft, recurring })} />
            </div>

            <div className="mt-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-ink">显示在主界面</div>
                <div className="text-[11px] text-ink-faint">打开后才会出现在主界面那张卡上（第一张为主卡）</div>
              </div>
              <Switch checked={draft.showOnHome} onChange={(showOnHome) => setDraft({ ...draft, showOnHome })} />
            </div>

            <div className="mt-3">
              <div className="text-[11px] text-ink-faint">主界面卡片的背景图</div>
              <div className="mt-1 flex items-center gap-2">
                <div
                  className="grid h-16 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-gradient-to-b from-[#9cc4ec] to-[#4f7fb6] text-[18px] text-white/80"
                  style={draft.bg ? { background: `url("${draft.bg}") center/cover no-repeat` } : undefined}
                >
                  {draft.bg ? '' : '💙'}
                </div>
                <button
                  className="tap rounded-lg border border-hairline px-2.5 py-1.5 text-[12px] text-ink"
                  onClick={() => pickImage((url) => setDraft((d) => (d ? { ...d, bg: url } : d)))}
                >
                  选一张图
                </button>
                {draft.bg && (
                  <button
                    className="tap text-[12px] text-ink-faint"
                    onClick={() => setDraft((d) => (d ? { ...d, bg: undefined } : d))}
                  >
                    清除
                  </button>
                )}
              </div>
            </div>

            <label className="mt-3 block text-[11px] text-ink-faint">备注（只在这里看）</label>
            <textarea
              className="mt-1 h-16 w-full resize-none rounded-lg bg-page px-2.5 py-2 text-[12px] leading-relaxed text-ink outline-none ring-1 ring-hairline focus:ring-brand"
              value={draft.note ?? ''}
              placeholder="想记点什么就写在这里"
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            />

            <button className="tap mt-3 w-full rounded-lg bg-brand py-2.5 text-[14px] font-medium text-white" onClick={save}>
              保存
            </button>
          </section>
        )}

        {/* ── 列表 ── */}
        {anniversaries.length === 0 && !draft && (
          <div className="rounded-2xl bg-surface p-4 text-center text-[12px] leading-relaxed text-ink-faint shadow-card">
            还没有纪念日。
            <br />
            点右上角「＋ 新增」加一个，主界面就会有一张卡。
          </div>
        )}

        {anniversaries.map((a) => {
          const days = daysSince(a.date)
          const until = daysUntil(a.date, a.recurring)
          return (
            <section key={a.id} className="overflow-hidden rounded-2xl bg-surface shadow-card">
              <div className="flex items-start gap-3 p-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-soft/60 text-[20px]">{a.icon || '💙'}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[14px] font-medium text-ink">{a.title}</span>
                    {a.showOnHome && (
                      <span className="shrink-0 rounded-full bg-brand/15 px-1.5 py-0.5 text-[10px] text-brand-deep">主界面</span>
                    )}
                    {a.recurring && <span className="shrink-0 text-[10px] text-ink-faint">每年</span>}
                  </div>
                  <div className="mt-0.5 text-[11px] text-ink-sub">
                    {formatDate(a.date)} · 已经 {days} 天
                    {until !== 0 && a.recurring ? ` · 还有 ${until} 天` : ''}
                  </div>
                  {a.note && <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-ink-faint">{a.note}</div>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <button className="tap text-[12px] text-brand-deep" onClick={() => setDraft({ ...a })}>
                    编辑
                  </button>
                  <button
                    className="tap text-[11px] text-ink-faint"
                    onClick={() => {
                      if (confirm(`删掉「${a.title}」？`)) removeAnniversary(a.id)
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
            </section>
          )
        })}

        <p className="px-1 text-[11px] leading-relaxed text-ink-faint">
          主界面卡片的背景图会跟着设置一起同步；图片本身是 base64，别放太大的原图（几百 KB 就够了）。
        </p>
      </div>
    </div>
  )
}
