import { Test, TestingModule } from '@nestjs/testing';
import { NegotiationsController } from './negotiations.controller';
import { NegotiationsService } from './negotiations.service';
import { SupabaseService } from '../supabase/supabase.service';

describe('NegotiationsController', () => {
  let controller: NegotiationsController;
  let negotiationsService: Partial<Record<keyof NegotiationsService, jest.Mock>>;

  beforeEach(async () => {
    negotiationsService = {
      initiate: jest.fn(),
      findMyNegotiations: jest.fn(),
      findOne: jest.fn(),
      createOffer: jest.fn(),
      acceptNegotiation: jest.fn(),
      rejectNegotiation: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NegotiationsController],
      providers: [
        {
          provide: NegotiationsService,
          useValue: negotiationsService,
        },
        {
          provide: SupabaseService,
          useValue: {
            getAdminClient: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<NegotiationsController>(NegotiationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /', () => {
    it('should initiate negotiation', async () => {
      const mockDto = { productId: 'prod-1', amount: 45.0 };
      const mockResult = { id: 'neg-1', productId: 'prod-1', buyerId: 'buyer-1', farmerId: 'farmer-1' };

      (negotiationsService.initiate as jest.Mock).mockResolvedValue(mockResult);

      const result = await controller.initiate({ sub: 'buyer-1', role: 'buyer' }, mockDto);

      expect(result).toEqual({
        success: true,
        data: mockResult,
      });
      expect(negotiationsService.initiate).toHaveBeenCalledWith('buyer-1', 'buyer', mockDto);
    });
  });

  describe('GET /my', () => {
    it('should return own negotiations', async () => {
      const mockList = [{ id: 'neg-1' }];
      (negotiationsService.findMyNegotiations as jest.Mock).mockResolvedValue(mockList);

      const result = await controller.getMyNegotiations({ sub: 'user-1' });

      expect(result).toEqual({
        success: true,
        data: mockList,
      });
      expect(negotiationsService.findMyNegotiations).toHaveBeenCalledWith('user-1');
    });
  });

  describe('GET /:id', () => {
    it('should return negotiation details', async () => {
      const mockDetails = { id: 'neg-1', status: 'pending' };
      (negotiationsService.findOne as jest.Mock).mockResolvedValue(mockDetails);

      const result = await controller.findOne('neg-1', { sub: 'buyer-1', role: 'buyer' });

      expect(result).toEqual({
        success: true,
        data: mockDetails,
      });
      expect(negotiationsService.findOne).toHaveBeenCalledWith('neg-1', 'buyer-1', 'buyer');
    });
  });

  describe('POST /:id/offer', () => {
    it('should create counter offer', async () => {
      const mockOfferResult = { success: true, data: { id: 'off-1', amount: 48.0 } };
      (negotiationsService.createOffer as jest.Mock).mockResolvedValue(mockOfferResult);

      const result = await controller.createOffer(
        'neg-1',
        { sub: 'farmer-1', role: 'farmer' },
        { amount: 48.0 },
      );

      expect(result).toEqual(mockOfferResult);
      expect(negotiationsService.createOffer).toHaveBeenCalledWith(
        'neg-1',
        'farmer-1',
        { amount: 48.0 },
        'farmer',
      );
    });
  });

  describe('PATCH /:id/accept', () => {
    it('should accept negotiation', async () => {
      const mockAcceptResult = { success: true, message: 'Accepted', data: {} };
      (negotiationsService.acceptNegotiation as jest.Mock).mockResolvedValue(mockAcceptResult);

      const result = await controller.acceptPatch('neg-1', { sub: 'buyer-1', role: 'buyer' });

      expect(result).toEqual(mockAcceptResult);
      expect(negotiationsService.acceptNegotiation).toHaveBeenCalledWith('neg-1', 'buyer-1', 'buyer');
    });
  });

  describe('PATCH /:id/reject', () => {
    it('should reject negotiation', async () => {
      const mockRejectResult = { success: true, message: 'Rejected', data: {} };
      (negotiationsService.rejectNegotiation as jest.Mock).mockResolvedValue(mockRejectResult);

      const result = await controller.rejectPatch('neg-1', { sub: 'farmer-1', role: 'farmer' });

      expect(result).toEqual(mockRejectResult);
      expect(negotiationsService.rejectNegotiation).toHaveBeenCalledWith('neg-1', 'farmer-1', 'farmer');
    });
  });
});
