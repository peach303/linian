import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'
import { RulesService } from '../rules/rules.service'
import { LlmService } from '../../integrations/llm/llm.service'
import { MinimaxService } from '../../integrations/minimax/minimax.service'
import { SearchService } from '../../integrations/search/search.service'
import { createReplyEngine, type ReplyCard, type ReplyPlan } from '../../engine/reply-engine'
import { RealtimeGateway } from '../../realtime/realtime.gateway'

@Injectable()
export class ChatService {
  private readonly engine: ReturnType<typeof createReplyEngine>

  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RulesService,
    private readonly llm: LlmService,
    private readonly tts: MinimaxService,
    private readonly search: SearchService,
    private readonly rt: RealtimeGateway,
  ) {
    // 引擎装配：把外部能力以端口形式注入，引擎本身保持纯函数
    this.engine = createReplyEngine({
      llm: {
        composeSentence: (i) => this.llm.composeSentence(i),
        toPinyin: (s) => this.llm.toPinyin(s),
      },
      // 语音：同上，按端口形状给一个对象（引擎调的是 `deps.tts.synthesize`）
      tts: { synthesize: (t, o) => this.tts.synthesize(t, o) },
      // 联网搜索：多端版仍把它当「出稿时的一个旁路」用（本机版已改成**独立排程**，
      // 见 `apps/web/src/lib/engine/search.ts`）。这里按 `reply-engine` 的端口形状适配：
      // 搜到的第一条才回给引擎，搜不到（或没配 Key）回 null —— **绝不编一条**。
      search: {
        fetchOne: async (topics) => {
          const out = await this.search.search(topics[0] ?? '')
          const top = out.results[0]
          return top ? { title: top.name, url: top.url, source: top.siteName || '博查搜索' } : null
        },
      },
    })
  }

  /**
   * 我发了一条消息 → 落库 → 广播 → 规划梦角的回复
   * 回复延迟由引擎算出，交给 BullMQ 定时投递（此处给出直连写法以便理解）。
   */
  async send(coupleId: string, conversationId: string, meId: string, body: { kind: string; text?: string; payload?: unknown }) {
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId: meId,
        kind: body.kind as never,
        text: body.text,
        payload: (body.payload ?? undefined) as never,
        status: 'SENT',
      },
    })
    this.rt.emitMessage(coupleId, message)

    // 反向：拾取（把我这句话存进他的字卡库）
    void this.maybePickup(coupleId, message.id, body.text)

    // 正向：规划回复
    const plan = await this.planReply(coupleId, conversationId, body.text ?? '')
    void this.dispatch(conversationId, plan)

    return message
  }

  private async planReply(coupleId: string, conversationId: string, lastUserText: string): Promise<ReplyPlan> {
    const cfg = await this.rules.getActive(coupleId)
    const cards = (await this.prisma.card.findMany({
      where: { deck: { coupleId }, enabled: true },
      take: 200,
    })) as unknown as ReplyCard[]

    return this.engine.plan(cfg, {
      lastUserText,
      history: [],
      cards,
    })
  }

  /** 按 latencyMs 逐条下发（生产环境：BullMQ delayed job + 取消窗口） */
  private async dispatch(conversationId: string, plan: ReplyPlan) {
    for (const item of plan.items) {
      await sleep(Math.min(item.latencyMs, 8_000))
      // TODO: 落库 messages（带 plan / latencyMs）+ WS 推送 + 触发打字指示器
      void conversationId
      void item
    }
  }

  /** 拾取：抽中则把我的一句话写进他的字卡库（source = PICKED） */
  private async maybePickup(coupleId: string, messageId: string, text?: string) {
    if (!text) return
    const cfg = await this.rules.getActive(coupleId)
    if (!cfg.chat.pickup.enabled || Math.random() > cfg.chat.pickup.p) return

    const deck = await this.prisma.cardDeck.upsert({
      where: { coupleId },
      create: { coupleId },
      update: {},
    })
    const card = await this.prisma.card.create({
      data: { deckId: deck.id, type: 'TEXT', source: 'PICKED', text, category: '拾取' },
    })
    await this.prisma.pickupLog.create({
      data: { coupleId, messageId, cardId: card.id, pickedBy: 'DREAM' },
    })
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
