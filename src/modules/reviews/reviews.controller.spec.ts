import { Test, TestingModule } from '@nestjs/testing';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { UnauthorizedException } from '@nestjs/common';
import { CreateReviewDto, QueryReviewDto } from './dto';

describe('ReviewsController', () => {
  let controller: ReviewsController;
  let reviewsService: Partial<Record<keyof ReviewsService, jest.Mock>>;

  beforeEach(async () => {
    reviewsService = {
      create: jest.fn(),
      findByUser: jest.fn(),
      findByOrder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReviewsController],
      providers: [
        {
          provide: ReviewsService,
          useValue: reviewsService,
        },
      ],
    }).compile();

    controller = module.get<ReviewsController>(ReviewsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST / (create)', () => {
    it('should submit a review and return success', async () => {
      const dto: CreateReviewDto = {
        revieweeId: 'user-2',
        orderId: 'ord-123',
        rating: 4.5,
        comment: 'Great produce!',
      };

      const mockReview = {
        id: 'rev-1',
        reviewerId: 'user-1',
        revieweeId: 'user-2',
        orderId: 'ord-123',
        rating: 4.5,
        comment: 'Great produce!',
        createdAt: '2026-11-20T10:00:00Z',
      };

      (reviewsService.create as jest.Mock).mockResolvedValue(mockReview);

      const result = await controller.create({ sub: 'user-1' }, dto);

      expect(result).toEqual({ success: true, data: mockReview });
      expect(reviewsService.create).toHaveBeenCalledWith('user-1', dto);
    });

    it('should throw UnauthorizedException if token has no userId', async () => {
      await expect(
        controller.create({}, {} as CreateReviewDto),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('GET /user/:userId (findByUser)', () => {
    it('should return user reviews and stats', async () => {
      const query: QueryReviewDto = { page: 1, limit: 10 };
      const mockResult = {
        user: { id: 'user-2', name: 'Farmer', rating: 4.8, ratingCount: 5 },
        data: [{ id: 'rev-1', rating: 5, comment: 'Nice' }],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      };

      (reviewsService.findByUser as jest.Mock).mockResolvedValue(mockResult);

      const result = await controller.findByUser('user-2', query);

      expect(result).toEqual({
        success: true,
        user: mockResult.user,
        data: mockResult.data,
        meta: mockResult.meta,
      });
      expect(reviewsService.findByUser).toHaveBeenCalledWith('user-2', query);
    });
  });

  describe('GET /order/:orderId (findByOrder)', () => {
    it('should return reviews for an order', async () => {
      const mockReviews = [{ id: 'rev-1', reviewerId: 'buyer-1', rating: 5 }];

      (reviewsService.findByOrder as jest.Mock).mockResolvedValue(mockReviews);

      const result = await controller.findByOrder('ord-123');

      expect(result).toEqual({ success: true, data: mockReviews });
      expect(reviewsService.findByOrder).toHaveBeenCalledWith('ord-123');
    });
  });
});
