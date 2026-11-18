import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { PrismaService } from '../../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  AdminDashboardDataDto,
  UserFilterDto,
  AnalyticsQueryDto,
  TopUsersQueryDto,
  VerifyUserDto,
  BanUserDto,
  UpdateProductStatusDto,
  UpdateOrderStatusDto,
  AdminOrderFilterDto,
  AdminProductFilterDto,
} from './dto';
import { generateCsv, CsvColumn } from './utils/csv.util';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ─── 1. Aggregated Dashboard Stats Overview ─────────────────────────────────

  async getDashboard(): Promise<AdminDashboardDataDto> {
    const client = this.supabaseService.getAdminClient();

    try {
      const [
        totalUsersRes,
        totalFarmersRes,
        totalBuyersRes,
        activeProductsRes,
        activeOrdersRes,
        totalRevenueRes,
        pendingKycRes,
        activeEscrowRes,
      ] = await Promise.all([
        // 1. Total users
        client.from('profiles').select('*', { count: 'exact', head: true }),
        // 2. Total farmers
        client
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'farmer'),
        // 3. Total buyers
        client
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'buyer'),
        // 4. Active products
        client
          .from('products')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'active'),
        // 5. Active orders (pending or dispatched)
        client
          .from('orders')
          .select('*', { count: 'exact', head: true })
          .in('status', ['pending', 'dispatched']),
        // 6. Total revenue (sum of release transactions)
        client.from('transactions').select('amount').eq('type', 'release'),
        // 7. Pending KYC (nid_verified = false and nid_number IS NOT NULL)
        client
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('nid_verified', false)
          .not('nid_number', 'is', null),
        // 8. Active escrow locks amount (status = locked)
        client.from('escrow_locks').select('amount').eq('status', 'locked'),
      ]);

      const totalRevenue = (totalRevenueRes.data || []).reduce(
        (acc: number, curr: any) => acc + Number(curr.amount || 0),
        0,
      );

      const activeEscrow = (activeEscrowRes.data || []).reduce(
        (acc: number, curr: any) => acc + Number(curr.amount || 0),
        0,
      );

      return {
        totalUsers: totalUsersRes.count ?? 0,
        totalFarmers: totalFarmersRes.count ?? 0,
        totalBuyers: totalBuyersRes.count ?? 0,
        activeProducts: activeProductsRes.count ?? 0,
        activeOrders: activeOrdersRes.count ?? 0,
        totalRevenue: Number(totalRevenue.toFixed(2)),
        pendingKyc: pendingKycRes.count ?? 0,
        activeEscrow: Number(activeEscrow.toFixed(2)),
      };
    } catch (err: any) {
      this.logger.error('Failed to load admin dashboard stats', err);
      throw new InternalServerErrorException(
        'Failed to aggregate dashboard overview',
      );
    }
  }

  // ─── 2. List All Users with Filters & Sorting ───────────────────────────────

  async getUsers(filter?: UserFilterDto) {
    const client = this.supabaseService.getAdminClient();

    let query = client.from('profiles').select('*', { count: 'exact' });

    if (filter?.role && filter.role !== 'all') {
      query = query.eq('role', filter.role.toLowerCase());
    }

    if (filter?.isVerified !== undefined) {
      query = query.eq('nid_verified', filter.isVerified);
    }

    if (filter?.isBanned !== undefined) {
      query = query.eq('is_banned', filter.isBanned);
    }

    if (filter?.search) {
      const s = filter.search;
      query = query.or(
        `name.ilike.%${s}%,phone.ilike.%${s}%,district.ilike.%${s}%`,
      );
    }

    const sortBy = filter?.sortBy || 'created_at';
    const sortOrder = filter?.sortOrder === 'asc';
    query = query.order(sortBy, { ascending: sortOrder });

    const page = filter?.page && filter.page > 0 ? filter.page : 1;
    const limit = filter?.limit && filter.limit > 0 ? filter.limit : 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    query = query.range(from, to);

    const { data, count, error } = await query;

    if (error) {
      this.logger.error('Failed to query users list', error);
      throw new InternalServerErrorException('Failed to retrieve users');
    }

    const total = count ?? (data?.length || 0);
    const totalPages = Math.ceil(total / limit);

    return {
      data: (data || []).map((u: any) => ({
        id: u.id,
        name: u.name,
        phone: u.phone,
        role: u.role,
        isVerified: Boolean(u.is_verified),
        nidVerified: Boolean(u.nid_verified),
        isBanned: Boolean(u.is_banned),
        walletBalance: Number(u.wallet_balance ?? 0),
        rating: Number(u.rating ?? 0),
        ratingCount: Number(u.rating_count ?? 0),
        avatarUrl: u.avatar_url ?? null,
        district: u.district ?? null,
        nidNumber: u.nid_number ?? null,
        createdAt: u.created_at,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  // ─── 3. Verify / Unverify User (NID) ────────────────────────────────────────

  async verifyUser(userId: string, dto?: VerifyUserDto) {
    const client = this.supabaseService.getAdminClient();
    const isVerified = dto?.isVerified ?? true;

    // Check user exists
    const { data: profile, error: profErr } = await client
      .from('profiles')
      .select('id, name')
      .eq('id', userId)
      .single();

    if (profErr || !profile) {
      throw new NotFoundException(`User with ID "${userId}" not found`);
    }

    const { data: updated, error: updateErr } = await client
      .from('profiles')
      .update({
        nid_verified: isVerified,
        is_verified: isVerified,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select('*')
      .single();

    if (updateErr || !updated) {
      this.logger.error(
        `Failed to update verification for ${userId}`,
        updateErr,
      );
      throw new InternalServerErrorException(
        'Failed to update verification status',
      );
    }

    // Send notification to user
    const title = isVerified
      ? 'KYC Verification Approved ✅'
      : 'KYC Verification Revoked ⚠️';
    const message = isVerified
      ? 'Congratulations! Your national identity has been verified by the ChashibhAI team.'
      : 'Your identity verification status has been revoked. Please review your submitted documents.';

    await this.notificationsService.sendNotification(
      userId,
      title,
      message,
      'alert',
      { reason: dto?.reason },
    );

    return {
      success: true,
      message: `User verification status updated to ${isVerified}`,
      user: {
        id: updated.id,
        name: updated.name,
        isVerified: updated.is_verified,
        nidVerified: updated.nid_verified,
      },
    };
  }

  // ─── 4. Ban / Unban User & Invalidate Tokens ────────────────────────────────

  async banUser(userId: string, dto?: BanUserDto) {
    const client = this.supabaseService.getAdminClient();
    const isBanned = dto?.isBanned ?? true;

    // Check user exists
    const { data: profile, error: profErr } = await client
      .from('profiles')
      .select('id, name')
      .eq('id', userId)
      .single();

    if (profErr || !profile) {
      throw new NotFoundException(`User with ID "${userId}" not found`);
    }

    // Update is_banned in profiles
    const { data: updated, error: updateErr } = await client
      .from('profiles')
      .update({
        is_banned: isBanned,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select('*')
      .single();

    if (updateErr || !updated) {
      this.logger.error(`Failed to update ban status for ${userId}`, updateErr);
      throw new InternalServerErrorException(
        'Failed to update user ban status',
      );
    }

    // Invalidate JWT tokens via blacklist record
    if (isBanned) {
      try {
        await client.from('jwt_blacklist').insert({
          user_id: userId,
          reason: dto?.reason || 'Account suspended by administrator',
          created_at: new Date().toISOString(),
        });
      } catch (e: any) {
        this.logger.warn(
          `Could not add user to jwt_blacklist table: ${e.message}`,
        );
      }

      await this.notificationsService.sendNotification(
        userId,
        'Account Suspended 🚫',
        'Your ChashibhAI account has been suspended by an administrator.',
        'alert',
        { reason: dto?.reason },
      );
    }

    return {
      success: true,
      message: `User has been ${isBanned ? 'banned' : 'unbanned'} successfully`,
      user: {
        id: updated.id,
        name: updated.name,
        isBanned: updated.is_banned,
      },
    };
  }

  // ─── 5. All Products (Admin view) ───────────────────────────────────────────

  async getProducts(filter?: AdminProductFilterDto) {
    const client = this.supabaseService.getAdminClient();

    let query = client
      .from('products')
      .select('*, profiles:farmer_id(id, name, phone, district)', {
        count: 'exact',
      });

    if (filter?.status && filter.status !== 'all') {
      query = query.eq('status', filter.status.toLowerCase());
    }

    if (filter?.category) {
      query = query.eq('category', filter.category.toLowerCase());
    }

    if (filter?.search) {
      query = query.ilike('product_name', `%${filter.search}%`);
    }

    const page = filter?.page && filter.page > 0 ? filter.page : 1;
    const limit = filter?.limit && filter.limit > 0 ? filter.limit : 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, count, error } = await query;

    if (error) {
      this.logger.error('Failed to list products for admin', error);
      throw new InternalServerErrorException('Failed to retrieve products');
    }

    const total = count ?? (data?.length || 0);
    const totalPages = Math.ceil(total / limit);

    return {
      data: (data || []).map((p: any) => ({
        id: p.id,
        farmerId: p.farmer_id,
        productName: p.product_name,
        quantity: Number(p.quantity),
        unit: p.unit,
        minimumPrice: Number(p.minimum_price),
        tradeType: p.trade_type,
        category: p.category,
        status: p.status,
        imageUrl: p.image_url,
        startTime: p.start_time,
        endTime: p.end_time,
        createdAt: p.created_at,
        farmer: p.profiles
          ? {
              id: p.profiles.id,
              name: p.profiles.name,
              phone: p.profiles.phone,
              district: p.profiles.district,
            }
          : undefined,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  // ─── 6. Change Product Status ───────────────────────────────────────────────

  async updateProductStatus(productId: string, dto: UpdateProductStatusDto) {
    const client = this.supabaseService.getAdminClient();

    const { data: updated, error } = await client
      .from('products')
      .update({ status: dto.status })
      .eq('id', productId)
      .select('*, profiles:farmer_id(id, name)')
      .single();

    if (error || !updated) {
      throw new NotFoundException(`Product with ID "${productId}" not found`);
    }

    // Notify farmer
    await this.notificationsService.sendNotification(
      updated.farmer_id,
      'Product Listing Status Updated',
      `Your product "${updated.product_name}" status was changed to "${dto.status}" by administration.`,
      'alert',
      { productId, status: dto.status, reason: dto.reason },
    );

    return {
      success: true,
      message: `Product status updated to ${dto.status}`,
      product: updated,
    };
  }

  // ─── 7. All Orders (Admin view) ─────────────────────────────────────────────

  async getOrders(filter?: AdminOrderFilterDto) {
    const client = this.supabaseService.getAdminClient();

    let query = client
      .from('orders')
      .select(
        '*, buyer:buyer_id(id, name, phone), farmer:farmer_id(id, name, phone)',
        { count: 'exact' },
      );

    if (filter?.status && filter.status !== 'all') {
      query = query.eq('status', filter.status.toLowerCase());
    }

    if (filter?.from) {
      query = query.gte('created_at', filter.from);
    }

    if (filter?.to) {
      query = query.lte('created_at', filter.to);
    }

    const page = filter?.page && filter.page > 0 ? filter.page : 1;
    const limit = filter?.limit && filter.limit > 0 ? filter.limit : 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, count, error } = await query;

    if (error) {
      this.logger.error('Failed to list orders for admin', error);
      throw new InternalServerErrorException('Failed to retrieve orders');
    }

    const total = count ?? (data?.length || 0);
    const totalPages = Math.ceil(total / limit);

    return {
      data: (data || []).map((o: any) => ({
        id: o.id,
        supplyId: o.supply_id,
        demandId: o.demand_id,
        buyerId: o.buyer_id,
        farmerId: o.farmer_id,
        finalPrice: Number(o.final_price),
        quantity: Number(o.quantity),
        totalAmount: Number(o.final_price) * Number(o.quantity),
        commission: Number(o.commission),
        status: o.status,
        createdAt: o.created_at,
        updatedAt: o.updated_at,
        buyer: o.buyer,
        farmer: o.farmer,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  // ─── 8. Override Order Status ───────────────────────────────────────────────

  async updateOrderStatus(orderId: string, dto: UpdateOrderStatusDto) {
    const client = this.supabaseService.getAdminClient();

    const { data: order, error: orderErr } = await client
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
      throw new NotFoundException(`Order with ID "${orderId}" not found`);
    }

    const previousStatus = order.status;
    const newStatus = dto.status;

    // 1. Update order status
    const { data: updated, error: updateErr } = await client
      .from('orders')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .select('*')
      .single();

    if (updateErr) {
      this.logger.error(
        `Failed to override order status for ${orderId}`,
        updateErr,
      );
      throw new InternalServerErrorException('Failed to update order status');
    }

    // 2. Financial side-effects if status overridden to delivered or cancelled
    if (newStatus === 'delivered' && previousStatus !== 'delivered') {
      try {
        await this.walletService.releaseEscrow(orderId);
      } catch (e: any) {
        this.logger.warn(
          `Could not auto-release escrow for order ${orderId}: ${e.message}`,
        );
      }
    } else if (newStatus === 'cancelled' && previousStatus !== 'cancelled') {
      try {
        await this.walletService.refundEscrow(orderId);
      } catch (e: any) {
        this.logger.warn(
          `Could not auto-refund escrow for order ${orderId}: ${e.message}`,
        );
      }
    }

    // 3. Notify participants
    const notifMsg = `Order #${orderId.slice(0, 8)} status was updated to "${newStatus}" by administrator.`;
    await Promise.all([
      this.notificationsService.sendNotification(
        order.buyer_id,
        'Order Status Overridden',
        notifMsg,
        'order',
        { orderId, status: newStatus },
      ),
      this.notificationsService.sendNotification(
        order.farmer_id,
        'Order Status Overridden',
        notifMsg,
        'order',
        { orderId, status: newStatus },
      ),
    ]);

    return {
      success: true,
      message: `Order status overridden to "${newStatus}" successfully`,
      order: updated,
    };
  }

  // ─── 9. All Active Escrow Locks ─────────────────────────────────────────────

  async getActiveEscrowLocks() {
    const client = this.supabaseService.getAdminClient();

    const { data, error } = await client
      .from('escrow_locks')
      .select(
        '*, buyer:buyer_id(id, name, phone), orders:order_id(id, final_price, quantity, status, farmer_id)',
      )
      .eq('status', 'locked')
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error('Failed to list escrow locks', error);
      throw new InternalServerErrorException('Failed to retrieve escrow locks');
    }

    return (data || []).map((lock: any) => ({
      id: lock.id,
      orderId: lock.order_id,
      buyerId: lock.buyer_id,
      amount: Number(lock.amount),
      status: lock.status,
      createdAt: lock.created_at,
      buyer: lock.buyer,
      order: lock.orders,
    }));
  }

  // ─── 10. Force Release Escrow ───────────────────────────────────────────────

  async forceReleaseEscrow(orderId: string) {
    this.logger.log(`Admin force releasing escrow for order #${orderId}`);
    return this.walletService.releaseEscrow(orderId);
  }

  // ─── 11. Revenue Analytics (Grouped by Date) ────────────────────────────────

  async getRevenueAnalytics(query?: AnalyticsQueryDto) {
    const client = this.supabaseService.getAdminClient();

    let dbQuery = client
      .from('transactions')
      .select('amount, created_at')
      .eq('type', 'release');

    if (query?.from) {
      dbQuery = dbQuery.gte('created_at', query.from);
    }
    if (query?.to) {
      dbQuery = dbQuery.lte('created_at', query.to);
    }

    dbQuery = dbQuery.order('created_at', { ascending: true });

    const { data, error } = await dbQuery;

    if (error) {
      this.logger.error('Failed to compute revenue analytics', error);
      throw new InternalServerErrorException('Failed to calculate revenue');
    }

    // Group transactions by YYYY-MM-DD
    const dailyMap = new Map<string, { revenue: number; count: number }>();

    let totalRevenue = 0;
    for (const trx of data || []) {
      const dateKey = trx.created_at.slice(0, 10);
      const amt = Number(trx.amount || 0);
      totalRevenue += amt;

      const current = dailyMap.get(dateKey) || { revenue: 0, count: 0 };
      dailyMap.set(dateKey, {
        revenue: current.revenue + amt,
        count: current.count + 1,
      });
    }

    const dailyBreakdown = Array.from(dailyMap.entries()).map(
      ([date, stat]) => ({
        date,
        revenue: Number(stat.revenue.toFixed(2)),
        transactionsCount: stat.count,
      }),
    );

    return {
      from: query?.from || null,
      to: query?.to || null,
      totalRevenue: Number(totalRevenue.toFixed(2)),
      dailyBreakdown,
    };
  }

  // ─── 12. Top Farmers by Order Count ─────────────────────────────────────────

  async getTopFarmers(query?: TopUsersQueryDto) {
    const client = this.supabaseService.getAdminClient();
    const limit = query?.limit && query.limit > 0 ? query.limit : 10;

    const { data: deliveredOrders, error } = await client
      .from('orders')
      .select(
        'farmer_id, final_price, quantity, farmer:farmer_id(id, name, phone, district, rating)',
      )
      .eq('status', 'delivered');

    if (error) {
      this.logger.error('Failed to aggregate top farmers', error);
      throw new InternalServerErrorException('Failed to retrieve top farmers');
    }

    const farmerMap = new Map<
      string,
      { farmer: any; orderCount: number; totalVolume: number }
    >();

    for (const ord of deliveredOrders || []) {
      const fId = ord.farmer_id;
      const volume = Number(ord.final_price) * Number(ord.quantity);

      if (!farmerMap.has(fId)) {
        farmerMap.set(fId, {
          farmer: ord.farmer,
          orderCount: 1,
          totalVolume: volume,
        });
      } else {
        const item = farmerMap.get(fId)!;
        item.orderCount += 1;
        item.totalVolume += volume;
      }
    }

    const topFarmers = Array.from(farmerMap.values())
      .sort((a, b) => b.orderCount - a.orderCount)
      .slice(0, limit)
      .map((item) => ({
        farmerId: item.farmer?.id,
        name: item.farmer?.name,
        phone: item.farmer?.phone,
        district: item.farmer?.district,
        rating: item.farmer?.rating,
        deliveredOrdersCount: item.orderCount,
        totalSalesVolume: Number(item.totalVolume.toFixed(2)),
      }));

    return topFarmers;
  }

  // ─── 13. Top Buyers by Spend ────────────────────────────────────────────────

  async getTopBuyers(query?: TopUsersQueryDto) {
    const client = this.supabaseService.getAdminClient();
    const limit = query?.limit && query.limit > 0 ? query.limit : 10;

    const { data: deliveredOrders, error } = await client
      .from('orders')
      .select(
        'buyer_id, final_price, quantity, buyer:buyer_id(id, name, phone, district)',
      )
      .eq('status', 'delivered');

    if (error) {
      this.logger.error('Failed to aggregate top buyers', error);
      throw new InternalServerErrorException('Failed to retrieve top buyers');
    }

    const buyerMap = new Map<
      string,
      { buyer: any; orderCount: number; totalSpend: number }
    >();

    for (const ord of deliveredOrders || []) {
      const bId = ord.buyer_id;
      const spend = Number(ord.final_price) * Number(ord.quantity);

      if (!buyerMap.has(bId)) {
        buyerMap.set(bId, {
          buyer: ord.buyer,
          orderCount: 1,
          totalSpend: spend,
        });
      } else {
        const item = buyerMap.get(bId)!;
        item.orderCount += 1;
        item.totalSpend += spend;
      }
    }

    const topBuyers = Array.from(buyerMap.values())
      .sort((a, b) => b.totalSpend - a.totalSpend)
      .slice(0, limit)
      .map((item) => ({
        buyerId: item.buyer?.id,
        name: item.buyer?.name,
        phone: item.buyer?.phone,
        district: item.buyer?.district,
        ordersCount: item.orderCount,
        totalSpend: Number(item.totalSpend.toFixed(2)),
      }));

    return topBuyers;
  }

  // ─── 14. Transaction Report (CSV Export) ───────────────────────────────────

  async getTransactionReportCsv(): Promise<string> {
    const client = this.supabaseService.getAdminClient();

    const { data, error } = await client
      .from('transactions')
      .select('*, user:user_id(id, name, phone, role)')
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error('Failed to generate transaction report', error);
      throw new InternalServerErrorException(
        'Failed to export transactions CSV',
      );
    }

    const columns: CsvColumn[] = [
      { header: 'Transaction ID', key: 'id' },
      { header: 'User ID', key: 'user_id' },
      { header: 'User Name', key: 'user', format: (u) => u?.name || '' },
      { header: 'User Phone', key: 'user', format: (u) => u?.phone || '' },
      { header: 'User Role', key: 'user', format: (u) => u?.role || '' },
      { header: 'Order ID', key: 'order_id', format: (v) => v || 'N/A' },
      { header: 'Type', key: 'type' },
      { header: 'Amount (BDT)', key: 'amount' },
      { header: 'Note', key: 'note', format: (v) => v || '' },
      { header: 'Timestamp', key: 'created_at' },
    ];

    return generateCsv(data || [], columns);
  }
}
