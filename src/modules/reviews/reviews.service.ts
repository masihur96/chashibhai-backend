import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateReviewDto, QueryReviewDto } from './dto';

export interface FormattedReview {
  id: string;
  reviewerId: string;
  revieweeId: string;
  orderId: string | null;
  rating: number;
  comment: string | null;
  createdAt: string;
  reviewer?: {
    id: string;
    name: string;
    avatarUrl?: string | null;
    role?: string;
  };
  reviewee?: {
    id: string;
    name: string;
    avatarUrl?: string | null;
    role?: string;
  };
}

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Helper to format raw database review row
   */
  private formatReview(raw: any): FormattedReview {
    return {
      id: raw.id,
      reviewerId: raw.reviewer_id,
      revieweeId: raw.reviewee_id,
      orderId: raw.order_id ?? null,
      rating: Number(raw.rating),
      comment: raw.comment ?? null,
      createdAt: raw.created_at,
      reviewer: raw.reviewer
        ? {
            id: raw.reviewer.id,
            name: raw.reviewer.name,
            avatarUrl: raw.reviewer.avatar_url ?? null,
            role: raw.reviewer.role,
          }
        : undefined,
      reviewee: raw.reviewee
        ? {
            id: raw.reviewee.id,
            name: raw.reviewee.name,
            avatarUrl: raw.reviewee.avatar_url ?? null,
            role: raw.reviewee.role,
          }
        : undefined,
    };
  }

  // ─── 1. Submit a Review ─────────────────────────────────────────────────────

  async create(
    reviewerId: string,
    dto: CreateReviewDto,
  ): Promise<FormattedReview> {
    const client = this.supabaseService.getAdminClient();

    const revieweeId = dto.revieweeId ?? dto.reviewee_id;
    const orderId = dto.orderId ?? dto.order_id;
    const rating = Number(dto.rating);
    const comment = dto.comment?.trim() || null;

    if (!revieweeId || !orderId || isNaN(rating)) {
      throw new BadRequestException('revieweeId, orderId, and rating are required');
    }

    if (rating < 1 || rating > 5) {
      throw new BadRequestException('Rating must be between 1.0 and 5.0');
    }

    if (reviewerId === revieweeId) {
      throw new BadRequestException('You cannot write a review for yourself');
    }

    // 1. Verify order exists and has status = 'delivered'
    const { data: order, error: orderErr } = await client
      .from('orders')
      .select('id, buyer_id, farmer_id, status')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
      throw new NotFoundException(`Order with ID "${orderId}" not found`);
    }

    if (order.status !== 'delivered') {
      throw new BadRequestException(
        `Reviews can only be submitted for delivered orders (Current status: "${order.status}")`,
      );
    }

    // 2. Verify reviewer was a participant in that order
    const isBuyer = order.buyer_id === reviewerId;
    const isFarmer = order.farmer_id === reviewerId;

    if (!isBuyer && !isFarmer) {
      throw new ForbiddenException(
        'Access denied: You are not a participant in this order',
      );
    }

    // 3. Verify reviewee is the counterpart participant in that order
    const expectedRevieweeId = isBuyer ? order.farmer_id : order.buyer_id;
    if (revieweeId !== expectedRevieweeId) {
      throw new BadRequestException(
        'Reviewee must be the other participant of this order',
      );
    }

    // 4. Check for duplicate review (UNIQUE constraint enforcement)
    const { data: existingReview } = await client
      .from('reviews')
      .select('id')
      .eq('reviewer_id', reviewerId)
      .eq('order_id', orderId)
      .maybeSingle();

    if (existingReview) {
      throw new BadRequestException(
        'You have already submitted a review for this order',
      );
    }

    // 5. Insert review
    const { data: insertedReview, error: insertErr } = await client
      .from('reviews')
      .insert({
        reviewer_id: reviewerId,
        reviewee_id: revieweeId,
        order_id: orderId,
        rating,
        comment,
        created_at: new Date().toISOString(),
      })
      .select(
        '*, reviewer:reviewer_id(id, name, avatar_url, role), reviewee:reviewee_id(id, name, avatar_url, role)',
      )
      .single();

    if (insertErr || !insertedReview) {
      this.logger.error('Failed to create review', insertErr);
      throw new InternalServerErrorException('Failed to submit review');
    }

    // 6. Recalculate reviewee's rating atomically (RPC with direct fallback)
    try {
      const { error: rpcError } = await client.rpc('update_user_rating', {
        p_user_id: revieweeId,
        p_rating: rating,
      });

      if (rpcError) {
        throw rpcError;
      }
    } catch (e: any) {
      this.logger.warn(
        `RPC update_user_rating failed, executing query fallback: ${e.message}`,
      );

      const { data: profile } = await client
        .from('profiles')
        .select('rating, rating_count')
        .eq('id', revieweeId)
        .single();

      if (profile) {
        const currentRating = Number(profile.rating ?? 0.0);
        const currentCount = Number(profile.rating_count ?? 0);
        const newCount = currentCount + 1;
        const newRating = Number(
          ((currentRating * currentCount + rating) / newCount).toFixed(2),
        );

        await client
          .from('profiles')
          .update({
            rating: newRating,
            rating_count: newCount,
            updated_at: new Date().toISOString(),
          })
          .eq('id', revieweeId);
      }
    }

    // 7. Send notification to reviewee
    const reviewerName = insertedReview.reviewer?.name || 'A user';
    await this.notificationsService.sendNotification(
      revieweeId,
      'New Review Received! ⭐',
      `${reviewerName} left you a ${rating}-star review for order #${orderId.slice(0, 8)}.`,
      { orderId, rating, reviewId: insertedReview.id },
    );

    return this.formatReview(insertedReview);
  }

  // ─── 2. Get Reviews for a User ──────────────────────────────────────────────

  async findByUser(userId: string, query?: QueryReviewDto) {
    const client = this.supabaseService.getAdminClient();

    // 1. Fetch user profile
    const { data: profile, error: profErr } = await client
      .from('profiles')
      .select('id, name, role, rating, rating_count, avatar_url')
      .eq('id', userId)
      .single();

    if (profErr || !profile) {
      throw new NotFoundException(`User with ID "${userId}" not found`);
    }

    // 2. Fetch paginated reviews
    const page = query?.page && query.page > 0 ? query.page : 1;
    const limit = query?.limit && query.limit > 0 ? query.limit : 10;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, count, error } = await client
      .from('reviews')
      .select(
        '*, reviewer:reviewer_id(id, name, avatar_url, role)',
        { count: 'exact' },
      )
      .eq('reviewee_id', userId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      this.logger.error(`Failed to get reviews for user ${userId}`, error);
      throw new InternalServerErrorException('Failed to retrieve user reviews');
    }

    const total = count ?? (data?.length || 0);
    const totalPages = Math.ceil(total / limit);

    return {
      user: {
        id: profile.id,
        name: profile.name,
        role: profile.role,
        rating: Number(profile.rating ?? 0.0),
        ratingCount: Number(profile.rating_count ?? 0),
        avatarUrl: profile.avatar_url ?? null,
      },
      data: (data || []).map((row) => this.formatReview(row)),
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  // ─── 3. Get Reviews for an Order ───────────────────────────────────────────

  async findByOrder(orderId: string) {
    const client = this.supabaseService.getAdminClient();

    // 1. Verify order exists
    const { data: order, error: orderErr } = await client
      .from('orders')
      .select('id, status')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
      throw new NotFoundException(`Order with ID "${orderId}" not found`);
    }

    // 2. Fetch reviews
    const { data, error } = await client
      .from('reviews')
      .select(
        '*, reviewer:reviewer_id(id, name, avatar_url, role), reviewee:reviewee_id(id, name, avatar_url, role)',
      )
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error(`Failed to fetch reviews for order ${orderId}`, error);
      throw new InternalServerErrorException('Failed to retrieve order reviews');
    }

    return (data || []).map((row) => this.formatReview(row));
  }
}
