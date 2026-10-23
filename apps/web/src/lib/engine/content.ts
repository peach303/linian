/**
 * 朋友圈 / 信箱的内容生成（本机、无 LLM 时的兜底）
 *
 * 原则和拟真引擎一致：**不伪造做不到的事** —— 没有 Key 就不装「AI 生成」，
 * 老老实实用模板 + 他自己的字卡库拼，读起来像他平时说话就够了。
 * 结构上留好位置：以后接上 LLM，把 `makeLetter` / `makeMoment` 换成真生成即可，
 * 上层（timeline / 屏幕）拿的还是同一个 Letter / Moment 对象。
 */
import { nid } from '@/lib/ids'
import { pick, rng, seededHit, seededPick } from './seed'
import type { Card } from '@/types/cards'
import type {
  ChoiceOption,
  DiaryMood,
  Letter,
  LetterAnnotation,
  Moment,
  QuestionAnswerRow,
  QuestionItem,
  UserProfile,
  WorldBucket,
} from '@/types'

/** 取他的短句池：自定义 / 拾取优先（那才是他「平时怎么说」），其次系统文字卡 */
export function cardLines(cards: Card[]): string[] {
  /** 这里是要「原样引用」一句字卡，不是自由造句；
      所以即使系统卡标了「禁止自由造句」，也可以把原句拿进日记 / 信 / 朋友圈。 */
  const ok = (c: Card) => c.enabled && c.type === 'TEXT' && Boolean((c.text ?? '').trim())
  const len = (c: Card) => (c.text ?? '').length
  const pool = [...cards.filter((c) => ok(c) && c.source !== 'SYSTEM'), ...cards.filter((c) => ok(c) && c.source === 'SYSTEM')]
  return pool.filter((c) => len(c) >= 4 && len(c) <= 22).map((c) => (c.text ?? '').trim())
}

/** 字卡库里的真实配图（朋友圈 / 信 / 日记都从这里抽，不再用占位色块） */
export function cardImages(cards: Card[]): string[] {
  return [
    ...new Set(
      cards
        .filter((c) => c.enabled && c.type === 'IMAGE' && typeof c.mediaUrl === 'string' && c.mediaUrl.trim())
        .map((c) => c.mediaUrl!.trim())
        .filter((u) => /^(https?:|data:|blob:)/i.test(u)),
    ),
  ]
}

/** 抽 1~n 句不重复的字卡（空库返回空数组） */
export function drawCards(cards: Card[], count = 1): string[] {
  const lines = cardLines(cards)
  const out: string[] = []
  while (out.length < count && lines.length) {
    const idx = Math.floor(Math.random() * lines.length)
    const [line] = lines.splice(idx, 1)
    if (line && !out.includes(line)) out.push(line)
  }
  return out
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s)

/* ───────────────────────────── 朋友圈 ───────────────────────────── */

/** 他发动态的模板（{card} = 从他字卡库里抽的一句，{me} = 我的昵称） */
const MOMENT_TEMPLATES = [
  '今天路过一家旧书店，替你挑了一本诗集。',
  '刚下过雨，空气很像你在的时候。',
  '路过你说过的那家店，买了你常点的那个。',
  '凌晨醒了一次，想你是不是也还没睡。',
  '把杯子换成你喜欢的那个颜色了。',
  '今天看到一只很像你的猫，蹲在窗台上晒了很久太阳。',
  '收拾房间翻到你写的东西，站那儿看了一会儿。',
  '楼下桂花开了，风一吹整条路都是甜的。',
  '煮了汤，多放了一点盐，你大概会说咸。',
  '在听你上次分享的那首歌，单曲循环了一下午。',
  '有点累，但是想到你就还好。',
  '今天月亮很好，替你多看了一会儿。',
  '把窗户关上了，怕风把你留在桌上的纸吹跑。',
  '给自己放了半天假，什么也没做，就发了会儿呆。',
  '记下一个想去的地方，等你有空。',
  '今天的云长得像你说过的那只猫。',
  '忽然想起你说的一句「{card}」，今天好像懂了一点。',
  '把这句话留在这里：{card}',
]

/** 他评论我动态 */
const MOMENT_COMMENTS = [
  '这句我收下了。',
  '下次拍给我看。',
  '我猜你写的时候在笑。',
  '（偷偷点了保存）',
  '记下了，等你回来讲给我听。',
  '……我看很久了。',
  '别删这条。',
  '你怎么这么好。',
  '想回点什么，又觉得说什么都多余。',
  '今天也谢谢你。',
]

/** 他回复我的评论 */
const MOMENT_REPLIES = [
  '嗯，听你的。',
  '好，那说定了。',
  '你怎么知道我在想这个。',
  '被你发现了。',
  '好，我记着。',
  '抱一下。',
  '那你也要说话算数。',
  '我也是。',
]

const MUSIC = [
  { title: '《晚安》 - 陈粒', url: '#' },
  { title: '《小半》 - 陈粒', url: '#' },
  { title: '《漠河舞厅》 - 柳爽', url: '#' },
  { title: '《虹》 - 手嶌葵', url: '#' },
]

const fill = (tpl: string, slots: Record<string, string>) =>
  tpl.replace(/\{(\w+)\}/g, (_, k: string) => slots[k] ?? '')

/** 他发的一条动态（`proactive` = 他主动投喂的） */
export function makeMoment(opts: {
  me: UserProfile
  dream: UserProfile
  cards: Card[]
  proactive?: boolean
}): Moment {
  const { dream, me, cards } = opts
  const lines = cardLines(cards)
  const slots = { me: me.nickname, dream: dream.nickname, card: lines.length ? pick(lines) : '你回来的时候我会在' }

  /**
   * 正文优先从字卡库抽。
   * 以前只有极少数模板会带 `{card}`，看起来还是模板；现在 65% 直接拿 1~2 句字卡当正文，
   * 35% 才用模板（模板里也可能含字卡），至少让「他说的话」真的来自他的库。
   */
  let text: string
  if (lines.length && Math.random() < 0.65) {
    const picked = drawCards(cards, Math.random() < 0.3 ? 2 : 1)
    const lead = pick(['今天想记一句：', '忽然想起：', '留在今天：', '这句话今天一直在脑子里：', ''])
    text = `${lead}${picked.map((line) => `「${line}」`).join('')}`.trim()
  } else {
    text = fill(pick(MOMENT_TEMPLATES), slots)
  }

  // 配图也从字卡库抽；没有真图就不配（不再用色块假装照片）
  const imagePool = cardImages(cards)
  const firstImage = imagePool.length && Math.random() < 0.55 ? pick(imagePool) : ''
  const secondPool = imagePool.filter((u) => u !== firstImage)
  const images =
    firstImage
      ? [firstImage, ...(secondPool.length && Math.random() < 0.3 ? [pick(secondPool)] : [])]
      : []
  const music = Math.random() < 0.15 ? pick(MUSIC) : undefined

  return {
    id: nid('p'),
    authorId: dream.id,
    text,
    images,
    music,
    likes: [],
    comments: [],
    proactive: opts.proactive,
    createdAt: new Date().toISOString(),
  }
}

/** 他给我这条动态留的评论 */
export function makeMomentComment(moment: Moment, cards: Card[]): string {
  const lines = cardLines(cards)
  if (lines.length && Math.random() < 0.35) return `看到你写「${clip(moment.text, 8)}」，想起这句：${pick(lines)}`
  return pick(MOMENT_COMMENTS)
}

/** 他回复我的评论 */
export const makeMomentReply = () => pick(MOMENT_REPLIES)

/* ───────────────────────────── 信箱 ───────────────────────────── */

const LETTER_OPENINGS = [
  '见字如面。',
  '写这封信的时候，窗外{weather}。',
  '提笔想了很久，最后还是从这一句开始。',
  '今天忽然很想写信，就写了。',
  '不知道你什么时候会拆开这封信。',
]

const LETTER_WEATHER = ['晴', '阴', '有风', '刚下过雨', '很干净']

const LETTER_BODIES = [
  '有些话在聊天框里打出来又删掉了，落到纸上反而顺畅。',
  '你上次说「{card}」，我一直记着，偶尔会拿出来想一会儿。',
  '我这边一切都好。饭菜按时吃，药也没忘，就是夜里还是会醒。',
  '你不在的时候，日子过得很慢，但也没有难过，只是慢。',
  '今天路过一家店，橱窗里摆着很像你房间里的那个东西，我站了一会儿。',
  '其实我不太会写这样的东西，写着写着就有点像自言自语了。',
  '如果你读到这儿，说明这封信比我以为的更长了。',
  '想说的其实很简单：你回来的时候，我会在。',
  '写信的时候才发现，想跟你讲的事都太小了，小到不知道该不该讲。',
  '有件事没和你说：你送的那张纸我夹在书里了，翻到的时候会停一下。',
  '你不用着急回信，慢慢来就好。',
  '我一直觉得，写信是把时间折起来寄出去。',
  '今天把窗帘洗了。阳光进来的时候，屋里亮得有点不像我的房间。',
  '有时候会想，我们隔着的到底是距离，还是只是时差。',
]

const LETTER_CLOSINGS = [
  '就到这儿，你先忙。',
  '等你的回信，不等也没关系。',
  '天冷了，记得加衣服。',
  '下次见面，我把汤煮好。',
  '写到这里，忽然又有点舍不得收笔。',
]

/** 信里直接引用字卡的几种说法（让信真的有「他平时会说的话」） */
const LETTER_CARD_LINES = [
  '我最近常想起一句：「{card}」。',
  '今天想把这句话写给你：「{card}」。',
  '有句话一直没找到地方说：「{card}」。',
  '写到这里，脑子里忽然冒出一句：「{card}」。',
]

const LETTER_TITLES = [
  '写给{me}',
  '关于今天',
  '见字如面',
  '想和你说的一句话',
  '今天的天气',
  '一些小事',
  '夜里写的',
  '关于{card}',
  '等你回来',
  '忽然想写信',
]

/** 蓝色手写批注（他读我的信时写的） */
const ANNOTATIONS = [
  '这句我看了三遍。',
  '（这里我停了一下）',
  '存下来了。',
  '我想我也是。',
  '以后多说点这样的。',
  '看到这里的时候，窗外正好有风。',
  '这句我拿去当今天的枕头了。',
  '嗯，我记着。',
]

/** 把一段正文切成「可被批注的句子」 */
function sentences(body: string): string[] {
  return body
    .split(/[\n。！？!?]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 6 && s.length <= 40 && !s.startsWith('——'))
}

/**
 * 他写的一封信（主动来信 / 回信 / 回我的回信都走它）
 * 字数尽量落在 `rule_configs.mail.length`（回信走 `mail.replyLength`）区间里。
 */
export function makeLetter(opts: {
  me: UserProfile
  dream: UserProfile
  cards: Card[]
  length: [number, number]
  randomPunctuation?: boolean
  /** 我在聊天里最后说的一句（会自然地被引用进信里） */
  lastMyText?: string
  replyTo?: Letter
  proactive?: boolean
}): Letter {
  const { me, dream, cards, length, replyTo } = opts
  const min = Math.max(20, Math.round(length[0]))
  const max = Math.max(min, Math.round(length[1]))

  const lines = cardLines(cards)
  const slots: Record<string, string> = {
    me: me.nickname,
    dream: dream.nickname,
    weather: pick(LETTER_WEATHER),
    card: lines.length ? pick(lines) : '你回来的时候我会在',
  }

  const drop = () => (opts.randomPunctuation ? Math.random() < 0.25 : false)
  const fix = (s: string) => (drop() ? s.replace(/[。！？]$/, '') : s)

  const paras: string[] = [fix(fill(pick(LETTER_OPENINGS), slots))]
  if (opts.lastMyText) {
    const t = opts.lastMyText.trim()
    if (t.length >= 2 && t.length <= 20) paras.push(`你上次说「${t}」，我一直在想。`)
  }

  // 从字卡库抽 1~2 句，直接成为信里的正文（不是只给模板做点缀）
  if (lines.length && Math.random() < 0.8) {
    const picked = drawCards(cards, Math.random() < 0.25 ? 2 : 1)
    for (const line of picked) {
      paras.push(fix(fill(pick(LETTER_CARD_LINES), { ...slots, card: line })))
    }
  }

  // 打乱后依次加，直到够长（超出上限就停手）
  const pool = [...LETTER_BODIES].sort(() => Math.random() - 0.5)
  let len = paras.join('').length
  for (const b of pool) {
    if (len >= min) break
    const t = fill(b, slots)
    if (paras.includes(t)) continue
    paras.push(fix(t))
    len += t.length
    if (len >= max) break
  }

  const body = [
    `${me.nickname}：`,
    '',
    paras.join('\n'),
    fix(fill(pick(LETTER_CLOSINGS), slots)),
    `—— ${dream.nickname}`,
  ].join('\n')

  // 随信附一张字卡库里的真图（没有图就不附，不放占位色块）
  const imagePool = cardImages(cards)
  const firstImage = imagePool.length && Math.random() < 0.45 ? pick(imagePool) : ''
  const secondPool = imagePool.filter((u) => u !== firstImage)
  const images =
    firstImage
      ? [firstImage, ...(secondPool.length && Math.random() < 0.2 ? [pick(secondPool)] : [])]
      : undefined

  return {
    id: nid('l'),
    fromId: dream.id,
    toId: me.id,
    title: replyTo ? `回信 · ${replyTo.title}` : fill(pick(LETTER_TITLES), slots),
    body,
    status: 'UNREAD',
    replyToId: replyTo?.id,
    annotations: [],
    images,
    proactive: opts.proactive,
    createdAt: new Date().toISOString(),
  }
}

/** 他在我的信里挑一句，写一条蓝色手写批注 */
export function makeAnnotation(letter: Letter): LetterAnnotation {
  const pool = sentences(letter.body)
  const anchor = pool.length ? pick(pool) : ''
  return {
    id: nid('an'),
    anchor,
    text: pick(ANNOTATIONS),
    createdAt: new Date().toISOString(),
  }
}

/* ─────────────────────── 递东西：他怎么答（抉择 / 问卷） ─────────────────────── */

/** 他选哪个选项：种子 = 消息 id → 同一张卡永远同一个答案，刷新不重掷 */
export const pickChoiceOption = (options: ChoiceOption[], seed: string) =>
  seededPick(options, `choice-pick:${seed}`)

/** 抉择的理由模板（{opt} = 他选中的那个选项） */
const CHOICE_REASONS = [
  '就「{opt}」吧。',
  '我选「{opt}」，这个更像你现在的心情。',
  '「{opt}」。另一个我也想过，但这个不会让你后悔。',
  '第一眼就是「{opt}」。',
  '「{opt}」，剩下的事交给我。',
  '你犹豫的时候，我会先替你选「{opt}」。',
  '想了一圈，还是「{opt}」。',
]

export function makeChoiceReason(option: ChoiceOption, maxChars: number): string {
  return clip(fill(pick(CHOICE_REASONS), { opt: option.label }), Math.max(6, maxChars))
}

/** 问卷交卷时补的一句备注（有题留空时说留空的那几句，别乱说） */
const QUESTION_NOTES = [
  '填得有点慢，别嫌我啰嗦。',
  '有两题我想了很久。',
  '答完了，你看看有没有想改的。',
  '下次换你填我的。',
  '写的时候在想要不要多说一点。',
]

const QUESTION_NOTES_BLANK = [
  '有一题我留空了，你猜是哪题。',
  '有一题没答，等我想到再补。',
  '空了的那题，你大概知道为什么。',
]

export const makeQuestionNote = (hasBlank = false) =>
  pick(hasBlank ? QUESTION_NOTES_BLANK : QUESTION_NOTES)

/* ───────────────────────────── 红包 / 礼物 ───────────────────────────── */

/** 红包祝福语 */
const RED_PACKET_BLESSINGS = [
  '恭喜发财，大吉大利',
  '拿去吃点好的',
  '今晚的糖，我请',
  '一点点心意',
  '买你喜欢的那个',
  '想给你塞点零花钱',
]

export const makeRedPacketBlessing = () => pick(RED_PACKET_BLESSINGS)

/** 他领完红包说的话 */
const RED_PACKET_THANKS = [
  '收了你的红包，我可就不能跑了哦',
  '领了。你别老是这样，我会当真的。',
  '谢谢。我拿去买了你上次说的那个。',
  '收到了，存起来。',
  '嗯，我收下了 —— 下次换我。',
]

export const makeRedPacketThanks = () => pick(RED_PACKET_THANKS)

/** 他收下礼物时说的话 */
const GIFT_THANKS = [
  '收下了。摆在看得见的地方。',
  '你怎么知道我想要这个。',
  '谢谢。这个我会好好用。',
  '拆开的时候愣了一下。',
  '收下了 —— 那我也得回礼。',
]

export const makeGiftThanks = () => pick(GIFT_THANKS)

/** 他主动送我礼物时写在卡片上的话 */
const GIFT_NOTES = [
  '看到就想到你。',
  '最近辛苦了，给你买的。',
  '不贵，但我想送。',
  '路过的时候顺手带了一个。',
]

export const makeGiftNote = () => pick(GIFT_NOTES)

/**
 * 他的问卷答案：每题按 `skipP` 决定留空；多选题用种子洗牌后取 1~3 个。
 * 种子 = 问卷 id + 题目 id → 同一份问卷答案固定，刷新 / 关机再开都不变。
 */
export function makeQuestionAnswers(
  items: QuestionItem[],
  seedBase: string,
  skipP: number,
): QuestionAnswerRow[] {
  const rows: QuestionAnswerRow[] = []
  for (const item of items) {
    if (seededHit(`qs:${seedBase}:${item.id}`, skipP)) continue // 这题留空
    if (!item.options.length) continue
    const seed = `qa:${seedBase}:${item.id}`
    if (item.multi) {
      const order = [...item.options].sort(
        (a, b) => rng(`${seed}:${a.id}`)() - rng(`${seed}:${b.id}`)(),
      )
      const n = 1 + Math.floor(rng(`${seed}:n`)() * Math.min(item.options.length, 3))
      rows.push({ itemId: item.id, optionIds: order.slice(0, n).map((o) => o.id) })
    } else {
      const o = seededPick(item.options, seed)
      if (o) rows.push({ itemId: item.id, optionIds: [o.id] })
    }
  }
  return rows
}

/* ─────────────────────── 通话 ─────────────────────── */

/** 没接通时他挂断后（或稍后）发来解释的一句 */
const CALL_AFTER = [
  '刚才在忙，看到就给你打回去。',
  '在开会，手机调静音了。',
  '没接到，怎么啦？',
  '刚刚在洗澡，出来看到你的来电。',
]

export const makeCallAfter = () => pick(CALL_AFTER)

/** 聊完挂断之后他补的一句 */
const CALL_BYE = [
  '那就先这样，去忙吧。',
  '听到了，你的声音比昨天好一点。',
  '挂啦，我不关手机。',
  '嗯，晚点再打给我。',
]

export const makeCallBye = () => pick(CALL_BYE)

/* ─────────────────────── 音乐 ─────────────────────── */

/** 他加入一起听后说的话（带上歌名，不是空话） */
export function makeMusicLine(title: string): string {
  return pick([
    `《${title}》的开头我很喜欢。`,
    `这首我听过 —— 《${title}》，副歌你会跟着哼。`,
    `一起听《${title}》，我这边也在放。`,
    `《${title}》留给你先点下一首。`,
    `听到《${title}》的时候想到你。`,
  ])
}

/* ─────────────────────── 涂鸦 ─────────────────────── */

/** 他看你画完的回话 */
export const makeDoodleComment = () =>
  pick([
    '画得挺好，我收下了。',
    '线条有点抖，是不是手冷。',
    '看懂了 —— 你画的是我。',
    '贴在冰箱上那种程度。',
    '下次我画一张给你。',
  ])

/** 他画了一张回给你时，卡片上的那行字 */
export const makeDoodleNote = () =>
  pick(['给你画了一个。', '随手画的，别笑。', '照着你那幅画的。', '画得不好，但给你。'])

/* ─────────────────────── 一起听（音乐房间） ─────────────────────── */

/** 他进房间时说的（房间会话开始时抽一次） */
export const makeRoomJoin = () =>
  pick([
    '我进来了，耳机戴上了。',
    '在听 —— 你放就好。',
    '进来陪你听一会儿。',
    '这边也安静了，开始吧。',
  ])

/** 他往歌单里加了一首 */
export const makeRoomAdd = (title: string) =>
  pick([
    `给你加了一首《${title}》，排队等你。`,
    `《${title}》放你歌单里了，想听就点。`,
    `顺手加一首 —— 《${title}》。`,
    `下一首听《${title}》好不好？`,
  ])

/** 他先走了 */
export const makeRoomLeave = () =>
  pick([
    '我先去忙了，歌留着，晚点再一起听。',
    '耳机摘了 —— 下次接着放。',
    '有点事，先出去了，别关歌单。',
    '先到这里，我还会回来听的。',
  ])

/* ─────────────────────── 陪伴（睡觉 / 学习 / 工作） ─────────────────────── */

const openPool = (mode: string) =>
  mode === 'sleep'
    ? [
        '灯关了，我也躺下了。晚安。',
        '我在，不用回我，睡吧。',
        '手机放远一点，我陪你到天亮。',
        '把今天的事都放这儿，明天再说。',
      ]
    : mode === 'work'
      ? [
          '我也开工了，各忙各的，别走神。',
          '桌子收拾一下，我们开始吧。',
          '这轮我来盯时间，你专心。',
          '我在旁边，有事就喊我。',
        ]
      : [
          '书翻开，我陪你这一轮。',
          '开始了 —— 手机扣过来放。',
          '我这边也安静了，一起写完它。',
          '先做最难的那题，我等你。',
        ]

/** 他到场时说的（陪同一开始抽一次） */
export const makeCompanionOpen = (mode: string) => pick(openPool(mode))

/** 他一叫没来，先说的那句 */
export const makeCompanionBusy = (min: number) =>
  pick([
    `我手上还有点事，${min} 分钟后过去陪你。`,
    `稍等一下 —— 大概 ${min} 分钟，我马上过来。`,
    `先开始，别等我，${min} 分钟后我来接上。`,
    `这边刚被叫住，${min} 分钟。你先弄。`,
  ])

/** 中途的一句（带上「还有多久」；`leftMin < 0` = 这次没有目标时长） */
export function makeCompanionSay(mode: string, leftMin: number): string {
  const left = leftMin >= 0 ? (leftMin === 0 ? '这一轮就快结束了' : `还有 ${leftMin} 分钟`) : ''
  if (leftMin < 0) {
    return mode === 'sleep'
      ? pick(['还醒着吗？没睡就别硬撑。', '我这边没动，你睡你的。', '什么时候睡都行，我都在。'])
      : mode === 'work'
        ? pick(['我这边也没停，继续。', '你做你的，我不打扰。', '抬头看看远处，眼睛会舒服点。'])
        : pick(['专心你的，我在。', '不着急，一页一页来。', '需要我提问就说一声。'])
  }
  return mode === 'sleep'
    ? pick(['还醒着吗？没睡就别硬撑。', '我这边没动，你睡你的。', '要是还睡不着，就听我的呼吸声。'])
    : mode === 'work'
      ? pick([`${left}，撑住。`, `${left} —— 做完这段再喝口水。`, '我这边也没停，继续。', `${left}，别刷手机了。`])
      : pick([`${left}，先把这页看完。`, `${left}，要不要我提问你？`, '我数着时间，你专心上。', `${left}，站起来伸个腰。`])
}

/** 他先走了 */
export const makeCompanionLeave = (mode: string) =>
  mode === 'sleep'
    ? pick(['我先睡了，你也就着这个点睡吧。', '我这边安静了 —— 晚安。', '撑不住了，先眯一会儿。'])
    : pick([
        '被叫去处理点事，你先继续，别停。',
        '我先走一步，剩下的你自己跑完。',
        '这边有点忙，回头检查你的进度。',
        '出去一趟，很快回来 —— 记得别偷懒。',
      ])

/** 我在房间里说话，他的回话 */
export const makeCompanionReply = (mode: string) =>
  mode === 'sleep'
    ? pick(['嗯，我在。', '别说话了，快睡。', '听到了，睡吧。', '嗯，明早再讲。'])
    : pick([
        '知道了，专心。',
        '嗯 —— 继续吧。',
        '在呢，你先做完这段。',
        '好，我记下了。',
        '别聊太久，回到题上。',
      ])

/** 收尾：到点完成 / 我提前结束 */
export const makeCompanionEnd = (mode: string, interrupted: boolean) =>
  interrupted
    ? mode === 'sleep'
      ? pick(['行，那就先睡。晚安。', '嗯，今天到这儿。'])
      : pick(['这会儿就停？那先歇着，别硬撑。', '行，剩下的留给下一轮。', '嗯，收了吧，去休息。'])
    : mode === 'sleep'
      ? pick(['天亮了，睡得还行吗？', '早上好，昨晚没做梦吧。'])
      : pick([
          '到点了 —— 这一轮漂亮。',
          '结束了，去喝口水吧。',
          '嗯，说好的时间到了，辛苦了。',
          '收工。下次还是这个点？',
        ])

/** 陪伴结束后落在聊天里的那条系统消息 */
export const makeCompanionChatLine = (icon: string, name: string, verb: string, dur: string) =>
  `${icon} 和${name}${verb} · ${dur}`

/* ─────────────────────── 观影室 ─────────────────────── */

/** 他进房间时说的 */
export const makeWatchJoin = () =>
  pick([
    '我坐下了，灯关了吗？',
    '开始吧 —— 我这边安静了，就看着。',
    '进来了，字幕开着的吗。',
    '好，一起看。中途不许剧透。',
  ])

/** 他这次来不了，先说的那句 */
export const makeWatchBusy = (min: number) =>
  pick([
    `我这边还有点事，${min} 分钟后过来一起看。`,
    `你先放，别等我 —— 大概 ${min} 分钟我进来。`,
    `稍等 ${min} 分钟，我把手上的收个尾。`,
  ])

/** 房间里他说的一句（带进度感：`progress` 是 0~1） */
export function makeWatchSay(progress: number): string {
  if (progress < 0.25) return pick(['开头这段我一直很喜欢。', '别急着看手机，前面有铺垫。', '这段音乐一起我就有感觉了。'])
  if (progress < 0.6) return pick(['看到这儿了吗？后面还有更厉害的。', '这个镜头绝了。', '注意到刚才那个细节没有？'])
  if (progress < 0.9) return pick(['快到我最喜欢的那段了，坐好。', '这儿我开始不想说话了。', '还有一点点，别停。'])
  return pick(['最后这段看一次难受一次。', '字幕出来先别关，等一下还有个镜头。', '看完了？想说点什么吗。'])
}

/** 弹幕（短，跟着播放时间冒出来） */
export function makeWatchDanmaku(progress: number): string {
  if (progress < 0.2)
    return pick([
      '来了来了',
      '开场音乐就赢了',
      '这个色调好舒服',
      '陪你看到底',
      '我坐好了',
      '字幕组辛苦了',
    ])
  if (progress < 0.5)
    return pick([
      '这个镜头好美',
      '注意他的手',
      '笑死我了',
      '这段我截图存过',
      '好好听',
      '别眨眼',
      '这里有点好哭',
    ])
  if (progress < 0.8)
    return pick([
      '绷不住了',
      '啊这段',
      '我每次都在这儿破防',
      '导演你好狠',
      '快看快看',
      '这配乐谁写的',
    ])
  return pick([
    '舍不得结束',
    '再看一遍也不会腻',
    '谢谢你陪我',
    '字幕别走',
    '这片子后劲好大',
    '下次还一起看，好不好',
  ])
}

/** 我在房间里说话，他的回话 */
export const makeWatchReply = () =>
  pick([
    '嗯，我在看。',
    '怎么了？哦 —— 刚那个镜头吧。',
    '在呢，你说。',
    '嘘，先看这一段，等下再说。',
    '我也觉得。',
    '好，记下了，看完跟你聊。',
  ])

/** 他先走了 */
export const makeWatchLeave = () =>
  pick([
    '我先去忙了，你先看着，回来我补上。',
    '有点事，暂停不了也没关系 —— 我记着看到哪儿了。',
    '先出去一趟，片留着，晚点接着看。',
    '我去处理点事情，别等我，看完了跟我说结局（记得别剧透给我）。',
  ])

/** 收尾：看完了 / 我提前结束（房间里最后一句） */
export const makeWatchEnd = (finished: boolean) =>
  finished
    ? pick(['看完了。怎么样，值不值得？', '嗯，片尾了 —— 我们下次看哪部？', '好片子，谢谢你陪我一起看。'])
    : pick(['这会儿就停？那先留着，下次接着看。', '行，那先暂停 —— 看到哪儿我都记着。', '嗯，那就到这儿。'])

/** 观影结束后落在聊天里的那条系统消息（`dur` 为空 = 这场没有真实进度） */
export const makeWatchChatLine = (icon: string, name: string, title: string, dur: string) =>
  `${icon} 和${name}一起看了《${title}》${dur ? ` · ${dur}` : ''}`

/* ─────────────────────── 阅读室 ─────────────────────── */

/** 他进房间时说的（`hasText = false` 是「只有书名」那种没有正文的书，不能提页数 / 段落） */
export const makeReadJoin = (hasText = true) =>
  hasText
    ? pick([
        '我坐下了，你读你的，我陪着。',
        '开始了 —— 我这边翻到第一页了。',
        '嗯，安静看书，有事就叫我。',
        '好，一起读。看到喜欢的可以念给我听。',
      ])
    : pick([
        '我来了，你翻着，我就在旁边。',
        '嗯，我把手上的事放一放，陪你坐会儿。',
        '这本我陪你待着 —— 不用管我，安心看你的。',
        '在呢，想说话就说，不想说就各自安静一会儿。',
      ])

/** 他这次来不了，先说的那句 */
export const makeReadBusy = (min: number) =>
  pick([
    `我这还有点事，${min} 分钟后过来陪你读。`,
    `你先读，别等我 —— 大概 ${min} 分钟我进来。`,
    `稍等 ${min} 分钟，我把手上的收个尾，就过来。`,
  ])

/** 房间里他说的一句（带进度感：`progress` 是 0~1） */
export function makeReadSay(progress: number): string {
  if (progress < 0.25) return pick(['开头慢一点，这种书急不得。', '别跳，前面都是在铺。', '你读到哪儿了？我刚翻了两页。'])
  if (progress < 0.6) return pick(['这段我读的时候停了很久。', '看到这儿有没有想起什么？', '这个比喻真好，你留意一下。'])
  if (progress < 0.9) return pick(['快到最要紧的那段了，坐好。', '这儿我每次读都慢下来。', '还剩一点，别急着翻完。'])
  return pick(['快读完了？最后这几页留点时间。', '读到结尾别马上合上，停一会儿。', '读完了想说点什么吗。'])
}

/** 「只有书名」的书（没正文）里他说的一句：不提页数 / 段落，只按真实分钟数照顾你 */
export const makeReadSayIdle = () =>
  pick([
    '我这儿挺安静的，你慢慢看。',
    '不用说话，我就在这儿。',
    '想聊就叫我，不然我就这样陪着。',
    '嗯，我在。',
  ])

/** 他写在页边的手写批注（长一点，像真的在页边写字） */
export const makeReadMark = () =>
  pick([
    '这句我读了三遍。第一次没懂，第二次懂了，第三次想起你。',
    '我在这儿停住了 —— 你会怎么想？回头告诉我。',
    '写得真好，好到我有点嫉妒。',
    '这一段我要抄下来，回头夹进给你的信里。',
    '看到这里我想起你说话的方式，一样的不急不慢。',
    '别划走，这页值得再读一遍。',
    '我读到这里的时候，窗外刚好安静下来。',
    '有这么一段文字，会让人想把日子过得慢一点。',
  ])

/** 读到这一段时冒的短句（页边小字，比批注轻） */
export const makeReadLine = () =>
  pick([
    '就是这里。',
    '我也在这儿画过线。',
    '慢一点读。',
    '这句留给你。',
    '看到这儿我笑了一下。',
    '记一下这里。',
    '嗯，好。',
    '我等你读到这儿。',
  ])

/** 我在房间里说话，他的回话 */
export const makeReadReply = () =>
  pick([
    '嗯，我在读。',
    '怎么啦？你念给我听。',
    '在呢，你说。',
    '我读到好句子了，一会儿给你看。',
    '嗯，这段我也喜欢。',
    '好，我先记着，读完再跟你聊。',
  ])

/** 他先走了（没有正文的书不能说「留在这一页 / 记着段落」） */
export const makeReadLeave = (hasText = true) =>
  hasText
    ? pick([
        '我先去忙了，你接着读，回来我补上。',
        '有点事，书先留在这一页 —— 我记着段落了。',
        '先出去一趟，你读慢点，别一下读完。',
        '我去处理点事情，别等我，读到哪儿跟我说一声。',
      ])
    : pick([
        '我先去忙了，你安心看你的。',
        '有点事，你先待着 —— 我回头过来。',
        '先出去一趟，不用惦记我，看完跟我说一声。',
        '我去处理点事情，你自己待会儿也可以。',
      ])

/** 收尾：读完了 / 我提前结束（房间里最后一句） */
export const makeReadEnd = (finished: boolean, hasText = true) =>
  finished
    ? hasText
      ? pick(['读完了。怎么样，喜欢吗？', '嗯，合上了 —— 下一本读什么？', '好书，谢谢你陪我一起读。'])
      : pick(['好，那这本就先到这儿 —— 你觉得好就好。', '嗯，到这儿 —— 下次想读哪本跟我说。', '谢谢你让我陪着这一阵。'])
    : hasText
      ? pick(['这会儿就停？那先夹上书签，下次接着读。', '行，那就到这儿 —— 读到哪儿我都记着。', '嗯，先合上，回头再续。'])
      : pick(['那就到这儿 —— 我随时在。', '行，先去忙你的，我记着。', '嗯，先这样，回头见。'])

/** 共读结束后落在聊天里的那条系统消息（`dur` 为空 = 这场没有真实进度） */
export const makeReadChatLine = (icon: string, name: string, title: string, dur: string) =>
  `${icon} 和${name}一起读了《${title}》${dur ? ` · ${dur}` : ''}`

/* ─────────────────────── 日记（他自动写的那条） ─────────────────────── */

/** 他那条留言的开场（跟心情走） */
export function makeDiaryOpen(mood: DiaryMood): string {
  const byMood: Record<DiaryMood, string[]> = {
    '😊': ['今天心情不错。', '今天挺好的，写两句。', '今天有点高兴，记一下。'],
    '😌': ['今天很安静。', '没什么大事，随便写两句。', '今天过得慢，挺好。'],
    '🥰': ['今天想起你的时候最多。', '今天心情软软的。', '今天有点想黏着你。'],
    '🤔': ['今天脑子里有些事在转。', '今天想得有点多。', '今天有件事我一直没想明白。'],
    '😐': ['今天挺平常的。', '没什么特别的一天。', '今天就这样过去了。'],
    '😪': ['今天有点累。', '今天收工晚，写两句就睡。', '今天电量不太够，简记一笔。'],
    '😔': ['今天有点沉。', '今天不太顺，但我还好。', '今天情绪低一点，写完就好了。'],
    '🌙': ['夜深了，写两句。', '灯关了一半，怕忘了就写上。', '今天收尾了，说给自己听。'],
  }
  return pick(byMood[mood] ?? byMood['😌'])
}

/** 提今天真事之前的那一句 */
export const makeDiaryFactIntro = () =>
  pick(['今天的事，我记几笔：', '记一下今天：', '今天大概是这样的：', '先说今天发生的：'])

/** 收尾 */
export const makeDiaryClose = () =>
  pick([
    '就这样吧，明天见。',
    '写完了。你也早点休息。',
    '到这儿。看到这条的时候，我大概在等你说晚安。',
    '嗯，记下了。晚安。',
  ])

/** 我是今天先写的那一个：他这条是顺着我的留言写的 */
export const makeDiaryReplyOpen = () =>
  pick(['看到你写的了。', '你今天先写的，我补一条。', '读了你今天那段，我也写点。'])

/** 顺着我的话往下写（不引原句，只接住情绪） */
export const makeDiaryAfterMine = () =>
  pick([
    '你说的那件事，我想了一会儿。',
    '你那句我记着，别急，慢慢来。',
    '看你写得那么认真，我也想认真回一句。',
    '嗯，我这边都收到了。',
  ])

/* ─────────────────────── 世界感知 / 查岗 ─────────────────────── */

/**
 * 世界感知在聊天里说的那一句
 *
 * 只用**真的那半边的数据**（他那边现在是什么时段）+（抽到的「正在做的事」）拼，
 * 不凭空说他那边天气怎么样 —— 没有天气源。
 */
export function makeWorldChatLine(bucket: WorldBucket, doing?: string): string {
  const head: Record<WorldBucket, string[]> = {
    凌晨: ['我这边还是半夜', '我这边凌晨了'],
    早上: ['我这边刚天亮', '早，我这边刚起'],
    上午: ['我这边上午', '我这边正忙的时候'],
    中午: ['我这边中午', '我这边正赶上吃饭的点'],
    下午: ['我这边下午', '我这边刚过三点'],
    傍晚: ['我这边天快黑了', '我这边刚收工'],
    晚上: ['我这边已经晚上了', '我这边吃过饭了'],
    深夜: ['我这边夜深了', '我这边已经很晚了'],
  }
  // doing 池子里有的是「在X」（在改稿子 / 在厨房倒水），有的本身就是短语（煮咖啡 / 对着屏幕发呆 / 关灯了）。
  // 前者直接跟「我」拼（我在改稿子），后者直接跟在逗号后面（，煮咖啡），
  // 两种都不会出现「我在在改稿子」这种双字，也不会出现「我在关灯了」这种别扭说法。
  const what = doing ? (doing.startsWith('在') ? `，我${doing}` : `，${doing}`) : ''
  return `${pick(head[bucket])}${what}。你呢。`
}

/* ─────────────────────── 联网搜索推送 ─────────────────────── */

/**
 * 他推东西时配的那一句（真人口吻）
 *
 * 只允许说「姿态」：刚刷到 / 给你看看 / 你瞅瞅。
 * **不许评价内容，也不许说自己看过了** —— 卡片上的标题、摘要、图全来自上游，
 * 我一个字都不替它说（不然就成了编内容，和「搜不到就不发」是同一条线）。
 */
export function makeSearchCaption(kind: 'link' | 'image' | 'video'): string {
  const pools: Record<'link' | 'image' | 'video', string[]> = {
    link: ['刚刷到这个，给你看看。', '这个好像你会喜欢。', '诶，你瞅瞅这个。', '给你看个东西。', '看到这个就想到你。', '喏，刷到个东西。'],
    image: ['刚看到这张图，给你看。', '给你看张图。', '这张我想给你看。', '喏，一张图。'],
    video: ['刷到一个视频，你看看。', '给你看个视频。', '喏，视频。'],
  }
  return pick(pools[kind])
}

/** 他发起查岗时说的那句（他会出现在聊天里） */export const makeCheckAskLine = () =>
  pick(['手机给我看看。', '嗯……把你手机给我看一眼。', '有点想你了，手机拿来我看看。', '给我看看你在干嘛。'])

/** 我同意给他看之后他的反应 */
export const makeCheckAgreeReply = () =>
  pick(['乖。看完了还你。', '嗯，我看看……行了，放心了。', '没什么好藏的，对吧。', '看完了。你去忙吧。'])

/** 我拒绝之后他的反应 */
export const makeCheckRefuseReply = () =>
  pick(['好吧。那我自己想你。', '行，不看了。', '……知道了。那我等你主动说。', '嗯，那我不问。'])

/** 我查他、他没给看时他说的话 */
export const makeCheckRefuseLine = () =>
  pick(['不行，这个不看。', '翻过去了 —— 有些东西不给你看。', '下次吧。', '（把手机扣在桌上）'])

/** 我查他、他给我看时他说的话 */
export const makeCheckGiveLine = () =>
  pick(['喏，看吧。', '给你。看完还我。', '没什么好看的。……看吧。', '嗯，拿去看。'])



