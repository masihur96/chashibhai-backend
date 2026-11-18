import { Test, TestingModule } from '@nestjs/testing';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { SupabaseService } from '../supabase/supabase.service';

describe('OrdersController', () => {
  let controller: OrdersController;
  let ordersService: Partial<Record<keyof OrdersService, jest.Mock>>;

  beforeEach(async () => {
    ordersService = {
      findMyOrders: jest.fn(),
      findOne: jest.fn(),
      dispatch: jest.fn(),
      deliver: jest.fn(),
      cancel: jest.fn(),
      generateInvoice: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        {
          provide: OrdersService,
          useValue: ordersService,
        },
        {
          provide: SupabaseService,
          useValue: {
            getAdminClient: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<OrdersController>(OrdersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /my', () => {
    it('should return user orders', async () => {
      const mockResult = {
        data: [{ id: 'ord-1', status: 'pending' }],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      };

      (ordersService.findMyOrders as jest.Mock).mockResolvedValue(mockResult);

      const result = await controller.getMyOrders(
        { sub: 'user-1' },
        { status: 'pending' },
      );

      expect(result).toEqual({
        success: true,
        ...mockResult,
      });
      expect(ordersService.findMyOrders).toHaveBeenCalledWith('user-1', {
        status: 'pending',
      });
    });
  });

  describe('GET /:id', () => {
    it('should return order details', async () => {
      const mockOrder = { id: 'ord-1', status: 'pending' };
      (ordersService.findOne as jest.Mock).mockResolvedValue(mockOrder);

      const result = await controller.findOne('ord-1', {
        sub: 'buyer-1',
        role: 'buyer',
      });

      expect(result).toEqual({
        success: true,
        data: mockOrder,
      });
      expect(ordersService.findOne).toHaveBeenCalledWith(
        'ord-1',
        'buyer-1',
        'buyer',
      );
    });
  });

  describe('PATCH /:id/dispatch', () => {
    it('should mark order as dispatched', async () => {
      const mockUpdated = { id: 'ord-1', status: 'dispatched' };
      (ordersService.dispatch as jest.Mock).mockResolvedValue(mockUpdated);

      const result = await controller.dispatch('ord-1', {
        sub: 'farmer-1',
        role: 'farmer',
      });

      expect(result).toEqual({
        success: true,
        data: mockUpdated,
      });
      expect(ordersService.dispatch).toHaveBeenCalledWith(
        'ord-1',
        'farmer-1',
        'farmer',
      );
    });
  });

  describe('PATCH /:id/deliver', () => {
    it('should confirm delivery and release escrow', async () => {
      const mockUpdated = { id: 'ord-1', status: 'delivered' };
      (ordersService.deliver as jest.Mock).mockResolvedValue(mockUpdated);

      const result = await controller.deliver('ord-1', {
        sub: 'buyer-1',
        role: 'buyer',
      });

      expect(result).toEqual({
        success: true,
        data: mockUpdated,
      });
      expect(ordersService.deliver).toHaveBeenCalledWith(
        'ord-1',
        'buyer-1',
        'buyer',
      );
    });
  });

  describe('PATCH /:id/cancel', () => {
    it('should cancel order and refund escrow', async () => {
      const mockCancelled = { id: 'ord-1', status: 'cancelled' };
      (ordersService.cancel as jest.Mock).mockResolvedValue(mockCancelled);

      const result = await controller.cancel('ord-1', {
        sub: 'buyer-1',
        role: 'buyer',
      });

      expect(result).toEqual({
        success: true,
        data: mockCancelled,
      });
      expect(ordersService.cancel).toHaveBeenCalledWith(
        'ord-1',
        'buyer-1',
        'buyer',
      );
    });
  });

  describe('GET /:id/invoice', () => {
    it('should return invoice data', async () => {
      const mockInvoice = {
        invoiceNumber: 'INV-123456',
        subtotal: 500.0,
      };

      (ordersService.generateInvoice as jest.Mock).mockResolvedValue(
        mockInvoice,
      );

      const result = await controller.getInvoice('ord-1', {
        sub: 'buyer-1',
        role: 'buyer',
      });

      expect(result).toEqual({
        success: true,
        data: mockInvoice,
      });
      expect(ordersService.generateInvoice).toHaveBeenCalledWith(
        'ord-1',
        'buyer-1',
        'buyer',
      );
    });
  });
});
