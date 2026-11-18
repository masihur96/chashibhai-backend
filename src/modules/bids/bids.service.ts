import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { BidsGateway } from './bids.gateway';
import { CreateBidDto } from './dto/create-bid.dto';

export interface FormattedBid {
  id: string;
  productId: string;
  buyerId: string;
  amount: number;
  createdAt: string;
  buyer?: {
    id: string;
    name: string;
    phone?: string | null;
    rating?: number;
    avatarUrl?: string | null;
    district?: string | null;
  };
  product?: {
    id: string;
    productName: string;
    category: string;
    status: string;
    minimumPrice: number;
    endTime: string;
    imageUrl?: string | null;
  };
}

@Injectable()
export class BidsService {
  private readonly logger = new Logger(BidsService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly bidsGateway: BidsGateway,
  ) {}

  /**
   * Helper to format raw database bid row
   */
  private formatBid(raw: any): FormattedBid {
    return {
      id: raw.id,
      productId: raw.product_id,
      buyerId: raw.buyer_id,
      amount: Number(raw.amount),
      createdAt: raw.created_at,
      buyer: raw.profiles
        ? {
            id: raw.profiles.id,
            name: raw.profiles.name,
            phone: raw.profiles.phone ?? null,
            rating: Number(raw.profiles.rating ?? 0),
            avatarUrl: raw.profiles.avatar_url ?? null,
            district: raw.profiles.district ?? null,
          }
        : undefined,
      product: raw.products
        ? {
            id: raw.products.id,
            productName: raw.products.product_name,
            category: raw.products.category,
            status: raw.products.status,
            minimumPrice: Number(raw.products.minimum_price),
            endTime: raw.products.end_time,
            imageUrl: raw.products.image_url ?? null,
          }
        : undefined,
    };
  }

  // ─── 1. Place a Bid ──────────────────────────────────────────────────────────

  async placeBid(buyerId: string, dto: CreateBidDto): Promise<FormattedBid> {
    const client = this.supabaseService.getAdminClient();
    const productId = dto.productId ?? dto.product_id;
    const amount = Number(dto.amount);

    if (!productId) {
      throw new BadRequestException('productId is required');
    }
    if (isNaN(amount) || amount <= 0) {
      throw new BadRequestException('A valid positive bid amount is required');
    }

    // 1. Fetch product details
    const { data: product, error: prodError } = await client
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();

    if (prodError || !product) {
      throw new NotFoundException(`Product with ID "${productId}" not found`);
    }

    // 2. Validate tradeType accepts auction
    if (product.trade_type !== 'auction' && product.trade_type !== 'both') {
      throw new BadRequestException(
        `This product has trade type "${product.trade_type}" and does not accept auction bids`,
      );
    }

    // 3. Validate product status
    if (product.status !== 'active') {
      throw new BadRequestException(
        `Auction is closed. Product listing is currently ${product.status}`,
      );
    }

    // 4. Validate time window (startTime <= now <= endTime)
    const now = new Date();
    const startTime = new Date(product.start_time);
    const endTime = new Date(product.end_time);

    if (now < startTime) {
      throw new BadRequestException(
        `Auction has not started yet. Begins at ${product.start_time}`,
      );
    }
    if (now > endTime) {
      throw new BadRequestException(
        `Auction has already ended at ${product.end_time}`,
      );
    }

    // 5. Prevent farmer from bidding on their own product
    if (product.farmer_id === buyerId) {
      throw new ForbiddenException(
        'Farmers cannot place bids on their own products',
      );
    }

    // 6. Validate amount >= minimum_price
    const minPrice = Number(product.minimum_price);
    if (amount < minPrice) {
      throw new BadRequestException(
        `Bid amount (${amount}) must be at least the starting minimum price (${minPrice})`,
      );
    }

    // 7. Validate amount > current highest bid
    const { data: highestBid } = await client
      .from('bids')
      .select('amount, buyer_id')
      .eq('product_id', productId)
      .order('amount', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (highestBid && amount <= Number(highestBid.amount)) {
      throw new BadRequestException(
        `Bid amount must be strictly greater than current highest bid of ৳${highestBid.amount}`,
      );
    }

    // 8. Persist the bid (upsert on product_id, buyer_id to keep buyer's latest bid)
    const timestamp = new Date().toISOString();
    const { data: savedBid, error: bidError } = await client
      .from('bids')
      .upsert(
        {
          product_id: productId,
          buyer_id: buyerId,
          amount,
          created_at: timestamp,
        },
        { onConflict: 'product_id, buyer_id' },
      )
      .select()
      .single();

    if (bidError || !savedBid) {
      this.logger.error('Failed to save bid in Supabase', bidError);
      throw new InternalServerErrorException(
        bidError?.message ?? 'Failed to place bid',
      );
    }

    // 9. Real-time broadcast via WebSocket
    this.bidsGateway.emitBidPlaced({
      productId,
      buyerId,
      amount,
      timestamp: savedBid.created_at || timestamp,
    });

    return this.formatBid(savedBid);
  }

  // ─── 2. Get All Bids for a Product (Sorted by Amount DESC) ──────────────────

  async getBidsForProduct(productId: string): Promise<FormattedBid[]> {
    const client = this.supabaseService.getAdminClient();

    const { data, error } = await client
      .from('bids')
      .select('*, profiles:buyer_id(id, name, phone, rating, avatar_url, district)')
      .eq('product_id', productId)
      .order('amount', { ascending: false });

    if (error) {
      this.logger.error(`Failed to get bids for product ${productId}`, error);
      throw new InternalServerErrorException('Failed to retrieve bids for this product');
    }

    return (data || []).map((row) => this.formatBid(row));
  }

  // ─── 3. Get Winning Bid (Only after endTime) ────────────────────────────────

  async getWinningBid(productId: string) {
    const client = this.supabaseService.getAdminClient();

    // 1. Fetch product to verify endTime
    const { data: product, error: prodError } = await client
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();

    if (prodError || !product) {
      throw new NotFoundException(`Product with ID "${productId}" not found`);
    }

    const now = new Date();
    const endTime = new Date(product.end_time);

    // Winner can only be resolved after endTime
    if (now < endTime && product.status === 'active') {
      throw new BadRequestException(
        `Auction is still ongoing until ${product.end_time}. Winning bid can only be determined after the auction ends.`,
      );
    }

    // 2. Fetch the top bid
    const { data: topBid, error: bidError } = await client
      .from('bids')
      .select('*, profiles:buyer_id(id, name, phone, rating, avatar_url, district)')
      .eq('product_id', productId)
      .order('amount', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (bidError) {
      this.logger.error(`Error querying winning bid for ${productId}`, bidError);
      throw new InternalServerErrorException('Failed to determine winning bid');
    }

    if (!topBid) {
      return {
        hasWinner: false,
        message: 'No bids were placed on this product listing',
        winningBid: null,
      };
    }

    // 3. Emit auction:ended event
    this.bidsGateway.emitAuctionEnded({
      productId,
      winnerId: topBid.buyer_id,
      winningAmount: Number(topBid.amount),
    });

    return {
      hasWinner: true,
      winningBid: this.formatBid(topBid),
    };
  }

  // ─── 4. Get Buyer's Own Bids ────────────────────────────────────────────────

  async getMyBids(buyerId: string): Promise<FormattedBid[]> {
    const client = this.supabaseService.getAdminClient();

    const { data, error } = await client
      .from('bids')
      .select('*, products:product_id(*)')
      .eq('buyer_id', buyerId)
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error(`Failed to get bids for buyer ${buyerId}`, error);
      throw new InternalServerErrorException('Failed to retrieve your bids');
    }

    return (data || []).map((row) => this.formatBid(row));
  }
}
