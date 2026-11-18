import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { SupabaseService } from '../supabase/supabase.service';
import { Reflector } from '@nestjs/core';

describe('AdminController', () => {
  let controller: AdminController;
  let adminService: Partial<Record<keyof AdminService, jest.Mock>>;

  beforeEach(async () => {
    adminService = {
      getDashboard: jest.fn(),
      getUsers: jest.fn(),
      verifyUser: jest.fn(),
      banUser: jest.fn(),
      getProducts: jest.fn(),
      updateProductStatus: jest.fn(),
      getOrders: jest.fn(),
      updateOrderStatus: jest.fn(),
      getActiveEscrowLocks: jest.fn(),
      forceReleaseEscrow: jest.fn(),
      getRevenueAnalytics: jest.fn(),
      getTopFarmers: jest.fn(),
      getTopBuyers: jest.fn(),
      getTransactionReportCsv: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        {
          provide: AdminService,
          useValue: adminService,
        },
        {
          provide: SupabaseService,
          useValue: {
            getAdminClient: jest.fn(),
          },
        },
        Reflector,
      ],
    }).compile();

    controller = module.get<AdminController>(AdminController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /dashboard', () => {
    it('should return aggregated dashboard statistics', async () => {
      const mockStats = {
        totalUsers: 100,
        totalFarmers: 60,
        totalBuyers: 40,
        activeProducts: 25,
        activeOrders: 10,
        totalRevenue: 50000,
        pendingKyc: 5,
        activeEscrow: 12000,
      };

      (adminService.getDashboard as jest.Mock).mockResolvedValue(mockStats);

      const result = await controller.getDashboard();

      expect(result).toEqual({ success: true, data: mockStats });
      expect(adminService.getDashboard).toHaveBeenCalled();
    });
  });

  describe('GET /users', () => {
    it('should return paginated filtered users', async () => {
      const mockResult = {
        data: [{ id: 'u-1', name: 'Abdul' }],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      };
      (adminService.getUsers as jest.Mock).mockResolvedValue(mockResult);

      const result = await controller.getUsers({ role: 'farmer' });

      expect(result).toEqual({
        success: true,
        data: mockResult.data,
        meta: mockResult.meta,
      });
      expect(adminService.getUsers).toHaveBeenCalledWith({ role: 'farmer' });
    });
  });

  describe('PATCH /users/:id/verify', () => {
    it('should verify user NID status', async () => {
      const mockResult = { success: true, message: 'User verified' };
      (adminService.verifyUser as jest.Mock).mockResolvedValue(mockResult);

      const result = await controller.verifyUser('u-1', { isVerified: true });

      expect(result).toEqual(mockResult);
      expect(adminService.verifyUser).toHaveBeenCalledWith('u-1', { isVerified: true });
    });
  });

  describe('PATCH /users/:id/ban', () => {
    it('should ban a user', async () => {
      const mockResult = { success: true, message: 'User banned' };
      (adminService.banUser as jest.Mock).mockResolvedValue(mockResult);

      const result = await controller.banUser('u-1', { isBanned: true });

      expect(result).toEqual(mockResult);
      expect(adminService.banUser).toHaveBeenCalledWith('u-1', { isBanned: true });
    });
  });

  describe('GET /products', () => {
    it('should return all products', async () => {
      const mockProducts = {
        data: [{ id: 'p-1', productName: 'Rice' }],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      };
      (adminService.getProducts as jest.Mock).mockResolvedValue(mockProducts);

      const result = await controller.getProducts({ status: 'active' });

      expect(result).toEqual({
        success: true,
        data: mockProducts.data,
        meta: mockProducts.meta,
      });
    });
  });

  describe('PATCH /products/:id/status', () => {
    it('should change product status', async () => {
      const mockResult = { success: true, message: 'Status updated' };
      (adminService.updateProductStatus as jest.Mock).mockResolvedValue(mockResult);

      const result = await controller.updateProductStatus('p-1', { status: 'cancelled' });

      expect(result).toEqual(mockResult);
      expect(adminService.updateProductStatus).toHaveBeenCalledWith('p-1', { status: 'cancelled' });
    });
  });

  describe('GET /orders', () => {
    it('should return all orders', async () => {
      const mockOrders = {
        data: [{ id: 'ord-1', status: 'pending' }],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      };
      (adminService.getOrders as jest.Mock).mockResolvedValue(mockOrders);

      const result = await controller.getOrders({ status: 'pending' });

      expect(result).toEqual({
        success: true,
        data: mockOrders.data,
        meta: mockOrders.meta,
      });
    });
  });

  describe('PATCH /orders/:id/status', () => {
    it('should override order status', async () => {
      const mockResult = { success: true, message: 'Status overridden' };
      (adminService.updateOrderStatus as jest.Mock).mockResolvedValue(mockResult);

      const result = await controller.updateOrderStatus('ord-1', { status: 'delivered' });

      expect(result).toEqual(mockResult);
      expect(adminService.updateOrderStatus).toHaveBeenCalledWith('ord-1', { status: 'delivered' });
    });
  });

  describe('GET /wallet/escrow', () => {
    it('should return active escrow locks', async () => {
      const mockLocks = [{ id: 'esc-1', amount: 5000 }];
      (adminService.getActiveEscrowLocks as jest.Mock).mockResolvedValue(mockLocks);

      const result = await controller.getActiveEscrow();

      expect(result).toEqual({ success: true, data: mockLocks });
    });
  });

  describe('POST /wallet/escrow/:orderId/release', () => {
    it('should force release escrow', async () => {
      const mockRelease = { success: true, netPayout: 4750 };
      (adminService.forceReleaseEscrow as jest.Mock).mockResolvedValue(mockRelease);

      const result = await controller.forceReleaseEscrow('ord-1');

      expect(result).toEqual({ success: true, data: mockRelease });
      expect(adminService.forceReleaseEscrow).toHaveBeenCalledWith('ord-1');
    });
  });

  describe('GET /analytics/revenue', () => {
    it('should return revenue analytics', async () => {
      const mockAnalytics = { totalRevenue: 100000, dailyBreakdown: [] };
      (adminService.getRevenueAnalytics as jest.Mock).mockResolvedValue(mockAnalytics);

      const result = await controller.getRevenueAnalytics({});

      expect(result).toEqual({ success: true, data: mockAnalytics });
    });
  });

  describe('GET /analytics/top-farmers', () => {
    it('should return top farmers', async () => {
      const mockFarmers = [{ farmerId: 'f-1', deliveredOrdersCount: 20 }];
      (adminService.getTopFarmers as jest.Mock).mockResolvedValue(mockFarmers);

      const result = await controller.getTopFarmers({ limit: 10 });

      expect(result).toEqual({ success: true, data: mockFarmers });
    });
  });

  describe('GET /analytics/top-buyers', () => {
    it('should return top buyers', async () => {
      const mockBuyers = [{ buyerId: 'b-1', totalSpend: 50000 }];
      (adminService.getTopBuyers as jest.Mock).mockResolvedValue(mockBuyers);

      const result = await controller.getTopBuyers({ limit: 10 });

      expect(result).toEqual({ success: true, data: mockBuyers });
    });
  });

  describe('GET /reports/transactions', () => {
    it('should return CSV text', async () => {
      const mockCsv = 'Transaction ID,User ID,Amount\ntrx-1,user-1,100';
      (adminService.getTransactionReportCsv as jest.Mock).mockResolvedValue(mockCsv);

      const result = await controller.exportTransactionsReport();

      expect(result).toBe(mockCsv);
    });
  });
});
