import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/conversations',
})
export class ConversationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ConversationsGateway.name);

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected to conversations gateway: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected from conversations gateway: ${client.id}`);
  }

  @SubscribeMessage('joinConversation')
  handleJoinConversation(
    @MessageBody() payload: { conversationId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const room = this.getConversationRoom(payload.conversationId);
    client.join(room);

    this.logger.log(`Client ${client.id} joined room ${room}`);

    return {
      event: 'joinedConversation',
      data: {
        conversationId: payload.conversationId,
      },
    };
  }

  @SubscribeMessage('leaveConversation')
  handleLeaveConversation(
    @MessageBody() payload: { conversationId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const room = this.getConversationRoom(payload.conversationId);
    client.leave(room);

    this.logger.log(`Client ${client.id} left room ${room}`);

    return {
      event: 'leftConversation',
      data: {
        conversationId: payload.conversationId,
      },
    };
  }

  emitConversationUpdated(
    conversationId: string,
    data: Record<string, unknown>,
  ): void {
    this.server
      .to(this.getConversationRoom(conversationId))
      .emit('conversationUpdated', data);
  }

  emitNewMessage(
    conversationId: string,
    data: Record<string, unknown>,
  ): void {
    this.server
      .to(this.getConversationRoom(conversationId))
      .emit('newMessage', data);
  }

  emitConversationAssigned(
    conversationId: string,
    data: Record<string, unknown>,
  ): void {
    this.server
      .to(this.getConversationRoom(conversationId))
      .emit('conversationAssigned', data);
  }

  private getConversationRoom(conversationId: string): string {
    return `conversation:${conversationId}`;
  }
}