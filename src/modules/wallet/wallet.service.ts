import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import { DepositDto } from './dto/deposit.dto';
import { WithdrawDto } from './dto/withdraw.dto';
import { QueryTransactionDto } from './dto/query-transaction.dto';

export interface FormattedTransaction {
  id: string;
  userId: string;
  orderId: string | null;
  type: string;
  amount: number;
  note: string | null;
  createdAt: string;
}

export interface FormattedEscrowLock {
  id: string;
  orderId: string;
  buyerId: string;
  amount: number;
  status: string;
  createdAt: string;
}

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseService: SupabaseService,
  ) {}

  /**
   * Helper to format raw database transaction row
   */
  private formatTransaction(raw: any): FormattedTransaction {
    return {
      id: raw.id,
      userId: raw.user_id,
      orderId: raw.order_id ?? null,
      type: raw.type,
      amount: Number(raw.amount),
      note: raw.note ?? null,
      createdAt: raw.created_at,
    };
  }

  /**
   * Helper to format raw database escrow lock row
   */
  private formatEscrow(raw: any): FormattedEscrowLock {
    return {
      id: raw.id,
      orderId: raw.order_id,
      buyerId: raw.buyer_id,
      amount: Number(raw.amount),
      status: raw.status ?? 'locked',
      createdAt: raw.created_at,
    };
  }

  // ─── 1. Get Wallet Balance ───────────────────────────────────────────────────

  async getBalance(userId: string) {
    const client = this.supabaseService.getAdminClient();

    const { data: profile, error } = await client
      .from('profiles')
      .select('id, name, wallet_balance')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      throw new NotFoundException(`User profile for "${userId}" not found`);
    }

    const balance = Number(profile.wallet_balance ?? 0.0);
    return {
      userId: profile.id,
      name: profile.name,
      balance,
    };
  }

  // ─── 2. Deposit Funds (Atomic via RPC with fallback) ─────────────────────────

  async deposit(userId: string, dto: DepositDto) {
    const client = this.supabaseService.getAdminClient();
    const amount = Number(dto.amount);
    const note =
      dto.note ||
      `Deposit via ${dto.paymentMethod || 'gateway'}${dto.referenceId ? ` (Ref: ${dto.referenceId})` : ''}`;

    // 1. Try Supabase RPC for atomic execution
    try {
      const { data: rpcResult, error: rpcError } = await client.rpc(
        'update_wallet_balance',
        {
          p_user_id: userId,
          p_amount: amount,
          p_type: 'deposit',
          p_order_id: null,
          p_note: note,
        },
      );

      if (!rpcError && rpcResult) {
        return {
          success: true,
          userId,
          amount,
          newBalance: Number(rpcResult.newBalance),
          transactionId: rpcResult.transactionId,
          type: 'deposit',
          message: `Successfully deposited ৳${amount} to wallet.`,
        };
      }
    } catch (e: any) {
      this.logger.warn(
        `RPC update_wallet_balance failed, using direct query fallback: ${e.message}`,
      );
    }

    // 2. Direct fallback
    const { data: profile } = await client
      .from('profiles')
      .select('wallet_balance')
      .eq('id', userId)
      .single();

    const currentBal = Number(profile?.wallet_balance ?? 0.0);
    const newBalance = currentBal + amount;

    await client
      .from('profiles')
      .update({ wallet_balance: newBalance })
      .eq('id', userId);

    const { data: trx } = await client
      .from('transactions')
      .insert({
        user_id: userId,
        type: 'deposit',
        amount,
        note,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    return {
      success: true,
      userId,
      amount,
      newBalance,
      transactionId: trx?.id,
      type: 'deposit',
      message: `Successfully deposited ৳${amount} to wallet.`,
    };
  }

  // ─── 3. Request Withdrawal (Atomic via RPC with fallback) ────────────────────

  async withdraw(userId: string, dto: WithdrawDto) {
    const client = this.supabaseService.getAdminClient();
    const amount = Number(dto.amount);
    const note =
      dto.note ||
      `Withdrawal via ${dto.paymentMethod || 'payout'}${dto.accountNumber ? ` to ${dto.accountNumber}` : ''}`;

    // Verify current balance first
    const { data: profile, error: profErr } = await client
      .from('profiles')
      .select('wallet_balance')
      .eq('id', userId)
      .single();

    if (profErr || !profile) {
      throw new NotFoundException('User profile not found');
    }

    const currentBal = Number(profile.wallet_balance ?? 0.0);
    if (currentBal < amount) {
      throw new BadRequestException(
        `Insufficient balance. Current balance is ৳${currentBal}, requested withdrawal is ৳${amount}`,
      );
    }

    // 1. Try Supabase RPC for atomic execution
    try {
      const { data: rpcResult, error: rpcError } = await client.rpc(
        'update_wallet_balance',
        {
          p_user_id: userId,
          p_amount: -amount,
          p_type: 'withdrawal',
          p_order_id: null,
          p_note: note,
        },
      );

      if (!rpcError && rpcResult) {
        return {
          success: true,
          userId,
          amount,
          newBalance: Number(rpcResult.newBalance),
          transactionId: rpcResult.transactionId,
          type: 'withdrawal',
          message: `Withdrawal request of ৳${amount} submitted successfully.`,
        };
      }
    } catch (e: any) {
      this.logger.warn(
        `RPC update_wallet_balance failed, using direct query fallback: ${e.message}`,
      );
    }

    // 2. Direct fallback
    const newBalance = currentBal - amount;
    await client
      .from('profiles')
      .update({ wallet_balance: newBalance })
      .eq('id', userId);

    const { data: trx } = await client
      .from('transactions')
      .insert({
        user_id: userId,
        type: 'withdrawal',
        amount,
        note,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    return {
      success: true,
      userId,
      amount,
      newBalance,
      transactionId: trx?.id,
      type: 'withdrawal',
      message: `Withdrawal request of ৳${amount} submitted successfully.`,
    };
  }

  // ─── 4. Lock Escrow (Order Creation) ─────────────────────────────────────────

  async lockEscrow(
    buyerIdOrOrderId: string,
    amountOrBuyerId: number | string,
    orderIdOrAmount?: string | number,
  ) {
    let orderId: string;
    let buyerId: string;
    let amount: number;

    // Support both signatures:
    // lockEscrow(orderId, buyerId, amount) AND lockEscrow(buyerId, amount, orderId)
    if (typeof amountOrBuyerId === 'string') {
      orderId = buyerIdOrOrderId;
      buyerId = amountOrBuyerId;
      amount = Number(orderIdOrAmount);
    } else {
      buyerId = buyerIdOrOrderId;
      amount = Number(amountOrBuyerId);
      orderId = String(orderIdOrAmount || `ord-${Date.now()}`);
    }

    this.logger.log(
      `Locking escrow: Order ${orderId}, Buyer ${buyerId}, Amount ৳${amount}`,
    );

    const client = this.supabaseService.getAdminClient();

    // 1. Deduct from buyer wallet
    try {
      await client.rpc('update_wallet_balance', {
        p_user_id: buyerId,
        p_amount: -amount,
        p_type: 'escrow',
        p_order_id: orderId,
        p_note: `Escrow hold for order #${orderId}`,
      });
    } catch (e: any) {
      const { data: buyer } = await client
        .from('profiles')
        .select('wallet_balance')
        .eq('id', buyerId)
        .single();
      const current = Number(buyer?.wallet_balance ?? 0);
      const updated = Math.max(0, current - amount);
      await client
        .from('profiles')
        .update({ wallet_balance: updated })
        .eq('id', buyerId);

      await client.from('transactions').insert({
        user_id: buyerId,
        order_id: orderId,
        type: 'escrow',
        amount,
        note: `Escrow hold for order #${orderId}`,
        created_at: new Date().toISOString(),
      });
    }

    // 2. Insert into escrow_locks table (status: locked)
    const { data: lock, error: lockErr } = await client
      .from('escrow_locks')
      .upsert(
        {
          order_id: orderId,
          buyer_id: buyerId,
          amount,
          status: 'locked',
          created_at: new Date().toISOString(),
        },
        { onConflict: 'order_id' },
      )
      .select()
      .single();

    if (lockErr) {
      this.logger.warn(`Could not save to escrow_locks: ${lockErr.message}`);
    }

    return {
      success: true,
      orderId,
      buyerId,
      amount,
      status: 'locked',
      message: `Escrow of ৳${amount} locked successfully for order #${orderId}.`,
    };
  }

  // ─── 5. Release Escrow (Order Delivery) ──────────────────────────────────────

  async releaseEscrow(orderId: string, customAmount?: number) {
    this.logger.log(`Releasing escrow for Order #${orderId}`);
    const client = this.supabaseService.getAdminClient();

    // 1. Fetch escrow lock
    const { data: lock } = await client
      .from('escrow_locks')
      .select('*')
      .eq('order_id', orderId)
      .maybeSingle();

    // 2. Fetch order to get farmer_id and commission
    const { data: order, error: orderErr } = await client
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
      throw new NotFoundException(`Order with ID "${orderId}" not found`);
    }

    const totalAmount =
      customAmount ??
      (lock
        ? Number(lock.amount)
        : Number(order.final_price) * Number(order.quantity));

    const commission = Number(order.commission ?? 0.0);
    const netPayout = Math.max(0, totalAmount - commission);

    // 3. Credit farmer wallet
    try {
      await client.rpc('update_wallet_balance', {
        p_user_id: order.farmer_id,
        p_amount: netPayout,
        p_type: 'release',
        p_order_id: orderId,
        p_note: `Escrow release for order #${orderId} (Net after ৳${commission} fee)`,
      });
    } catch (e: any) {
      const { data: farmer } = await client
        .from('profiles')
        .select('wallet_balance')
        .eq('id', order.farmer_id)
        .single();
      const current = Number(farmer?.wallet_balance ?? 0);
      const updated = current + netPayout;

      await client
        .from('profiles')
        .update({ wallet_balance: updated })
        .eq('id', order.farmer_id);

      await client.from('transactions').insert({
        user_id: order.farmer_id,
        order_id: orderId,
        type: 'release',
        amount: netPayout,
        note: `Escrow release for order #${orderId} (Net after ৳${commission} fee)`,
        created_at: new Date().toISOString(),
      });
    }

    // 4. Update escrow_locks.status = 'released'
    await client
      .from('escrow_locks')
      .update({ status: 'released' })
      .eq('order_id', orderId);

    return {
      success: true,
      orderId,
      farmerId: order.farmer_id,
      amount: totalAmount,
      commission,
      netPayout,
      status: 'released',
      message: `Escrow released. Credited ৳${netPayout} to farmer after ৳${commission} fee.`,
    };
  }

  // ─── 6. Refund Escrow (Order Cancellation) ──────────────────────────────────

  async refundEscrow(orderId: string) {
    this.logger.log(`Refunding escrow for Order #${orderId}`);
    const client = this.supabaseService.getAdminClient();

    // 1. Fetch escrow lock
    const { data: lock } = await client
      .from('escrow_locks')
      .select('*')
      .eq('order_id', orderId)
      .maybeSingle();

    // 2. Fetch order to get buyer_id and amount
    const { data: order, error: orderErr } = await client
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
      throw new NotFoundException(`Order with ID "${orderId}" not found`);
    }

    const refundAmount = lock
      ? Number(lock.amount)
      : Number(order.final_price) * Number(order.quantity);

    // 3. Credit full amount back to buyer
    try {
      await client.rpc('update_wallet_balance', {
        p_user_id: order.buyer_id,
        p_amount: refundAmount,
        p_type: 'refund',
        p_order_id: orderId,
        p_note: `Escrow refund for cancelled order #${orderId}`,
      });
    } catch (e: any) {
      const { data: buyer } = await client
        .from('profiles')
        .select('wallet_balance')
        .eq('id', order.buyer_id)
        .single();
      const current = Number(buyer?.wallet_balance ?? 0);
      const updated = current + refundAmount;

      await client
        .from('profiles')
        .update({ wallet_balance: updated })
        .eq('id', order.buyer_id);

      await client.from('transactions').insert({
        user_id: order.buyer_id,
        order_id: orderId,
        type: 'refund',
        amount: refundAmount,
        note: `Escrow refund for cancelled order #${orderId}`,
        created_at: new Date().toISOString(),
      });
    }

    // 4. Update escrow_locks.status = 'refunded'
    await client
      .from('escrow_locks')
      .update({ status: 'refunded' })
      .eq('order_id', orderId);

    return {
      success: true,
      orderId,
      buyerId: order.buyer_id,
      amount: refundAmount,
      status: 'refunded',
      message: `Escrow of ৳${refundAmount} refunded to buyer.`,
    };
  }

  // ─── 7. Transaction History ─────────────────────────────────────────────────

  async getTransactions(userId: string, query?: QueryTransactionDto) {
    const client = this.supabaseService.getAdminClient();

    let dbQuery = client
      .from('transactions')
      .select('*', { count: 'exact' })
      .eq('user_id', userId);

    if (query?.type && query.type !== 'all') {
      dbQuery = dbQuery.eq('type', query.type);
    }

    const page = query?.page && query.page > 0 ? query.page : 1;
    const limit = query?.limit && query.limit > 0 ? query.limit : 10;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    dbQuery = dbQuery.order('created_at', { ascending: false }).range(from, to);

    const { data, count, error } = await dbQuery;

    if (error) {
      this.logger.error(`Failed to list transactions for ${userId}`, error);
      throw new InternalServerErrorException('Failed to retrieve transactions');
    }

    const total = count ?? (data?.length || 0);
    const totalPages = Math.ceil(total / limit);

    return {
      data: (data || []).map((row) => this.formatTransaction(row)),
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  // ─── 8. Active Escrow Locks ─────────────────────────────────────────────────

  async getEscrowLocks(userId: string) {
    const client = this.supabaseService.getAdminClient();

    const { data, error } = await client
      .from('escrow_locks')
      .select('*')
      .eq('buyer_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error(`Failed to get escrow locks for ${userId}`, error);
      throw new InternalServerErrorException('Failed to retrieve escrow locks');
    }

    return (data || []).map((row) => this.formatEscrow(row));
  }

  // ─── 9. Escrow Details for an Order (Participant Only) ──────────────────────

  async getEscrowByOrderId(orderId: string, userId: string, userRole?: string) {
    const client = this.supabaseService.getAdminClient();

    // Verify order participant
    const { data: order, error: orderErr } = await client
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
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

    const { data: lock } = await client
      .from('escrow_locks')
      .select('*')
      .eq('order_id', orderId)
      .maybeSingle();

    const { data: transactions } = await client
      .from('transactions')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });

    return {
      orderId,
      buyerId: order.buyer_id,
      farmerId: order.farmer_id,
      orderStatus: order.status,
      totalAmount: Number(order.final_price) * Number(order.quantity),
      commission: Number(order.commission),
      escrowLock: lock ? this.formatEscrow(lock) : null,
      transactions: (transactions || []).map((t) => this.formatTransaction(t)),
    };
  }
}
