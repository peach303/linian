/**
 * 规则默认值 + 字段元数据 + 读写工具
 * 默认值与 `packages/shared/src/schema/ruleConfig.ts` 的 zod default 保持一致。
 */
import type { ProbToggle, Range2, RuleConfig } from '@/types/rules'

/* ─────────────────────────── 默认值 ─────────────────────────── */

const t = (p: number, enabled = true): ProbToggle => ({ enabled, p })

export const DEFAULT_RULES: RuleConfig = {
  $version: 1,
  chat: {
    weights: { text: 0.35, kaomoji: 0.15, sticker: 0.35, image: 0.15 },
    replyInterval: [3, 25],
    replySentences: [1, 3],
    readNoReply: t(0.08),
    pat: t(0.06),
    quote: t(0.2),
    recall: t(0.05),
    recallResend: t(0.7),
    pinyinSentence: t(0.05, false),
    conjunction: t(0.25),
    punctuation: t(0.85),
    meaning: t(0.22),
    multiCard: { ...t(0.3), count: [2, 4] },
    freeSentence: t(0.2),
    pickup: t(0.1),
    typingIndicator: true,
    maxLengthPerSentence: 60,
  },
  proactive: {
    message: {
      enabled: true,
      /** 10 分钟 ~ 1 小时：以前 30 分钟 ~ 2 小时 + 每天 1~6 条，实际很容易一整天都不冒头 */
      interval: [600, 3600],
      dailyLimit: [2, 8],
      cancelIfRepliedWithin: 60,
      quietHours: ['00:30', '07:30'],
    },
    moment: { ...t(0.1), cooldownMin: 720 },
    letter: { ...t(0.03), cooldownMin: 1440 },
  },
  moment: {
    like: { p: 0.75, delay: [10, 3600] },
    comment: { p: 0.45, delay: [30, 5400] },
    replyMyReply: { p: 0.6 },
    likeBackIfILiked: { p: 0.55 },
  },
  choice: {
    enabled: true,
    p: 0.92,
    delay: [5, 240],
    reason: t(0.62),
    maxReasonChars: 40,
  },
  question: {
    enabled: true,
    p: 0.86,
    delay: [10, 900],
    skipPerItem: { p: 0.12 },
    noteP: 0.45,
    /** 他主动从题库里挑一套来问我：每个每日名额独立抽 */
    askMeP: 0.22,
    askCooldownMin: 720,
    /** 默契问卷「认真做」的概率；不认真就随机选 */
    seriousP: 0.78,
  },
  redPacket: {
    amount: [5, 200],
    claim: { enabled: true, p: 0.96, delay: [5, 600] },
    thanks: t(0.55),
    back: { enabled: true, p: 0.28, amount: [1.11, 20], delay: [60, 1800] },
    /** 主动发红包：金额可以很大，几位数都行 */
    sendMe: { ...t(0.04), cooldownMin: 720, amount: [52, 99999] },
  },
  gift: {
    accept: { enabled: true, p: 0.97, delay: [10, 900] },
    thanks: t(0.6),
    giveMe: { ...t(0.02), cooldownMin: 2880 },
  },
  call: {
    connect: { p: 0.7, delay: [3, 25] },
    reject: { p: 0.15 },
    busy: { p: 0.1 },
    miss: { p: 0.05 },
    hangup: { p: 0.3 },
    ringTimeoutSec: 45,
    afterTalk: t(0.5),
    outgoing: { ...t(0.04), cooldownMin: 240 },
    maxDurationMin: 90,
  },
  music: {
    join: { enabled: true, p: 0.88, delay: [5, 300] },
    say: t(0.7),
    listenMin: [8, 45],
    shareBack: t(0.35),
    lyric: t(0.3),
    /** 他主动邀请我一起听 */
    inviteMe: { ...t(0.04), cooldownMin: 720 },
    /** 他直接拿去网易云搜歌的关键词；搜到真歌才推荐 */
    keywords: ['晴天', '陈粒', 'City of Stars'],
  },
  doodle: {
    reply: { enabled: true, p: 0.85, delay: [10, 900] },
    drawBack: t(0.3),
    /** 他主动画一张发过来（不是等你先画） */
    proactive: { ...t(0.03), cooldownMin: 1440 },
  },
  mail: {
    length: [150, 600],
    randomPunctuation: true,
    reply: { enabled: true, p: 0.8 },
    replyLength: [80, 400],
    replyDelayH: [1, 48],
    annotation: t(0.35),
  },
  checkPhone: { enabled: true, cooldownMin: 720, acceptP: 0.65, fakeInfoP: 0.2, askMeP: 0.35, dailyLimit: 1 },
  emotion: { enabled: true, triggerP: 0.6, decayHours: 6 },
  voice: { enabled: false, p: 0.15, maxCharsPerVoice: 80, pace: 1, emotionMapping: true },
  favorite: { collect: t(0.12), cooldownMin: 180 },
  search: {
    enabled: false,
    p: 0.06,
    topics: ['音乐现场', '电影解说', '游戏实况', '知识科普', '美食探店', '旅行vlog', '萌宠', '科技数码'],
    pushIntervalMin: 240,
    /** 有可用图时，掷中这个概率就发**图片卡**（不然是链接卡） */
    imageP: 0.35,
    /** 推卡片时配一句真人口吻的附言（只说不评价内容的那种） */
    captionP: 0.55,
    /** 默认只看最近一周，避免推几个月前的旧闻 */
    freshness: 'oneWeek',
  },
  companion: {
    join: t(0.8),
    joinDelay: [30, 300],
    say: t(0.45),
    leave: t(0.2),
    leaveAfterMin: [15, 90],
    replyMe: t(0.9),
  },
  watchRoom: {
    join: t(0.85),
    joinDelay: [20, 240],
    danmaku: t(0.9),
    danmakuCount: [3, 8],
    say: t(0.5),
    leave: t(0.25),
    leaveAfterMin: [20, 100],
    replyMe: t(0.9),
  },
  readRoom: {
    join: t(0.85),
    joinDelay: [20, 240],
    mark: t(0.9),
    markCount: [2, 6],
    say: t(0.5),
    leave: t(0.25),
    leaveAfterMin: [20, 100],
    replyMe: t(0.9),
  },
  diary: {
    write: t(0.9),
    atTime: ['21:00', '23:30'],
    mentionReal: t(0.85),
    lines: [2, 6],
    replyMine: t(0.7),
  },
  world: {
    sample: t(0.9),
    intervalMin: [30, 240],
    status: t(0.9),
    doing: t(0.7),
    toChat: t(0.35),
  },
}

/* ─────────────────────── 字段元数据（驱动 UI） ─────────────────────── */

export type FieldKind =
  | 'prob' // { enabled, p } —— 开关 + 概率滑块
  | 'p' // 只有概率，无开关
  | 'range' // [min, max]，按 unit 换算显示
  | 'intRange' // [min, max] 整数（句数/张数/字数）
  | 'int' // 单值整数
  | 'number' // 单值小数
  | 'bool' // 开关
  | 'timeRange' // [HH:mm, HH:mm]
  | 'tags' // 字符串多选
  | 'keywords' // 自由输入的关键词（可增删）
  | 'select' // 单选下拉

export type FieldUnit = 'sec' | 'min' | 'hour' | 'count' | 'char' | 'x' | 'money'

export interface FieldMeta {
  /** 取值路径，如 'chat.readNoReply' */
  path: string
  label: string
  /** 在抽签顺序中的位置 / 作用说明 */
  desc?: string
  kind: FieldKind
  min?: number
  max?: number
  step?: number
  unit?: FieldUnit
  /** 子项：缩进显示，父项关闭时同步禁用 */
  child?: boolean
  /** 依赖的开关路径 */
  requires?: string
  /** 标签 / 下拉可选项（kind = tags / select） */
  options?: string[]
  /** 下拉选项的人话标签（值 → 显示名） */
  optionLabels?: Record<string, string>
}

export interface RuleGroup {
  key: string
  label: string
  icon: string
  blurb: string
  fields: FieldMeta[]
}

export const RULE_GROUPS: RuleGroup[] = [
  {
    key: 'chat',
    label: '聊天回复',
    icon: '💬',
    blurb: '一次回复的完整抽签链路：已读不回 → 拍一拍 → 载体 → 拼接 → 组句 → 延迟',
    fields: [
      { path: 'chat.replyInterval', label: '回复间隔', desc: '① 抽完载体后，隔多久才发出来', kind: 'range', min: 1, max: 600, step: 1, unit: 'sec' },
      { path: 'chat.replySentences', label: '回复句数', desc: '⑧ 一次最多连发几句', kind: 'intRange', min: 1, max: 8, step: 1, unit: 'count' },
      { path: 'chat.readNoReply', label: '已读不回', desc: '抽签第 1 步：命中则本轮什么都不发', kind: 'prob' },
      { path: 'chat.pat', label: '拍一拍', desc: '抽签第 2 步：先拍一下再继续回复', kind: 'prob' },
      { path: 'chat.quote', label: '引用回复', desc: '抽签第 7 步：回复时带上你那句话', kind: 'prob' },
      { path: 'chat.recall', label: '撤回', desc: '抽签第 6 步：发出后 2~6 秒撤回', kind: 'prob' },
      { path: 'chat.recallResend', label: '撤回后补发', desc: '撤回之后重新发一条', kind: 'prob', child: true, requires: 'chat.recall' },
      { path: 'chat.pinyinSentence', label: '拼音造句', desc: '用拼音拼句子（wei shen me ne）', kind: 'prob' },
      { path: 'chat.conjunction', label: '连词', desc: '而且 / 但是 / 所以…让句子更像人话', kind: 'prob' },
      { path: 'chat.punctuation', label: '标点符号', desc: '关闭后整句不带标点', kind: 'prob' },
      { path: 'chat.meaning', label: '自带本意', desc: '他发消息时附带「本意 / 在说谁」的概率；长按也可以随时问', kind: 'prob' },
      { path: 'chat.multiCard', label: '多字卡拼接', desc: '抽签第 4 步：一次拼多张卡', kind: 'prob' },
      { path: 'chat.multiCard.count', label: '拼接张数', desc: '最多 / 最少几张', kind: 'intRange', min: 1, max: 8, step: 1, unit: 'count', child: true, requires: 'chat.multiCard' },
      { path: 'chat.freeSentence', label: '自由组句', desc: '交给 LLM 造句，而不是照搬字卡', kind: 'prob' },
      { path: 'chat.pickup', label: '拾取', desc: '抽中则把你这句话存进他的字卡库', kind: 'prob' },
      { path: 'chat.typingIndicator', label: '「正在输入」', desc: '是否显示打字气泡', kind: 'bool' },
      { path: 'chat.maxLengthPerSentence', label: '单句最大长度', desc: '超出自动截断', kind: 'int', min: 10, max: 200, step: 5, unit: 'char' },
    ],
  },
  {
    key: 'search',
    label: 'B 站视频',
    icon: '📺',
    blurb: '他按你写的关键词从 B 站热门片单里挑真视频推给你；片单定时刷新，读不到就一条都不推',
    fields: [
      { path: 'search.enabled', label: 'B 站视频推送', desc: '关闭后他不会再往聊天里推视频', kind: 'bool' },
      { path: 'search.p', label: '每个间隔推一次的概率', desc: '和「推送关键词」一起用；片单读不到时只记轨迹，不伪造结果', kind: 'p', requires: 'search.enabled' },
      { path: 'search.topics', label: '推送关键词', desc: '按这些词匹配 B 站片单：音乐现场、游戏实况、知识科普、萌宠… 一行一个；匹配不到才从当前热门里挑', kind: 'keywords', requires: 'search.enabled' },
      { path: 'search.pushIntervalMin', label: '两次推送至少隔多久', desc: '分钟；同一间隔里最多试一次', kind: 'int', min: 10, max: 10080, step: 10, unit: 'min', requires: 'search.enabled' },
      { path: 'search.captionP', label: '配一句附言', desc: '只说他看到什么，不评价内容', kind: 'p', requires: 'search.enabled' },
    ],
  },
  {
    key: 'proactive',
    label: '主动行为',
    icon: '❤️',
    blurb: '他主动发来的消息，气泡左上角会带小爱心标识',
    fields: [
      { path: 'proactive.message.enabled', label: '主动发消息', kind: 'bool' },
      { path: 'proactive.message.interval', label: '主动间隔', desc: '随机落在区间内排一条定时任务', kind: 'range', min: 60, max: 21600, step: 60, unit: 'sec', child: true, requires: 'proactive.message.enabled' },
      { path: 'proactive.message.dailyLimit', label: '每日数量限制', kind: 'intRange', min: 0, max: 20, step: 1, unit: 'count', child: true, requires: 'proactive.message.enabled' },
      { path: 'proactive.message.cancelIfRepliedWithin', label: '被打断窗口', desc: '这段时间内你回过话，就取消这条主动消息', kind: 'int', min: 0, max: 600, step: 10, unit: 'sec', child: true, requires: 'proactive.message.enabled' },
      { path: 'proactive.message.quietHours', label: '免打扰时段', desc: '这段时间内不主动打扰', kind: 'timeRange', child: true, requires: 'proactive.message.enabled' },
      { path: 'proactive.moment', label: '主动发朋友圈', kind: 'prob' },
      { path: 'proactive.moment.cooldownMin', label: '朋友圈冷却', desc: '两次之间的最短间隔', kind: 'int', min: 0, max: 4320, step: 30, unit: 'min', child: true, requires: 'proactive.moment' },
      { path: 'proactive.letter', label: '主动写信', kind: 'prob' },
      { path: 'proactive.letter.cooldownMin', label: '写信冷却', kind: 'int', min: 0, max: 10080, step: 60, unit: 'min', child: true, requires: 'proactive.letter' },
    ],
  },
  {
    key: 'moment',
    label: '朋友圈',
    icon: '🌈',
    blurb: '点赞与评论的响应速度，决定他「刷到就能回」还是「隔天补赞」',
    fields: [
      { path: 'moment.like.p', label: '点赞概率', kind: 'p' },
      { path: 'moment.like.delay', label: '点赞响应', desc: '最快 / 最慢', kind: 'range', min: 5, max: 86400, step: 5, unit: 'sec' },
      { path: 'moment.comment.p', label: '评论概率', kind: 'p' },
      { path: 'moment.comment.delay', label: '评论响应', desc: '最快 / 最慢', kind: 'range', min: 5, max: 86400, step: 5, unit: 'sec' },
      { path: 'moment.replyMyReply', label: '回复我的回复', kind: 'p' },
      { path: 'moment.likeBackIfILiked', label: '我赞后他回赞', kind: 'p' },
    ],
  },
  {
    key: 'cards',
    label: '递东西',
    icon: '🎁',
    blurb: '「+」里递给他的每样东西：他答不答、多久答、答完说不说话；红包 / 礼物 / 音乐 / 涂鸦能不能真送出去',
    fields: [
      { path: 'choice.enabled', label: '抉择 · 会答', desc: '不答的话卡片会一直停在「等你问他」', kind: 'bool' },
      { path: 'choice.p', label: '抉择 · 答应率', kind: 'p', requires: 'choice.enabled' },
      { path: 'choice.delay', label: '抉择 · 回答延迟', desc: '最快 / 最慢', kind: 'range', min: 1, max: 3600, step: 1, unit: 'sec', child: true, requires: 'choice.enabled' },
      { path: 'choice.reason', label: '抉择 · 附理由', desc: '选完再告诉你为什么这么选', kind: 'prob', child: true, requires: 'choice.enabled' },
      { path: 'choice.maxReasonChars', label: '理由最大长度', kind: 'int', min: 6, max: 120, step: 2, unit: 'char', child: true, requires: 'choice.enabled' },
      { path: 'question.enabled', label: '问卷 · 会填', desc: '不填的话他会一直没交卷', kind: 'bool' },
      { path: 'question.p', label: '问卷 · 认真填的概率', kind: 'p', requires: 'question.enabled' },
      { path: 'question.delay', label: '问卷 · 交卷延迟', desc: '最快 / 最慢', kind: 'range', min: 5, max: 7200, step: 5, unit: 'sec', child: true, requires: 'question.enabled' },
      { path: 'question.skipPerItem.p', label: '问卷 · 单题留空', desc: '每一题都有这个概率空着不答', kind: 'p', child: true, requires: 'question.enabled' },
      { path: 'question.noteP', label: '问卷 · 写补充说明', desc: '交卷时再补一句备注', kind: 'p', child: true, requires: 'question.enabled' },
      { path: 'question.askMeP', label: '问卷 · 他主动来问你', desc: '每天从「功能 → 问卷」的题库里挑一套来问你；每个名额独立抽', kind: 'p', child: true, requires: 'question.enabled' },
      { path: 'question.askCooldownMin', label: '他提问的冷却', desc: '两次主动提问之间至少隔多久', kind: 'int', min: 0, max: 10080, step: 30, unit: 'min', child: true, requires: 'question.enabled' },
      { path: 'question.seriousP', label: '默契问卷 · 认真做', desc: '不认真就随机选；认真时答案更像「他自己」', kind: 'p', child: true, requires: 'question.enabled' },
      { path: 'redPacket.claim.enabled', label: '红包 · 会领', desc: '不领的话红包会一直躺在聊天里', kind: 'bool' },
      { path: 'redPacket.claim.p', label: '红包 · 领取概率', kind: 'p', requires: 'redPacket.claim.enabled' },
      { path: 'redPacket.claim.delay', label: '红包 · 领取延迟', desc: '最快 / 最慢', kind: 'range', min: 1, max: 7200, step: 1, unit: 'sec', child: true, requires: 'redPacket.claim.enabled' },
      { path: 'redPacket.thanks', label: '红包 · 说声谢谢', desc: '领完再回你一句', kind: 'prob', child: true, requires: 'redPacket.claim.enabled' },
      { path: 'redPacket.amount', label: '我发随机红包的金额', desc: '最少 / 最多', kind: 'range', min: 0.01, max: 2000, step: 1, unit: 'money' },
      { path: 'redPacket.back', label: '红包 · 他会回一个', desc: '和「会不会领」是两件独立的事', kind: 'prob' },
      { path: 'redPacket.back.p', label: '回红包概率', kind: 'p', child: true, requires: 'redPacket.back' },
      { path: 'redPacket.back.amount', label: '回红包金额', desc: '最少 / 最多', kind: 'range', min: 0.01, max: 2000, step: 1, unit: 'money', child: true, requires: 'redPacket.back' },
      { path: 'redPacket.back.delay', label: '回红包延迟', desc: '最快 / 最慢', kind: 'range', min: 5, max: 86400, step: 5, unit: 'sec', child: true, requires: 'redPacket.back' },
      { path: 'redPacket.sendMe', label: '红包 · 他主动发', desc: '不等你先发；按冷却时间掷签，金额可以很大', kind: 'prob' },
      { path: 'redPacket.sendMe.cooldownMin', label: '主动红包冷却', desc: '两次主动红包之间至少隔多久', kind: 'int', min: 0, max: 10080, step: 30, unit: 'min', child: true, requires: 'redPacket.sendMe' },
      { path: 'redPacket.sendMe.amount', label: '主动红包金额', desc: '最少 / 最多（会偶尔抽 520 / 1314 / 99999 这种数）', kind: 'range', min: 0.01, max: 999999, step: 1, unit: 'money', child: true, requires: 'redPacket.sendMe' },
      { path: 'gift.accept.enabled', label: '礼物 · 会收下', desc: '不收下的话礼物卡会一直是「等他拆」', kind: 'bool' },
      { path: 'gift.accept.p', label: '礼物 · 收下概率', kind: 'p', requires: 'gift.accept.enabled' },
      { path: 'gift.accept.delay', label: '礼物 · 收下延迟', desc: '最快 / 最慢', kind: 'range', min: 5, max: 7200, step: 5, unit: 'sec', child: true, requires: 'gift.accept.enabled' },
      { path: 'gift.thanks', label: '礼物 · 说声谢谢', kind: 'prob', child: true, requires: 'gift.accept.enabled' },
      { path: 'gift.giveMe', label: '礼物 · 他主动送', kind: 'prob' },
      { path: 'gift.giveMe.cooldownMin', label: '送礼冷却', kind: 'int', min: 0, max: 10080, step: 60, unit: 'min', child: true, requires: 'gift.giveMe' },
      { path: 'music.keywords', label: '音乐关键词', desc: '他会拿这些词直接去网易云搜歌，搜到真歌才推荐 / 邀请你一起听；一行一个', kind: 'keywords' },
      { path: 'music.join.enabled', label: '音乐 · 会加入一起听', desc: '不加入的话歌单会一直挂着', kind: 'bool' },
      { path: 'music.join.p', label: '音乐 · 加入概率', kind: 'p', requires: 'music.join.enabled' },
      { path: 'music.join.delay', label: '音乐 · 加入延迟', desc: '最快 / 最慢', kind: 'range', min: 3, max: 7200, step: 1, unit: 'sec', child: true, requires: 'music.join.enabled' },
      { path: 'music.say', label: '音乐 · 说一句', desc: '听完对这首歌的看法；有歌词时会优先从歌词里截一句', kind: 'prob', child: true, requires: 'music.join.enabled' },
      { path: 'music.lyric', label: '音乐 · 歌词当一句话', desc: '他主动发消息时，偶尔把最近一首歌（网易云 / QQ 音乐）的歌词截一句发过来（只从真歌词里截）', kind: 'prob' },
      { path: 'music.listenMin', label: '音乐 · 一起听多久', desc: '最少 / 最多', kind: 'range', min: 1, max: 600, step: 1, unit: 'min', child: true, requires: 'music.join.enabled' },
      { path: 'music.shareBack', label: '音乐 · 他回推一首歌', kind: 'prob', child: true, requires: 'music.join.enabled' },
      { path: 'music.inviteMe', label: '音乐 · 他主动邀请你', desc: '不等你先邀请；会从你的歌单里挑一首，或推他自己的歌', kind: 'prob' },
      { path: 'music.inviteMe.cooldownMin', label: '主动邀请冷却', desc: '两次主动邀请之间至少隔多久', kind: 'int', min: 0, max: 10080, step: 30, unit: 'min', child: true, requires: 'music.inviteMe' },
      { path: 'doodle.reply.enabled', label: '涂鸦 · 他会回话', desc: '不回的画会一直躺着', kind: 'bool' },
      { path: 'doodle.reply.p', label: '涂鸦 · 回话概率', kind: 'p', requires: 'doodle.reply.enabled' },
      { path: 'doodle.reply.delay', label: '涂鸦 · 回话延迟', desc: '最快 / 最慢', kind: 'range', min: 5, max: 7200, step: 5, unit: 'sec', child: true, requires: 'doodle.reply.enabled' },
      { path: 'doodle.drawBack', label: '涂鸦 · 他画一张回你', kind: 'prob', child: true, requires: 'doodle.reply.enabled' },
      { path: 'doodle.proactive', label: '涂鸦 · 他主动画给你', desc: '不等你先画；按冷却时间掷签', kind: 'prob' },
      { path: 'doodle.proactive.cooldownMin', label: '主动涂鸦冷却', desc: '两次主动涂鸦之间至少隔多久', kind: 'int', min: 0, max: 10080, step: 30, unit: 'min', child: true, requires: 'doodle.proactive' },
    ],
  },
  {
    key: 'call',
    label: '通话',
    icon: '📞',
    blurb: '拨出后按概率走向接通 / 拒绝 / 忙线 / 无人接听；接通后按抽到的时长计时，挂断会留下通话记录',
    fields: [
      { path: 'call.connect.p', label: '接通', kind: 'p' },
      { path: 'call.connect.delay', label: '响铃多久接起', desc: '最快 / 最慢', kind: 'range', min: 1, max: 300, step: 1, unit: 'sec', child: true },
      { path: 'call.reject.p', label: '拒绝', kind: 'p' },
      { path: 'call.busy.p', label: '忙线', kind: 'p' },
      { path: 'call.miss.p', label: '无人接听', kind: 'p' },
      { path: 'call.ringTimeoutSec', label: '响铃超时', desc: '超过这个秒数还没人接就挂掉', kind: 'int', min: 5, max: 600, step: 5, unit: 'sec' },
      { path: 'call.hangup.p', label: '他先挂断', kind: 'p' },
      { path: 'call.afterTalk', label: '挂断后回一句', kind: 'prob' },
      { path: 'call.outgoing', label: '主动来电', kind: 'prob' },
      { path: 'call.outgoing.cooldownMin', label: '来电冷却', kind: 'int', min: 0, max: 1440, step: 10, unit: 'min', child: true, requires: 'call.outgoing' },
      { path: 'call.maxDurationMin', label: '最长通话时长', kind: 'int', min: 1, max: 480, step: 1, unit: 'min' },
    ],
  },
  {
    key: 'mail',
    label: '信箱',
    icon: '✉️',
    blurb: '信件与回信的字数、标点随机，以及蓝色手写批注',
    fields: [
      { path: 'mail.length', label: '写信字数', desc: '最少 / 最多', kind: 'intRange', min: 20, max: 3000, step: 10, unit: 'char' },
      { path: 'mail.replyLength', label: '回信字数', kind: 'intRange', min: 20, max: 3000, step: 10, unit: 'char' },
      { path: 'mail.replyDelayH', label: '回信延迟', desc: '最少 / 最多', kind: 'intRange', min: 0, max: 240, step: 1, unit: 'hour' },
      { path: 'mail.reply.enabled', label: '会回信', kind: 'bool' },
      { path: 'mail.reply.p', label: '回信概率', kind: 'p', requires: 'mail.reply.enabled' },
      { path: 'mail.randomPunctuation', label: '标点随机', desc: '偶尔少一个句号，更像手写', kind: 'bool' },
      { path: 'mail.annotation', label: '蓝色手写批注', desc: '他会用蓝笔在你的信上写批注', kind: 'prob' },
    ],
  },
  {
    key: 'favorite',
    label: '收藏',
    icon: '⭐',
    blurb: '他会不会偷偷把你发的东西收进他的收藏夹；收的时候会写一句原因',
    fields: [
      { path: 'favorite.collect', label: '他收藏我的东西', desc: '聊天 / 字卡 / 语音 / 信件 / 朋友圈，按条独立抽签；种子 = 那条内容的 id，刷新不重掷', kind: 'prob' },
      { path: 'favorite.cooldownMin', label: '收藏冷却', desc: '两次「他收藏」之间至少隔多久，避免一口气收一堆', kind: 'int', min: 0, max: 10080, step: 30, unit: 'min', child: true, requires: 'favorite.collect' },
    ],
  },
  {
    key: 'extra',
    label: '其他',
    icon: '🧩',
    blurb: '查岗 / 情绪标签 / MiniMax 语音 / 联网搜索推送',
    fields: [
      { path: 'checkPhone.enabled', label: '查岗', desc: '开启后才会发起形式化查手机 / 定位', kind: 'bool' },
      { path: 'checkPhone.cooldownMin', label: '查岗冷却', kind: 'int', min: 0, max: 10080, step: 30, unit: 'min', child: true, requires: 'checkPhone.enabled' },
      { path: 'checkPhone.acceptP', label: '被查方同意率', kind: 'p', child: true, requires: 'checkPhone.enabled' },
      { path: 'checkPhone.fakeInfoP', label: '给「修饰过」的信息', kind: 'p', child: true, requires: 'checkPhone.enabled' },
      { path: 'checkPhone.askMeP', label: '他今天来不来查你', desc: '种子 = 日期；每个每日名额独立抽一次；他问了你回不回就看你点不点', kind: 'p', child: true, requires: 'checkPhone.enabled' },
      { path: 'checkPhone.dailyLimit', label: '他每天最多查几次', desc: '1~5 条；默认 1 条，不超过 5 条', kind: 'int', min: 1, max: 5, step: 1, unit: 'count', child: true, requires: 'checkPhone.enabled' },
      { path: 'emotion.enabled', label: '情绪标签', desc: '字卡自动带情绪 / 心意 / 意图标签', kind: 'bool' },
      { path: 'emotion.triggerP', label: '标签触发概率', kind: 'p', requires: 'emotion.enabled' },
      { path: 'emotion.decayHours', label: '情绪衰减', desc: '多久之后情绪淡去', kind: 'int', min: 1, max: 72, step: 1, unit: 'hour', requires: 'emotion.enabled' },
      { path: 'voice.enabled', label: 'MiniMax 真实语音', desc: '需在「接口与扩展」里填 API Key', kind: 'bool' },
      { path: 'voice.p', label: '发语音概率', kind: 'p', requires: 'voice.enabled' },
      { path: 'voice.maxCharsPerVoice', label: '单条语音字数上限', kind: 'int', min: 10, max: 300, step: 10, unit: 'char', child: true, requires: 'voice.enabled' },
      { path: 'voice.pace', label: '语速', kind: 'number', min: 0.5, max: 2, step: 0.05, unit: 'x', child: true, requires: 'voice.enabled' },
      { path: 'voice.emotionMapping', label: '按情绪变调', desc: '用情绪标签驱动语气', kind: 'bool', child: true, requires: 'voice.enabled' },

    ],
  },
  {
    key: 'companion',
    label: '陪伴',
    icon: '🌙',
    blurb: '睡觉 / 学习 / 工作：陪伴是真的在计时，这里调的是「他」的表现 —— 一叫就来吗、中途说不说话、会不会先走',
    fields: [
      { path: 'companion.join', label: '一叫就来', desc: '没命中的话他会说「先忙一会儿」——忙多久见下一行', kind: 'prob' },
      { path: 'companion.joinDelay', label: '他「一会儿」是多久', desc: '最快 / 最慢（秒）', kind: 'range', min: 5, max: 3600, step: 5, unit: 'sec', child: true, requires: 'companion.join' },
      { path: 'companion.say', label: '中途说一句', desc: '每 10 分钟一个节拍抽一次（同一个节拍刷新不会重掷）', kind: 'prob' },
      { path: 'companion.replyMe', label: '房间里回我一句', kind: 'prob' },
      { path: 'companion.leave', label: '他会先走', desc: '他也有自己的事；走了之后陪伴继续计时，只是他不出声了', kind: 'prob' },
      { path: 'companion.leaveAfterMin', label: '先走的时间点', desc: '从开始算起（分钟）', kind: 'range', min: 1, max: 600, step: 1, unit: 'min', child: true, requires: 'companion.leave' },
    ],
  },
  {
    key: 'watchRoom',
    label: '观影室',
    icon: '🎬',
    blurb: '一起看片：进度是真的（本机文件 / 直链），他的弹幕与发言是抽出来的 —— 这里调「他」的表现',
    fields: [
      { path: 'watchRoom.join', label: '他一起看', desc: '没命中的话他会说「一会儿再来」——多久见下一行', kind: 'prob' },
      { path: 'watchRoom.joinDelay', label: '他「一会儿」是多久', desc: '最快 / 最慢（秒）', kind: 'range', min: 5, max: 3600, step: 5, unit: 'sec', child: true, requires: 'watchRoom.join' },
      { path: 'watchRoom.danmaku', label: '他会发弹幕', desc: '关掉就是他也看，但一句话都不说', kind: 'prob' },
      { path: 'watchRoom.danmakuCount', label: '这一场发几条', desc: '最少 / 最多（位置按片子时长散开，看到那个时间点才冒出来）', kind: 'intRange', min: 0, max: 30, step: 1, unit: 'count', child: true, requires: 'watchRoom.danmaku' },
      { path: 'watchRoom.say', label: '房间里说一句', desc: '按播放进度抽（同一次观影不重复说）', kind: 'prob' },
      { path: 'watchRoom.replyMe', label: '房间里回我一句', kind: 'prob' },
      { path: 'watchRoom.leave', label: '他会先走', desc: '他也有自己的事；走了之后片照放，只是他不出声了', kind: 'prob' },
      { path: 'watchRoom.leaveAfterMin', label: '先走的时间点', desc: '从开始算起（分钟）', kind: 'range', min: 1, max: 600, step: 1, unit: 'min', child: true, requires: 'watchRoom.leave' },
    ],
  },
  {
    key: 'readRoom',
    label: '阅读室',
    icon: '📖',
    blurb: '一起读：进度是真的（本机 txt / md / html / epub 或粘进来的正文），他写在页边的批注与短句是抽出来的',
    fields: [
      { path: 'readRoom.join', label: '他一起读', desc: '没命中的话他会说「一会儿过来」——多久见下一行', kind: 'prob' },
      { path: 'readRoom.joinDelay', label: '他「一会儿」是多久', desc: '最快 / 最慢（秒）', kind: 'range', min: 5, max: 3600, step: 5, unit: 'sec', child: true, requires: 'readRoom.join' },
      { path: 'readRoom.mark', label: '他会在页边写字', desc: '关掉就是他陪着读，但一个字都不写', kind: 'prob' },
      { path: 'readRoom.markCount', label: '这一本写几处', desc: '最少 / 最多（位置按段落散开，读到那一段才显示）', kind: 'intRange', min: 0, max: 30, step: 1, unit: 'count', child: true, requires: 'readRoom.mark' },
      { path: 'readRoom.say', label: '房间里说一句', desc: '按读到的进度抽（同一次共读不重复说）', kind: 'prob' },
      { path: 'readRoom.replyMe', label: '房间里回我一句', kind: 'prob' },
      { path: 'readRoom.leave', label: '他会先走', desc: '他也有自己的事；走了之后书照读，只是他不出声了', kind: 'prob' },
      { path: 'readRoom.leaveAfterMin', label: '先走的时间点', desc: '从开始算起（分钟）', kind: 'range', min: 1, max: 600, step: 1, unit: 'min', child: true, requires: 'readRoom.leave' },
    ],
  },
  {
    key: 'diary',
    label: '日记',
    icon: '📔',
    blurb: '日记：想写就写、不限条数，每条都能选公开 / 私密；他写不写、几点写、提不提今天真发生过的事，都在这里',
    fields: [
      { path: 'diary.write', label: '他今天写不写', desc: '他自动写的那条每天最多一次；到点才写，界面上会照实说「还没写」', kind: 'prob' },
      { path: 'diary.atTime', label: '他大概几点写', desc: '到这个点之前他还没写（当天第一次打开时抽一次，之后不会再变）', kind: 'timeRange', child: true, requires: 'diary.write' },
      { path: 'diary.mentionReal', label: '提不提今天真发生的事', desc: '只提真的发生过的（聊了多少 / 通话 / 一起听 / 陪伴 / 一起看片读书…），没发生过就不提', kind: 'prob', child: true, requires: 'diary.write' },
      { path: 'diary.lines', label: '这条留言几句', desc: '最少 / 最多', kind: 'intRange', min: 1, max: 12, step: 1, unit: 'count', child: true, requires: 'diary.write' },
      { path: 'diary.replyMine', label: '我写完他也写一条', desc: '我今天先写了的话，他随后也会写一条（顺着我的话写）', kind: 'prob' },
    ],
  },
  {
    key: 'world',
    label: '世界感知',
    icon: '🌍',
    blurb: '他那边的钟点是真的（按你设的时差换算），状态与在做的事是抽出来的 —— 天气没接源，就不显示',
    fields: [
      { path: 'world.sample', label: '到点自动采一条', desc: '「他那边现在怎么样」——种子 = 日期 + 采样槽，同一段时间里是同一个答案', kind: 'prob' },
      { path: 'world.intervalMin', label: '两次采样至少隔多久', desc: '分钟；顺便决定「采样槽」有多长（同一槽里答案不变）', kind: 'range', min: 5, max: 720, step: 5, unit: 'min', child: true, requires: 'world.sample' },
      { path: 'world.status', label: '带「在忙 / 刚起床」这种状态', desc: '按他那边的时段抽，只抽跟时段搭得上的', kind: 'prob', child: true, requires: 'world.sample' },
      { path: 'world.doing', label: '带「正在做的事」', desc: '同上，抽签', kind: 'prob', child: true, requires: 'world.sample' },
      { path: 'world.toChat', label: '顺手在聊天里说一句', desc: '每天最多一条（种子 = 日期），你正处在免打扰时段就不说', kind: 'prob' },
    ],
  },
]

/* ───────────────────────── 读写工具 ───────────────────────── */

/**
 * 把存下来的（老版本）规则补齐到当前结构：
 * 新增的字段用 `DEFAULT_RULES` 兜底，已存的字段原样保留。
 * 不然本地/后端存的是旧结构时，引擎读到 `rules.choice.p` 会是 undefined，概率直接失效。
 */
export function withRuleDefaults(stored: unknown): RuleConfig {
  const merge = (base: unknown, over: unknown): unknown => {
    if (over === undefined || over === null) return base
    if (Array.isArray(base) || Array.isArray(over)) return over
    if (typeof base === 'object' && typeof over === 'object') {
      const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
      for (const k of Object.keys(over as Record<string, unknown>)) {
        out[k] = merge((base as Record<string, unknown>)[k], (over as Record<string, unknown>)[k])
      }
      return out
    }
    return over
  }
  const out = merge(structuredClone(DEFAULT_RULES), stored) as RuleConfig

  /**
   * 旧默认值迁移：只改「还停在旧默认」的那一份，用户自己调过的不动。
   * 之前的主动消息太稀疏（30 分钟~2 小时、每天 1~6 条），很多人一天都收不到一条。
   */
  const msg = out.proactive?.message
  if (msg) {
    if (msg.interval?.[0] === 1800 && msg.interval?.[1] === 7200) msg.interval = [600, 3600]
    if (msg.dailyLimit?.[0] === 1 && msg.dailyLimit?.[1] === 6) msg.dailyLimit = [2, 8]
  }

  /** 旧版搜索主题是一组固定标签；还停在旧默认的，换成 B 站关键词 */
  const oldTopics = ['新闻', '搞笑', '美食', '猫狗', '电影', '摄影', '音乐', '风景', '游戏', '日常']
  if (Array.isArray(out.search?.topics) && out.search.topics.length === oldTopics.length &&
      oldTopics.every((t, i) => out.search.topics[i] === t)) {
    out.search.topics = [...DEFAULT_RULES.search.topics]
  }
  const bochaTopics = ['今天的新闻', '最近的热点', '本周新电影', '最近好听的歌', '本地天气', '可爱猫狗']
  if (Array.isArray(out.search?.topics) && out.search.topics.length === bochaTopics.length &&
      bochaTopics.every((t, i) => out.search.topics[i] === t)) {
    out.search.topics = [...DEFAULT_RULES.search.topics]
  }
  return out
}

export function getAtPath(root: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>((acc, k) => (acc == null ? acc : (acc as Record<string, unknown>)[k]), root)
}

/** 不可变写入：返回新的 RuleConfig */
export function setAtPath<T>(root: T, path: string, value: unknown): T {
  const keys = path.split('.')
  const clone = structuredClone(root) as Record<string, unknown>
  let cur: Record<string, unknown> = clone
  for (let i = 0; i < keys.length - 1; i++) {
    cur = cur[keys[i]] as Record<string, unknown>
  }
  cur[keys[keys.length - 1]] = value
  return clone as T
}

/* ───────────────────── 字卡占比（可读性换算） ───────────────────── */

export const WEIGHT_LABELS: { key: keyof RuleConfig['chat']['weights']; label: string; color: string }[] = [
  { key: 'text', label: '文字', color: '#5B9BE8' },
  { key: 'kaomoji', label: '颜文字', color: '#8FC2F5' },
  { key: 'sticker', label: '表情包', color: '#68C8BE' },
  { key: 'image', label: '图片', color: '#F498B4' },
]

/** 权重 → 归一化后的真实占比（和为 1），权重全 0 时回落纯文字 */
export function normalizeWeights(w: RuleConfig['chat']['weights']) {
  const total = WEIGHT_LABELS.reduce((s, x) => s + (w[x.key] ?? 0), 0)
  return WEIGHT_LABELS.map((x) => ({
    ...x,
    weight: w[x.key] ?? 0,
    ratio: total > 0 ? (w[x.key] ?? 0) / total : x.key === 'text' ? 1 : 0,
  }))
}

/* ───────────────────────── 差异统计 ───────────────────────── */

function flatten(obj: unknown, prefix = '', out: Record<string, unknown> = {}) {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, out)
    }
  } else {
    out[prefix] = obj
  }
  return out
}

/** 两份规则的差异字段数（用于底部「未保存 N 项」） */
export function diffCount(a: RuleConfig, b: RuleConfig) {
  const fa = flatten(a)
  const fb = flatten(b)
  const keys = new Set([...Object.keys(fa), ...Object.keys(fb)])
  let n = 0
  for (const k of keys) {
    if (JSON.stringify(fa[k]) !== JSON.stringify(fb[k])) n++
  }
  return n
}

/* ───────────────────────── 单位换算 ───────────────────────── */

export const UNIT_LABEL: Record<string, string> = {
  sec: '秒',
  min: '分钟',
  hour: '小时',
  count: '个',
  char: '字',
  x: '倍',
  money: '元',
}

/** 秒的区间转成人类可读：「3 秒 ~ 25 秒」/「30 分钟 ~ 2 小时」 */
export function humanSeconds(sec: number) {
  if (sec < 60) return `${Math.round(sec)} 秒`
  if (sec < 3600) {
    const m = sec / 60
    return `${Number.isInteger(m) ? m : m.toFixed(1)} 分钟`
  }
  const h = sec / 3600
  return `${Number.isInteger(h) ? h : h.toFixed(1)} 小时`
}

export function humanRange(value: Range2, unit?: FieldUnit) {
  const [a, b] = value
  if (unit === 'sec') return `${humanSeconds(a)} ~ ${humanSeconds(b)}`
  if (unit === 'min') return `${a} 分钟 ~ ${b} 分钟`
  if (unit === 'hour') return `${a} 小时 ~ ${b} 小时`
  if (unit === 'char') return `${a} ~ ${b} 字`
  if (unit === 'money') return `¥${a} ~ ¥${b}`
  return `${a} ~ ${b} 个`
}
