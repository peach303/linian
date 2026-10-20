/**
 * 拟真引擎的类型（前端本地出稿）
 *
 * 边界说明：抽签链路的**权威顺序**见 `docs/rule-engine.md`。
 * 服务端 `apps/server/src/engine/reply-engine.ts` 是同一套顺序的多端版本；
 * 本机（无 Key、离线可用）由 `apps/web/src/lib/engine/*` 出稿，
 * 产出结构与之对齐，方便后续把 planner 抽到 `packages/shared` 一份实现两处用。
 */

/** 抽签轨迹的一步（与 `lib/simulate.ts` 的 SimStep 同构，便于复用渲染） */
export interface PlanStep {
  no: number
  label: string
  detail: string
  /** true=命中 / false=未命中 / null=非概率步骤 */
  hit: boolean | null
}

/** 抽签轨迹（写进 `messages.plan`，对应 DB 里的 `messages.plan JSONB`） */
export interface ReplyTrace {
  /** 出稿方：web-local（本机） / server（多端） */
  engine: 'web-local' | 'server'
  /** 这一条是「回你」还是「他主动来的」 */
  trigger?: 'reply' | 'proactive'
  /** 出稿时使用的规则版本 */
  rulesVersion: number
  steps: PlanStep[]
  /** 载体类型（text/kaomoji/sticker/image） */
  carrier?: string
  /** 用到的字卡 id */
  cardIds?: string[]
  /** 本条是否命中撤回 */
  recalled?: boolean
  /** 是否已读不回 */
  silent?: boolean
  /** 拾取：把我上一句存进他的字卡库 */
  pickup?: boolean
  /** 跳过原因（如未配置 MiniMax / 搜索 Key） */
  skipped?: string[]
}

/** 本地自由组句的结果 */
export interface ComposeResult {
  text: string
  /** card-join=以字卡为素材拼句；template=字卡库为空时的语气模板；pinyin=直接用拼音卡 */
  via: 'card-join' | 'template' | 'pinyin'
}
