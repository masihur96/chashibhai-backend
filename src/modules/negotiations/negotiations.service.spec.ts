import { Test, TestingModule } from '@nestjs/testing';
import { NegotiationsService } from './negotiations.service';
import { NegotiationsGateway } from './negotiations.gateway';
import { OrdersService } from '../orders/orders.service';
import { SupabaseService } from '../supabase/supabase.service';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';

describe('NegotiationsService', () => {
  let service: NegotiationsService;
  let supabaseMock: any;
  let ordersServiceMock: any;
  let negotiationsGatewayMock: any;

  beforeEach(async () => {
    supabaseMock = {
      getAdminClient: jest.fn(),
    };

    ordersServiceMock = {
      create: jest.fn(),
    };

    negotiationsGatewayMock = {
      emitOfferReceived: jest.fn(),
      emitNegotiationAccepted: jest.fn(),
      emitNegotiationRejected: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NegotiationsService,
        {
          provide: SupabaseService,
          useValue: supabaseMock,
        },
        {
          provide: OrdersService,
          useValue: ordersServiceMock,
        },
        {
          provide: NegotiationsGateway,
          useValue: negotiationsGatewayMock,
        },
      ],
    }).compile();

    service = module.get<NegotiationsService>(NegotiationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initiate', () => {
    const validProduct = {
      id: 'prod-1',
      farmer_id: 'farmer-1',
      trade_type: 'negotiation',
      status: 'active',
      minimum_price: 50.0,
    };

    it('should successfully initiate a negotiation on a product by a buyer', async () => {
      const fromMock = jest.fn();

      // Product lookup
      fromMock.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest
          .fn()
          .mockResolvedValue({ data: validProduct, error: null }),
      });

      // Existing negotiation lookup
      fromMock.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        match: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null }),
      });

      // Insert negotiation
      const mockCreated = {
        id: 'neg-1',
        product_id: 'prod-1',
        demand_id: null,
        buyer_id: 'buyer-1',
        farmer_id: 'farmer-1',
        status: 'pending',
        created_at: new Date().toISOString(),
      };
      fromMock.mockReturnValueOnce({
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockCreated, error: null }),
      });

      // Insert initial offer
      const mockOffer = {
        id: 'off-1',
        negotiation_id: 'neg-1',
        sender_id: 'buyer-1',
        amount: 45.0,
        note: 'Initial offer',
        created_at: new Date().toISOString(),
      };
      fromMock.mockReturnValueOnce({
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockOffer, error: null }),
      });

      supabaseMock.getAdminClient.mockReturnValue({ from: fromMock });

      const result = await service.initiate('buyer-1', 'buyer', {
        productId: 'prod-1',
        amount: 45.0,
        note: 'Initial offer',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('neg-1');
      expect(result.buyerId).toBe('buyer-1');
      expect(result.farmerId).toBe('farmer-1');
      expect(result.status).toBe('pending');
      expect(negotiationsGatewayMock.emitOfferReceived).toHaveBeenCalledWith({
        negotiationId: 'neg-1',
        offerId: 'off-1',
        senderId: 'buyer-1',
        recipientId: 'farmer-1',
        amount: 45.0,
        note: 'Initial offer',
        timestamp: mockOffer.created_at,
      });
    });

    it('should throw BadRequestException if neither productId nor demandId is provided', async () => {
      await expect(service.initiate('buyer-1', 'buyer', {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ForbiddenException if farmer negotiates on own product', async () => {
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
        service.initiate('same-user', 'farmer', { productId: 'prod-1' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findMyNegotiations', () => {
    it('should return negotiations for the user', async () => {
      const mockList = [
        {
          id: 'neg-1',
          product_id: 'prod-1',
          buyer_id: 'user-1',
          farmer_id: 'farmer-1',
          status: 'countered',
          created_at: new Date().toISOString(),
          negotiation_offers: [],
        },
      ];

      supabaseMock.getAdminClient.mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          or: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({ data: mockList, error: null }),
        }),
      });

      const result = await service.findMyNegotiations('user-1');

      expect(result.length).toBe(1);
      expect(result[0].id).toBe('neg-1');
    });
  });

  describe('findOne', () => {
    it('should return negotiation details if caller is participant', async () => {
      const mockNegotiation = {
        id: 'neg-1',
        buyer_id: 'buyer-1',
        farmer_id: 'farmer-1',
        status: 'pending',
        negotiation_offers: [],
      };

      supabaseMock.getAdminClient.mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest
            .fn()
            .mockResolvedValue({ data: mockNegotiation, error: null }),
        }),
      });

      const result = await service.findOne('neg-1', 'buyer-1');
      expect(result.id).toBe('neg-1');
    });

    it('should throw ForbiddenException if caller is not a participant', async () => {
      const mockNegotiation = {
        id: 'neg-1',
        buyer_id: 'buyer-1',
        farmer_id: 'farmer-1',
      };

      supabaseMock.getAdminClient.mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest
            .fn()
            .mockResolvedValue({ data: mockNegotiation, error: null }),
        }),
      });

      await expect(service.findOne('neg-1', 'intruder-id')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('createOffer', () => {
    it('should create offer, update status to countered, and emit WebSocket event', async () => {
      const mockNegotiation = {
        id: 'neg-1',
        buyer_id: 'buyer-1',
        farmer_id: 'farmer-1',
        status: 'pending',
      };

      const mockOffer = {
        id: 'off-2',
        negotiation_id: 'neg-1',
        sender_id: 'farmer-1',
        amount: 48.0,
        note: 'Best price',
        created_at: new Date().toISOString(),
      };

      const fromMock = jest.fn();
      fromMock.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest
          .fn()
          .mockResolvedValue({ data: mockNegotiation, error: null }),
      });
      fromMock.mockReturnValueOnce({
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockOffer, error: null }),
      });
      fromMock.mockReturnValueOnce({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ error: null }),
      });

      supabaseMock.getAdminClient.mockReturnValue({ from: fromMock });

      const result = await service.createOffer('neg-1', 'farmer-1', {
        amount: 48.0,
        note: 'Best price',
      });

      expect(result.success).toBe(true);
      expect(result.data.amount).toBe(48.0);
      expect(result.data.status).toBe('countered');
      expect(negotiationsGatewayMock.emitOfferReceived).toHaveBeenCalledWith({
        negotiationId: 'neg-1',
        offerId: 'off-2',
        senderId: 'farmer-1',
        recipientId: 'buyer-1',
        amount: 48.0,
        note: 'Best price',
        timestamp: mockOffer.created_at,
      });
    });
  });

  describe('acceptNegotiation', () => {
    it('should accept negotiation, create order with latest offer, and emit event', async () => {
      const mockNegotiation = {
        id: 'neg-1',
        buyer_id: 'buyer-1',
        farmer_id: 'farmer-1',
        product_id: 'prod-1',
        demand_id: null,
        status: 'countered',
        negotiation_offers: [
          {
            id: 'off-1',
            amount: 45.0,
            created_at: '2026-11-20T10:00:00Z',
          },
          {
            id: 'off-2',
            amount: 47.0,
            created_at: '2026-11-20T11:00:00Z',
          },
        ],
      };

      const fromMock = jest.fn();
      fromMock.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest
          .fn()
          .mockResolvedValue({ data: mockNegotiation, error: null }),
      });
      fromMock.mockReturnValueOnce({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ error: null }),
      });

      supabaseMock.getAdminClient.mockReturnValue({ from: fromMock });

      ordersServiceMock.create.mockResolvedValue({
        id: 'order-123',
        totalAmount: 47.0,
        status: 'confirmed',
      });

      const result = await service.acceptNegotiation('neg-1', 'buyer-1');

      expect(result.success).toBe(true);
      expect(result.data.finalAmount).toBe(47.0);
      expect(ordersServiceMock.create).toHaveBeenCalledWith({
        buyerId: 'buyer-1',
        farmerId: 'farmer-1',
        productId: 'prod-1',
        demandId: null,
        negotiationId: 'neg-1',
        totalAmount: 47.0,
        status: 'confirmed',
      });
      expect(
        negotiationsGatewayMock.emitNegotiationAccepted,
      ).toHaveBeenCalledWith({
        negotiationId: 'neg-1',
        acceptedBy: 'buyer-1',
        orderId: 'order-123',
        finalAmount: 47.0,
      });
    });
  });

  describe('rejectNegotiation', () => {
    it('should set status to rejected and emit event', async () => {
      const mockNegotiation = {
        id: 'neg-1',
        buyer_id: 'buyer-1',
        farmer_id: 'farmer-1',
        status: 'pending',
      };

      const fromMock = jest.fn();
      fromMock.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest
          .fn()
          .mockResolvedValue({ data: mockNegotiation, error: null }),
      });
      fromMock.mockReturnValueOnce({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ error: null }),
      });

      supabaseMock.getAdminClient.mockReturnValue({ from: fromMock });

      const result = await service.rejectNegotiation('neg-1', 'farmer-1');

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('rejected');
      expect(
        negotiationsGatewayMock.emitNegotiationRejected,
      ).toHaveBeenCalledWith({
        negotiationId: 'neg-1',
        rejectedBy: 'farmer-1',
      });
    });
  });
});
