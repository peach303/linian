import { useEffect, useRef, useState } from 'react'
import { NavBar } from '@/components/common/NavBar'
import {
  backupSizeLabel,
  buildBackup,
  downloadBackup,
  importBackup,
  parseBackup,
  type BackupBundle,
  type ImportResult,
} from '@/lib/backup'

/**
 * 设置 → 数据 → 导入 / 导出
 *
 * 导出一份全量 JSON（设置 / 概率规则 / 字卡库 / 聊天记录），换设备或换部署地址时导入回去。
 * 导入 = 聊天记录和字卡**合并**（按 id / hash 去重），设置和规则**覆盖**。
 * Key 不进备份，见 lib/backup.ts 顶部的说明。
 */
export function DataScreen() {
  const [snapshot, setSnapshot] = useState<{ size: string; counts: BackupBundle['counts'] } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<{ name: string; size: string } | null>(null)
  const [pending, setPending] = useState<{ bundle: BackupBundle; fileName: string } | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const refresh = async () => {
    try {
      const b = await buildBackup()
      setSnapshot({ size: backupSizeLabel(b), counts: b.counts })
    } catch {
      /* 本地读不出来就少显示一行，不影响导出按钮 */
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const doExport = async () => {
    setError(null)
    setSaved(null)
    setBusy('正在打包…')
    try {
      const bundle = await buildBackup()
      const size = backupSizeLabel(bundle)
      const name = downloadBackup(bundle)
      setSaved({ name, size })
      setSnapshot({ size, counts: bundle.counts })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const onPick = async (file?: File) => {
    if (!file) return
    setError(null)
    setResult(null)
    setBusy('正在读取文件…')
    try {
      const text = await file.text()
      const bundle = parseBackup(text)
      setPending({ bundle, fileName: file.name })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPending(null)
    } finally {
      setBusy(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const doImport = async () => {
    if (!pending) return
    setError(null)
    setBusy('正在导入…')
    try {
      const r = await importBackup(pending.bundle, (step) => setBusy(step))
      setResult(r)
      setPending(null)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-page">
      <NavBar title="导入 / 导出" />

      <div className="no-scrollbar flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {/* ── 本机现状 ── */}
        <Card title="这台设备上现在有">
          {snapshot ? (
            <>
              <p className="text-[13px] leading-relaxed text-ink">
                {snapshot.counts.messages} 条聊天记录 · {snapshot.counts.cards} 张字卡 · {snapshot.counts.moments} 条朋友圈 ·{' '}
                {snapshot.counts.letters} 封信 · {snapshot.counts.diary} 篇日记
              </p>
              <p className="mt-1 text-[12px] text-ink-faint">打包成一份 JSON 大约 {snapshot.size}</p>
            </>
          ) : (
            <p className="text-[13px] text-ink-faint">正在数…</p>
          )}
        </Card>

        {/* ── 导出 ── */}
        <Card title="导出备份" desc="下载一份 JSON，换设备 / 换链接时用得上">
          <p className="text-[12px] leading-relaxed text-ink-sub">
            包含：聊天记录、字卡库（预设 / 自定义 / 拾取）、概率设置、昵称头像、纪念日、美化、朋友圈、信箱、日记、世界感知、陪伴记录。
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-sub">
            不包含：MiniMax / 博查的 Key（那些只在服务端，永远不进备份文件）、一起听的音频、观影的视频、书的正文本体。
          </p>
          <button
            className="tap mt-3 w-full rounded-lg bg-brand py-2.5 text-[14px] font-medium text-white disabled:opacity-50"
            disabled={!!busy}
            onClick={() => void doExport()}
          >
            {busy && !pending ? busy : '导出备份文件'}
          </button>
          {saved && (
            <p className="mt-2 text-[12px] text-ink-sub">
              已下载 {saved.name}（{saved.size}）。手机上一般在「下载 / 文件」里。
            </p>
          )}
        </Card>

        {/* ── 导入 ── */}
        <Card title="导入备份" desc="聊天记录和字卡会合并，设置和概率规则会被覆盖">
          <p className="text-[12px] leading-relaxed text-ink-sub">
            聊天记录按消息 id 去重：你导入之后新收到的消息不会被删。字卡按内容去重，同内容只留一张。
            昵称、头像、纪念日、美化、概率设置会变成备份里的样子。
          </p>

          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => void onPick(e.target.files?.[0])}
          />
          <button
            className="tap mt-3 w-full rounded-lg border border-hairline bg-surface py-2.5 text-[14px] text-ink disabled:opacity-50"
            disabled={!!busy}
            onClick={() => fileRef.current?.click()}
          >
            选择备份文件
          </button>

          {pending && (
            <div className="mt-3 rounded-lg bg-brand-soft/40 p-3">
              <p className="text-[13px] text-ink">{pending.fileName}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-sub">
                导出时间：{pending.bundle.exportedAt ? new Date(pending.bundle.exportedAt).toLocaleString() : '未知'}
                <br />
                里面有 {pending.bundle.counts.messages} 条消息、{pending.bundle.counts.cards} 张字卡、
                {pending.bundle.counts.moments} 条朋友圈、{pending.bundle.counts.letters} 封信。
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  className="tap flex-1 rounded-lg bg-brand py-2 text-[13px] font-medium text-white disabled:opacity-50"
                  disabled={!!busy}
                  onClick={() => void doImport()}
                >
                  {busy ?? '确认导入'}
                </button>
                <button
                  className="tap rounded-lg border border-hairline px-3 py-2 text-[13px] text-ink"
                  disabled={!!busy}
                  onClick={() => setPending(null)}
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </Card>

        {/* ── 结果 ── */}
        {result && (
          <Card title="导入完成">
            <p className="text-[13px] leading-relaxed text-ink">
              新增 {result.messagesAdded} 条消息（{result.messagesSkipped} 条已存在，跳过）、
              {result.cardsAdded} 张字卡（{result.cardsSkipped} 张重复，跳过）
              {result.rulesApplied ? '，概率设置已恢复' : ''}。
            </p>
            <p className="mt-1 text-[12px] text-ink-sub">
              {result.offline
                ? '后端现在没连上：数据已经写进本机，联网后由「立即同步到后端」补发。'
                : '已经同步到后端，手机 / 别的浏览器打开同一个地址也能看到。'}
            </p>
          </Card>
        )}

        {error && (
          <div className="rounded-xl bg-[#FFF1F0] px-3 py-2 text-[12px] leading-relaxed text-[#C0392B]">{error}</div>
        )}

        {/* ── 怎么搬家 ── */}
        <Card title="换个设备怎么搬">
          <ol className="list-decimal space-y-1 pl-4 text-[12px] leading-relaxed text-ink-sub">
            <li>在旧设备上「导出备份文件」，把 JSON 发给自己（微信 / 邮件 / 网盘都行）。</li>
            <li>新设备打开同一个地址，进这里「选择备份文件」→ 确认导入。</li>
            <li>如果新地址是新的后端，Key 需要在新地址的「设置 → 接入」里再填一次 —— Key 不进备份。</li>
          </ol>
        </Card>
      </div>
    </div>
  )
}

function Card({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-surface p-3 shadow-card">
      <h2 className="text-[14px] font-medium text-ink">{title}</h2>
      {desc && <p className="mt-0.5 text-[11px] text-ink-faint">{desc}</p>}
      <div className="mt-2">{children}</div>
    </section>
  )
}
