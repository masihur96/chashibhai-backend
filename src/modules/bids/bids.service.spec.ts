import { Test, TestingModule } from '@nestjs/testing';
import { BidsService } from './bids.service';
import { BidsGateway } from './bids.gateway';
import { SupabaseService } from '../supabase/supabase.service';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';

describe('BidsService', () => {
  let service: BidsService;
  let supabaseMock: any;
  let bidsGatewayMock: any;

  beforeEach(async () => {
    supabaseMock = {
      getAdminClient: jest.fn(),
    };

    bidsGatewayMock = {
      emitBidPlaced: jest.fn(),
      emitAuctionEnded: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BidsService,
        {
          provide: SupabaseService,
          useValue: supabaseMock,
        },
        {
          provide: BidsGateway,
          useValue: bidsGatewayMock,
        },
      ],
    }).compile();

    service = module.get<BidsService>(BidsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('placeBid', () => {
    const validProduct = {
      id: 'prod-1',
      farmer_id: 'farmer-1',
      trade_type: 'auction',
      status: 'active',
      minimum_price: 50.0,
      start_time: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      end_time: new Date(Date.now() + 3600000).toISOString(),   // 1 hour later
    };

    it('should successfully place a higher bid and emit WebSocket event', async () => {
      const fromMock = jest.fn();

      // 1. Product lookup
      fromMock.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: validProduct, error: null }),
      });

      // 2. Highest bid lookup (previous highest bid: 55)
      fromMock.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { amount: 55.0, buyer_id: 'other-buyer' },
          error: null,
        }),
      });

      // 3. Upsert bid (new bid: 60)
      const savedBid = {
        id: 'bid-123',
        product_id: 'prod-1',
        buyer_id: 'buyer-1',
        amount: 60.0,
        created_at: new Date().toISOString(),
      };
      fromMock.mockReturnValueOnce({
        upsert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: savedBid, error: null }),
      });

      supabaseMock.getAdminClient.mockReturnValue({ from: fromMock });

      const result = await service.placeBid('buyer-1', {
        productId: 'prod-1',
        amount: 60.0,
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('bid-123');
      expect(result.amount).toBe(60.0);
      expect(bidsGatewayMock.emitBidPlaced).toHaveBeenCalledWith({
        productId: 'prod-1',
        buyerId: 'buyer-1',
        amount: 60.0,
        timestamp: savedBid.created_at,
      });
    });

    it('should throw NotFoundException if product does not exist', async () => {
      supabaseMock.getAdminClient.mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
        }),
      });

      await expect(
        service.placeBid('buyer-1', { productId: 'invalid-prod', amount: 100 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if product trade_type is negotiation only', async () => {
      supabaseMock.getAdminClient.mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { ...validProduct, trade_type: 'negotiation' },
            error: null,
          }),
        }),
      });

      await expect(
        service.placeBid('buyer-1', { productId: 'prod-1', amount: 100 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if product is not active', async () => {
      supabaseMock.getAdminClient.mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { ...validProduct, status: 'expired' },
            error: null,
          }),
        }),
      });

      await expect(
        service.placeBid('buyer-1', { productId: 'prod-1', amount: 100 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException if farmer attempts to bid on their own product', async () => {
      supabaseMock.getAdminClient.mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { ...validProduct, farmer_id: 'same-user' },
            error: null,
          }),
        }),
      });

      await expect(
        service.placeBid('same-user', { productId: 'prod-1', amount: 100 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if bid is below starting minimum price', async () => {
      supabaseMock.getAdminClient.mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { ...validProduct, minimum_price: 50.0 },
            error: null,
          }),
        }),
      });

      await expect(
        service.placeBid('buyer-1', { productId: 'prod-1', amount: 45.0 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if bid is not higher than current highest bid', async () => {
      const fromMock = jest.fn();
      fromMock.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: validProduct, error: null }),
      });
      fromMock.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { amount: 70.0, buyer_id: 'someone' },
          error: null,
        }),
      });

      supabaseMock.getAdminClient.mockReturnValue({ from: fromMock });

      await expect(
        service.placeBid('buyer-1', { productId: 'prod-1', amount: 70.0 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getBidsForProduct', () => {
    it('should return list of bids for a product ordered by amount DESC', async () => {
      const mockBids = [
        {
          id: 'b-2',
          product_id: 'prod-1',
          buyer_id: 'buyer-2',
          amount: 80.0,
          created_at: new Date().toISOString(),
        },
        {
          id: 'b-1',
          product_id: 'prod-1',
          buyer_id: 'buyer-1',
          amount: 60.0,
          created_at: new Date().toISOString(),
        },
      ];

      supabaseMock.getAdminClient.mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: mockBids, error: null }),
        }),
      });

      const result = await service.getBidsForProduct('prod-1');

      expect(result.length).toBe(2);
      expect(result[0].amount).toBe(80.0);
      expect(result[1].amount).toBe(60.0);
    });
  });

  describe('getWinningBid', () => {
    it('should throw BadRequestException if auction is still ongoing', async () => {
      const ongoingProduct = {
        id: 'prod-1',
        end_time: new Date(Date.now() + 1000000).toISOString(),
        status: 'active',
      };

      supabaseMock.getAdminClient.mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: ongoingProduct, error: null }),
        }),
      });

      await expect(service.getWinningBid('prod-1')).rejects.toThrow(BadRequestException);
    });

    it('should return winner and emit auction:ended when auction has ended', async () => {
      const endedProduct = {
        id: 'prod-1',
        end_time: new Date(Date.now() - 1000000).toISOString(),
        status: 'expired',
      };

      const topBid = {
        id: 'bid-win',
        product_id: 'prod-1',
        buyer_id: 'winner-uuid',
        amount: 150.0,
        created_at: new Date().toISOString(),
      };

      const fromMock = jest.fn();
      fromMock.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: endedProduct, error: null }),
      });
      fromMock.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: topBid, error: null }),
      });

      supabaseMock.getAdminClient.mockReturnValue({ from: fromMock });

      const result = await service.getWinningBid('prod-1');

      expect(result.hasWinner).toBe(true);
      expect(result.winningBid?.buyerId).toBe('winner-uuid');
      expect(result.winningBid?.amount).toBe(150.0);
      expect(bidsGatewayMock.emitAuctionEnded).toHaveBeenCalledWith({
        productId: 'prod-1',
        winnerId: 'winner-uuid',
        winningAmount: 150.0,
      });
    });
  });

  describe('getMyBids', () => {
    it('should return buyer bids with product details', async () => {
      const mockBids = [
        {
          id: 'bid-1',
          product_id: 'prod-1',
          buyer_id: 'buyer-1',
          amount: 90.0,
          created_at: new Date().toISOString(),
          products: {
            id: 'prod-1',
            product_name: 'Boro Rice',
            category: 'rice',
            status: 'active',
            minimum_price: 50.0,
            end_time: '2026-11-25T20:00:00Z',
          },
        },
      ];

      supabaseMock.getAdminClient.mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: mockBids, error: null }),
        }),
      });

      const result = await service.getMyBids('buyer-1');

      expect(result.length).toBe(1);
      expect(result[0].amount).toBe(90.0);
      expect(result[0].product?.productName).toBe('Boro Rice');
    });
  });
});
