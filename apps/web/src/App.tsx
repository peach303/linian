import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef } from 'react'
import { PhoneShell } from '@/components/phone/PhoneShell'
import { useAppStore, type ScreenId } from '@/store/useAppStore'
import { HomeScreen } from '@/screens/HomeScreen'
import { ChatScreen } from '@/screens/chat/ChatScreen'
import { MomentsScreen } from '@/screens/moments/MomentsScreen'
import { MailboxScreen } from '@/screens/mailbox/MailboxScreen'
import { HubScreen } from '@/screens/hub/HubScreen'
import { SettingsScreen } from '@/screens/settings/SettingsScreen'
import { RuleEngineScreen } from '@/screens/settings/RuleEngineScreen'
import { AppearanceScreen } from '@/screens/settings/AppearanceScreen'
import { CardLibraryScreen } from '@/screens/cards/CardLibraryScreen'
import { GiftCabinetScreen } from '@/screens/hub/GiftCabinetScreen'
import { MusicRoomScreen } from '@/screens/hub/MusicRoomScreen'
import { VoiceFavoritesScreen } from '@/screens/hub/VoiceFavoritesScreen'
import { CompanionScreen } from '@/screens/hub/CompanionScreen'
import { StatsScreen } from '@/screens/hub/StatsScreen'
import { FitnessScreen } from '@/screens/hub/FitnessScreen'
import { WatchRoomScreen } from '@/screens/hub/WatchRoomScreen'
import { ReadRoomScreen } from '@/screens/hub/ReadRoomScreen'
import { DiaryScreen } from '@/screens/hub/DiaryScreen'
import { WorldScreen } from '@/screens/hub/WorldScreen'
import { CheckScreen } from '@/screens/hub/CheckScreen'
import { IntegrationScreen } from '@/screens/settings/IntegrationScreen'
import { DataScreen } from '@/screens/settings/DataScreen'
import { AnniversaryScreen } from '@/screens/hub/AnniversaryScreen'
import { EmotionScreen } from '@/screens/hub/EmotionScreen'
import { SurveyScreen } from '@/screens/hub/SurveyScreen'
import { OutfitScreen } from '@/screens/hub/OutfitScreen'
import { CallOverlay } from '@/components/chat/CallOverlay'
import { MusicMiniPlayer } from '@/components/music/MusicMiniPlayer'
import { MessagePopup } from '@/components/common/MessagePopup'
import { ImageViewer } from '@/components/common/ImageViewer'
import { startChatKeepAlive, stopChatKeepAlive, resumeChatKeepAlive } from '@/lib/keepAlive'
import { useUIStore } from '@/store/useUIStore'
import { useChatStore } from '@/store/useChatStore'
import { playSfx, unlockSfx } from '@/lib/sfx'

/** 屏幕栈：push 时从右滑入，back 时反向 */
const SCREENS = {
  home: HomeScreen,
  chat: ChatScreen,
  moments: MomentsScreen,
  mailbox: MailboxScreen,
  hub: HubScreen,
  settings: SettingsScreen,
  'chat-extend': ChatScreen,
  'rule-engine': RuleEngineScreen,
  appearance: AppearanceScreen,
  'card-library': CardLibraryScreen,
  'gift-cabinet': GiftCabinetScreen,
  'music-room': MusicRoomScreen,
  favorite: VoiceFavoritesScreen,
  companion: CompanionScreen,
  stats: StatsScreen,
  fitness: FitnessScreen,
  'watch-room': WatchRoomScreen,
  'read-room': ReadRoomScreen,
  diary: DiaryScreen,
  world: WorldScreen,
  check: CheckScreen,
  integration: IntegrationScreen,
  data: DataScreen,
  anniversary: AnniversaryScreen,
  emotion: EmotionScreen,
  survey: SurveyScreen,
  outfit: OutfitScreen,
} as const

export default function App() {
  const screen = useAppStore((s) => s.screen)
  const history = useAppStore((s) => s.history)
  const Current = SCREENS[screen] ?? HomeScreen
  const depth = Math.min(history.length - 1, 2)

  /* 手机的系统返回键 / 返回手势：退一屏，而不是直接退出应用（详见文件末尾 useSystemBack） */
  useSystemBack()

  /* 聊天后台保活：开关在设置里；这里只负责按开关启停。
     自动播放可能被浏览器拒绝，所以第一次触摸 / 点击时再补一次。 */
  const backgroundKeepAlive = useUIStore((s) => s.backgroundKeepAlive)
  useEffect(() => {
    if (backgroundKeepAlive) void startChatKeepAlive()
    else stopChatKeepAlive()
  }, [backgroundKeepAlive])
  useEffect(() => {
    const wake = () => {
      unlockSfx()
      if (useUIStore.getState().backgroundKeepAlive) void resumeChatKeepAlive()
    }
    window.addEventListener('pointerdown', wake, { once: true })
    window.addEventListener('keydown', wake, { once: true })
    return () => {
      window.removeEventListener('pointerdown', wake)
      window.removeEventListener('keydown', wake)
    }
  }, [])

  /* 提示音：任何新消息 / 拍一拍都只响一次。
     第一次挂载时把已有记录记下来 —— 刷新后不会把整段聊天重播一遍。 */
  const messages = useChatStore((s) => s.messages)
  const seenMessages = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (!seenMessages.current) {
      seenMessages.current = new Set(messages.map((m) => m.id))
      return
    }
    const fresh = messages.filter((m) => !seenMessages.current?.has(m.id))
    for (const m of fresh) seenMessages.current.add(m.id)
    const meId = useChatStore.getState().conversation?.me.id
    for (const m of fresh) {
      if (m.kind === 'SYSTEM' || m.kind === 'CALL_EVENT') continue
      // 只给「此刻刚发生」的消息配声音：远端补拉的旧记录不响
      const at = +new Date(m.createdAt)
      if (Number.isFinite(at) && Date.now() - at > 20_000) continue
      const mine = m.senderId === meId
      if (m.kind === 'PAT') playSfx(mine ? 'myPat' : 'hisPat')
      else playSfx(mine ? 'myMessage' : 'hisMessage')
    }
  }, [messages])

  /* 系统状态栏 / 浏览器顶栏的颜色跟着主题走（装到桌面后是独立窗口，这一条最显眼）。
     主题是直接写 documentElement 的行内 CSS 变量的（lib/theme.ts），所以这里盯着属性变化。 */
  useEffect(() => {
    const root = document.documentElement
    const meta = document.querySelector('meta[name="theme-color"]')
    const apply = () => {
      const page = getComputedStyle(root).getPropertyValue('--ln-page').trim()
      if (meta && page) meta.setAttribute('content', `rgb(${page})`)
    }
    apply()
    const observer = new MutationObserver(apply)
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme', 'style'] })
    return () => observer.disconnect()
  }, [])

  return (
    <>
      <PhoneShell>
        <div className="relative flex min-h-0 flex-1 flex-col">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={screen}
            initial={{ x: 24 * (depth + 1), opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -24, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
            className="flex min-h-0 flex-1 flex-col bg-page"
          >
            <Current />
          </motion.div>
        </AnimatePresence>

        {/* 全局浮层：音乐小窗 / 通话（全屏 + 小窗）—— 切页面不会中断 */}
          <MusicMiniPlayer />
          <CallOverlay />
          <MessagePopup />
        </div>
      </PhoneShell>
      <ImageViewer />
    </>
  )
}

/**
 * 让手机的系统返回键 / 返回手势真的「退一屏」
 *
 * 背景：屏栈原本只存在内存里（`useAppStore.history`）。装在桌面（standalone）或全屏时，
 * 安卓的返回键不认识这套栈，一按就直接退出应用 —— 完全不像原生 App。
 *
 * 做法：把屏栈镜像到浏览器历史里（每条历史的 state 里存一份 `{ screen, history }`）。
 *   · 进新屏（栈变深）→ pushState 一条；
 *   · 应用内点「返回」（栈变浅）→ history.go(-n) 把那几条退掉，保持两边一致；
 *   · 系统返回 → 浏览器自己退一条 → popstate 里把 store 摆回那条历史存着的屏栈。
 * 顺带的好处：地址栏 hash 会跟着当前屏走，刷新留在原地，也能当深链用。
 */
function useSystemBack() {
  const screen = useAppStore((s) => s.screen)
  const stack = useAppStore((s) => s.history)
  const depth = stack.length
  /** 上一次同步时的栈深（null = 还没写过，首次写入当前位置） */
  const lastDepth = useRef<number | null>(null)
  /** 这次栈变化是「系统返回」引起的：浏览器已经退过了，不要再退一次 */
  const fromPop = useRef(false)

  useEffect(() => {
    const prev = lastDepth.current
    lastDepth.current = depth

    if (fromPop.current) {
      fromPop.current = false
      return
    }
    if (prev === null) {
      // 首次：把「当前位置」改写成带屏栈的 state（不新增历史条目）
      window.history.replaceState({ screen, history: stack }, '', `#${screen}`)
      return
    }
    if (depth > prev) {
      window.history.pushState({ screen, history: stack }, '', `#${screen}`)
    } else if (depth < prev) {
      window.history.go(depth - prev) // 负数 = 往回退
    } else if (window.location.hash !== `#${screen}`) {
      window.history.replaceState({ screen, history: stack }, '', `#${screen}`)
    }
  }, [depth, screen, stack])

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const st = e.state as { screen?: ScreenId; history?: ScreenId[] } | null
      fromPop.current = true
      const next =
        st?.screen && Array.isArray(st.history)
          ? { screen: st.screen, history: st.history }
          : { screen: 'home' as ScreenId, history: ['home'] as ScreenId[] }
      useAppStore.setState(next)
      // 把地址栏校准回来：极快地连点返回时，go(-n) 和 replaceState 可能抢跑，
      // 曾经出现过「人在主页、hash 还停在上一个屏」——刷新就会跳回去。
      if (window.location.hash !== `#${next.screen}`) {
        window.history.replaceState(next, '', `#${next.screen}`)
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
}
