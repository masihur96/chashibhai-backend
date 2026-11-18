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

export interface OfferReceivedPayload {
  negotiationId: string;
  offerId: string;
  senderId: string;
  recipientId: string;
  amount: number;
  note?: string | null;
  timestamp: string;
}

export interface NegotiationAcceptedPayload {
  negotiationId: string;
  acceptedBy: string;
  orderId: string;
  finalAmount: number;
}

export interface NegotiationRejectedPayload {
  negotiationId: string;
  rejectedBy: string;
}

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: 'negotiations',
})
export class NegotiationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NegotiationsGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Client connected to negotiations gateway: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected from negotiations gateway: ${client.id}`);
  }

  @SubscribeMessage('joinNegotiation')
  handleJoinNegotiation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { negotiationId?: string; negotiation_id?: string },
  ) {
    const negotiationId = data?.negotiationId || data?.negotiation_id;
    if (negotiationId) {
      const room = `negotiation-${negotiationId}`;
      client.join(room);
      this.logger.log(`Client ${client.id} joined ${room}`);
      return { event: 'joined', room };
    }
  }

  @SubscribeMessage('leaveNegotiation')
  handleLeaveNegotiation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { negotiationId?: string; negotiation_id?: string },
  ) {
    const negotiationId = data?.negotiationId || data?.negotiation_id;
    if (negotiationId) {
      const room = `negotiation-${negotiationId}`;
      client.leave(room);
      this.logger.log(`Client ${client.id} left ${room}`);
      return { event: 'left', room };
    }
  }

  @SubscribeMessage('joinUser')
  handleJoinUser(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId?: string },
  ) {
    if (data?.userId) {
      const room = `user-${data.userId}`;
      client.join(room);
      this.logger.log(`Client ${client.id} registered user room ${room}`);
      return { event: 'joined', room };
    }
  }

  /**
   * Realtime: emit Socket.IO event 'offer:received' to the other participant
   */
  emitOfferReceived(payload: OfferReceivedPayload) {
    const negRoom = `negotiation-${payload.negotiationId}`;
    const userRoom = `user-${payload.recipientId}`;

    this.logger.log(
      `Emitting offer:received to ${negRoom} & ${userRoom}: ${JSON.stringify(payload)}`,
    );

    if (this.server) {
      this.server.to(negRoom).emit('offer:received', payload);
      this.server.to(userRoom).emit('offer:received', payload);
      this.server.emit('offer:received', payload);
    }
  }

  emitNegotiationAccepted(payload: NegotiationAcceptedPayload) {
    const negRoom = `negotiation-${payload.negotiationId}`;
    this.logger.log(
      `Emitting negotiation:accepted to ${negRoom}: ${JSON.stringify(payload)}`,
    );

    if (this.server) {
      this.server.to(negRoom).emit('negotiation:accepted', payload);
      this.server.emit('negotiation:accepted', payload);
    }
  }

  emitNegotiationRejected(payload: NegotiationRejectedPayload) {
    const negRoom = `negotiation-${payload.negotiationId}`;
    this.logger.log(
      `Emitting negotiation:rejected to ${negRoom}: ${JSON.stringify(payload)}`,
    );

    if (this.server) {
      this.server.to(negRoom).emit('negotiation:rejected', payload);
      this.server.emit('negotiation:rejected', payload);
    }
  }
}
