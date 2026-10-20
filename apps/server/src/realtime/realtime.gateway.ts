import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket } from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'

/**
 * 实时网关（/rt）
 *  server → client: message:new | message:recall | peer:typing | call:event
 *                   companion:update | room:progress | proactive:tick
 *  client → server: room:join | typing | read
 */
@WebSocketGateway({ namespace: '/rt', cors: { origin: true, credentials: true } })
export class RealtimeGateway {
  @WebSocketServer() server!: Server

  /** 按 coupleId 分房，天然隔离双人域 */
  @SubscribeMessage('room:join')
  join(@ConnectedSocket() socket: Socket, @MessageBody() body: { coupleId: string }) {
    void socket.join(`couple:${body.coupleId}`)
    return { ok: true }
  }

  @SubscribeMessage('typing')
  typing(@ConnectedSocket() socket: Socket, @MessageBody() body: { conversationId: string; typing: boolean }) {
    socket.to(`conv:${body.conversationId}`).emit('peer:typing', { typing: body.typing })
  }

  @SubscribeMessage('read')
  read(@ConnectedSocket() socket: Socket, @MessageBody() body: { conversationId: string; messageId: string }) {
    socket.to(`conv:${body.conversationId}`).emit('message:read', body)
  }

  emitMessage(coupleId: string, message: unknown) {
    this.server.to(`couple:${coupleId}`).emit('message:new', message)
  }

  emitRecall(coupleId: string, id: string) {
    this.server.to(`couple:${coupleId}`).emit('message:recall', { id })
  }

  emitProactiveTick(coupleId: string, kind: string) {
    this.server.to(`couple:${coupleId}`).emit('proactive:tick', { kind })
  }

  /** 观影室 / 阅读室进度同步 */
  emitRoomProgress(coupleId: string, p: { roomId: string; progressMs: number; playing: boolean }) {
    this.server.to(`couple:${coupleId}`).emit('room:progress', p)
  }
}
