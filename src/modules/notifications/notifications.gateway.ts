import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

export interface NewNotificationPayload {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  metadata?: any;
  createdAt: string;
}

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: 'notifications',
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Client connected to notifications gateway: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected from notifications gateway: ${client.id}`);
  }

  /**
   * Client joins their private user room: user-{userId}
   */
  @SubscribeMessage('joinUser')
  handleJoinUser(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId?: string; user_id?: string },
  ) {
    const userId = data?.userId || data?.user_id;
    if (userId) {
      const room = `user-${userId}`;
      client.join(room);
      this.logger.log(`Client ${client.id} joined personal room ${room}`);
      return { event: 'joined', room };
    }
  }

  /**
   * Client leaves their private user room
   */
  @SubscribeMessage('leaveUser')
  handleLeaveUser(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId?: string; user_id?: string },
  ) {
    const userId = data?.userId || data?.user_id;
    if (userId) {
      const room = `user-${userId}`;
      client.leave(room);
      this.logger.log(`Client ${client.id} left personal room ${room}`);
      return { event: 'left', room };
    }
  }

  /**
   * Emit 'notification:new' to user's private room
   */
  emitNewNotification(userId: string, notification: NewNotificationPayload) {
    const room = `user-${userId}`;
    if (this.server) {
      this.server.to(room).emit('notification:new', notification);
    }
    this.logger.log(`Emitted notification:new to ${room}`);
  }
}
