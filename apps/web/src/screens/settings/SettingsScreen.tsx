import { useEffect, useState } from 'react'
import { NavBar } from '@/components/common/NavBar'
import { PromptSheet } from '@/components/common/PromptSheet'
import { API_ENABLED, PROXY_MODE, STATIC_ONLY } from '@/lib/deploy'
import { pickImage } from '@/lib/file'
import {
  notificationPermission,
  requestNotificationPermission,
  testNotification,
  type NotifyPermission,
} from '@/lib/notify'
import { THEME_PRESETS } from '@/lib/theme'
import { playSfx, previewCallRing, unlockSfx } from '@/lib/sfx'
import { useAppStore } from '@/store/useAppStore'
import { useChatStore } from '@/store/useChatStore'
import { useIntegrationsStore } from '@/store/useIntegrationsStore'
import { useRulesStore } from '@/store/useRulesStore'
import { useUIStore, type SoundPrefs } from '@/store/useUIStore'
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

  /* ── 消息提醒 / 后台保活 ── */
  const notifyOn = useUIStore((s) => s.messageNotify)
  const setNotifyOn = useUIStore((s) => s.setMessageNotify)
  const keepAlive = useUIStore((s) => s.backgroundKeepAlive)
  const setKeepAlive = useUIStore((s) => s.setBackgroundKeepAlive)
  const [notifyPerm, setNotifyPerm] = useState<NotifyPermission>(() => notificationPermission())
  const [notifyNote, setNotifyNote] = useState('')

  /* ── 声音提示（只存在这台设备） ── */
  const ui = useUIStore()
  const sfx: SoundPrefs = {
    sfxMaster: ui.sfxMaster,
    sfxIncomingCall: ui.sfxIncomingCall,
    sfxOutgoingCall: ui.sfxOutgoingCall,
    sfxHisMessage: ui.sfxHisMessage,
    sfxMyMessage: ui.sfxMyMessage,
    sfxHisPat: ui.sfxHisPat,
    sfxMyPat: ui.sfxMyPat,
  }
  const setSfx = ui.setSfx

  const soundRows: { key: keyof SoundPrefs; label: string; preview?: () => void }[] = [
    { key: 'sfxIncomingCall', label: '他打来的来电铃声', preview: () => previewCallRing('incoming') },
    { key: 'sfxOutgoingCall', label: '我打给他的回铃音', preview: () => previewCallRing('outgoing') },
    { key: 'sfxHisMessage', label: '他发消息的提示音', preview: () => playSfx('hisMessage') },
    { key: 'sfxMyMessage', label: '我发消息的提示音', preview: () => playSfx('myMessage') },
    { key: 'sfxHisPat', label: '他拍一拍的提示音', preview: () => playSfx('hisPat') },
    { key: 'sfxMyPat', label: '我拍一拍的提示音', preview: () => playSfx('myPat') },
  ]

  const toggleSfx = (key: keyof SoundPrefs, preview?: () => void) => {
    unlockSfx()
    const on = sfx[key]
    if (!on && sfx.sfxMaster) preview?.()
    setSfx(key, !on)
  }

  const permLabel: Record<NotifyPermission, string> = {
    unsupported: '浏览器不支持',
    default: '还没授权',
    granted: '系统已授权',
    denied: '权限被拒绝',
  }

  const enableNotify = async () => {
    const p = await requestNotificationPermission()
    setNotifyPerm(p)
    if (p === 'granted') {
      setNotifyOn(true)
      setNotifyNote('已开启。页面在后台时收到他的新消息会弹系统通知；在别的页面会弹应用内小窗。')
    } else if (p === 'denied') {
      setNotifyOn(false)
      setNotifyNote('浏览器拒绝了通知权限。要去浏览器的网站设置里重新允许，网页这边改不了。')
    } else {
      setNotifyNote('没有拿到权限，可以再点一次试试。')
    }
  }

  const toggleNotify = async () => {
    // 还没授权时，点一下先申请权限，而不是把开关关掉
    if (notifyPerm !== 'granted') {
      await enableNotify()
      return
    }
    if (notifyOn) {
      setNotifyOn(false)
      setNotifyNote('已关闭消息提醒。')
      return
    }
    setNotifyOn(true)
    setNotifyNote('已开启消息提醒。')
  }

  const doTestNotify = async () => {
    const ok = await testNotification(dream.nickname)
    setNotifyNote(
      ok
        ? '测试通知已发出。如果通知栏没看到，检查系统 / 浏览器的通知权限。'
        : '还没有通知权限，先点上面的「消息通知」开启。',
    )
  }

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
              !API_ENABLED
                ? '静态版不可用'
                : integrations.minimax.configured
                  ? `已接通 · ${integrations.minimax.hint}`
                  : PROXY_MODE
                    ? '未配置 · 走免费代理'
                    : '未配置 · 接通后他能真的出声'
            }
            onClick={() => push('integration')}
            chevron
          />
          <Row
            label="联网搜索推送"
            value={
              !API_ENABLED
                ? '静态版不可用'
                : searchOn
                  ? `已开启 · ${PROXY_MODE ? '走免费代理' : '搜到才推'}`
                  : '已关闭'
            }
            onClick={() => push('integration')}
            chevron
          />
        </Group>

        {/* ── 声音提示 ── */}
        <Group title="声音">
          <Row
            label="声音总开关"
            value={sfx.sfxMaster ? '已开启' : '全部静音'}
            onClick={() => {
              unlockSfx()
              setSfx('sfxMaster', !sfx.sfxMaster)
            }}
            chevron
          />
          {soundRows.map((r) => (
            <Row
              key={r.key}
              label={r.label}
              value={!sfx.sfxMaster ? '总开关已关' : sfx[r.key] ? '已开启' : '已关闭'}
              onClick={() => toggleSfx(r.key, r.preview)}
              chevron
            />
          ))}
          <p className="px-3 py-2.5 text-[11px] leading-relaxed text-ink-faint">
            点一下开 / 关；开启时会顺手放一小段让你试听。浏览器要求先点过页面才允许出声，
            所以第一次可能听不到，再点一次就好。
          </p>
        </Group>

        {/* ── 消息提醒 ── */}
        <Group title="消息提醒">
          <Row
            label="消息通知"
            value={`${
              notifyPerm === 'granted' ? (notifyOn ? '已开启' : '已关闭') : notifyPerm === 'denied' ? '已关闭' : '待授权'
            } · ${permLabel[notifyPerm]}`}
            onClick={() => void toggleNotify()}
            chevron
          />
          <Row
            label="聊天后台保活"
            value={keepAlive ? '已开启 · 尽力保活' : '已关闭'}
            onClick={() => {
              setKeepAlive(!keepAlive)
              setNotifyNote(
                !keepAlive
                  ? '已开启后台保活：会循环播放一段几乎无声的音频，尽量让标签页不被冻结。系统仍可能杀掉它。'
                  : '已关闭后台保活。',
              )
            }}
            chevron
          />
          <Row label="发一条测试通知" value="看看通知栏" onClick={() => void doTestNotify()} />
          <p className="px-3 py-2.5 text-[11px] leading-relaxed text-ink-faint">
            网页没有真正的系统级后台保活。切后台后，系统仍可能在省电 / 内存紧张时冻结或杀掉页面；被冻结后就不会再产生新消息，也就不会弹通知。
            通知只在网页还活着时有效，不需要额外的推送 Key。
          </p>
          {notifyNote && <p className="px-3 pb-3 text-[11px] leading-relaxed text-brand-deep">{notifyNote}</p>}
        </Group>

        {/* ── 数据 ── */}
        <Group title="数据">
          <Row label="聊天记录" value={`${messageCount} 条 · 本机保存`} />
          {!STATIC_ONLY && (
            <Row label="立即同步到后端" value={syncLabel} onClick={() => void doSync()} chevron />
          )}
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
