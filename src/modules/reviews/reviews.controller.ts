import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto, QueryReviewDto } from './dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Reviews')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  private extractUser(user: any): { userId: string; role?: string } {
    const userId = user?.supabaseId || user?.sub || user?.id;
    if (!userId) {
      throw new UnauthorizedException('User identifier not found in token');
    }
    return { userId, role: user?.role };
  }

  // ─── 1. POST / (Submit a review) ───────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a review for a delivered order' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Review submitted successfully and reviewee rating updated.',
    schema: {
      example: {
        success: true,
        data: {
          id: 'rev-uuid',
          reviewerId: 'buyer-uuid',
          revieweeId: 'farmer-uuid',
          orderId: 'order-uuid',
          rating: 4.8,
          comment: 'Fresh produce, prompt delivery. Highly recommended!',
          createdAt: '2026-11-20T10:00:00.000Z',
          reviewer: {
            id: 'buyer-uuid',
            name: 'Rafiq Ahmed',
          },
        },
      },
    },
  })
  async create(@CurrentUser() user: any, @Body() dto: CreateReviewDto) {
    const { userId } = this.extractUser(user);
    const review = await this.reviewsService.create(userId, dto);
    return {
      success: true,
      data: review,
    };
  }

  // ─── 2. GET /user/:userId (Get reviews for a user) ──────────────────────────

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get paginated reviews received by a user' })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Paginated user reviews and aggregated score.',
    schema: {
      example: {
        success: true,
        user: {
          id: 'user-uuid',
          name: 'Farmer Abdul',
          role: 'farmer',
          rating: 4.75,
          ratingCount: 12,
        },
        data: [
          {
            id: 'rev-uuid',
            rating: 5,
            comment: 'Great quality crops!',
            createdAt: '2026-11-20T10:00:00.000Z',
            reviewer: { id: 'buyer-uuid', name: 'Rafiq' },
          },
        ],
        meta: {
          page: 1,
          limit: 10,
          total: 12,
          totalPages: 2,
        },
      },
    },
  })
  async findByUser(
    @Param('userId') userId: string,
    @Query() query: QueryReviewDto,
  ) {
    const result = await this.reviewsService.findByUser(userId, query);
    return {
      success: true,
      user: result.user,
      data: result.data,
      meta: result.meta,
    };
  }

  // ─── 3. GET /order/:orderId (Reviews for an order) ──────────────────────────

  @Get('order/:orderId')
  @ApiOperation({ summary: 'Get all reviews linked to a specific order' })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Reviews submitted for this order.',
  })
  async findByOrder(@Param('orderId') orderId: string) {
    const reviews = await this.reviewsService.findByOrder(orderId);
    return {
      success: true,
      data: reviews,
    };
  }
}
