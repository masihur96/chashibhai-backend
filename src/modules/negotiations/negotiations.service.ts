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
import { NegotiationsGateway } from './negotiations.gateway';
import { CreateNegotiationDto } from './dto/create-negotiation.dto';
import { CreateOfferDto } from './dto/create-offer.dto';

export interface FormattedNegotiation {
  id: string;
  productId: string | null;
  demandId: string | null;
  buyerId: string;
  farmerId: string;
  status: string;
  createdAt: string;
  latestOffer?: {
    id: string;
    amount: number;
    senderId: string;
    note?: string | null;
    createdAt: string;
  } | null;
  offers?: Array<{
    id: string;
    negotiationId: string;
    senderId: string;
    amount: number;
    note?: string | null;
    createdAt: string;
  }>;
  product?: any;
  buyer?: any;
  farmer?: any;
}

@Injectable()
export class NegotiationsService {
  private readonly logger = new Logger(NegotiationsService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly ordersService: OrdersService,
    private readonly negotiationsGateway: NegotiationsGateway,
  ) {}

  /**
   * Helper to format a negotiation record
   */
  private formatNegotiation(raw: any): FormattedNegotiation {
    const rawOffers = Array.isArray(raw.negotiation_offers)
      ? [...raw.negotiation_offers].sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        )
      : [];

    const latest =
      rawOffers.length > 0 ? rawOffers[rawOffers.length - 1] : null;

    return {
      id: raw.id,
      productId: raw.product_id ?? null,
      demandId: raw.demand_id ?? null,
      buyerId: raw.buyer_id,
      farmerId: raw.farmer_id,
      status: raw.status ?? 'pending',
      createdAt: raw.created_at,
      latestOffer: latest
        ? {
            id: latest.id,
            amount: Number(latest.amount),
            senderId: latest.sender_id,
            note: latest.note ?? null,
            createdAt: latest.created_at,
          }
        : null,
      offers: rawOffers.map((o) => ({
        id: o.id,
        negotiationId: o.negotiation_id,
        senderId: o.sender_id,
        amount: Number(o.amount),
        note: o.note ?? null,
        createdAt: o.created_at,
      })),
      product: raw.products
        ? {
            id: raw.products.id,
            productName: raw.products.product_name,
            category: raw.products.category,
            minimumPrice: Number(raw.products.minimum_price),
            tradeType: raw.products.trade_type,
            imageUrl: raw.products.image_url ?? null,
            status: raw.products.status,
          }
        : undefined,
      buyer: raw.buyer
        ? {
            id: raw.buyer.id,
            name: raw.buyer.name,
            phone: raw.buyer.phone ?? null,
            avatarUrl: raw.buyer.avatar_url ?? null,
          }
        : undefined,
      farmer: raw.farmer
        ? {
            id: raw.farmer.id,
            name: raw.farmer.name,
            phone: raw.farmer.phone ?? null,
            avatarUrl: raw.farmer.avatar_url ?? null,
          }
        : undefined,
    };
  }

  // ─── 1. Initiate Negotiation ─────────────────────────────────────────────────

  async initiate(
    userId: string,
    userRole: string,
    dto: CreateNegotiationDto,
  ): Promise<FormattedNegotiation> {
    const client = this.supabaseService.getAdminClient();
    const productId = dto.productId ?? dto.product_id;
    const demandId = dto.demandId ?? dto.demand_id;

    if (!productId && !demandId) {
      throw new BadRequestException(
        'Either productId (for buyer) or demandId (for farmer) must be provided',
      );
    }
    if (productId && demandId) {
      throw new BadRequestException(
        'Provide either productId or demandId, not both',
      );
    }

    let buyerId: string;
    let farmerId: string;

    if (productId) {
      // Buyer on product
      const { data: product, error: prodError } = await client
        .from('products')
        .select('*')
        .eq('id', productId)
        .single();

      if (prodError || !product) {
        throw new NotFoundException(`Product with ID "${productId}" not found`);
      }

      if (
        product.trade_type !== 'negotiation' &&
        product.trade_type !== 'both'
      ) {
        throw new BadRequestException(
          `Product trade type is "${product.trade_type}". It does not accept price negotiations.`,
        );
      }

      if (product.status !== 'active') {
        throw new BadRequestException(
          `Cannot negotiate on inactive product (status: ${product.status})`,
        );
      }

      if (product.farmer_id === userId) {
        throw new ForbiddenException(
          'Farmers cannot initiate negotiations on their own products',
        );
      }

      buyerId = userId;
      farmerId = product.farmer_id;
    } else {
      // Farmer on demand post
      const { data: demand } = await client
        .from('demand_posts')
        .select('*')
        .eq('id', demandId!)
        .maybeSingle();

      if (demand) {
        if (demand.buyer_id === userId) {
          throw new ForbiddenException(
            'Buyers cannot negotiate on their own demand posts',
          );
        }
        buyerId = demand.buyer_id;
        farmerId = userId;
      } else {
        const explicitBuyerId = dto.buyerId ?? dto.buyer_id;
        if (!explicitBuyerId) {
          throw new NotFoundException(
            `Demand post "${demandId}" not found, and no explicit buyerId was provided`,
          );
        }
        buyerId = explicitBuyerId;
        farmerId = userId;
      }
    }

    // Check for existing open negotiation
    const { data: existing } = await client
      .from('negotiations')
      .select('*, negotiation_offers(*)')
      .eq('buyer_id', buyerId)
      .eq('farmer_id', farmerId)
      .in('status', ['pending', 'countered'])
      .match(productId ? { product_id: productId } : { demand_id: demandId })
      .maybeSingle();

    if (existing) {
      return this.formatNegotiation(existing);
    }

    // Create negotiation
    const { data: negotiation, error: negError } = await client
      .from('negotiations')
      .insert({
        product_id: productId ?? null,
        demand_id: demandId ?? null,
        buyer_id: buyerId,
        farmer_id: farmerId,
        status: 'pending',
      })
      .select()
      .single();

    if (negError || !negotiation) {
      this.logger.error('Failed to create negotiation in Supabase', negError);
      throw new InternalServerErrorException(
        negError?.message ?? 'Failed to initiate negotiation',
      );
    }

    // Create initial offer if amount is provided
    const initialAmount = dto.amount ?? dto.initialAmount ?? dto.initial_amount;
    let initialOfferData: any[] | null = null;

    if (initialAmount && initialAmount > 0) {
      const { data: offer, error: offerError } = await client
        .from('negotiation_offers')
        .insert({
          negotiation_id: negotiation.id,
          sender_id: userId,
          amount: initialAmount,
          note: dto.note ?? null,
        })
        .select()
        .single();

      if (!offerError && offer) {
        initialOfferData = [offer];

        const recipientId = userId === buyerId ? farmerId : buyerId;
        this.negotiationsGateway.emitOfferReceived({
          negotiationId: negotiation.id,
          offerId: offer.id,
          senderId: userId,
          recipientId,
          amount: Number(offer.amount),
          note: offer.note,
          timestamp: offer.created_at,
        });
      }
    }

    return this.formatNegotiation({
      ...negotiation,
      negotiation_offers: initialOfferData || [],
    });
  }

  // ─── 2. List Own Negotiations (Buyer or Farmer) ──────────────────────────────

  async findMyNegotiations(userId: string): Promise<FormattedNegotiation[]> {
    const client = this.supabaseService.getAdminClient();

    const { data, error } = await client
      .from('negotiations')
      .select(
        '*, products(*), negotiation_offers(*), buyer:buyer_id(id, name, phone, avatar_url), farmer:farmer_id(id, name, phone, avatar_url)',
      )
      .or(`buyer_id.eq.${userId},farmer_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error(`Failed to list negotiations for ${userId}`, error);
      throw new InternalServerErrorException(
        'Failed to retrieve your negotiations',
      );
    }

    return (data || []).map((row) => this.formatNegotiation(row));
  }

  // ─── 3. Get Negotiation Details + Offers (Participant Only) ──────────────────

  async findOne(
    negotiationId: string,
    userId: string,
    userRole?: string,
  ): Promise<FormattedNegotiation> {
    const client = this.supabaseService.getAdminClient();

    const { data, error } = await client
      .from('negotiations')
      .select(
        '*, products(*), negotiation_offers(*), buyer:buyer_id(id, name, phone, avatar_url, rating), farmer:farmer_id(id, name, phone, avatar_url, rating)',
      )
      .eq('id', negotiationId)
      .single();

    if (error || !data) {
      throw new NotFoundException(
        `Negotiation with ID "${negotiationId}" not found`,
      );
    }

    const isParticipant =
      data.buyer_id === userId ||
      data.farmer_id === userId ||
      userRole?.toUpperCase() === 'ADMIN';

    if (!isParticipant) {
      throw new ForbiddenException(
        'Access denied: You are not a participant in this negotiation',
      );
    }

    return this.formatNegotiation(data);
  }

  // ─── 4. Submit Counter-Offer (Participant Only) ──────────────────────────────

  async createOffer(
    negotiationId: string,
    senderId: string,
    dto: CreateOfferDto,
    userRole?: string,
  ) {
    const client = this.supabaseService.getAdminClient();

    const { data: negotiation, error: negError } = await client
      .from('negotiations')
      .select('*')
      .eq('id', negotiationId)
      .single();

    if (negError || !negotiation) {
      throw new NotFoundException(
        `Negotiation with ID "${negotiationId}" not found`,
      );
    }

    const isParticipant =
      negotiation.buyer_id === senderId ||
      negotiation.farmer_id === senderId ||
      userRole?.toUpperCase() === 'ADMIN';

    if (!isParticipant) {
      throw new ForbiddenException(
        'Access denied: You are not a participant in this negotiation',
      );
    }

    if (
      negotiation.status === 'accepted' ||
      negotiation.status === 'rejected'
    ) {
      throw new BadRequestException(
        `Cannot submit an offer on a ${negotiation.status} negotiation`,
      );
    }

    const recipientId =
      negotiation.buyer_id === senderId
        ? negotiation.farmer_id
        : negotiation.buyer_id;

    // 1. Create offer
    const { data: offer, error: offerError } = await client
      .from('negotiation_offers')
      .insert({
        negotiation_id: negotiationId,
        sender_id: senderId,
        amount: dto.amount,
        note: dto.note ?? null,
      })
      .select()
      .single();

    if (offerError || !offer) {
      this.logger.error('Failed to create offer in Supabase', offerError);
      throw new InternalServerErrorException(
        offerError?.message ?? 'Failed to submit counter-offer',
      );
    }

    // 2. Update negotiation status to 'countered'
    await client
      .from('negotiations')
      .update({ status: 'countered' })
      .eq('id', negotiationId);

    // 3. Emit real-time event to the other participant
    this.negotiationsGateway.emitOfferReceived({
      negotiationId,
      offerId: offer.id,
      senderId,
      recipientId,
      amount: Number(offer.amount),
      note: offer.note,
      timestamp: offer.created_at,
    });

    return {
      success: true,
      data: {
        id: offer.id,
        negotiationId: offer.negotiation_id,
        senderId: offer.sender_id,
        recipientId,
        amount: Number(offer.amount),
        note: offer.note ?? null,
        status: 'countered',
        createdAt: offer.created_at,
      },
    };
  }

  // ─── 5. Accept Negotiation → Create Order ───────────────────────────────────

  async acceptNegotiation(
    negotiationId: string,
    userId: string,
    userRole?: string,
  ) {
    const client = this.supabaseService.getAdminClient();

    const { data: negotiation, error: negError } = await client
      .from('negotiations')
      .select('*, negotiation_offers(*)')
      .eq('id', negotiationId)
      .single();

    if (negError || !negotiation) {
      throw new NotFoundException(
        `Negotiation with ID "${negotiationId}" not found`,
      );
    }

    const isParticipant =
      negotiation.buyer_id === userId ||
      negotiation.farmer_id === userId ||
      userRole?.toUpperCase() === 'ADMIN';

    if (!isParticipant) {
      throw new ForbiddenException(
        'Access denied: You are not a participant in this negotiation',
      );
    }

    if (negotiation.status === 'accepted') {
      throw new BadRequestException('Negotiation is already accepted');
    }
    if (negotiation.status === 'rejected') {
      throw new BadRequestException('Cannot accept a rejected negotiation');
    }

    // Get latest offer
    const offers = Array.isArray(negotiation.negotiation_offers)
      ? [...negotiation.negotiation_offers].sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
      : [];

    if (offers.length === 0) {
      throw new BadRequestException(
        'Cannot accept negotiation: No offers have been submitted yet',
      );
    }

    const latestOffer = offers[0];
    const finalAmount = Number(latestOffer.amount);

    // 1. Update negotiation status to 'accepted'
    const { error: updateError } = await client
      .from('negotiations')
      .update({ status: 'accepted' })
      .eq('id', negotiationId);

    if (updateError) {
      throw new InternalServerErrorException('Failed to accept negotiation');
    }

    // 2. Automatically call OrdersService.create() with the final agreed amount
    const order = await this.ordersService.create({
      buyerId: negotiation.buyer_id,
      farmerId: negotiation.farmer_id,
      productId: negotiation.product_id,
      demandId: negotiation.demand_id,
      negotiationId: negotiation.id,
      totalAmount: finalAmount,
      status: 'confirmed',
    });

    // 3. Emit real-time event
    this.negotiationsGateway.emitNegotiationAccepted({
      negotiationId,
      acceptedBy: userId,
      orderId: order.id,
      finalAmount,
    });

    return {
      success: true,
      message: 'Negotiation accepted successfully. Order created.',
      data: {
        negotiationId,
        status: 'accepted',
        finalAmount,
        order,
      },
    };
  }

  // ─── 6. Reject Negotiation ──────────────────────────────────────────────────

  async rejectNegotiation(
    negotiationId: string,
    userId: string,
    userRole?: string,
  ) {
    const client = this.supabaseService.getAdminClient();

    const { data: negotiation, error: negError } = await client
      .from('negotiations')
      .select('*')
      .eq('id', negotiationId)
      .single();

    if (negError || !negotiation) {
      throw new NotFoundException(
        `Negotiation with ID "${negotiationId}" not found`,
      );
    }

    const isParticipant =
      negotiation.buyer_id === userId ||
      negotiation.farmer_id === userId ||
      userRole?.toUpperCase() === 'ADMIN';

    if (!isParticipant) {
      throw new ForbiddenException(
        'Access denied: You are not a participant in this negotiation',
      );
    }

    if (negotiation.status === 'accepted') {
      throw new BadRequestException(
        'Cannot reject an already accepted negotiation',
      );
    }

    const { error: updateError } = await client
      .from('negotiations')
      .update({ status: 'rejected' })
      .eq('id', negotiationId);

    if (updateError) {
      throw new InternalServerErrorException('Failed to reject negotiation');
    }

    this.negotiationsGateway.emitNegotiationRejected({
      negotiationId,
      rejectedBy: userId,
    });

    return {
      success: true,
      message: 'Negotiation rejected successfully',
      data: {
        negotiationId,
        status: 'rejected',
      },
    };
  }
}
