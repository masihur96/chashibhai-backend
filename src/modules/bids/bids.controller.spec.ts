import { Test, TestingModule } from '@nestjs/testing';
import { BidsController } from './bids.controller';
import { BidsService } from './bids.service';

describe('BidsController', () => {
  let controller: BidsController;
  let bidsService: Partial<Record<keyof BidsService, jest.Mock>>;

  beforeEach(async () => {
    bidsService = {
      placeBid: jest.fn(),
      getBidsForProduct: jest.fn(),
      getWinningBid: jest.fn(),
      getMyBids: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BidsController],
      providers: [
        {
          provide: BidsService,
          useValue: bidsService,
        },
      ],
    }).compile();

    controller = module.get<BidsController>(BidsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /', () => {
    it('should place a bid and return 201 Created', async () => {
      const mockDto = {
        productId: 'prod-uuid-1',
        amount: 75.0,
      };

      const mockResult = {
        id: 'bid-1',
        productId: 'prod-uuid-1',
        buyerId: 'buyer-uuid-1',
        amount: 75.0,
        createdAt: '2026-11-20T10:00:00Z',
      };

      (bidsService.placeBid as jest.Mock).mockResolvedValue(mockResult);

      const result = await controller.placeBid(
        { sub: 'buyer-uuid-1' },
        mockDto,
      );

      expect(result).toEqual({
        success: true,
        data: mockResult,
      });
      expect(bidsService.placeBid).toHaveBeenCalledWith(
        'buyer-uuid-1',
        mockDto,
      );
    });
  });

  describe('GET /my', () => {
    it('should return buyer own bids', async () => {
      const mockBids = [
        {
          id: 'bid-1',
          productId: 'prod-1',
          buyerId: 'buyer-1',
          amount: 60.0,
        },
      ];

      (bidsService.getMyBids as jest.Mock).mockResolvedValue(mockBids);

      const result = await controller.getMyBids({ sub: 'buyer-1' });

      expect(result).toEqual({
        success: true,
        data: mockBids,
      });
      expect(bidsService.getMyBids).toHaveBeenCalledWith('buyer-1');
    });
  });

  describe('GET /product/:productId/winner', () => {
    it('should return the winning bid', async () => {
      const mockWinner = {
        hasWinner: true,
        winningBid: {
          id: 'bid-top',
          productId: 'prod-1',
          buyerId: 'winner-1',
          amount: 120.0,
        },
      };

      (bidsService.getWinningBid as jest.Mock).mockResolvedValue(mockWinner);

      const result = await controller.getWinningBid('prod-1');

      expect(result).toEqual({
        success: true,
        data: mockWinner,
      });
      expect(bidsService.getWinningBid).toHaveBeenCalledWith('prod-1');
    });
  });

  describe('GET /product/:productId', () => {
    it('should return all bids for a product', async () => {
      const mockBids = [
        { id: 'bid-2', amount: 100.0 },
        { id: 'bid-1', amount: 80.0 },
      ];

      (bidsService.getBidsForProduct as jest.Mock).mockResolvedValue(mockBids);

      const result = await controller.getBidsForProduct('prod-1');

      expect(result).toEqual({
        success: true,
        data: mockBids,
      });
      expect(bidsService.getBidsForProduct).toHaveBeenCalledWith('prod-1');
    });
  });
});
