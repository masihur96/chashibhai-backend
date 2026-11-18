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

export interface GroupMessagePayload {
  id: string;
  groupId: string;
  senderId: string;
  message: string;
  sender?: {
    id: string;
    name: string;
    avatarUrl?: string | null;
  };
  createdAt: string;
}

export interface MemberJoinedPayload {
  groupId: string;
  userId: string;
  contributionQuantity: number;
  filledQuantity: number;
  targetQuantity: number;
  isFulfilled: boolean;
}

export interface MemberLeftPayload {
  groupId: string;
  userId: string;
  freedQuantity: number;
  filledQuantity: number;
}

export interface GroupFulfilledPayload {
  groupId: string;
  demandId: string;
  targetQuantity: number;
  filledQuantity: number;
}

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: 'groups',
})
export class GroupsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(GroupsGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Client connected to groups gateway: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected from groups gateway: ${client.id}`);
  }

  /**
   * Client joins a group room: group-{groupId}
   */
  @SubscribeMessage('joinGroup')
  handleJoinGroup(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { groupId?: string; group_id?: string },
  ) {
    const groupId = data?.groupId || data?.group_id;
    if (groupId) {
      const room = `group-${groupId}`;
      client.join(room);
      this.logger.log(`Client ${client.id} joined room ${room}`);
      return { event: 'joined', room };
    }
  }

  /**
   * Client leaves a group room
   */
  @SubscribeMessage('leaveGroup')
  handleLeaveGroup(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { groupId?: string; group_id?: string },
  ) {
    const groupId = data?.groupId || data?.group_id;
    if (groupId) {
      const room = `group-${groupId}`;
      client.leave(room);
      this.logger.log(`Client ${client.id} left room ${room}`);
      return { event: 'left', room };
    }
  }

  /**
   * Broadcast a chat message to group room
   */
  emitMessage(groupId: string, payload: GroupMessagePayload) {
    const room = `group-${groupId}`;
    if (this.server) {
      this.server.to(room).emit('message:received', payload);
      this.server.to(room).emit('group:message', payload);
    }
    this.logger.log(`Message broadcast to room ${room}`);
  }

  /**
   * Broadcast member joined event to group room
   */
  emitMemberJoined(groupId: string, payload: MemberJoinedPayload) {
    const room = `group-${groupId}`;
    if (this.server) {
      this.server.to(room).emit('member:joined', payload);
    }
    this.logger.log(`Member joined broadcast to room ${room}`);
  }

  /**
   * Broadcast member left event to group room
   */
  emitMemberLeft(groupId: string, payload: MemberLeftPayload) {
    const room = `group-${groupId}`;
    if (this.server) {
      this.server.to(room).emit('member:left', payload);
    }
    this.logger.log(`Member left broadcast to room ${room}`);
  }

  /**
   * Broadcast group fulfillment / auto demand post creation
   */
  emitGroupFulfilled(groupId: string, payload: GroupFulfilledPayload) {
    const room = `group-${groupId}`;
    if (this.server) {
      this.server.to(room).emit('group:fulfilled', payload);
    }
    this.logger.log(`Group fulfilled broadcast to room ${room}`);
  }

  /**
   * Broadcast demand created event
   */
  emitDemandCreated(
    groupId: string,
    payload: { groupId: string; demandId: string },
  ) {
    const room = `group-${groupId}`;
    if (this.server) {
      this.server.to(room).emit('group:demand_created', payload);
    }
    this.logger.log(`Demand created broadcast to room ${room}`);
  }
}
