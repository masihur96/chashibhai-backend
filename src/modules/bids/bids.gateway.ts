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

export interface BidPlacedPayload {
  productId: string;
  buyerId: string;
  amount: number;
  timestamp: string;
}

export interface AuctionEndedPayload {
  productId: string;
  winnerId: string | null;
  winningAmount: number | null;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'bids',
})
export class BidsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(BidsGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Client connected to bids gateway: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected from bids gateway: ${client.id}`);
  }

  /**
   * Client joins a product auction room: product-{productId}
   */
  @SubscribeMessage('joinProduct')
  handleJoinProduct(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { productId?: string; product_id?: string },
  ) {
    const productId = data?.productId || data?.product_id;
    if (productId) {
      const room = `product-${productId}`;
      client.join(room);
      this.logger.log(`Client ${client.id} joined room: ${room}`);
      return { event: 'joined', room };
    }
  }

  /**
   * Client leaves a product auction room
   */
  @SubscribeMessage('leaveProduct')
  handleLeaveProduct(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { productId?: string; product_id?: string },
  ) {
    const productId = data?.productId || data?.product_id;
    if (productId) {
      const room = `product-${productId}`;
      client.leave(room);
      this.logger.log(`Client ${client.id} left room: ${room}`);
      return { event: 'left', room };
    }
  }

  /**
   * Emit 'bid:placed' to clients in room `product-{productId}` and broadcast
   */
  emitBidPlaced(payload: BidPlacedPayload) {
    const room = `product-${payload.productId}`;
    this.logger.log(
      `Emitting bid:placed to room ${room}: ${JSON.stringify(payload)}`,
    );

    if (this.server) {
      this.server.to(room).emit('bid:placed', payload);
      this.server.emit('bid:placed', payload);
    }
  }

  /**
   * Emit 'auction:ended' to clients in room `product-{productId}` and broadcast
   */
  emitAuctionEnded(payload: AuctionEndedPayload) {
    const room = `product-${payload.productId}`;
    this.logger.log(
      `Emitting auction:ended to room ${room}: ${JSON.stringify(payload)}`,
    );

    if (this.server) {
      this.server.to(room).emit('auction:ended', payload);
      this.server.emit('auction:ended', payload);
    }
  }
}
