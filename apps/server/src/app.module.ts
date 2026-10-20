import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { PrismaModule } from './common/prisma.module'
import { ChatModule } from './modules/chat/chat.module'
import { RulesModule } from './modules/rules/rules.module'
import { CardsModule } from './modules/cards/cards.module'
import { MomentsModule } from './modules/moments/moments.module'
import { MailboxModule } from './modules/mailbox/mailbox.module'
import { HubModule } from './modules/hub/hub.module'
import { IntegrationsModule } from './modules/integrations/integrations.module'
import { RealtimeModule } from './realtime/realtime.module'
import { ProactiveModule } from './engine/proactive.module'

/**
 * 模块清单（对应前端 18 个功能 + 引擎）：
 *  chat / rules / cards / moments / mailbox / hub(音乐·陪伴·日记·统计·收藏·查岗·房间…)
 *  integrations(LLM·MiniMax·搜索) / realtime(WS) / proactive(主动消息调度)
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ChatModule,
    RulesModule,
    CardsModule,
    MomentsModule,
    MailboxModule,
    HubModule,
    IntegrationsModule,
    RealtimeModule,
    ProactiveModule,
  ],
})
export class AppModule {}
