/**
 * 规则配置类型（前端视图层）
 *
 * ⚠️ 与 `packages/shared/src/schema/ruleConfig.ts` 的 zod schema 字段一一对应：
 *    - 后端用 zod 做全量校验与 version 化（rule_configs.data）
 *    - 前端从 GET /rules 拿到同一份结构，改完 PUT /rules
 *    这里手写一份等价的 TS 类型，是为了让 web 包不依赖 zod（保持零运行时依赖）。
 *    如果后续 web 也要跑校验，把 web/package.json 加上 "zod" 并
 *    `import type { RuleConfig } from '@linian/shared'` 替换本文件即可。
 */

/** [最小值, 最大值] */
export type Range2 = [number, number]

/** 概率项：总开关 + 概率（0~1） */
export interface ProbToggle {
  enabled: boolean
  p: number
}

export interface RuleConfig {
  $version: number

  chat: {
    /** 字卡占比：相对权重，**不要求求和为 100%**，引擎会归一化 */
    weights: {
      text: number
      kaomoji: number
      sticker: number
      image: number
    }
    /** 回复间隔 [最短, 最长]，单位：秒 */
    replyInterval: Range2
    /** 回复句数 [最少, 最多] */
    replySentences: Range2
    readNoReply: ProbToggle
    pat: ProbToggle
    quote: ProbToggle
    recall: ProbToggle
    recallResend: ProbToggle
    /** 拼音造句 */
    pinyinSentence: ProbToggle
    /** 连词（而且 / 但是 / 所以…） */
    conjunction: ProbToggle
    /** 标点符号开关 */
    punctuation: ProbToggle
    /** 他说话时自带「本意 / 在说谁」的概率（长按也可以随时问） */
    meaning: ProbToggle
    multiCard: ProbToggle & { count: Range2 }
    freeSentence: ProbToggle
    /** 拾取：把我聊过的话存进他的字卡库 */
    pickup: ProbToggle
    typingIndicator: boolean
    maxLengthPerSentence: number
  }

  proactive: {
    message: {
      enabled: boolean
      interval: Range2
      dailyLimit: Range2
      cancelIfRepliedWithin: number
      quietHours: [string, string]
    }
    moment: ProbToggle & { cooldownMin: number }
    letter: ProbToggle & { cooldownMin: number }
  }

  moment: {
    like: { p: number; delay: Range2 }
    comment: { p: number; delay: Range2 }
    replyMyReply: { p: number }
    likeBackIfILiked: { p: number }
  }

  /**
   * 「+」里递给他的东西（对应 `choices` / `questions` / `red_packets` / `gifts` 等表）。
   * 每条都是「我发出一个东西 → 他什么时候、以多大概率回应」，口径和时间轴里的其他事件一致。
   */
  choice: {
    enabled: boolean
    p: number
    delay: Range2
    reason: ProbToggle
    maxReasonChars: number
  }

  question: {
    enabled: boolean
    p: number
    delay: Range2
    /** 每一题留空的概率 */
    skipPerItem: { p: number }
    /** 交卷时补一句说明的概率 */
    noteP: number
    /** 他每天主动从我的题库里挑一套来问我的概率（每个名额独立抽） */
    askMeP: number
    /** 他主动来问的冷却（分钟） */
    askCooldownMin: number
    /** 默契问卷 / 他做题时「认真做」的概率（不认真就随机选） */
    seriousP: number
  }

  redPacket: {
    /** 我发随机红包时的金额区间（元） */
    amount: Range2
    claim: { enabled: boolean; p: number; delay: Range2 }
    thanks: ProbToggle
    /** 他回一个红包给我（独立掷签） */
    back: { enabled: boolean; p: number; amount: Range2; delay: Range2 }
    /** 他主动发一个红包给我（不是等我先发） */
    sendMe: ProbToggle & { cooldownMin: number; amount: Range2 }
  }

  gift: {
    accept: { enabled: boolean; p: number; delay: Range2 }
    thanks: ProbToggle
    /** 他主动送我一件礼物 */
    giveMe: ProbToggle & { cooldownMin: number }
  }

  call: {
    /** 响铃几秒后他接起来 */
    connect: { p: number; delay: Range2 }
    reject: { p: number }
    busy: { p: number }
    miss: { p: number }
    hangup: { p: number }
    /** 超过这个秒数还没人接 → 无人接听 */
    ringTimeoutSec: number
    /** 挂断之后他再回你一句 */
    afterTalk: ProbToggle
    outgoing: ProbToggle & { cooldownMin: number }
    maxDurationMin: number
  }

  music: {
    /** 他加入一起听 */
    join: { enabled: boolean; p: number; delay: Range2 }
    /** 加入后说一句（关于这首歌） */
    say: ProbToggle
    /** 一起听多久（分钟） */
    listenMin: Range2
    /** 他回推一首歌给我 */
    shareBack: ProbToggle
    /** 他主动邀请我一起听 */
    inviteMe: ProbToggle & { cooldownMin: number }
  }

  doodle: {
    /** 他会回你一句话 */
    reply: { enabled: boolean; p: number; delay: Range2 }
    /** 他会画一张回给你 */
    drawBack: ProbToggle
    /** 他主动画一张发给你（不是等你先画） */
    proactive: ProbToggle & { cooldownMin: number }
  }

  mail: {
    length: Range2
    randomPunctuation: boolean
    reply: { enabled: boolean; p: number }
    replyLength: Range2
    replyDelayH: Range2
    annotation: ProbToggle
  }

  checkPhone: {
    enabled: boolean
    cooldownMin: number
    acceptP: number
    fakeInfoP: number
    /** 他今天来不来查你（种子 = 日期） */
    askMeP: number
    /** 他每天最多查你几次（1~5；每个名额独立抽签） */
    dailyLimit: number
  }

  emotion: {
    enabled: boolean
    triggerP: number
    decayHours: number
  }

  voice: {
    enabled: boolean
    p: number
    maxCharsPerVoice: number
    pace: number
    emotionMapping: boolean
  }

  /** 他收藏我的东西（聊天 / 信 / 朋友圈） */
  favorite: {
    collect: ProbToggle
    cooldownMin: number
  }

  search: {
    enabled: boolean
    p: number
    topics: string[]
    pushIntervalMin: number
    /** 有可用图时，掷中这个概率就发**图片卡**（不然是链接卡） */
    imageP: number
    /** 推卡片时配一句真人口吻的附言 */
    captionP: number
  }

  companion: {
    /** 他一叫就来（没命中的话他会先忙，`joinDelay` 秒之后到） */
    join: ProbToggle
    /** 他「先忙一会儿」是多久（秒）—— 只有 `join` 没命中才用 */
    joinDelay: Range2
    /** 每 10 分钟一个节拍，他可能说一句 */
    say: ProbToggle
    /** 他会先走（没陪到底） */
    leave: ProbToggle
    /** 他先走的时间点（分钟，从开始算起） */
    leaveAfterMin: Range2
    /** 我在房间里跟他说话，他回不回 */
    replyMe: ProbToggle
  }

  watchRoom: {
    /** 他进不进来一起看（没命中的话「一会儿再来」） */
    join: ProbToggle
    /** 他「一会儿」是多久（秒）—— 只有 `join` 没命中才用 */
    joinDelay: Range2
    /** 他会发弹幕吗（整场总开关） */
    danmaku: ProbToggle
    /** 这一场他大概发几条弹幕 */
    danmakuCount: Range2
    /** 房间里他会说一句（按播放进度，最多几次） */
    say: ProbToggle
    /** 他会先走 */
    leave: ProbToggle
    /** 他先走的时间点（分钟，从开始算起） */
    leaveAfterMin: Range2
    /** 我在房间里跟他说话，他回不回 */
    replyMe: ProbToggle
  }

  readRoom: {
    /** 他进不进来一起读（没命中的话「一会儿过来」） */
    join: ProbToggle
    /** 他「一会儿」是多久（秒）—— 只有 `join` 没命中才用 */
    joinDelay: Range2
    /** 他会在页边写批注 / 短句吗（整场总开关） */
    mark: ProbToggle
    /** 这一本他大概写几处 */
    markCount: Range2
    /** 房间里他会说一句（按读到的进度） */
    say: ProbToggle
    /** 他会先走 */
    leave: ProbToggle
    /** 他先走的时间点（分钟，从开始算起） */
    leaveAfterMin: Range2
    /** 我在房间里跟他说话，他回不回 */
    replyMe: ProbToggle
  }

  diary: {
    /** 他今天写不写（他自己自动写的那条每天最多一次；我的日记不限条数） */
    write: ProbToggle
    /** 他大概几点写（到点之前他还没写，界面上会照实说） */
    atTime: [string, string]
    /** 留言里提不提当天真发生过的事（只提真发生过的） */
    mentionReal: ProbToggle
    /** 这条留言大概几句 */
    lines: Range2
    /** 我今天写了之后，他随后也写一条（他的那条会顺着我的话写） */
    replyMine: ProbToggle
  }

  world: {
    /** 到点自动采一条「他那边」（种子 = 日期 + 采样槽） */
    sample: ProbToggle
    /** 两次采样之间至少隔多久（分钟） */
    intervalMin: Range2
    /** 状态卡带不带「在忙 / 刚起床…」 */
    status: ProbToggle
    /** 带不带「正在做的事」 */
    doing: ProbToggle
    /** 采到一条新的时，顺手在聊天里说一句（每天最多一条，免打扰时段不说） */
    toChat: ProbToggle
  }
}
