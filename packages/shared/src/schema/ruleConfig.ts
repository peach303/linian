import { z } from 'zod'

/** 概率项：enabled 总开关 + p 概率 */
export const prob = (p = 0) => z.object({ enabled: z.boolean().default(true), p: z.number().min(0).max(1).default(p) })
export const range = (min: number, max: number) =>
  z.tuple([z.number(), z.number()]).refine(([a, b]) => a <= b, 'min 必须 <= max').default([min, max])

export const ruleConfigSchema = z.object({
  $version: z.number().int().default(1),

  chat: z.object({
    // 字卡占比：相对权重，不要求求和为 100%
    weights: z
      .object({
        text: z.number().default(0.35),
        kaomoji: z.number().default(0.15),
        sticker: z.number().default(0.35),
        image: z.number().default(0.15),
      })
      .default({ text: 0.35, kaomoji: 0.15, sticker: 0.35, image: 0.15 }),
    replyInterval: range(3, 25),   // [最短, 最长] 秒
    replySentences: range(1, 3),   // [最少, 最多] 句
    readNoReply: prob(0.08),
    pat: prob(0.06),
    quote: prob(0.2),
    recall: prob(0.05),
    recallResend: prob(0.7),
    pinyinSentence: prob(0.05),
    conjunction: prob(0.25),
    punctuation: prob(0.85),
    multiCard: z
      .object({ enabled: z.boolean().default(true), p: z.number().default(0.3), count: range(2, 4) })
      .default({ enabled: true, p: 0.3, count: [2, 4] }),
    freeSentence: prob(0.2),        // 梦角自由组句（LLM）
    pickup: prob(0.1),              // 拾取我说过的话
    typingIndicator: z.boolean().default(true),
    maxLengthPerSentence: z.number().int().default(60),
  }),

  proactive: z.object({
    message: z.object({
      enabled: z.boolean().default(true),
      interval: range(1800, 7200),
      dailyLimit: range(1, 6),
      cancelIfRepliedWithin: z.number().default(60),
      quietHours: z.tuple([z.string(), z.string()]).default(['00:30', '07:30']),
    }),
    moment: z.object({ enabled: z.boolean().default(true), p: z.number().default(0.1), cooldownMin: z.number().default(720) }),
    letter: z.object({ enabled: z.boolean().default(true), p: z.number().default(0.03), cooldownMin: z.number().default(1440) }),
  }),

  moment: z.object({
    like: z.object({ p: z.number().default(0.75), delay: range(10, 3600) }),
    comment: z.object({ p: z.number().default(0.45), delay: range(30, 5400) }),
    replyMyReply: z.object({ p: z.number().default(0.6) }),
    likeBackIfILiked: z.object({ p: z.number().default(0.55) }),
  }),

  call: z.object({
    connect: z.object({ p: z.number().default(0.7) }),
    reject: z.object({ p: z.number().default(0.15) }),
    busy: z.object({ p: z.number().default(0.1) }),
    miss: z.object({ p: z.number().default(0.05) }),
    hangup: z.object({ p: z.number().default(0.3) }),
    outgoing: z.object({ enabled: z.boolean().default(true), p: z.number().default(0.04), cooldownMin: z.number().default(240) }),
    maxDurationMin: z.number().default(90),
  }),

  music: z
    .object({
      join: z.object({ enabled: z.boolean().default(true), p: z.number().default(0.88), delay: range(5, 300) }),
      say: prob(0.7),
      listenMin: range(8, 45),
      shareBack: prob(0.35),
      lyric: prob(0.3),
      inviteMe: z.object({ enabled: z.boolean().default(true), p: z.number().default(0.04), cooldownMin: z.number().default(720) }),
      keywords: z.array(z.string()).default(['晴天', '陈粒', 'City of Stars']),
    })
    .default({
      join: { enabled: true, p: 0.88, delay: [5, 300] },
      say: { enabled: true, p: 0.7 },
      listenMin: [8, 45],
      shareBack: { enabled: true, p: 0.35 },
      lyric: { enabled: true, p: 0.3 },
      inviteMe: { enabled: true, p: 0.04, cooldownMin: 720 },
      keywords: ['晴天', '陈粒', 'City of Stars'],
    }),

  mail: z.object({
    length: range(150, 600),
    randomPunctuation: z.boolean().default(true),
    reply: z.object({ enabled: z.boolean().default(true), p: z.number().default(0.8) }),
    replyLength: range(80, 400),
    replyDelayH: range(1, 48),
    annotation: z.object({ enabled: z.boolean().default(true), p: z.number().default(0.35) }),
  }),

  checkPhone: z.object({
    enabled: z.boolean().default(true),
    cooldownMin: z.number().default(720),
    acceptP: z.number().default(0.65),
    fakeInfoP: z.number().default(0.2),
  }),

  emotion: z.object({
    enabled: z.boolean().default(true),
    triggerP: z.number().default(0.6),
    decayHours: z.number().default(6),
  }),

  voice: z.object({
    enabled: z.boolean().default(false),   // 需填 MiniMax API Key
    p: z.number().default(0.15),
    maxCharsPerVoice: z.number().default(80),
    pace: z.number().default(1),
    emotionMapping: z.boolean().default(true),
  }),

  search: z.object({
    enabled: z.boolean().default(false),   // 需联网搜索授权
    p: z.number().default(0.06),
    topics: z.array(z.string()).default(['新闻', '趣事', '天气', '音乐']),
    pushIntervalMin: z.number().default(240),
  }),
})

export type RuleConfig = z.infer<typeof ruleConfigSchema>
