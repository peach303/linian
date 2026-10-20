import { Module } from '@nestjs/common'
import { ChatController } from './chat.controller'
import { ChatService } from './chat.service'
import { RulesModule } from '../rules/rules.module'
import { IntegrationsModule } from '../integrations/integrations.module'
import { RealtimeModule } from '../../realtime/realtime.module'

@Module({
  imports: [RulesModule, IntegrationsModule, RealtimeModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
