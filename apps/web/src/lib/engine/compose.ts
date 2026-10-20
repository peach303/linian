/**
 * 本地「自由组句」——把抽中的字卡素材拼成人话。
 *
 * 为什么有这一层：`freeSentence` 在设计上交给 LLM（服务端 `integrations/llm`），
 * 但本机 demo 不配置 API Key，所以这里给一份**确定性兜底**：
 *   - 有字卡素材 → 以素材为骨，按 `conjunction` 连词、`punctuation` 标点开关组装
 *   - 没素材（字卡库为空）→ 按我上一句的语气选一条模板，保证不会「哑掉」
 * 配好 LLM 后，把同样入参丢给服务端 `composeSentence` 即可无缝替换（见 docs/rule-engine.md）。
 */
import { useAppStore } from '@/store/useAppStore'
import type { ComposeResult } from '@/types/engine'

/** 连词池（命中 conjunction 时用） */
const CONJUNCTIONS = ['而且', '不过', '然后', '所以', '还有'] as const
/** 语气尾巴 */
const TAILS = ['', '…', '呀', '啦', '哦', '呢', '～'] as const

/** 按我上一句的语气挑模板（无字卡素材时的兜底） */
const TEMPLATES = {
  question: ['在呢，怎么了', '嗯…我想想怎么说', '你猜猜看', '怎么啦'],
  missing: ['我也想你', '……嗯，我也是', '知道啦，别闹'],
  tired: ['那早点休息吧', '累了吧，先靠一会儿', '别撑着，去躺一会儿'],
  greet: ['早呀', '嗯，我醒着呢', '你今天好早'],
  night: ['该睡了，晚安', '好，那晚安', '做个好梦'],
  praise: ['嗯，你很棒', '知道了，厉害呀', '那当然'],
  plain: ['嗯', '我在听', '好呀', '知道了', '嗯…好'],
} as const

type TemplateKey = keyof typeof TEMPLATES

export function guessTone(text?: string): TemplateKey {
  const t = text ?? ''
  if (/(晚安|睡觉|困了|睡了|好梦)/.test(t)) return 'night'
  if (/(早|起床|醒了)/.test(t)) return 'greet'
  if (/(想你|喜欢你|爱你|抱抱|亲亲)/.test(t)) return 'missing'
  if (/(累|难过|不开心|烦|哭|委屈|emo)/i.test(t)) return 'tired'
  if (/(厉害|好看|棒|优秀|夸)/.test(t)) return 'praise'
  if (/([?？]$|吗$|怎么|为什么|什么|哪|几点|要不要)/.test(t)) return 'question'
  return 'plain'
}

const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]

const stripPunct = (s: string) => s.replace(/[，。！？、…~～,.!?；;：:'"]/g, '')

const truncate = (s: string, n: number) => (n > 0 && s.length > n ? `${s.slice(0, n)}…` : s)

export interface ComposeInput {
  /** 抽中的字卡文本（素材） */
  seeds: string[]
  /** 我上一句，用来判断语气 */
  myLastText?: string
  punctuation: boolean
  conjunction: boolean
  maxLen: number
}

/** 组句：返回文本 + 用了哪条路径（写进抽签轨迹） */
export function composeSentence(input: ComposeInput): ComposeResult {
  const seeds = input.seeds.map((s) => s.trim()).filter(Boolean)
  let via: ComposeResult['via'] = 'card-join'
  let text: string

  if (seeds.length === 0) {
    via = 'template'
    text = pick(TEMPLATES[guessTone(input.myLastText)])
  } else if (seeds.length === 1) {
    text = seeds[0] + pick(TAILS)
  } else {
    const useConj = input.conjunction && Math.random() < 0.7
    const joiner = useConj ? `，${pick(CONJUNCTIONS)}` : '，'
    text = seeds.slice(0, 3).join(joiner)
  }

  if (!input.punctuation) text = stripPunct(text)
  return { text: truncate(text, input.maxLen), via }
}

/* ───────────────────────── 拼音 ───────────────────────── */

/** 常用字拼音表（够覆盖预设字卡的用词；命中率不足时宁可不出拼音） */
const PINYIN: Record<string, string> = {
  我: 'wo', 你: 'ni', 他: 'ta', 她: 'ta', 的: 'de', 了: 'le', 是: 'shi', 在: 'zai', 有: 'you',
  不: 'bu', 没: 'mei', 好: 'hao', 吗: 'ma', 呢: 'ne', 吧: 'ba', 啊: 'a', 呀: 'ya', 哦: 'o',
  嗯: 'en', 想: 'xiang', 要: 'yao', 会: 'hui', 能: 'neng', 来: 'lai', 去: 'qu', 说: 'shuo',
  看: 'kan', 听: 'ting', 睡: 'shui', 吃: 'chi', 喝: 'he', 走: 'zou', 回: 'hui', 家: 'jia',
  今: 'jin', 天: 'tian', 明: 'ming', 昨: 'zuo', 早: 'zao', 晚: 'wan', 安: 'an', 夜: 'ye',
  月: 'yue', 星: 'xing', 雨: 'yu', 风: 'feng', 云: 'yun', 猫: 'mao', 心: 'xin', 情: 'qing',
  很: 'hen', 太: 'tai', 真: 'zhen', 也: 'ye', 都: 'dou', 就: 'jiu', 还: 'hai', 再: 'zai',
  一: 'yi', 个: 'ge', 张: 'zhang', 只: 'zhi', 点: 'dian', 些: 'xie', 么: 'me', 谁: 'shui',
  做: 'zuo', 梦: 'meng', 抱: 'bao', 摸: 'mo', 陪: 'pei', 等: 'deng', 记: 'ji', 得: 'de',
  累: 'lei', 忙: 'mang', 忘: 'wang', 冷: 'leng', 暖: 'nuan', 药: 'yao', 饭: 'fan',
  起: 'qi', 床: 'chuang', 路: 'lu', 上: 'shang', 小: 'xiao', 老: 'lao', 师: 'shi', 学: 'xue',
  工: 'gong', 作: 'zuo', 收: 'shou', 到: 'dao', 知: 'zhi', 道: 'dao', 现: 'xian', 后: 'hou',
}

/** 汉字 → 拼音串；覆盖率不足 80% 时返回 null（宁可不发拼音，也不发半截乱码） */
export function toPinyin(text: string): string | null {
  const chars = [...text].filter((c) => !/\s/.test(c))
  if (!chars.length) return null
  const out: string[] = []
  let known = 0
  for (const ch of chars) {
    if (/[a-zA-Z0-9]/.test(ch)) {
      out.push(ch)
      known++
      continue
    }
    const p = PINYIN[ch]
    if (p) {
      out.push(p)
      known++
    } else {
      out.push(ch)
    }
  }
  return known / chars.length >= 0.8 ? out.join(' ') : null
}

/** 全 ASCII 文本卡 = 用户自己写的「拼音卡」（如 `wo xiang ni`），拼音造句优先用它 */
export const isPinyinCard = (text: string) => /^[a-z0-9\s'?!.,-]+$/i.test(text.trim()) && /[a-z]/i.test(text) && text.trim().length >= 3

/* ───────────────────────── 情绪 / 意图标签 ───────────────────────── */

const EMOTION_RULES: { re: RegExp; tags: string[] }[] = [
  { re: /(想你|喜欢你|爱你|抱|亲|心动)/, tags: ['心动', '想靠近'] },
  { re: /(难过|不开心|委屈|哭|烦|累|emo)/i, tags: ['心疼', '想安慰'] },
  { re: /(晚安|睡觉|困|好梦)/, tags: ['温柔', '哄睡'] },
  { re: /(早|起床|醒)/, tags: ['轻声', '问候'] },
  { re: /(对不起|抱歉|生气|讨厌)/, tags: ['小心', '想哄'] },
  { re: /([?？]|吗|怎么|为什么|什么|几点)/, tags: ['认真听', '想回应'] },
  { re: /(哈哈|笑|开心|太好了|棒)/, tags: ['同频', '想回应'] },
]

/** 内置标签的全集（情绪意图页用来列出「系统默认」的那些） */
export const BUILTIN_TAGS = [...new Set(EMOTION_RULES.flatMap((r) => r.tags))]

/**
 * 从我这句话里推「他读到了什么」（rules.emotion 控制开关与概率）
 *
 * 先看自己加的标签：命中触发词就先打上（例如把「宝宝」定义成「亲昵」）；
 * 再走内置的七条正则。被关掉的标签（内置 / 自定义）都不再出现。
 */
export function inferEmotion(text: string, max = 2): string[] {
  const custom = useAppStore.getState().emotionTags ?? []
  const off = new Set(custom.filter((t) => t.enabled === false).map((t) => t.name))
  const tags: string[] = []

  for (const t of custom) {
    if (t.enabled === false || !t.words?.length || !t.name) continue
    if (t.words.some((w) => w && text.includes(w))) tags.push(t.name)
  }

  for (const r of EMOTION_RULES) {
    if (r.re.test(text)) {
      for (const t of r.tags) if (!off.has(t) && !tags.includes(t)) tags.push(t)
    }
    if (tags.length >= max) break
  }

  const out = tags.filter((t) => !off.has(t)).slice(0, max)
  if (out.length) return out
  const fallback = BUILTIN_TAGS.find((t) => !off.has(t))
  return fallback ? [fallback] : []
}
