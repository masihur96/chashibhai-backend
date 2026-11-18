import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { OrdersService } from '../orders/orders.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateDemandDto, DemandTradeType } from './dto/create-demand.dto';
import { UpdateDemandDto } from './dto/update-demand.dto';
import { QueryDemandDto } from './dto/query-demand.dto';
import { CreateDemandOfferDto } from './dto/create-demand-offer.dto';

export interface FormattedDemand {
  id: string;
  buyerId: string;
  productName: string;
  quantity: number;
  callingPrice: number;
  deliveryLocation: string;
  expiryTime: string;
  status: string;
  tradeType: DemandTradeType;
  imageUrl: string | null;
  createdAt?: string;
  buyer?: any;
  offersCount?: number;
}

export interface FormattedDemandOffer {
  id: string;
  demandId: string;
  farmerId: string;
  offerPrice: number;
  note?: string | null;
  createdAt: string;
  farmer?: any;
}

@Injectable()
export class DemandsService {
  private readonly logger = new Logger(DemandsService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly ordersService: OrdersService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Helper to format raw database demand row
   */
  private formatDemand(raw: any): FormattedDemand {
    return {
      id: raw.id,
      buyerId: raw.buyer_id,
      productName: raw.product_name,
      quantity: Number(raw.quantity),
      callingPrice: Number(raw.calling_price),
      deliveryLocation: raw.delivery_location,
      expiryTime: raw.expiry_time,
      status: raw.status ?? 'active',
      tradeType: raw.trade_type,
      imageUrl: raw.image_url ?? null,
      createdAt: raw.created_at,
      buyer: raw.profiles
        ? {
            id: raw.profiles.id,
            name: raw.profiles.name,
            phone: raw.profiles.phone ?? null,
            avatarUrl: raw.profiles.avatar_url ?? null,
            district: raw.profiles.district ?? null,
          }
        : undefined,
      offersCount: Array.isArray(raw.demand_offers)
        ? raw.demand_offers.length
        : undefined,
    };
  }

  /**
   * Helper to format raw demand offer row
   */
  private formatOffer(raw: any): FormattedDemandOffer {
    return {
      id: raw.id,
      demandId: raw.demand_id,
      farmerId: raw.farmer_id,
      offerPrice: Number(raw.offer_price),
      note: raw.note ?? null,
      createdAt: raw.created_at,
      farmer: raw.profiles
        ? {
            id: raw.profiles.id,
            name: raw.profiles.name,
            phone: raw.profiles.phone ?? null,
            rating: Number(raw.profiles.rating ?? 0),
            avatarUrl: raw.profiles.avatar_url ?? null,
            district: raw.profiles.district ?? null,
          }
        : undefined,
    };
  }

  // ─── 1. Post a Demand (Buyer) ────────────────────────────────────────────────

  async create(
    buyerId: string,
    dto: CreateDemandDto,
    file?: Express.Multer.File,
  ): Promise<FormattedDemand> {
    const client = this.supabaseService.getAdminClient();

    const productName = dto.productName ?? dto.product_name;
    const callingPrice = dto.callingPrice ?? dto.calling_price;
    const deliveryLocation = dto.deliveryLocation ?? dto.delivery_location;
    const expiryTime = dto.expiryTime ?? dto.expiry_time;
    const tradeType = dto.tradeType ?? dto.trade_type;
    let imageUrl = dto.imageUrl ?? dto.image_url ?? null;

    if (!productName || !callingPrice || !deliveryLocation || !expiryTime || !tradeType) {
      throw new BadRequestException('All required demand fields must be provided');
    }

    const expiryDate = new Date(expiryTime);
    if (isNaN(expiryDate.getTime())) {
      throw new BadRequestException('Invalid date format for expiryTime');
    }
    if (expiryDate <= new Date()) {
      throw new BadRequestException('expiryTime must be in the future');
    }

    const payload: any = {
      buyer_id: buyerId,
      product_name: productName.trim(),
      quantity: dto.quantity,
      calling_price: callingPrice,
      delivery_location: deliveryLocation.trim(),
      expiry_time: expiryDate.toISOString(),
      trade_type: tradeType,
      image_url: imageUrl,
      status: 'active',
    };

    const { data: created, error } = await client
      .from('demand_posts')
      .insert(payload)
      .select()
      .single();

    if (error || !created) {
      this.logger.error('Failed to create demand post in Supabase', error);
      throw new InternalServerErrorException(
        error?.message ?? 'Failed to create demand post',
      );
    }

    // If file provided, upload to Supabase storage
    if (file) {
      try {
        const uploadedUrl = await this.supabaseService.uploadDemandImage(
          created.id,
          file,
        );
        await client
          .from('demand_posts')
          .update({ image_url: uploadedUrl })
          .eq('id', created.id);
        created.image_url = uploadedUrl;
      } catch (err: any) {
        this.logger.warn(`Could not upload demand image: ${err.message}`);
      }
    }

    return this.formatDemand(created);
  }

  // ─── 2. Browse All Active Demands (Farmers Marketplace) ──────────────────────

  async findAll(query: QueryDemandDto) {
    const client = this.supabaseService.getAdminClient();

    let dbQuery = client
      .from('demand_posts')
      .select(
        '*, profiles:buyer_id(id, name, phone, avatar_url, district), demand_offers(id)',
        { count: 'exact' },
      );

    if (query.status && query.status !== 'all') {
      dbQuery = dbQuery.eq('status', query.status);
    } else if (!query.status) {
      dbQuery = dbQuery.eq('status', 'active');
    }

    const search = query.search ?? query.productName ?? query.product_name;
    if (search?.trim()) {
      dbQuery = dbQuery.ilike('product_name', `%${search.trim()}%`);
    }

    const minPrice = query.minPrice ?? query.min_price;
    if (minPrice !== undefined && !isNaN(minPrice)) {
      dbQuery = dbQuery.gte('calling_price', minPrice);
    }

    const maxPrice = query.maxPrice ?? query.max_price;
    if (maxPrice !== undefined && !isNaN(maxPrice)) {
      dbQuery = dbQuery.lte('calling_price', maxPrice);
    }

    const tradeType = query.tradeType ?? query.trade_type;
    if (tradeType) {
      dbQuery = dbQuery.eq('trade_type', tradeType);
    }

    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 10;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    dbQuery = dbQuery.order('created_at', { ascending: false }).range(from, to);

    const { data, count, error } = await dbQuery;

    if (error) {
      this.logger.error('Failed to query demands from Supabase', error);
      throw new InternalServerErrorException('Failed to retrieve demands');
    }

    const total = count ?? (data?.length || 0);
    const totalPages = Math.ceil(total / limit);

    return {
      data: (data || []).map((row) => this.formatDemand(row)),
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  // ─── 3. Buyer's Own Demands ──────────────────────────────────────────────────

  async findMyDemands(buyerId: string, query: QueryDemandDto) {
    const client = this.supabaseService.getAdminClient();

    let dbQuery = client
      .from('demand_posts')
      .select('*, demand_offers(id)', { count: 'exact' })
      .eq('buyer_id', buyerId);

    if (query.status && query.status !== 'all') {
      dbQuery = dbQuery.eq('status', query.status);
    }

    const search = query.search ?? query.productName ?? query.product_name;
    if (search?.trim()) {
      dbQuery = dbQuery.ilike('product_name', `%${search.trim()}%`);
    }

    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 10;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    dbQuery = dbQuery.order('created_at', { ascending: false }).range(from, to);

    const { data, count, error } = await dbQuery;

    if (error) {
      this.logger.error(`Failed to get demands for buyer ${buyerId}`, error);
      throw new InternalServerErrorException('Failed to retrieve your demands');
    }

    const total = count ?? (data?.length || 0);
    const totalPages = Math.ceil(total / limit);

    return {
      data: (data || []).map((row) => this.formatDemand(row)),
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  // ─── 4. Get Demand Details by ID ─────────────────────────────────────────────

  async findOne(id: string): Promise<FormattedDemand> {
    const client = this.supabaseService.getAdminClient();

    const { data, error } = await client
      .from('demand_posts')
      .select('*, profiles:buyer_id(id, name, phone, avatar_url, district), demand_offers(*)')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Demand with ID "${id}" not found`);
    }

    return this.formatDemand(data);
  }

  // ─── 5. Update Demand (Owner Buyer Only) ─────────────────────────────────────

  async update(
    id: string,
    userId: string,
    dto: UpdateDemandDto,
    userRole?: string,
  ): Promise<FormattedDemand> {
    const client = this.supabaseService.getAdminClient();

    const { data: existing, error: findError } = await client
      .from('demand_posts')
      .select('*')
      .eq('id', id)
      .single();

    if (findError || !existing) {
      throw new NotFoundException(`Demand with ID "${id}" not found`);
    }

    const isOwner = existing.buyer_id === userId;
    const isAdmin = userRole?.toUpperCase() === 'ADMIN';

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        'You do not have permission to update this demand post',
      );
    }

    const updatePayload: Record<string, any> = {};

    const productName = dto.productName ?? dto.product_name;
    if (productName !== undefined) updatePayload.product_name = productName.trim();

    if (dto.quantity !== undefined) updatePayload.quantity = dto.quantity;

    const callingPrice = dto.callingPrice ?? dto.calling_price;
    if (callingPrice !== undefined) updatePayload.calling_price = callingPrice;

    const deliveryLocation = dto.deliveryLocation ?? dto.delivery_location;
    if (deliveryLocation !== undefined)
      updatePayload.delivery_location = deliveryLocation.trim();

    const expiryTime = dto.expiryTime ?? dto.expiry_time;
    if (expiryTime !== undefined) {
      const expDate = new Date(expiryTime);
      if (isNaN(expDate.getTime())) {
        throw new BadRequestException('Invalid date for expiryTime');
      }
      updatePayload.expiry_time = expDate.toISOString();
    }

    const tradeType = dto.tradeType ?? dto.trade_type;
    if (tradeType !== undefined) updatePayload.trade_type = tradeType;

    if (dto.status !== undefined) updatePayload.status = dto.status;

    const imageUrl = dto.imageUrl ?? dto.image_url;
    if (imageUrl !== undefined) updatePayload.image_url = imageUrl;

    const { data: updated, error: updateError } = await client
      .from('demand_posts')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateError || !updated) {
      this.logger.error(`Failed to update demand ${id}`, updateError);
      throw new InternalServerErrorException('Failed to update demand post');
    }

    return this.formatDemand(updated);
  }

  // ─── 6. Delete Demand (Owner Buyer Only) ─────────────────────────────────────

  async remove(id: string, userId: string, userRole?: string) {
    const client = this.supabaseService.getAdminClient();

    const { data: existing, error: findError } = await client
      .from('demand_posts')
      .select('*')
      .eq('id', id)
      .single();

    if (findError || !existing) {
      throw new NotFoundException(`Demand with ID "${id}" not found`);
    }

    const isOwner = existing.buyer_id === userId;
    const isAdmin = userRole?.toUpperCase() === 'ADMIN';

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        'You do not have permission to delete this demand post',
      );
    }

    const { error: deleteError } = await client
      .from('demand_posts')
      .delete()
      .eq('id', id);

    if (deleteError) {
      this.logger.error(`Failed to delete demand ${id}`, deleteError);
      throw new InternalServerErrorException('Failed to delete demand post');
    }

    return {
      success: true,
      message: 'Demand post deleted successfully',
    };
  }

  // ─── 7. Farmer Makes an Offer on a Demand ───────────────────────────────────

  async createOffer(
    demandId: string,
    farmerId: string,
    dto: CreateDemandOfferDto,
  ): Promise<FormattedDemandOffer> {
    const client = this.supabaseService.getAdminClient();
    const offerPrice = Number(dto.offerPrice ?? dto.offer_price);

    if (isNaN(offerPrice) || offerPrice <= 0) {
      throw new BadRequestException('A valid positive offerPrice is required');
    }

    const { data: demand, error: demError } = await client
      .from('demand_posts')
      .select('*')
      .eq('id', demandId)
      .single();

    if (demError || !demand) {
      throw new NotFoundException(`Demand with ID "${demandId}" not found`);
    }

    if (demand.status !== 'active') {
      throw new BadRequestException(
        `Cannot submit an offer on a ${demand.status} demand post`,
      );
    }

    if (new Date() > new Date(demand.expiry_time)) {
      throw new BadRequestException('This demand post has already expired');
    }

    // Farmer cannot offer on their own demand
    if (demand.buyer_id === farmerId) {
      throw new ForbiddenException(
        'Buyers cannot submit offers on their own demand posts',
      );
    }

    const { data: offer, error: offerError } = await client
      .from('demand_offers')
      .insert({
        demand_id: demandId,
        farmer_id: farmerId,
        offer_price: offerPrice,
        note: dto.note ?? null,
      })
      .select()
      .single();

    if (offerError || !offer) {
      this.logger.error('Failed to create demand offer', offerError);
      throw new InternalServerErrorException('Failed to submit offer on demand');
    }

    // Send notification to buyer
    await this.notificationsService.sendNotification(
      demand.buyer_id,
      'New Demand Offer Received',
      `A farmer offered ৳${offerPrice} on your demand for "${demand.product_name}".`,
      { demandId, offerId: offer.id, offerPrice },
    );

    return this.formatOffer(offer);
  }

  // ─── 8. List Offers on a Demand (Buyer / Owner Only) ─────────────────────────

  async getOffers(
    demandId: string,
    userId: string,
    userRole?: string,
  ): Promise<FormattedDemandOffer[]> {
    const client = this.supabaseService.getAdminClient();

    const { data: demand, error: demError } = await client
      .from('demand_posts')
      .select('*')
      .eq('id', demandId)
      .single();

    if (demError || !demand) {
      throw new NotFoundException(`Demand with ID "${demandId}" not found`);
    }

    const isOwner = demand.buyer_id === userId;
    const isAdmin = userRole?.toUpperCase() === 'ADMIN';

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        'Only the creator of this demand post can view its offers',
      );
    }

    const { data: offers, error: offersError } = await client
      .from('demand_offers')
      .select('*, profiles:farmer_id(id, name, phone, rating, avatar_url, district)')
      .eq('demand_id', demandId)
      .order('offer_price', { ascending: true });

    if (offersError) {
      this.logger.error(`Failed to get offers for demand ${demandId}`, offersError);
      throw new InternalServerErrorException('Failed to retrieve demand offers');
    }

    return (offers || []).map((row) => this.formatOffer(row));
  }

  // ─── 9. Accept Offer → Create Order ─────────────────────────────────────────

  async acceptOffer(
    demandId: string,
    offerId: string,
    userId: string,
    userRole?: string,
  ) {
    const client = this.supabaseService.getAdminClient();

    const { data: demand, error: demError } = await client
      .from('demand_posts')
      .select('*')
      .eq('id', demandId)
      .single();

    if (demError || !demand) {
      throw new NotFoundException(`Demand with ID "${demandId}" not found`);
    }

    const isOwner = demand.buyer_id === userId;
    const isAdmin = userRole?.toUpperCase() === 'ADMIN';

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        'Only the demand creator can accept offers on this demand',
      );
    }

    if (demand.status === 'fulfilled') {
      throw new BadRequestException('This demand post has already been fulfilled');
    }
    if (demand.status === 'expired') {
      throw new BadRequestException('Cannot accept offers on an expired demand');
    }

    const { data: offer, error: offerError } = await client
      .from('demand_offers')
      .select('*')
      .eq('id', offerId)
      .eq('demand_id', demandId)
      .single();

    if (offerError || !offer) {
      throw new NotFoundException(
        `Offer with ID "${offerId}" not found for this demand`,
      );
    }

    // 1. Mark demand as fulfilled
    await client
      .from('demand_posts')
      .update({ status: 'fulfilled' })
      .eq('id', demandId);

    // 2. Create order via OrdersService
    const totalAmount = Number(offer.offer_price) * Number(demand.quantity);
    const order = await this.ordersService.create({
      buyerId: demand.buyer_id,
      farmerId: offer.farmer_id,
      demandId: demand.id,
      totalAmount,
      quantity: Number(demand.quantity),
      status: 'confirmed',
    });

    // 3. Send notification to farmer
    await this.notificationsService.sendNotification(
      offer.farmer_id,
      'Your Demand Offer Was Accepted!',
      `Congratulations! Your offer of ৳${offer.offer_price} for demand "${demand.product_name}" has been accepted. An order (#${order.id}) has been created.`,
      { demandId, offerId, orderId: order.id, totalAmount },
    );

    return {
      success: true,
      message: 'Offer accepted successfully. Demand fulfilled and order created.',
      data: {
        demandId,
        offerId,
        status: 'fulfilled',
        order,
      },
    };
  }

  // ─── 10. Auto-Expire Demands ────────────────────────────────────────────────

  async expireOverdueDemands(): Promise<number> {
    try {
      const now = new Date().toISOString();
      const client = this.supabaseService.getAdminClient();

      const { data, error } = await client
        .from('demand_posts')
        .update({ status: 'expired' })
        .eq('status', 'active')
        .lt('expiry_time', now)
        .select('id');

      if (error) {
        this.logger.error('Failed to auto-expire demands', error);
        return 0;
      }

      const count = data?.length || 0;
      if (count > 0) {
        this.logger.log(`Expired ${count} overdue demands at ${now}`);
      }
      return count;
    } catch (err: any) {
      this.logger.error(`Error in expireOverdueDemands: ${err.message}`);
      return 0;
    }
  }
}
