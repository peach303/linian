/**
 * 启动引导（本地优先）
 *
 *   1) 只读本地（IndexedDB）→ 立即注入各 store → 渲染，首屏不闪烁、离线可用
 *   2) 渲染完成后后台拉远端：新数据覆盖本地、旧数据排队补发
 */
import { applyTheme } from '@/lib/theme'
import { API_ENABLED, PROXY_MODE, STATIC_ONLY } from '@/lib/deploy'
import { attachProactiveScheduler, attachReplyEngine } from '@/lib/engine/runtime'
import { finalizeStaleCalls, attachIncomingCallEngine } from '@/lib/engine/call'
import { attachCompanionEngine } from '@/lib/engine/companion'
import { attachRoomEngine } from '@/lib/engine/room'
import { attachWatchEngine } from '@/lib/engine/watch'
import { attachReadEngine } from '@/lib/engine/read'
import { attachDiaryEngine } from '@/lib/engine/diary'
import { attachWorldEngine } from '@/lib/engine/world'
import { attachCheckEngine } from '@/lib/engine/check'
import { attachSearchEngine } from '@/lib/engine/search'
import { attachTimeline } from '@/lib/engine/timeline'
import {
  flush,
  loadCardsLocal,
  loadMessagesLocal,
  loadRulesLocal,
  loadStateLocal,
  pullCards,
  pullMessages,
  pullRules,
  pullState,
  startSyncLoop,
} from '@/lib/repo'
import { useAppStore } from '@/store/useAppStore'
import { useAppearanceStore } from '@/store/useAppearanceStore'
import { useCardsStore } from '@/store/useCardsStore'
import { useChatStore } from '@/store/useChatStore'
import { useIntegrationsStore } from '@/store/useIntegrationsStore'
import { useRulesStore } from '@/store/useRulesStore'
import { MOCK_CONVERSATION } from '@/mock/chat'

export async function bootstrap() {
  /* ── ① 本地 ── */
  const [state, rules, msgs, cards] = await Promise.all([
    loadStateLocal(),
    loadRulesLocal(),
    loadMessagesLocal(MOCK_CONVERSATION.id),
    loadCardsLocal(),
  ])

  applyTheme(state.themeKey)
  useAppStore.getState().hydrate(state)
  // 美化最后应用：气泡 / 背景以用户的美化设置为准
  useAppearanceStore.getState().hydrate(state.appearance)
  useRulesStore.getState().hydrate(rules.rules, rules.version)
  useCardsStore.getState().hydrate(cards.cards, cards.version)
  // 注意：预设卡不在这里落库 —— 要等远端确认「真的没有卡库」，否则新设备会覆盖旧卡库（见 seedIfEmpty）
  if (msgs.length > 0) useChatStore.getState().hydrate(msgs)

  if (!STATIC_ONLY) startSyncLoop()
  /* 挂上拟真引擎：之后「我发的每条消息」都会触发一轮抽签出稿（本地，离线可用） */
  attachReplyEngine()
  /* 挂上主动调度：安静一会儿之后他自己来找你（气泡左上角 ❤️） */
  attachProactiveScheduler()
  /* 挂上朋友圈 / 信箱的时间轴：他发动态、点赞评论、写信回信、蓝色批注 */
  attachTimeline()
  /* 挂上一起听房间：他进房间、聊一首歌、往歌单加歌、到点先走（声音是她自己放的，这里只管他） */
  attachRoomEngine()
  /* 挂上陪伴：睡觉 / 学习 / 工作实际在计时，他到不到场、说不说话、走不走都在这里 */
  attachCompanionEngine()
  /* 挂上观影室：进度是真的（`<video>` 在走才算），他的弹幕与发言在这里排 */
  attachWatchEngine()
  /* 挂上阅读室：读秒是真的（开着 + 前台 + 还在翻页才算），他的批注与发言在这里排 */
  attachReadEngine()
  /* 挂上日记：他到点写（种子 = 日期），提到的事都从今天的真实记录里数；我的日记不限条数 */
  attachDiaryEngine()
  /* 挂上世界感知：他那边的钟点是真的（你设的时差），状态与在做的事按「日期 + 采样槽」抽 */
  attachWorldEngine()
  /* 挂上查岗：冷却是真的、报告里「真的」那一栏是现算的；他回应 3~12 秒（存 respondAt，钟到点结算） */
  attachCheckEngine()
  /* 上次关机时正在进行的通话 → 直接按「已挂断」落定，别卡在「正在通话」 */
  finalizeStaleCalls()
  /* 他偶尔会主动打来：受「规则 → 通话 → 主动来电」控制 */
  attachIncomingCallEngine()
  /* B 站视频推送：读同源静态片单，不依赖后端 / 代理，所以放在接入判断之前挂 */
  attachSearchEngine()

  if (!API_ENABLED) {
    /* 纯静态站：B 站推送照常可用；语音 / 跨设备同步不假装能用 */
    useIntegrationsStore.setState({
      loaded: true,
      reachable: false,
      note: '静态托管模式：语音 / 同步不可用；B 站视频推送读本机静态片单',
    })
  } else {
    /* 接入状态（MiniMax 语音能不能真的出声）：读到了才会把 INTEGRATIONS.tts 打开，
       读不到就一律「未接通」——引擎宁可只写轨迹，也不发假语音。
       放在渲染前（就是一次本机请求），免得第一条回复抽签时开关还没就位。 */
    await useIntegrationsStore.getState().refresh()

    /* ── ② 远端（后台，不阻塞渲染） ── */
    /* 静态 + 代理只借代理做语音 / 搜索，聊天数据仍只在本机，不拉也不推。 */
    if (!PROXY_MODE) void syncFromRemote()
  }
}

async function syncFromRemote() {
  const [remoteState, remoteRules, remoteCards] = await Promise.all([pullState(), pullRules(), pullCards()])

  if (remoteState) {
    applyTheme(remoteState.themeKey)
    useAppStore.getState().hydrate(remoteState)
    useAppearanceStore.getState().hydrate(remoteState.appearance)
  }

  if (remoteRules) useRulesStore.getState().hydrate(remoteRules.rules, remoteRules.version)

  // 字卡库：远端有数据就以远端为准（本地为空时 loadCardsLocal 给的是预设）
  if (remoteCards) useCardsStore.getState().hydrate(remoteCards.cards, remoteCards.version)
  // 远端没有卡库（第一次部署 / 后端刚清空）才把内存里的预设落库；
  // 刚 pull 过，remoteChecked 省掉重复请求
  else if (useCardsStore.getState().version === 0)
    void useCardsStore.getState().seedIfEmpty({ remoteChecked: true })

  // 聊天记录：远端为准**并**进本地（并集）——
  // 以前只在本地为空时才补拉，结果本地有 1 条旧记录就永远拉不回别的设备上的历史。
  const remote = await pullMessages(MOCK_CONVERSATION.id)
  if (remote?.length) useChatStore.getState().mergeMessages(remote)

  // 把离线期间攒下的操作补发
  await flush()
}
