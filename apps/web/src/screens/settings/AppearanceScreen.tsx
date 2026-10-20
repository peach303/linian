import clsx from 'clsx'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavBar } from '@/components/common/NavBar'
import { Slider, Switch } from '@/components/settings/controls'
import { pickImage } from '@/lib/file'
import {
  BUBBLE_PRESETS,
  CHAT_BG_PRESETS,
  HOME_BG_PRESETS,
  ICON_PRESETS,
  bgCss,
} from '@/lib/appearance'
import { ENTRIES, resolveEntryIcon } from '@/lib/entries'
import { photosOf, useAppearanceStore } from '@/store/useAppearanceStore'
import type { BackgroundValue, IconValue } from '@/types/appearance'

/**
 * 美化（设置 → 美化）
 * 应用图标 / 主界面背景 / 主界面照片墙 / 聊天背景 / 气泡样式 / 主界面图标
 * 所有改动即时预览（CSS 变量 + store），并持久化到 IndexedDB（含同步到后端）。
 */
export function AppearanceScreen() {
  const {
    appearance: a,
    setIcon,
    setBackground,
    setBubble,
    setEntryIcon,
    resetEntryIcon,
    setHomeNote,
    setPhoto,
    resetPhotos,
    resetAll,
  } = useAppearanceStore()

  const [cssDraft, setCssDraft] = useState(a.bubble.customCss ?? '')
  const cssFileRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    setCssDraft(a.bubble.customCss ?? '')
  }, [a.bubble.customCss])

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-page">
      <NavBar
        title="美化"
        right={
          <button className="tap text-[12px] text-brand-deep" onClick={resetAll}>
            恢复默认
          </button>
        }
      />

      <div className="no-scrollbar flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {/* ── 应用图标 ── */}
        <Card title="应用图标" desc="主界面左上角那个小图标（「黎念」）">
          <IconPicker
            value={a.appIcon}
            onChange={(v) => setIcon('appIcon', v)}
            presets={ICON_PRESETS}
            preview
          />
        </Card>

        {/* ── 主界面背景 ── */}
        <Card title="主界面背景" desc="预设渐变 / 纯色 / 自定义图片">
          <BackgroundEditor
            value={a.homeBackground}
            onChange={(patch) => setBackground('homeBackground', patch)}
            presets={HOME_BG_PRESETS}
            allowDim
          />
        </Card>

        {/* ── 主界面那句话 + 照片墙 ── */}
        <Card title="主界面照片墙" desc="三张照片叠着摆；在主界面上可以拖着换位置、点一下置顶">
          <label className="block text-[12px] text-ink">两个人上面那句话</label>
          <input
            className="mt-1 w-full rounded-lg bg-page px-2.5 py-2 text-[13px] text-ink outline-none ring-1 ring-hairline focus:ring-brand"
            value={a.homeNote}
            maxLength={40}
            placeholder="两颗缠绕的心，会走同一条路"
            onChange={(e) => setHomeNote(e.target.value)}
          />

          <div className="mt-3 grid grid-cols-3 gap-2">
            {photosOf(a).map((p, i) => (
              <div key={i} className="overflow-hidden rounded-xl bg-page ring-1 ring-hairline">
                <div className="relative aspect-[4/5] w-full">
                  {p.url ? (
                    <img src={p.url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-[20px] text-ink-faint">＋</div>
                  )}
                  {p.url && (
                    <button
                      className="tap absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/45 text-[10px] text-white"
                      title="清掉这张"
                      onClick={() => setPhoto(i, '')}
                    >
                      ✕
                    </button>
                  )}
                </div>
                <button
                  className="tap w-full py-1.5 text-[11px] text-brand-deep"
                  onClick={() => pickImage((url) => setPhoto(i, url))}
                >
                  {p.url ? '换一张' : '选照片'}
                </button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center">
            <p className="text-[11px] text-ink-faint">图片存在设置里（base64），别放太大的原图。</p>
            <button className="tap ml-auto text-[11px] text-ink-faint" onClick={resetPhotos}>
              摆回默认
            </button>
          </div>
        </Card>

        {/* ── 聊天背景 ── */}
        <Card title="聊天背景" desc="聊天页消息区底纹（气泡下方）">
          <BackgroundEditor
            value={a.chatBackground}
            onChange={(patch) => setBackground('chatBackground', patch)}
            presets={CHAT_BG_PRESETS}
          />
        </Card>

        {/* ── 气泡样式 ── */}
        <Card title="气泡样式" desc="配色 / 圆角 / 尾巴，实时预览">
          <div className="space-y-3">
            <div>
              <div className="mb-1.5 text-[13px] text-ink">配色方案</div>
              <div className="flex flex-wrap gap-2">
                {BUBBLE_PRESETS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setBubble({ me: p.me, peer: p.peer, ink: p.ink })}
                    className={clsx(
                      'tap flex items-center gap-1.5 rounded-full bg-page px-2.5 py-1.5 text-[12px] text-ink-sub ring-1',
                      a.bubble.me.toLowerCase() === p.me ? 'ring-brand' : 'ring-hairline',
                    )}
                  >
                    <span className="h-3.5 w-3.5 rounded-full ring-1 ring-black/5" style={{ background: p.me }} />
                    <span className="h-3.5 w-3.5 rounded-full ring-1 ring-black/5" style={{ background: p.peer }} />
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <ColorRow label="我的气泡" value={a.bubble.me} onChange={(me) => setBubble({ me })} />
            <ColorRow label="对方气泡" value={a.bubble.peer} onChange={(peer) => setBubble({ peer })} />
            <ColorRow label="文字颜色" value={a.bubble.ink} onChange={(ink) => setBubble({ ink })} />

            <div>
              <div className="mb-1 flex items-center justify-between text-[13px] text-ink">
                <span>圆角</span>
                <span className="text-[12px] tabular-nums text-ink-sub">{a.bubble.radius.toFixed(1)} rem</span>
              </div>
              <Slider
                min={0}
                max={1.5}
                step={0.1}
                value={a.bubble.radius}
                onChange={(radius) => setBubble({ radius })}
              />
            </div>

            <div className="flex items-center gap-3 rounded-xl bg-page px-3 py-2.5">
              <span className="text-[13px] text-ink">显示小尾巴</span>
              <span className="ml-auto" />
              <Switch checked={a.bubble.tail} onChange={(tail) => setBubble({ tail })} />
            </div>

            {/* 预览 */}
            <div className="space-y-2 rounded-xl bg-page/60 p-3">
              <div className="text-[11px] text-ink-faint">预览</div>
              <div className="flex justify-start">
                <span className="ln-bubble ln-bubble-peer max-w-[70%] rounded-[var(--ln-bubble-radius,0.5rem)] bg-bubble-peer px-3 py-2 text-[14px] text-bubble-ink shadow-card">
                  今天下雨了，你有没有带伞呀？
                </span>
              </div>
              <div className="flex justify-end">
                <span className="ln-bubble ln-bubble-me max-w-[70%] rounded-[var(--ln-bubble-radius,0.5rem)] bg-bubble px-3 py-2 text-[14px] text-bubble-ink">
                  带了！你怎么知道下雨的
                </span>
              </div>
            </div>

            {/* 自定义 CSS */}
            <div className="rounded-xl bg-page px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-ink">导入 CSS 代码</span>
                <span className="text-[10px] text-ink-faint">聊天气泡生效</span>
                <button
                  className="tap ml-auto rounded-lg bg-surface px-2.5 py-1 text-[11px] text-ink-sub ring-1 ring-hairline"
                  onClick={() => cssFileRef.current?.click()}
                >
                  选 .css 文件
                </button>
                <input
                  ref={cssFileRef}
                  type="file"
                  accept=".css,text/css"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    void file.text().then((t) => setCssDraft(t))
                    e.target.value = ''
                  }}
                />
              </div>
              <textarea
                value={cssDraft}
                onChange={(e) => setCssDraft(e.target.value)}
                rows={5}
                spellCheck={false}
                placeholder={'.ln-bubble-me {\n  background: linear-gradient(135deg,#bfe3ff,#e7f4ff);\n  box-shadow: 0 4px 14px rgba(80,150,220,.18);\n}\n.ln-bubble-peer { border: 1px solid #dcecff; }'}
                className="mt-2 w-full resize-y rounded-lg bg-surface px-2.5 py-2 font-mono text-[11px] leading-relaxed text-ink outline-none ring-1 ring-hairline focus:ring-brand placeholder:text-ink-faint"
              />
              <div className="mt-1.5 flex items-center gap-2">
                <button
                  className="tap rounded-lg bg-brand px-3 py-1.5 text-[11px] text-white"
                  onClick={() => setBubble({ customCss: cssDraft })}
                >
                  应用
                </button>
                <button
                  className="tap rounded-lg bg-surface px-3 py-1.5 text-[11px] text-ink-sub ring-1 ring-hairline"
                  onClick={() => {
                    setCssDraft('')
                    setBubble({ customCss: '' })
                  }}
                >
                  清空
                </button>
                <span className="text-[10px] leading-snug text-ink-faint">
                  选择器用 .ln-bubble / .ln-bubble-me / .ln-bubble-peer
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* ── 主界面图标 ── */}
        <Card title="主界面图标" desc="聊天 / 朋友圈 / 信箱 / 功能 / 设置 五个入口">
          <div className="space-y-3">
            {ENTRIES.map((e) => {
              const cur = resolveEntryIcon(a, e)
              const isCustom = Boolean(a.entryIcons?.[e.key])
              return (
                <div key={e.key} className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-page text-[18px] ring-1 ring-hairline">
                    {cur.mode === 'image' ? (
                      <img src={cur.value} alt="" className="h-full w-full rounded-xl object-cover" />
                    ) : (
                      cur.value
                    )}
                  </span>
                  <span className="w-14 shrink-0 text-[13px] text-ink">{e.label}</span>
                  <div className="no-scrollbar flex flex-1 gap-1.5 overflow-x-auto">
                    {ICON_PRESETS.slice(0, 8).map((ic) => (
                      <button
                        key={ic}
                        className={clsx(
                          'tap grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[16px]',
                          cur.mode === 'emoji' && cur.value === ic ? 'bg-brand/15 ring-1 ring-brand' : 'bg-page',
                        )}
                        onClick={() => setEntryIcon(e.key, { mode: 'emoji', value: ic })}
                      >
                        {ic}
                      </button>
                    ))}
                    <UploadButton onPick={(url) => setEntryIcon(e.key, { mode: 'image', value: url })} />
                    {isCustom && (
                      <button
                        className="tap shrink-0 rounded-lg bg-page px-2 text-[11px] text-ink-sub ring-1 ring-hairline"
                        onClick={() => resetEntryIcon(e.key)}
                      >
                        复位
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        <p className="pb-4 text-center text-[11px] leading-relaxed text-ink-faint">
          图片保存在本机（IndexedDB），不会上传；同步到后端时以 base64 传输。
        </p>
      </div>
    </div>
  )
}

/* ───────────────────────── 通用块 ───────────────────────── */

function Card({
  title,
  desc,
  children,
}: {
  title: string
  desc?: string
  children: ReactNode
}) {
  return (
    <section className="rounded-2xl bg-surface p-3.5 shadow-card">
      <div className="mb-2.5">
        <h2 className="text-[14px] font-medium text-ink">{title}</h2>
        {desc && <p className="mt-0.5 text-[11px] text-ink-faint">{desc}</p>}
      </div>
      {children}
    </section>
  )
}

/** 上传按钮（复用统一的本机图片选择） */
function UploadButton({ onPick, label = '图片' }: { onPick: (dataUrl: string) => void; label?: string }) {
  return (
    <button
      className="tap shrink-0 rounded-lg bg-page px-2 py-1.5 text-[11px] text-ink-sub ring-1 ring-hairline"
      onClick={() => pickImage(onPick)}
    >
      ⬆ {label}
    </button>
  )
}

/* ───────────────────────── 图标选择 ───────────────────────── */

function IconPicker({
  value,
  onChange,
  presets,
  preview,
}: {
  value: IconValue
  onChange: (v: IconValue) => void
  presets: string[]
  preview?: boolean
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-start gap-3">
        {preview && (
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-page text-[26px] ring-1 ring-hairline">
            {value.mode === 'image' ? (
              <img src={value.value} alt="" className="h-full w-full rounded-2xl object-cover" />
            ) : (
              value.value
            )}
          </span>
        )}
        <div className="flex flex-1 flex-wrap gap-1.5">
          {presets.map((p) => (
            <button
              key={p}
              className={clsx(
                'tap grid h-9 w-9 place-items-center rounded-xl text-[18px]',
                value.mode === 'emoji' && value.value === p ? 'bg-brand/15 ring-1 ring-brand' : 'bg-page',
              )}
              onClick={() => onChange({ mode: 'emoji', value: p })}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <UploadButton onPick={(url) => onChange({ mode: 'image', value: url })} label="上传图片" />
        <input
          placeholder="或粘贴图片链接 https://…"
          className="min-w-0 flex-1 rounded-lg bg-page px-2.5 py-1.5 text-[12px] text-ink outline-none ring-1 ring-hairline focus:ring-brand placeholder:text-ink-faint"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const v = (e.target as HTMLInputElement).value.trim()
              if (v) onChange({ mode: 'image', value: v })
            }
          }}
        />
        <button
          className="tap shrink-0 rounded-lg bg-page px-2.5 py-1.5 text-[12px] text-ink-sub ring-1 ring-hairline"
          onClick={() => onChange({ mode: 'emoji', value: presets[0] })}
        >
          无
        </button>
      </div>
    </div>
  )
}

/* ───────────────────────── 背景编辑 ───────────────────────── */

function BackgroundEditor({
  value,
  onChange,
  presets,
  allowDim,
}: {
  value: BackgroundValue
  onChange: (patch: Partial<BackgroundValue>) => void
  presets: { key: string; label: string; css: string }[]
  allowDim?: boolean
}) {
  const modes: { key: BackgroundValue['mode']; label: string }[] = [
    { key: 'preset', label: '预设' },
    { key: 'color', label: '纯色' },
    { key: 'image', label: '图片' },
  ]

  return (
    <div className="space-y-3">
      {/* 模式切换 */}
      <div className="flex overflow-hidden rounded-lg ring-1 ring-hairline">
        {modes.map((m) => (
          <button
            key={m.key}
            onClick={() => onChange({ mode: m.key })}
            className={clsx(
              'flex-1 py-1.5 text-[12px]',
              value.mode === m.key ? 'bg-brand text-white' : 'bg-page text-ink-sub',
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {value.mode === 'preset' && (
        <div className="grid grid-cols-4 gap-2">
          {presets.map((p) => (
            <button
              key={p.key}
              onClick={() => onChange({ value: p.key })}
              className={clsx(
                'tap overflow-hidden rounded-xl ring-1',
                value.value === p.key ? 'ring-2 ring-brand' : 'ring-hairline',
              )}
            >
              <span className="block h-12 w-full" style={{ background: p.css || '#fff' }} />
              <span className="block py-1 text-[10px] text-ink-sub">{p.label}</span>
            </button>
          ))}
        </div>
      )}

      {value.mode === 'color' && (
        <ColorRow label="背景色" value={value.value || '#eaf3ff'} onChange={(color) => onChange({ value: color })} />
      )}

      {value.mode === 'image' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <UploadButton onPick={(url) => onChange({ value: url })} label="上传背景" />
            <input
              placeholder="或粘贴图片链接 https://…"
              className="min-w-0 flex-1 rounded-lg bg-page px-2.5 py-1.5 text-[12px] text-ink outline-none ring-1 ring-hairline focus:ring-brand placeholder:text-ink-faint"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const v = (e.target as HTMLInputElement).value.trim()
                  if (v) onChange({ value: v })
                }
              }}
            />
          </div>
          {value.value && (
            <div className="overflow-hidden rounded-xl ring-1 ring-hairline">
              <span className="block h-20 w-full" style={{ background: bgCss(value), backgroundPosition: 'center' }} />
            </div>
          )}
        </div>
      )}

      <div className="space-y-2 pt-0.5">
        <LabeledSlider
          label="模糊"
          value={value.blur}
          min={0}
          max={20}
          step={1}
          suffix="px"
          onChange={(blur) => onChange({ blur })}
        />
        {allowDim && (
          <LabeledSlider
            label="压暗遮罩"
            value={value.dim}
            min={0}
            max={0.7}
            step={0.05}
            percent
            onChange={(dim) => onChange({ dim })}
          />
        )}
      </div>
    </div>
  )
}

function LabeledSlider({
  label,
  value,
  min,
  max,
  step,
  suffix,
  percent,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix?: string
  percent?: boolean
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between text-[12px] text-ink">
        <span>{label}</span>
        <span className="tabular-nums text-ink-sub">
          {percent ? `${Math.round(value * 100)}%` : `${value}${suffix ?? ''}`}
        </span>
      </div>
      <Slider min={min} max={max} step={step} value={value} onChange={onChange} />
    </div>
  )
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[13px] text-ink">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="ml-auto h-8 w-10 cursor-pointer rounded-lg border-0 bg-transparent p-0"
      />
      <span className="w-16 text-[12px] tabular-nums text-ink-sub">{value}</span>
    </div>
  )
}
