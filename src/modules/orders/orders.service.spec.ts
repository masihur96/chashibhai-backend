import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { WalletService } from '../wallet/wallet.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SupabaseService } from '../supabase/supabase.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';

describe('OrdersService', () => {
  let service: OrdersService;
  let supabaseMock: any;
  let walletServiceMock: any;
  let notificationsServiceMock: any;
  let prismaMock: any;

  beforeEach(async () => {
    supabaseMock = {
      getAdminClient: jest.fn(),
    };

    walletServiceMock = {
      lockEscrow: jest.fn(),
      releaseEscrow: jest.fn(),
      refundEscrow: jest.fn(),
    };

    notificationsServiceMock = {
      sendNotification: jest.fn(),
    };

    prismaMock = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: SupabaseService,
          useValue: supabaseMock,
        },
        {
          provide: WalletService,
          useValue: walletServiceMock,
        },
        {
          provide: NotificationsService,
          useValue: notificationsServiceMock,
        },
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create order, calculate commission, lock escrow, and notify parties', async () => {
      const mockOrder = {
        id: 'ord-123',
        supply_id: 'prod-1',
        demand_id: null,
        buyer_id: 'buyer-1',
        farmer_id: 'farmer-1',
        final_price: 50.0,
        quantity: 10,
        commission: 10.0, // 2% of 500
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      supabaseMock.getAdminClient.mockReturnValue({
        from: jest.fn().mockReturnValue({
          insert: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: mockOrder, error: null }),
        }),
      });

      const result = await service.create({
        buyerId: 'buyer-1',
        farmerId: 'farmer-1',
        productId: 'prod-1',
        finalPrice: 50.0,
        quantity: 10,
        totalAmount: 500.0,
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('ord-123');
      expect(result.commission).toBe(10.0);
      expect(result.totalAmount).toBe(500.0);
      expect(walletServiceMock.lockEscrow).toHaveBeenCalledWith(
        'buyer-1',
        500.0,
        'ord-123',
      );
      expect(notificationsServiceMock.sendNotification).toHaveBeenCalledTimes(2);
    });
  });

  describe('findMyOrders', () => {
    it('should return orders where caller is buyer or farmer', async () => {
      const mockOrders = [
        {
          id: 'ord-1',
          buyer_id: 'user-1',
          farmer_id: 'farmer-1',
          final_price: 45.0,
          quantity: 10,
          commission: 9.0,
          status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      supabaseMock.getAdminClient.mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          or: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          range: jest.fn().mockResolvedValue({
            data: mockOrders,
            count: 1,
            error: null,
          }),
        }),
      });

      const result = await service.findMyOrders('user-1', { status: 'pending' });

      expect(result.data.length).toBe(1);
      expect(result.data[0].id).toBe('ord-1');
      expect(result.meta.total).toBe(1);
    });
  });

  describe('findOne', () => {
    it('should return order details if caller is participant', async () => {
      const mockOrder = {
        id: 'ord-1',
        buyer_id: 'buyer-1',
        farmer_id: 'farmer-1',
        final_price: 45.0,
        quantity: 10,
        status: 'pending',
      };

      supabaseMock.getAdminClient.mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: mockOrder, error: null }),
        }),
      });

      const result = await service.findOne('ord-1', 'buyer-1');
      expect(result.id).toBe('ord-1');
    });

    it('should throw ForbiddenException if caller is not participant', async () => {
      const mockOrder = {
        id: 'ord-1',
        buyer_id: 'buyer-1',
        farmer_id: 'farmer-1',
      };

      supabaseMock.getAdminClient.mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: mockOrder, error: null }),
        }),
      });

      await expect(service.findOne('ord-1', 'intruder-id')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('dispatch', () => {
    it('should allow farmer to dispatch pending order and notify buyer', async () => {
      const pendingOrder = {
        id: 'ord-1',
        buyer_id: 'buyer-1',
        farmer_id: 'farmer-1',
        final_price: 50,
        quantity: 5,
        status: 'pending',
      };

      const dispatchedOrder = {
        ...pendingOrder,
        status: 'dispatched',
      };

      const fromMock = jest.fn();
      fromMock.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: pendingOrder, error: null }),
      });
      fromMock.mockReturnValueOnce({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: dispatchedOrder, error: null }),
      });

      supabaseMock.getAdminClient.mockReturnValue({ from: fromMock });

      const result = await service.dispatch('ord-1', 'farmer-1');

      expect(result.status).toBe('dispatched');
      expect(notificationsServiceMock.sendNotification).toHaveBeenCalledWith(
        'buyer-1',
        'Order Dispatched!',
        expect.stringContaining('ord-1'),
        expect.any(Object),
      );
    });

    it('should throw ForbiddenException if buyer tries to dispatch order', async () => {
      const pendingOrder = {
        id: 'ord-1',
        buyer_id: 'buyer-1',
        farmer_id: 'farmer-1',
        status: 'pending',
      };

      supabaseMock.getAdminClient.mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: pendingOrder, error: null }),
        }),
      });

      await expect(service.dispatch('ord-1', 'buyer-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('deliver', () => {
    it('should allow buyer to confirm delivery, release escrow, and notify farmer', async () => {
      const dispatchedOrder = {
        id: 'ord-1',
        buyer_id: 'buyer-1',
        farmer_id: 'farmer-1',
        final_price: 50,
        quantity: 5,
        status: 'dispatched',
      };

      const deliveredOrder = {
        ...dispatchedOrder,
        status: 'delivered',
      };

      const fromMock = jest.fn();
      fromMock.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: dispatchedOrder, error: null }),
      });
      fromMock.mockReturnValueOnce({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: deliveredOrder, error: null }),
      });

      supabaseMock.getAdminClient.mockReturnValue({ from: fromMock });

      const result = await service.deliver('ord-1', 'buyer-1');

      expect(result.status).toBe('delivered');
      expect(walletServiceMock.releaseEscrow).toHaveBeenCalledWith('ord-1');
      expect(notificationsServiceMock.sendNotification).toHaveBeenCalledWith(
        'farmer-1',
        'Delivery Confirmed & Funds Released!',
        expect.stringContaining('ord-1'),
        expect.any(Object),
      );
    });

    it('should throw BadRequestException if order is not dispatched', async () => {
      const pendingOrder = {
        id: 'ord-1',
        buyer_id: 'buyer-1',
        farmer_id: 'farmer-1',
        status: 'pending',
      };

      supabaseMock.getAdminClient.mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: pendingOrder, error: null }),
        }),
      });

      await expect(service.deliver('ord-1', 'buyer-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('cancel', () => {
    it('should cancel order, refund escrow to buyer, and notify other party', async () => {
      const pendingOrder = {
        id: 'ord-1',
        buyer_id: 'buyer-1',
        farmer_id: 'farmer-1',
        final_price: 50,
        quantity: 5,
        status: 'pending',
      };

      const cancelledOrder = {
        ...pendingOrder,
        status: 'cancelled',
      };

      const fromMock = jest.fn();
      fromMock.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: pendingOrder, error: null }),
      });
      fromMock.mockReturnValueOnce({
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: cancelledOrder, error: null }),
      });

      supabaseMock.getAdminClient.mockReturnValue({ from: fromMock });

      const result = await service.cancel('ord-1', 'buyer-1');

      expect(result.status).toBe('cancelled');
      expect(walletServiceMock.refundEscrow).toHaveBeenCalledWith('ord-1');
      expect(notificationsServiceMock.sendNotification).toHaveBeenCalledWith(
        'farmer-1',
        'Order Cancelled',
        expect.stringContaining('ord-1'),
        expect.any(Object),
      );
    });

    it('should throw BadRequestException if order is already delivered', async () => {
      const deliveredOrder = {
        id: 'ord-1',
        buyer_id: 'buyer-1',
        farmer_id: 'farmer-1',
        status: 'delivered',
      };

      supabaseMock.getAdminClient.mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: deliveredOrder, error: null }),
        }),
      });

      await expect(service.cancel('ord-1', 'buyer-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('generateInvoice', () => {
    it('should generate structured invoice data for an order', async () => {
      const mockOrder = {
        id: 'ord-98765432-1111',
        buyer_id: 'buyer-1',
        farmer_id: 'farmer-1',
        final_price: 45.0,
        quantity: 10,
        commission: 9.0,
        status: 'delivered',
        created_at: '2026-11-20T10:00:00Z',
        products: {
          product_name: 'Boro Rice',
        },
        buyer: {
          id: 'buyer-1',
          name: 'Buyer Ahmed',
          phone: '01711111111',
          district: 'Dhaka',
        },
        farmer: {
          id: 'farmer-1',
          name: 'Farmer Rafiq',
          phone: '01722222222',
          district: 'Bogura',
        },
      };

      supabaseMock.getAdminClient.mockReturnValue({
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({ data: mockOrder, error: null }),
        }),
      });

      const invoice = await service.generateInvoice('ord-98765432-1111', 'buyer-1');

      expect(invoice).toBeDefined();
      expect(invoice.invoiceNumber).toBe('INV-ORD-9876');
      expect(invoice.subtotal).toBe(450.0);
      expect(invoice.commission).toBe(9.0);
      expect(invoice.buyer.name).toBe('Buyer Ahmed');
      expect(invoice.farmer.name).toBe('Farmer Rafiq');
      expect(invoice.paymentStatus).toBe('settled');
    });
  });
});
