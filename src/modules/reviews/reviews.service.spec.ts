import { Test, TestingModule } from '@nestjs/testing';
import { ReviewsService } from './reviews.service';
import { SupabaseService } from '../supabase/supabase.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { CreateReviewDto } from './dto';

describe('ReviewsService', () => {
  let service: ReviewsService;
  let clientMock: any;
  let supabaseMock: any;
  let prismaMock: any;
  let notificationsServiceMock: any;

  beforeEach(async () => {
    clientMock = {
      from: jest.fn(),
      rpc: jest.fn(),
    };

    supabaseMock = {
      getAdminClient: jest.fn().mockReturnValue(clientMock),
    };

    prismaMock = {};

    notificationsServiceMock = {
      sendNotification: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        {
          provide: SupabaseService,
          useValue: supabaseMock,
        },
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: NotificationsService,
          useValue: notificationsServiceMock,
        },
      ],
    }).compile();

    service = module.get<ReviewsService>(ReviewsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── 1. create ──────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should throw BadRequestException if reviewer tries to review self', async () => {
      const dto: CreateReviewDto = {
        revieweeId: 'user-1',
        orderId: 'ord-1',
        rating: 5,
      };

      await expect(service.create('user-1', dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if order does not exist', async () => {
      const dto: CreateReviewDto = {
        revieweeId: 'user-2',
        orderId: 'ord-missing',
        rating: 5,
      };

      clientMock.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
      });

      await expect(service.create('user-1', dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if order is not delivered', async () => {
      const dto: CreateReviewDto = {
        revieweeId: 'user-2',
        orderId: 'ord-pending',
        rating: 5,
      };

      const mockOrder = {
        id: 'ord-pending',
        buyer_id: 'user-1',
        farmer_id: 'user-2',
        status: 'pending',
      };

      clientMock.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockOrder, error: null }),
      });

      await expect(service.create('user-1', dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ForbiddenException if reviewer was not an order participant', async () => {
      const dto: CreateReviewDto = {
        revieweeId: 'user-2',
        orderId: 'ord-delivered',
        rating: 5,
      };

      const mockOrder = {
        id: 'ord-delivered',
        buyer_id: 'buyer-x',
        farmer_id: 'user-2',
        status: 'delivered',
      };

      clientMock.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockOrder, error: null }),
      });

      await expect(service.create('user-1', dto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw BadRequestException if reviewee is not the other participant', async () => {
      const dto: CreateReviewDto = {
        revieweeId: 'stranger-id',
        orderId: 'ord-delivered',
        rating: 5,
      };

      const mockOrder = {
        id: 'ord-delivered',
        buyer_id: 'user-1',
        farmer_id: 'user-2',
        status: 'delivered',
      };

      clientMock.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockOrder, error: null }),
      });

      await expect(service.create('user-1', dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if review already exists for this order', async () => {
      const dto: CreateReviewDto = {
        revieweeId: 'user-2',
        orderId: 'ord-delivered',
        rating: 5,
      };

      const mockOrder = {
        id: 'ord-delivered',
        buyer_id: 'user-1',
        farmer_id: 'user-2',
        status: 'delivered',
      };

      clientMock.from.mockImplementation((table: string) => {
        if (table === 'orders') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockOrder, error: null }),
          };
        }
        if (table === 'reviews') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'rev-existing' },
              error: null,
            }),
          };
        }
        return {};
      });

      await expect(service.create('user-1', dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should submit review, execute RPC rating recalculation, and notify reviewee', async () => {
      const dto: CreateReviewDto = {
        revieweeId: 'user-2',
        orderId: 'ord-delivered',
        rating: 4.5,
        comment: 'Excellent service!',
      };

      const mockOrder = {
        id: 'ord-delivered',
        buyer_id: 'user-1',
        farmer_id: 'user-2',
        status: 'delivered',
      };

      const mockInsertedReview = {
        id: 'rev-100',
        reviewer_id: 'user-1',
        reviewee_id: 'user-2',
        order_id: 'ord-delivered',
        rating: 4.5,
        comment: 'Excellent service!',
        created_at: new Date().toISOString(),
        reviewer: { id: 'user-1', name: 'Buyer 1' },
      };

      clientMock.from.mockImplementation((table: string) => {
        if (table === 'orders') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockOrder, error: null }),
          };
        }
        if (table === 'reviews') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            insert: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockInsertedReview, error: null }),
          };
        }
        return {};
      });

      clientMock.rpc.mockResolvedValue({
        data: [{ new_rating: 4.5, new_rating_count: 1 }],
        error: null,
      });

      const result = await service.create('user-1', dto);

      expect(result.id).toBe('rev-100');
      expect(result.rating).toBe(4.5);
      expect(clientMock.rpc).toHaveBeenCalledWith('update_user_rating', {
        p_user_id: 'user-2',
        p_rating: 4.5,
      });
      expect(notificationsServiceMock.sendNotification).toHaveBeenCalledWith(
        'user-2',
        'New Review Received! ⭐',
        expect.stringContaining('Buyer 1 left you a 4.5-star review'),
        expect.objectContaining({ orderId: 'ord-delivered', rating: 4.5 }),
      );
    });

    it('should fallback to direct profile update if RPC fails', async () => {
      const dto: CreateReviewDto = {
        revieweeId: 'user-2',
        orderId: 'ord-delivered',
        rating: 5,
      };

      const mockOrder = {
        id: 'ord-delivered',
        buyer_id: 'user-1',
        farmer_id: 'user-2',
        status: 'delivered',
      };

      const mockInsertedReview = {
        id: 'rev-200',
        reviewer_id: 'user-1',
        reviewee_id: 'user-2',
        order_id: 'ord-delivered',
        rating: 5,
        created_at: new Date().toISOString(),
      };

      clientMock.rpc.mockRejectedValue(new Error('RPC function missing'));

      clientMock.from.mockImplementation((table: string) => {
        if (table === 'orders') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockOrder, error: null }),
          };
        }
        if (table === 'reviews') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            insert: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockInsertedReview, error: null }),
          };
        }
        if (table === 'profiles') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { rating: 4.0, rating_count: 1 },
              error: null,
            }),
            update: jest.fn().mockReturnThis(),
          };
        }
        return {};
      });

      const result = await service.create('user-1', dto);

      expect(result.id).toBe('rev-200');
    });
  });

  // ─── 2. findByUser ──────────────────────────────────────────────────────────

  describe('findByUser', () => {
    it('should throw NotFoundException if profile not found', async () => {
      clientMock.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
      });

      await expect(service.findByUser('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return paginated user reviews and profile score', async () => {
      const mockProfile = {
        id: 'user-2',
        name: 'Farmer Ahmed',
        role: 'farmer',
        rating: 4.8,
        rating_count: 5,
      };

      const mockReviews = [
        {
          id: 'rev-1',
          reviewer_id: 'user-1',
          reviewee_id: 'user-2',
          rating: 5,
          comment: 'Great quality',
          created_at: '2026-11-20T10:00:00Z',
        },
      ];

      clientMock.from.mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockProfile, error: null }),
          };
        }
        if (table === 'reviews') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            range: jest.fn().mockResolvedValue({
              data: mockReviews,
              count: 1,
              error: null,
            }),
          };
        }
        return {};
      });

      const result = await service.findByUser('user-2', { page: 1, limit: 10 });

      expect(result.user.name).toBe('Farmer Ahmed');
      expect(result.user.rating).toBe(4.8);
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  // ─── 3. findByOrder ─────────────────────────────────────────────────────────

  describe('findByOrder', () => {
    it('should throw NotFoundException if order does not exist', async () => {
      clientMock.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
      });

      await expect(service.findByOrder('missing-order')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return reviews for an order', async () => {
      const mockOrder = { id: 'ord-1', status: 'delivered' };
      const mockReviews = [
        {
          id: 'rev-1',
          order_id: 'ord-1',
          rating: 5,
        },
      ];

      clientMock.from.mockImplementation((table: string) => {
        if (table === 'orders') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockOrder, error: null }),
          };
        }
        if (table === 'reviews') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockResolvedValue({ data: mockReviews, error: null }),
          };
        }
        return {};
      });

      const result = await service.findByOrder('ord-1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('rev-1');
    });
  });
});
