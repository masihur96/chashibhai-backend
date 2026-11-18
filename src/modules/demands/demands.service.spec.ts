import { Test, TestingModule } from '@nestjs/testing';
import { DemandsService } from './demands.service';
import { OrdersService } from '../orders/orders.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SupabaseService } from '../supabase/supabase.service';
import { DemandTradeType } from './dto/create-demand.dto';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';

describe('DemandsService', () => {
  let service: DemandsService;
  let supabaseMock: any;
  let ordersServiceMock: any;
  let notificationsServiceMock: any;

  beforeEach(async () => {
    supabaseMock = {
      getAdminClient: jest.fn(),
      uploadDemandImage: jest.fn(),
    };

    ordersServiceMock = {
      create: jest.fn(),
    };

    notificationsServiceMock = {
      sendNotification: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DemandsService,
        {
          provide: SupabaseService,
          useValue: supabaseMock,
        },
        {
          provide: OrdersService,
          useValue: ordersServiceMock,
        },
        {
          provide: NotificationsService,
          useValue: notificationsServiceMock,
        },
      ],
    }).compile();

    service = module.get<DemandsService>(DemandsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create demand post successfully', async () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      const mockCreated = {
        id: 'dem-1',
        buyer_id: 'buyer-1',
        product_name: 'Potatoes (Diamant)',
        quantity: 1000,
        calling_price: 28.0,
        delivery_location: 'Dhaka',
        expiry_time: futureDate,
        trade_type: 'both',
        status: 'active',
        created_at: new Date().toISOString(),
      };

      supabaseMock.getAdminClient.mockReturnValue({
        from: jest.fn().mockReturnValue({
          insert: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: mockCreated, error: null }),
        }),
      });

      const result = await service.create('buyer-1', {
        productName: 'Potatoes (Diamant)',
        quantity: 1000,
        callingPrice: 28.0,
        deliveryLocation: 'Dhaka',
        expiryTime: futureDate,
        tradeType: DemandTradeType.BOTH,
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('dem-1');
      expect(result.productName).toBe('Potatoes (Diamant)');
      expect(result.quantity).toBe(1000);
      expect(result.callingPrice).toBe(28.0);
    });

    it('should throw BadRequestException if expiryTime is in the past', async () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString();

      await expect(
        service.create('buyer-1', {
          productName: 'Potatoes',
          quantity: 100,
          callingPrice: 20,
          deliveryLocation: 'Dhaka',
          expiryTime: pastDate,
          tradeType: DemandTradeType.BOTH,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('should return paginated active demands with search and price filters', async () => {
      const mockList = [
        {
          id: 'dem-1',
          buyer_id: 'buyer-1',
          product_name: 'Potato',
          quantity: 500,
          calling_price: 30.0,
          delivery_location: 'Bogura',
          expiry_time: new Date(Date.now() + 86400000).toISOString(),
          status: 'active',
          trade_type: 'both',
        },
      ];

      const chain: any = {};
      chain.select = jest.fn().mockReturnValue(chain);
      chain.eq = jest.fn().mockReturnValue(chain);
      chain.ilike = jest.fn().mockReturnValue(chain);
      chain.gte = jest.fn().mockReturnValue(chain);
      chain.lte = jest.fn().mockReturnValue(chain);
      chain.order = jest.fn().mockReturnValue(chain);
      chain.range = jest.fn().mockResolvedValue({
        data: mockList,
        count: 1,
        error: null,
      });

      supabaseMock.getAdminClient.mockReturnValue({
        from: jest.fn().mockReturnValue(chain),
      });

      const result = await service.findAll({
        page: 1,
        limit: 10,
        search: 'Potato',
        minPrice: 20,
        maxPrice: 40,
      });

      expect(result.data.length).toBe(1);
      expect(result.data[0].productName).toBe('Potato');
      expect(result.meta.total).toBe(1);
    });
  });

  describe('findOne', () => {
    it('should return demand details by id', async () => {
      const mockDemand = {
        id: 'dem-1',
        buyer_id: 'buyer-1',
        product_name: 'Potatoes',
        quantity: 1000,
        calling_price: 28.0,
        status: 'active',
      };

      supabaseMock.getAdminClient.mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: mockDemand, error: null }),
        }),
      });

      const result = await service.findOne('dem-1');
      expect(result.id).toBe('dem-1');
      expect(result.productName).toBe('Potatoes');
    });

    it('should throw NotFoundException if demand does not exist', async () => {
      supabaseMock.getAdminClient.mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
        }),
      });

      await expect(service.findOne('invalid-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createOffer', () => {
    const activeDemand = {
      id: 'dem-1',
      buyer_id: 'buyer-1',
      product_name: 'Potatoes',
      status: 'active',
      expiry_time: new Date(Date.now() + 86400000).toISOString(),
    };

    it('should allow a farmer to submit an offer and notify buyer', async () => {
      const mockOffer = {
        id: 'off-1',
        demand_id: 'dem-1',
        farmer_id: 'farmer-1',
        offer_price: 27.5,
        note: 'Fresh harvest',
        created_at: new Date().toISOString(),
      };

      const fromMock = jest.fn();
      fromMock.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: activeDemand, error: null }),
      });
      fromMock.mockReturnValueOnce({
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockOffer, error: null }),
      });

      supabaseMock.getAdminClient.mockReturnValue({ from: fromMock });

      const result = await service.createOffer('dem-1', 'farmer-1', {
        offerPrice: 27.5,
        note: 'Fresh harvest',
      });

      expect(result.id).toBe('off-1');
      expect(result.offerPrice).toBe(27.5);
      expect(notificationsServiceMock.sendNotification).toHaveBeenCalledWith(
        'buyer-1',
        'New Demand Offer Received',
        expect.stringContaining('27.5'),
        expect.any(Object),
      );
    });

    it('should throw ForbiddenException if buyer offers on own demand', async () => {
      supabaseMock.getAdminClient.mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: activeDemand, error: null }),
        }),
      });

      await expect(
        service.createOffer('dem-1', 'buyer-1', { offerPrice: 30 }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('acceptOffer', () => {
    it('should accept offer, fulfill demand, create order, and notify farmer', async () => {
      const mockDemand = {
        id: 'dem-1',
        buyer_id: 'buyer-1',
        product_name: 'Potatoes',
        quantity: 1000,
        status: 'active',
      };

      const mockOffer = {
        id: 'off-1',
        demand_id: 'dem-1',
        farmer_id: 'farmer-1',
        offer_price: 27.0,
      };

      const fromMock = jest.fn();
      // Demand lookup
      fromMock.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockDemand, error: null }),
      });
      // Offer lookup
      fromMock.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockOffer, error: null }),
      });
      // Update demand status
      fromMock.mockReturnValueOnce({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ error: null }),
      });

      supabaseMock.getAdminClient.mockReturnValue({ from: fromMock });

      ordersServiceMock.create.mockResolvedValue({
        id: 'ord-99',
        totalAmount: 27000,
        status: 'confirmed',
      });

      const result = await service.acceptOffer('dem-1', 'off-1', 'buyer-1');

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('fulfilled');
      expect(ordersServiceMock.create).toHaveBeenCalledWith({
        buyerId: 'buyer-1',
        farmerId: 'farmer-1',
        demandId: 'dem-1',
        totalAmount: 27000,
        quantity: 1000,
        status: 'confirmed',
      });
      expect(notificationsServiceMock.sendNotification).toHaveBeenCalledWith(
        'farmer-1',
        'Your Demand Offer Was Accepted!',
        expect.stringContaining('Potatoes'),
        expect.any(Object),
      );
    });
  });

  describe('expireOverdueDemands', () => {
    it('should update active demands past expiry_time to expired', async () => {
      supabaseMock.getAdminClient.mockReturnValue({
        from: jest.fn().mockReturnValue({
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          lt: jest.fn().mockReturnThis(),
          select: jest.fn().mockResolvedValue({
            data: [{ id: 'dem-1' }, { id: 'dem-2' }],
            error: null,
          }),
        }),
      });

      const count = await service.expireOverdueDemands();
      expect(count).toBe(2);
    });
  });
});
