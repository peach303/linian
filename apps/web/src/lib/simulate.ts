/**
 * 前端抽签模拟器 —— 按 `docs/rule-engine.md` 的抽签顺序跑一遍，
 * 让人直观看到「当前概率配置下，他这次会怎么回」。
 * 逻辑与 apps/server/src/engine/reply-engine.ts 保持一致（那里是权威实现）。
 */
import type { Range2, RuleConfig } from '@/types/rules'

export interface SimStep {
  /** 抽签顺序号 */
  no: number
  label: string
  detail: string
  /** true=命中 / false=未命中 / null=非概率步骤 */
  hit: boolean | null
}

export interface SimPreviewItem {
  kind: string
  text: string
  /** 该条消息的拟真延迟（秒） */
  latencySec: number
}

export interface SimResult {
  steps: SimStep[]
  preview: SimPreviewItem[]
  /** 本次总耗时（秒） */
  totalSec: number
  /** 是否已读不回 */
  silent: boolean
}

const ROLL = (p: number) => Math.random() < p
const rndR = ([a, b]: Range2) => a + Math.random() * (b - a)

const CARRIER_LABEL: Record<string, string> = {
  text: '纯文字',
  kaomoji: '颜文字',
  sticker: '表情包',
  image: '图片',
}

function pickWeighted(weights: RuleConfig['chat']['weights']) {
  const entries = Object.entries(weights) as [string, number][]
  const total = entries.reduce((s, [, w]) => s + w, 0)
  if (total <= 0) return { key: 'text', ratio: 1, total: 0 }
  let r = Math.random() * total
  for (const [k, w] of entries) {
    r -= w
    if (r <= 0) return { key: k, ratio: w / total, total }
  }
  const [k, w] = entries[entries.length - 1]
  return { key: k, ratio: w / total, total }
}

const SAMPLE: Record<string, string[]> = {
  text: ['我在听你说，慢慢来。', '嗯…刚刚在忙，现在有空了。', '那你要不要跟我说说看？'],
  kaomoji: ['(๑•̀ㅂ•́)و✧', '˚‧º·(˚ ˃̣̣̥᷄⌓˂̣̣̥᷅ )‧º·˚', '( ˘ ³˘)♥'],
  sticker: ['[表情包] 抱抱', '[表情包] 猫猫点头', '[表情包] 递茶'],
  image: ['[图片] 窗外的雨', '[图片] 刚路过的旧书店'],
}

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]

/** 跑一次抽签 */
export function simulateReply(rules: RuleConfig): SimResult {
  const c = rules.chat
  const steps: SimStep[] = []
  const preview: SimPreviewItem[] = []
  let no = 0
  const add = (label: string, detail: string, hit: boolean | null) =>
    steps.push({ no: ++no, label, detail, hit })

  /* 1. 已读不回 */
  const silent = c.readNoReply.enabled && ROLL(c.readNoReply.p)
  add('已读不回', silent ? '命中 → 本轮什么都不发' : '未命中 → 继续', silent)
  if (silent) return { steps, preview, totalSec: 0, silent: true }

  /* 2. 拍一拍 */
  if (c.pat.enabled && ROLL(c.pat.p)) {
    add('拍一拍', '命中 → 先拍一下', true)
    preview.push({ kind: 'PAT', text: '「梦角」拍了拍我的小脑袋', latencySec: 0.8 })
  } else {
    add('拍一拍', '未命中', false)
  }

  /* 3. 载体权重抽签 */
  const carrier = pickWeighted(c.weights)
  add(
    '载体抽签',
    `${CARRIER_LABEL[carrier.key]}（权重合计 ${carrier.total.toFixed(2)}，归一化后占比 ${(carrier.ratio * 100).toFixed(1)}%）`,
    null,
  )

  /* 4. 多字卡拼接 */
  let cardCount = 1
  if (c.multiCard.enabled && ROLL(c.multiCard.p)) {
    cardCount = Math.max(1, Math.round(rndR(c.multiCard.count)))
    add('多字卡拼接', `命中 → 拼 ${cardCount} 张`, true)
  } else {
    add('多字卡拼接', '未命中 → 单张', false)
  }

  /* 5. 自由组句 */
  const free = c.freeSentence.enabled && ROLL(c.freeSentence.p)
  add(
    '自由组句',
    free ? '命中 → 交给 LLM 按人设造句' : `未命中 → 照搬字卡（${CARRIER_LABEL[carrier.key]}）`,
    free,
  )
  const pinyin = c.pinyinSentence.enabled && ROLL(c.pinyinSentence.p)
  add('拼音造句', pinyin ? '命中 → 输出拼音串' : '未命中', c.pinyinSentence.enabled ? pinyin : false)
  const conj = c.conjunction.enabled && ROLL(c.conjunction.p)
  add('连词', conj ? '命中 → 加「而且 / 但是 / 所以」' : '未命中', c.conjunction.enabled ? conj : false)
  const punct = c.punctuation.enabled
  add('标点符号', punct ? '开启 → 正常带标点' : '关闭 → 整句无标点', null)

  /* 6. 撤回 */
  let recalled = false
  if (c.recall.enabled && ROLL(c.recall.p)) {
    recalled = true
    add('撤回', '命中 → 2~6 秒后撤回', true)
    const resend = c.recallResend.enabled && ROLL(c.recallResend.p)
    add('撤回后补发', resend ? '命中 → 重新发一条' : '未命中 → 不补发', c.recallResend.enabled ? resend : false)
    if (!resend) cardCount = 0
  } else {
    add('撤回', '未命中', false)
  }
  void recalled

  /* 7. 引用 */
  const quote = c.quote.enabled && ROLL(c.quote.p)
  add('引用回复', quote ? '命中 → 带上你那句话' : '未命中', c.quote.enabled ? quote : false)

  /* 8. 句数 + 延迟 */
  const [minS, maxS] = c.replySentences
  const want = cardCount > 0 ? Math.max(minS, Math.min(maxS, cardCount)) : 0
  const sentences = Math.min(want, 6)
  add('句数裁剪', `按配置 [${minS}, ${maxS}] 最终发 ${sentences} 句`, null)

  const [iMin, iMax] = c.replyInterval
  let total = 0
  for (let i = 0; i < sentences; i++) {
    const text =
      carrier.key === 'text' || free
        ? pick(SAMPLE.text)
        : pick(SAMPLE[carrier.key === 'sticker' ? 'sticker' : carrier.key])
    const shown = pinyin ? 'wo zai ting ni shuo' : punct ? text : text.replace(/[，。！？…、]/g, '')
    // 长文本回复更慢；第 2 句起间隔更短（像连续打字）
    const base = rndR([iMin, iMax]) * (i === 0 ? 1 : 0.6)
    const latencySec = +(base + shown.length * 0.06).toFixed(1)
    total += latencySec
    preview.push({
      kind: carrier.key === 'text' || free ? 'TEXT' : carrier.key.toUpperCase(),
      text: shown,
      latencySec,
    })
  }
  add('拟真延迟', `第 1 句 ${preview[0]?.latencySec ?? 0} 秒，连发总耗时约 ${total.toFixed(1)} 秒`, null)

  /* 9. 语音旁路 */
  if (rules.voice.enabled && ROLL(rules.voice.p)) {
    add('MiniMax 语音', '命中 → 额外发一条真实语音', true)
    preview.push({ kind: 'VOICE', text: '[语音] 用 MiniMax 合成', latencySec: 2.4 })
  } else {
    add('MiniMax 语音', rules.voice.enabled ? '未命中' : '未开启', rules.voice.enabled ? false : null)
  }

  /* 10. 联网搜索推送：独立排程（不在「回你」这条链上，所以这里只是说明，不掷签、不预告内容） */
  add(
    '联网搜索推送',
    !rules.search.enabled
      ? '未开启'
      : '独立排程（按推送间隔抽签；真去搜，搜到才推，搜不到不推）',
    null,
  )

  /* 11. 拾取（反向） */
  const pickup = c.pickup.enabled && ROLL(c.pickup.p)
  add('拾取', pickup ? '命中 → 把你上一句存进他的字卡库' : '未命中', c.pickup.enabled ? pickup : false)

  return { steps, preview, totalSec: +total.toFixed(1), silent: false }
}
