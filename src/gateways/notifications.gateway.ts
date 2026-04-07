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
  namespace: '/notifications',
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected to notifications gateway: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected from notifications gateway: ${client.id}`);
  }

  @SubscribeMessage('joinUserNotifications')
  handleJoinUserNotifications(
    @MessageBody() payload: { userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const room = this.getUserRoom(payload.userId);
    client.join(room);

    this.logger.log(`Client ${client.id} joined notifications room ${room}`);

    return {
      event: 'joinedUserNotifications',
      data: {
        userId: payload.userId,
      },
    };
  }

  @SubscribeMessage('leaveUserNotifications')
  handleLeaveUserNotifications(
    @MessageBody() payload: { userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const room = this.getUserRoom(payload.userId);
    client.leave(room);

    this.logger.log(`Client ${client.id} left notifications room ${room}`);

    return {
      event: 'leftUserNotifications',
      data: {
        userId: payload.userId,
      },
    };
  }

  emitToUser(userId: string, notification: Record<string, unknown>): void {
    this.server.to(this.getUserRoom(userId)).emit('notification', notification);
  }

  emitSystemNotification(notification: Record<string, unknown>): void {
    this.server.emit('systemNotification', notification);
  }

  private getUserRoom(userId: string): string {
    return `user:${userId}`;
  }
}