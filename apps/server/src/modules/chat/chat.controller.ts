import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common'
import { ChatService } from './chat.service'

/**
 * 聊天接口
 *  POST /api/v1/conversations/:id/messages   发消息（返回落库消息；回复走 WS）
 *  GET  /api/v1/conversations/:id/messages   拉历史（游标 before）
 *  POST /api/v1/messages/:id/recall          撤回
 *  POST /api/v1/conversations/:id/read       上报已读水位
 */
@Controller()
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('conversations/:id/messages')
  list(@Query('before') before?: string) {
    // TODO: 游标分页 + 已读水位合并
    void before
    return []
  }

  @Post('conversations/:id/messages')
  send(@Body() body: { kind: string; text?: string; payload?: unknown }) {
    // TODO: 从会话上下文解析 coupleId / meId（当前登录态）
    return this.chat.send('cp_1', 'c_1', 'u_me', body)
  }

  @Post('messages/:id/recall')
  recall() {
    return { ok: true }
  }

  @Put('conversations/:id/read')
  read(@Body() body: { messageId: string }) {
    return { ok: true, ...body }
  }
}
