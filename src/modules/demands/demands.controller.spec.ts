import { Test, TestingModule } from '@nestjs/testing';
import { DemandsController } from './demands.controller';
import { DemandsService } from './demands.service';
import { DemandTradeType } from './dto/create-demand.dto';

describe('DemandsController', () => {
  let controller: DemandsController;
  let demandsService: Partial<Record<keyof DemandsService, jest.Mock>>;

  beforeEach(async () => {
    demandsService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findMyDemands: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      createOffer: jest.fn(),
      getOffers: jest.fn(),
      acceptOffer: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DemandsController],
      providers: [
        {
          provide: DemandsService,
          useValue: demandsService,
        },
      ],
    }).compile();

    controller = module.get<DemandsController>(DemandsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /', () => {
    it('should create demand post and return 201', async () => {
      const mockDto = {
        productName: 'Potatoes (Diamant)',
        quantity: 1000,
        callingPrice: 28.0,
        deliveryLocation: 'Dhaka',
        expiryTime: '2026-11-30T18:00:00Z',
        tradeType: DemandTradeType.BOTH,
      };

      const mockResult = { id: 'dem-1', buyerId: 'buyer-1', ...mockDto };
      (demandsService.create as jest.Mock).mockResolvedValue(mockResult);

      const result = await controller.create({ sub: 'buyer-1' }, mockDto);

      expect(result).toEqual({
        success: true,
        data: mockResult,
      });
      expect(demandsService.create).toHaveBeenCalledWith(
        'buyer-1',
        mockDto,
        undefined,
      );
    });
  });

  describe('GET /', () => {
    it('should return paginated demands for farmers marketplace', async () => {
      const mockList = {
        data: [{ id: 'dem-1', productName: 'Potatoes' }],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      };

      (demandsService.findAll as jest.Mock).mockResolvedValue(mockList);

      const result = await controller.findAll({ page: 1, limit: 10 });

      expect(result).toEqual({
        success: true,
        ...mockList,
      });
      expect(demandsService.findAll).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
      });
    });
  });

  describe('GET /my', () => {
    it('should return buyer own demands', async () => {
      const mockList = {
        data: [{ id: 'dem-1', buyerId: 'buyer-1' }],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      };

      (demandsService.findMyDemands as jest.Mock).mockResolvedValue(mockList);

      const result = await controller.getMyDemands(
        { sub: 'buyer-1' },
        { page: 1, limit: 10 },
      );

      expect(result).toEqual({
        success: true,
        ...mockList,
      });
      expect(demandsService.findMyDemands).toHaveBeenCalledWith('buyer-1', {
        page: 1,
        limit: 10,
      });
    });
  });

  describe('GET /:id', () => {
    it('should return demand details', async () => {
      const mockDemand = { id: 'dem-1', productName: 'Potatoes' };
      (demandsService.findOne as jest.Mock).mockResolvedValue(mockDemand);

      const result = await controller.findOne('dem-1');

      expect(result).toEqual({
        success: true,
        data: mockDemand,
      });
      expect(demandsService.findOne).toHaveBeenCalledWith('dem-1');
    });
  });

  describe('PATCH /:id', () => {
    it('should update demand post', async () => {
      const mockUpdated = { id: 'dem-1', callingPrice: 30.0 };
      (demandsService.update as jest.Mock).mockResolvedValue(mockUpdated);

      const result = await controller.update(
        'dem-1',
        { sub: 'buyer-1', role: 'buyer' },
        { callingPrice: 30.0 },
      );

      expect(result).toEqual({
        success: true,
        data: mockUpdated,
      });
      expect(demandsService.update).toHaveBeenCalledWith(
        'dem-1',
        'buyer-1',
        { callingPrice: 30.0 },
        'buyer',
      );
    });
  });

  describe('DELETE /:id', () => {
    it('should delete demand post', async () => {
      const mockDeleteResult = { success: true, message: 'Deleted' };
      (demandsService.remove as jest.Mock).mockResolvedValue(mockDeleteResult);

      const result = await controller.remove('dem-1', {
        sub: 'buyer-1',
        role: 'buyer',
      });

      expect(result).toEqual(mockDeleteResult);
      expect(demandsService.remove).toHaveBeenCalledWith(
        'dem-1',
        'buyer-1',
        'buyer',
      );
    });
  });

  describe('POST /:id/offer', () => {
    it('should submit an offer from farmer', async () => {
      const mockOffer = { id: 'off-1', offerPrice: 27.5 };
      (demandsService.createOffer as jest.Mock).mockResolvedValue(mockOffer);

      const result = await controller.createOffer(
        'dem-1',
        { sub: 'farmer-1', role: 'farmer' },
        { offerPrice: 27.5 },
      );

      expect(result).toEqual({
        success: true,
        data: mockOffer,
      });
      expect(demandsService.createOffer).toHaveBeenCalledWith(
        'dem-1',
        'farmer-1',
        {
          offerPrice: 27.5,
        },
      );
    });
  });

  describe('GET /:id/offers', () => {
    it('should list offers on a demand', async () => {
      const mockOffers = [{ id: 'off-1', offerPrice: 27.5 }];
      (demandsService.getOffers as jest.Mock).mockResolvedValue(mockOffers);

      const result = await controller.getOffers('dem-1', {
        sub: 'buyer-1',
        role: 'buyer',
      });

      expect(result).toEqual({
        success: true,
        data: mockOffers,
      });
      expect(demandsService.getOffers).toHaveBeenCalledWith(
        'dem-1',
        'buyer-1',
        'buyer',
      );
    });
  });

  describe('POST /:id/offers/:offerId/accept', () => {
    it('should accept offer and create order', async () => {
      const mockAcceptResult = {
        success: true,
        message: 'Order created',
        data: {},
      };
      (demandsService.acceptOffer as jest.Mock).mockResolvedValue(
        mockAcceptResult,
      );

      const result = await controller.acceptOffer('dem-1', 'off-1', {
        sub: 'buyer-1',
        role: 'buyer',
      });

      expect(result).toEqual(mockAcceptResult);
      expect(demandsService.acceptOffer).toHaveBeenCalledWith(
        'dem-1',
        'off-1',
        'buyer-1',
        'buyer',
      );
    });
  });
});
