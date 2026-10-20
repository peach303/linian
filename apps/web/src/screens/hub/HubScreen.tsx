import { NavBar } from '@/components/common/NavBar'
import { daySec, humanDur, modeMeta } from '@/lib/companion'
import { entryOf, todayKey } from '@/lib/diary'
import { pendingForMe, humanLeft, cooldownLeftMs } from '@/lib/check'
import { bucketOf, clockOf, hisNow } from '@/lib/world'
import { useAppStore, type ScreenId } from '@/store/useAppStore'
import { useCardsStore } from '@/store/useCardsStore'
import { useChatStore } from '@/store/useChatStore'
import { useRulesStore } from '@/store/useRulesStore'

/**
 * 功能模块 Hub：音乐 / 礼物 / 陪伴 / 世界感知 / 日记 / 纪念日 / 统计 / 适应度 /
 * 收藏 / 查岗 / 观影室 / 阅读室 / 拾取 / 情绪意图
 *
 * 已经做实的入口会把 `screen` 填上（点了就进对应屏幕）；
 * 没填的那些还在路上，暂时只作展示。
 */
const FEATURES: { key: string; label: string; icon: string; desc: string; screen?: ScreenId }[] = [
  { key: 'music', label: '音乐', icon: '🎧', desc: '一起听了多久', screen: 'music-room' },
  { key: 'gift', label: '礼物', icon: '🎁', desc: '与聊天互通', screen: 'gift-cabinet' },
  { key: 'companion', label: '陪伴', icon: '🌙', desc: '睡觉 / 学习 / 工作', screen: 'companion' },
  { key: 'outfit', label: '穿搭', icon: '👕', desc: '他今天穿什么', screen: 'outfit' },
  { key: 'world', label: '世界感知', icon: '🌍', desc: '时间差与状态', screen: 'world' },
  { key: 'diary', label: '日记', icon: '📔', desc: '想写几条都可以', screen: 'diary' },
  { key: 'anniversary', label: '纪念日', icon: '💙', desc: '显示在主界面', screen: 'anniversary' },
  { key: 'stats', label: '统计', icon: '📊', desc: '高频词 / 通话 / 红包', screen: 'stats' },
  { key: 'fitness', label: '适应度', icon: '🧭', desc: '字卡熟练度', screen: 'fitness' },
  { key: 'favorite', label: '收藏', icon: '⭐', desc: '语音 / 聊天 / 信件 / 朋友圈', screen: 'favorite' },
  { key: 'survey', label: '问卷', icon: '📋', desc: '题库 / 他问我 / 默契问卷', screen: 'survey' },
  { key: 'check', label: '查岗', icon: '🔍', desc: '可同意或拒绝', screen: 'check' },
  { key: 'watch', label: '观影室', icon: '🎬', desc: '导入链接一起看', screen: 'watch-room' },
  { key: 'read', label: '阅读室', icon: '📖', desc: '批注与弹幕', screen: 'read-room' },
  { key: 'pickup', label: '拾取', icon: '🧺', desc: '他的话存进字卡库', screen: 'card-library' },
  { key: 'emotion', label: '情绪意图', icon: '🏷️', desc: '标签可自定义', screen: 'emotion' },
]

export function HubScreen() {
  const push = useAppStore((s) => s.push)
  const dream = useAppStore((s) => s.dream)
  const room = useAppStore((s) => s.room)
  const companion = useAppStore((s) => s.companion)
  const watch = useAppStore((s) => s.watchRoom)
  const read = useAppStore((s) => s.readRoom)
  const diary = useAppStore((s) => s.diary)
  const world = useAppStore((s) => s.world)
  const checkPhone = useAppStore((s) => s.checkPhone)
  const me = useAppStore((s) => s.me)
  const anniversaries = useAppStore((s) => s.anniversaries)
  const emotionTags = useAppStore((s) => s.emotionTags)
  const questionPacks = useAppStore((s) => s.questionPacks)
  const quizSessions = useAppStore((s) => s.quizSessions)
  const checkRules = useRulesStore((s) => s.saved.checkPhone)
  const cards = useCardsStore((s) => s.cards)
  const messages = useChatStore((s) => s.messages)
  const meId = useChatStore((s) => s.conversation?.me.id ?? 'u_me')

  /** 陪伴卡：正在陪 / 今天陪了多久（都按真实记录算，没陪过就说实话） */
  const todaySec = daySec(companion)
  const companionText = companion.active
    ? `正在${modeMeta(companion.active.mode).verb} · 点进去看看`
    : todaySec > 0
      ? `今天陪了 ${humanDur(todaySec)} · 点此继续`
      : '睡觉 / 学习 / 工作'

  /**
   * 一起听时长：**真的播出来的秒数**（`<audio>` 在走才累加，网易云 / 只有歌名的曲目不算）。
   * 聊天里那些「他加入了」的邀请卡只是他答应了，不算时长。
   */
  const listenedSec = room.playedSec ?? 0
  const listenText =
    room.tracks.length === 0
      ? '歌单还是空的 · 点此导入本机音乐 / 贴直链 / 网易云'
      : listenedSec >= 60
        ? `歌单 ${room.tracks.length} 首 · 真的一起听了 ${Math.floor(listenedSec / 60)} 分 ${listenedSec % 60} 秒`
        : `歌单 ${room.tracks.length} 首 · 还没真的听过，点进去放一首`

  /** 提醒条：用聊天记录现算，不写死 */
  const his = messages.filter((m) => m.senderId !== meId)
  const tagCount = new Map<string, number>()
  his.forEach((m) => (m.emotionTags ?? []).forEach((t) => tagCount.set(t, (tagCount.get(t) ?? 0) + 1)))
  const topTag = [...tagCount.entries()].sort((a, b) => b[1] - a[1])[0]
  const reminder =
    his.length === 0
      ? '还没有聊天记录 —— 去聊天页跟他说句话'
      : topTag
        ? `他一共发来 ${his.length} 条消息 · 出现最多的情绪标签是「${topTag[0]}」（${topTag[1]} 次）`
        : `他一共发来 ${his.length} 条消息`

  /** 统计 / 适应度入口上的真实数字（聊天记录现算） */
  const usedCardIds = new Set<string>()
  for (const m of messages) m.plan?.cardIds?.forEach((id) => usedCardIds.add(id))
  const callsDone = messages.filter((m) => m.kind === 'CALL_EVENT' && (m.payload as { phase?: string } | undefined)?.phase !== 'CALLING').length

  const descOf = (key: string, fallback: string) => {
    if (key === 'companion') return companionText
    if (key === 'stats') return `${messages.length} 条消息 · 通话 ${callsDone} 次`
    if (key === 'fitness') return `字卡用过 ${usedCardIds.size} / ${cards.length} 张`
    if (key === 'watch') {
      if (watch.active) {
        const it = watch.items.find((i) => i.id === watch.active?.itemId)
        return it ? `正在看《${it.title}》${watch.active.heJoinedAt ? ' · 他在' : ''}` : '正在一起看'
      }
      if (watch.items.length === 0) return '片单还是空的 · 导入本机视频 / 直链 / B 站'
      return watch.playedSec >= 60
        ? `片单 ${watch.items.length} 部 · 真的一起看了 ${humanDur(Math.floor(watch.playedSec))}`
        : `片单 ${watch.items.length} 部 · 还没真的看过，点进去放一部`
    }
    if (key === 'read') {
      if (read.active) {
        const b = read.books.find((x) => x.id === read.active?.bookId)
        return b ? `正在读《${b.title}》${read.active.heJoinedAt ? ' · 他在' : ''}` : '正在一起读'
      }
      if (read.books.length === 0) return '书单还是空的 · 导入本机 txt / epub 或粘一段正文'
      return read.readSec >= 60
        ? `书单 ${read.books.length} 本 · 真的一起读了 ${humanDur(Math.floor(read.readSec))}`
        : `书单 ${read.books.length} 本 · 还没真的读过，点进去读一本`
    }
    if (key === 'diary') {
      const today = todayKey()
      const mine = entryOf(diary, me.id, today)
      const his = entryOf(diary, dream.id, today)
      if (his) return `他今天写了 · ${his.mood} ${his.text.slice(0, 14)}${his.text.length > 14 ? '…' : ''}`
      if (mine) return '你写过了 · 他今天还没写'
      return '今天还没写 · 想写几条都可以'
    }
    if (key === 'survey') {
      if (!questionPacks.length) return '题库还是空的 · 新建 / 导入题目'
      const last = quizSessions[0]
      return `${questionPacks.length} 套题${last?.score != null ? ` · 上次默契度 ${last.score}%` : ''}`
    }
    if (key === 'world') {
      const now = new Date()
      const his = hisNow(now, world.offsetMin)
      const samples = world.samples.length
      const time = `他那边 ${clockOf(his)}（${bucketOf(his)}）`
      if (world.offsetMin === 0) return `${time} · 时差没设，去填一下`
      return samples ? `${time} · 采过 ${samples} 次` : `${time} · 还没采过`
    }
    if (key === 'check') {
      const now = new Date()
      if (!checkRules.enabled) return '功能关着（设置 → 概率调节引擎）'
      if (pendingForMe(checkPhone.checks, me.id)) return '他在等你回应 · 点进去'
      const left = cooldownLeftMs(checkPhone.checks, checkRules.cooldownMin, me.id, now)
      if (left > 0) return `冷却中 · ${humanLeft(left)}后可查`
      const done = checkPhone.checks.length
      return done ? `查过 ${done} 次 · 现在可以查` : '可同意或拒绝 · 现在可以查'
    }
    if (key === 'anniversary') {
      if (!anniversaries.length) return '还没有 · 点进去加一个'
      const shown = anniversaries.filter((a) => a.showOnHome).length
      return `${anniversaries.length} 个 · 主界面显示 ${shown} 个`
    }
    if (key === 'emotion') {
      const used = new Set(messages.flatMap((m) => m.emotionTags ?? [])).size
      const mine = emotionTags.filter((t) => !t.builtin).length
      return used ? `${used} 个标签出现过 · 自己加了 ${mine} 个` : `还没出现过 · 自己加了 ${mine} 个`
    }
    return fallback
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-page">
      <NavBar title="功能" />
      <div className="no-scrollbar flex-1 overflow-y-auto px-4 pb-6">
        {/* 音乐卡：网易云风格入口 */}
        <button
          className="tap mt-3 flex w-full items-center gap-4 rounded-2xl bg-gradient-to-br from-[#5aa0e8] to-[#8fc4f8] p-4 text-white shadow-card"
          onClick={() => push('music-room')}
        >
          <span className="grid h-14 w-14 shrink-0 animate-[spin_12s_linear_infinite] place-items-center rounded-full bg-black/70 text-[26px]">
            💿
          </span>
          <span className="min-w-0 text-left">
            <span className="block text-[15px] font-medium">和{dream.nickname}一起听</span>
            <span className="block text-[12px] opacity-90">{listenText}</span>
          </span>
        </button>

        {/* 提醒条 */}
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/70 p-3 text-[12px] text-ink-sub shadow-card backdrop-blur">
          <span>❤️</span>
          <span>{reminder}</span>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-y-5">
          {FEATURES.map((f) => (
            <button
              key={f.key}
              className="tap flex flex-col items-center gap-1.5 disabled:opacity-55"
              title={f.screen ? descOf(f.key, f.desc) : `${f.desc}（还没做，暂不可点）`}
              disabled={!f.screen}
              onClick={f.screen ? () => push(f.screen!) : undefined}
            >
              <span className="relative grid h-14 w-14 place-items-center rounded-[18px] bg-white text-[24px] shadow-card">
                {f.icon}
                {f.key === 'companion' && companion.active && (
                  <span className="absolute right-1.5 top-1.5 h-2 w-2 animate-pulse rounded-full bg-brand" />
                )}
                {f.key === 'check' && pendingForMe(checkPhone.checks, me.id) && (
                  <span className="absolute right-1.5 top-1.5 h-2 w-2 animate-pulse rounded-full bg-brand" />
                )}
              </span>
              <span className="text-[11px] text-ink">{f.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
