import { useEffect, useState } from 'react'
import { NavBar } from '@/components/common/NavBar'
import { PromptSheet } from '@/components/common/PromptSheet'
import { pickImage } from '@/lib/file'
import { THEME_PRESETS } from '@/lib/theme'
import { useAppStore } from '@/store/useAppStore'
import { useChatStore } from '@/store/useChatStore'
import { useIntegrationsStore } from '@/store/useIntegrationsStore'
import { useRulesStore } from '@/store/useRulesStore'
import { clearConversation, clearMessages, flush, isOnline } from '@/lib/repo'

/**
 * 设置模块
 * 5.1 形象与字卡库：头像/昵称、字卡库（预设开关+占比 / 自定义 / 查重 / 批量导入）、导入导出
 * 5.2 深度拟真：概率调节引擎（RuleEngineScreen）、MiniMax Key、联网搜索授权
 */
export function SettingsScreen() {
  const { me, dream, setProfile, themeKey, setTheme, push } = useAppStore()
  const integrations = useIntegrationsStore((s) => s.status)
  const refreshIntegrations = useIntegrationsStore((s) => s.refresh)
  const searchOn = useRulesStore((s) => s.saved.search.enabled)
  useEffect(() => {
    void refreshIntegrations()
  }, [refreshIntegrations])
  const openExtend = useChatStore((s) => s.openExtend)
  const messageCount = useChatStore((s) => s.messages.length)
  const resetMessages = useChatStore((s) => s.resetMessages)
  const [syncLabel, setSyncLabel] = useState('点此补发离线操作')
  /** 正在改的昵称（null = 没在改） */
  const [editing, setEditing] = useState<null | 'me' | 'dream'>(null)

  const doSync = async () => {
    setSyncLabel('同步中…')
    const r = await flush()
    setSyncLabel(
      r.failed > 0
        ? `后端未连接 · ${r.failed} 项待补发`
        : r.sent > 0
          ? `已同步 ${r.sent} 项`
          : `已是最新 · ${isOnline() ? '后端在线' : '本地模式'}`,
    )
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-page">
      <NavBar title="设置" />
      <div className="no-scrollbar flex-1 space-y-4 overflow-y-auto px-3 py-3">
        {/* ── 形象 ── */}
        <Group title="形象">
          <Row label="我的昵称" value={me.nickname} onClick={() => setEditing('me')} chevron />
          <Row
            label="我的头像"
            value="点一下换本地图片"
            onClick={() => pickImage((url) => setProfile('me', { avatarUrl: url }))}
          />
          <Row label="梦角昵称" value={dream.nickname} onClick={() => setEditing('dream')} chevron />
          <Row
            label="梦角头像"
            value="点一下换本地图片"
            onClick={() => pickImage((url) => setProfile('dream', { avatarUrl: url }))}
          />
          <div className="flex flex-wrap items-center gap-2 px-3 py-3">
            <span className="text-[13px] text-ink">主界面配色</span>
            <div className="ml-auto flex flex-wrap gap-2">
              {THEME_PRESETS.map((t) => (
                <button
                  key={t.key}
                  className={`tap h-6 w-6 rounded-full ring-offset-2 ${themeKey === t.key ? 'ring-2 ring-brand' : ''}`}
                  style={{ background: `rgb(${t.vars['--ln-brand']})` }}
                  title={t.name}
                  onClick={() => setTheme(t.key)}
                />
              ))}
            </div>
          </div>
        </Group>

        {/* ── 美化 ── */}
        <Group title="美化">
          <Row label="应用图标" value="图标 / 自定义图片" onClick={() => push('appearance')} chevron />
          <Row label="主界面背景" value="预设 / 纯色 / 图片" onClick={() => push('appearance')} chevron />
          <Row label="主界面照片墙" value="三张 · 拖动换位 / 点击置顶" onClick={() => push('appearance')} chevron />
          <Row label="聊天背景" value="底纹 / 图片" onClick={() => push('appearance')} chevron />
          <Row label="气泡样式" value="配色 / 圆角 / 尾巴 / 导入 CSS" onClick={() => push('appearance')} chevron />
        </Group>

        {/* ── 字卡库 ── */}
        <Group title="字卡库">
          <Row label="系统预设字卡" value="可开关 / 调权重 / 禁自由造句" onClick={() => push('card-library')} chevron />
          <Row label="自定义字卡" value="全类型（文字/颜文字/emoji/表情包/图片）" onClick={() => push('card-library')} chevron />
          <Row label="拾取字卡" value="从我聊天里抓来的话" onClick={() => push('card-library')} chevron />
          <Row
            label="拍一拍库"
            value="我的 / 他的，可自定义"
            onClick={() => {
              openExtend('PAT')
              push('chat')
            }}
            chevron
          />
          <Row label="批量导入" value="一行一张 · 导入前查重预览" onClick={() => push('card-library')} chevron />
        </Group>

        {/* ── 深度拟真 ── */}
        <Group title="深度拟真">
          <Row label="概率调节引擎" value="回复 / 主动 / 问卷 / 查岗 / 收藏" onClick={() => push('rule-engine')} chevron />
        </Group>

        {/* ── 接口与扩展 ── */}
        <Group title="接口与扩展">
          <Row
            label="MiniMax 语音"
            value={
              integrations.minimax.configured
                ? `已接通 · ${integrations.minimax.hint}`
                : '未配置 · 接通后他能真的出声'
            }
            onClick={() => push('integration')}
            chevron
          />
          <Row
            label="联网搜索推送"
            value={searchOn ? '已开启 · 搜到才推' : '已关闭'}
            onClick={() => push('integration')}
            chevron
          />
        </Group>

        {/* ── 数据 ── */}
        <Group title="数据">
          <Row label="聊天记录" value={`${messageCount} 条 · 本机保存`} />
          <Row label="立即同步到后端" value={syncLabel} onClick={() => void doSync()} chevron />
          <Row label="导入 / 导出" value="全量 JSON · 换设备搬家" onClick={() => push('data')} chevron />
          <Row
            label="清空聊天记录"
            value=""
            danger
            onClick={() => {
              const cid = useChatStore.getState().conversation?.id
              void (cid ? clearConversation(cid) : clearMessages()).then(() => resetMessages())
            }}
          />
        </Group>

        <p className="pb-4 text-center text-[11px] text-ink-faint">黎念 LiNian v0.1.0</p>
      </div>

      {editing && (
        <PromptSheet
          title={editing === 'me' ? '改我的昵称' : `改「${dream.nickname}」的昵称`}
          value={editing === 'me' ? me.nickname : dream.nickname}
          placeholder={editing === 'me' ? '我' : '梦角'}
          maxLength={12}
          hint="昵称会出现在聊天标题、拍一拍、朋友圈等所有地方，随时能改。"
          onSave={(v) => setProfile(editing, { nickname: v })}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-1.5 px-1 text-[12px] text-ink-sub">{title}</h2>
      <div className="divide-y divide-hairline overflow-hidden rounded-xl bg-surface shadow-card">{children}</div>
    </section>
  )
}

function Row({
  label,
  value,
  onClick,
  chevron,
  danger,
}: {
  label: string
  value?: string
  onClick?: () => void
  chevron?: boolean
  danger?: boolean
}) {
  return (
    <button className="tap flex w-full items-center gap-3 px-3 py-3 text-left" onClick={onClick}>
      <span className="text-[14px] text-ink">{label}</span>
      {!!value && <span className="ml-auto truncate text-[12px] text-ink-faint">{value}</span>}
      {(chevron || danger) && <span className={`text-[14px] ${danger ? 'text-[#FA5151]' : 'text-ink-faint'}`}>{danger ? '›' : '›'}</span>}
    </button>
  )
}
