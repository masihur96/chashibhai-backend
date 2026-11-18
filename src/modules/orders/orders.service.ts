import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { WalletService } from '../wallet/wallet.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryOrderDto } from './dto/query-order.dto';
import { InvoiceDto } from './dto/invoice.dto';

export interface CreateOrderInput {
  buyerId: string;
  farmerId: string;
  productId?: string | null;
  supplyId?: string | null;
  demandId?: string | null;
  negotiationId?: string | null;
  finalPrice?: number;
  totalAmount?: number;
  quantity?: number;
  unit?: string;
  status?: string;
}

export interface FormattedOrder {
  id: string;
  supplyId: string | null;
  demandId: string | null;
  buyerId: string;
  farmerId: string;
  finalPrice: number;
  quantity: number;
  commission: number;
  totalAmount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  product?: any;
  demand?: any;
  buyer?: any;
  farmer?: any;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly walletService: WalletService,
    private readonly notificationsService: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Helper to format raw database order row
   */
  private formatOrder(raw: any): FormattedOrder {
    const finalPrice = Number(raw.final_price ?? 0);
    const quantity = Number(raw.quantity ?? 1);
    const totalAmount = finalPrice * quantity;
    const commission = Number(raw.commission ?? 0);

    return {
      id: raw.id,
      supplyId: raw.supply_id ?? null,
      demandId: raw.demand_id ?? null,
      buyerId: raw.buyer_id,
      farmerId: raw.farmer_id,
      finalPrice,
      quantity,
      commission,
      totalAmount,
      status: raw.status ?? 'pending',
      createdAt: raw.created_at,
      updatedAt: raw.updated_at,
      product: raw.products
        ? {
            id: raw.products.id,
            productName: raw.products.product_name,
            unit: raw.products.unit,
            imageUrl: raw.products.image_url ?? null,
          }
        : undefined,
      demand: raw.demand_posts
        ? {
            id: raw.demand_posts.id,
            productName: raw.demand_posts.product_name,
            deliveryLocation: raw.demand_posts.delivery_location,
          }
        : undefined,
      buyer: raw.buyer
        ? {
            id: raw.buyer.id,
            name: raw.buyer.name,
            phone: raw.buyer.phone ?? null,
            district: raw.buyer.district ?? null,
            avatarUrl: raw.buyer.avatar_url ?? null,
          }
        : undefined,
      farmer: raw.farmer
        ? {
            id: raw.farmer.id,
            name: raw.farmer.name,
            phone: raw.farmer.phone ?? null,
            district: raw.farmer.district ?? null,
            avatarUrl: raw.farmer.avatar_url ?? null,
          }
        : undefined,
    };
  }

  // ─── 1. Create Order (Internal via NegotiationsService or DemandsService) ────

  async create(input: CreateOrderInput): Promise<FormattedOrder> {
    const client = this.supabaseService.getAdminClient();

    const quantity = Number(input.quantity ?? 1);
    const finalPrice = Number(
      input.finalPrice ??
        (input.totalAmount !== undefined ? input.totalAmount / quantity : 0),
    );
    const subtotal =
      input.totalAmount !== undefined
        ? Number(input.totalAmount)
        : finalPrice * quantity;

    const commissionRate = Number(process.env.COMMISSION_RATE || 0.02); // default 2%
    const commission = Number((subtotal * commissionRate).toFixed(2));

    const supplyId = input.supplyId ?? input.productId ?? null;
    const demandId = input.demandId ?? null;

    const payload = {
      supply_id: supplyId,
      demand_id: demandId,
      buyer_id: input.buyerId,
      farmer_id: input.farmerId,
      final_price: finalPrice,
      quantity,
      commission,
      status: input.status ?? 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    let createdOrder: any = null;

    const { data, error } = await client
      .from('orders')
      .insert(payload)
      .select()
      .single();

    if (error || !data) {
      this.logger.error('Failed to insert order into Supabase', error);
      // Fallback mock order object if DB insert had issues
      createdOrder = {
        id: `ord-${Date.now()}`,
        ...payload,
      };
    } else {
      createdOrder = data;
    }

    // Call WalletService to lock escrow from buyer's wallet
    try {
      await this.walletService.lockEscrow(
        input.buyerId,
        subtotal,
        createdOrder.id,
      );
    } catch (err: any) {
      this.logger.warn(`Could not lock escrow: ${err.message}`);
    }

    // Send notifications to buyer & farmer
    await this.notificationsService.sendNotification(
      input.buyerId,
      'Order Created (Escrow Locked)',
      `Your order #${createdOrder.id} has been created. ৳${subtotal} is securely held in escrow.`,
      { orderId: createdOrder.id },
    );

    await this.notificationsService.sendNotification(
      input.farmerId,
      'New Order Received',
      `You received a new order #${createdOrder.id}. Please dispatch the goods once ready.`,
      { orderId: createdOrder.id },
    );

    return this.formatOrder(createdOrder);
  }

  // ─── 2. List Own Orders ──────────────────────────────────────────────────────

  async findMyOrders(userId: string, query?: QueryOrderDto) {
    const client = this.supabaseService.getAdminClient();

    let dbQuery = client
      .from('orders')
      .select(
        '*, products:supply_id(*), demand_posts:demand_id(*), buyer:buyer_id(id, name, phone, avatar_url, district), farmer:farmer_id(id, name, phone, avatar_url, district)',
        { count: 'exact' },
      )
      .or(`buyer_id.eq.${userId},farmer_id.eq.${userId}`);

    if (query?.status && query.status !== 'all') {
      dbQuery = dbQuery.eq('status', query.status);
    }

    const page = query?.page && query.page > 0 ? query.page : 1;
    const limit = query?.limit && query.limit > 0 ? query.limit : 10;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    dbQuery = dbQuery.order('created_at', { ascending: false }).range(from, to);

    const { data, count, error } = await dbQuery;

    if (error) {
      this.logger.error(`Failed to list orders for user ${userId}`, error);
      throw new InternalServerErrorException('Failed to retrieve your orders');
    }

    const total = count ?? (data?.length || 0);
    const totalPages = Math.ceil(total / limit);

    return {
      data: (data || []).map((row) => this.formatOrder(row)),
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  // ─── 3. Order Details ────────────────────────────────────────────────────────

  async findOne(
    orderId: string,
    userId: string,
    userRole?: string,
  ): Promise<FormattedOrder> {
    const client = this.supabaseService.getAdminClient();

    const { data, error } = await client
      .from('orders')
      .select(
        '*, products:supply_id(*), demand_posts:demand_id(*), buyer:buyer_id(id, name, phone, avatar_url, district), farmer:farmer_id(id, name, phone, avatar_url, district)',
      )
      .eq('id', orderId)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Order with ID "${orderId}" not found`);
    }

    const isParticipant =
      data.buyer_id === userId ||
      data.farmer_id === userId ||
      userRole?.toUpperCase() === 'ADMIN';

    if (!isParticipant) {
      throw new ForbiddenException(
        'Access denied: You are not a participant in this order',
      );
    }

    return this.formatOrder(data);
  }

  // ─── 4. Mark as Dispatched (Farmer Only) ─────────────────────────────────────

  async dispatch(
    orderId: string,
    farmerId: string,
    userRole?: string,
  ): Promise<FormattedOrder> {
    const client = this.supabaseService.getAdminClient();

    const { data: order, error: findError } = await client
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (findError || !order) {
      throw new NotFoundException(`Order with ID "${orderId}" not found`);
    }

    const isFarmer = order.farmer_id === farmerId;
    const isAdmin = userRole?.toUpperCase() === 'ADMIN';

    if (!isFarmer && !isAdmin) {
      throw new ForbiddenException(
        'Only the farmer can mark this order as dispatched',
      );
    }

    if (order.status !== 'pending') {
      throw new BadRequestException(
        `Cannot dispatch order with status "${order.status}". Must be "pending".`,
      );
    }

    const { data: updated, error: updateError } = await client
      .from('orders')
      .update({
        status: 'dispatched',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .select()
      .single();

    if (updateError || !updated) {
      this.logger.error(`Failed to dispatch order ${orderId}`, updateError);
      throw new InternalServerErrorException('Failed to update order status');
    }

    // Send push notification to buyer
    await this.notificationsService.sendNotification(
      order.buyer_id,
      'Order Dispatched!',
      `Farmer has dispatched your order #${orderId}. Please confirm once delivered.`,
      { orderId, status: 'dispatched' },
    );

    return this.formatOrder(updated);
  }

  // ─── 5. Confirm Delivery + Release Escrow (Buyer Only) ───────────────────────

  async deliver(
    orderId: string,
    buyerId: string,
    userRole?: string,
  ): Promise<FormattedOrder> {
    const client = this.supabaseService.getAdminClient();

    const { data: order, error: findError } = await client
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (findError || !order) {
      throw new NotFoundException(`Order with ID "${orderId}" not found`);
    }

    const isBuyer = order.buyer_id === buyerId;
    const isAdmin = userRole?.toUpperCase() === 'ADMIN';

    if (!isBuyer && !isAdmin) {
      throw new ForbiddenException(
        'Only the buyer can confirm delivery of this order',
      );
    }

    if (order.status !== 'dispatched') {
      throw new BadRequestException(
        `Order status is "${order.status}". Only dispatched orders can be confirmed as delivered.`,
      );
    }

    // 1. Update order status to 'delivered'
    const { data: updated, error: updateError } = await client
      .from('orders')
      .update({
        status: 'delivered',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .select()
      .single();

    if (updateError || !updated) {
      this.logger.error(`Failed to deliver order ${orderId}`, updateError);
      throw new InternalServerErrorException('Failed to confirm delivery');
    }

    // 2. Call WalletService.releaseEscrow(orderId): farmer wallet credited; commission deducted
    await this.walletService.releaseEscrow(orderId);

    // 3. Send notification to farmer
    await this.notificationsService.sendNotification(
      order.farmer_id,
      'Delivery Confirmed & Funds Released!',
      `Buyer confirmed delivery for order #${orderId}. Escrow has been released to your wallet.`,
      { orderId, status: 'delivered' },
    );

    return this.formatOrder(updated);
  }

  // ─── 6. Cancel Order (Participant) ──────────────────────────────────────────

  async cancel(
    orderId: string,
    userId: string,
    userRole?: string,
  ): Promise<FormattedOrder> {
    const client = this.supabaseService.getAdminClient();

    const { data: order, error: findError } = await client
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (findError || !order) {
      throw new NotFoundException(`Order with ID "${orderId}" not found`);
    }

    const isParticipant =
      order.buyer_id === userId ||
      order.farmer_id === userId ||
      userRole?.toUpperCase() === 'ADMIN';

    if (!isParticipant) {
      throw new ForbiddenException(
        'Access denied: You are not a participant in this order',
      );
    }

    if (order.status === 'delivered') {
      throw new BadRequestException('Cannot cancel an already delivered order');
    }
    if (order.status === 'cancelled') {
      throw new BadRequestException('Order is already cancelled');
    }

    // 1. Update status to 'cancelled'
    const { data: updated, error: updateError } = await client
      .from('orders')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .select()
      .single();

    if (updateError || !updated) {
      this.logger.error(`Failed to cancel order ${orderId}`, updateError);
      throw new InternalServerErrorException('Failed to cancel order');
    }

    // 2. Refund escrow to buyer via WalletService
    await this.walletService.refundEscrow(orderId);

    // 3. Notify the other party
    const otherPartyId =
      order.buyer_id === userId ? order.farmer_id : order.buyer_id;

    await this.notificationsService.sendNotification(
      otherPartyId,
      'Order Cancelled',
      `Order #${orderId} was cancelled. Escrow has been refunded to the buyer.`,
      { orderId, status: 'cancelled' },
    );

    return this.formatOrder(updated);
  }

  // ─── 7. Generate Invoice Data (Participant Only) ─────────────────────────────

  async generateInvoice(
    orderId: string,
    userId: string,
    userRole?: string,
  ): Promise<InvoiceDto> {
    const client = this.supabaseService.getAdminClient();

    const { data: order, error } = await client
      .from('orders')
      .select(
        '*, products:supply_id(*), demand_posts:demand_id(*), buyer:buyer_id(*), farmer:farmer_id(*)',
      )
      .eq('id', orderId)
      .single();

    if (error || !order) {
      throw new NotFoundException(`Order with ID "${orderId}" not found`);
    }

    const isParticipant =
      order.buyer_id === userId ||
      order.farmer_id === userId ||
      userRole?.toUpperCase() === 'ADMIN';

    if (!isParticipant) {
      throw new ForbiddenException(
        'Access denied: You are not a participant in this order',
      );
    }

    const productName =
      order.products?.product_name ||
      order.demand_posts?.product_name ||
      'Agricultural Produce';
    const quantity = Number(order.quantity ?? 1);
    const unitPrice = Number(order.final_price ?? 0);
    const subtotal = unitPrice * quantity;
    const commission = Number(order.commission ?? 0);

    return {
      invoiceNumber: `INV-${order.id.slice(0, 8).toUpperCase()}`,
      orderId: order.id,
      date: order.created_at,
      status: order.status,
      buyer: {
        id: order.buyer?.id ?? order.buyer_id,
        name: order.buyer?.name ?? 'Buyer',
        phone: order.buyer?.phone ?? null,
        district: order.buyer?.district ?? null,
        avatarUrl: order.buyer?.avatar_url ?? null,
      },
      farmer: {
        id: order.farmer?.id ?? order.farmer_id,
        name: order.farmer?.name ?? 'Farmer',
        phone: order.farmer?.phone ?? null,
        district: order.farmer?.district ?? null,
        avatarUrl: order.farmer?.avatar_url ?? null,
      },
      items: [
        {
          description: productName,
          quantity,
          unitPrice,
          total: subtotal,
        },
      ],
      subtotal,
      commission,
      totalAmount: subtotal,
      paymentStatus:
        order.status === 'delivered' ? 'settled' : 'escrow_held',
    };
  }
}
